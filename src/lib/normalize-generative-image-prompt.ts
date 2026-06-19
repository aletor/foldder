/**
 * Normaliza prompts de nodos upstream (Describer, Enhancer, etc.) al estilo descriptivo
 * que Gemini Image espera, sin imperativos tipo "Create a scene...".
 */
export type NormalizeGenerativeImagePromptOptions = {
  /** Ratio de salida del generador (p. ej. Nano Banana 16:9). */
  targetAspectRatio?: string;
};

export function normalizeGenerativeImagePrompt(
  prompt: string,
  options?: NormalizeGenerativeImagePromptOptions,
): string {
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

  normalized = normalized.charAt(0).toUpperCase() + normalized.slice(1);
  const suffix = [
    buildFramingPreservationSuffix(normalized),
    buildWidescreenExpansionSuffix(normalized, options?.targetAspectRatio),
    buildColorGradePreservationSuffix(normalized),
    buildPosePreservationSuffix(normalized),
  ]
    .filter(Boolean)
    .join("");
  return suffix ? `${normalized}${suffix}` : normalized;
}

/** Refuerza encuadre cuando el Describer indica plano entero — Gemini suele recortar pies. */
function buildFramingPreservationSuffix(prompt: string): string {
  const hasFullBody =
    /FULL BODY|full body \(FS\)|head to toe|feet\/shoes fully visible|feet fully (visible|in frame)|feet and shoes fully visible|shoes fully visible/i.test(
      prompt,
    );
  const wronglyMfs =
    /Knee-crop \(MFS\)|MFS —|Shot scale: Medium/i.test(prompt) &&
    /feet|shoes|sneakers|footwear|socks/i.test(prompt);

  if (hasFullBody || wronglyMfs) {
    return " Match exact framing: full-body shot, entire subject from head to feet visible, feet and shoes fully in frame, do not crop at ankles or knees.";
  }
  if (/Preserve full-body framing|do not crop at ankles|do not zoom/i.test(prompt)) {
    return " Do not reframe tighter or zoom in — keep the same subject scale and crop boundaries.";
  }
  return "";
}

/**
 * Fuente vertical → salida 16:9: expandir escena en horizontal (outpaint), no recortar sujeto.
 */
function buildWidescreenExpansionSuffix(prompt: string, targetAspectRatio?: string): string {
  const ratio = (targetAspectRatio ?? "").trim();
  if (!isLandscapeOutputRatio(ratio)) return "";

  const portraitSource =
    /SOURCE ORIENTATION:\s*portrait|portrait vertical|source is portrait|portrait source/i.test(prompt);
  const fullBody = /FULL BODY|full body|head to toe|feet\/shoes fully visible/i.test(prompt);

  if (portraitSource) {
    return " Output widescreen 16:9 landscape: generatively expand the environment horizontally on left and right (outpainting). Keep the subject at the same scale, full body head-to-toe with feet visible, centered — do NOT zoom in, do NOT crop ankles/knees/head to fill the frame.";
  }

  if (fullBody) {
    return " Output 16:9 landscape: preserve full-body subject scale head-to-toe with feet visible; expand scene horizontally if needed — never zoom or crop the subject.";
  }

  return "";
}

function isLandscapeOutputRatio(ratio: string): boolean {
  const r = ratio.replace(/\s/g, "");
  return r === "16:9" || r === "21:9" || r === "2.39:1" || r === "2.35:1" || r === "4:1" || r === "8:1";
}

/** Refuerza sombras frías cuando el Describer las detecta — Gemini las aclara a gris neutro. */
function buildColorGradePreservationSuffix(prompt: string): string {
  if (
    /blue-teal shadow|cyan shadow|cool.*shadow|deep blue shadow|teal.*shadow|purple shadow|Shadow tone:.*blue|Shadow tone:.*teal|Shadow tone:.*cyan/i.test(
      prompt,
    )
  ) {
    return " Preserve strong cool blue-teal color cast in all shadows; do not lift shadows to neutral grey or warm tones.";
  }
  return "";
}

/** Evita que Gemini simplifique poses dinámicas a perfil frontal. */
function buildPosePreservationSuffix(prompt: string): string {
  const parts: string[] = [];
  if (/over-shoulder|look-back|look back at camera/i.test(prompt)) {
    parts.push(
      "Preserve over-shoulder look-back pose — do not convert to frontal or strict profile.",
    );
  }
  if (
    /torso toward frame-left/i.test(prompt) &&
    /head toward frame-right|gaze.*frame-right/i.test(prompt)
  ) {
    parts.push("Preserve decoupled pose: torso and head face different directions as described.");
  }
  if (/torso toward frame-right/i.test(prompt) && /head toward frame-left|gaze.*frame-left/i.test(prompt)) {
    parts.push("Preserve decoupled pose: torso and head face different directions as described.");
  }
  if (/do not convert to frontal profile|catalog stance/i.test(prompt)) {
    return parts.length ? ` ${parts.join(" ")}` : "";
  }
  if (parts.length) return ` ${parts.join(" ")}`;
  return "";
}
