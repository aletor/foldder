import type { SiteBlueprintV1 } from "./site-creator-types";
import type { SiteCreatorOriginState } from "./site-creator-origin";

export type PersistentStructureGate =
  | { allowed: true; mode: "synced" | "disconnected" | "different_source_snapshot" }
  | { allowed: false; reason: "update_available" | "no_snapshot" | "preparing" | "incompatible"; message: string };

/**
 * Operaciones persistentes solo contra committedPage (sourceSnapshot).
 * Con update_available: bloquear y pedir sincronización.
 * Desconectado / different_source: se trabaja sobre el snapshot confirmado.
 */
export function canPersistSiteStructure(args: {
  originState: SiteCreatorOriginState;
  hasSnapshot: boolean;
}): PersistentStructureGate {
  if (!args.hasSnapshot) {
    return {
      allowed: false,
      reason: "no_snapshot",
      message: "No hay un diseño confirmado para estructurar.",
    };
  }
  switch (args.originState) {
    case "update_available":
      return {
        allowed: false,
        reason: "update_available",
        message: "Actualizar diseño para continuar",
      };
    case "preparing":
      return {
        allowed: false,
        reason: "preparing",
        message: "Espera a que termine la importación del diseño.",
      };
    case "incompatible_document":
      return {
        allowed: false,
        reason: "incompatible",
        message: "El Designer conectado no es compatible.",
      };
    case "no_source":
      // snapshot exists somehow without edge — still allow on snapshot
      return { allowed: true, mode: "disconnected" };
    case "source_disconnected":
      return { allowed: true, mode: "disconnected" };
    case "different_source":
      return { allowed: true, mode: "different_source_snapshot" };
    case "synced":
      return { allowed: true, mode: "synced" };
    default:
      return { allowed: true, mode: "synced" };
  }
}

export interface SiteBlueprintHistoryState {
  past: SiteBlueprintV1[];
  present: SiteBlueprintV1;
  future: SiteBlueprintV1[];
}

export function createBlueprintHistory(present: SiteBlueprintV1): SiteBlueprintHistoryState {
  return { past: [], present, future: [] };
}

export function pushBlueprintHistory(
  state: SiteBlueprintHistoryState,
  next: SiteBlueprintV1,
  limit = 50,
): SiteBlueprintHistoryState {
  if (state.present === next) return state;
  const past = [...state.past, state.present];
  if (past.length > limit) past.splice(0, past.length - limit);
  return { past, present: next, future: [] };
}

export function undoBlueprintHistory(
  state: SiteBlueprintHistoryState,
): SiteBlueprintHistoryState | null {
  if (state.past.length === 0) return null;
  const previous = state.past[state.past.length - 1]!;
  return {
    past: state.past.slice(0, -1),
    present: previous,
    future: [state.present, ...state.future],
  };
}

export function redoBlueprintHistory(
  state: SiteBlueprintHistoryState,
): SiteBlueprintHistoryState | null {
  if (state.future.length === 0) return null;
  const next = state.future[0]!;
  return {
    past: [...state.past, state.present],
    present: next,
    future: state.future.slice(1),
  };
}
