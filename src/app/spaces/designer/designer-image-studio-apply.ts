import type { FreehandObject } from "../FreehandStudio";
import { mapTree } from "../freehand/group-container";
import type { DesignerPageState } from "./DesignerNode";
import type { DesignerImageStudioResult, DesignerImageStudioSession } from "./designer-image-studio-types";

/** Sustituye el `src` de la capa imagen referenciada por la sesión (árbol anidado). */
export function applyDesignerImageStudioResult(
  pages: DesignerPageState[],
  session: DesignerImageStudioSession,
  result: DesignerImageStudioResult,
): DesignerPageState[] {
  const nextUrl = typeof result.imageUrl === "string" ? result.imageUrl.trim() : "";
  if (!nextUrl) return pages;

  return pages.map((page) => {
    if (page.id !== session.pageId) return page;
    let changed = false;
    const objects = mapTree(page.objects ?? [], (o) => {
      if (o.id !== session.imageObjectId || o.type !== "image") return o;
      changed = true;
      const img = o as FreehandObject & { type: "image"; src: string; imageAssetMeta?: Record<string, unknown> };
      const prevMeta = img.imageAssetMeta;
      return {
        ...img,
        src: nextUrl,
        imageAssetMeta: prevMeta
          ? {
              ...prevMeta,
              generatedByAi: true,
              generatedByAiSource: "gemini-image-generator:designer-modificar-ia",
            }
          : {
              fileName: "modificar-ia.png",
              mimeType: "image/png",
              byteSize: 0,
              pixelWidth: 0,
              pixelHeight: 0,
              generatedByAi: true,
              generatedByAiSource: "gemini-image-generator:designer-modificar-ia",
            },
      };
    });
    return changed ? { ...page, objects } : page;
  });
}
