import { NextResponse } from "next/server";
import Replicate from "replicate";
import sharp from "sharp";
import { recordApiUsage } from "@/lib/api-usage";
import {
  ApiServiceDisabledError,
  assertApiServiceEnabled,
} from "@/lib/api-usage-controls";
import { getFromS3, uploadBufferToS3Key } from "@/lib/s3-utils";
import { tryExtractKnowledgeFilesKeyFromUrl } from "@/lib/s3-media-hydrate";
import {
  buildUserAssetObjectKey,
  canUserAccessKnowledgeFileKey,
  isSafeKnowledgeFilesKey,
  requireSpacesAuthUser,
  stableKnowledgeFileUrlFromKey,
} from "@/lib/spaces-access-control";
import {
  reserveApiWalletCharge,
  reserveUsdToMicros,
  releaseApiWalletChargeOnError,
  walletGateErrorResponse,
  type ApiWalletCharge,
} from "@/lib/wallet-api-gate";
import {
  coerceExport6kFormat,
  estimateTopazUpscaleUsd,
  finalizeExport6k,
  planExport6k,
  type Export6kFormat,
} from "@/lib/nano-banana/export-6k";

export const runtime = "nodejs";
export const maxDuration = 180;

/**
 * Export 6K · Topaz Gigapixel (Replicate) + Lanczos al lado largo 6144.
 * Una sola llamada de pago por gesto; sin reintentos automáticos.
 * La imagen entra por Files API (Buffer), no como data URI.
 */

const TOPAZ_MODEL =
  "topazlabs/image-upscale:2fdc3b86a01d338ae89ad58e5d9241398a8a01de9b0dda41ba8a0434c8a00dc3";
const TOPAZ_MODEL_LABEL = "topazlabs/image-upscale";
const MAX_DATA_URL_BYTES = 28_000_000;

class ExportInputError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "ExportInputError";
  }
}

type ImageSourceInput = { key?: unknown; url?: unknown; dataUrl?: unknown };

function decodeDataUrl(dataUrl: string, maxBytes: number, label: string): Buffer {
  const comma = dataUrl.indexOf(",");
  if (!/^data:image\//i.test(dataUrl) || comma < 0) {
    throw new ExportInputError(`${label}: data URL inválida.`, 400);
  }
  const b64 = dataUrl.slice(comma + 1);
  if (b64.length > (maxBytes * 4) / 3 + 16) {
    throw new ExportInputError(`${label}: la imagen supera el máximo permitido.`, 413);
  }
  const buf = Buffer.from(b64, "base64");
  if (buf.length < 64) throw new ExportInputError(`${label}: imagen vacía.`, 400);
  return buf;
}

async function resolveImage(
  input: ImageSourceInput | undefined,
  userEmail: string,
): Promise<{ buffer: Buffer; key: string | null }> {
  if (!input || typeof input !== "object") {
    throw new ExportInputError("Falta la imagen a exportar.", 400);
  }
  const explicitKey = typeof input.key === "string" ? input.key.trim() : "";
  const url = typeof input.url === "string" ? input.url.trim() : "";
  const key = explicitKey || (url ? tryExtractKnowledgeFilesKeyFromUrl(url) ?? "" : "");
  if (key) {
    if (!isSafeKnowledgeFilesKey(key)) throw new ExportInputError("Clave S3 inválida.", 400);
    const allowed = await canUserAccessKnowledgeFileKey(userEmail, key);
    if (!allowed) throw new ExportInputError("Sin acceso a la imagen.", 403);
    return { buffer: await getFromS3(key), key };
  }
  if (typeof input.dataUrl === "string" && input.dataUrl.startsWith("data:")) {
    return { buffer: decodeDataUrl(input.dataUrl, MAX_DATA_URL_BYTES, "Imagen"), key: null };
  }
  if (url.startsWith("data:")) {
    return { buffer: decodeDataUrl(url, MAX_DATA_URL_BYTES, "Imagen"), key: null };
  }
  throw new ExportInputError("Origen no soportado. Envía clave S3 propia o data URL.", 400);
}

function replicateOutputUrl(output: unknown): string {
  if (typeof output === "string" && /^https?:\/\//i.test(output)) return output;
  if (Array.isArray(output) && typeof output[0] === "string") return output[0];
  if (output && typeof output === "object") {
    const row = output as { url?: unknown; href?: unknown };
    if (typeof row.url === "function") {
      const v = (row.url as () => string)();
      if (typeof v === "string" && /^https?:\/\//i.test(v)) return v;
    }
    if (typeof row.url === "string" && /^https?:\/\//i.test(row.url)) return row.url;
    if (typeof row.href === "string" && /^https?:\/\//i.test(row.href)) return row.href;
  }
  const asString = String(output ?? "");
  if (/^https?:\/\//i.test(asString)) return asString;
  throw new Error("Topaz no devolvió una URL de imagen.");
}

function mapTopazError(mlMessage: string): { error: string; retryable: boolean; status: number } {
  if (mlMessage.includes("429")) {
    return {
      error: "Replicate está saturado o sin saldo. No se reintentó automáticamente; vuelve a pulsar Exportar 6K.",
      retryable: true,
      status: 429,
    };
  }
  if (/CUDA|illegal memory access|out of memory|OOM|too large|too big|maximum (image )?size/i.test(mlMessage)) {
    return {
      error:
        "El upscale de Topaz falló por límite de tamaño o memoria. No se ha cobrado. Vuelve a pulsar Exportar 6K.",
      retryable: true,
      status: 503,
    };
  }
  return {
    error: `Upscale falló: ${mlMessage}`,
    retryable: false,
    status: 500,
  };
}

async function respondExport(
  userEmail: string,
  plan: ReturnType<typeof planExport6k>,
  buffer: Buffer,
  format: Export6kFormat,
  started: number,
  usedMl: boolean,
) {
  const finalized = await finalizeExport6k(buffer, plan, format);
  const filename = format === "jpeg" ? "studio-export-6k.jpg" : "studio-export-6k.png";
  const key = buildUserAssetObjectKey({
    userEmail,
    folder: "generated",
    filename,
  });
  await uploadBufferToS3Key(key, finalized.bytes, finalized.mime);
  await recordApiUsage({
    provider: "aws",
    userEmail,
    serviceId: "s3-assets",
    route: "/api/spaces/nano-banana/export-6k",
    operation: "put_object",
    costIsKnown: false,
    costUsd: 0,
    bytes: finalized.bytes.length,
    metadata: { key, usedMl, plan, format },
  });
  console.info("[nano-banana/export-6k] ok", {
    key,
    from: `${plan.sourceWidth}x${plan.sourceHeight}`,
    to: `${finalized.width}x${finalized.height}`,
    factor: plan.topazFactor,
    format,
    usedMl,
    ms: Date.now() - started,
  });
  return NextResponse.json({
    output: stableKnowledgeFileUrlFromKey(key),
    key,
    width: finalized.width,
    height: finalized.height,
    usedMl,
    topazFactor: plan.topazFactor,
    format,
    timeMs: Date.now() - started,
  });
}

export async function POST(req: Request) {
  const started = Date.now();
  let walletCharge: ApiWalletCharge | null = null;
  let releaseWalletOnError = true;
  try {
    await assertApiServiceEnabled("replicate-upscale");
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;
    const userEmail = authState.user.email;

    const body = (await req.json().catch(() => null)) as
      | { image?: ImageSourceInput; format?: unknown }
      | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
    }
    const format = coerceExport6kFormat(body.format);

    const source = await resolveImage(body.image, userEmail);
    const meta = await sharp(source.buffer, { failOn: "none" }).rotate().metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    if (width < 8 || height < 8) {
      return NextResponse.json({ error: "Dimensiones de imagen inválidas." }, { status: 400 });
    }

    const plan = planExport6k(width, height);

    if (!plan.topazFactor) {
      return respondExport(userEmail, plan, source.buffer, format, started, false);
    }

    if (!process.env.REPLICATE_API_TOKEN) {
      return NextResponse.json({ error: "REPLICATE_API_TOKEN no está configurado." }, { status: 500 });
    }

    const estimatedUsd = estimateTopazUpscaleUsd(plan.topazOutputWidth * plan.topazOutputHeight);
    walletCharge = await reserveApiWalletCharge({
      req,
      userEmail,
      serviceId: "replicate-upscale",
      provider: "replicate",
      route: "/api/spaces/nano-banana/export-6k",
      maxCostMicros: reserveUsdToMicros(estimatedUsd, { multiplier: 1.35 }),
      metadata: {
        model: TOPAZ_MODEL_LABEL,
        factor: plan.topazFactor,
        source: `${width}x${height}`,
        topazOut: `${plan.topazOutputWidth}x${plan.topazOutputHeight}`,
        target: `${plan.targetWidth}x${plan.targetHeight}`,
        format,
      },
    });

    const jpegForMl = await sharp(source.buffer, { failOn: "none" })
      .rotate()
      .jpeg({ quality: 95, mozjpeg: true })
      .toBuffer();
    const imageBlob = new Blob([new Uint8Array(jpegForMl)], { type: "image/jpeg" });

    const replicate = new Replicate({
      auth: process.env.REPLICATE_API_TOKEN,
      fileEncodingStrategy: "upload",
    });

    let upscaledUrl: string;
    try {
      const output = await replicate.run(TOPAZ_MODEL as `${string}/${string}:${string}`, {
        input: {
          image: imageBlob,
          enhance_model: "High Fidelity V2",
          upscale_factor: plan.topazFactor,
          output_format: format === "jpeg" ? "jpg" : "png",
          face_enhancement: false,
        },
      });
      upscaledUrl = replicateOutputUrl(output);
      releaseWalletOnError = false;
      await walletCharge?.capture({
        actualCostUsd: estimatedUsd,
        metadata: { model: TOPAZ_MODEL_LABEL, factor: plan.topazFactor },
      });
      await recordApiUsage({
        provider: "replicate",
        userEmail,
        serviceId: "replicate-upscale",
        route: "/api/spaces/nano-banana/export-6k",
        model: TOPAZ_MODEL_LABEL,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        costUsd: estimatedUsd,
        note: `Export 6K Topaz ${plan.topazFactor}`,
        metadata: {
          source: `${width}x${height}`,
          topazOut: `${plan.topazOutputWidth}x${plan.topazOutputHeight}`,
          target: `${plan.targetWidth}x${plan.targetHeight}`,
          format,
        },
      });
    } catch (mlErr: unknown) {
      const mlMessage = mlErr instanceof Error ? mlErr.message : String(mlErr);
      console.error("[nano-banana/export-6k] Topaz:", mlErr);
      const mapped = mapTopazError(mlMessage);
      await walletCharge?.release({
        reason: "provider_inference_error",
        metadata: { retryable: mapped.retryable, status: mapped.status },
      });
      releaseWalletOnError = false;
      return NextResponse.json(
        { error: mapped.error, retryable: mapped.retryable },
        { status: mapped.status },
      );
    }

    const upRes = await fetch(upscaledUrl, { signal: AbortSignal.timeout(90_000) });
    if (!upRes.ok) throw new Error(`No se pudo descargar el upscale (${upRes.status}).`);
    const upBuffer = Buffer.from(await upRes.arrayBuffer());
    return respondExport(userEmail, plan, upBuffer, format, started, true);
  } catch (error: unknown) {
    if (error instanceof ApiServiceDisabledError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof ExportInputError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const walletRes = walletGateErrorResponse(error);
    if (walletRes) return walletRes;
    if (releaseWalletOnError && walletCharge) {
      await releaseApiWalletChargeOnError(walletCharge, error);
    }
    const message = error instanceof Error ? error.message : "export-6k failed";
    console.error("[nano-banana/export-6k]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
