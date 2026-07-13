import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { recordApiUsage } from "@/lib/api-usage";
import { ApiServiceDisabledError, assertApiServiceEnabled } from "@/lib/api-usage-controls";
import type { GalleryValue, BrandKitDocument } from "@/lib/brandkit/brand-kit-types";
import { estimateBrandKitGalleryGenerateCostUsd } from "@/lib/brandkit/brand-kit-gallery-cost";
import {
  galleryGenerateActualCostUsd,
  BRAND_KIT_GALLERY_IMAGE_COUNT,
  IMAGE_MODEL,
  runBrandKitGalleryGenerate,
} from "@/lib/brandkit/run-gallery-generate";
import type { GalleryGenerateCategory } from "@/lib/brandkit/brand-kit-gallery-plan";
import { GALLERY_CATEGORY_SLOT_COUNT } from "@/lib/brandkit/brand-kit-gallery-plan";
import { requireSpacesAuthUser } from "@/lib/spaces-access-control";
import {
  releaseApiWalletChargeOnError,
  reserveApiWalletCharge,
  reserveUsdToMicros,
  walletGateErrorResponse,
  type ApiWalletCharge,
} from "@/lib/wallet-api-gate";

export const maxDuration = 300;
export const runtime = "nodejs";

function parseBrandKitSnapshot(body: unknown): BrandKitDocument | null {
  if (!body || typeof body !== "object") return null;
  const brandKit = (body as { brandKit?: BrandKitDocument }).brandKit;
  if (!brandKit?.slots) return null;
  return brandKit;
}

function parseGalleryCategory(body: unknown): GalleryGenerateCategory | undefined {
  if (!body || typeof body !== "object") return undefined;
  const category = (body as { category?: string }).category;
  const allowed = new Set(["people_mood", "places", "objects", "textures", "general"]);
  return category && allowed.has(category) ? (category as GalleryGenerateCategory) : undefined;
}

function estimateGalleryGenerateReserveUsd(imageCount: number): number {
  return Math.round(estimateBrandKitGalleryGenerateCostUsd(imageCount) * 1_000_000) / 1_000_000;
}

export async function POST(req: NextRequest) {
  let walletCharge: ApiWalletCharge | null = null;
  let releaseWalletOnError = true;

  try {
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;

    await assertApiServiceEnabled("gemini-nano");

    const body = await req.json().catch(() => ({}));
    const brandKit = parseBrandKitSnapshot(body);
    if (!brandKit) {
      return Response.json({ error: "brandKit snapshot required" }, { status: 400 });
    }

    const gallerySlot = brandKit.slots.gallery;
    const gallery = gallerySlot?.value as GalleryValue | undefined;
    const stylePromptVersion =
      typeof body?.stylePromptVersion === "number"
        ? body.stylePromptVersion
        : (gallery?.stylePromptVersion ?? 0);

    const category = parseGalleryCategory(body);
    const imageCount = category ? GALLERY_CATEGORY_SLOT_COUNT : BRAND_KIT_GALLERY_IMAGE_COUNT;

    walletCharge = await reserveApiWalletCharge({
      req,
      userEmail: authState.user.email,
      serviceId: "gemini-nano",
      provider: "gemini",
      route: "/api/spaces/brandKit/gallery/generate",
      maxCostMicros: reserveUsdToMicros(estimateGalleryGenerateReserveUsd(imageCount), { multiplier: 1.5 }),
      metadata: { count: imageCount, model: IMAGE_MODEL, category: category ?? "all" },
    });

    const acceptStream = req.headers.get("accept")?.includes("application/x-ndjson");
    if (acceptStream) {
      const encoder = new TextEncoder();
      let generatedCount = 0;
      let captured = false;

      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const send = (event: unknown) => {
            controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
          };
          try {
            for await (const event of runBrandKitGalleryGenerate({
              brandKit,
              stylePromptVersion,
              userEmail: authState.user.email,
              category,
            })) {
              send(event);
              if (event.type === "image_done") generatedCount += 1;
              if (event.type === "error") break;
              if (event.type === "done") {
                releaseWalletOnError = false;
                captured = true;
                const totalCostUsd = galleryGenerateActualCostUsd(event.addedCount);
                await walletCharge?.capture({
                  actualCostUsd: totalCostUsd,
                  metadata: { count: event.addedCount, jobId: randomUUID() },
                });
                await recordApiUsage({
                  provider: "gemini",
                  userEmail: authState.user.email,
                  serviceId: "gemini-nano",
                  route: "/api/spaces/brandKit/gallery/generate",
                  model: IMAGE_MODEL,
                  costUsd: totalCostUsd,
                  metadata: { generated: event.addedCount },
                }).catch(() => undefined);
              }
            }
          } catch (error) {
            if (releaseWalletOnError) await releaseApiWalletChargeOnError(walletCharge, error);
            send({
              type: "error",
              message: error instanceof Error ? error.message : "Error generando galería",
            });
          } finally {
            if (!captured && releaseWalletOnError) {
              await releaseApiWalletChargeOnError(walletCharge, new Error("gallery_stream_incomplete"));
            }
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "application/x-ndjson; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    }

    let lastGallery: GalleryValue | null = null;
    let addedCount = 0;
    let stylePrompt = "";
    let lastError: string | undefined;

    for await (const event of runBrandKitGalleryGenerate({
      brandKit,
      stylePromptVersion,
      userEmail: authState.user.email,
      category,
    })) {
      if (event.type === "image_done") addedCount += 1;
      if (event.type === "error") {
        lastError = event.message;
        break;
      }
      if (event.type === "done") {
        lastGallery = event.gallery;
        addedCount = event.addedCount;
        stylePrompt = event.stylePrompt;
      }
    }

    if (!lastGallery) {
      throw new Error(lastError ?? "No se pudo generar ninguna imagen de estilo");
    }

    releaseWalletOnError = false;
    const totalCostUsd = galleryGenerateActualCostUsd(addedCount);
    await walletCharge?.capture({
      actualCostUsd: totalCostUsd,
      metadata: { count: addedCount, jobId: randomUUID() },
    });

    await recordApiUsage({
      provider: "gemini",
      userEmail: authState.user.email,
      serviceId: "gemini-nano",
      route: "/api/spaces/brandKit/gallery/generate",
      model: IMAGE_MODEL,
      costUsd: totalCostUsd,
      metadata: { generated: addedCount },
    }).catch(() => undefined);

    return Response.json({
      ok: true,
      gallery: lastGallery,
      stylePrompt,
      addedCount,
      partial: addedCount < imageCount,
    });
  } catch (error) {
    if (releaseWalletOnError) await releaseApiWalletChargeOnError(walletCharge, error);
    const walletResponse = walletGateErrorResponse(error);
    if (walletResponse) return walletResponse;
    if (error instanceof ApiServiceDisabledError) {
      return Response.json({ error: "Generación de imágenes deshabilitada." }, { status: 503 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Error generando galería" },
      { status: 500 },
    );
  }
}
