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
  title: string;
  description: string;
  icon: HomeV2NodeDetailFeatureIcon;
};

export type HomeV2NodeDetailContent = {
  intro: string;
  features: readonly HomeV2NodeDetailFeature[];
};

const NODE_DETAIL_CONTENT: Record<string, HomeV2NodeDetailContent> = {
  photoRoom: {
    intro:
      "PhotoRoom es la cápsula de composición visual de Foldder: permite combinar imágenes en un lienzo, trabajar por capas, retocar, aplicar máscaras y modificar elementos con IA dentro del mismo flujo creativo.",
    features: [
      {
        title: "Capas conectadas",
        description: "Cada imagen entra como una capa editable.",
        icon: "layers",
      },
      {
        title: "Retoque visual",
        description: "Pincel, clonado, selecciones, máscaras y estilos.",
        icon: "brush",
      },
      {
        title: "IA integrada",
        description: "Modifica elementos sin salir del proyecto.",
        icon: "sparkles",
      },
    ],
  },
  designer: {
    intro:
      "Designer es la cápsula de diseño editorial de Foldder: permite crear piezas visuales, documentos multipágina, layouts, textos, imágenes y composiciones con control profesional, listas para exportar o convertir en presentación.",
    features: [
      {
        title: "Diseño multipágina",
        description: "Crea documentos, slides, piezas de marca o layouts editoriales.",
        icon: "layout",
      },
      {
        title: "Control visual",
        description: "Trabaja con textos, imágenes, formas, páginas, guías y composición.",
        icon: "pen",
      },
      {
        title: "Conectado a Presenter",
        description: "Convierte tus diseños en presentaciones interactivas y compartibles.",
        icon: "presentation",
      },
    ],
  },
  nanoBanana: {
    intro:
      "Image Creation es la cápsula de creación de imagen de Foldder: permite generar o editar imágenes desde texto, referencias visuales o una imagen base, con control sobre estilo, formato, resolución y coherencia de marca.",
    features: [
      {
        title: "Genera y edita",
        description: "Crea imágenes desde cero o transforma imágenes existentes.",
        icon: "wand",
      },
      {
        title: "Usa referencias",
        description: "Trabaja con prompts, imágenes base y referencias visuales.",
        icon: "images",
      },
      {
        title: "Conectada al Brain",
        description: "Mantiene estilo, paleta y ADN de marca en cada resultado.",
        icon: "brain",
      },
    ],
  },
  mediaDescriber: {
    intro:
      "Image Describer es la cápsula de lectura visual de Foldder: analiza una imagen y la convierte en una descripción útil para reutilizarla como prompt, referencia creativa o punto de partida para nuevas piezas.",
    features: [
      {
        title: "Imagen a prompt",
        description: "Transforma una referencia visual en texto reutilizable.",
        icon: "scanText",
      },
      {
        title: "Entiende el estilo",
        description: "Describe composición, colores, luz, objetos y atmósfera.",
        icon: "eye",
      },
      {
        title: "Conecta el flujo",
        description: "Permite regenerar, adaptar o transformar imágenes desde una referencia.",
        icon: "workflow",
      },
    ],
  },
  geminiVideo: {
    intro:
      "Video Generator es la cápsula de vídeo de Foldder: permite crear clips desde texto, imágenes o frames inicial/final, definiendo duración, formato, cámara, movimiento, estilo visual y atmósfera.",
    features: [
      {
        title: "Texto o imagen a vídeo",
        description: "Genera clips desde prompts, referencias o frames.",
        icon: "clapperboard",
      },
      {
        title: "Dirección visual",
        description: "Controla cámara, luz, movimiento, estilo y duración.",
        icon: "camera",
      },
      {
        title: "Listo para montar",
        description: "Envía los vídeos al flujo de edición y exportación.",
        icon: "scissors",
      },
    ],
  },
  videoEditor: {
    intro:
      "Video Editor es la cápsula de montaje de Foldder: permite ordenar clips, imágenes, audio y subtítulos en una línea de tiempo para crear el vídeo final listo para exportar.",
    features: [
      {
        title: "Línea de tiempo",
        description: "Monta vídeos, imágenes, audio y subtítulos.",
        icon: "timeline",
      },
      {
        title: "Control de edición",
        description: "Recorta, mueve, duplica, divide, ajusta volumen y fundidos.",
        icon: "sliders",
      },
      {
        title: "Render final",
        description: "Exporta la pieza terminada en MP4.",
        icon: "download",
      },
    ],
  },
};

export function resolveNodeDetailContent(nodeType: string): HomeV2NodeDetailContent | null {
  return NODE_DETAIL_CONTENT[nodeType] ?? null;
}
