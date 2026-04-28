import { randomUUID } from "crypto";
import type {
  BrainAnalysisOrigin,
  BrainExtractedContext,
  BrainExtractedContextSourceType,
  BrainEvidenceItem,
} from "./brain-creative-memory-types";
import { BRAIN_EXTRACTED_CONTEXT_SCHEMA_VERSION } from "./brain-creative-memory-types";

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function pickString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function pickNumber(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function pickOrigin(v: unknown): BrainAnalysisOrigin | undefined {
  if (v === "remote_ai" || v === "local_heuristic" || v === "fallback" || v === "mock" || v === "manual") {
    return v;
  }
  return undefined;
}

function pickSourceType(v: unknown): BrainExtractedContextSourceType {
  if (v === "pdf" || v === "docx" || v === "image" || v === "url" || v === "txt" || v === "other") {
    return v;
  }
  return "other";
}

function normalizeEvidenceList(raw: unknown): BrainEvidenceItem[] {
  if (!Array.isArray(raw)) return [];
  const out: BrainEvidenceItem[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const id = pickString(item.id) ?? randomUUID();
    const sourceType = item.sourceType;
    if (
      sourceType !== "document" &&
      sourceType !== "image" &&
      sourceType !== "url" &&
      sourceType !== "manual" &&
      sourceType !== "analysis" &&
      sourceType !== "fallback" &&
      sourceType !== "mock"
    ) {
      continue;
    }
    const reason = pickString(item.reason);
    if (!reason) continue;
    out.push({
      id,
      sourceType,
      sourceId: pickString(item.sourceId),
      field: pickString(item.field),
      reason,
      confidence: pickNumber(item.confidence),
      createdAt: pickString(item.createdAt),
      brainVersion: pickNumber(item.brainVersion),
    });
  }
  return out;
}

/** Parsea JSON legado o objeto ya materializado. */
export function parseBrainExtractedContext(
  input: string | BrainExtractedContext | null | undefined,
): BrainExtractedContext | null {
  if (input == null) return null;
  if (typeof input === "object") {
    return normalizeBrainExtractedContext(input as unknown);
  }
  const trimmed = String(input).trim();
  if (!trimmed) return null;
  const parsed = safeJsonParse(trimmed);
  if (!parsed || !isRecord(parsed)) return null;
  return normalizeBrainExtractedContext(parsed);
}

export function normalizeBrainExtractedContext(raw: unknown): BrainExtractedContext | null {
  if (!isRecord(raw)) return null;
  const schemaVersion = pickString(raw.schemaVersion) ?? BRAIN_EXTRACTED_CONTEXT_SCHEMA_VERSION;
  const sourceType = pickSourceType(raw.sourceType);
  const summary = pickString(raw.summary);
  const claims = Array.isArray(raw.claims)
    ? raw.claims
        .map((c) => {
          if (!isRecord(c)) return null;
          const text = pickString(c.text) ?? "";
          if (!text) return null;
          const s = c.strength;
          const strength =
            s === "high" || s === "medium" || s === "low" ? (s as "high" | "medium" | "low") : undefined;
          return { text, strength };
        })
        .filter((c): c is NonNullable<typeof c> => Boolean(c))
    : undefined;
  const facts = Array.isArray(raw.facts)
    ? raw.facts
        .map((f) => (isRecord(f) ? { text: pickString(f.text) ?? "", sourceDocId: pickString(f.sourceDocId) } : null))
        .filter((f): f is NonNullable<typeof f> => Boolean(f && f.text))
    : undefined;
  const metrics = Array.isArray(raw.metrics)
    ? raw.metrics
        .map((m) => (isRecord(m) ? { name: pickString(m.name) ?? "", value: pickString(m.value) ?? "" } : null))
        .filter((m): m is NonNullable<typeof m> => Boolean(m && m.name))
    : undefined;
  const products = Array.isArray(raw.products)
    ? raw.products
        .map((p) => (isRecord(p) ? { text: pickString(p.text) ?? "" } : null))
        .filter((p): p is NonNullable<typeof p> => Boolean(p && p.text))
    : undefined;
  const people = Array.isArray(raw.people)
    ? raw.people
        .map((p) => (isRecord(p) ? { text: pickString(p.text) ?? "" } : null))
        .filter((p): p is NonNullable<typeof p> => Boolean(p && p.text))
    : undefined;
  const toneSignals = Array.isArray(raw.toneSignals)
    ? raw.toneSignals.map((t) => pickString(t)).filter(Boolean) as string[]
    : undefined;
  const visualSignals = Array.isArray(raw.visualSignals)
    ? raw.visualSignals
        .map((v) =>
          isRecord(v)
            ? {
                axis: pickString(v.axis),
                text: pickString(v.text) ?? "",
                confidence: pickNumber(v.confidence),
              }
            : null,
        )
        .filter((v): v is NonNullable<typeof v> => Boolean(v && v.text))
    : undefined;
  const contentSignals = Array.isArray(raw.contentSignals)
    ? raw.contentSignals
        .map((c) => (isRecord(c) ? { text: pickString(c.text) ?? "" } : null))
        .filter((c): c is NonNullable<typeof c> => Boolean(c && c.text))
    : undefined;
  const safetySignals = Array.isArray(raw.safetySignals)
    ? raw.safetySignals
        .map((s) => {
          if (!isRecord(s)) return null;
          const text = pickString(s.text) ?? "";
          if (!text) return null;
          const sev = s.severity;
          const severity =
            sev === "info" || sev === "warn" || sev === "block" ? (sev as "info" | "warn" | "block") : undefined;
          return { text, severity };
        })
        .filter((s): s is NonNullable<typeof s> => Boolean(s))
    : undefined;
  const evidence = normalizeEvidenceList(raw.evidence);
  const confidence = pickNumber(raw.confidence);
  const provider = pickString(raw.provider);
  const analysisOrigin = pickOrigin(raw.analysisOrigin);
  const createdAt = pickString(raw.createdAt);

  const hasAny =
    Boolean(summary) ||
    (claims && claims.length) ||
    (facts && facts.length) ||
    (metrics && metrics.length) ||
    (products && products.length) ||
    (people && people.length) ||
    (toneSignals && toneSignals.length) ||
    (visualSignals && visualSignals.length) ||
    (contentSignals && contentSignals.length) ||
    (safetySignals && safetySignals.length) ||
    evidence.length > 0 ||
    typeof confidence === "number";

  if (!hasAny) return null;

  return {
    schemaVersion,
    sourceType,
    summary,
    claims: claims?.length ? claims : undefined,
    facts: facts?.length ? facts : undefined,
    metrics: metrics?.length ? metrics : undefined,
    products: products?.length ? products : undefined,
    people: people?.length ? people : undefined,
    toneSignals: toneSignals?.length ? toneSignals : undefined,
    visualSignals: visualSignals?.length ? visualSignals : undefined,
    contentSignals: contentSignals?.length ? contentSignals : undefined,
    safetySignals: safetySignals?.length ? safetySignals : undefined,
    evidence: evidence.length ? evidence : undefined,
    confidence,
    provider,
    analysisOrigin,
    createdAt,
  };
}

export function serializeBrainExtractedContext(ctx: BrainExtractedContext): string {
  return JSON.stringify(ctx);
}

function joinLines(parts: string[], max = 80): string {
  const flat = parts.map((p) => p.trim()).filter(Boolean);
  const uniq = Array.from(new Set(flat));
  return uniq.slice(0, max).join("\n");
}

/** Texto semántico para embeddings (sin JSON ruidoso ni metadatos técnicos). */
export function buildEmbeddingTextFromExtractedContext(ctx: BrainExtractedContext | null | undefined): string {
  if (!ctx) return "";
  const blocks: string[] = [];
  if (ctx.summary) blocks.push(`Resumen: ${ctx.summary}`);
  if (ctx.claims?.length) blocks.push(`Claims:\n${joinLines(ctx.claims.map((c) => c.text))}`);
  if (ctx.facts?.length) blocks.push(`Hechos:\n${joinLines(ctx.facts.map((f) => f.text))}`);
  if (ctx.metrics?.length) {
    blocks.push(`Métricas:\n${joinLines(ctx.metrics.map((m) => `${m.name}: ${m.value}`))}`);
  }
  if (ctx.products?.length) blocks.push(`Producto:\n${joinLines(ctx.products.map((p) => p.text))}`);
  if (ctx.people?.length) blocks.push(`Personas:\n${joinLines(ctx.people.map((p) => p.text))}`);
  if (ctx.toneSignals?.length) blocks.push(`Tono:\n${joinLines(ctx.toneSignals)}`);
  if (ctx.visualSignals?.length) {
    blocks.push(
      `Señales visuales:\n${joinLines(
        ctx.visualSignals.map((v) => (v.axis ? `${v.axis}: ${v.text}` : v.text)),
      )}`,
    );
  }
  if (ctx.contentSignals?.length) blocks.push(`Contenido:\n${joinLines(ctx.contentSignals.map((c) => c.text))}`);
  if (ctx.safetySignals?.length) {
    blocks.push(`Seguridad:\n${joinLines(ctx.safetySignals.map((s) => s.text))}`);
  }
  return blocks.join("\n\n").trim();
}
