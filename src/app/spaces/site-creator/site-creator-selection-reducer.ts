import { collapseContainerDescendants } from "./site-creator-hit-test";
import { expandLayerIdsWithDesignerGroups, designerGroupMemberIds } from "./site-creator-designer-group-id";
import type {
  SiteCreatorSelectionAction,
  SiteCreatorSelectionIndex,
  SiteCreatorSelectionState,
} from "./site-creator-selection-types";
import type { SiteBlueprintV1 } from "./site-creator-types";

const POINT_EPS = 0.75;

function uniqueKeepOrder(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}


function samePoint(
  cycle: SiteCreatorSelectionState["overlapCycle"],
  x: number,
  y: number,
  ids: string[],
): boolean {
  if (!cycle) return false;
  if (Math.abs(cycle.x - x) > POINT_EPS || Math.abs(cycle.y - y) > POINT_EPS) return false;
  if (cycle.ids.length !== ids.length) return false;
  return cycle.ids.every((id, i) => id === ids[i]);
}

export function reduceSiteCreatorSelection(
  state: SiteCreatorSelectionState,
  action: SiteCreatorSelectionAction,
  index: SiteCreatorSelectionIndex,
  blueprint?: SiteBlueprintV1 | null,
): SiteCreatorSelectionState {
  switch (action.type) {
    case "hover":
      return { ...state, hoverId: action.layerId };

    case "click": {
      if (!action.layerId) {
        return { ...state, selectedIds: [], hoverId: null, overlapCycle: null };
      }
      const groupMembers = designerGroupMemberIds(action.layerId, index, blueprint);
      if (action.additive) {
        const togglingOff = groupMembers.every((id) => state.selectedIds.includes(id));
        const nextIds = togglingOff
          ? state.selectedIds.filter((id) => !groupMembers.includes(id))
          : uniqueKeepOrder([...state.selectedIds, ...groupMembers]);
        return {
          ...state,
          selectedIds: nextIds,
          overlapCycle: null,
        };
      }
      return { ...state, selectedIds: groupMembers, overlapCycle: null };
    }

    case "cycle": {
      const ids = action.layerIdsUnderPoint;
      if (ids.length === 0) {
        return { ...state, selectedIds: [], overlapCycle: null };
      }
      let nextIndex = 0;
      if (samePoint(state.overlapCycle, action.x, action.y, ids)) {
        nextIndex = (state.overlapCycle!.index + 1) % ids.length;
      } else {
        const current = state.selectedIds[0];
        const currentIndex = current ? ids.indexOf(current) : -1;
        nextIndex = currentIndex >= 0 ? (currentIndex + 1) % ids.length : 0;
      }
      return {
        ...state,
        selectedIds: [ids[nextIndex]!],
        overlapCycle: { x: action.x, y: action.y, ids, index: nextIndex },
      };
    }

    case "pickExact": {
      const entry = index.byId[action.layerId];
      return {
        ...state,
        selectedIds: [action.layerId],
        isolationIds: entry ? entry.ancestorIds : state.isolationIds,
        hoverId: null,
        overlapCycle: null,
      };
    }

    case "doubleClickEnter": {
      const isolationIds = [...state.isolationIds, action.containerId];
      return {
        ...state,
        isolationIds,
        selectedIds: action.childId ? [action.childId] : [],
        overlapCycle: null,
      };
    }

    case "doubleClickLayer":
      return state;

    case "marquee": {
      const expanded = expandLayerIdsWithDesignerGroups(action.layerIds, index, blueprint);
      const merged = action.additive ? [...state.selectedIds, ...expanded] : expanded;
      const selectedIds = collapseContainerDescendants(uniqueKeepOrder(merged), index);
      return { ...state, selectedIds, overlapCycle: null };
    }

    case "clear":
      return { ...state, selectedIds: [], hoverId: null, overlapCycle: null };

    case "escape": {
      if (state.selectedIds.length > 0 || state.hoverId) {
        return { ...state, selectedIds: [], hoverId: null, overlapCycle: null };
      }
      if (state.isolationIds.length > 0) {
        return {
          ...state,
          isolationIds: state.isolationIds.slice(0, -1),
          overlapCycle: null,
        };
      }
      return state;
    }

    case "enterContainer":
      return state;

    case "setIsolation":
      return { ...state, isolationIds: action.isolationIds, selectedIds: [], overlapCycle: null };

    case "reconcile": {
      const valid = new Set(action.validIds);
      const selectedIds = state.selectedIds.filter((id) => valid.has(id));
      const hoverId = state.hoverId && valid.has(state.hoverId) ? state.hoverId : null;
      const isolationIds: string[] = [];
      for (const id of state.isolationIds) {
        if (!valid.has(id) || !action.containerIds.includes(id)) break;
        isolationIds.push(id);
      }
      return { ...state, selectedIds, hoverId, isolationIds, overlapCycle: null };
    }

    default:
      return state;
  }
}

export function reconcileSelectionToIndex(
  state: SiteCreatorSelectionState,
  index: SiteCreatorSelectionIndex,
  blueprint?: SiteBlueprintV1 | null,
): SiteCreatorSelectionState {
  return reduceSiteCreatorSelection(
    state,
    {
      type: "reconcile",
      validIds: index.entries.map((entry) => entry.layerId),
      containerIds: index.entries.filter((entry) => entry.containerKind).map((entry) => entry.layerId),
    },
    index,
    blueprint,
  );
}
