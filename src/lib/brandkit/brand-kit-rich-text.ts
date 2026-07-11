export type BrandKitRichTextSegment = { type: "text" | "bold"; text: string };

/** Instrucción compartida para prompts de síntesis BrandKit. */
export const BRAND_KIT_RICH_TEXT_PROMPT = [
  "Resalta términos clave dentro de frases narrativas envolviéndolos en **doble asterisco** (ej: una mirada **autoral y emocional**).",
  "OBLIGATORIO en essence.summary y voice.summary: incluye entre 2 y 5 fragmentos con ** en cada resumen.",
  "Usa 2-5 resaltados por párrafo o ítem largo; no marques toda la frase ni palabras vacías.",
  "Aplica ** en: summary, explanation de beliefs, purpose, promise, pov, rules, avoid, visualTraits y limits.",
  "NO uses ** en: headlines, labels cortos de beliefs, descriptors, moodTags, quotes literales ni evidenceIds.",
].join("\n");

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Si el texto no trae **, resalta términos relevantes (marca, descriptores, creencias). */
export function autoEmphasizeBrandKitText(text: string, terms: string[]): string {
  if (!text.trim() || /\*\*[^*]+\*\*/.test(text)) return text;

  const ranked = [...new Set(terms.map((term) => term.trim()).filter((term) => term.length >= 3))].sort(
    (a, b) => b.length - a.length,
  );

  let result = text;
  for (const term of ranked) {
    const pattern = new RegExp(`(${escapeRegExp(term)})`, "gi");
    result = result.replace(pattern, "**$1**");
  }

  return result.replace(/\*\*\*\*/g, "**");
}

/** Quita marcado ** para comparación con corpus o edición plana. */
export function stripBrandKitRichMarkup(text: string): string {
  return text.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*\*/g, "");
}

export function parseBrandKitRichText(text: string): BrandKitRichTextSegment[] {
  if (!text) return [{ type: "text", text: "" }];

  const segments: BrandKitRichTextSegment[] = [];
  const pattern = /\*\*([^*]+)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", text: text.slice(lastIndex, match.index) });
    }
    segments.push({ type: "bold", text: match[1] });
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    segments.push({ type: "text", text: text.slice(lastIndex) });
  }

  return segments.length ? segments : [{ type: "text", text }];
}
