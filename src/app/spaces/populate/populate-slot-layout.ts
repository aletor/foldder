import type { DesignerPageState } from "@/app/spaces/designer/DesignerNode";
import {
  bindingKind,
  isPendingDesignerBinding,
  populatePendingSlotKey,
} from "@/app/spaces/designer/designer-dataset-binding";
import { transformDesignerPageObjectsDeep } from "@/app/spaces/designer/designer-dataset-page";
import { walkDesignerObjectTree } from "@/app/spaces/designer/designer-object-tree";
import { syncDesignerPageTextFrameLayouts } from "@/app/spaces/designer/designer-page-text-frame-sync";
import type { FreehandObject } from "@/app/spaces/FreehandStudio";
import {
  duplicateDesignerPageState,
  resolveSlideKey,
} from "@/app/spaces/designer/designer-studio-pure";
import {
  applyDesignerSlotValuesToPage,
  type DesignerSlotValueMap,
} from "@/app/spaces/loop/loop-designer-form";
import { stripDatasetBindingsFromObject } from "@/app/spaces/loop/loop-designer-materialize";
import type { PopulateSlotLayoutOverride } from "./populate-types";

export interface PopulateSlotLayoutDefaults {
  x: number;
  y: number;
  fontSize?: number;
  kind: "text" | "image";
}

export const LAYOUT_STEP_PX = 1;

function collectSlotLayoutBases(
  templatePage: DesignerPageState,
): Map<string, PopulateSlotLayoutDefaults> {
  const map = new Map<string, PopulateSlotLayoutDefaults>();
  walkDesignerObjectTree(templatePage.objects, (obj, ctx) => {
    const binding = obj._designerDatasetBinding;
    if (!binding || !isPendingDesignerBinding(binding)) return;
    const kind = bindingKind(binding, obj);
    if (!kind) return;
    const slotKey = populatePendingSlotKey(binding, kind, ctx.folderEntityId);
    if (!slotKey || map.has(slotKey)) return;
    map.set(slotKey, {
      x: obj.x,
      y: obj.y,
      fontSize:
        obj.type === "text" || obj.type === "textOnPath"
          ? (obj as { fontSize?: number }).fontSize
          : undefined,
      kind,
    });
  });
  return map;
}

export function readPopulateSlotLayoutDefaults(
  templatePages: DesignerPageState[],
  slotKey: string,
): PopulateSlotLayoutDefaults | null {
  for (const page of templatePages) {
    const found = collectSlotLayoutBases(page).get(slotKey);
    if (found) return found;
  }
  return null;
}

function applyOverridesOnPage(
  page: DesignerPageState,
  templatePage: DesignerPageState,
  overrides: Record<string, PopulateSlotLayoutOverride>,
): DesignerPageState {
  const bases = collectSlotLayoutBases(templatePage);
  if (Object.keys(overrides).length === 0) return page;

  return transformDesignerPageObjectsDeep(page, (obj, ctx) => {
    const binding = obj._designerDatasetBinding;
    if (!binding || !isPendingDesignerBinding(binding)) return obj;
    const kind = bindingKind(binding, obj);
    if (!kind) return obj;
    const slotKey = populatePendingSlotKey(binding, kind, ctx.folderEntityId);
    if (!slotKey) return obj;
    const override = overrides[slotKey];
    if (!override) return obj;
    const base = bases.get(slotKey);
    if (!base) return obj;

    const dx = override.offsetX ?? 0;
    const dy = override.offsetY ?? 0;
    let next: FreehandObject = {
      ...obj,
      x: base.x + dx,
      y: base.y + dy,
    };

    if (
      override.fontSize !== undefined &&
      (obj.type === "text" || obj.type === "textOnPath")
    ) {
      next = { ...next, fontSize: override.fontSize } as FreehandObject;
    }

    return next;
  });
}

/** Congela plantilla + valores + ajustes de posición/tamaño del Studio Populate. */
export function freezePopulateTemplatePages(
  templatePages: DesignerPageState[],
  slotValues: DesignerSlotValueMap,
  layoutOverrides?: Record<string, PopulateSlotLayoutOverride>,
): DesignerPageState[] {
  const overrides = layoutOverrides ?? {};

  return templatePages.map((tpl) => {
    const slideKey = resolveSlideKey(tpl);
    const slideName = tpl.slideName;
    const dup = duplicateDesignerPageState(tpl);
    const resolved = applyDesignerSlotValuesToPage(dup, slotValues);
    const synced = syncDesignerPageTextFrameLayouts(resolved);
    const withLayout = applyOverridesOnPage(synced, tpl, overrides);
    const relayouted =
      Object.keys(overrides).length > 0
        ? syncDesignerPageTextFrameLayouts(withLayout)
        : withLayout;
    const objects = (relayouted.objects ?? []).map(stripDatasetBindingsFromObject);
    const frozen: DesignerPageState = {
      ...relayouted,
      objects,
      slideKey,
      slideName,
    };
    delete frozen.datasetLoopListId;
    delete frozen.datasetLoopCardId;
    return frozen;
  });
}

export function patchSlotLayoutOverride(
  overrides: Record<string, PopulateSlotLayoutOverride> | undefined,
  slotKey: string,
  patch: Partial<PopulateSlotLayoutOverride>,
): Record<string, PopulateSlotLayoutOverride> | undefined {
  const prev = overrides?.[slotKey] ?? {};
  const next: PopulateSlotLayoutOverride = {
    offsetX: patch.offsetX ?? prev.offsetX,
    offsetY: patch.offsetY ?? prev.offsetY,
    fontSize: patch.fontSize ?? prev.fontSize,
  };

  const hasOffsetX = next.offsetX !== undefined && next.offsetX !== 0;
  const hasOffsetY = next.offsetY !== undefined && next.offsetY !== 0;
  const hasFont = next.fontSize !== undefined;

  const map = { ...(overrides ?? {}) };
  if (!hasOffsetX && !hasOffsetY && !hasFont) {
    delete map[slotKey];
  } else {
    map[slotKey] = {
      ...(hasOffsetX ? { offsetX: next.offsetX } : {}),
      ...(hasOffsetY ? { offsetY: next.offsetY } : {}),
      ...(hasFont ? { fontSize: next.fontSize } : {}),
    };
  }

  return Object.keys(map).length > 0 ? map : undefined;
}
