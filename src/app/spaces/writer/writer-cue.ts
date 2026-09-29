/**
 * Higiene local de cues de personaje.
 * No llama a ningún modelo y no modifica el texto del documento.
 */

const CUE_DECORATOR =
  /\s*\((?:v\.?\s*o\.?|o\.?\s*[sc]\.?|cont(?:['’])?d\.?|continued|continu(?:a|aci[oó]n)|off(?:\s*screen)?|\d{1,3}(?:\s*a[nñ]os?)?)\)/giu;

/** ANA (V.O.), JUAN (CONT'D), NIÑA (8) → el nombre. */
export function normalizeCharacterCue(name: string): string {
  return name.replace(CUE_DECORATOR, " ").replace(/\s+/g, " ").trim();
}

/**
 * Acepta un nombre de reparto. Rechaza una oración.
 * El alta manual no pasa por aquí.
 */
export function isSaneCharacterCue(name: string): boolean {
  const text = normalizeCharacterCue(name);
  if (text.length < 2 || text.length > 48) return false;
  if (/[?¿!¡,;:«»""]/.test(text)) return false;
  const withoutAbbrev = text.replace(/\b\p{L}{1,4}\./gu, "");
  if (withoutAbbrev.includes(".")) return false;
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 6) return false;
  if (/^(?:sabes|que|cuando|pero|como|c[oó]mo|qu[eé]|si|porque|por\s+qu[eé])\b/iu.test(text)) return false;
  return words.every((word) => /^(?:#\d+|\d+|\p{L}[\p{L}\p{N}'’.-]*\.?)$/u.test(word));
}

const SMALL_WORDS = new Set(["de", "del", "la", "las", "los", "el", "y", "e", "o", "u", "a", "al"]);

/** Caja editorial de un nombre: Policía, Doctora Martínez, Hombre de la gabardina. */
export function editorialCase(value: string): string {
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) return "";
  const upper = text.toLocaleUpperCase("es");
  const lower = text.toLocaleLowerCase("es");
  if (text !== upper && text !== lower) return text;
  let wordIndex = 0;
  return lower
    .split(/(\s+|-)/)
    .map((part) => {
      if (!part || part === "-" || /^\s+$/.test(part)) return part;
      const word = part.toLocaleLowerCase("es");
      const keepSmall = wordIndex > 0 && SMALL_WORDS.has(word);
      wordIndex += 1;
      if (keepSmall) return word;
      return word.charAt(0).toLocaleUpperCase("es") + word.slice(1);
    })
    .join("");
}

/** Localización: solo la primera palabra de cada tramo. Sala de curas. Hospital - Planta 2. */
export function locationCase(value: string): string {
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) return "";
  const upper = text.toLocaleUpperCase("es");
  const lower = text.toLocaleLowerCase("es");
  if (text !== upper && text !== lower) return text;
  return lower
    .split(/\s+[-–—]\s+/)
    .map((segment) =>
      segment
        .split(/\s+/)
        .map((word, index) => (index === 0 ? word.charAt(0).toLocaleUpperCase("es") + word.slice(1) : word))
        .join(" "),
    )
    .join(" - ");
}

export function storyDisplayTitle(label: string, group: "character" | "story"): string {
  if (group !== "character") return label;
  const normalized = normalizeCharacterCue(label);
  if (!isSaneCharacterCue(normalized)) return label;
  return editorialCase(normalized);
}
