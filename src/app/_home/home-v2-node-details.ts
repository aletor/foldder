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
        line: "**Estilo y ADN de marca** con Brandkit.",
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

const NODE_DETAIL_CONTENT_EN: Record<string, HomeV2NodeDetailContent> = {
  designer: {
    intro: "Multi-page **editorial design**: layouts, type and images ready to **export or present**.",
    features: [
      { id: "multipage", line: "**Documents and slides** with editorial layout.", icon: "layout" },
      { id: "control", line: "**Type, shapes and guides** under full control.", icon: "pen" },
      { id: "presenter", line: "Move to an interactive **Presenter** instantly.", icon: "presentation" },
    ],
  },
  nanoBanana: {
    intro:
      "**Generate or edit** images from text, references or a base image, with **brand style and consistency**.",
    features: [
      { id: "generate", line: "**Generate or transform** images on the fly.", icon: "wand" },
      { id: "references", line: "Prompts, **references** and a base image.", icon: "images" },
      { id: "brain", line: "**Brand style and DNA** with Brandkit.", icon: "brain" },
    ],
  },
  mediaDescriber: {
    intro: "**Analyze an image** and turn it into a reusable description as a **prompt or creative reference**.",
    features: [
      { id: "prompt", line: "Turn the image into a **reusable prompt**.", icon: "scanText" },
      { id: "style", line: "Reads **composition, light and atmosphere**.", icon: "eye" },
      { id: "flow", line: "**Connect the workflow** to regenerate or adapt.", icon: "workflow" },
    ],
  },
  geminiVideo: {
    intro: "Create **clips** from text, an image or frames: control **camera, motion, style** and duration.",
    features: [
      { id: "source", line: "**Text or image** to a clip in seconds.", icon: "clapperboard" },
      { id: "direction", line: "**Camera, motion and style** under control.", icon: "camera" },
      { id: "edit", line: "Ready to **edit and export**.", icon: "scissors" },
    ],
  },
  videoEditor: {
    intro: "**Editing** on a timeline: arrange clips, audio and subtitles into a **final exportable video**.",
    features: [
      { id: "timeline", line: "**Timeline** with video, audio and subtitles.", icon: "timeline" },
      { id: "edit", line: "Trim and adjust **volume and fades**.", icon: "sliders" },
      { id: "export", line: "Export an **MP4** ready to publish.", icon: "download" },
    ],
  },
};

export function resolveNodeDetailContent(
  nodeType: string,
  language: "es" | "en" = "es",
): HomeV2NodeDetailContent | null {
  if (language === "en") return NODE_DETAIL_CONTENT_EN[nodeType] ?? NODE_DETAIL_CONTENT[nodeType] ?? null;
  return NODE_DETAIL_CONTENT[nodeType] ?? null;
}
