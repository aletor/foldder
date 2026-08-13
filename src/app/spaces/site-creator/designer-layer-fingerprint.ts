import type { FreehandObject } from "../FreehandStudio";
import type { DesignerPageState } from "../designer/DesignerNode";
import { stableStringify } from "./designer-source-hash";

export type LayerParentContainerType =
  | "root"
  | "groupContainer"
  | "booleanGroup"
  | "clippingContainer"
  | "clippingContent";

export interface LayerHierarchyInfo {
  layerId: string;
  parentId: string | null;
  path: string[];
  siblingIndex: number;
  parentContainerType: LayerParentContainerType;
}

export interface LayerUiDescriptor {
  layerId: string;
  name: string;
  type: string;
  label: string;
}

function stripNestedStructure(obj: FreehandObject): Record<string, unknown> {
  const clone = JSON.parse(JSON.stringify(obj)) as FreehandObject & Record<string, unknown>;
  const stripped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(clone)) {
    if (key === "children") continue;
    stripped[key] = value;
  }
  if (clone.type === "clippingContainer") {
    delete stripped.content;
    if (clone.mask && typeof clone.mask === "object") {
      const mask = clone.mask as FreehandObject;
      stripped.mask = { id: mask.id, type: mask.type };
    }
  }
  return stripped;
}

/** Fingerprint visual: objeto relevante para render, sin hijos ni árbol anidado. */
export function layerVisualFingerprint(obj: FreehandObject): string {
  return stableStringify(stripNestedStructure(obj));
}

/** Fingerprint jerárquico: padre, path, orden y tipo de contenedor. */
export function layerHierarchyFingerprint(info: LayerHierarchyInfo): string {
  return stableStringify(info);
}

export function layerUiDescriptor(obj: FreehandObject): LayerUiDescriptor {
  const name = typeof obj.name === "string" && obj.name.trim() ? obj.name.trim() : obj.id;
  return {
    layerId: obj.id,
    name,
    type: obj.type,
    label: `${name} (${obj.type})`,
  };
}

function indexRootObjects(objects: FreehandObject[], out: Map<string, LayerHierarchyInfo>): void {
  objects.forEach((obj, index) => {
    out.set(obj.id, {
      layerId: obj.id,
      parentId: null,
      path: [],
      siblingIndex: index,
      parentContainerType: "root",
    });
  });
}

function indexChildren(
  children: FreehandObject[],
  parent: FreehandObject,
  parentPath: string[],
  parentContainerType: LayerParentContainerType,
  out: Map<string, LayerHierarchyInfo>,
): void {
  const path = [...parentPath, parent.id];
  children.forEach((child, index) => {
    out.set(child.id, {
      layerId: child.id,
      parentId: parent.id,
      path,
      siblingIndex: index,
      parentContainerType,
    });
  });
}

/** Índice jerárquico determinista de capas en una página. */
export function indexSnapshotLayerHierarchy(
  page: Pick<DesignerPageState, "objects">,
): Map<string, LayerHierarchyInfo> {
  const out = new Map<string, LayerHierarchyInfo>();
  const objects = page.objects ?? [];
  indexRootObjects(objects, out);

  const visit = (items: FreehandObject[], parentPath: string[]): void => {
    for (const obj of items) {
      const info = out.get(obj.id);
      const path = info?.path ?? parentPath;

      if (obj.type === "groupContainer" || obj.type === "booleanGroup") {
        const childType = obj.type;
        indexChildren(obj.children ?? [], obj, path, childType, out);
        visit(obj.children ?? [], [...path, obj.id]);
      } else if (obj.type === "clippingContainer") {
        const mask = obj.mask as unknown as FreehandObject;
        if (mask?.id) {
          out.set(mask.id, {
            layerId: mask.id,
            parentId: obj.id,
            path: [...path, obj.id],
            siblingIndex: 0,
            parentContainerType: "clippingContainer",
          });
        }
        indexChildren(obj.content ?? [], obj, [...path, obj.id], "clippingContent", out);
        visit(obj.content ?? [], [...path, obj.id]);
      }
    }
  };

  visit(objects, []);
  return out;
}

export function layerObjectMap(page: Pick<DesignerPageState, "objects">): Map<string, FreehandObject> {
  const map = new Map<string, FreehandObject>();
  const walk = (items: FreehandObject[]): void => {
    for (const obj of items) {
      map.set(obj.id, obj);
      if (obj.type === "groupContainer" || obj.type === "booleanGroup") {
        walk(obj.children ?? []);
      } else if (obj.type === "clippingContainer") {
        const mask = obj.mask as unknown as FreehandObject;
        if (mask?.id) map.set(mask.id, mask);
        walk(obj.content ?? []);
      }
    }
  };
  walk(page.objects ?? []);
  return map;
}
