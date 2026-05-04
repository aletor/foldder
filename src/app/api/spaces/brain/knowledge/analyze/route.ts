import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import sharp from "sharp";
import {
  ApiServiceDisabledError,
  assertApiServiceEnabled,
} from "@/lib/api-usage-controls";
import { recordApiUsage, resolveUsageUserEmailFromRequest } from "@/lib/api-usage";
import { getFromS3 } from "@/lib/s3-utils";
import { parseBrainDocument } from "@/lib/brain-parser-utils";
import {
  buildReadableCorporateContext,
  extractDnaFromImageRobust,
  extractDnaFromTextRobust,
  type BrainDnaExtraction,
  type BrainOpenAiChatUsageHook,
} from "@/lib/brain-knowledge-utils";
import {
  AUDIENCE_PERSONA_CATALOG,
  type BrainFactEvidence,
  type BrainFunnelMessage,
  type BrainMessageBlueprint,
  type BrainPersona,
  type BrainStrategy,
  type BrainVisualStyle,
  type BrainVisualStyleSlotKey,
  type BrainVoiceExample,
  defaultBrainVisualStyle,
  type KnowledgeDocumentEntry,
} from "@/app/spaces/project-assets-metadata";
import { enrichStrategyCreativeMemory } from "@/lib/brain/brain-strategy-creative-enrich";
import {
  markBrainStale,
  normalizeBrainMeta,
  touchBrainMetaAfterKnowledgeAnalysis,
} from "@/lib/brain/brain-meta";
import { canWriteBrainScope } from "@/lib/brain/brain-scope-policy";
import { BRAIN_STALE_REASON } from "@/lib/brain/brain-stale-reasons";
import {
  mergeBlueprintsPreferPrevious,
  mergeFactsAndEvidenceWithPriority,
  mergeFunnelMessagesPreferPrevious,
  mergeStringListsOrdered,
  mergeVoiceExamplesPreferPrevious,
} from "@/lib/brain/brain-merge-strategy-priority";
import { hasTrustedRemoteVisionAnalyses } from "@/lib/brain/brain-merge-signals";
import { buildEmbeddingInputForAnalyzedDocument, robustDnaJsonToBrainExtractedContext } from "@/lib/brain/brain-robust-dna-bridge";
import { shouldAnalyzeBrainDocument } from "@/lib/brain/brain-document-status";
import type { BrainExtractedContext } from "@/lib/brain/brain-creative-memory-types";

type BrainDoc = {
  id: string;
  name: string;
  size: number;
  mime: string;
  scope?: "core" | "context";
  brainSourceScope?: "brand" | "project" | "capsule";
  s3Path?: string;
  type?: "document" | "image";
  format?: "pdf" | "docx" | "txt" | "html" | "url" | "image";
  status?: "Subido" | "Analizado" | "Error";
  workflowStatus?: string;
  retryCount?: number;
  maxRetries?: number;
  lastError?: string;
  lastAttemptAt?: string;
  analyzedAt?: string;
  analysisProvider?: "openai" | "gemini" | "internal" | "none";
  analysisOrigin?: "remote_ai" | "local_heuristic" | "fallback" | "mock" | "manual";
  analysisReliability?: "high" | "medium" | "low";
  isReliableForGeneration?: boolean;
  extractedContextStructured?: BrainExtractedContext;
  uploadedAt?: string;
  extractedContext?: string;
  originalSourceUrl?: string;
  embedding?: number[];
  errorMessage?: string;
  insights?: {
    claims: string[];
    metrics: string[];
    potentialUse: string[];
    freshness: string;
    reliability: number;
    usedInPieces: string[];
  };
};

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type AnalyzeUsageQueue = Promise<void>[];

function enqueueOpenAiUsage(
  queue: AnalyzeUsageQueue,
  partial: Parameters<typeof recordApiUsage>[0],
): void {
  queue.push(recordApiUsage(partial));
}

type StrategyAutofill = {
  voiceExamples: BrainVoiceExample[];
  tabooPhrases: string[];
  approvedPhrases: string[];
  languageTraits: string[];
  syntaxPatterns: string[];
  preferredTerms: string[];
  forbiddenTerms: string[];
  channelIntensity: Array<{ channel: string; intensity: number }>;
  allowAbsoluteClaims: boolean;
  funnelMessages: BrainFunnelMessage[];
  messageBlueprints: BrainMessageBlueprint[];
  factsAndEvidence: BrainFactEvidence[];
  personaIds: string[];
  visualStyle: BrainVisualStyle;
};

const FUNNEL_STAGES: BrainFunnelMessage["stage"][] = [
  "awareness",
  "consideration",
  "conversion",
  "retention",
];

function cleanText(input: unknown, max = 260): string {
  if (typeof input !== "string") return "";
  return input.replace(/\s+/g, " ").trim().slice(0, max);
}

function isImageAnalysisFallbackEligible(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /429|quota|billing|rate limit|insufficient_quota|OpenAI|vision/i.test(message);
}

function hexFromRgb(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

async function buildLocalImageDnaFallback(
  buffer: Buffer,
  doc: Pick<BrainDoc, "name" | "mime">,
  reason: unknown,
): Promise<BrainDnaExtraction> {
  let width = 0;
  let height = 0;
  let colors: string[] = [];
  try {
    const image = sharp(buffer, { failOn: "none" });
    const meta = await image.metadata();
    width = meta.width ?? 0;
    height = meta.height ?? 0;
    const { data, info } = await image
      .resize(64, 64, { fit: "inside", withoutEnlargement: true })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const buckets = new Map<string, number>();
    for (let i = 0; i + 2 < data.length; i += info.channels) {
      const r = Math.round(data[i] / 32) * 32;
      const g = Math.round(data[i + 1] / 32) * 32;
      const b = Math.round(data[i + 2] / 32) * 32;
      const hex = hexFromRgb(r, g, b);
      buckets.set(hex, (buckets.get(hex) ?? 0) + 1);
    }
    colors = [...buckets.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([hex]) => hex)
      .slice(0, 8);
  } catch {
    colors = [];
  }

  const reasonText = reason instanceof Error ? reason.message : String(reason ?? "Análisis remoto no disponible");
  const dimensionText = width && height ? `${width}x${height}px` : "dimensiones no disponibles";
  return {
    empresa: {
      propuesta_valor: "",
      sector: "",
      diferenciadores: [],
    },
    audiencia: { perfil_cliente: "", problemas_principales: [], necesidades: [] },
    producto: { funcionalidades: [], beneficios: [] },
    casos_uso: [],
    mercado: {
      tam: "",
      sam: "",
      som: "",
      horizonte_temporal: "",
      segmento_objetivo: "",
      indicadores_clave: [],
    },
    data_relevante_numerica: [],
    diferencial_competitivo: "",
    tono_marca: "Referencia visual pendiente de interpretación remota",
    visual_signals: {
      protagonist: [`Referencia visual importada: ${doc.name}`],
      environment: [],
      textures: [],
      colors,
      people: [],
      tone: ["Análisis local de emergencia; usar la visión remota del LOOK para interpretación semántica"],
      evidence_text: [
        `Imagen ${doc.mime || "image/*"} · ${dimensionText}`,
        `Fallback local activado porque OpenAI no pudo analizar la imagen: ${reasonText.slice(0, 220)}`,
      ],
    },
  };
}

function sanitizeVoiceExamples(raw: unknown): BrainVoiceExample[] {
  if (!Array.isArray(raw)) return [];
  const out: BrainVoiceExample[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const x = item as Record<string, unknown>;
    const kind =
      x.kind === "approved_voice" ||
      x.kind === "forbidden_voice" ||
      x.kind === "good_piece" ||
      x.kind === "bad_piece"
        ? x.kind
        : "approved_voice";
    const text = cleanText(x.text, 420);
    if (!text) continue;
    out.push({
      id: crypto.randomUUID(),
      kind,
      label: cleanText(x.label, 60) || undefined,
      text,
    });
    if (out.length >= 18) break;
  }
  return out;
}

function sanitizeMessages(raw: unknown): BrainFunnelMessage[] {
  if (!Array.isArray(raw)) return [];
  const out: BrainFunnelMessage[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const x = item as Record<string, unknown>;
    const stage = FUNNEL_STAGES.includes(x.stage as BrainFunnelMessage["stage"])
      ? (x.stage as BrainFunnelMessage["stage"])
      : "awareness";
    const text = cleanText(x.text, 260);
    if (!text) continue;
    out.push({ id: crypto.randomUUID(), stage, text });
    if (out.length >= 16) break;
  }
  return out;
}

function uniqueStrings(values: string[], limit = 24): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const v = cleanText(value, 180);
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
    if (out.length >= limit) break;
  }
  return out;
}

function parseExtractedContext(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function readStringArray(obj: Record<string, unknown> | null, key: string): string[] {
  if (!obj) return [];
  const value = obj[key];
  return Array.isArray(value)
    ? value.filter((x): x is string => typeof x === "string").map((x) => cleanText(x, 220)).filter(Boolean)
    : [];
}

function freshnessLabel(uploadedAt?: string): string {
  if (!uploadedAt) return "sin fecha";
  const ts = Date.parse(uploadedAt);
  if (!Number.isFinite(ts)) return "sin fecha";
  const days = Math.floor((Date.now() - ts) / (1000 * 60 * 60 * 24));
  if (days <= 30) return "reciente";
  if (days <= 180) return "vigente";
  return "desactualizable";
}

function reliabilityScore(doc: BrainDoc, metricsCount: number): number {
  let score = 45;
  if (doc.scope !== "context") score += 20;
  if (doc.originalSourceUrl) score += 8;
  if (doc.status === "Analizado") score += 12;
  score += Math.min(15, metricsCount * 2);
  return Math.max(0, Math.min(100, score));
}

function inferPotentialUse(claims: string[], metrics: string[], scope?: "core" | "context"): string[] {
  const out: string[] = [];
  if (claims.length > 0) out.push("Narrativa de propuesta de valor");
  if (metrics.length > 0) out.push("Prueba numérica para claims");
  if (scope === "context") out.push("Benchmark de mercado y competencia");
  if (claims.some((c) => /funnel|conversion|retencion|awareness/i.test(c))) out.push("Mensajes por etapa de funnel");
  return uniqueStrings(out, 4);
}

function buildDocInsights(doc: BrainDoc, extractedData: Record<string, unknown>): BrainDoc["insights"] {
  const empresa = extractedData.empresa && typeof extractedData.empresa === "object"
    ? (extractedData.empresa as Record<string, unknown>)
    : null;
  const producto = extractedData.producto && typeof extractedData.producto === "object"
    ? (extractedData.producto as Record<string, unknown>)
    : null;
  const dataNumerica = Array.isArray(extractedData.data_relevante_numerica)
    ? extractedData.data_relevante_numerica.filter((x): x is string => typeof x === "string")
    : [];

  const claims = uniqueStrings(
    [
      cleanText(empresa?.propuesta_valor, 220),
      cleanText(extractedData.diferencial_competitivo, 220),
      ...readStringArray(empresa, "diferenciadores"),
      ...readStringArray(producto, "beneficios"),
    ].filter(Boolean) as string[],
    8,
  );
  const metrics = uniqueStrings(dataNumerica, 10);
  return {
    claims,
    metrics,
    potentialUse: inferPotentialUse(claims, metrics, doc.scope),
    freshness: freshnessLabel(doc.uploadedAt),
    reliability: reliabilityScore(doc, metrics.length),
    usedInPieces: [],
  };
}

function computeFactsAndEvidence(docs: BrainDoc[]): BrainFactEvidence[] {
  const facts: BrainFactEvidence[] = [];
  const seen = new Set<string>();
  for (const doc of docs) {
    if (doc.status !== "Analizado" || typeof doc.extractedContext !== "string") continue;
    const parsed = parseExtractedContext(doc.extractedContext);
    if (!parsed) continue;

    const claims = [
      ...(doc.insights?.claims || []),
      ...readStringArray(parsed.empresa && typeof parsed.empresa === "object" ? (parsed.empresa as Record<string, unknown>) : null, "diferenciadores"),
      cleanText(parsed.diferencial_competitivo, 220),
      cleanText(parsed.empresa && typeof parsed.empresa === "object" ? (parsed.empresa as Record<string, unknown>).propuesta_valor : "", 220),
    ].filter(Boolean) as string[];
    const evidence = [
      ...(doc.insights?.metrics || []),
      ...readStringArray(parsed, "data_relevante_numerica"),
    ];

    for (const claim of uniqueStrings(claims, 12)) {
      const key = claim.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const hasEvidence = evidence.length > 0;
      const strength: BrainFactEvidence["strength"] = hasEvidence
        ? evidence.some((e) => /\d/.test(e))
          ? "fuerte"
          : "media"
        : "debil";
      facts.push({
        id: crypto.randomUUID(),
        claim,
        evidence: uniqueStrings(evidence, 4),
        sourceDocIds: [doc.id],
        strength,
        verified: hasEvidence,
        interpreted: !hasEvidence,
      });
      if (facts.length >= 60) return facts;
    }
  }
  return facts;
}

function sanitizeBlueprints(raw: unknown): BrainMessageBlueprint[] {
  if (!Array.isArray(raw)) return [];
  const out: BrainMessageBlueprint[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const x = item as Record<string, unknown>;
    const claim = cleanText(x.claim, 220);
    if (!claim) continue;
    out.push({
      id: crypto.randomUUID(),
      claim,
      support: cleanText(x.support, 220),
      audience: cleanText(x.audience, 120),
      channel: cleanText(x.channel, 80),
      stage:
        x.stage === "awareness" ||
        x.stage === "consideration" ||
        x.stage === "conversion" ||
        x.stage === "retention"
          ? x.stage
          : "awareness",
      cta: cleanText(x.cta, 120),
      evidence: Array.isArray(x.evidence)
        ? x.evidence.filter((y): y is string => typeof y === "string").map((y) => cleanText(y, 180)).filter(Boolean)
        : [],
    });
    if (out.length >= 30) break;
  }
  return out;
}

function tokenSet(input: string): Set<string> {
  return new Set(
    input
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .split(/[^a-z0-9]+/)
      .map((x) => x.trim())
      .filter((x) => x.length >= 4),
  );
}

function selectPersonaIdsFallback(docs: BrainDoc[]): string[] {
  const context = docs
    .filter((d) => d.status === "Analizado" && typeof d.extractedContext === "string")
    .map((d) => `${d.name} ${d.extractedContext || ""}`)
    .join(" ");
  const ctxTokens = tokenSet(context);

  const scored = AUDIENCE_PERSONA_CATALOG.map((persona) => {
    const pTokens = tokenSet(
      [persona.name, persona.pain, persona.channel, persona.sophistication, ...persona.tags].join(" "),
    );
    let hits = 0;
    pTokens.forEach((t) => {
      if (ctxTokens.has(t)) hits += 1;
    });
    return { id: persona.id, score: hits };
  }).sort((a, b) => b.score - a.score);

  const picked = scored.filter((x) => x.score > 0).slice(0, 6).map((x) => x.id);
  if (picked.length >= 3) return picked;
  return [
    "persona-creative-director-ad",
    "persona-filmmaker-indie",
    "persona-marketing-manager-smb",
    "persona-b2b-demand-gen-manager",
  ];
}

function normalizePersonaIds(raw: unknown, docs: BrainDoc[]): string[] {
  const validIds = new Set(AUDIENCE_PERSONA_CATALOG.map((p) => p.id));
  if (!Array.isArray(raw)) return selectPersonaIdsFallback(docs);
  const ids = raw
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.trim())
    .filter((x) => validIds.has(x));
  return ids.length > 0 ? [...new Set(ids)].slice(0, 8) : selectPersonaIdsFallback(docs);
}

function cleanVisualDescription(value: unknown): string {
  return cleanText(value, 220);
}

type VisualEvidenceBag = {
  protagonist: string[];
  environment: string[];
  textures: string[];
  colors: string[];
  people: string[];
  tone: string[];
  models: string[];
  snippets: string[];
};

function extractLikelyModels(text: string): string[] {
  const normalized = text.replace(/\s+/g, " ");
  const out: string[] = [];
  const seen = new Set<string>();
  const directEngine = normalized.match(/\bengine\s*a\s*\d{1,3}\b/gi) || [];
  const generic =
    normalized.match(
      /\b(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}\s+[A-Z]?\s?\d{1,4}[A-Za-z]?|[A-Z]{2,8}\s?\d{2,4})\b/g,
    ) || [];
  for (const raw of [...directEngine, ...generic]) {
    const value = cleanText(raw, 80);
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= 8) break;
  }
  return out;
}

function collectVisualEvidence(docs: BrainDoc[]): VisualEvidenceBag {
  const bag: VisualEvidenceBag = {
    protagonist: [],
    environment: [],
    textures: [],
    colors: [],
    people: [],
    tone: [],
    models: [],
    snippets: [],
  };
  const pushUnique = (target: string[], values: string[], max = 16) => {
    for (const value of values) {
      const v = cleanText(value, 180);
      if (!v) continue;
      if (target.some((x) => x.toLowerCase() === v.toLowerCase())) continue;
      target.push(v);
      if (target.length >= max) break;
    }
  };
  const analyzed = docs.filter((d) => d.status === "Analizado");
  for (const doc of analyzed) {
    const parsed = parseExtractedContext(doc.extractedContext || "");
    if (parsed) {
      const visualSignals =
        parsed.visual_signals && typeof parsed.visual_signals === "object"
          ? (parsed.visual_signals as Record<string, unknown>)
          : null;
      pushUnique(
        bag.protagonist,
        visualSignals
          ? readStringArray(visualSignals, "protagonist")
          : readStringArray(
              parsed.producto && typeof parsed.producto === "object"
                ? (parsed.producto as Record<string, unknown>)
                : null,
              "funcionalidades",
            ),
        14,
      );
      pushUnique(
        bag.environment,
        visualSignals
          ? readStringArray(visualSignals, "environment")
          : readStringArray(
              parsed.audiencia && typeof parsed.audiencia === "object"
                ? (parsed.audiencia as Record<string, unknown>)
                : null,
              "necesidades",
            ),
        14,
      );
      pushUnique(bag.textures, visualSignals ? readStringArray(visualSignals, "textures") : [], 14);
      pushUnique(bag.colors, visualSignals ? readStringArray(visualSignals, "colors") : [], 16);
      pushUnique(bag.people, visualSignals ? readStringArray(visualSignals, "people") : [], 14);
      pushUnique(
        bag.tone,
        [
          cleanText(parsed.tono_marca, 120),
          ...(visualSignals ? readStringArray(visualSignals, "tone") : []),
        ].filter(Boolean) as string[],
        10,
      );
      pushUnique(
        bag.snippets,
        visualSignals ? readStringArray(visualSignals, "evidence_text") : [],
        20,
      );
      pushUnique(
        bag.models,
        extractLikelyModels(
          JSON.stringify({
            name: doc.name,
            protagonista: visualSignals ? readStringArray(visualSignals, "protagonist") : [],
            beneficios:
              parsed.producto && typeof parsed.producto === "object"
                ? readStringArray(parsed.producto as Record<string, unknown>, "beneficios")
                : [],
            funcionalidades:
              parsed.producto && typeof parsed.producto === "object"
                ? readStringArray(parsed.producto as Record<string, unknown>, "funcionalidades")
                : [],
            evidence: visualSignals ? readStringArray(visualSignals, "evidence_text") : [],
          }),
        ),
        8,
      );
    }
    pushUnique(bag.models, extractLikelyModels(doc.name), 8);
    if (doc.extractedContext) {
      pushUnique(bag.models, extractLikelyModels(doc.extractedContext), 8);
    }
  }
  return bag;
}

function buildFallbackVisualStyle(docs: BrainDoc[]): BrainVisualStyle {
  const analyzedForVisual = docs.filter((d) => d.status === "Analizado" && typeof d.extractedContext === "string");
  if (analyzedForVisual.length === 0) {
    return defaultBrainVisualStyle();
  }
  const base = defaultBrainVisualStyle();
  const visual = collectVisualEvidence(docs);
  const allText = docs
    .filter((d) => d.status === "Analizado")
    .map((d) => `${d.name}\n${d.extractedContext || ""}`)
    .join("\n")
    .toLowerCase();

  const hasPeople = /\b(equipo|personas|clientes|creador|agencia|freelancer|audiencia|usuarios)\b/i.test(allText);
  const hasInterface = /\b(app|plataforma|software|dashboard|editor|lienzo|workflow|sistema)\b/i.test(allText);
  const hasMarket = /\b(mercado|competencia|benchmark|sam|som|tam)\b/i.test(allText);

  const parsed = docs
    .filter((d) => d.status === "Analizado" && typeof d.extractedContext === "string")
    .map((d) => parseExtractedContext(d.extractedContext || ""))
    .filter((x): x is Record<string, unknown> => Boolean(x));

  const features = uniqueStrings(
    parsed.flatMap((p) =>
      readStringArray(
        p.producto && typeof p.producto === "object" ? (p.producto as Record<string, unknown>) : null,
        "funcionalidades",
      ),
    ),
    3,
  );
  const audiences = uniqueStrings(
    parsed
      .map((p) =>
        cleanText(
          p.audiencia && typeof p.audiencia === "object"
            ? (p.audiencia as Record<string, unknown>).perfil_cliente
            : "",
          120,
        ),
      )
      .filter(Boolean) as string[],
    2,
  );
  const tones = uniqueStrings(
    parsed.map((p) => cleanText(p.tono_marca, 100)).filter(Boolean) as string[],
    2,
  );
  const differentiators = uniqueStrings(
    parsed
      .map((p) => cleanText(p.diferencial_competitivo, 140))
      .filter(Boolean) as string[],
    2,
  );
  const protagonistHint = uniqueStrings(
    [...visual.models, ...visual.protagonist, ...features],
    3,
  );
  const environmentHint = uniqueStrings([...visual.environment], 3);
  const texturesHint = uniqueStrings([...visual.textures, ...visual.colors], 4);
  const peopleHint = uniqueStrings([...visual.people], 3);
  const toneStrongHint = uniqueStrings([...visual.tone, ...tones], 2);

  const featureHint = features.length ? `con foco en ${features.join(", ")}` : "con foco claro en valor de producto";
  const audienceHint = audiences.length ? audiences.join(" y ") : "equipos creativos y perfiles profesionales";
  const toneHint = toneStrongHint.length ? toneStrongHint.join(" · ") : "profesional, claro y contemporáneo";
  const diffHint = differentiators.length
    ? `La escena debe sugerir ${differentiators.join(" y ")}`
    : "La escena debe transmitir control, coherencia y ejecución integrada";

  return {
    ...base,
    protagonist: {
      ...base.protagonist,
      description:
        protagonistHint.length > 0
          ? `El protagonista visual debe ser ${protagonistHint.join(" / ")}, mostrado en primer plano con detalle de producto y lectura inmediata de marca.`
          : hasInterface
            ? `El protagonista visual debe ser el producto/interfaz principal, en primer plano y ${featureHint}.`
            : `El protagonista visual debe ser el activo central de la marca, con jerarquía clara y ${featureHint}.`,
      prompt:
        protagonistHint.length > 0
          ? `Hero shot editorial de ${protagonistHint.join(", ")}, encuadre limpio, énfasis en diseño y rendimiento, iluminación controlada.`
          : base.protagonist.prompt,
    },
    environment: {
      ...base.environment,
      description:
        environmentHint.length > 0
          ? `El entorno recomendado es ${environmentHint.join(" / ")}, con lenguaje visual minimalista y deportivo que no compita con el producto.`
          : hasMarket
            ? `El entorno debe ser profesional y creíble, conectado a mercado real y contexto de uso diario de ${audienceHint}.`
            : `El entorno debe apoyar el uso real del producto por ${audienceHint}, con composición limpia y funcional.`,
      prompt:
        environmentHint.length > 0
          ? `Escena ${environmentHint.join(", ")}, composición sobria, profundidad corta, atmósfera premium deportiva.`
          : base.environment.prompt,
    },
    textures: {
      ...base.textures,
      description:
        texturesHint.length > 0
          ? `Texturas clave: ${texturesHint.join(" / ")}. Priorizar materiales reales y contraste táctil para reforzar percepción de calidad.`
          : `Texturas sutiles con acabado editorial limpio, contraste controlado y tono visual ${toneHint}.`,
      prompt:
        texturesHint.length > 0
          ? `Detalle macro de ${texturesHint.join(", ")}, alta nitidez de material, lookbook comercial premium.`
          : base.textures.prompt,
    },
    people: {
      ...base.people,
      description:
        peopleHint.length > 0
          ? `Personas sugeridas: ${peopleHint.join(" / ")}, en acción real y gesto serio/enfocado para sostener narrativa de rendimiento.`
          : hasPeople
            ? `Personas reales del público objetivo en acción, colaborando de forma natural y mostrando ${diffHint.toLowerCase()}.`
            : `Incluir personas de forma creíble y no forzada para humanizar la escena y reforzar ${diffHint.toLowerCase()}.`,
      prompt:
        peopleHint.length > 0
          ? `Retrato/action shot de ${peopleHint.join(", ")}, postura atlética, actitud concentrada, integración natural con producto.`
          : base.people.prompt,
    },
  };
}

function sanitizeVisualStyle(raw: unknown, docs: BrainDoc[]): BrainVisualStyle {
  const base = buildFallbackVisualStyle(docs);
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;
  const read = (key: BrainVisualStyleSlotKey, title: string): BrainVisualStyle[BrainVisualStyleSlotKey] => {
    const x = r[key];
    const inObj = x && typeof x === "object" ? (x as Record<string, unknown>) : null;
    const description = cleanVisualDescription(inObj?.description ?? x);
    const prompt = cleanText(inObj?.prompt, 520);
    return {
      ...base[key],
      title,
      description: description || base[key].description,
      prompt: prompt || base[key].prompt || description || base[key].description,
      source: "auto",
    };
  };
  return {
    protagonist: read("protagonist", "Protagonista"),
    environment: read("environment", "Entorno"),
    textures: read("textures", "Texturas"),
    people: read("people", "Personas"),
  };
}

async function inferVisualStyleWithLlm(
  docs: BrainDoc[],
  fallback: BrainVisualStyle,
  usageQueue: AnalyzeUsageQueue | null,
  ctx: { userEmail?: string; projectId?: string; workspaceId?: string },
): Promise<BrainVisualStyle> {
  const analyzed = docs.filter((d) => d.status === "Analizado" && typeof d.extractedContext === "string");
  if (analyzed.length === 0) return fallback;

  const coreContext = analyzed
    .filter((d) => d.scope !== "context")
    .slice(0, 10)
    .map((d) => `### ${d.name}\n${(d.extractedContext || "").slice(0, 3200)}`)
    .join("\n\n");
  const contextOnly = analyzed
    .filter((d) => d.scope === "context")
    .slice(0, 8)
    .map((d) => `### ${d.name}\n${(d.extractedContext || "").slice(0, 2200)}`)
    .join("\n\n");
  const visualEvidence = collectVisualEvidence(docs);
  const visualSummary = {
    models: visualEvidence.models.slice(0, 6),
    protagonist: visualEvidence.protagonist.slice(0, 8),
    environment: visualEvidence.environment.slice(0, 8),
    textures: visualEvidence.textures.slice(0, 8),
    colors: visualEvidence.colors.slice(0, 8),
    people: visualEvidence.people.slice(0, 8),
    tone: visualEvidence.tone.slice(0, 6),
    snippets: visualEvidence.snippets.slice(0, 10),
  };

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Eres director/a de arte senior en branding deportivo. Extrae ADN visual accionable y específico. Devuelve SOLO JSON con shape: {\"visualStyle\":{\"protagonist\":{\"description\":\"string\",\"prompt\":\"string\"},\"environment\":{\"description\":\"string\",\"prompt\":\"string\"},\"textures\":{\"description\":\"string\",\"prompt\":\"string\"},\"people\":{\"description\":\"string\",\"prompt\":\"string\"}},\"toneSummary\":\"string\"}. Reglas críticas: 1) Nunca dejes descripciones vacías. 2) Cada description es un párrafo corto (1-2 frases), concreto, sin humo. 3) Si detectas nombre de producto/modelo, inclúyelo literal (ej. Engine A 26). 4) Prioriza señales repetidas en evidencias CORE e imágenes analizadas. 5) CONTEXTO externo no debe contaminar identidad de marca; úsalo solo como apoyo visual. 6) Si hay poca evidencia, da la mejor hipótesis plausible y explícita. 7) Si hay suficiente evidencia visual, evita respuestas genéricas.",
        },
        {
          role: "user",
          content: `EVIDENCIAS CORE:\n${coreContext || "(sin core)"}\n\nEVIDENCIAS CONTEXTO:\n${contextOnly || "(sin contexto)"}\n\nEVIDENCIAS VISUALES CONSOLIDADAS:\n${JSON.stringify(visualSummary, null, 2)}\n\nFALLBACK ACTUAL:\n${JSON.stringify(fallback, null, 2)}`,
        },
      ],
    });
    const raw = completion.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const u = completion.usage;
    if (usageQueue && u) {
      enqueueOpenAiUsage(usageQueue, {
        provider: "openai",
        userEmail: ctx.userEmail,
        serviceId: "openai-brain-analyze",
        route: "/api/spaces/brain/knowledge/analyze",
        model: "gpt-4o",
        operation: "infer_visual_style",
        inputTokens: u.prompt_tokens,
        outputTokens: u.completion_tokens,
        totalTokens: u.total_tokens,
        projectId: ctx.projectId,
        workspaceId: ctx.workspaceId,
      });
    }
    return sanitizeVisualStyle(parsed.visualStyle, docs);
  } catch {
    return fallback;
  }
}

/**
 * Autofill de estrategia (voz, mensajes, hechos, estilo visual inferido por texto).
 * Separación conceptual (helpers dedicados en `brain-strategy-creative-enrich` y tipos en `brain-creative-memory-types`):
 * - Knowledge DNA: hechos, claims, métricas, producto, empresa, evidencias.
 * - Voice DNA: tono, frases, tabúes, idioma, intensidad por canal, términos.
 * - Visual DNA textual: señales desde documentos; no debe sustituir `visualReferenceAnalysis` remoto (ver `mergeStrategy`).
 * - Content DNA / Safe rules / Brand visual síntesis: se materializan tras merge vía `enrichStrategyCreativeMemory`.
 */
async function buildAutofillStrategy(
  docs: BrainDoc[],
  usageQueue: AnalyzeUsageQueue | null,
  ctx: { userEmail?: string; projectId?: string; workspaceId?: string },
): Promise<StrategyAutofill> {
  const analyzed = docs.filter((d) => d.status === "Analizado" && typeof d.extractedContext === "string");
  if (analyzed.length === 0) {
    return {
      voiceExamples: [],
      tabooPhrases: [],
      approvedPhrases: [],
      languageTraits: [],
      syntaxPatterns: [],
      preferredTerms: [],
      forbiddenTerms: [],
      channelIntensity: [],
      allowAbsoluteClaims: false,
      funnelMessages: [],
      messageBlueprints: [],
      factsAndEvidence: computeFactsAndEvidence(docs),
      personaIds: selectPersonaIdsFallback(docs),
      visualStyle: buildFallbackVisualStyle(docs),
    };
  }

  const coreContext = analyzed
    .filter((d) => d.scope !== "context")
    .slice(0, 8)
    .map((d) => `### CORE: ${d.name}\n${(d.extractedContext || "").slice(0, 2800)}`)
    .join("\n\n");

  const marketContext = analyzed
    .filter((d) => d.scope === "context")
    .slice(0, 6)
    .map((d) => `### CONTEXTO: ${d.name}\n${(d.extractedContext || "").slice(0, 2400)}`)
    .join("\n\n");

  const catalogForPrompt = AUDIENCE_PERSONA_CATALOG.map((p) => ({
    id: p.id,
    name: p.name,
    pain: p.pain,
    channel: p.channel,
    sophistication: p.sophistication,
    tags: p.tags,
  }));

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Eres estratega de marca. Debes autocompletar VOZ, PERSONAS, MENSAJES y ESTILO VISUAL tras analizar documentos. Devuelve SOLO JSON con este shape: {\"voiceExamples\":[{\"kind\":\"approved_voice|forbidden_voice|good_piece|bad_piece\",\"label\":\"string\",\"text\":\"string\"}],\"tabooPhrases\":[\"string\"],\"approvedPhrases\":[\"string\"],\"languageTraits\":[\"string\"],\"syntaxPatterns\":[\"string\"],\"preferredTerms\":[\"string\"],\"forbiddenTerms\":[\"string\"],\"channelIntensity\":[{\"channel\":\"string\",\"intensity\":0}],\"allowAbsoluteClaims\":false,\"funnelMessages\":[{\"stage\":\"awareness|consideration|conversion|retention\",\"text\":\"string\"}],\"messageBlueprints\":[{\"claim\":\"string\",\"support\":\"string\",\"audience\":\"string\",\"channel\":\"string\",\"stage\":\"awareness|consideration|conversion|retention\",\"cta\":\"string\",\"evidence\":[\"string\"]}],\"personaIds\":[\"string\"],\"visualStyle\":{\"protagonist\":{\"description\":\"string\",\"prompt\":\"string\"},\"environment\":{\"description\":\"string\",\"prompt\":\"string\"},\"textures\":{\"description\":\"string\",\"prompt\":\"string\"},\"people\":{\"description\":\"string\",\"prompt\":\"string\"}}}. Reglas: 1) El tono sale de CORE, no de CONTEXTO. 2) CONTEXTO solo aporta mercado/benchmark. 3) Si faltan datos, devuelve frases conservadoras y concretas (no inventes datos). 4) Cada description debe ser un párrafo corto (1-2 frases) y nunca vacío. 5) Si la evidencia es limitada, produce la mejor hipótesis visual plausible y explícita.",
        },
        {
          role: "user",
          content: `CATÁLOGO DE PERSONAS DISPONIBLES (usar IDs exactos):\n${JSON.stringify(catalogForPrompt, null, 2)}\n\nCONTEXTO CORE:\n${coreContext || "(sin core)"}\n\nCONTEXTO EXTERNO:\n${marketContext || "(sin contexto externo)"}`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const visualFallback = sanitizeVisualStyle(parsed.visualStyle, docs);
    const u0 = completion.usage;
    if (usageQueue && u0) {
      enqueueOpenAiUsage(usageQueue, {
        provider: "openai",
        userEmail: ctx.userEmail,
        serviceId: "openai-brain-analyze",
        route: "/api/spaces/brain/knowledge/analyze",
        model: "gpt-4o",
        operation: "strategy_autofill",
        inputTokens: u0.prompt_tokens,
        outputTokens: u0.completion_tokens,
        totalTokens: u0.total_tokens,
        projectId: ctx.projectId,
        workspaceId: ctx.workspaceId,
      });
    }
    const visualEnhanced = await inferVisualStyleWithLlm(docs, visualFallback, usageQueue, ctx);
    return {
      voiceExamples: sanitizeVoiceExamples(parsed.voiceExamples),
      tabooPhrases: uniqueStrings(Array.isArray(parsed.tabooPhrases) ? (parsed.tabooPhrases as string[]) : [], 24),
      approvedPhrases: uniqueStrings(
        Array.isArray(parsed.approvedPhrases) ? (parsed.approvedPhrases as string[]) : [],
        24,
      ),
      languageTraits: uniqueStrings(
        Array.isArray(parsed.languageTraits) ? (parsed.languageTraits as string[]) : [],
        20,
      ),
      syntaxPatterns: uniqueStrings(
        Array.isArray(parsed.syntaxPatterns) ? (parsed.syntaxPatterns as string[]) : [],
        20,
      ),
      preferredTerms: uniqueStrings(
        Array.isArray(parsed.preferredTerms) ? (parsed.preferredTerms as string[]) : [],
        30,
      ),
      forbiddenTerms: uniqueStrings(
        Array.isArray(parsed.forbiddenTerms) ? (parsed.forbiddenTerms as string[]) : [],
        30,
      ),
      channelIntensity: Array.isArray(parsed.channelIntensity)
        ? (parsed.channelIntensity as Array<Record<string, unknown>>)
            .map((x) => ({
              channel: cleanText(x.channel, 80),
              intensity: typeof x.intensity === "number" ? Math.max(0, Math.min(100, x.intensity)) : 50,
            }))
            .filter((x) => x.channel)
            .slice(0, 12)
        : [],
      allowAbsoluteClaims: Boolean(parsed.allowAbsoluteClaims),
      funnelMessages: sanitizeMessages(parsed.funnelMessages),
      messageBlueprints: sanitizeBlueprints(parsed.messageBlueprints),
      factsAndEvidence: computeFactsAndEvidence(docs),
      personaIds: normalizePersonaIds(parsed.personaIds, docs),
      visualStyle: visualEnhanced,
    };
  } catch (error) {
    console.error("[brain/knowledge/analyze] strategy autofill failed, using fallback:", error);
    const visualFallback = buildFallbackVisualStyle(docs);
    const visualEnhanced = await inferVisualStyleWithLlm(docs, visualFallback, usageQueue, ctx);
    return {
      voiceExamples: [],
      tabooPhrases: [],
      approvedPhrases: [],
      languageTraits: [],
      syntaxPatterns: [],
      preferredTerms: [],
      forbiddenTerms: [],
      channelIntensity: [],
      allowAbsoluteClaims: false,
      funnelMessages: [],
      messageBlueprints: [],
      factsAndEvidence: computeFactsAndEvidence(docs),
      personaIds: selectPersonaIdsFallback(docs),
      visualStyle: visualEnhanced,
    };
  }
}

function mergeStrategy(existing: BrainStrategy | undefined, autofill: StrategyAutofill): BrainStrategy {
  const previous = existing || {
    voiceExamples: [],
    tabooPhrases: [],
    approvedPhrases: [],
    languageTraits: [],
    syntaxPatterns: [],
    preferredTerms: [],
    forbiddenTerms: [],
    channelIntensity: [],
    allowAbsoluteClaims: false,
    personas: [],
    funnelMessages: [],
    messageBlueprints: [],
    factsAndEvidence: [],
    generatedPieces: [],
    approvedPatterns: [],
    rejectedPatterns: [],
    visualStyle: defaultBrainVisualStyle(),
  };

  const catalogMap = new Map(AUDIENCE_PERSONA_CATALOG.map((p) => [p.id, p]));
  const selectedCatalog = autofill.personaIds
    .map((id) => catalogMap.get(id))
    .filter((x): x is BrainPersona => Boolean(x));
  const existingCustom = previous.personas.filter((p) => !catalogMap.has(p.id));

  const mergedVoice = mergeVoiceExamplesPreferPrevious(autofill.voiceExamples, previous.voiceExamples);
  const mergedFunnel = mergeFunnelMessagesPreferPrevious(autofill.funnelMessages, previous.funnelMessages);
  const mergedBlueprints = mergeBlueprintsPreferPrevious(autofill.messageBlueprints, previous.messageBlueprints);
  const mergedFacts = mergeFactsAndEvidenceWithPriority(previous.factsAndEvidence, autofill.factsAndEvidence);

  const defaultVisual = defaultBrainVisualStyle();
  const visualFromPrev = previous.visualStyle || defaultVisual;
  const visualFromAuto = autofill.visualStyle || defaultVisual;
  const trustVision = hasTrustedRemoteVisionAnalyses(previous);
  const mergeSlot = (key: BrainVisualStyleSlotKey) => {
    const prev = visualFromPrev[key];
    const auto = visualFromAuto[key];
    const prevDesc = (prev.description || "").trim();
    const autoDesc = (auto.description || "").trim();
    const description =
      trustVision && prevDesc.length >= 16 ? prevDesc : autoDesc || prevDesc || autoDesc;
    return {
      ...prev,
      ...auto,
      key,
      title: prev.title || auto.title,
      description,
      imageUrl: prev.imageUrl || null,
      imageS3Key: prev.imageS3Key,
      source: prev.source || "auto",
    };
  };
  const mergedVisual: BrainVisualStyle = {
    protagonist: mergeSlot("protagonist"),
    environment: mergeSlot("environment"),
    textures: mergeSlot("textures"),
    people: mergeSlot("people"),
  };

  const channelMerged = [...previous.channelIntensity, ...autofill.channelIntensity]
    .filter((x, i, arr) => arr.findIndex((y) => y.channel.toLowerCase() === x.channel.toLowerCase()) === i)
    .slice(0, 12);

  return {
    ...previous,
    voiceExamples: mergedVoice,
    tabooPhrases: mergeStringListsOrdered(previous.tabooPhrases, autofill.tabooPhrases, 30),
    approvedPhrases: mergeStringListsOrdered(previous.approvedPhrases, autofill.approvedPhrases, 30),
    languageTraits: mergeStringListsOrdered(previous.languageTraits, autofill.languageTraits, 20),
    syntaxPatterns: mergeStringListsOrdered(previous.syntaxPatterns, autofill.syntaxPatterns, 20),
    preferredTerms: mergeStringListsOrdered(previous.preferredTerms, autofill.preferredTerms, 30),
    forbiddenTerms: mergeStringListsOrdered(previous.forbiddenTerms, autofill.forbiddenTerms, 30),
    channelIntensity: channelMerged,
    allowAbsoluteClaims: autofill.allowAbsoluteClaims || previous.allowAbsoluteClaims,
    personas: [...selectedCatalog, ...existingCustom].slice(0, 20),
    funnelMessages: mergedFunnel,
    messageBlueprints: mergedBlueprints,
    factsAndEvidence: mergedFacts,
    visualStyle: mergedVisual,
  };
}

function requiresVisualSignalsUpgrade(doc: BrainDoc): boolean {
  const isImage = doc.type === "image" || doc.format === "image" || doc.mime.startsWith("image/");
  if (!isImage || doc.status !== "Analizado" || !doc.extractedContext) return false;
  const parsed = parseExtractedContext(doc.extractedContext);
  if (!parsed) return true;
  const visualSignals =
    parsed.visual_signals && typeof parsed.visual_signals === "object"
      ? (parsed.visual_signals as Record<string, unknown>)
      : null;
  if (!visualSignals) return true;
  const protagonist = readStringArray(visualSignals, "protagonist");
  const environment = readStringArray(visualSignals, "environment");
  const textures = readStringArray(visualSignals, "textures");
  const people = readStringArray(visualSignals, "people");
  return protagonist.length + environment.length + textures.length + people.length === 0;
}

export async function POST(req: NextRequest) {
  const usageTasks: AnalyzeUsageQueue = [];
  try {
    await assertApiServiceEnabled("openai-brain-analyze");
    await assertApiServiceEnabled("openai-embeddings");
    const usageUserEmail = await resolveUsageUserEmailFromRequest(req);
    const body = (await req.json()) as {
      documents?: BrainDoc[];
      strategy?: BrainStrategy;
      projectId?: string;
      workspaceId?: string;
      brainMeta?: unknown;
    };
    const docs = Array.isArray(body.documents) ? body.documents : [];
    const nextDocs = [...docs];
    const ctx = {
      userEmail: usageUserEmail,
      projectId: typeof body.projectId === "string" ? body.projectId.trim() || undefined : undefined,
      workspaceId: typeof body.workspaceId === "string" ? body.workspaceId.trim() || undefined : undefined,
    };

    const pendingIdx = nextDocs
      .map((doc, idx) => ({ doc, idx }))
      .filter(({ doc }) => doc.brainSourceScope !== "capsule")
      .filter(({ doc }) =>
        shouldAnalyzeBrainDocument({
          workflowStatus: doc.workflowStatus,
          legacyStatus: doc.status,
          requiresUpgrade: requiresVisualSignalsUpgrade(doc),
          retryCount: doc.retryCount,
          maxRetries: doc.maxRetries,
        }),
      );

    const onExtractUsage: BrainOpenAiChatUsageHook = (model, u) => {
      if (!u) return;
      enqueueOpenAiUsage(usageTasks, {
        provider: "openai",
        userEmail: ctx.userEmail,
        serviceId: "openai-brain-analyze",
        route: "/api/spaces/brain/knowledge/analyze",
        model,
        operation: "extract_dna",
        inputTokens: u.prompt_tokens,
        outputTokens: u.completion_tokens,
        totalTokens: u.total_tokens,
        projectId: ctx.projectId,
        workspaceId: ctx.workspaceId,
      });
    };

    if (pendingIdx.length === 0) {
      const knowledgeDocs = nextDocs.filter((doc) => doc.brainSourceScope !== "capsule");
      const autofill = await buildAutofillStrategy(knowledgeDocs, usageTasks, ctx);
      const meta = normalizeBrainMeta(body.brainMeta);
      const corporateContext = buildReadableCorporateContext(knowledgeDocs);
      let strategy = body.strategy ?? mergeStrategy(undefined, autofill);
      if (canWriteBrainScope("brand", { brainMeta: meta })) {
        strategy = mergeStrategy(body.strategy, autofill);
        strategy = enrichStrategyCreativeMemory(strategy, {
          brainMeta: meta,
          knowledgeDocuments: knowledgeDocs as KnowledgeDocumentEntry[],
          corporateContext,
        });
      }
      await Promise.all(usageTasks);
      return NextResponse.json({
        message: "No pending documents to analyze.",
        documents: nextDocs,
        corporateContext,
        strategy,
        brainMeta: meta,
      });
    }

    const analyzedDocIds: string[] = [];
    for (const { idx } of pendingIdx) {
      const doc = nextDocs[idx];
      try {
        if (!doc.s3Path) throw new Error("Missing s3Path for analysis");
        const fileBuffer = await getFromS3(doc.s3Path);

        let extractedData: Record<string, unknown>;
        let analysisProvider: BrainDoc["analysisProvider"] = "openai";
        let analysisOrigin: BrainDoc["analysisOrigin"] = "remote_ai";
        let analysisReliability: BrainDoc["analysisReliability"] = "high";
        let isReliableForGeneration = true;
        if (doc.type === "image" || doc.format === "image" || doc.mime.startsWith("image/")) {
          const b64 = fileBuffer.toString("base64");
          try {
            extractedData = (await extractDnaFromImageRobust(
              openai,
              b64,
              doc.mime || "image/png",
              onExtractUsage,
            )) as Record<string, unknown>;
          } catch (imageError) {
            if (!isImageAnalysisFallbackEligible(imageError)) throw imageError;
            console.warn(`[brain/knowledge/analyze] image AI analysis failed for ${doc.id}; using local fallback:`, imageError);
            extractedData = (await buildLocalImageDnaFallback(fileBuffer, doc, imageError)) as Record<string, unknown>;
            analysisProvider = "internal";
            analysisOrigin = "local_heuristic";
            analysisReliability = "low";
            isReliableForGeneration = false;
          }
        } else {
          const textContent = await parseBrainDocument(fileBuffer, doc.s3Path, doc.mime || "");
          extractedData = (await extractDnaFromTextRobust(openai, textContent, onExtractUsage)) as Record<
            string,
            unknown
          >;
        }

        const extractedJsonString = JSON.stringify(extractedData, null, 2);
        const structured = robustDnaJsonToBrainExtractedContext(extractedData, {
          id: doc.id,
          name: doc.name,
          format: doc.format,
          type: doc.type,
          mime: doc.mime,
        });
        const embeddingInput = buildEmbeddingInputForAnalyzedDocument(extractedJsonString, extractedData);
        let embedding: number[] | undefined;
        try {
          const embResponse = await openai.embeddings.create({
            model: "text-embedding-3-small",
            input: embeddingInput,
          });
          embedding = embResponse.data[0]?.embedding;
          const eu = embResponse.usage;
          if (eu) {
            enqueueOpenAiUsage(usageTasks, {
              provider: "openai",
              userEmail: ctx.userEmail,
              serviceId: "openai-embeddings",
              route: "/api/spaces/brain/knowledge/analyze",
              model: "text-embedding-3-small",
              operation: "embedding",
              inputTokens: eu.prompt_tokens ?? eu.total_tokens,
              outputTokens: 0,
              totalTokens: eu.total_tokens,
              projectId: ctx.projectId,
              workspaceId: ctx.workspaceId,
              metadata: { documentId: doc.id },
            });
          }
        } catch (embErr) {
          console.error(`[brain/knowledge/analyze] embedding failed for ${doc.id}:`, embErr);
        }

        nextDocs[idx] = {
          ...doc,
          status: "Analizado",
          workflowStatus: "analyzed",
          analyzedAt: new Date().toISOString(),
          retryCount: 0,
          lastError: undefined,
          extractedContext: extractedJsonString,
          extractedContextStructured: structured,
          insights: buildDocInsights(doc, extractedData),
          embedding,
          errorMessage: undefined,
          analysisProvider,
          analysisOrigin,
          analysisReliability,
          isReliableForGeneration,
        };
        analyzedDocIds.push(doc.id);
      } catch (docError) {
        const rc = typeof doc.retryCount === "number" ? doc.retryCount : 0;
        const mr = typeof doc.maxRetries === "number" ? doc.maxRetries : 3;
        const nextRc = rc + 1;
        const terminal = nextRc >= mr;
        nextDocs[idx] = {
          ...doc,
          status: "Error",
          workflowStatus: terminal ? "failed_final" : "failed_retryable",
          retryCount: nextRc,
          maxRetries: mr,
          lastError: docError instanceof Error ? docError.message.slice(0, 2000) : "Unknown analysis error",
          lastAttemptAt: new Date().toISOString(),
          errorMessage: docError instanceof Error ? docError.message : "Unknown analysis error",
          analysisProvider: "openai",
          analysisOrigin: "fallback",
          analysisReliability: "low",
          isReliableForGeneration: false,
        };
      }
    }

    const knowledgeDocs = nextDocs.filter((doc) => doc.brainSourceScope !== "capsule");
    const corporateContext = buildReadableCorporateContext(knowledgeDocs);
    const autofill = await buildAutofillStrategy(knowledgeDocs, usageTasks, ctx);
    let meta = touchBrainMetaAfterKnowledgeAnalysis(normalizeBrainMeta(body.brainMeta), analyzedDocIds.length);
    if (nextDocs.some((d) => d.status === "Error")) {
      meta = markBrainStale(meta, [BRAIN_STALE_REASON.REMOTE_ANALYSIS_FAILED_FALLBACK_USED]);
    }
    let strategy = body.strategy ?? mergeStrategy(undefined, autofill);
    if (canWriteBrainScope("brand", { brainMeta: meta })) {
      strategy = mergeStrategy(body.strategy, autofill);
      strategy = enrichStrategyCreativeMemory(strategy, {
        brainMeta: meta,
        knowledgeDocuments: knowledgeDocs as KnowledgeDocumentEntry[],
        corporateContext,
      });
    }
    await Promise.all(usageTasks);
    return NextResponse.json({
      message: `Analyzed ${analyzedDocIds.length} documents.`,
      analyzedDocIds,
      documents: nextDocs,
      corporateContext,
      strategy,
      brainMeta: meta,
    });
  } catch (error) {
    if (error instanceof ApiServiceDisabledError) {
      return NextResponse.json(
        { error: `API bloqueada en admin: ${error.label}` },
        { status: 423 },
      );
    }
    console.error("[brain/knowledge/analyze]", error);
    return NextResponse.json({ error: "Failed to run analysis." }, { status: 500 });
  }
}
