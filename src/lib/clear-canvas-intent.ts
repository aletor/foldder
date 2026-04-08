/**
 * Detecta si el usuario quiere vaciar el lienzo (sin llamar al modelo).
 * Cubre imperativos españoles ("borra todo"), infinitivos, inglés y frases con "nodos"/"lienzo".
 */

function normalize(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Órdenes cortas que solo pueden significar vaciar el canvas. */
const EXACT_PHRASES = new Set([
  "borra todo",
  "borrar todo",
  "borra todos",
  "borrar todos",
  "elimina todo",
  "eliminar todo",
  "elimina todos",
  "eliminar todos",
  "quita todo",
  "quitar todo",
  "quita todos",
  "quitar todos",
  "limpia todo",
  "limpiar todo",
  "limpia todos",
  "limpiar todos",
  "vacia todo",
  "vaciar todo",
  "vacia todos",
  "vaciar todos",
  "clear",
  "clear all",
  "clear canvas",
  "reset",
  "reset all",
  "new canvas",
  "start over",
]);

const SUBSTRING_PHRASES = [
  "limpiar el lienzo",
  "limpiar lienzo",
  "limpiar pizarra",
  "limpiar todo el lienzo",
  "vaciar lienzo",
  "vaciar el lienzo",
  "vaciar todo el lienzo",
  "borrar los nodos",
  "borrar todos los nodos",
  "borrar todo el lienzo",
  "eliminar los nodos",
  "eliminar todos los nodos",
  "eliminar nodos",
  "quitar los nodos",
  "quitar todos los nodos",
  "sin nodos",
  "lienzo vacio",
  "pizarra vacia",
  "nueva pizarra",
  "empezar de cero",
  "desde cero",
  "vaciar todo el canvas",
  "delete all nodes",
  "remove all nodes",
  "clear the canvas",
  "empty canvas",
];

export function matchesClearCanvasIntent(raw: string): boolean {
  const p = normalize(raw);
  if (!p) return false;

  if (EXACT_PHRASES.has(p)) return true;

  for (const s of SUBSTRING_PHRASES) {
    if (p.includes(s)) return true;
  }

  // "borra todo" / "borrar todo" al inicio o como frase corta — pero NO si hablan del fondo de una imagen
  if (/\b(borra|borrar|elimina|eliminar|quita|quitar)\s+todo\b/.test(p) && !/\bfondo\b/.test(p)) {
    return true;
  }

  // Verbo + nodos
  if (
    /\b(eliminar|borrar|quitar|borra|elimina|quita|limpia|limpiar|vaciar|vacia|sacar|remover)\b.{0,60}\bnodos\b/.test(
      p
    )
  ) {
    return true;
  }
  if (/\bnodos\b.{0,40}\b(eliminar|borrar|quitar|borra|elimina|quita|fuera)\b/.test(p)) {
    return true;
  }

  // Inglés: delete/remove/clear + all/everything/nodes/canvas
  if (
    /\b(delete|remove|clear)\s+(all|everything|all\s+nodes|the\s+nodes|the\s+canvas|canvas)\b/.test(p)
  ) {
    return true;
  }

  return false;
}
