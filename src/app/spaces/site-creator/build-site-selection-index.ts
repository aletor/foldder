import type { FreehandObject } from "../FreehandStudio";
import { flattenObjectsForGradientDefs, getVisualAABB } from "../FreehandStudio";
import type { DesignerPageState } from "../designer/DesignerNode";
import type { LayerParentContainerType } from "./designer-layer-fingerprint";
import type {
  SiteCreatorContainerKind,
  SiteCreatorSelectionIndex,
  SiteCreatorSelectionIndexEntry,
  SiteCreatorVisualBounds,
} from "./site-creator-selection-types";

function containerKindOf(obj: FreehandObject): SiteCreatorContainerKind | null {
  if (obj.type === "groupContainer" || obj.type === "booleanGroup" || obj.type === "clippingContainer") {
    return obj.type;
  }
  return null;
}

function layerName(obj: FreehandObject): string {
  return typeof obj.name === "string" && obj.name.trim() ? obj.name.trim() : obj.id;
}

function visualBoundsOf(obj: FreehandObject, flat: FreehandObject[]): SiteCreatorVisualBounds {
  const aabb = getVisualAABB(obj, flat);
  return { x: aabb.x, y: aabb.y, width: aabb.w, height: aabb.h };
}

function isClipMaskChild(parentContainerType: LayerParentContainerType, obj: FreehandObject): boolean {
  return parentContainerType === "clippingContainer" && obj.type !== "clippingContainer";
}

function isSelectableFromCanvas(
  obj: FreehandObject,
  parentContainerType: LayerParentContainerType,
  bounds: SiteCreatorVisualBounds,
): boolean {
  if (obj.visible === false) return false;
  if (obj.type === "adjustmentLayer") return false;
  if (isClipMaskChild(parentContainerType, obj)) return false;
  if (!(bounds.width > 0 && bounds.height > 0)) return false;
  return true;
}

function compareZOrderPath(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    if (a[i] !== b[i]) return a[i]! - b[i]!;
  }
  return a.length - b.length;
}

function walkLayerTree(
  objects: FreehandObject[],
  parentLayerId: string | null,
  ancestorIds: string[],
  parentContainerType: LayerParentContainerType,
  zPrefix: number[],
  depth: number,
  flat: FreehandObject[],
  out: SiteCreatorSelectionIndexEntry[],
  siblingOffset = 0,
): void {
  objects.forEach((obj, index) => {
    const siblingIndex = index + siblingOffset;
    const zOrderPath = [...zPrefix, siblingIndex];
    const visualBounds = visualBoundsOf(obj, flat);
    const selectableFromCanvas = isSelectableFromCanvas(obj, parentContainerType, visualBounds);
    const opacity = typeof obj.opacity === "number" ? obj.opacity : 1;
    const entry: SiteCreatorSelectionIndexEntry = {
      layerId: obj.id,
      object: obj,
      type: obj.type,
      name: layerName(obj),
      parentLayerId,
      ancestorIds,
      depth,
      siblingIndex,
      zOrderPath,
      visualBounds,
      visible: obj.visible !== false,
      locked: Boolean(obj.locked),
      selectableFromCanvas,
      directClickable: selectableFromCanvas && opacity > 0,
      containerKind: containerKindOf(obj),
      parentContainerType,
    };
    out.push(entry);

    if (obj.type === "groupContainer" || obj.type === "booleanGroup") {
      walkLayerTree(
        obj.children ?? [],
        obj.id,
        [...ancestorIds, obj.id],
        obj.type,
        zOrderPath,
        depth + 1,
        flat,
        out,
      );
    } else if (obj.type === "clippingContainer") {
      const mask = obj.mask as unknown as FreehandObject | undefined;
      if (mask?.id) {
        walkLayerTree(
          [mask],
          obj.id,
          [...ancestorIds, obj.id],
          "clippingContainer",
          zOrderPath,
          depth + 1,
          flat,
          out,
        );
      }
      walkLayerTree(
        obj.content ?? [],
        obj.id,
        [...ancestorIds, obj.id],
        "clippingContent",
        zOrderPath,
        depth + 1,
        flat,
        out,
        mask?.id ? 1 : 0,
      );
    }
  });
}

export function buildSiteSelectionIndex(
  page: Pick<DesignerPageState, "objects"> | null | undefined,
): SiteCreatorSelectionIndex {
  const objects = page?.objects ?? [];
  const flat = flattenObjectsForGradientDefs(objects);
  const entries: SiteCreatorSelectionIndexEntry[] = [];
  walkLayerTree(objects, null, [], "root", [], 0, flat, entries);
  const byId: Record<string, SiteCreatorSelectionIndexEntry> = {};
  for (const entry of entries) byId[entry.layerId] = entry;
  return { entries, byId };
}

export function isolationUnits(
  index: SiteCreatorSelectionIndex,
  isolationIds: string[],
): SiteCreatorSelectionIndexEntry[] {
  const parentId = isolationIds.length > 0 ? isolationIds[isolationIds.length - 1]! : null;
  return index.entries.filter((entry) => {
    if (parentId == null) return entry.parentLayerId == null;
    if (entry.parentLayerId !== parentId) return false;
    if (entry.parentContainerType === "clippingContainer" && entry.containerKind == null) return false;
    return true;
  });
}

export function sortFrontToBack(entries: SiteCreatorSelectionIndexEntry[]): SiteCreatorSelectionIndexEntry[] {
  return [...entries].sort((a, b) => compareZOrderPath(b.zOrderPath, a.zOrderPath));
}

export function isContainerEntry(entry: SiteCreatorSelectionIndexEntry | undefined): boolean {
  return Boolean(entry?.containerKind);
}
