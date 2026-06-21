/** Imagen de fondo del mosaico de la librería (misma que al instanciar el nodo / drag preview). */
export const NODE_SIDEBAR_TILE_BACKGROUND_SRC: Record<string, string> = {
  projectAssets: "/logo-folder.png",
  projectBrain: "/assets/nodes/brain-sidebar-bg.png",
  cine: "/assets/nodes/cine-sidebar-bg.png",
  designer: "/assets/nodes/designer-sidebar-bg.png",
  guionista: "/assets/nodes/guionista-sidebar-bg.png",
  inspiration: "/assets/nodes/inspiration-sidebar-bg.png",
  geminiVideo: "/assets/nodes/gemini-video-sidebar-bg.png",
  nanoBanana: "/assets/nodes/nano-banana-sidebar-bg.png",
  photoRoom: "/assets/nodes/photoroom-sidebar-bg.png",
  presenter: "/assets/nodes/presenter-sidebar-bg.png",
  video_editor: "/assets/nodes/video-editor-sidebar-bg.png",
  videoEditor: "/assets/nodes/video-editor-sidebar-bg.png",
  imageCreationAdvanced: "/assets/nodes/nano-banana-sidebar-bg.png",
  vfxGenerator: "/assets/nodes/gemini-video-sidebar-bg.png",
  backgroundRemover: "/nodes/bg-remover-mark.png",
  concatenator: "/nodes/concatenator-mark.png",
  enhancer: "/nodes/enhancer-mark.png",
  imageExport: "/nodes/image-export-mark.png",
  painter: "/nodes/painter-mark.png",
  crop: "/nodes/crop-mark.png",
};

/** ~180px JPEG para pintar mosaicos en sidebar (evita decodificar ~900px en iPad). */
export const NODE_SIDEBAR_TILE_THUMB_SRC: Record<string, string> = {
  projectBrain: "/assets/nodes/sidebar-thumbs/brain-sidebar-thumb.jpg",
  cine: "/assets/nodes/sidebar-thumbs/cine-sidebar-thumb.jpg",
  designer: "/assets/nodes/sidebar-thumbs/designer-sidebar-thumb.jpg",
  guionista: "/assets/nodes/sidebar-thumbs/guionista-sidebar-thumb.jpg",
  inspiration: "/assets/nodes/sidebar-thumbs/inspiration-sidebar-thumb.jpg",
  geminiVideo: "/assets/nodes/sidebar-thumbs/gemini-video-sidebar-thumb.jpg",
  nanoBanana: "/assets/nodes/sidebar-thumbs/nano-banana-sidebar-thumb.jpg",
  photoRoom: "/assets/nodes/sidebar-thumbs/photoroom-sidebar-thumb.jpg",
  presenter: "/assets/nodes/sidebar-thumbs/presenter-sidebar-thumb.jpg",
  video_editor: "/assets/nodes/sidebar-thumbs/video-editor-sidebar-thumb.jpg",
  videoEditor: "/assets/nodes/sidebar-thumbs/video-editor-sidebar-thumb.jpg",
  imageCreationAdvanced: "/assets/nodes/sidebar-thumbs/nano-banana-sidebar-thumb.jpg",
  vfxGenerator: "/assets/nodes/sidebar-thumbs/gemini-video-sidebar-thumb.jpg",
};

const NODE_TYPE_ALIASES: Record<string, string> = {
  videoEditor: "video_editor",
};

export function resolveNodeSidebarTileBackground(nodeType: string): string | null {
  const key = NODE_TYPE_ALIASES[nodeType] ?? nodeType;
  return NODE_SIDEBAR_TILE_BACKGROUND_SRC[key] ?? NODE_SIDEBAR_TILE_BACKGROUND_SRC[nodeType] ?? null;
}

/** Fondo ligero para el mosaico en la librería (sidebar UI). */
export function resolveSidebarTileThumbBackground(nodeType: string): string | null {
  const key = NODE_TYPE_ALIASES[nodeType] ?? nodeType;
  const thumb = NODE_SIDEBAR_TILE_THUMB_SRC[key] ?? NODE_SIDEBAR_TILE_THUMB_SRC[nodeType];
  if (thumb) return thumb;
  return resolveNodeSidebarTileBackground(nodeType);
}
