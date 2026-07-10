import type { LogoValue } from "@/lib/genoma/genoma-types";

export type GenomaLogoPlinthTone = "neutral" | "light" | "adaptive";

export function genomaLogoPlinthTone(logo?: LogoValue): GenomaLogoPlinthTone {
  if (!logo?.previewUrl) return "neutral";
  if (logo.background === "solid") return "light";
  if (logo.detectionMethod === "vision_bbox" || logo.detectionMethod === "adjusted") {
    return "light";
  }
  return "adaptive";
}

export function genomaV2LogoPlinthClass(logo?: LogoValue): string {
  const tone = genomaLogoPlinthTone(logo);
  if (tone === "light") return "genoma-v2-logo-plinth--light";
  if (tone === "adaptive") return "genoma-v2-logo-plinth--adaptive";
  return "genoma-v2-logo-plinth--neutral";
}

export function genomaNodeLogoWrapClass(logo?: LogoValue): string {
  const tone = genomaLogoPlinthTone(logo);
  if (tone === "light") return "genoma-node-card-preview__logo-wrap--light";
  if (tone === "adaptive") return "genoma-node-card-preview__logo-wrap--adaptive";
  return "";
}
