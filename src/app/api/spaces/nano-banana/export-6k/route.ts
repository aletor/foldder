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
import {
  coerceExport6kFormat,
  finalizeExport6k,
  planExport6k,
} from "@/lib/nano-banana/export-6k";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Export 6K · reescala local (Lanczos3) al lado largo 6144 y entrega PNG o JPEG q96.
 * Sin IA ni APIs de pago: no inventa detalle ni distorsiona la imagen.
 */

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

export async function POST(req: Request) {
  const started = Date.now();
  try {
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
    const finalized = await finalizeExport6k(source.buffer, plan, format);
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
      metadata: { key, plan, format, local: true },
    });
    console.info("[nano-banana/export-6k] ok", {
      key,
      from: `${plan.sourceWidth}x${plan.sourceHeight}`,
      to: `${finalized.width}x${finalized.height}`,
      scale: Number(plan.scale.toFixed(3)),
      format,
      ms: Date.now() - started,
    });
    return NextResponse.json({
      output: stableKnowledgeFileUrlFromKey(key),
      key,
      width: finalized.width,
      height: finalized.height,
      scale: plan.scale,
      format,
      timeMs: Date.now() - started,
    });
  } catch (error: unknown) {
    if (error instanceof ExportInputError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "export-6k failed";
    console.error("[nano-banana/export-6k]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
