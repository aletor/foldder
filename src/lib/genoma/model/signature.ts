/**
 * Firmas de candidatos: cómo decidimos si "esto ya lo conozco".
 *
 * - Texto (tipografías, mensajes, claims): hash normalizado. Normalizar quita el
 *   ruido (subset `BCDEEE+Montserrat-Bold` → `montserrat`, mayúsculas, espacios)
 *   para que dos apariciones del mismo rasgo compartan firma.
 * - Imágenes (logo, universo visual): pHash (perceptual hash, hex) calculado en
 *   servidor con sharp por los extractores; aquí solo definimos la DISTANCIA.
 *
 * `signatureDistance` unifica ambos mundos para que `classifyIncoming` (§4) use
 * una sola función: 0 = idénticas, valores pequeños = casi iguales (pHash),
 * `Infinity` = distintas (texto no coincidente).
 */

import { phashHammingDistance } from "@/lib/brandkit/logo-phash";

const SUBSET_PREFIX_RE = /^[A-Z]{6}\+/;
const HEX_RE = /^[0-9a-f]+$/i;
const BINARY_PHASH_RE = /^[01]{32,}$/;

/**
 * Firma de texto GENÉRICA (mensajes, claims): minúsculas, sin prefijo de subset,
 * sin puntuación ni espacios. NO quita palabras como "bold"/"light" porque en un
 * mensaje son significativas (p. ej. tagline "Be Bold" ≠ "Be").
 */
export function textSignature(raw: string): string {
  return raw
    .trim()
    .replace(SUBSET_PREFIX_RE, "")
    .toLowerCase()
    .replace(/[\s_\-.,;:]+/g, "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, ""); // quita diacríticos
}

/**
 * Tokens de PESO/ESTILO. No forman parte de la identidad de una familia: son un
 * atributo del candidato coronado (su lista de `weights`), no de su firma.
 *
 * Nota: unas pocas familias usan una palabra de peso como parte del nombre
 * (Archivo Black, Book Antiqua). Aceptamos esa colisión rarísima a cambio de
 * eliminar el ruido real: que cada peso de la MISMA fuente de marca dispare un
 * modal de "material nuevo". Si algún día molesta, se añade una lista de
 * excepciones aquí.
 */
const FONT_WEIGHT_STYLE_TOKENS = new Set([
  "thin", "hairline", "extralight", "ultralight", "ultra", "light", "semilight",
  "book", "regular", "normal", "medium", "semibold", "demibold", "demi", "semi",
  "bold", "extrabold", "ultrabold", "black", "heavy",
  "italic", "oblique", "kursiv", "it", "obl",
]);

/**
 * Firma de IDENTIDAD de una tipografía = la familia, sin peso ni estilo.
 * `BCDEEE+Montserrat-Bold`, `Montserrat-Regular`, `Montserrat Bold` y `Montserrat`
 * producen todos `"montserrat"`. Así, cuando llega "Montserrat Bold" y ya está
 * "Montserrat" coronada, `classifyIncoming` la ve como conocida (no hay modal).
 */
export function fontFamilySignature(raw: string): string {
  const withoutSubset = raw.trim().replace(SUBSET_PREFIX_RE, "");
  // Separa peso pegado en camelCase: "MontserratBold" → "Montserrat Bold".
  const camelSplit = withoutSubset.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  const tokens = camelSplit.split(/[\s\-_./,;:]+/).map((t) => t.trim()).filter(Boolean);
  const familyTokens = tokens.filter((t) => {
    const low = t.toLowerCase();
    if (FONT_WEIGHT_STYLE_TOKENS.has(low)) return false;
    if (/^[1-9]00$/.test(low)) return false; // pesos numéricos 100..900
    return true;
  });
  const chosen = familyTokens.length > 0 ? familyTokens : tokens;
  return chosen.join("").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
}

function looksLikeHex(s: string): boolean {
  return s.length > 0 && s.length % 2 === 0 && HEX_RE.test(s);
}

const HEX_NIBBLE_BITS: Record<string, number> = {
  "0": 0, "1": 1, "2": 1, "3": 2, "4": 1, "5": 2, "6": 2, "7": 3,
  "8": 1, "9": 2, a: 2, b: 3, c: 2, d: 3, e: 3, f: 4,
};

/** Distancia de Hamming (en bits) entre dos pHash hex de igual longitud. */
export function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) return Number.POSITIVE_INFINITY;
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  let bits = 0;
  for (let i = 0; i < x.length; i++) {
    const nx = parseInt(x[i], 16);
    const ny = parseInt(y[i], 16);
    if (Number.isNaN(nx) || Number.isNaN(ny)) return Number.POSITIVE_INFINITY;
    const xor = (nx ^ ny).toString(16);
    bits += HEX_NIBBLE_BITS[xor] ?? 0;
  }
  return bits;
}

/**
 * Distancia unificada:
 * - dos firmas hex de igual longitud → Hamming en bits (pHash).
 * - en cualquier otro caso → 0 si son iguales, `Infinity` si no (texto).
 */
function looksLikeBinaryPhash(s: string): boolean {
  return BINARY_PHASH_RE.test(s);
}

export function signatureDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (looksLikeBinaryPhash(a) && looksLikeBinaryPhash(b)) {
    return phashHammingDistance(a, b);
  }
  if (looksLikeHex(a) && looksLikeHex(b) && a.length === b.length) {
    return hammingDistance(a, b);
  }
  return Number.POSITIVE_INFINITY;
}

/** ¿Dos firmas representan lo mismo dentro de una tolerancia? */
export function signaturesMatch(a: string, b: string, maxDistance = 0): boolean {
  return signatureDistance(a, b) <= maxDistance;
}
