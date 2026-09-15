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
import { finalizeExport6kPng, planExport6k } from "@/lib/nano-banana/export-6k";

export const runtime = "nodejs";
export const maxDuration = 180;

/**
 * Export 6K · Real-ESRGAN (Replicate) + Lanczos al lado largo 6144.
 * Una sola llamada de pago por gesto del usuario; sin reintentos automáticos.
 * Desde ~2K usamos ×2 (×4 petaba CUDA en Replicate); cerca de 6K solo Lanczos.
 */

/** lucataco en A100; no mandar ×4 si la salida superaría ~6K (OOM/CUDA). */
const ESRGAN_MODEL =
  "lucataco/real-esrgan:3febd19381dd7e1f52a3ed3260b5b0a5636353de45e37e7c1c3cd814b24077a3";
const ESRGAN_MODEL_LABEL = "lucataco/real-esrgan";

const ESTIMATED_COST_USD = 0.012;
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
  if (typeof output === "string" && /^https?:/i.test(output)) return output;
  if (Array.isArray(output) && typeof output[0] === "string") return output[0];
  if (output && typeof output === "object" && "url" in output) {
    const u = (output as { url: unknown }).url;
    if (typeof u === "string") return u;
    if (typeof u === "function") {
      const v = (u as () => string)();
      if (typeof v === "string") return v;
    }
  }
  const asString = String(output ?? "");
  if (/^https?:/i.test(asString)) return asString;
  throw new Error("Real-ESRGAN no devolvió una URL de imagen.");
}

function mapReplicateUpscaleError(mlMessage: string): { error: string; retryable: boolean; status: number } {
  if (mlMessage.includes("429")) {
    return {
      error:
        "Replicate está saturado o sin saldo. No se reintentó automáticamente; vuelve a pulsar Exportar 6K.",
      retryable: true,
      status: 429,
    };
  }
  if (/CUDA|illegal memory access|out of memory|OOM/i.test(mlMessage)) {
    return {
      error:
        "El upscale en Replicate falló por memoria GPU (imagen demasiado grande para ×4). No se ha cobrado. Vuelve a pulsar Exportar 6K: ahora usamos una escala más segura.",
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

export async function POST(req: Request) {
  const started = Date.now();
  let walletCharge: ApiWalletCharge | null = null;
  let releaseWalletOnError = true;
  try {
    await assertApiServiceEnabled("replicate-upscale");
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;
    const userEmail = authState.user.email;

    if (!process.env.REPLICATE_API_TOKEN) {
      return NextResponse.json({ error: "REPLICATE_API_TOKEN no está configurado." }, { status: 500 });
    }

    const body = (await req.json().catch(() => null)) as
      | { image?: ImageSourceInput; faceEnhance?: unknown }
      | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
    }

    const faceEnhance = body.faceEnhance === true;
    const source = await resolveImage(body.image, userEmail);
    const meta = await sharp(source.buffer, { failOn: "none" }).rotate().metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    if (width < 8 || height < 8) {
      return NextResponse.json({ error: "Dimensiones de imagen inválidas." }, { status: 400 });
    }

    const plan = planExport6k(width, height);

    // Sin ML: la imagen ya es ≥ 6K.
    if (!plan.esrganScale) {
      const finalized = await finalizeExport6kPng(source.buffer, plan);
      const key = buildUserAssetObjectKey({
        userEmail,
        folder: "generated",
        filename: "studio-export-6k.png",
      });
      await uploadBufferToS3Key(key, finalized.png, "image/png");
      await recordApiUsage({
        provider: "aws",
        userEmail,
        serviceId: "s3-assets",
        route: "/api/spaces/nano-banana/export-6k",
        operation: "put_object",
        costIsKnown: false,
        costUsd: 0,
        bytes: finalized.png.length,
        metadata: { key, skippedMl: true, plan },
      });
      return NextResponse.json({
        output: stableKnowledgeFileUrlFromKey(key),
        key,
        width: finalized.width,
        height: finalized.height,
        usedMl: false,
        esrganScale: null,
        timeMs: Date.now() - started,
      });
    }

    walletCharge = await reserveApiWalletCharge({
      req,
      userEmail,
      serviceId: "replicate-upscale",
      provider: "replicate",
      route: "/api/spaces/nano-banana/export-6k",
      maxCostMicros: reserveUsdToMicros(ESTIMATED_COST_USD, { multiplier: 1.35 }),
      metadata: {
        model: ESRGAN_MODEL_LABEL,
        scale: plan.esrganScale,
        source: `${width}x${height}`,
        target: `${plan.targetWidth}x${plan.targetHeight}`,
      },
    });

    // JPEG q92 para no mandar PNG enormes a Replicate (mismo contenido perceptual).
    const jpegForMl = await sharp(source.buffer, { failOn: "none" })
      .rotate()
      .jpeg({ quality: 92, mozjpeg: true })
      .toBuffer();
    const imageInput = `data:image/jpeg;base64,${jpegForMl.toString("base64")}`;

    const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });
    let upscaledUrl: string;
    try {
      // Un solo intento: si falla, el usuario reintenta con gesto explícito.
      const output = await replicate.run(ESRGAN_MODEL as `${string}/${string}:${string}`, {
        input: {
          image: imageInput,
          scale: plan.esrganScale,
          face_enhance: faceEnhance,
        },
      });
      upscaledUrl = replicateOutputUrl(output);
      releaseWalletOnError = false;
      await walletCharge?.capture({
        actualCostUsd: ESTIMATED_COST_USD,
        metadata: { model: ESRGAN_MODEL_LABEL, scale: plan.esrganScale },
      });
      await recordApiUsage({
        provider: "replicate",
        userEmail,
        serviceId: "replicate-upscale",
        route: "/api/spaces/nano-banana/export-6k",
        model: ESRGAN_MODEL_LABEL,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        costUsd: ESTIMATED_COST_USD,
        note: `Export 6K Real-ESRGAN ×${plan.esrganScale}`,
        metadata: {
          source: `${width}x${height}`,
          target: `${plan.targetWidth}x${plan.targetHeight}`,
          faceEnhance,
        },
      });
    } catch (mlErr: unknown) {
      const mlMessage = mlErr instanceof Error ? mlErr.message : String(mlErr);
      console.error("[nano-banana/export-6k] Real-ESRGAN:", mlErr);
      const mapped = mapReplicateUpscaleError(mlMessage);
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

    const upRes = await fetch(upscaledUrl, { signal: AbortSignal.timeout(60_000) });
    if (!upRes.ok) throw new Error(`No se pudo descargar el upscale (${upRes.status}).`);
    const upBuffer = Buffer.from(await upRes.arrayBuffer());
    const finalized = await finalizeExport6kPng(upBuffer, plan);

    const key = buildUserAssetObjectKey({
      userEmail,
      folder: "generated",
      filename: "studio-export-6k.png",
    });
    await uploadBufferToS3Key(key, finalized.png, "image/png");
    await recordApiUsage({
      provider: "aws",
      userEmail,
      serviceId: "s3-assets",
      route: "/api/spaces/nano-banana/export-6k",
      operation: "put_object",
      costIsKnown: false,
      costUsd: 0,
      bytes: finalized.png.length,
      metadata: { key, plan },
    });

    console.info("[nano-banana/export-6k] ok", {
      key,
      from: `${width}x${height}`,
      to: `${finalized.width}x${finalized.height}`,
      scale: plan.esrganScale,
      ms: Date.now() - started,
    });

    return NextResponse.json({
      output: stableKnowledgeFileUrlFromKey(key),
      key,
      width: finalized.width,
      height: finalized.height,
      usedMl: true,
      esrganScale: plan.esrganScale,
      timeMs: Date.now() - started,
    });
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
