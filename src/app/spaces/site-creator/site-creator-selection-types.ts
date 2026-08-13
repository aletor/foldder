import type { FreehandObject } from "../FreehandStudio";
import type { LayerParentContainerType } from "./designer-layer-fingerprint";

export type SiteCreatorContainerKind = "groupContainer" | "booleanGroup" | "clippingContainer";

export interface SiteCreatorVisualBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SiteCreatorSelectionIndexEntry {
  layerId: string;
  object: FreehandObject;
  type: string;
  name: string;
  parentLayerId: string | null;
  ancestorIds: string[];
  depth: number;
  siblingIndex: number;
  zOrderPath: number[];
  visualBounds: SiteCreatorVisualBounds;
  visible: boolean;
  locked: boolean;
  /** Visible y con geometría; el click directo puede exigir también opacity > 0. */
  selectableFromCanvas: boolean;
  directClickable: boolean;
  containerKind: SiteCreatorContainerKind | null;
  parentContainerType: LayerParentContainerType;
}

export interface SiteCreatorSelectionIndex {
  entries: SiteCreatorSelectionIndexEntry[];
  byId: Record<string, SiteCreatorSelectionIndexEntry>;
}

export interface SiteCreatorSelectionState {
  selectedIds: string[];
  hoverId: string | null;
  isolationIds: string[];
  overlapCycle: { x: number; y: number; ids: string[]; index: number } | null;
}

export const EMPTY_SITE_CREATOR_SELECTION: SiteCreatorSelectionState = {
  selectedIds: [],
  hoverId: null,
  isolationIds: [],
  overlapCycle: null,
};

export type SiteCreatorSelectionAction =
  | { type: "hover"; layerId: string | null }
  | { type: "click"; layerId: string | null; additive: boolean }
  | { type: "cycle"; layerIdsUnderPoint: string[]; x: number; y: number }
  | { type: "pickExact"; layerId: string }
  | { type: "doubleClickEnter"; containerId: string; childId: string | null }
  | { type: "doubleClickLayer"; layerId: string }
  | { type: "marquee"; layerIds: string[]; additive: boolean }
  | { type: "clear" }
  | { type: "escape" }
  | { type: "enterContainer" }
  | { type: "setIsolation"; isolationIds: string[] }
  | { type: "reconcile"; validIds: string[]; containerIds: string[] };
