/**
 * Normaliza prompts de nodos upstream (Describer, Enhancer, etc.) al estilo descriptivo
 * que Gemini Image espera, sin imperativos tipo "Create a scene...".
 */
export function normalizeGenerativeImagePrompt(prompt: string): string {
  const trimmed = prompt.trim();
  if (!trimmed) return trimmed;

  let normalized = trimmed
    .replace(
      /^(?:please\s+)?(?:create|generate|make|produce|render|design|draw|paint)\s+(?:an?\s+)?(?:image|photo|photograph|picture|scene|shot|visual|rendering)\s+(?:of|showing|featuring|with|depicting|that\s+(?:shows|features|depicts))?\s*/i,
      "",
    )
    .replace(/^(?:please\s+)?(?:create|generate|make|produce|render|design)\s+/i, "")
    .trim();

  if (!normalized || normalized.length < 12) return trimmed;

  // Capitalize first letter after stripping imperative boilerplate.
  normalized = normalized.charAt(0).toUpperCase() + normalized.slice(1);
  return normalized;
}
