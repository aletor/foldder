/** Evita fit automático al previsualizar media (p. ej. al cambiar de space o hacer zoom). */
let suppressed = false;
let suppressReleaseTimer: ReturnType<typeof setTimeout> | null = null;

export function suppressFoldderMediaPreviewAutoFit(value: boolean): void {
  suppressed = value;
  if (!value && suppressReleaseTimer !== null) {
    clearTimeout(suppressReleaseTimer);
    suppressReleaseTimer = null;
  }
}

/** Suprime auto-fit de media durante `ms` (p. ej. tras fitView del grafo o rueda de zoom). */
export function bumpFoldderMediaPreviewAutoFitSuppress(ms = 900): void {
  suppressed = true;
  if (suppressReleaseTimer !== null) clearTimeout(suppressReleaseTimer);
  suppressReleaseTimer = setTimeout(() => {
    suppressReleaseTimer = null;
    suppressed = false;
  }, ms);
}

export function isFoldderMediaPreviewAutoFitSuppressed(): boolean {
  return suppressed;
}
