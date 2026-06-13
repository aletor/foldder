/** Imagen de fondo del mosaico de la librería (misma que al instanciar el nodo). */
export const NODE_SIDEBAR_TILE_BACKGROUND_SRC: Record<string, string> = {
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
};

const NODE_TYPE_ALIASES: Record<string, string> = {
  videoEditor: "video_editor",
};

export function resolveNodeSidebarTileBackground(nodeType: string): string | null {
  const key = NODE_TYPE_ALIASES[nodeType] ?? nodeType;
  return NODE_SIDEBAR_TILE_BACKGROUND_SRC[key] ?? NODE_SIDEBAR_TILE_BACKGROUND_SRC[nodeType] ?? null;
}
