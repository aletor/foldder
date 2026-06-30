import type { FreehandObject } from "../FreehandStudio";
import { normalizeDesignerFolderEntityId } from "./designer-dataset-binding";

/** Contexto de carpeta (groupContainer con nombre) para campos anidados. */
export interface DesignerFolderContext {
  folderLabel?: string;
  folderEntityId?: string;
}

export function nextDesignerFolderContext(
  parent: DesignerFolderContext,
  container: FreehandObject,
): DesignerFolderContext {
  if (container.type !== "groupContainer") return parent;
  const name = container.name?.trim();
  if (!name) return parent;
  return { folderLabel: name, folderEntityId: normalizeDesignerFolderEntityId(name) };
}

/**
 * Recorre el árbol de objetos (carpetas, clips, grupos booleanos) con contexto de carpeta contenedora.
 */
export function walkDesignerObjectTree(
  objects: FreehandObject[] | undefined,
  visit: (obj: FreehandObject, ctx: DesignerFolderContext) => void,
  parentCtx: DesignerFolderContext = {},
): void {
  for (const o of objects ?? []) {
    visit(o, parentCtx);
    if (o.type === "booleanGroup" || o.type === "groupContainer") {
      const childCtx = o.type === "groupContainer" ? nextDesignerFolderContext(parentCtx, o) : parentCtx;
      walkDesignerObjectTree(o.children, visit, childCtx);
    } else if (o.type === "clippingContainer") {
      visit(o.mask as unknown as FreehandObject, parentCtx);
      walkDesignerObjectTree(o.content, visit, parentCtx);
    }
  }
}

/**
 * Mapea el árbol aplicando `mapOne` a cada objeto (incluye mask/content de clips y children de carpetas).
 */
export function mapDesignerObjectTree(
  objects: FreehandObject[],
  mapOne: (obj: FreehandObject, ctx: DesignerFolderContext) => FreehandObject,
  parentCtx: DesignerFolderContext = {},
): FreehandObject[] {
  return objects.map((o) => {
    let next = mapOne(o, parentCtx);
    if (next.type === "booleanGroup" || next.type === "groupContainer") {
      const grp = next;
      const childCtx =
        next.type === "groupContainer" ? nextDesignerFolderContext(parentCtx, next) : parentCtx;
      const children = mapDesignerObjectTree(grp.children, mapOne, childCtx);
      if (children.some((c, i) => c !== grp.children[i])) {
        next = { ...grp, children } as FreehandObject;
      }
    } else if (next.type === "clippingContainer") {
      const clip = next;
      const mask = mapOne(clip.mask as unknown as FreehandObject, parentCtx) as unknown as typeof clip.mask;
      const content = mapDesignerObjectTree(clip.content, mapOne, parentCtx);
      if (mask !== clip.mask || content.some((c, i) => c !== clip.content[i])) {
        next = { ...clip, mask, content };
      }
    }
    return next;
  });
}
