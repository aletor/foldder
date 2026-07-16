import type { LogoValue } from "@/lib/brandkit/brand-kit-types";

export type BrandKitLogoPlinthTone = "neutral" | "light" | "adaptive";
export type BrandKitLogoPlinthMode = "auto" | "light" | "dark" | "checker";

export function brandKitLogoPlinthTone(logo?: LogoValue): BrandKitLogoPlinthTone {
  if (!logo?.previewUrl) return "neutral";
  if (logo.background === "solid") return "light";
  if (logo.detectionMethod === "vision_bbox" || logo.detectionMethod === "adjusted") {
    return "light";
  }
  return "adaptive";
}

export function brandKitV2LogoPlinthClass(logo?: LogoValue): string {
  const tone = brandKitLogoPlinthTone(logo);
  if (tone === "light") return "brand-kit-v2-logo-plinth--light";
  if (tone === "adaptive") return "brand-kit-v2-logo-plinth--adaptive";
  return "brand-kit-v2-logo-plinth--neutral";
}

export function brandKitNodeLogoWrapClass(logo?: LogoValue): string {
  const tone = brandKitLogoPlinthTone(logo);
  if (tone === "light") return "brandKit-node-face__logo--light";
  if (tone === "adaptive") return "brandKit-node-face__logo--adaptive";
  return "";
}

export function brandKitV2LogoPlinthClassForMode(
  logo: LogoValue | undefined,
  mode: BrandKitLogoPlinthMode,
): string {
  if (mode === "light") return "brand-kit-v2-logo-plinth--light";
  if (mode === "dark") return "brand-kit-v2-logo-plinth--adaptive";
  if (mode === "checker") return "brand-kit-v2-logo-plinth--checker";
  return brandKitV2LogoPlinthClass(logo);
}
