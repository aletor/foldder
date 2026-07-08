import { estimateGeminiImageGenerationUsd } from "@/lib/pricing-config";
import { GENOMA_GALLERY_IMAGE_COUNT } from "./genoma-gallery-plan";

const GALLERY_GENERATE_ROUTE = "/api/spaces/genoma/gallery/generate";
const IMAGE_MODEL_KEY = "flash25";
const IMAGE_RESOLUTION = "1k";
const RESERVE_MULTIPLIER = 1.5;

export { GENOMA_GALLERY_IMAGE_COUNT as GENOMA_GALLERY_GENERATE_IMAGE_COUNT };
export const GENOMA_GALLERY_PER_IMAGE_USD = estimateGeminiImageGenerationUsd(IMAGE_MODEL_KEY, IMAGE_RESOLUTION);

export function estimateGenomaGalleryGenerateCostUsd(): number {
  return Math.round(GENOMA_GALLERY_PER_IMAGE_USD * GENOMA_GALLERY_IMAGE_COUNT * 1_000_000) / 1_000_000;
}

export function estimateGenomaGalleryReserveUsd(): number {
  const reserveMicros = Math.max(
    1_000,
    Math.ceil(estimateGenomaGalleryGenerateCostUsd() * 1_000_000 * RESERVE_MULTIPLIER),
  );
  return Math.round(reserveMicros) / 1_000_000;
}

export function estimateGenomaGalleryWalletCost() {
  const estimatedUsd = estimateGenomaGalleryGenerateCostUsd();
  const reserveUsd = estimateGenomaGalleryReserveUsd();
  return {
    label: "Genoma · generar galería",
    route: GALLERY_GENERATE_ROUTE,
    category: "image" as const,
    estimatedCostMicros: Math.ceil(estimatedUsd * 1_000_000),
    reserveMicros: Math.ceil(reserveUsd * 1_000_000),
    tone: "confirm" as const,
    perImageUsd: GENOMA_GALLERY_PER_IMAGE_USD,
    imageCount: GENOMA_GALLERY_IMAGE_COUNT,
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

export function formatGenomaGalleryCostHint(language: "es" | "en" = "es"): string {
  const total = estimateGenomaGalleryGenerateCostUsd();
  const per = GENOMA_GALLERY_PER_IMAGE_USD;
  const reserve = estimateGenomaGalleryReserveUsd();
  if (language === "es") {
    return `${GENOMA_GALLERY_IMAGE_COUNT} imágenes · ~${formatUsd(per, "es")}/img · estimado ${formatUsd(total, "es")} (reserva máx. ${formatUsd(reserve, "es")}) · confirmación antes de cobrar`;
  }
  return `${GENOMA_GALLERY_IMAGE_COUNT} images · ~${formatUsd(per, "en")}/img · est. ${formatUsd(total, "en")} (max reserve ${formatUsd(reserve, "en")}) · confirm before charge`;
}

export function formatGenomaGalleryPerImageCost(language: "es" | "en" = "es"): string {
  return formatUsd(GENOMA_GALLERY_PER_IMAGE_USD, language);
}
