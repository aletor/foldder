import type { GalleryCategoryBrief } from "./brand-kit-types";
import { GALLERY_CATEGORY_ORDER, GALLERY_CATEGORY_SLOT_COUNT } from "./brand-kit-gallery-plan";
import {
  normalizeGalleryCategoryBrief,
  parseGalleryBriefVariantsFromRaw,
} from "./brand-kit-gallery-brief-variants";

const CATEGORY_SET = new Set(GALLERY_CATEGORY_ORDER);

export type GalleryCategoryBriefBatchRaw = {
  category: string;
  description: string;
  promptHint?: string;
  confidence: string;
  variants?: Array<{ description?: string; promptHint?: string }>;
};

export function parseGalleryCategoryBriefsFromBatch(
  raw: unknown,
  evidenceCount: number,
): GalleryCategoryBrief[] | null {
  if (!raw || typeof raw !== "object") return null;
  const items = (raw as { galleryCategoryBriefs?: unknown }).galleryCategoryBriefs;
  if (!Array.isArray(items)) return null;

  const parsed: GalleryCategoryBrief[] = [];
  for (const entry of items) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as GalleryCategoryBriefBatchRaw;
    if (!CATEGORY_SET.has(row.category as (typeof GALLERY_CATEGORY_ORDER)[number])) continue;
    const description = row.description?.trim();
    if (!description) continue;
    const variants = parseGalleryBriefVariantsFromRaw(
      row.category as GalleryCategoryBrief["category"],
      row,
    );
    if (!variants || variants.length < GALLERY_CATEGORY_SLOT_COUNT) continue;
    const confidence =
      row.confidence === "high" || row.confidence === "medium" || row.confidence === "low"
        ? row.confidence
        : "medium";
    parsed.push(
      normalizeGalleryCategoryBrief({
        category: row.category as GalleryCategoryBrief["category"],
        description,
        promptHint: variants[0]?.promptHint ?? row.promptHint?.trim() ?? "",
        variants,
        confidence,
        evidenceCount,
      }),
    );
  }

  if (!parsed.length) return null;
  const byCategory = new Map(parsed.map((entry) => [entry.category, entry]));
  const ordered = GALLERY_CATEGORY_ORDER.map((category) => byCategory.get(category)).filter(
    (entry): entry is GalleryCategoryBrief => Boolean(entry),
  );
  if (ordered.length !== GALLERY_CATEGORY_ORDER.length) return null;
  return ordered;
}

export const GALLERY_CATEGORY_BRIEFS_JSON_SHAPE = `"galleryCategoryBriefs": [
  {
    "category": "people_mood",
    "description": "Párrafo único: esencia de personas y mood para la marca (no listar variantes).",
    "confidence": "high",
    "variants": [
      { "description": "Retrato editorial", "promptHint": "Distinct English prompt for variant 1" },
      { "description": "Momento candido", "promptHint": "Distinct English prompt for variant 2" },
      { "description": "Retrato ambiental", "promptHint": "Distinct English prompt for variant 3" },
      { "description": "Gesto o interacción", "promptHint": "Distinct English prompt for variant 4" }
    ]
  }
]`;
