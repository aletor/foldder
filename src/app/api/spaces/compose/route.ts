import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { getFromS3 } from '@/lib/s3-utils';
import { tryExtractKnowledgeFilesKeyFromUrl } from '@/lib/s3-media-hydrate';
import { canUserAccessKnowledgeFileKey, requireSpacesAuthUser } from '@/lib/spaces-access-control';

const MAX_COMPOSE_DIMENSION = 4096;
const MAX_COMPOSE_PIXELS = 18_000_000;
const MAX_COMPOSE_LAYERS = 60;
const MAX_LAYERS_JSON_CHARS = 40_000_000;
const MAX_LAYER_IMAGE_BYTES = 30 * 1024 * 1024;

function isBlockedRemoteHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase();
  if (!host || host === 'localhost' || host === '::1' || host === 'metadata.google.internal') return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^169\.254\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  const private172 = host.match(/^172\.(\d{1,2})\./);
  if (private172) {
    const second = Number(private172[1]);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
}

function normalizeLayerUrl(value: string, requestOrigin: string): string {
  const url = new URL(value, requestOrigin);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Unsupported layer URL protocol');
  }
  if (url.origin !== requestOrigin && isBlockedRemoteHost(url.hostname)) {
    throw new Error('Blocked private layer URL');
  }
  return url.toString();
}

async function resolveLayerImageBuffer(
  layer: { s3Key?: unknown; value?: unknown },
  requestOrigin: string,
  ownerEmail: string,
): Promise<Buffer> {
  const explicitKey = typeof layer.s3Key === 'string' ? layer.s3Key.trim() : '';
  const value = typeof layer.value === 'string' ? layer.value.trim() : '';
  const s3Key = explicitKey || (value ? tryExtractKnowledgeFilesKeyFromUrl(value) || '' : '');
  if (s3Key) {
    const allowed = await canUserAccessKnowledgeFileKey(ownerEmail, s3Key);
    if (!allowed) throw new Error('Layer image is not accessible for this user');
    return getFromS3(s3Key);
  }

  if (value.startsWith('data:')) {
    const base64Data = value.split(',')[1];
    if (!base64Data) throw new Error('Invalid base64 layer image');
    return Buffer.from(base64Data, 'base64');
  }

  const layerUrl = normalizeLayerUrl(value, requestOrigin);
  const fetchRes = await fetch(layerUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    },
    signal: AbortSignal.timeout(10000)
  });
  if (!fetchRes.ok) throw new Error(`HTTP ${fetchRes.status}`);
  const arrayBuffer = await fetchRes.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function POST(req: NextRequest) {
  let layersJson = '[]';
  try {
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;

    const body = await req.formData();
    layersJson = (body.get('layers') as string | null) || '[]';
    const format = (body.get('format') as string) || 'png';
    const filename = (body.get('filename') as string) || `Composition_${Date.now()}.${format === 'jpeg' ? 'jpg' : 'png'}`;
    const width = parseInt(body.get('width') as string) || 1920;
    const height = parseInt(body.get('height') as string) || 1080;
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      return NextResponse.json({ error: 'Invalid composition dimensions' }, { status: 400 });
    }
    if (width > MAX_COMPOSE_DIMENSION || height > MAX_COMPOSE_DIMENSION || width * height > MAX_COMPOSE_PIXELS) {
      return NextResponse.json({ error: 'Composition dimensions are too large' }, { status: 413 });
    }
    if (layersJson.length > MAX_LAYERS_JSON_CHARS) {
      return NextResponse.json({ error: 'Composition payload is too large' }, { status: 413 });
    }
    if (format !== 'png' && format !== 'jpeg') {
      return NextResponse.json({ error: 'Unsupported export format' }, { status: 400 });
    }

    console.log("--- COMPOSE ENGINE START ---");
    console.log(`Dimensions: ${width}x${height}, Format: ${format}`);
    // ... rest of logic
    console.log(`Layers JSON length: ${layersJson?.length || 0}`);

    const layers = JSON.parse(layersJson || '[]');
    if (!Array.isArray(layers)) {
      return NextResponse.json({ error: 'layers must be an array' }, { status: 400 });
    }
    if (layers.length > MAX_COMPOSE_LAYERS) {
      return NextResponse.json({ error: 'Too many layers for one composition' }, { status: 413 });
    }
    console.log(`Active Layers Count: ${layers.length}`);

    // 1. Create base image (solid black instead of transparent to verify visibility)
    const canvas = sharp({
      create: {
        width,
        height,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 } // Reverted to transparent base
      }
    });

    const compositeInputs = [];

    // Coordinate remapping ratio
    const previewWidth = parseInt(body.get('previewWidth') as string) || width;
    const ratio = width / previewWidth;
    console.log(`Coordinate Mapping Ratio: ${ratio} (Canvas: ${width} / Preview: ${previewWidth})`);

    // 2. Process layers
    for (const [idx, layer] of layers.entries()) {
      console.log(`[Layer ${idx}] Type: ${layer.type}, HasValue: ${!!layer.value}, Color: ${layer.color}`);
      
      const layerX = Math.round((layer.x || 0) * ratio);
      const layerY = Math.round((layer.y || 0) * ratio);
      const layerScale = layer.scale || 1;

      if (layer.color) {
        const colorLayer = await sharp({
          create: {
            width,
            height,
            channels: 4,
            background: layer.color
          }
        }).png().toBuffer();
        compositeInputs.push({ input: colorLayer, top: 0, left: 0 });
      } else if (layer.value || layer.s3Key) {
        try {
          const imageBuffer = await resolveLayerImageBuffer(layer, req.nextUrl.origin, authState.user.email);
          if (imageBuffer.length > MAX_LAYER_IMAGE_BYTES) {
            throw new Error(`Layer image too large (${Math.round(imageBuffer.length / 1024)} KB)`);
          }
          
          // Determine Target Width
          let targetWidth = width;
          
          // Background types or index 0 usually take full width if not scaled
          const isBackground = layer.type === 'background' || (idx === 0 && layerScale === 1 && layerX === 0 && layerY === 0);
          
          if (!isBackground) {
            // Assets follow the Editor logic: 40% of canvas width * scale
            targetWidth = Math.round((width * 0.4) * layerScale);
          }

          // Resize carefully: ensure the resulting image NEVER exceeds canvas dimensions
          const resizedImageBuilder = sharp(imageBuffer)
            .resize({
              width: Math.min(targetWidth, width),
              height: height, // Hard limit for height too
              withoutEnlargement: false,
              fit: 'inside' // This ensures the image is contained within the [min(targetWidth, width), height] box
            });

          const resizedImage = await resizedImageBuilder.png().toBuffer();
          const metadata = await sharp(resizedImage).metadata();
          
          const layerW = metadata.width || 0;
          const layerH = metadata.height || 0;

          // CRITICAL: Ensure top/left + dimensions don't exceed canvas limits
          // We even subtract 1 pixel to be extra safe with rounding issues
          const safeTop = Math.max(0, Math.min(layerY, height - layerH));
          const safeLeft = Math.max(0, Math.min(layerX, width - layerW));

          compositeInputs.push({ 
            input: resizedImage, 
            top: Math.floor(safeTop), 
            left: Math.floor(safeLeft) 
          });
          console.log(`[Layer ${idx}] Success: x=${safeLeft}, y=${safeTop}, w=${layerW}, h=${layerH} (Canvas: ${width}x${height})`);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`[Layer ${idx}] FETCH ERROR for ${layer.value}:`, message);
          // If a layer fails, we continue to prevent breaking the whole export
        }
      }
    }

    console.log(`Final composition with ${compositeInputs.length} inputs...`);
    if (compositeInputs.length === 0) {
      return NextResponse.json({ error: 'No exportable image layers could be loaded.' }, { status: 400 });
    }
    // 3. Composite everything
    let result = canvas.composite(compositeInputs);

    // 4. Set format
    if (format === 'jpeg') {
      result = result.jpeg({ quality: 90 });
    } else {
      result = result.png();
    }

    const outputBuffer = await result.toBuffer();
    const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
    
    // Sanitize filename
    const safeFilename = filename.replace(/[^a-z0-9.]/gi, '_');

    console.log(`[Compose API] SUCCESS: Exported ${safeFilename} (${Math.round(outputBuffer.length / 1024)} KB)`);

    return new Response(new Uint8Array(outputBuffer), {
      status: 200,
      headers: {
        'Content-Type': mimeType,
        'Content-Disposition': `attachment; filename="${safeFilename}"`,
        'Content-Length': outputBuffer.length.toString(),
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });

  } catch (error: unknown) {
    console.error('[Compose API] CRITICAL ERROR:', error);
    let layersCount = 0;
    try { layersCount = JSON.parse(layersJson || '[]').length; } catch {}
    const message = error instanceof Error ? error.message : 'Unknown composition error';
    const stack = error instanceof Error ? error.stack : undefined;
    
    return NextResponse.json({ 
      error: message,
      stack: process.env.NODE_ENV === 'development' ? stack : undefined,
      layersCount
    }, { status: 500 });
  }
}
