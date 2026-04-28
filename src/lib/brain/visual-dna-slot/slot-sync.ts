import type { ProjectAssetsMetadata } from "@/app/spaces/project-assets-metadata";
import { collectVisualImageAssetRefs } from "@/lib/brain/brain-visual-analysis";
import { analysisEligibleForKnowledgeVisualDnaSlot } from "./analysis-eligible";
import { createVisualDnaSlotFromImage, normalizeVisualDnaSlots } from "./normalize";
import type { VisualDnaSlot } from "./types";

/** IDs de documento cuyo slot se borró a mano; solo se conservan si el documento sigue en el pozo. */
export function normalizeVisualDnaSlotSuppressedSourceIds(
  raw: unknown,
  existingDocumentIds: ReadonlySet<string>,
): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of raw) {
    if (typeof x !== "string") continue;
    const id = x.trim();
    if (!id || seen.has(id)) continue;
    if (!existingDocumentIds.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * Imágenes de conocimiento con análisis listo y URL/data para visión, que aún no tienen slot.
 */
export function listKnowledgeImageRefsMissingVisualDnaSlot(assets: ProjectAssetsMetadata): Array<{
  ref: ReturnType<typeof collectVisualImageAssetRefs>[number];
  analysis: NonNullable<ProjectAssetsMetadata["strategy"]["visualReferenceAnalysis"]>["analyses"][number];
}> {
  const slots = normalizeVisualDnaSlots(assets.strategy.visualDnaSlots);
  const byDoc = new Set(slots.map((s) => s.sourceDocumentId).filter(Boolean));
  const docIds = new Set(assets.knowledge.documents.map((d) => d.id));
  const suppressed = new Set(
    normalizeVisualDnaSlotSuppressedSourceIds(assets.strategy.visualDnaSlotSuppressedSourceIds, docIds),
  );
  const analyses = assets.strategy.visualReferenceAnalysis?.analyses ?? [];
  const byAsset = new Map(analyses.map((a) => [a.sourceAssetId, a]));
  const refs = collectVisualImageAssetRefs(assets).filter((r) => r.sourceKind === "knowledge_document");
  const out: Array<{ ref: (typeof refs)[number]; analysis: (typeof analyses)[number] }> = [];
  for (const ref of refs) {
    if (!ref.imageUrlForVision?.trim()) continue;
    if (suppressed.has(ref.id)) continue;
    if (byDoc.has(ref.id)) continue;
    const a = byAsset.get(ref.id);
    if (!a || !analysisEligibleForKnowledgeVisualDnaSlot(a)) continue;
    out.push({ ref, analysis: a });
  }
  return out;
}

export function appendKnowledgeImageVisualDnaSlots(assets: ProjectAssetsMetadata): {
  nextSlots: VisualDnaSlot[];
  appended: VisualDnaSlot[];
} {
  const existing = normalizeVisualDnaSlots(assets.strategy.visualDnaSlots);
  const missing = listKnowledgeImageRefsMissingVisualDnaSlot(assets);
  const appended: VisualDnaSlot[] = [];
  for (const { ref, analysis } of missing) {
    appended.push(
      createVisualDnaSlotFromImage({
        ref,
        analysis,
        brainMeta: assets.brainMeta,
      }),
    );
  }
  return { nextSlots: [...existing, ...appended], appended };
}
