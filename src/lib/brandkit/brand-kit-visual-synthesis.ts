import type { GalleryValue, VisualWorldValue } from "./brand-kit-types";
import { galleryRefIds, galleryUsefulCount } from "./brand-kit-gallery-filter";
import { inferImageMediumFromText } from "./brand-kit-visual-style";

function harvestContexts(gallery: GalleryValue): string {
  return gallery.harvested
    .map((item) => `${item.provenance?.detail ?? ""} ${item.previewUrl ?? item.assetId}`)
    .join(" ")
    .toLowerCase();
}

/** Síntesis visual determinista a partir de la galería cosechada (≥6 imágenes útiles). */
export function buildVisualWorldFromGallery(
  gallery: GalleryValue,
  brandName?: string,
): VisualWorldValue | null {
  const useful = galleryUsefulCount(gallery);
  if (useful < 6) return null;

  const context = harvestContexts(gallery);
  const brand = brandName?.trim() || "la marca";

  const moodTags: string[] = [];
  if (/cine|cinema|film|narrativ|director|foto|frame/i.test(context)) moodTags.push("cinematográfico");
  if (/portrait|retrato|person|people|face|rostro|actor/i.test(context)) moodTags.push("íntimo");
  if (/dark|night|nocturn|shadow|contraste|dramatic/i.test(context)) moodTags.push("contrastado");
  if (/story|historia|scene|escena|still/i.test(context)) moodTags.push("narrativo");
  if (!moodTags.length) moodTags.push("editorial", "expresivo", "contrastado");

  const visualTraits = [
    /portrait|retrato|face|rostro|person/i.test(context)
      ? "Primeros planos y presencia humana con carga emocional."
      : "Composiciones con foco narrativo y tensión visual.",
    /light|luz|dramatic|warm|cálid/i.test(context)
      ? "Luz direccional o cálida que modela volumen y atmósfera."
      : "Iluminación con intención dramática, no plana ni genérica.",
    "Contraste y color con criterio emocional, no decorativo.",
    "Escenas que funcionan como fotogramas de una historia.",
  ];

  const limits = [
    "Evitar stock corporativo o imágenes sin narrativa.",
    "Evitar estética publicitaria plana o excesivamente limpia.",
    "Evitar composiciones sin tensión ni personaje visual.",
    "Evitar clichés de agencia tradicional.",
  ];

  const refs = galleryRefIds(gallery);
  const imageMedium = inferImageMediumFromText(context);
  const imageStyleTags: string[] = [];
  if (imageMedium === "illustration" || /vector|flat|hand-?drawn/i.test(context)) {
    imageStyleTags.push("ilustración editorial");
  }
  if (imageMedium === "collage" || /collage|cut paper/i.test(context)) {
    imageStyleTags.push("collage editorial");
  }
  if (imageMedium === "photography" || /cine|cinema|film|foto/i.test(context)) {
    imageStyleTags.push("luz cinematográfica");
  }

  return {
    summary: `${brand} construye un mundo visual ${moodTags.slice(0, 3).join(", ")}: referencias con rostros, luz con intención, contraste y escenas que parecen fotogramas. Analizado a partir de ${useful} imágenes cosechadas.`,
    moodTags: moodTags.slice(0, 5),
    visualTraits: visualTraits.slice(0, 5),
    limits,
    imageMedium,
    imageStyleTags: imageStyleTags.slice(0, 4),
    evidence: [],
    galleryRefs: refs,
  };
}
