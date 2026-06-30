import React from "react";
import type { FreehandObject, ImageObject, RectObject, TextObject } from "@/app/spaces/FreehandStudio";
import {
  bindingKind,
  isPendingDesignerBinding,
  normalizeDesignerFolderEntityId,
} from "@/app/spaces/designer/designer-dataset-binding";
import { walkDesignerObjectTree } from "@/app/spaces/designer/designer-object-tree";
import { forEachTree, isGroupContainer } from "@/app/spaces/freehand/group-container";
import { normalizePopulateEntityId } from "./populate-entity-groups";

/** IDs de objetos raíz cuyo render debe pulsar (carpeta o capas legacy). */
export function populatePulseObjectIdsForEntity(
  objects: FreehandObject[],
  entityLabels: Map<string, string>,
  entityId: string | null,
): Set<string> {
  if (!entityId) return new Set();

  let folderId: string | undefined;
  forEachTree(objects, (obj) => {
    if (folderId) return;
    if (!isGroupContainer(obj)) return;
    const name = obj.name?.trim();
    if (!name) return;
    if (normalizeDesignerFolderEntityId(name) !== entityId) return;
    if (!entityLabels.has(entityId)) return;
    folderId = obj.id;
  });
  if (folderId) return new Set([folderId]);

  const folderEntityIds = new Set<string>();
  forEachTree(objects, (obj) => {
    if (!isGroupContainer(obj)) return;
    const name = obj.name?.trim();
    if (!name) return;
    const eid = normalizeDesignerFolderEntityId(name);
    if (entityLabels.has(eid)) folderEntityIds.add(eid);
  });

  const ids = new Set<string>();
  walkDesignerObjectTree(objects, (obj, ctx) => {
    if (ctx.folderEntityId && folderEntityIds.has(ctx.folderEntityId)) return;
    const binding = obj._designerDatasetBinding;
    if (!binding || !isPendingDesignerBinding(binding)) return;
    if (!bindingKind(binding, obj)) return;
    const eid = ctx.folderEntityId ?? normalizePopulateEntityId(binding.slotLabel);
    if (eid !== entityId) return;
    ids.add(obj.id);
  });
  return ids;
}

function populateObjectContentFingerprint(obj: FreehandObject): string | null {
  if (obj.type === "text" || obj.type === "textOnPath") {
    return `t:${(obj as TextObject).text ?? ""}`;
  }
  if (obj.type === "image") {
    return `i:${(obj as ImageObject).src ?? ""}`;
  }
  if (obj.type === "rect" && (obj as RectObject).isImageFrame) {
    const src = (obj as RectObject).imageFrameContent?.src;
    if (src) return `if:${src}`;
  }
  return null;
}

export function collectPopulateObjectContentFingerprints(objects: FreehandObject[]): Map<string, string> {
  const map = new Map<string, string>();
  forEachTree(objects, (obj) => {
    const fp = populateObjectContentFingerprint(obj);
    if (fp) map.set(obj.id, fp);
  });
  return map;
}

export function diffPopulateContentFingerprints(
  prev: Map<string, string>,
  next: Map<string, string>,
): Set<string> {
  const changed = new Set<string>();
  for (const [id, fp] of next) {
    const old = prev.get(id);
    if (old != null && old !== fp) changed.add(id);
  }
  return changed;
}

function nestedChildLists(obj: FreehandObject): FreehandObject[][] {
  if (isGroupContainer(obj)) return [obj.children];
  if (obj.type === "booleanGroup") return [obj.children];
  if (obj.type === "clippingContainer") return [obj.content];
  return [];
}

/** Objeto id → carpeta de entidad que lo contiene (si aplica). */
export function buildPopulateObjectEntityFolderMap(
  objects: FreehandObject[],
  entityLabels: Map<string, string>,
): Map<string, string> {
  const out = new Map<string, string>();

  function walk(list: FreehandObject[], activeFolderId: string | null): void {
    for (const obj of list) {
      let folderId = activeFolderId;
      if (isGroupContainer(obj)) {
        const name = obj.name?.trim();
        if (name) {
          const eid = normalizeDesignerFolderEntityId(name);
          if (entityLabels.has(eid)) folderId = obj.id;
        }
      }
      if (folderId) out.set(obj.id, folderId);
      for (const children of nestedChildLists(obj)) {
        walk(children, folderId);
      }
    }
  }

  walk(objects, null);
  return out;
}

/** Parpadea la carpeta entera (o la capa raíz legacy) cuando cambia texto/imagen interior. */
export function resolvePopulateContentBlinkRootIds(
  objects: FreehandObject[],
  entityLabels: Map<string, string>,
  changedIds: Iterable<string>,
): Set<string> {
  const folderMap = buildPopulateObjectEntityFolderMap(objects, entityLabels);
  const roots = new Set<string>();
  for (const id of changedIds) {
    roots.add(folderMap.get(id) ?? id);
  }
  return roots;
}

/** Stack wrap: bounce estable en capa exterior; parpadeo reinicia solo en capa interior. */
export function buildPopulateStackWrap(
  pulseObjectIds: ReadonlySet<string>,
  selectionAnimKey: number,
  blinkObjectIds: ReadonlySet<string>,
  blinkGeneration: number,
): ((obj: FreehandObject, node: React.ReactNode) => React.ReactNode) | undefined {
  if (pulseObjectIds.size === 0 && blinkObjectIds.size === 0) return undefined;
  return (obj, node) => {
    const pulse = pulseObjectIds.has(obj.id);
    const contentBlink = blinkObjectIds.has(obj.id);
    if (!pulse && !contentBlink) return node;

    let wrapped = node;

    if (contentBlink) {
      wrapped = (
        <g
          key={`populate-content-blink-${obj.id}-${blinkGeneration}`}
          className="populate-studio-entity-blink-once"
        >
          {wrapped}
        </g>
      );
    }

    if (pulse) {
      wrapped = (
        <g
          key={`populate-select-blink-${obj.id}-${selectionAnimKey}`}
          className="populate-studio-entity-blink-once"
        >
          {wrapped}
        </g>
      );
      wrapped = (
        <g key={obj.id} className="populate-studio-entity-pulse-wrap">
          {wrapped}
        </g>
      );
    } else {
      wrapped = <g key={obj.id}>{wrapped}</g>;
    }

    return wrapped;
  };
}
