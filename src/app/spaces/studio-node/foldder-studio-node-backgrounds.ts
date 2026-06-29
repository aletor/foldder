/**
 * Fondos visuales del nodo en canvas (empty-state) — fuente de verdad para cabeceras Studio.
 * Deben coincidir con las imágenes de cada nodo externo en el lienzo.
 */
export const FOLDDER_NODE_STUDIO_BACKGROUND_SRC: Record<string, string> = {
  projectAssets: "/logo-folder.png",
  projectBrain: "/assets/nodes/brain-empty.jpg",
  brain: "/assets/nodes/brain-empty.jpg",
  cine: "/assets/nodes/cine-empty-red.png",
  designer: "/assets/nodes/designer-empty-lime.png",
  guionista: "/assets/nodes/guionista-empty-blue.png",
  dataset: "/assets/nodes/dataset-empty-cyan.png",
  inspiration: "/assets/nodes/inspiration-empty-green.png",
  geminiVideo: "/assets/nodes/gemini-video-empty-blue.png",
  nanoBanana: "/assets/nodes/nano-banana-empty-pink.png",
  presenter: "/assets/nodes/presenter-empty-yellow.jpg",
  video_editor: "/assets/nodes/video-editor-empty.jpg",
  videoEditor: "/assets/nodes/video-editor-empty.jpg",
  imageCreationAdvanced: "/assets/nodes/nano-banana-empty-pink.png",
  vfxGenerator: "/assets/nodes/gemini-video-empty-blue.png",
  exportMultimedia: "/nodes/enhancer-bg.png",
  export_multimedia: "/nodes/enhancer-bg.png",
  urlImage: "/nodes/url-image-bg.png",
  painter: "/nodes/painter-bg.png",
  crop: "/nodes/crop-bg.png",
  lightroom: "/nodes/enhancer-bg.png",
};

const NODE_TYPE_ALIASES: Record<string, string> = {
  brain: "projectBrain",
  videoEditor: "video_editor",
};

const DEFAULT_STUDIO_BACKGROUND = "/assets/nodes/brain-empty.jpg";

export function resolveFoldderNodeStudioBackground(nodeType?: string | null): string {
  if (!nodeType?.trim()) return DEFAULT_STUDIO_BACKGROUND;
  const trimmed = nodeType.trim();
  const canonical = NODE_TYPE_ALIASES[trimmed] ?? trimmed;
  return FOLDDER_NODE_STUDIO_BACKGROUND_SRC[canonical] ?? FOLDDER_NODE_STUDIO_BACKGROUND_SRC[trimmed] ?? DEFAULT_STUDIO_BACKGROUND;
}
