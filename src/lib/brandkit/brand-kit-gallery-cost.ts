import { estimateGeminiImageGenerationUsd } from "@/lib/pricing-config";
import {
  BRAND_KIT_GALLERY_IMAGE_COUNT,
  GALLERY_CATEGORY_SLOT_COUNT,
} from "./brand-kit-gallery-plan";

const GALLERY_GENERATE_ROUTE = "/api/spaces/brandKit/gallery/generate";
const IMAGE_MODEL_KEY = "flash25";
const IMAGE_RESOLUTION = "1k";
const RESERVE_MULTIPLIER = 1.5;

export { BRAND_KIT_GALLERY_IMAGE_COUNT as BRAND_KIT_GALLERY_GENERATE_IMAGE_COUNT };
export { GALLERY_CATEGORY_SLOT_COUNT as BRAND_KIT_GALLERY_CATEGORY_IMAGE_COUNT };
export const BRAND_KIT_GALLERY_PER_IMAGE_USD = estimateGeminiImageGenerationUsd(IMAGE_MODEL_KEY, IMAGE_RESOLUTION);

export function estimateBrandKitGalleryGenerateCostUsd(imageCount = BRAND_KIT_GALLERY_IMAGE_COUNT): number {
  return Math.round(BRAND_KIT_GALLERY_PER_IMAGE_USD * imageCount * 1_000_000) / 1_000_000;
}

export function estimateBrandKitGalleryCategoryCostUsd(): number {
  return estimateBrandKitGalleryGenerateCostUsd(GALLERY_CATEGORY_SLOT_COUNT);
}

export function estimateBrandKitGalleryReserveUsd(imageCount = BRAND_KIT_GALLERY_IMAGE_COUNT): number {
  const reserveMicros = Math.max(
    1_000,
    Math.ceil(estimateBrandKitGalleryGenerateCostUsd(imageCount) * 1_000_000 * RESERVE_MULTIPLIER),
  );
  return Math.round(reserveMicros) / 1_000_000;
}

export function estimateBrandKitGalleryWalletCost() {
  const estimatedUsd = estimateBrandKitGalleryGenerateCostUsd();
  const reserveUsd = estimateBrandKitGalleryReserveUsd();
  return {
    label: "BrandKit · generar galería",
    route: GALLERY_GENERATE_ROUTE,
    category: "image" as const,
    estimatedCostMicros: Math.ceil(estimatedUsd * 1_000_000),
    reserveMicros: Math.ceil(reserveUsd * 1_000_000),
    tone: "confirm" as const,
    perImageUsd: BRAND_KIT_GALLERY_PER_IMAGE_USD,
    imageCount: BRAND_KIT_GALLERY_IMAGE_COUNT,
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

export function formatBrandKitGalleryCategoryCostHint(language: "es" | "en" = "es"): string {
  const total = estimateBrandKitGalleryCategoryCostUsd();
  const per = BRAND_KIT_GALLERY_PER_IMAGE_USD;
  const reserve = estimateBrandKitGalleryReserveUsd(GALLERY_CATEGORY_SLOT_COUNT);
  if (language === "es") {
    return `2 imágenes · ~${formatUsd(per, "es")}/img · ~${formatUsd(total, "es")} (reserva máx. ${formatUsd(reserve, "es")})`;
  }
  return `2 images · ~${formatUsd(per, "en")}/img · ~${formatUsd(total, "en")} (max reserve ${formatUsd(reserve, "en")})`;
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
