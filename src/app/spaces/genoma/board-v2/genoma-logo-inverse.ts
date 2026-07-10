import type { GenomaDocument, LogoValue } from "@/lib/genoma/genoma-types";

function confirmedLogo(doc: GenomaDocument): LogoValue | undefined {
  const slot = doc.slots.logo;
  if (slot.status === "resolved" || slot.locked) {
    return slot.value as LogoValue | undefined;
  }
  return undefined;
}

/** Logo inverso: solo SVG o variante negativa explícita (evita PNG opacos con metadata incorrecta). */
export function shouldRenderLogoInverse(doc: GenomaDocument): boolean {
  const logo = confirmedLogo(doc);
  if (!logo?.previewUrl) return false;

  const negativo = logo.variants?.find((variant) => variant.kind === "negativo" && variant.previewUrl);
  if (negativo) return true;

  return logo.format === "svg";
}

export function logoInversePreviewUrl(doc: GenomaDocument): string | undefined {
  const logo = confirmedLogo(doc);
  if (!logo) return undefined;
  const negativo = logo.variants?.find((variant) => variant.kind === "negativo" && variant.previewUrl);
  return negativo?.previewUrl ?? logo.previewUrl;
}
