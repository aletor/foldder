export type DescriberAnalysisCategory =
  | "subject"
  | "wardrobe"
  | "camera"
  | "framing"
  | "lighting"
  | "color"
  | "environment"
  | "mood";

export const DESCRIBER_ANALYSIS_CATEGORY_ORDER: DescriberAnalysisCategory[] = [
  "subject",
  "wardrobe",
  "camera",
  "framing",
  "lighting",
  "color",
  "environment",
  "mood",
];

const SECTION_PATTERNS: Record<DescriberAnalysisCategory, RegExp> = {
  subject: /SUBJECT\s*&\s*POSE/i,
  wardrobe: /WARDROBE\s*&\s*TEXT/i,
  camera: /\bCAMERA\b/i,
  framing: /COMPOSITION\s*&\s*FRAMING|FINAL OUTPUT FRAMING/i,
  lighting: /\bLIGHTING\b/i,
  color: /COLOR\s*GRADE/i,
  environment: /ENVIRONMENT\s*&\s*PROPS/i,
  mood: /MOOD,\s*ATMOSPHERE\s*&\s*STYLE/i,
};

/** True when the vision model returned our required structured describer format. */
export function isValidDescriberStructuredOutput(description: string): boolean {
  const text = description.trim();
  if (!text) return false;
  return /SUBJECT\s*&\s*POSE:/i.test(text);
}

/** Which structured blocks are present in a describer vision output. */
export function parseDescriberAnalysisStatus(description: string): Record<DescriberAnalysisCategory, boolean> {
  const text = description.trim();
  const empty = Object.fromEntries(
    DESCRIBER_ANALYSIS_CATEGORY_ORDER.map((id) => [id, false]),
  ) as Record<DescriberAnalysisCategory, boolean>;

  if (!text) return empty;

  for (const id of DESCRIBER_ANALYSIS_CATEGORY_ORDER) {
    empty[id] = SECTION_PATTERNS[id].test(text);
  }
  return empty;
}

/** Icons reflect parsed sections only — never assume all done for unstructured text. */
export function resolveDescriberAnalysisDisplay(
  description: string,
): Record<DescriberAnalysisCategory, boolean> {
  return parseDescriberAnalysisStatus(description);
}
