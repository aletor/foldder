import type { PopulateShareRecord } from "./populate-share-types";

export function populateShareAccessError(
  row: PopulateShareRecord | undefined,
): { status: number; error: string } | null {
  if (!row) {
    return { status: 404, error: "Enlace no encontrado" };
  }
  if (!row.options.enabled) {
    return { status: 410, error: "Este enlace ya no está activo" };
  }
  if (row.options.autoDisableAt && isPastIsoDate(row.options.autoDisableAt)) {
    return { status: 410, error: "Este enlace ha expirado" };
  }
  return null;
}

export function isPopulateShareAccessible(row: PopulateShareRecord | undefined): boolean {
  return populateShareAccessError(row) === null;
}

export function isPastIsoDate(value: string): boolean {
  const t = new Date(value).getTime();
  return !Number.isNaN(t) && t < Date.now();
}
