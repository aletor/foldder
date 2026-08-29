/**
 * Ancho máximo de la página en Ordenador (preview y publicación).
 * Tablet y móvil no lo usan.
 */
import { cloneBlueprint } from "./site-blueprint-validate";
import {
  clampViewportWidth,
  SITE_CREATOR_DEFAULT_MONITOR_MAX_WIDTH,
} from "./site-creator-viewport";
import type { SiteBlueprintV1 } from "./site-creator-types";

export function parseMonitorMaxWidth(raw: unknown): number | undefined {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return undefined;
  return Math.round(raw);
}

export function resolveMonitorMaxWidth(
  blueprint: Pick<SiteBlueprintV1, "monitorMaxWidth"> | null | undefined,
  referenceWidth: number,
  fallback: number = SITE_CREATOR_DEFAULT_MONITOR_MAX_WIDTH,
): number {
  const raw = parseMonitorMaxWidth(blueprint?.monitorMaxWidth);
  return clampViewportWidth(raw ?? fallback, referenceWidth);
}

export function setMonitorMaxWidth(
  blueprint: SiteBlueprintV1,
  width: number,
  referenceWidth: number,
): SiteBlueprintV1 {
  const next = cloneBlueprint(blueprint);
  next.monitorMaxWidth = clampViewportWidth(width, referenceWidth);
  return next;
}
