export type GenomaRichTextSegment = { type: "text" | "bold"; text: string };

/** Instrucción compartida para prompts de síntesis Genoma. */
export const GENOMA_RICH_TEXT_PROMPT = [
  "Resalta términos clave dentro de frases narrativas envolviéndolos en **doble asterisco** (ej: una mirada **autoral y emocional**).",
  "Usa 2-5 resaltados por párrafo o ítem largo; no marques toda la frase.",
  "Aplica ** en: summary, explanation de beliefs, purpose, promise, pov, rules, avoid, visualTraits y limits.",
  "NO uses ** en: headlines, labels cortos de beliefs, descriptors, moodTags, quotes literales ni evidenceIds.",
].join("\n");

/** Quita marcado ** para comparación con corpus o edición plana. */
export function stripGenomaRichMarkup(text: string): string {
  return text.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*\*/g, "");
}

export function parseGenomaRichText(text: string): GenomaRichTextSegment[] {
  if (!text) return [{ type: "text", text: "" }];

  const segments: GenomaRichTextSegment[] = [];
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
