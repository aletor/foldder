import { randomUUID } from "crypto";
import type { BrainAnalysisOrigin, BrainExtractedContext, BrainExtractedContextSourceType } from "./brain-creative-memory-types";
import { BRAIN_EXTRACTED_CONTEXT_SCHEMA_VERSION } from "./brain-creative-memory-types";
import { buildEmbeddingTextFromExtractedContext, normalizeBrainExtractedContext, parseBrainExtractedContext } from "./brain-extracted-context";

function clean(s: unknown, max = 400): string {
  if (typeof s !== "string") return "";
  return s.replace(/\s+/g, " ").trim().slice(0, max);
}

function readStringArray(obj: Record<string, unknown> | null, key: string): string[] {
  if (!obj) return [];
  const v = obj[key];
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((x) => clean(x, 220)).filter(Boolean) : [];
}

function docFormatToSourceType(format?: string, type?: string, mime?: string): BrainExtractedContextSourceType {
  if (format === "pdf") return "pdf";
  if (format === "docx") return "docx";
  if (format === "url") return "url";
  if (format === "txt" || format === "html") return "txt";
  if (format === "image" || type === "image" || (mime && mime.startsWith("image/"))) return "image";
  return "other";
}

/**
 * Mapea el JSON «robusto» legacy de extractDnaFromTextRobust / extractDnaFromImageRobust
 * al contrato `BrainExtractedContext` (convive con el string JSON en `extractedContext`).
 */
export function robustDnaJsonToBrainExtractedContext(
  extractedData: Record<string, unknown>,
  doc: { id: string; name: string; format?: string; type?: string; mime?: string },
): BrainExtractedContext {
  const empresa = extractedData.empresa && typeof extractedData.empresa === "object"
    ? (extractedData.empresa as Record<string, unknown>)
    : null;
  const producto = extractedData.producto && typeof extractedData.producto === "object"
    ? (extractedData.producto as Record<string, unknown>)
    : null;
  const audiencia = extractedData.audiencia && typeof extractedData.audiencia === "object"
    ? (extractedData.audiencia as Record<string, unknown>)
    : null;

  const summaryParts = [
    clean(empresa?.propuesta_valor, 320),
    clean(extractedData.diferencial_competitivo, 260),
    clean(extractedData.tono_marca, 200),
  ].filter(Boolean);
  const summary = summaryParts.join(" · ").slice(0, 900) || undefined;

  const claims = [
    ...readStringArray(empresa, "diferenciadores"),
    clean(extractedData.diferencial_competitivo, 220),
    clean(empresa?.propuesta_valor, 220),
  ]
    .filter(Boolean)
    .slice(0, 24)
    .map((text) => ({ text }));

  const metrics = readStringArray(extractedData, "data_relevante_numerica").map((line) => {
    const m = line.match(/^([^:]+):\s*(.+)$/);
    return m ? { name: m[1].trim(), value: m[2].trim() } : { name: "métrica", value: line };
  });

  const products = [
    ...readStringArray(producto, "beneficios"),
    ...readStringArray(producto, "funcionalidades"),
  ]
    .slice(0, 20)
    .map((text) => ({ text }));

  const people = [...readStringArray(audiencia, "necesidades"), ...readStringArray(audiencia, "perfiles")]
    .slice(0, 16)
    .map((text) => ({ text }));

  const toneSignals = [clean(extractedData.tono_marca, 200), ...readStringArray(extractedData, "rasgos_tono")]
    .filter(Boolean)
    .slice(0, 12);

  const visualSignals: BrainExtractedContext["visualSignals"] = [];
  const vs = extractedData.visual_signals && typeof extractedData.visual_signals === "object"
    ? (extractedData.visual_signals as Record<string, unknown>)
    : null;
  if (vs) {
    for (const axis of ["protagonist", "environment", "textures", "people", "tone"] as const) {
      for (const line of readStringArray(vs, axis)) {
        visualSignals.push({ axis, text: line, confidence: 0.55 });
      }
    }
  }

  const evidence = [
    {
      id: randomUUID(),
      sourceType: "document" as const,
      sourceId: doc.id,
      field: "robust_dna",
      reason: `Análisis knowledge de «${doc.name}» (origen remoto o heurístico según ruta de ingestión).`,
      confidence: 0.65,
    },
  ];

  return normalizeBrainExtractedContext({
    schemaVersion: BRAIN_EXTRACTED_CONTEXT_SCHEMA_VERSION,
    sourceType: docFormatToSourceType(doc.format, doc.type, doc.mime),
    summary,
    claims: claims.length ? claims : undefined,
    metrics: metrics.length ? metrics : undefined,
    products: products.length ? products : undefined,
    people: people.length ? people : undefined,
    toneSignals: toneSignals.length ? toneSignals : undefined,
    visualSignals: visualSignals.length ? visualSignals : undefined,
    evidence,
    analysisOrigin: "remote_ai",
    confidence: 0.62,
  })!;
}

/** Texto semántico para embeddings: prioriza contexto tipado; si no, deriva del JSON robusto. */
export function buildEmbeddingInputForAnalyzedDocument(extractedContextJson: string, extractedData?: Record<string, unknown> | null): string {
  const typed = parseBrainExtractedContext(extractedContextJson);
  if (typed) {
    const t = buildEmbeddingTextFromExtractedContext(typed);
    if (t.trim().length > 40) return t;
  }
  if (extractedData && typeof extractedData === "object") {
    const synthetic = robustDnaJsonToBrainExtractedContext(extractedData, {
      id: "inline",
      name: "document",
    });
    const t2 = buildEmbeddingTextFromExtractedContext(synthetic);
    if (t2.trim().length > 40) return t2;
  }
  return extractedContextJson.replace(/\s+/g, " ").trim().slice(0, 12000);
}
