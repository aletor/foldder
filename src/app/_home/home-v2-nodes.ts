import { getNodeCardBackgroundColor } from "@/app/spaces/node-card-palette";
import { FOLDDER_NODE_STUDIO_BACKGROUND_SRC } from "@/app/spaces/studio-node/foldder-studio-node-backgrounds";
import { resolveNodeDetailContent, type HomeV2NodeDetailContent } from "./home-v2-node-details";

export type HomeV2NodeCard = {
  label: string;
  description: string;
  type: string;
  tabColor: string;
  imageSrc: string;
  detailImageSrc: string;
  detailContent: HomeV2NodeDetailContent | null;
  heroVideoSrc: string | null;
};

const NODE_TYPE_ALIASES: Record<string, string> = {
  videoEditor: "video_editor",
};

const EXTRA_NODE_IMAGE_SRC: Record<string, string> = {
  layerizer: "/nodes/bg-remover-bg.png",
  mediaDescriber: "/nodes/describer-bg.png",
};

const NODE_DETAIL_IMAGE_SRC: Record<string, string> = {
  photoRoom: "/home-v2/node-detail-photoroom-ref.png",
  designer: "/home-v2/node-detail-designer-ref.png",
  nanoBanana: "/home-v2/node-detail-image-creation-ref.png",
  geminiVideo: "/home-v2/node-detail-video-generator-ref.png",
  videoEditor: "/home-v2/node-detail-video-editor-ref.png",
  mediaDescriber: "/home-v2/node-detail-image-describer-ref.png",
};

const NODE_HERO_VIDEO_SRC: Record<string, string> = {
  photoRoom: "/home-v2/hero/tazas.mp4",
  nanoBanana: "/home-v2/hero/trusted-access.mp4",
  geminiVideo: "/home-v2/hero/video-post-oaro-3.mp4",
  cine: "/home-v2/hero/oaro-id-secure.mp4",
  vfxGenerator: "/home-v2/hero/der2.mp4",
  designer: "/home-v2/hero/main.mp4",
};

/** 12 nodos con imagen de fondo — una sola pila en home_v2. */
export const HOME_V2_NODE_CARDS: readonly { label: string; description: string; type: string }[] = [
  {
    label: "Inspiration",
    description: "Busca **referencias visuales** desde prompt o imagen y devuelve una **selección curada**.",
    type: "inspiration",
  },
  {
    label: "Guionista",
    description: "Convierte ideas, notas o **Brain** en **posts, guiones, slides y campañas** versionados.",
    type: "guionista",
  },
  {
    label: "Image Creation",
    description: "**Genera imagen** desde **prompt y referencias** visuales conectadas.",
    type: "nanoBanana",
  },
  {
    label: "PhotoRoom",
    description: "**Retoque y composición** de imagen con varias entradas conectadas.",
    type: "photoRoom",
  },
  {
    label: "Layerizer",
    description: "Descompone una imagen en **capas** con **fondo limpio**.",
    type: "layerizer",
  },
  {
    label: "Image Describer",
    description: "**Analiza una imagen** y la convierte en **descripción reutilizable** como prompt.",
    type: "mediaDescriber",
  },
  {
    label: "Cine",
    description: "**Preproducción** audiovisual: guion, reparto, **storyboard** y prompts de frames.",
    type: "cine",
  },
  {
    label: "Video Generator",
    description: "**Genera vídeo** con prompt y **frames** opcionales.",
    type: "geminiVideo",
  },
  {
    label: "VFX",
    description: "**Efectos VFX** sobre vídeo con prompt e **imagen de referencia**.",
    type: "vfxGenerator",
  },
  {
    label: "Video Editor",
    description: "**Timeline** editable con vídeo, imágenes y **audio generado por prompt**.",
    type: "videoEditor",
  },
  {
    label: "Designer",
    description: "**Diseño completo**: vectores, páginas, textos y marcos de imagen.",
    type: "designer",
  },
  {
    label: "Presenter",
    description: "Convierte **Designer** en **diapositivas** listas para presentar.",
    type: "presenter",
  },
];

function resolveNodeImageSrc(nodeType: string): string {
  const canonical = NODE_TYPE_ALIASES[nodeType] ?? nodeType;
  const extra = EXTRA_NODE_IMAGE_SRC[canonical] ?? EXTRA_NODE_IMAGE_SRC[nodeType];
  if (extra) return extra;
  return (
    FOLDDER_NODE_STUDIO_BACKGROUND_SRC[canonical] ??
    FOLDDER_NODE_STUDIO_BACKGROUND_SRC[nodeType] ??
    "/assets/nodes/brain-empty.jpg"
  );
}

export function buildHomeV2NodeCards(): HomeV2NodeCard[] {
  return HOME_V2_NODE_CARDS.map(({ label, description, type }) => {
    const imageSrc = resolveNodeImageSrc(type);
    return {
      label,
      description,
      type,
      tabColor: getNodeCardBackgroundColor(type),
      imageSrc,
      detailImageSrc: NODE_DETAIL_IMAGE_SRC[type] ?? imageSrc,
      detailContent: resolveNodeDetailContent(type),
      heroVideoSrc: NODE_HERO_VIDEO_SRC[type] ?? null,
    };
  });
}

/** Colores de tarjeta de los nodos con imagen — reutilizados en home_v2 (p. ej. Color Wave). */
export const HOME_V2_NODE_WAVE_COLORS = HOME_V2_NODE_CARDS.map(({ type }) => getNodeCardBackgroundColor(type));
