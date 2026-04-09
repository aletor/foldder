/** Evita fit automático al previsualizar media (p. ej. al cambiar de space sin querer recentrar). */
let suppressed = false;

export function suppressFoldderMediaPreviewAutoFit(value: boolean): void {
  suppressed = value;
}

export function isFoldderMediaPreviewAutoFitSuppressed(): boolean {
  return suppressed;
}
