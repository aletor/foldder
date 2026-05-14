import { NextRequest, NextResponse } from 'next/server';
import {
  recordApiUsage,
} from '@/lib/api-usage';
import sharp from 'sharp';
import Replicate from 'replicate';
import {
  ApiServiceDisabledError,
  assertApiServiceEnabled,
} from "@/lib/api-usage-controls";
import {
  assertUserCanAccessMediaReference,
  ForbiddenMediaReferenceError,
  inferMimeTypeFromPath,
} from "@/lib/api-media-access";
import { requireSpacesAuthUser } from "@/lib/spaces-access-control";
import { getFromS3 } from "@/lib/s3-utils";

function parseImageDataUrl(value: string): { buffer: Buffer; mime: string } {
  const marker = ";base64,";
  const idx = value.indexOf(marker);
  if (!value.startsWith("data:") || idx === -1) {
    throw new Error("Invalid image data URL");
  }
  const mime = value.slice(5, idx).split(";")[0] || "image/png";
  return {
    buffer: Buffer.from(value.slice(idx + marker.length), "base64"),
    mime,
  };
}

export async function POST(req: NextRequest) {
  console.log(`[Background Remover] POST request received`);
  try {
    await assertApiServiceEnabled("replicate-bg");
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;
    const usageUserEmail = authState.user.email;
    const body = await req.json();
    const { 
      image, 
      expansion = 0, 
      feather = 0.6,
      threshold = 0.9 
    } = body;

    if (typeof image !== "string" || !image.trim()) {
      return NextResponse.json({ error: 'Missing image input' }, { status: 400 });
    }
    console.log(`--- BACKGROUND REMOVER START ---`);

    // 0. Pre-fetch image if URL to avoid 403 Forbidden on Replicate workers (bypass with User-Agent)
    let imageBuffer: Buffer;
    let imageInputForReplicate: string = image;

    const s3Key = await assertUserCanAccessMediaReference(usageUserEmail, image, "image");
    if (s3Key) {
      imageBuffer = await getFromS3(s3Key);
      const mime = inferMimeTypeFromPath(s3Key, "image/png");
      imageInputForReplicate = `data:${mime};base64,${imageBuffer.toString("base64")}`;
      console.log(`[Background Remover] Loaded authorized S3 image: ${s3Key}`);
    } else if (image.startsWith('http')) {
      console.log(`[Background Remover] Pre-fetching image to bypass potential 403: ${image}`);
      const imgFetchRes = await fetch(image, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        signal: AbortSignal.timeout(15000)
      });
      if (!imgFetchRes.ok) throw new Error(`Image fetch failed: ${imgFetchRes.status}`);
      const arrBuf = await imgFetchRes.arrayBuffer();
      imageBuffer = Buffer.from(arrBuf);
      console.log(`[Background Remover] Image download status: ${imgFetchRes.status}. First 10 bytes: ${imageBuffer.slice(0, 10).toString('hex')}`);
      const mime = imgFetchRes.headers.get('content-type') || 'image/png';
      imageInputForReplicate = `data:${mime};base64,${imageBuffer.toString('base64')}`;
    } else {
      const parsedImage = parseImageDataUrl(image);
      imageBuffer = parsedImage.buffer;
      console.log(`[Background Remover] Base64 Image. First 10 bytes: ${imageBuffer.slice(0, 10).toString('hex')}`);
      imageInputForReplicate = image; // Use original base64
    }

    if (!process.env.REPLICATE_API_TOKEN) {
      return NextResponse.json({ error: 'REPLICATE_API_TOKEN is not configured' }, { status: 500 });
    }

    const replicate = new Replicate({
      auth: process.env.REPLICATE_API_TOKEN || "",
    });

    // 1. ML Inference: Professional Matting (851-labs/background-remover)
    let maskUrl: string = "";
    const maxRetries = 3;
    let retryDelay = 2000; // Start with 2s

    for (let i = 0; i < maxRetries; i++) {
        try {
            console.log(`[Background Remover] ML Attempt ${i + 1}/${maxRetries}`);
            const output = await replicate.run(
                "851-labs/background-remover:a029dff38972b5fda4ec5d75d7d1cd25aeff621d2cf4946a41055d7db66b80bc",
                { 
                    input: { 
                        image: imageInputForReplicate,
                        threshold: Number(threshold),
                        reverse: false
                    } 
                }
            );
            maskUrl = Array.isArray(output) ? output[0] : output.toString();
            await recordApiUsage({
              provider: "replicate",
              userEmail: usageUserEmail,
              serviceId: "replicate-bg",
              route: "/api/spaces/matte",
              model: "851-labs/background-remover",
              inputTokens: 0,
              outputTokens: 0,
              totalTokens: 0,
              costUsd: 0.01,
              note: "Eliminar fondo (estimado)",
            });
            break; // Success!
        } catch (mlErr: unknown) {
            const mlMessage = mlErr instanceof Error ? mlErr.message : String(mlErr);
            const mlStatus =
              typeof mlErr === "object" && mlErr !== null && "status" in mlErr
                ? (mlErr as { status?: number }).status
                : undefined;
            const is429 = mlMessage.includes("429") || mlStatus === 429;
            if (is429 && i < maxRetries - 1) {
                console.warn(`[Background Remover] Rate limit hit (429). Retrying in ${retryDelay}ms...`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                retryDelay *= 2; // Exponential backoff
                continue;
            }
            console.error("[Background Remover] ML Error:", mlErr);
            return NextResponse.json({ 
                error: is429 ? "Replicate Rate Limit: Too many requests or low balance (<$5). Please wait a moment." : `ML Engine failed: ${mlMessage}`,
                details: mlMessage 
            }, { status: is429 ? 429 : 500 });
        }
    }

    // 2. Fetch Mask (Image buffer already available)
    console.log(`[Background Remover] Downloading mask: ${maskUrl}`);
    const maskFetchRes = await fetch(maskUrl, { signal: AbortSignal.timeout(15000) });
    if (!maskFetchRes.ok) throw new Error(`Failed to download mask: ${maskFetchRes.status}`);
    const maskBuffer = Buffer.from(await maskFetchRes.arrayBuffer());
    console.log(`[Background Remover] Mask downloaded. First 10 bytes: ${maskBuffer.slice(0, 10).toString('hex')}`);
    console.log(`[Background Remover] Processing buffers... (Mask size: ${maskBuffer.length})`);

    // Verify imageBuffer is valid
    const imgMetadata = await sharp(imageBuffer).metadata();
    const w = imgMetadata.width || 1080;
    const h = imgMetadata.height || 1080;

    // 3. Process Mask
    // Replicate masks are typically grayscale. We force to grayscale and resize.
    const finalMaskPngBuffer = await sharp(maskBuffer)
      .resize(w, h)
      .grayscale()
      .png()
      .toBuffer();

    // 4. Calculate BBox from raw mask pixels
    const rawMask = await sharp(finalMaskPngBuffer).raw().toBuffer();
    let minX = w, minY = h, maxX = 0, maxY = 0;
    let found = false;
    let bbox = [0, 0, w, h];

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (rawMask[y * w + x] > 128) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
          found = true;
        }
      }
    }
    if (found) bbox = [minX, minY, maxX - minX, maxY - minY];

    // 5. Compose Cutout
    // Use 'dest-in' blend mode which uses the alpha of the mask to crop the source
    const rgbaBuffer = await sharp(imageBuffer)
      .resize(w, h)
      .toColourspace('srgb')
      .ensureAlpha()
      .composite([{
        input: finalMaskPngBuffer,
        blend: 'dest-in'
      }])
      .png()
      .toBuffer();

    return NextResponse.json({
      mask: `data:image/png;base64,${finalMaskPngBuffer.toString('base64')}`,
      rgba_image: `data:image/png;base64,${rgbaBuffer.toString('base64')}`,
      bbox,
      metadata: {
        engine: '851-labs',
        threshold,
        expansion,
        feather,
        resolution: `${w}x${h}`,
        format: imgMetadata.format
      }
    });

  } catch (error: unknown) {
    if (error instanceof ApiServiceDisabledError) {
      return NextResponse.json(
        { error: `API bloqueada en admin: ${error.label}` },
        { status: 423 },
      );
    }
    if (error instanceof ForbiddenMediaReferenceError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error('[Background Remover] CRITICAL ERROR:', error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
