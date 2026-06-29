import type { FreehandObject, TextObject, TextOnPathObject } from "../FreehandStudio";

export const LAYER_PANEL_TEXT_SNIPPET_LEN = 4;

/** Primeros caracteres del contenido para la fila del panel de capas. */
export function textLayerNameSnippet(text: string, maxLen = LAYER_PANEL_TEXT_SNIPPET_LEN): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (!flat) return "";
  if (flat.length <= maxLen) return flat;
  return `${flat.slice(0, maxLen)}…`;
}

export function layerPanelDisplayName(
  o: FreehandObject,
  designerStoryMap?: ReadonlyMap<string, string> | null,
): string {
  if (o.type === "text") {
    const t = o as TextObject;
    let body = t.text ?? "";
    if (t.isTextFrame && t.storyId && designerStoryMap?.has(t.storyId)) {
      body = designerStoryMap.get(t.storyId) ?? body;
    }
    const snippet = textLayerNameSnippet(body);
    if (snippet) return snippet;
  } else if (o.type === "textOnPath") {
    const snippet = textLayerNameSnippet((o as TextOnPathObject).text ?? "");
    if (snippet) return snippet;
  }
  return o.name;
}

/** Las capas de texto muestran el contenido; el resto se puede renombrar en el panel. */
export function canRenameLayerInPanel(o: FreehandObject): boolean {
  if (o.photoRoomInputSlot) return false;
  return o.type !== "text" && o.type !== "textOnPath";
}
