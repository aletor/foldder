import type { DatasetScope } from "./dataset-types";

export const DATASET_SCOPE_METRIC_PERSISTENT = "Persistente";
export const DATASET_SCOPE_METRIC_LOCAL = "Local";

/** Etiqueta del menú ⋯ según el scope actual (acción de conversión). */
export function datasetScopeMenuActionLabel(scope: DatasetScope): string {
  return scope === "global" ? "Convertir a DataSet Local" : "Convertir a DataSet Persistente";
}

export function datasetScopeConfirmTitle(direction: "promote" | "demote"): string {
  return direction === "promote" ? "Convertir a DataSet Persistente" : "Convertir a DataSet Local";
}

export function datasetScopeSuccessNotice(direction: "promote" | "demote"): string {
  return direction === "promote"
    ? "Convertido a DataSet Persistente. Disponible en todos tus proyectos."
    : "Convertido a DataSet Local.";
}

export function datasetScopeMetricLabel(scope: DatasetScope): string {
  return scope === "global" ? DATASET_SCOPE_METRIC_PERSISTENT : DATASET_SCOPE_METRIC_LOCAL;
}

export function datasetScopeSummaryTag(scope: DatasetScope): string {
  return scope === "global" ? DATASET_SCOPE_METRIC_PERSISTENT : DATASET_SCOPE_METRIC_LOCAL;
}
