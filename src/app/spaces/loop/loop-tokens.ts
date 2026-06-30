/**
 * Loop — tokens de prompt.
 *
 * El prompt de un nodo creativo es una plantilla de texto fija que puede contener
 * referencias a columnas del Dataset con la forma `{fieldKey}`. En cada fila esos
 * tokens se sustituyen por el valor de la fila (texto). El texto sin tokens se
 * comporta exactamente como hoy.
 */

/** Acepta letras, números, guion bajo y guion (claves de campo del Dataset). */
const TOKEN_RE = /\{([a-zA-Z0-9_-]+)\}/g;

/** Devuelve las claves de campo referenciadas en la plantilla, sin duplicados. */
export function extractPromptTokens(template: string): string[] {
  if (!template) return [];
  const out: string[] = [];
  for (const match of template.matchAll(TOKEN_RE)) {
    const key = match[1];
    if (key && !out.includes(key)) out.push(key);
  }
  return out;
}

/**
 * Sustituye cada `{fieldKey}` usando `resolve`. Si `resolve` devuelve null/undefined
 * para una clave, el token se deja intacto (no se "pierde" texto del usuario).
 */
export function substitutePromptTokens(
  template: string,
  resolve: (fieldKey: string) => string | null | undefined,
): string {
  if (!template) return template ?? "";
  return template.replace(TOKEN_RE, (full, key: string) => {
    const value = resolve(key);
    return value == null ? full : value;
  });
}

/** ¿La plantilla contiene al menos un token? */
export function hasPromptTokens(template: string): boolean {
  return extractPromptTokens(template).length > 0;
}

/**
 * Inserta `{fieldKey}` en `text` reemplazando la selección [selStart, selEnd).
 * Devuelve el nuevo texto y la posición del cursor tras el token insertado.
 * Pensado para el selector "Insertar campo" del prompt.
 */
export function insertTokenAtSelection(
  text: string,
  selStart: number,
  selEnd: number,
  fieldKey: string,
): { text: string; caret: number } {
  const safeStart = Math.max(0, Math.min(selStart, text.length));
  const safeEnd = Math.max(safeStart, Math.min(selEnd, text.length));
  const token = `{${fieldKey}}`;
  const next = text.slice(0, safeStart) + token + text.slice(safeEnd);
  return { text: next, caret: safeStart + token.length };
}
