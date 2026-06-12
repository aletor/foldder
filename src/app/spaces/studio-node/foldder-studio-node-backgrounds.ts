/**
 * Fondos visuales del nodo en canvas (empty-state) — fuente de verdad para cabeceras Studio.
 * Deben coincidir con las imágenes de cada nodo externo en el lienzo.
 */
export const FOLDDER_NODE_STUDIO_BACKGROUND_SRC: Record<string, string> = {
  projectBrain: "/assets/nodes/brain-empty.jpg",
  brain: "/assets/nodes/brain-empty.jpg",
  cine: "/assets/nodes/cine-empty-red.png",
  designer: "/assets/nodes/designer-empty-lime.png",
  guionista: "/assets/nodes/guionista-empty-blue.png",
  inspiration: "/assets/nodes/inspiration-empty-green.png",
  geminiVideo: "/assets/nodes/gemini-video-empty-blue.png",
  nanoBanana: "/assets/nodes/nano-banana-empty-pink.png",
  photoRoom: "/assets/nodes/photoroom-empty-purple.jpg",
  presenter: "/assets/nodes/presenter-empty-yellow.jpg",
  video_editor: "/assets/nodes/video-editor-empty.jpg",
  videoEditor: "/assets/nodes/video-editor-empty.jpg",
  imageCreationAdvanced: "/assets/nodes/nano-banana-empty-pink.png",
  vfxGenerator: "/assets/nodes/gemini-video-empty-blue.png",
  exportMultimedia: "/assets/nodes/video-editor-empty.jpg",
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
