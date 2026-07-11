import type { BrandKitDocument, VisualWorldValue, VoiceValue } from "./brand-kit-types";
import { slotValue } from "./brand-kit-gallery-tone-utils";

export function buildGalleryToneExplanation(doc: BrandKitDocument, stylePrompt?: string): string {
  const visual = slotValue<VisualWorldValue>(doc, "visualWorld");
  const voice = slotValue<VoiceValue>(doc, "voice");
  const brand = doc.brandName?.value?.trim() || "La marca";

  const parts: string[] = [];

  if (visual?.summary?.trim()) {
    parts.push(visual.summary.trim());
  } else if (visual?.moodTags?.length) {
    parts.push(`Tono visual ${visual.moodTags.slice(0, 4).join(", ")}.`);
  }

  if (visual?.visualTraits?.length) {
    parts.push(visual.visualTraits.slice(0, 2).join(" "));
  }

  if (voice?.summary?.trim()) {
    parts.push(`La imagen debe resonar con una voz ${voice.descriptors?.slice(0, 2).join(" y ") || "coherente con la marca"}.`);
  }

  if (!parts.length && stylePrompt) {
    const excerpt = stylePrompt.length > 220 ? `${stylePrompt.slice(0, 217)}…` : stylePrompt;
    parts.push(excerpt);
  }

  if (!parts.length) {
    return `${brand}: imágenes editoriales coherentes con paleta, tipografía y mundo visual compilados. Sin texto ni logos incrustados.`;
  }

  return parts.join(" ");
}
