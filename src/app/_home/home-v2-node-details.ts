export type HomeV2NodeDetailFeatureIcon =
  | "layers"
  | "brush"
  | "sparkles"
  | "layout"
  | "pen"
  | "presentation"
  | "clapperboard"
  | "camera"
  | "scissors"
  | "timeline"
  | "sliders"
  | "download"
  | "wand"
  | "images"
  | "brain"
  | "scanText"
  | "eye"
  | "workflow";

export type HomeV2NodeDetailFeature = {
  id: string;
  /** Breve línea descriptiva; envuelve en **texto** las palabras a resaltar. */
  line: string;
  icon: HomeV2NodeDetailFeatureIcon;
};

export type HomeV2NodeDetailContent = {
  /** Párrafo breve; envuelve en **texto** las palabras a resaltar. */
  intro: string;
  features: readonly HomeV2NodeDetailFeature[];
};

const NODE_DETAIL_CONTENT: Record<string, HomeV2NodeDetailContent> = {
  photoRoom: {
    intro:
      "**Composición visual** en un lienzo: **capas**, retoque, máscaras e **IA** en el mismo flujo.",
    features: [
      {
        id: "layers",
        line: "Cada imagen entra como **capa editable**.",
        icon: "layers",
      },
      {
        id: "retouch",
        line: "**Pincel, máscaras y estilos** en el mismo flujo.",
        icon: "brush",
      },
      {
        id: "ai",
        line: "**IA integrada** sin salir del proyecto.",
        icon: "sparkles",
      },
    ],
  },
  designer: {
    intro:
      "**Diseño editorial** multipágina: layouts, textos e imágenes listos para **exportar o presentar**.",
    features: [
      {
        id: "multipage",
        line: "**Documentos y slides** con layout editorial.",
        icon: "layout",
      },
      {
        id: "control",
        line: "**Textos, formas y guías** bajo control total.",
        icon: "pen",
      },
      {
        id: "presenter",
        line: "Pasa a **Presenter** interactivo al instante.",
        icon: "presentation",
      },
    ],
  },
  nanoBanana: {
    intro:
      "**Genera o edita** imágenes desde texto, referencias o imagen base, con **estilo y coherencia de marca**.",
    features: [
      {
        id: "generate",
        line: "**Genera o transforma** imágenes al vuelo.",
        icon: "wand",
      },
      {
        id: "references",
        line: "Prompts, **referencias** e imagen base.",
        icon: "images",
      },
      {
        id: "brain",
        line: "**Estilo y ADN de marca** con Brain.",
        icon: "brain",
      },
    ],
  },
  mediaDescriber: {
    intro:
      "**Analiza una imagen** y la convierte en descripción reutilizable como **prompt o referencia creativa**.",
    features: [
      {
        id: "prompt",
        line: "Convierte la imagen en **prompt reutilizable**.",
        icon: "scanText",
      },
      {
        id: "style",
        line: "Lee **composición, luz y atmósfera**.",
        icon: "eye",
      },
      {
        id: "flow",
        line: "**Conecta el flujo** para regenerar o adaptar.",
        icon: "workflow",
      },
    ],
  },
  geminiVideo: {
    intro:
      "Crea **clips** desde texto, imagen o frames: controla **cámara, movimiento, estilo** y duración.",
    features: [
      {
        id: "source",
        line: "**Texto o imagen** a clip en segundos.",
        icon: "clapperboard",
      },
      {
        id: "direction",
        line: "**Cámara, movimiento y estilo** bajo control.",
        icon: "camera",
      },
      {
        id: "edit",
        line: "Listo para **montar y exportar**.",
        icon: "scissors",
      },
    ],
  },
  videoEditor: {
    intro:
      "**Montaje** en timeline: ordena clips, audio y subtítulos hasta el **vídeo final exportable**.",
    features: [
      {
        id: "timeline",
        line: "**Timeline** con vídeo, audio y subtítulos.",
        icon: "timeline",
      },
      {
        id: "edit",
        line: "Recorta y ajusta **volumen y fundidos**.",
        icon: "sliders",
      },
      {
        id: "export",
        line: "Exporta en **MP4** listo para publicar.",
        icon: "download",
      },
    ],
  },
};

export function resolveNodeDetailContent(nodeType: string): HomeV2NodeDetailContent | null {
  return NODE_DETAIL_CONTENT[nodeType] ?? null;
}
