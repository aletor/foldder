/**
 * Normaliza prompts de nodos upstream (Describer, Enhancer, etc.) al estilo descriptivo
 * que Gemini Image espera, sin imperativos tipo "Create a scene...".
 */
export type NormalizeGenerativeImagePromptOptions = {
  /** Ratio de salida del generador (p. ej. Nano Banana 16:9). */
  targetAspectRatio?: string;
  /** Sin imágenes de referencia: recreación text-only (no copia pixel a pixel). */
  textOnlyRecreation?: boolean;
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

  if (options?.textOnlyRecreation) {
    normalized = prependTextOnlyRecreationPrefix(normalized, options?.targetAspectRatio);
  }

  const suffix = [
    buildVerticalCropPreservationSuffix(normalized),
    buildWidescreenExpansionSuffix(normalized, options?.targetAspectRatio),
    buildSeamlessWidescreenSuffix(normalized, options?.targetAspectRatio),
    buildColorGradePreservationSuffix(normalized),
    buildPosePreservationSuffix(normalized),
    buildAsymmetricPosePreservationSuffix(normalized),
    buildHairMessPreservationSuffix(normalized),
    buildEnvironmentDisorderSuffix(normalized),
    buildImperfectionPreservationSuffix(normalized),
    buildLensCameraPreservationSuffix(normalized),
    buildPerspectiveImperfectionSuffix(normalized),
    buildVisualHierarchyPreservationSuffix(normalized),
  ]
    .filter(Boolean)
    .join("");
  return suffix ? `${normalized}${suffix}` : normalized;
}

/** Extrae tonos de MUST-PRESERVE o COLOR GRADE para reforzar en Gemini. */
function extractTonePair(prompt: string): { highlight?: string; shadow?: string } {
  const highlight =
    prompt.match(/Highlight tone:\s*([^\n.]+)/i)?.[1]?.trim() ||
    prompt.match(/Color preserve:.*Highlight tone:\s*([^;]+)/i)?.[1]?.trim();
  const shadow =
    prompt.match(/Shadow tone:\s*([^\n.]+)/i)?.[1]?.trim() ||
    prompt.match(/Shadow tone:\s*([^";]+)/i)?.[1]?.trim();
  return { highlight, shadow };
}

/** Respeta el recorte vertical del source — no revelar pies/piernas si estaban cortados. */
function buildVerticalCropPreservationSuffix(prompt: string): string {
  const feetNotInFrame =
    /feet NOT in frame|feet not visible|legs NOT visible|bottom edge cuts at (mid-thigh|knees|shins|hips|waist|chest|lower back)/i.test(
      prompt,
    );

  if (feetNotInFrame) {
    return " Preserve exact vertical crop from the source image: do not zoom out to reveal feet, legs, or headroom that were cropped; do not change subject scale on the vertical axis.";
  }

  if (
    /VERTICAL CROP \(locked\)|Preserve exact vertical crop|vertical crop locked|SUBJECT BAND/i.test(prompt) ||
    /BOTTOM EDGE:.*(?:feet|shoes)/i.test(prompt) ||
    /SOURCE ORIENTATION:\s*portrait|portrait vertical/i.test(prompt)
  ) {
    return " Preserve exact vertical crop — do not crop, zoom, or extend the top or bottom of the subject; keep identical top/bottom frame boundaries and subject scale on the vertical axis.";
  }

  return "";
}

/**
 * Fuente → 16:9: recrear como foto horizontal nativa (text-only), recorte vertical bloqueado.
 */
function buildWidescreenExpansionSuffix(prompt: string, targetAspectRatio?: string): string {
  const ratio = (targetAspectRatio ?? "").trim();
  if (!isLandscapeOutputRatio(ratio)) return "";

  const portraitSource =
    /SOURCE ORIENTATION:\s*portrait|portrait vertical|portrait,|portrait source/i.test(prompt);

  const hasNativeFraming =
    /FINAL OUTPUT FRAMING|FRAME-LEFT EXTENSION|SUBJECT BAND|FRAME-RIGHT EXTENSION/i.test(prompt);

  if (portraitSource || hasNativeFraming || /16:9 native|single seamless widescreen/i.test(prompt)) {
    return " Output as ONE continuous native 16:9 landscape photograph filling the frame edge to edge. Subject centered with exact vertical crop locked — same top and bottom boundaries, no vertical zoom in or out. Realistically extend environment and sky to frame-left and frame-right with continuous perspective and matching lighting — NOT side panels beside a portrait column.";
  }

  if (isLandscapeOutputRatio(ratio)) {
    return " Output 16:9 landscape while preserving the exact vertical crop and subject scale from the description.";
  }

  return "";
}

/** Anti-tríptico: una sola foto continua, sin costuras ni paneles verticales. */
function buildSeamlessWidescreenSuffix(prompt: string, targetAspectRatio?: string): string {
  const ratio = (targetAspectRatio ?? "").trim();
  if (!isLandscapeOutputRatio(ratio)) return "";

  return " ONE continuous photograph filling the entire 16:9 frame — absolutely no vertical black bars, white gutters, panel dividers, triptych layout, diptych, or a center portrait strip with different side images. Horizontally extend environment realistically at frame-left and frame-right; keep identical top and bottom crop on the subject; one unified sky, horizon, and perspective across the full width.";
}

const TEXT_ONLY_RECREATION_PREFIX =
  "Recreate this scene as ONE single continuous 16:9 landscape photograph — single exposure, edge-to-edge scene, not a collage or triptych. Same photographic moment re-shot, not a copy of any source file. Do not replicate any reference photograph pixel-for-pixel. Do not crop the subject top or bottom. ";

function prependTextOnlyRecreationPrefix(prompt: string, targetAspectRatio?: string): string {
  if (/Recreate this scene from the description/i.test(prompt)) return prompt;
  const ratio = (targetAspectRatio ?? "").trim();
  if (!isLandscapeOutputRatio(ratio)) return prompt;
  const portraitOrFraming =
    /SOURCE ORIENTATION:\s*portrait|portrait vertical|FINAL OUTPUT FRAMING|FRAME-LEFT EXTENSION/i.test(prompt);
  if (!portraitOrFraming) return prompt;
  return `${TEXT_ONLY_RECREATION_PREFIX}${prompt}`;
}

function isLandscapeOutputRatio(ratio: string): boolean {
  const r = ratio.replace(/\s/g, "");
  return r === "16:9" || r === "21:9" || r === "2.39:1" || r === "2.35:1" || r === "4:1" || r === "8:1";
}

/** Refuerza sombras/highlights cuando el Describer los documenta — Gemini los aplana. */
function buildColorGradePreservationSuffix(prompt: string): string {
  const { highlight, shadow } = extractTonePair(prompt);
  const parts: string[] = [];

  if (shadow && /blue|teal|cyan|purple|cool/i.test(shadow)) {
    parts.push(
      "Preserve strong cool shadow color cast exactly as described; do not lift shadows to neutral grey or warm tones.",
    );
  } else if (shadow && /amber|warm|golden|orange/i.test(shadow)) {
    parts.push("Preserve warm amber/golden shadow fill exactly as described.");
  } else if (shadow) {
    parts.push(`Preserve shadow tone exactly: ${shadow}.`);
  }

  if (highlight) {
    parts.push(`Preserve highlight tone exactly: ${highlight}.`);
  }

  if (/Lighting preserve:.*very high|Quality:\s*hard|harsh direct/i.test(prompt)) {
    parts.push("Preserve hard directional lighting and high contrast — do not flatten to soft studio light.");
  }

  if (parts.length) return ` ${parts.join(" ")}`;
  return "";
}

/** Evita que Gemini simplifique poses dinámicas a perfil frontal o cambie soporte corporal. */
function buildPosePreservationSuffix(prompt: string): string {
  const parts: string[] = [];

  if (/seated-on-counter|thighs on counter|seated on kitchen counter/i.test(prompt)) {
    parts.push("Preserve seated-on-counter pose — subject stays on counter, not standing on floor.");
  }
  if (/seated-on-chair|seated on chair|sitting in chair/i.test(prompt)) {
    parts.push("Preserve seated-on-chair pose — do not convert to standing.");
  }
  if (/seen-from-behind|face not visible|back of head/i.test(prompt)) {
    parts.push("Preserve seen-from-behind framing — do not rotate subject to face camera.");
  }
  if (/over-shoulder|look-back|look back at camera/i.test(prompt)) {
    parts.push(
      "Preserve over-shoulder look-back pose — do not convert to frontal or strict profile.",
    );
  }
  if (/torso-through-furniture|through chair|chair backrest|threaded through/i.test(prompt)) {
    parts.push("Preserve body interaction with furniture exactly as described.");
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
  if (/Pose preserve:.*seated|archetype seated/i.test(prompt)) {
    parts.push("Do not convert seated pose to standing.");
  }
  if (parts.length) return ` ${parts.join(" ")}`;
  return "";
}

/** Evita que Gemini enderece poses orgánicas con peso y asimetría natural. */
function buildAsymmetricPosePreservationSuffix(prompt: string): string {
  const hasShoulderTilt =
    /shoulders?\s+(?:frame-left|frame-right)\s+higher|frame-left\s+higher\s+~?\d|frame-right\s+higher\s+~?\d/i.test(
      prompt,
    );
  const hasHeadTilt = /head tilt|chin (?:up|down|tucked)|neck (?:tilt|lateral)/i.test(prompt);
  const hasWeightShift = /weight on frame-(?:left|right)|contrapposto|one side lower|lateral shift/i.test(
    prompt,
  );
  const hasRelaxedLimbs =
    /hand(?:s)?\s+(?:loose|dropped|hanging|relaxed|curled)|arm(?:s)?\s+hanging|loose grip|dropped/i.test(
      prompt,
    );
  const hasAsymmetry = /asymmetric|BODY WEIGHT & ASYMMETRY/i.test(prompt);
  const isCatalogSymmetric = /symmetrical upright catalog pose/i.test(prompt);

  if (isCatalogSymmetric && !hasShoulderTilt && !hasHeadTilt && !hasWeightShift && !hasRelaxedLimbs) {
    return "";
  }

  if (!hasShoulderTilt && !hasHeadTilt && !hasWeightShift && !hasRelaxedLimbs && !hasAsymmetry) {
    return "";
  }

  const parts: string[] = [];

  if (hasShoulderTilt) {
    parts.push("Preserve shoulder inclination exactly as described — do not level shoulders.");
  }
  if (hasHeadTilt) {
    parts.push("Preserve head and neck tilt exactly as described — do not straighten to upright catalog pose.");
  }
  if (hasWeightShift || hasRelaxedLimbs) {
    parts.push(
      "Preserve natural asymmetric body weight and relaxed limb hang — do not straighten to symmetrical catalog pose.",
    );
  } else if (parts.length === 0) {
    parts.push(
      "Preserve natural asymmetric body weight and relaxed limb hang — do not straighten to symmetrical catalog pose.",
    );
  }

  return parts.length ? ` ${parts.join(" ")}` : "";
}

/** Evita que Gemini alise el pelo documentado como desordenado o con viento. */
function buildHairMessPreservationSuffix(prompt: string): string {
  if (/very-groomed-editorial/i.test(prompt)) return "";

  const hasHairStyling =
    /Hair styling:\s*(?:tousled|messy-wild|windblown|casual-neat)/i.test(prompt) ||
    /flyaways|stray strands|uneven volume|displaced sections/i.test(prompt);

  if (!hasHairStyling) return "";

  return " Preserve hair disorder exactly as described — keep flyaways, uneven volume, and stray strands; do not smooth to salon-perfect hair.";
}

/** Refuerza desorden ambiental documentado — Gemini tiende a fondos ordenados. */
function buildEnvironmentDisorderSuffix(prompt: string): string {
  const hasDisorder =
    /Environment disorder:/i.test(prompt) ||
    /Order:\s*(?:cluttered|messy|chaotic)/i.test(prompt) ||
    /SURFACE CLUTTER/i.test(prompt) ||
    /lived-in|dirty|grimy/i.test(prompt);

  if (!hasDisorder) return "";

  return " Preserve environment disorder exactly as described — keep clutter, crooked alignment, and worn surfaces; do not tidy or clean the background.";
}

/** Refuerza imperfecciones de vestuario y props — arrugas, desgaste, manchas. */
function buildImperfectionPreservationSuffix(prompt: string): string {
  const hasImperfection =
    /Garment wear:/i.test(prompt) ||
    /wrinkles?|worn edges?|stains?|crooked|bunched|fabric bunching|uneven collar|asymmetric drape|peeling paint|scuffs?/i.test(
      prompt,
    );

  if (!hasImperfection) return "";

  return " Preserve visible imperfections exactly as described — keep wrinkles, worn edges, stains, and crooked alignment; do not press, iron, or restore props.";
}

/** Refuerza distorsión de lente y ángulo de cámara — Gemini corrige a 50mm nivelado. */
function buildLensCameraPreservationSuffix(prompt: string): string {
  if (/intentionally level neutral-lens/i.test(prompt)) return "";

  const hasDistortion =
    /ultra-wide|wide \(≈17|17–28mm|wide-angle|barrel distortion|lupa|magnifying-glass|edge stretch/i.test(
      prompt,
    );
  const hasPlacement =
    /Lens & camera:/i.test(prompt) ||
    hasDistortion ||
    /slight-low|slight-high|worm's-eye|bird's-eye|dutch/i.test(prompt);

  if (!hasPlacement) return "";

  const parts: string[] = [];

  if (hasDistortion) {
    parts.push(
      "Preserve lens distortion exactly as described — do not correct barrel distortion or change focal-length character.",
    );
  }

  if (/ultra-wide|10–16mm|≈1[0-6]mm/i.test(prompt)) {
    parts.push(
      "Keep ultra-wide magnifying-glass / lupa effect on nearest facial features — do not flatten face proportions.",
    );
  }

  if (/slight-low|low|worm's-eye/i.test(prompt)) {
    parts.push("Preserve low / slight-low camera angle — do not raise to eye-level.");
  }
  if (/slight-high|high|bird's-eye/i.test(prompt)) {
    parts.push("Preserve high / slight-high camera angle — do not lower to eye-level.");
  }
  if (/dutch\s+(?:slight|moderate|~)/i.test(prompt)) {
    parts.push("Preserve dutch tilt / roll exactly as described — do not straighten horizon.");
  }

  return ` ${parts.join(" ")}`;
}

/** Evita perspectiva de catálogo inmobiliario — Gemini endereza interiores y simetría. */
function buildPerspectiveImperfectionSuffix(prompt: string): string {
  if (/intentionally level neutral-lens/i.test(prompt)) return "";

  const hasPerspective =
    /Perspective imperfection:/i.test(prompt) ||
    /camera offset frame-(?:left|right)|offset frame-left|offset frame-right/i.test(prompt) ||
    /converge frame-(?:left|right)|horizontals.*tilt|not parallel to frame bottom/i.test(prompt) ||
    /foreground.*clipped|architectural catalog|real-estate/i.test(prompt) ||
    /PERSPECTIVE IMPERFECTION/i.test(prompt);

  if (!hasPerspective) return "";

  const parts = [
    "Preserve casual off-center perspective exactly as described — avoid real-estate or architectural straight-on symmetry.",
    "Keep slightly skewed horizontals and imperfect converging verticals — do not level tables, floors, or walls to a perfect grid.",
  ];

  if (/interior|cafe|kitchen|restaurant|room|studio|office|living/i.test(prompt)) {
    parts.push(
      "Interior must feel like a casual snapshot, not a staged property or catalog interior photograph.",
    );
  }

  if (/composition.*asymmetric|more space frame-(?:left|right)/i.test(prompt)) {
    parts.push("Preserve asymmetric composition and uneven negative space — do not center symmetrically.");
  }

  if (/foreground.*clipped|clipped object/i.test(prompt)) {
    parts.push("Preserve foreground object clipping at frame edge as described.");
  }

  return ` ${parts.join(" ")}`;
}

/** Evita que Gemini convierta figuras secundarias en retrato o simplifique arquitectura protagonista. */
function buildVisualHierarchyPreservationSuffix(prompt: string): string {
  const architectureHero =
    /Visual protagonist:\s*architecture/i.test(prompt) ||
    (/Visual protagonist:\s*environment/i.test(prompt) && /facade|building|balcony|architecture/i.test(prompt));
  const environmentHero = /Visual protagonist:\s*environment/i.test(prompt);
  const objectHero = /Visual protagonist:\s*object/i.test(prompt);
  const secondaryPerson =
    /Person role:\s*(?:secondary-figure|tiny-distant-figure)/i.test(prompt) ||
    /Person \(non-protagonist\)/i.test(prompt) ||
    /Pose verified \(secondary\)/i.test(prompt);

  if (!architectureHero && !environmentHero && !objectHero && !secondaryPerson) return "";

  const parts: string[] = [];

  if (architectureHero) {
    parts.push(
      "Preserve the building / architecture as the visual protagonist — keep exact facade geometry, balcony rhythm, materials, and scale; do not replace with a generic apartment block.",
    );
  } else if (environmentHero) {
    parts.push(
      "Preserve the environment / landscape as the visual protagonist — keep spatial dominance and setting character.",
    );
  } else if (objectHero) {
    parts.push("Preserve the object as the visual protagonist — do not shift focus to a person.");
  }

  if (secondaryPerson) {
    parts.push(
      "Any person remains a secondary tiny/distant figure at the same scale on the structure — do not enlarge, center, or portrait-light them; no face-forward hero framing.",
    );
  }

  if (/zigzag|stepped balcony|brutalist|distinctive geometry/i.test(prompt)) {
    parts.push("Keep distinctive architectural geometry exactly as described — do not simplify facade patterns.");
  }

  return parts.length ? ` ${parts.join(" ")}` : "";
}
