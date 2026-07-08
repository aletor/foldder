import { NextRequest, NextResponse } from "next/server";
import { isVectorizerConfigured, vectorizeRasterBuffer } from "@/lib/brandkit/vectorizer-ai-client";
import { refineCrownedRasterLogo } from "@/lib/genoma/ingest/logo-crown-refine";
import { genomaOperationId } from "@/lib/genoma/ingest/paid-operations";
import { resolveHiResLogoRasterForVectorize } from "@/lib/genoma/ingest/vectorize-hires-raster";
import type { LogoVectorSourceRef } from "@/lib/genoma/model/evidence";
import { getFromS3, uploadBufferToS3Key } from "@/lib/s3-utils";
import { resolveKnowledgeFilesS3Key } from "@/lib/s3-media-hydrate";
import {
  buildUserAssetObjectKey,
  canUserAccessKnowledgeFileKey,
  requireSpacesAuthUser,
} from "@/lib/spaces-access-control";
import {
  reserveApiWalletCharge,
  reserveUsdToMicros,
  releaseApiWalletChargeOnError,
  walletGateErrorResponse,
  type ApiWalletCharge,
} from "@/lib/wallet-api-gate";

export const runtime = "nodejs";

const VECTORIZE_ESTIMATE_USD = 0.05;

function filenameFromKey(key: string): string {
  const base = key.split("/").pop() || "logo.png";
  return base.includes(".") ? base : `${base}.png`;
}

function contentTypeFromFilename(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  if (ext === "svg") return "image/svg+xml";
  return "image/png";
}

async function loadRaster(logoUrl: string, userEmail: string): Promise<{ buffer: Buffer; filename: string; contentType: string }> {
  const s3Key = resolveKnowledgeFilesS3Key(logoUrl);
  if (s3Key) {
    const allowed = await canUserAccessKnowledgeFileKey(userEmail, s3Key);
    if (!allowed) throw new Error("forbidden_key");
    const filename = filenameFromKey(s3Key);
    return {
      buffer: await getFromS3(s3Key),
      filename,
      contentType: contentTypeFromFilename(filename),
    };
  }
  if (/^data:image\//i.test(logoUrl)) {
    const m = /^data:([^;]+);base64,(.+)$/i.exec(logoUrl);
    if (!m) throw new Error("invalid_data_url");
    return {
      buffer: Buffer.from(m[2], "base64"),
      filename: "logo.png",
      contentType: m[1],
    };
  }
  if (/^https?:\/\//i.test(logoUrl)) {
    const remote = await fetch(logoUrl);
    if (!remote.ok) throw new Error("logo_fetch_failed");
    const contentType = remote.headers.get("content-type")?.split(";")[0]?.trim() || "image/png";
    const urlName = new URL(logoUrl).pathname.split("/").pop();
    return {
      buffer: Buffer.from(await remote.arrayBuffer()),
      filename: urlName || "logo.png",
      contentType,
    };
  }
  throw new Error("logo_ref_not_resolvable");
}

export async function POST(req: NextRequest) {
  let walletCharge: ApiWalletCharge | null = null;
  let releaseWalletOnError = true;
  try {
    const auth = await requireSpacesAuthUser(req);
    if (!auth.ok) return auth.response;

    if (!isVectorizerConfigured()) {
      return NextResponse.json({ error: "vectorizer_not_configured" }, { status: 503 });
    }

    const body = (await req.json()) as {
      logoUrl?: string;
      logoSignature?: string;
      cachedVectorUrl?: string;
      vectorSource?: LogoVectorSourceRef;
      operationId?: string;
    };
    const logoUrl = body.logoUrl?.trim();
    const logoSignature = body.logoSignature?.trim();
    if (!logoUrl || !logoSignature) {
      return NextResponse.json({ error: "logoUrl and logoSignature required" }, { status: 400 });
    }

    if (body.cachedVectorUrl?.trim()) {
      console.info(
        `[vectorize] called: reason=genoma_cached_body logoSignature=${logoSignature} cached=true`,
      );
      return NextResponse.json({
        vectorUrl: body.cachedVectorUrl.trim(),
        cached: true,
      });
    }

    const operationId =
      body.operationId?.trim() ||
      req.headers.get("x-foldder-operation-id")?.trim() ||
      genomaOperationId("vectorize", logoSignature);
    walletCharge = await reserveApiWalletCharge({
      req,
      userEmail: auth.user.email,
      serviceId: "unknown-external",
      provider: "beeble",
      route: "/api/spaces/genoma/logo/vectorize",
      maxCostMicros: reserveUsdToMicros(VECTORIZE_ESTIMATE_USD, { multiplier: 1.2 }),
      operationId,
      metadata: { feature: "genoma-logo-vectorize", logoSignature },
    });

    const { buffer: fallbackRaster, filename, contentType } = await loadRaster(logoUrl, auth.user.email);
    const hiRes = await resolveHiResLogoRasterForVectorize({
      userEmail: auth.user.email,
      vectorSource: body.vectorSource,
      fallbackBuffer: fallbackRaster,
    });
    const refined = await refineCrownedRasterLogo(hiRes.buffer);
    const svg = await vectorizeRasterBuffer({
      buffer: refined.buffer,
      filename,
      contentType,
      mode: "production",
      audit: {
        reason: hiRes.source === "hi_res_pdf_crop" ? "genoma_crown_hi_res" : "genoma_crown_raster",
        logoSignature,
        cached: false,
      },
    });

    const sig = logoSignature.replace(/[^\w.-]+/g, "_").slice(0, 48) || "logo";
    const vectorKey = buildUserAssetObjectKey({
      userEmail: auth.user.email,
      folder: `genoma/logos/vector/${sig}`,
      filename: "primary.svg",
      unique: false,
    });

    await uploadBufferToS3Key(vectorKey, svg, "image/svg+xml");
    const vectorUrl = `/api/spaces/s3-file?key=${encodeURIComponent(vectorKey)}`;

    await walletCharge?.capture({
      actualCostUsd: VECTORIZE_ESTIMATE_USD,
      metadata: { vectorKey, bytes: svg.length },
    });
    releaseWalletOnError = false;

    return NextResponse.json({
      vectorKey,
      vectorUrl,
      bytes: svg.length,
      operationId,
      walletReservationId: walletCharge?.reservationId,
      isolationMethod: refined.method,
      rasterSource: hiRes.source,
      rasterDpi: hiRes.dpi,
      rasterWidthPx: hiRes.widthPx,
      rasterHeightPx: hiRes.heightPx,
    });
  } catch (error) {
    if (releaseWalletOnError) await releaseApiWalletChargeOnError(walletCharge, error);
    const walletResponse = walletGateErrorResponse(error);
    if (walletResponse) return walletResponse;
    const message = error instanceof Error ? error.message : "vectorize_failed";
    if (message === "vectorizer_not_configured") {
      return NextResponse.json({ error: message }, { status: 503 });
    }
    console.error("[genoma/logo/vectorize]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
