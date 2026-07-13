import type { GalleryCategoryBrief } from "./brand-kit-types";
import { GALLERY_CATEGORY_ORDER } from "./brand-kit-gallery-plan";

const CATEGORY_SET = new Set(GALLERY_CATEGORY_ORDER);

export type GalleryCategoryBriefBatchRaw = {
  category: string;
  description: string;
  promptHint: string;
  confidence: string;
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
    const promptHint = row.promptHint?.trim();
    if (!description || !promptHint) continue;
    const confidence =
      row.confidence === "high" || row.confidence === "medium" || row.confidence === "low"
        ? row.confidence
        : "medium";
    parsed.push({
      category: row.category as GalleryCategoryBrief["category"],
      description,
      promptHint,
      confidence,
      evidenceCount,
    });
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
    "description": "Descripción concreta en español de personas y mood",
    "promptHint": "Concrete English image prompt for people and mood",
    "confidence": "high"
  },
  {
    "category": "places",
    "description": "Interior vacío de estudio con luz rasante desde ventanal lateral; suelo de hormigón pulido y paredes blancas, sin personas.",
    "promptHint": "Empty modern studio interior, polished concrete floor, side window light, no people, no furniture clutter",
    "confidence": "medium"
  },
  {
    "category": "objects",
    "description": "…",
    "promptHint": "…",
    "confidence": "high"
  },
  {
    "category": "textures",
    "description": "Macro de lino crudo con trama visible y sombras rasantes que marcan el grano; acabado mate, sin brillo especular.",
    "promptHint": "Macro full-frame raw linen fabric weave, matte finish, visible thread grain, raking light, no people or objects",
    "confidence": "medium"
  },
  {
    "category": "general",
    "description": "…",
    "promptHint": "…",
    "confidence": "high"
  }
]`;
