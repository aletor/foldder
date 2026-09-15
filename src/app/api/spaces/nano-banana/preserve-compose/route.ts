import { NextResponse } from "next/server";
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
import { preserveComposeImages } from "@/lib/nano-banana/preserve-compose/compose";
import type { ChangeMaskSensitivity, ChangeMaskStats } from "@/lib/nano-banana/preserve-compose/analyze-change-mask";

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

export type PreserveComposeRequestBody = {
  base: ImageSourceInput;
  generated: ImageSourceInput;
  priorMask?: string | null;
  sensitivity?: ChangeMaskSensitivity;
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

    const result = await preserveComposeImages({
      base: base.buffer,
      generated: generated.buffer,
      priorMask: prior,
      sensitivity,
      wantMaskPreview: true,
    });
    const maskPreview = result.maskPreviewPng ? `data:image/png;base64,${result.maskPreviewPng.toString("base64")}` : null;

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
        width: result.width,
        height: result.height,
        stats: result.stats,
        maskPreview,
        timeMs: Date.now() - started,
      };
      return NextResponse.json(payload);
    }

    const key = buildUserAssetObjectKey({
      userEmail,
      folder: "generated",
      filename: "studio-preserve-compose.png",
    });
    await uploadBufferToS3Key(key, result.png, "image/png");
    await recordApiUsage({
      provider: "aws",
      userEmail,
      serviceId: "s3-assets",
      route: "/api/spaces/nano-banana/preserve-compose",
      operation: "put_object",
      costIsKnown: false,
      costUsd: 0,
      bytes: result.png.length,
      metadata: {
        key,
        baseKey: base.key,
        generatedKey: generated.key,
        changedPct: Math.round(result.stats.changedFraction * 1000) / 10,
        componentsKept: result.stats.componentsKept,
        componentsDropped: result.stats.componentsDropped,
        shift: result.stats.shift,
        timings: result.timings,
      },
    });
    console.info("[nano-banana/preserve-compose] composed", {
      key,
      size: `${result.width}x${result.height}`,
      changedPct: Math.round(result.stats.changedFraction * 1000) / 10,
      timings: result.timings,
    });

    const payload: PreserveComposeResponseBody = {
      composed: true,
      output: stableKnowledgeFileUrlFromKey(key),
      key,
      width: result.width,
      height: result.height,
      stats: result.stats,
      maskPreview,
      timeMs: Date.now() - started,
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
