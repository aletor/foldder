export const FOLDDER_OPEN_STUDIO_EVENT = "foldder:open-studio";
export const FOLDDER_STUDIO_OPENED_EVENT = "foldder:studio-opened";
export const FOLDDER_STUDIO_CLOSED_EVENT = "foldder:studio-closed";
export const FOLDDER_CLOSE_STUDIO_EVENT = "foldder:close-studio";

/** Compatibilidad con los primeros adaptadores añadidos antes de normalizar el namespace. */
export const FOLDDER_LEGACY_OPEN_NODE_STUDIO_EVENT = "foldder-open-node-studio";
export const FOLDDER_LEGACY_CLOSE_NODE_STUDIO_EVENT = "foldder-close-node-studio";

export type FoldderStudioEventDetail = {
  nodeId?: string;
  nodeType?: string;
  fileId?: string;
  appId?: string;
};

export function dispatchFoldderStudioEvent(name: string, detail: FoldderStudioEventDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(name, { detail }));
}
