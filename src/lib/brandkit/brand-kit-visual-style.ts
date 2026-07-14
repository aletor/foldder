import type { VisualWorldValue } from "./brand-kit-types";
import type { GalleryGenerateCategory } from "./brand-kit-gallery-plan";
import { PLACES_LOCATION_FIRST_CORE, PLACES_LOCATION_FIRST_FINISH } from "./brand-kit-gallery-places-guidance";

export const BRAND_IMAGE_MEDIA = [
  "photography",
  "illustration",
  "collage",
  "3d_render",
  "graphic_design",
  "mixed",
] as const;

export type BrandImageMedium = (typeof BRAND_IMAGE_MEDIA)[number];

const MEDIUM_ALIASES: Record<string, BrandImageMedium> = {
  photo: "photography",
  photograph: "photography",
  fotografia: "photography",
  fotografía: "photography",
  foto: "photography",
  photographic: "photography",
  photorealistic: "photography",
  illustration: "illustration",
  illustrated: "illustration",
  illustracion: "illustration",
  ilustracion: "illustration",
  ilustración: "illustration",
  vector: "illustration",
  drawing: "illustration",
  dibujo: "illustration",
  collage: "collage",
  "cut-paper": "collage",
  cut_paper: "collage",
  mixed_media: "collage",
  "3d": "3d_render",
  "3d_render": "3d_render",
  render: "3d_render",
  cgi: "3d_render",
  graphic: "graphic_design",
  graphic_design: "graphic_design",
  design: "graphic_design",
  mixed: "mixed",
  mixto: "mixed",
};

export function normalizeBrandImageMedium(value?: string | null): BrandImageMedium {
  const raw = value?.trim().toLowerCase();
  if (!raw) return "photography";
  const compact = raw.replace(/\s+/g, "_");
  if ((BRAND_IMAGE_MEDIA as readonly string[]).includes(compact)) {
    return compact as BrandImageMedium;
  }
  return MEDIUM_ALIASES[compact] ?? MEDIUM_ALIASES[raw] ?? "photography";
}

export function brandImageMediumLabelEs(medium: BrandImageMedium): string {
  switch (medium) {
    case "photography":
      return "Fotografía";
    case "illustration":
      return "Ilustración";
    case "collage":
      return "Collage";
    case "3d_render":
      return "Render 3D";
    case "graphic_design":
      return "Diseño gráfico";
    case "mixed":
      return "Mixto";
    default:
      return "Fotografía";
  }
}

type VisualStyleInput = Pick<
  VisualWorldValue,
  "imageMedium" | "imageStyleTags" | "summary" | "visualTraits" | "moodTags"
>;

export function resolveBrandImageStyle(visual?: VisualStyleInput): {
  medium: BrandImageMedium;
  styleTags: string[];
} {
  const styleTags = (visual?.imageStyleTags ?? []).map((tag) => tag.trim()).filter(Boolean);
  if (visual?.imageMedium) {
    return { medium: normalizeBrandImageMedium(visual.imageMedium), styleTags };
  }
  const corpus = [
    visual?.summary ?? "",
    ...(visual?.visualTraits ?? []),
    ...(visual?.moodTags ?? []),
    ...styleTags,
  ].join(" ");
  return { medium: inferImageMediumFromText(corpus), styleTags };
}

export function inferImageMediumFromText(text: string): BrandImageMedium {
  const ctx = text.toLowerCase();
  const score: Record<BrandImageMedium, number> = {
    photography: 0,
    illustration: 0,
    collage: 0,
    "3d_render": 0,
    graphic_design: 0,
    mixed: 0,
  };

  if (/photograph|fotograf|photoreal|editorial photo|lens|camera|macro photo|still life photo/i.test(ctx)) {
    score.photography += 3;
  }
  if (/illustrat|ilustraci|vector|flat design|hand-?drawn|dibujo|line art|watercolor|acuarela/i.test(ctx)) {
    score.illustration += 3;
  }
  if (/collage|cut paper|mixed media|papel recortado|montaje/i.test(ctx)) {
    score.collage += 3;
  }
  if (/\b3d\b|render|cgi|blender|octane|unreal/i.test(ctx)) {
    score["3d_render"] += 3;
  }
  if (/graphic design|diseño gráfico|poster|layout|tipograf/i.test(ctx)) {
    score.graphic_design += 3;
  }
  if (/mixto|mixed medium|mezcla de medios/i.test(ctx)) {
    score.mixed += 2;
  }

  const ranked = (Object.entries(score) as Array<[BrandImageMedium, number]>).sort((a, b) => b[1] - a[1]);
  const [topMedium, topScore] = ranked[0];
  const [, secondScore] = ranked[1] ?? ["photography", 0];
  if (topScore === 0) return "photography";
  if (topMedium !== "mixed" && topScore > 0 && secondScore > 0 && topScore - secondScore <= 1) {
    return "mixed";
  }
  return topMedium;
}

export function formatImageStyleForContext(visual?: VisualWorldValue): string {
  const { medium, styleTags } = resolveBrandImageStyle(visual);
  const label = brandImageMediumLabelEs(medium);
  const tags = styleTags.length ? ` (${styleTags.join(", ")})` : "";
  return `${label}${tags}`;
}

export function brandImageStyleLead(brand: string, visual?: VisualWorldValue): string {
  const { medium, styleTags } = resolveBrandImageStyle(visual);
  const tagHint = styleTags.length ? `, ${styleTags.slice(0, 3).join(", ")}` : "";
  switch (medium) {
    case "illustration":
      return `Brand editorial illustration for ${brand}${tagHint}.`;
    case "collage":
      return `Brand editorial collage for ${brand}${tagHint}.`;
    case "3d_render":
      return `Brand 3D rendered imagery for ${brand}${tagHint}.`;
    case "graphic_design":
      return `Brand graphic design imagery for ${brand}${tagHint}.`;
    case "mixed":
      return `Brand mixed-media visual for ${brand}${tagHint}.`;
    default:
      return `Brand editorial photo for ${brand}${tagHint}.`;
  }
}

export function brandImageStyleRenderClause(visual?: VisualWorldValue): string {
  const { medium, styleTags } = resolveBrandImageStyle(visual);
  const tagSuffix = styleTags.length ? ` Style cues: ${styleTags.slice(0, 4).join(", ")}.` : "";
  switch (medium) {
    case "illustration":
      return `Illustrated brand imagery with consistent line, color, and texture treatment.${tagSuffix} No text overlays, no logos.`;
    case "collage":
      return `Editorial collage with cut-paper, texture layers, and cohesive composition.${tagSuffix} No text overlays, no logos.`;
    case "3d_render":
      return `3D rendered brand imagery with clean materials, lighting, and form.${tagSuffix} No text overlays, no logos.`;
    case "graphic_design":
      return `Graphic design-led brand imagery with deliberate layout and shape language.${tagSuffix} No text overlays, no logos.`;
    case "mixed":
      return `Mixed-media brand imagery faithful to harvested references.${tagSuffix} No text overlays, no logos.`;
    default:
      return `Photorealistic brand imagery, no text overlays, no logos.${tagSuffix}`;
  }
}

export function gallerySceneLead(hint: string, medium: BrandImageMedium): string {
  const trimmed = hint.trim();
  if (!trimmed) return "";
  const verb =
    medium === "illustration"
      ? "Scene to illustrate"
      : medium === "collage"
        ? "Scene to compose as collage"
        : medium === "3d_render"
          ? "Scene to render in 3D"
          : medium === "graphic_design"
            ? "Scene to design graphically"
            : medium === "mixed"
              ? "Scene to depict"
              : "Scene to photograph";
  return `${verb}: ${trimmed}.`;
}

type CategoryCores = { core: string; finish: string };

function photographyCores(category: GalleryGenerateCategory): CategoryCores {
  switch (category) {
    case "textures":
      return {
        core: [
          "Macro material texture photograph filling the entire frame.",
          "Extreme close-up of one physical surface only.",
          "Show roughness, micro-grain, and specular response (matte, satin, or glossy).",
          "No people, no hands, no faces, no whole objects, no rooms, no technology scenes, no UI screens, no holograms, no text, no logos.",
        ].join(" "),
        finish: "Photorealistic macro texture, shallow depth of field.",
      };
    case "places":
      return {
        core: PLACES_LOCATION_FIRST_CORE,
        finish: `Photorealistic location plate, wide or medium establishing shot, cinematic natural or architectural light. ${PLACES_LOCATION_FIRST_FINISH}`,
      };
    case "people_mood":
      return {
        core: [
          "Editorial lifestyle photograph with human presence.",
          "Focus on emotion, expression, posture, and lighting described in the brief.",
          "Photorealistic portrait or candid moment — not generic stock-corporate.",
          "No logos, no readable text.",
        ].join(" "),
        finish: "Photorealistic, cinematic natural light.",
      };
    case "objects":
      return {
        core: [
          "Editorial still life product photograph.",
          "Objects only — no people, no hands in frame.",
          "Clean surfaces, material detail, shallow depth of field.",
          "No logos, no readable text.",
        ].join(" "),
        finish: "Photorealistic still life, controlled studio or editorial lighting.",
      };
    default:
      return {
        core: [
          "Editorial brand atmosphere photograph.",
          "Synthesizes palette, light, and mood from the brief.",
          "No logos, no readable text.",
        ].join(" "),
        finish: "Photorealistic editorial atmosphere, cohesive brand light and color.",
      };
  }
}

function illustrationCores(category: GalleryGenerateCategory): CategoryCores {
  switch (category) {
    case "textures":
      return {
        core: [
          "Macro material texture illustration filling the entire frame.",
          "One surface with visible grain, stroke, or pattern treatment.",
          "No people, no objects, no rooms, no UI, no text, no logos.",
        ].join(" "),
        finish: "Illustrated macro texture with consistent line and color treatment.",
      };
    case "places":
      return {
        core: PLACES_LOCATION_FIRST_CORE,
        finish: `Illustrated location plate with deliberate perspective, light, and spatial depth. ${PLACES_LOCATION_FIRST_FINISH}`,
      };
    case "people_mood":
      return {
        core: [
          "Editorial lifestyle illustration with human presence.",
          "Focus on emotion, expression, posture, and lighting from the brief.",
          "Consistent illustration style — not photorealistic, not stock-corporate.",
          "No logos, no readable text.",
        ].join(" "),
        finish: "Illustrated portrait or candid moment with cohesive stroke and color.",
      };
    case "objects":
      return {
        core: [
          "Editorial still life product illustration.",
          "Objects only — no people, no hands.",
          "Clear shapes, material cues, controlled composition.",
          "No logos, no readable text.",
        ].join(" "),
        finish: "Illustrated still life with consistent brand illustration treatment.",
      };
    default:
      return {
        core: [
          "Editorial brand atmosphere illustration.",
          "Synthesizes palette, light, and mood from the brief.",
          "No logos, no readable text.",
        ].join(" "),
        finish: "Illustrated atmospheric composition with cohesive style.",
      };
  }
}

function collageCores(category: GalleryGenerateCategory): CategoryCores {
  const noPeople = category === "textures" ? "No people, no portraits, no crowds." : "";
  return {
    core: [
      "Editorial collage composition with cut-paper, texture layers, and mixed media.",
      category === "textures"
        ? "Macro material collage filling the frame — surface and grain only."
        : category === "places"
          ? PLACES_LOCATION_FIRST_CORE
          : "Cohesive collage layout faithful to the brief scene.",
      category === "places" ? "" : "No UI screens, no holograms, no readable text, no logos.",
      noPeople,
    ]
      .filter(Boolean)
      .join(" "),
    finish: `Cut-paper and mixed-media collage with tactile layering. ${category === "places" ? PLACES_LOCATION_FIRST_FINISH : ""}`.trim(),
  };
}

function render3dCores(category: GalleryGenerateCategory): CategoryCores {
  return {
    core: [
      "3D rendered brand imagery with clean materials and lighting.",
      category === "textures"
        ? "Macro material surface render filling the frame."
        : category === "places"
          ? PLACES_LOCATION_FIRST_CORE
          : "Faithful to the brief subject and composition.",
      category === "places" ? "" : "No UI screens, no holograms, no readable text, no logos.",
    ]
      .filter(Boolean)
      .join(" "),
    finish: `High-quality 3D render with coherent materials and soft studio or cinematic light.${category === "places" ? ` ${PLACES_LOCATION_FIRST_FINISH}` : ""}`,
  };
}

function graphicDesignCores(category: GalleryGenerateCategory): CategoryCores {
  return {
    core: [
      "Graphic design-led brand composition with deliberate shapes and layout.",
      category === "textures"
        ? "Abstract material pattern or texture as graphic motif."
        : category === "places"
          ? PLACES_LOCATION_FIRST_CORE
          : "Clear focal hierarchy faithful to the brief.",
      category === "places" ? "" : "No readable text, no logos, no UI mockups.",
    ].join(" "),
    finish: `Bold graphic design composition with flat or semi-flat color fields.${category === "places" ? ` ${PLACES_LOCATION_FIRST_FINISH}` : ""}`,
  };
}

function mixedCores(category: GalleryGenerateCategory, styleTags: string[]): CategoryCores {
  const photo = photographyCores(category);
  const tagHint = styleTags.length ? ` Blend: ${styleTags.slice(0, 3).join(", ")}.` : "";
  return {
    core: photo.core,
    finish: `${photo.finish}${tagHint}`,
  };
}

export function galleryCategoryPromptCores(
  category: GalleryGenerateCategory,
  visual?: VisualWorldValue,
): CategoryCores {
  const { medium, styleTags } = resolveBrandImageStyle(visual);
  switch (medium) {
    case "illustration":
      return illustrationCores(category);
    case "collage":
      return collageCores(category);
    case "3d_render":
      return render3dCores(category);
    case "graphic_design":
      return graphicDesignCores(category);
    case "mixed":
      return mixedCores(category, styleTags);
    default:
      return photographyCores(category);
  }
}

export function galleryBriefMediumInstruction(visual?: VisualWorldValue): string {
  const { medium, styleTags } = resolveBrandImageStyle(visual);
  const label = brandImageMediumLabelEs(medium);
  const tags = styleTags.length ? ` Tratamiento: ${styleTags.join(", ")}.` : "";
  return `Medio artístico dominante: ${label}.${tags} Los promptHint deben pedir ese medio, no fotografía por defecto si el ADN es otro.`;
}
