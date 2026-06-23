import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { recordApiUsage } from "@/lib/api-usage";
import {
  ApiServiceDisabledError,
  assertApiServiceEnabled,
} from "@/lib/api-usage-controls";
import { ForbiddenMediaReferenceError } from "@/lib/api-media-access";
import { requireSpacesAuthUser } from "@/lib/spaces-access-control";
import {
  reserveApiWalletCharge,
  reserveUsdToMicros,
  releaseApiWalletChargeOnError,
  walletGateErrorResponse,
  type ApiWalletCharge,
} from "@/lib/wallet-api-gate";
import { resolveLayerizerMaster } from "@/lib/layerizer/layerizer-master";
import { detectObjectsWithGemini } from "@/lib/layerizer/layerizer-detect";
import { refineDetectedBoxesWithSamText } from "@/lib/layerizer/layerizer-fal";
import { LAYERIZER_COST_USD, resolveLayerizerHost } from "@/lib/layerizer/layerizer-config";
import type { DetectedObject } from "@/app/spaces/layerizer/layerizer-types";

export const maxDuration = 60;

/**
 * Paso A — Detección de objetos (Gemini vision, pre-pago).
 *
 * Request:  { image: string }
 * Response: { objects: DetectedObject[], width, height }
 */
export async function POST(req: NextRequest) {
  let walletCharge: ApiWalletCharge | null = null;
  let releaseWalletOnError = true;
  try {
    await assertApiServiceEnabled("layerizer-detect");
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;
    const usageUserEmail = authState.user.email;

    const body = await req.json().catch(() => ({}));
    const image = typeof body?.image === "string" ? body.image.trim() : "";
    if (!image) {
      return NextResponse.json({ error: "Missing image input" }, { status: 400 });
    }

    // Región opcional [x, y, w, h] en px del master para análisis local manual.
    const rawRegion = Array.isArray(body?.region) ? body.region.map((n: unknown) => Number(n)) : null;
    const hasRegion = rawRegion && rawRegion.length === 4 && rawRegion.every(Number.isFinite);
    const detectMode: "auto" | "local" | "text" =
      body?.mode === "text" ? "text" : hasRegion ? "local" : "auto";

    const master = await resolveLayerizerMaster(usageUserEmail, image);
    const meta = await sharp(master.buffer).metadata();
    const width = meta.width || 0;
    const height = meta.height || 0;
    if (!width || !height) {
      return NextResponse.json({ error: "Could not read image dimensions" }, { status: 400 });
    }

    // Usar los bytes ya resueltos (Gemini no puede re-descargar URLs autenticadas del server).
    const fmt = meta.format;
    const knownMime =
      fmt === "jpeg" ? "image/jpeg" : fmt === "webp" ? "image/webp" : fmt === "png" ? "image/png" : null;
    const detectBuffer = knownMime ? master.buffer : await sharp(master.buffer).png().toBuffer();
    const detectMime = knownMime ?? "image/png";

    // SAM refine en auto y text (no en local). Reservar holgura para hasta 8 bloques de texto.
    const willRefine = detectMode !== "local" && resolveLayerizerHost() === "fal";
    const refineSlots = detectMode === "text" ? 8 : 5;
    const detectReserveUsd =
      LAYERIZER_COST_USD.detect + (willRefine ? refineSlots * LAYERIZER_COST_USD.detectRefinePerObject : 0);
    walletCharge = await reserveApiWalletCharge({
      req,
      userEmail: usageUserEmail,
      serviceId: "layerizer-detect",
      provider: "gemini",
      route: "/api/spaces/layerizer/detect",
      maxCostMicros: reserveUsdToMicros(detectReserveUsd, { multiplier: 1.25 }),
      metadata: {
        model: "gemini-2.5-flash",
        op: detectMode === "text" ? "layerizer-detect-text" : hasRegion ? "layerizer-detect-local" : "layerizer-detect",
      },
    });

    let result: { objects: DetectedObject[]; width: number; height: number };

    if (hasRegion) {
      // Recorte de la región (clamp al master) → detección local inclusiva → offset a master.
      const rx = Math.max(0, Math.min(width - 1, Math.round(rawRegion[0])));
      const ry = Math.max(0, Math.min(height - 1, Math.round(rawRegion[1])));
      const rw = Math.max(1, Math.min(width - rx, Math.round(rawRegion[2])));
      const rh = Math.max(1, Math.min(height - ry, Math.round(rawRegion[3])));
      if (rw < 12 || rh < 12) {
        return NextResponse.json({ error: "Área demasiado pequeña" }, { status: 400 });
      }
      const crop = await sharp(detectBuffer).extract({ left: rx, top: ry, width: rw, height: rh }).png().toBuffer();
      const det = await detectObjectsWithGemini({
        image,
        width: rw,
        height: rh,
        baseUrl: req.url,
        imageBuffer: crop,
        imageMimeType: "image/png",
        mode: "local",
      });
      const objects = det.objects.map((o) => {
        const x = Math.max(0, Math.min(width - 1, o.bbox[0] + rx));
        const y = Math.max(0, Math.min(height - 1, o.bbox[1] + ry));
        const w = Math.max(1, Math.min(width - x, o.bbox[2]));
        const h = Math.max(1, Math.min(height - y, o.bbox[3]));
        return { ...o, bbox: [x, y, w, h] as [number, number, number, number], manual: true };
      });
      result = { objects, width, height };
    } else {
      result = await detectObjectsWithGemini({
        image,
        width,
        height,
        baseUrl: req.url,
        imageBuffer: detectBuffer,
        imageMimeType: detectMime,
        mode: detectMode === "text" ? "text" : "auto",
      });
    }

    // Paso A.2 — afinar bounds con SAM 3.1 (texto). Solo modos auto y text.
    let refinedCount = 0;
    if (willRefine && result.objects.length > 0) {
      const before = result.objects.map((o) => o.bbox.join(","));
      result.objects = await refineDetectedBoxesWithSamText(
        master.buffer,
        width,
        height,
        result.objects,
      );
      refinedCount = result.objects.filter((o, i) => o.bbox.join(",") !== before[i]).length;
    }

    releaseWalletOnError = false;
    await walletCharge?.capture({
      actualCostUsd: LAYERIZER_COST_USD.detect + refinedCount * LAYERIZER_COST_USD.detectRefinePerObject,
      metadata: { objects: result.objects.length, refined: refinedCount },
    });
    await recordApiUsage({
      provider: "gemini",
      userEmail: usageUserEmail,
      serviceId: "layerizer-detect",
      route: "/api/spaces/layerizer/detect",
      model: "gemini-2.5-flash",
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      costUsd: LAYERIZER_COST_USD.detect,
      note: "Layerizer detección de objetos (estimado)",
    });

    return NextResponse.json({
      objects: result.objects,
      width: result.width,
      height: result.height,
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
    if (releaseWalletOnError) await releaseApiWalletChargeOnError(walletCharge, error);
    const walletResponse = walletGateErrorResponse(error);
    if (walletResponse) return walletResponse;
    const message = error instanceof Error ? error.message : String(error);
    console.error("[layerizer:detect] error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
