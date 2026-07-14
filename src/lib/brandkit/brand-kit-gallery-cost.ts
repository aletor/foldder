import { estimateGeminiImageGenerationUsd } from "@/lib/pricing-config";
import {
  BRAND_KIT_GALLERY_IMAGE_COUNT,
  GALLERY_CATEGORY_SLOT_COUNT,
} from "./brand-kit-gallery-plan";
import {
  estimateGalleryGenerateCostUsd,
  estimateGalleryImageUnitUsd,
} from "./brand-kit-gallery-generate-profile";

const GALLERY_GENERATE_ROUTE = "/api/spaces/brandKit/gallery/generate";
const RESERVE_MULTIPLIER = 1.5;

export { BRAND_KIT_GALLERY_IMAGE_COUNT as BRAND_KIT_GALLERY_GENERATE_IMAGE_COUNT };
export { GALLERY_CATEGORY_SLOT_COUNT as BRAND_KIT_GALLERY_CATEGORY_IMAGE_COUNT };

/** Coste medio ponderado (8× Flash 3.1 + 12× Flash 2.5). */
export const BRAND_KIT_GALLERY_PER_IMAGE_USD =
  Math.round((estimateGalleryGenerateCostUsd(BRAND_KIT_GALLERY_IMAGE_COUNT) / BRAND_KIT_GALLERY_IMAGE_COUNT) * 1_000_000) /
  1_000_000;

export function estimateBrandKitGalleryGenerateCostUsd(
  imageCount = BRAND_KIT_GALLERY_IMAGE_COUNT,
  category?: import("./brand-kit-gallery-plan").GalleryGenerateCategory,
): number {
  return estimateGalleryGenerateCostUsd(imageCount, category);
}

export function estimateBrandKitGalleryCategoryCostUsd(
  category?: import("./brand-kit-gallery-plan").GalleryGenerateCategory,
): number {
  return estimateGalleryGenerateCostUsd(GALLERY_CATEGORY_SLOT_COUNT, category);
}

export function estimateBrandKitGalleryReserveUsd(
  imageCount = BRAND_KIT_GALLERY_IMAGE_COUNT,
  category?: import("./brand-kit-gallery-plan").GalleryGenerateCategory,
): number {
  const estimated = estimateGalleryGenerateCostUsd(imageCount, category);
  const reserveMicros = Math.max(
    1_000,
    Math.ceil(estimated * 1_000_000 * RESERVE_MULTIPLIER),
  );
  return Math.round(reserveMicros) / 1_000_000;
}

export function estimateBrandKitGalleryWalletCost(
  category?: import("./brand-kit-gallery-plan").GalleryGenerateCategory,
  imageCount?: number,
) {
  const count =
    imageCount ??
    (category ? GALLERY_CATEGORY_SLOT_COUNT : BRAND_KIT_GALLERY_IMAGE_COUNT);
  const estimatedUsd = estimateGalleryGenerateCostUsd(count, category);
  const reserveUsd = estimateBrandKitGalleryReserveUsd(count, category);
  return {
    label: category
      ? count === 1
        ? "BrandKit · regenerar imagen"
        : "BrandKit · generar categoría"
      : "BrandKit · generar galería",
    route: GALLERY_GENERATE_ROUTE,
    category: "image" as const,
    estimatedCostMicros: Math.ceil(estimatedUsd * 1_000_000),
    reserveMicros: Math.ceil(reserveUsd * 1_000_000),
    tone: "confirm" as const,
    perImageUsd: category
      ? estimateGalleryImageUnitUsd(category)
      : BRAND_KIT_GALLERY_PER_IMAGE_USD,
    imageCount: count,
  };
}

function formatUsd(amount: number, language: "es" | "en"): string {
  return new Intl.NumberFormat(language === "es" ? "es-ES" : "en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatBrandKitGalleryCategoryCostHint(
  language: "es" | "en" = "es",
  category?: import("./brand-kit-gallery-plan").GalleryGenerateCategory,
): string {
  const total = estimateBrandKitGalleryCategoryCostUsd(category);
  const per = category ? estimateGalleryImageUnitUsd(category) : BRAND_KIT_GALLERY_PER_IMAGE_USD;
  const reserve = estimateBrandKitGalleryReserveUsd(GALLERY_CATEGORY_SLOT_COUNT, category);
  if (language === "es") {
    return `${GALLERY_CATEGORY_SLOT_COUNT} imágenes · ~${formatUsd(per, "es")}/img · ~${formatUsd(total, "es")} (reserva máx. ${formatUsd(reserve, "es")})`;
  }
  return `${GALLERY_CATEGORY_SLOT_COUNT} images · ~${formatUsd(per, "en")}/img · ~${formatUsd(total, "en")} (max reserve ${formatUsd(reserve, "en")})`;
}

export function formatBrandKitGalleryCostHint(language: "es" | "en" = "es"): string {
  const total = estimateBrandKitGalleryGenerateCostUsd();
  const per = BRAND_KIT_GALLERY_PER_IMAGE_USD;
  const reserve = estimateBrandKitGalleryReserveUsd();
  if (language === "es") {
    return `${BRAND_KIT_GALLERY_IMAGE_COUNT} imágenes · ~${formatUsd(per, "es")}/img · estimado ${formatUsd(total, "es")} (reserva máx. ${formatUsd(reserve, "es")}) · confirmación antes de cobrar`;
  }
  return `${BRAND_KIT_GALLERY_IMAGE_COUNT} images · ~${formatUsd(per, "en")}/img · est. ${formatUsd(total, "en")} (max reserve ${formatUsd(reserve, "en")}) · confirm before charge`;
}

export function formatBrandKitGalleryPerImageCost(language: "es" | "en" = "es"): string {
  return formatUsd(BRAND_KIT_GALLERY_PER_IMAGE_USD, language);
}

export { estimateGeminiImageGenerationUsd };
