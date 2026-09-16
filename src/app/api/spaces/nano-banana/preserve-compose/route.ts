import { NextResponse } from "next/server";
import sharp from "sharp";
import { recordApiUsage } from "@/lib/api-usage";
import { getFromS3, uploadBufferToS3Key } from "@/lib/s3-utils";
import { tryExtractKnowledgeFilesKeyFromUrl } from "@/lib/s3-media-hydrate";
import {
  buildUserAssetObjectKey,
  canUserAccessKnowledgeFileKey,
  isSafeKnowledgeFilesKey,
  requireSpacesAuthUser,
  stableKnowledgeFileUrlFromKey,
} from "@/lib/spaces-access-control";
import { preserveComposeImages, type PreserveComposeToneLimits } from "@/lib/nano-banana/preserve-compose/compose";
import type { ChangeMaskSensitivity, ChangeMaskStats } from "@/lib/nano-banana/preserve-compose/analyze-change-mask";
import type { OpticalMatchStats } from "@/lib/nano-banana/preserve-compose/optical-match";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Image Creation Studio · "Conservar zonas sin cambios".
 *
 * Compara la imagen base con la generada, deduce qué áreas cambiaron de verdad (el lazo del
 * usuario solo es un prior) y superpone esas áreas sobre la base a resolución completa.
 * Cero llamadas a APIs de pago: solo CPU + S3 (GET base/generada, PUT del PNG compuesto).
 */

const MAX_DATA_URL_BYTES = 24_000_000;
const MAX_PRIOR_BYTES = 4_000_000;

type ImageSourceInput = { key?: unknown; url?: unknown; dataUrl?: unknown };

/** Recorte de contexto (px de la base completa) del que procede la generada. */
export type PreserveComposeCropInput = { x: number; y: number; width: number; height: number };

export type PreserveComposeRequestBody = {
  base: ImageSourceInput;
  generated: ImageSourceInput;
  /** Lazo en el sistema de coordenadas de `crop` si hay recorte; si no, de la base completa. */
  priorMask?: string | null;
  sensitivity?: ChangeMaskSensitivity;
  crop?: PreserveComposeCropInput | null;
  /** Tamaño del fotograma en el que se expresó `crop`; si difiere del nativo se reescala. */
  cropFrame?: { width: number; height: number } | null;
  /** Ampliación de lienzo (px de la foto original). Compone solo la zona nueva. */
  expand?: { left?: unknown; top?: unknown; right?: unknown; bottom?: unknown } | null;
  debug?: boolean;
};

export type PreserveComposeResponseBody =
  | {
      composed: true;
      output: string;
      key: string;
      width: number;
      height: number;
      stats: ChangeMaskStats;
      maskPreview: string | null;
      timeMs: number;
      optical: OpticalMatchStats | null;
      toneLimits: PreserveComposeToneLimits;
      usedPriorFallback: boolean;
      crop: PreserveComposeCropInput | null;
      expand?: { left: number; top: number; right: number; bottom: number } | null;
    }
  | {
      composed: false;
      decision: string;
      reason: string;
      width: number;
      height: number;
      stats: ChangeMaskStats | null;
      maskPreview: string | null;
      timeMs: number;
    };

class ComposeInputError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "ComposeInputError";
  }
}

function decodeDataUrl(dataUrl: string, maxBytes: number, label: string): Buffer {
  const comma = dataUrl.indexOf(",");
  if (!/^data:image\//i.test(dataUrl) || comma < 0) {
    throw new ComposeInputError(`${label}: data URL inválida.`, 400);
  }
  const b64 = dataUrl.slice(comma + 1);
  if (b64.length > (maxBytes * 4) / 3 + 16) {
    throw new ComposeInputError(`${label}: la imagen supera el máximo de ${Math.round(maxBytes / 1e6)} MB.`, 413);
  }
  const buf = Buffer.from(b64, "base64");
  if (buf.length < 64) throw new ComposeInputError(`${label}: imagen vacía.`, 400);
  return buf;
}

async function resolveImageSource(
  input: ImageSourceInput | undefined,
  userEmail: string,
  label: string,
): Promise<{ buffer: Buffer; key: string | null }> {
  if (!input || typeof input !== "object") {
    throw new ComposeInputError(`${label}: falta la imagen.`, 400);
  }
  const explicitKey = typeof input.key === "string" ? input.key.trim() : "";
  const url = typeof input.url === "string" ? input.url.trim() : "";
  const key = explicitKey || (url ? tryExtractKnowledgeFilesKeyFromUrl(url) ?? "" : "");
  if (key) {
    if (!isSafeKnowledgeFilesKey(key)) throw new ComposeInputError(`${label}: clave S3 inválida.`, 400);
    const allowed = await canUserAccessKnowledgeFileKey(userEmail, key);
    if (!allowed) throw new ComposeInputError(`${label}: sin acceso a la imagen.`, 403);
    return { buffer: await getFromS3(key), key };
  }
  if (typeof input.dataUrl === "string" && input.dataUrl.startsWith("data:")) {
    return { buffer: decodeDataUrl(input.dataUrl, MAX_DATA_URL_BYTES, label), key: null };
  }
  if (url.startsWith("data:")) {
    return { buffer: decodeDataUrl(url, MAX_DATA_URL_BYTES, label), key: null };
  }
  throw new ComposeInputError(
    `${label}: origen no soportado. Envía una clave S3 propia o la imagen como data URL.`,
    400,
  );
}

function parseExpand(input: unknown): { left: number; top: number; right: number; bottom: number } | null {
  if (!input || typeof input !== "object") return null;
  const e = input as Record<string, unknown>;
  const left = Math.max(0, Math.round(Number(e.left) || 0));
  const top = Math.max(0, Math.round(Number(e.top) || 0));
  const right = Math.max(0, Math.round(Number(e.right) || 0));
  const bottom = Math.max(0, Math.round(Number(e.bottom) || 0));
  if (![left, top, right, bottom].every((v) => Number.isFinite(v))) return null;
  if (left + top + right + bottom === 0) return null;
  return { left, top, right, bottom };
}

function parseCrop(input: unknown): PreserveComposeCropInput | null {
  if (!input || typeof input !== "object") return null;
  const c = input as Record<string, unknown>;
  const x = Number(c.x);
  const y = Number(c.y);
  const width = Number(c.width);
  const height = Number(c.height);
  if (![x, y, width, height].every((v) => Number.isFinite(v))) return null;
  if (width < 8 || height < 8 || x < 0 || y < 0) return null;
  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
}

/**
 * Recorta la base (ya orientada) al rectángulo de contexto. Si el cliente expresó el recorte en
 * otro fotograma (`cropFrame`), se reescala al tamaño nativo. Devuelve el recorte en px nativos.
 */
async function extractCrop(
  base: Buffer,
  crop: PreserveComposeCropInput,
  cropFrame: { width: number; height: number } | null,
): Promise<{ crop: Buffer; nativeCrop: PreserveComposeCropInput; fullWidth: number; fullHeight: number }> {
  const oriented = sharp(base, { failOn: "none" }).rotate();
  const meta = await oriented.metadata();
  const fullWidth = meta.width ?? 0;
  const fullHeight = meta.height ?? 0;
  let nativeCrop = crop;
  if (cropFrame && cropFrame.width > 0 && cropFrame.height > 0 && (cropFrame.width !== fullWidth || cropFrame.height !== fullHeight)) {
    const sx = fullWidth / cropFrame.width;
    const sy = fullHeight / cropFrame.height;
    const x = Math.max(0, Math.round(crop.x * sx));
    const y = Math.max(0, Math.round(crop.y * sy));
    nativeCrop = {
      x,
      y,
      width: Math.max(8, Math.min(fullWidth - x, Math.round(crop.width * sx))),
      height: Math.max(8, Math.min(fullHeight - y, Math.round(crop.height * sy))),
    };
  }
  if (nativeCrop.x + nativeCrop.width > fullWidth || nativeCrop.y + nativeCrop.height > fullHeight) {
    throw new ComposeInputError(
      `Recorte (${nativeCrop.x},${nativeCrop.y} ${nativeCrop.width}×${nativeCrop.height}) fuera de la base (${fullWidth}×${fullHeight}).`,
      400,
    );
  }
  const cropPng = await oriented
    .extract({ left: nativeCrop.x, top: nativeCrop.y, width: nativeCrop.width, height: nativeCrop.height })
    .png()
    .toBuffer();
  return { crop: cropPng, nativeCrop, fullWidth, fullHeight };
}

/** Pega el recorte compuesto sobre la base completa (sin pérdida fuera del recorte). */
async function pasteCropBack(base: Buffer, composedCrop: Buffer, crop: PreserveComposeCropInput): Promise<Buffer> {
  return sharp(base, { failOn: "none" })
    .rotate()
    .removeAlpha()
    .toColourspace("srgb")
    .composite([{ input: composedCrop, left: crop.x, top: crop.y }])
    .png({ compressionLevel: 6 })
    .toBuffer();
}

/** Recoloca la vista previa de máscara (relativa al recorte) en un lienzo del fotograma completo. */
async function maskPreviewToFullFrame(
  preview: Buffer,
  crop: PreserveComposeCropInput,
  fullWidth: number,
  fullHeight: number,
  maxSide = 512,
): Promise<Buffer> {
  const scale = Math.min(1, maxSide / Math.max(fullWidth, fullHeight));
  const outW = Math.max(1, Math.round(fullWidth * scale));
  const outH = Math.max(1, Math.round(fullHeight * scale));
  const cw = Math.max(1, Math.round(crop.width * scale));
  const ch = Math.max(1, Math.round(crop.height * scale));
  const left = Math.min(outW - cw, Math.round(crop.x * scale));
  const top = Math.min(outH - ch, Math.round(crop.y * scale));
  const resized = await sharp(preview).resize(cw, ch, { fit: "fill" }).png().toBuffer();
  return sharp({ create: { width: outW, height: outH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: resized, left, top }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

export async function POST(req: Request) {
  const started = Date.now();
  try {
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;
    const userEmail = authState.user.email;

    const body = (await req.json().catch(() => null)) as PreserveComposeRequestBody | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
    }

    const [base, generated] = await Promise.all([
      resolveImageSource(body.base, userEmail, "Base"),
      resolveImageSource(body.generated, userEmail, "Generada"),
    ]);
    const prior =
      typeof body.priorMask === "string" && body.priorMask.startsWith("data:")
        ? decodeDataUrl(body.priorMask, MAX_PRIOR_BYTES, "Lazo")
        : null;
    const sensitivity: ChangeMaskSensitivity =
      body.sensitivity === "strict" || body.sensitivity === "wide" ? body.sensitivity : "auto";
    const requestedCrop = parseCrop(body.crop);
    const expand = parseExpand(body.expand);
    const cropFrame =
      body.cropFrame && Number.isFinite(Number(body.cropFrame.width)) && Number.isFinite(Number(body.cropFrame.height))
        ? { width: Math.round(Number(body.cropFrame.width)), height: Math.round(Number(body.cropFrame.height)) }
        : null;

    let composeBase = base.buffer;
    let fullFrame: { width: number; height: number } | null = null;
    let crop: PreserveComposeCropInput | null = null;
    if (!expand && requestedCrop) {
      const extracted = await extractCrop(base.buffer, requestedCrop, cropFrame);
      composeBase = extracted.crop;
      crop = extracted.nativeCrop;
      fullFrame = { width: extracted.fullWidth, height: extracted.fullHeight };
    }

    const result = await preserveComposeImages({
      base: composeBase,
      generated: generated.buffer,
      priorMask: prior,
      sensitivity,
      wantMaskPreview: true,
      fallbackToPrior: Boolean(prior),
      expand,
    });
    let maskPreviewPng = result.maskPreviewPng;
    if (maskPreviewPng && crop && fullFrame) {
      maskPreviewPng = await maskPreviewToFullFrame(maskPreviewPng, crop, fullFrame.width, fullFrame.height);
    }
    const maskPreview = maskPreviewPng ? `data:image/png;base64,${maskPreviewPng.toString("base64")}` : null;

    if (!result.composed) {
      console.info("[nano-banana/preserve-compose] skipped", {
        decision: result.decision,
        reason: result.reason,
        timings: result.timings,
      });
      const payload: PreserveComposeResponseBody = {
        composed: false,
        decision: result.decision,
        reason: result.reason,
        width: fullFrame?.width ?? result.width,
        height: fullFrame?.height ?? result.height,
        stats: result.stats,
        maskPreview,
        timeMs: Date.now() - started,
      };
      return NextResponse.json(payload);
    }

    const outputPng = crop ? await pasteCropBack(base.buffer, result.png, crop) : result.png;
    const outWidth = fullFrame?.width ?? result.width;
    const outHeight = fullFrame?.height ?? result.height;

    const key = buildUserAssetObjectKey({
      userEmail,
      folder: "generated",
      filename: "studio-preserve-compose.png",
    });
    await uploadBufferToS3Key(key, outputPng, "image/png");
    await recordApiUsage({
      provider: "aws",
      userEmail,
      serviceId: "s3-assets",
      route: "/api/spaces/nano-banana/preserve-compose",
      operation: "put_object",
      costIsKnown: false,
      costUsd: 0,
      bytes: outputPng.length,
      metadata: {
        key,
        baseKey: base.key,
        generatedKey: generated.key,
        changedPct: Math.round(result.stats.changedFraction * 1000) / 10,
        componentsKept: result.stats.componentsKept,
        componentsDropped: result.stats.componentsDropped,
        shift: result.stats.shift,
        optical: result.optical,
        toneLimits: result.toneLimits,
        usedPriorFallback: result.usedPriorFallback,
        crop,
        expand,
        timings: result.timings,
      },
    });
    console.info("[nano-banana/preserve-compose] composed", {
      key,
      size: `${outWidth}x${outHeight}`,
      crop,
      changedPct: Math.round(result.stats.changedFraction * 1000) / 10,
      optical: result.optical,
      opticalComponents: result.opticalComponents.map((c) => ({
        label: c.label,
        pixels: c.pixels,
        baseEdge: c.stats.baseEdgeWidthPx,
        genEdge: c.stats.generatedEdgeWidthPx,
        sigma: c.stats.blurSigmaPx,
        grain: c.stats.grainAdded,
      })),
      usedPriorFallback: result.usedPriorFallback,
      timings: result.timings,
    });

    const payload: PreserveComposeResponseBody = {
      composed: true,
      output: stableKnowledgeFileUrlFromKey(key),
      key,
      width: outWidth,
      height: outHeight,
      stats: result.stats,
      maskPreview,
      timeMs: Date.now() - started,
      optical: result.optical,
      toneLimits: result.toneLimits,
      usedPriorFallback: result.usedPriorFallback,
      crop,
      expand: expand ?? null,
    };
    return NextResponse.json(payload);
  } catch (error: unknown) {
    if (error instanceof ComposeInputError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "preserve-compose failed";
    console.error("[nano-banana/preserve-compose]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
