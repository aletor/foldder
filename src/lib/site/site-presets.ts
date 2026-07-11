import { createManualBlock, createSiteId } from "./site-defaults";
import type { Block, SiteFactoryPresetId } from "./site-types";

export const SITE_FACTORY_PRESETS: Array<{ id: SiteFactoryPresetId; label: string; description: string }> = [
  { id: "hero", label: "Hero", description: "Titular, subtítulo y CTA principal" },
  { id: "manifesto", label: "Manifiesto", description: "Texto editorial con reveal" },
  { id: "gallery", label: "Galería", description: "Grid de imágenes duotono" },
  { id: "voice", label: "Voz", description: "Specimens tipográficos editoriales" },
  { id: "cta", label: "CTA / Contacto", description: "Llamada a la acción y contacto" },
  { id: "footer", label: "Footer", description: "Pie con clearspace de marca" },
  { id: "empty", label: "Sección vacía", description: "Contenedor listo para componer" },
];

const PRESET_DEFAULT_LABELS: Record<SiteFactoryPresetId, string> = {
  hero: "Hero",
  manifesto: "Manifiesto",
  gallery: "Galería",
  voice: "Voz",
  cta: "Contacto",
  footer: "Footer",
  empty: "Sección",
};

export function defaultLabelForPreset(presetId: SiteFactoryPresetId): string {
  return PRESET_DEFAULT_LABELS[presetId];
}

export function createDemoTextMediaSection(): Block {
  const sectionId = createSiteId();
  return {
    id: sectionId,
    type: "text",
    source: { kind: "manual" },
    content: {
      role: "h1",
      value: "Foldder Site",
      align: "center",
      maxWidth: "narrow",
    },
    layout: { bleed: "contained", split: { pattern: "1-1" } },
    motion: { mode: "inherit" },
    children: [
      createManualBlock("text", {
        role: "body",
        value: "Una página es una pila de bloques. El tema responde todas las demás preguntas.",
        maxWidth: "narrow",
      }),
      createManualBlock("media", {
        mediaType: "image",
        src: "",
        ratio: "16:9",
        fit: "cover",
        duotone: false,
        caption: "Vista previa",
      }),
    ],
  };
}

/** Factory section = root Block (serialized preset, spec §1). */
export function createFactorySection(presetId: SiteFactoryPresetId): Block {
  const sectionId = createSiteId();

  switch (presetId) {
    case "hero":
      return {
        id: sectionId,
        type: "text",
        source: { kind: "manual" },
        content: {
          role: "h1",
          value: "Tu marca, en una página",
          align: "center",
          maxWidth: "narrow",
        },
        layout: { bleed: "full", split: { pattern: "1" } },
        motion: { mode: "inherit" },
        children: [
          createManualBlock("text", {
            role: "body",
            value: "Compila tu ADN en web. Conecta BrandKit o escribe aquí.",
            align: "center",
            maxWidth: "narrow",
          }),
          createManualBlock("button", {
            label: "Empezar",
            target: { kind: "anchor", value: "#contacto" },
            variant: "primary",
          }),
        ],
      };
    case "manifesto":
      return {
        id: sectionId,
        type: "text",
        source: { kind: "manual" },
        content: {
          role: "h2",
          value: "Manifiesto",
          maxWidth: "narrow",
        },
        layout: { bleed: "contained" },
        motion: { mode: "inherit" },
        children: [
          createManualBlock("text", {
            role: "body",
            value: "Escribe aquí la esencia de la marca en tres frases claras.",
            maxWidth: "narrow",
          }),
        ],
      };
    case "gallery":
      return {
        id: sectionId,
        type: "collection",
        source: { kind: "manual" },
        content: {
          view: "grid",
          itemTemplate: createManualBlock("media", {
            mediaType: "image",
            src: "",
            ratio: "4:3",
            fit: "cover",
            duotone: true,
          }),
          items: [{ src: "" }, { src: "" }, { src: "" }],
          overflow: "grow",
          viewOptions: { columns: 3, density: "normal" },
        },
        layout: { bleed: "contained" },
        motion: { mode: "inherit" },
      };
    case "voice":
      return {
        id: sectionId,
        type: "text",
        source: { kind: "manual" },
        content: { role: "h2", value: "Voz", maxWidth: "normal" },
        layout: { bleed: "contained" },
        motion: { mode: "inherit" },
        children: [
          createManualBlock("text", { role: "quote", value: "La voz de marca aparecerá aquí.", maxWidth: "narrow" }),
        ],
      };
    case "cta":
      return {
        id: sectionId,
        type: "text",
        source: { kind: "manual" },
        content: { role: "h2", value: "Contacto", align: "center", maxWidth: "narrow" },
        layout: { bleed: "contained" },
        motion: { mode: "inherit" },
        children: [
          createManualBlock("button", {
            label: "Escríbenos",
            target: { kind: "mail", value: "hola@marca.com" },
            variant: "primary",
          }),
        ],
      };
    case "footer":
      return {
        id: sectionId,
        type: "text",
        source: { kind: "manual" },
        content: { role: "caption", value: "© Marca · Foldder Site", align: "center", maxWidth: "full" },
        layout: { bleed: "contained" },
        motion: { mode: "inherit" },
      };
    case "empty":
    default:
      return {
        id: sectionId,
        type: "text",
        source: { kind: "manual" },
        content: { role: "body", value: "", maxWidth: "normal" },
        layout: { bleed: "contained", split: { pattern: "1" } },
        motion: { mode: "inherit" },
      };
  }
}
