import { randomUUID } from "crypto";
import type { BrainStrategy, KnowledgeDocumentEntry } from "@/app/spaces/project-assets-metadata";
import type { BrainEvidenceItem, ContentDna } from "./brain-creative-memory-types";
import { parseBrainExtractedContext } from "./brain-extracted-context";

function clean(s: string, max = 400): string {
  return s.replace(/\s+/g, " ").trim().slice(0, max);
}

function uniqueLines(lines: string[], max: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of lines) {
    const t = clean(raw, 500);
    if (t.length < 3) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

function evidenceFrom(
  sourceType: BrainEvidenceItem["sourceType"],
  reason: string,
  confidence: number,
  brainVersion?: number,
): BrainEvidenceItem {
  return {
    id: randomUUID(),
    sourceType,
    reason,
    confidence,
    ...(typeof brainVersion === "number" ? { brainVersion } : {}),
  };
}

/**
 * Construye / enriquece Content DNA solo desde fuentes defendibles (documentos analizados, hechos, estrategia).
 * Las inferencias amplias van con menor `confidence` y `sourceType: "analysis"`.
 */
export function buildContentDnaFromBrainSources(input: {
  documents: KnowledgeDocumentEntry[];
  corporateContext: string;
  strategy: BrainStrategy;
  existingContentDna?: ContentDna | null;
  brainVersion?: number;
}): ContentDna {
  const { documents, corporateContext, strategy } = input;
  const bv = input.brainVersion ?? 1;
  const evidence: BrainEvidenceItem[] = [];

  const pillars = uniqueLines(
    [
      ...strategy.approvedPatterns,
      ...strategy.messageBlueprints.map((b) => b.claim).filter(Boolean),
      ...(input.existingContentDna?.contentPillars ?? []),
    ],
    14,
  );

  const topicsFromStrategy = uniqueLines(
    [
      ...strategy.factsAndEvidence.filter((f) => f.verified || f.strength === "fuerte").map((f) => f.claim),
      ...strategy.funnelMessages.map((m) => m.text),
    ],
    18,
  );

  const topicsFromDocs: string[] = [];
  const claimsFromStructured: string[] = [];
  for (const doc of documents) {
    if (doc.status !== "Analizado") continue;
    const structured = doc.extractedContextStructured ?? parseBrainExtractedContext(doc.extractedContext ?? "");
    if (!structured) continue;
    if (structured.summary) topicsFromDocs.push(structured.summary);
    for (const c of structured.claims ?? []) {
      if (c.text) claimsFromStructured.push(c.text);
    }
    for (const f of structured.facts ?? []) {
      if (f.text) claimsFromStructured.push(f.text);
    }
  }

  const topics = uniqueLines([...topicsFromStrategy, ...topicsFromDocs.map((t) => t.slice(0, 220)), ...claimsFromStructured], 24);

  const approvedFromFacts = strategy.factsAndEvidence
    .filter((f) => f.verified && f.claim.trim())
    .map((f) => clean(f.claim, 220));
  const approvedFromStrategy = [...strategy.approvedPhrases, ...strategy.preferredTerms].map((s) => clean(s, 200)).filter(Boolean);
  const approvedClaims = uniqueLines([...approvedFromFacts, ...approvedFromStrategy], 28);

  const forbiddenClaims = uniqueLines(
    [...strategy.tabooPhrases, ...strategy.forbiddenTerms, ...(input.existingContentDna?.forbiddenClaims ?? [])],
    36,
  );

  const narrativeAngles = strategy.messageBlueprints.slice(0, 8).map((b) => `${clean(b.claim, 160)} · ${b.stage}`);

  if (corporateContext.trim().length > 40) {
    evidence.push(
      evidenceFrom("document", "Resumen corporativo derivado de documentos analizados.", 0.62, bv),
    );
  }
  if (approvedFromFacts.length) {
    evidence.push(evidenceFrom("document", "Claims aprobados anclados a factsAndEvidence verificados.", 0.72, bv));
  }
  topicsFromDocs.length &&
    evidence.push(evidenceFrom("analysis", "Temas inferidos desde extractedContextStructured (revisar antes de publicar).", 0.42, bv));

  const inferredBoost = topicsFromDocs.length > 0 ? 0.08 : 0;
  const confidence = Math.min(0.88, 0.48 + Math.min(0.22, approvedFromFacts.length * 0.03) + inferredBoost);

  return {
    schemaVersion: "1.1.0",
    brandVoice: strategy.voiceExamples?.length
      ? { examples: strategy.voiceExamples.slice(0, 12) }
      : input.existingContentDna?.brandVoice,
    editorialTone: strategy.languageTraits?.length
      ? { traits: strategy.languageTraits.slice(0, 14) }
      : input.existingContentDna?.editorialTone,
    audienceProfiles: strategy.personas.slice(0, 8).length
      ? strategy.personas.slice(0, 8)
      : input.existingContentDna?.audienceProfiles ?? [],
    contentPillars: pillars.length ? pillars : input.existingContentDna?.contentPillars ?? [],
    topics: topics.length ? topics : input.existingContentDna?.topics ?? [],
    trendOpportunities: input.existingContentDna?.trendOpportunities ?? [],
    preferredFormats: input.existingContentDna?.preferredFormats?.length
      ? input.existingContentDna.preferredFormats
      : ["artículo largo", "post corto", "carrusel", "email", "guion corto"],
    articleStructures: input.existingContentDna?.articleStructures?.length
      ? input.existingContentDna.articleStructures
      : ["problema-solución", "lista con CTA", "historia + lección", "entrevista"],
    ctaStyle: strategy.messageBlueprints[0]?.cta ?? input.existingContentDna?.ctaStyle,
    forbiddenClaims,
    approvedClaims,
    writingDo: uniqueLines([...(strategy.approvedPhrases ?? [])], 14),
    writingAvoid: uniqueLines([...(strategy.tabooPhrases ?? [])], 14),
    narrativeAngles: narrativeAngles.length ? narrativeAngles : input.existingContentDna?.narrativeAngles ?? [],
    readingLevel: input.existingContentDna?.readingLevel,
    evidence,
    confidence,
    updatedAt: new Date().toISOString(),
  };
}
