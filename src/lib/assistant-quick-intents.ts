/**
 * Intents rápidos del asistente (sin llamar al modelo).
 * Complementa clear-canvas-intent.ts.
 */

function normalize(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Añadir un nodo anidado tipo `space` (subgrafo), alineado con el atajo S / teclado.
 * Ej.: "nuevo espacio", "crea un espacio", "add space", "nested space".
 */
export function matchesAddSpaceNodeIntent(raw: string): boolean {
  const p = normalize(raw);
  if (!p) return false;

  // Respuestas a aclaraciones del asistente: no interpretar como "nuevo nodo space"
  if (p.startsWith("[clarification_reply]")) return false;

  const exact = new Set([
    "nuevo espacio",
    "nueva espacio",
    "nuevo space",
    "add space",
    "nested space",
    "space node",
  ]);
  if (exact.has(p)) return true;

  const subs = [
    "crear un espacio",
    "crea un espacio",
    "crear espacio",
    "crea espacio",
    "anadir espacio",
    "anadir un espacio",
    "anadir nodo space",
    "nodo space",
    "sub-grafo",
    "subgrafo modular",
    "add a space",
    "create space",
    "new space node",
  ];
  for (const s of subs) {
    if (p.includes(s)) return true;
  }

  // crear / añadir / nuevo … espacio | space
  if (
    /\b(crear|crea|anadir|nuevo|nueva|add|new)\b.{0,40}\b(espacio|space)\b/.test(p)
  ) {
    if (/\b(borrar|eliminar|quitar|borra|elimina)\s+.{0,20}\b(espacio|space)\b/.test(p)) {
      return false;
    }
    return true;
  }

  return false;
}
