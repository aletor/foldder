/**
 * BrandKit — núcleo de evidencia.
 *
 * Principio rector: BrandKit NO fusiona. Para cada rasgo hay una lista de
 * candidatos ordenada por *fuerza de evidencia*; el usuario corona uno con un
 * tap. No hay merge que pueda fallar — solo un ranking y una corona.
 *
 * Este fichero define QUÉ es un candidato y CÓMO se puntúa. El ranking y la
 * coronación viven en `./trait`.
 *
 * Reglas duras que el modelo hace cumplir por construcción:
 * - `evidenceScore` se DERIVA de `signals` (`scoreFromSignals`); nunca se edita a
 *   mano. Se corona el candidato, no su score.
 * - `user-supplied` = evidencia máxima: gana el ranking siempre.
 * - `value` es la INTERPRETACIÓN, jamás el input crudo.
 * - `derived` (resultados de llamadas de pago: nano banana, vectorización) solo se
 *   rellena TRAS coronar/confirmar; antes es `undefined`.
 */

/** De dónde salió la evidencia. Auditable; nunca se muestra crudo en la cara. */
export type SourceKind = "pdf" | "doc" | "image" | "url" | "user-upload";

export interface SourceRef {
  id: string;
  kind: SourceKind;
  /** Nombre de archivo o dominio, para trazas y auditoría. */
  label: string;
  /** Localización fina: "página 3", "header", selector CSS, URL exacta… */
  locator?: string;
  /** SHA-256 del binario original — idempotencia de re-ingesta. */
  contentSha256?: string;
  /** Fase A (análisis v2) — trazabilidad visible en la UI. */
  pageVisionPass?: import("../ingest/page-vision-pass-meta").PageVisionPassSourceMeta;
  addedAt: string; // ISO
}

/**
 * Tipos de señal = razones concretas por las que un candidato puntúa.
 * Cada señal aporta un peso FIRMADO (+ favorece, − penaliza). El "por qué"
 * legible va en `EvidenceSignal.detail`.
 */
export type EvidenceSignalKind =
  // Genéricas
  | "user-supplied" // el usuario lo aportó → domina el ranking (short-circuit a 1)
  | "brand-manual" // aparece en un manual de marca subido
  | "repeated-independent" // repetido en fuentes independientes
  | "single-appearance" // (−) aparición única
  | "llm-vision" // inferido por visión multimodal (confianza baja)
  // Tipografía (contexto de aparición, no conteo de documentos)
  | "near-logo"
  | "headline"
  | "body-text" // texto de cuerpo — evidencia POSITIVA de secundaria
  | "body-annex" // (−) solo en cuerpo de anexos / poca recurrencia
  | "footer" // (−)
  | "embedded-file" // fichero de fuente realmente embebido/subido
  // Logo
  | "shape-dominant"
  | "recurrence"
  | "wordmark-integrity"
  | "flat-background"
  // Color
  | "render-quantized"
  | "operator-color"
  | "visual-brand"
  | "neutral"; // (−) blanco/negro del logo no son color de marca

/**
 * Pesos base por tipo de señal. Centralizados aquí para que los extractores no
 * inventen números: emiten señales con `signal(kind)` y el score se calcula con
 * `scoreFromSignals`. Ajustar aquí = re-tuning global y auditable.
 */
export const SIGNAL_BASE_WEIGHT: Record<EvidenceSignalKind, number> = {
  "user-supplied": 10, // irrelevante en la práctica: short-circuita a 1
  "brand-manual": 1.5,
  "repeated-independent": 1.2,
  "single-appearance": -1.0,
  "llm-vision": 0.3,
  "near-logo": 1.5,
  headline: 1.0,
  "body-text": 0.7,
  "body-annex": -0.8,
  footer: -1.0,
  "embedded-file": 0.8,
  "shape-dominant": 1.3,
  recurrence: 1.0,
  "wordmark-integrity": 1.4,
  "flat-background": 0.6,
  "render-quantized": 0.8,
  "operator-color": 0.6,
  "visual-brand": 2.5,
  neutral: -1.2,
};

export interface EvidenceSignal {
  kind: EvidenceSignalKind;
  /** Contribución firmada al score. Por defecto `SIGNAL_BASE_WEIGHT[kind]`. */
  weight: number;
  /** Frase legible del porqué: "junto al logo en portada". */
  detail?: string;
  /** `SourceRef.id` de dónde salió esta señal concreta. */
  sourceRef?: string;
}

/** Crea una señal con el peso base del tipo (opcionalmente ajustado/escalado). */
export function signal(
  kind: EvidenceSignalKind,
  opts: { detail?: string; sourceRef?: string; weight?: number; scale?: number } = {},
): EvidenceSignal {
  const base = opts.weight ?? SIGNAL_BASE_WEIGHT[kind];
  return {
    kind,
    weight: opts.scale != null ? base * opts.scale : base,
    detail: opts.detail,
    sourceRef: opts.sourceRef,
  };
}

export type CandidateStatus = "proposed" | "crowned" | "archived" | "user_supplied";

export interface LogoVectorSourceRef {
  sourceId: string;
  pageNumber?: number;
  bbox?: { x: number; y: number; width: number; height: number };
  contentSha256?: string;
}

export type VectorizeTraceStatus = "ok" | "skipped_reason" | "failed_reason";

export interface VectorizeTrace {
  attempted: boolean;
  status: VectorizeTraceStatus;
  skippedReason?: string;
  failedReason?: string;
  walletReservationId?: string;
  evaluatedFlags?: Record<string, unknown>;
}

/** Extracción nativa (xobject/SVG) diferida tras brandKit interactivo. */
export interface NativeUpgradeTrace {
  status: "pending" | "complete" | "failed";
  fromOrigin: import("./trait-values").LogoAssetOrigin;
  toOrigin?: import("./trait-values").LogoAssetOrigin;
  latencyMs?: number;
  detail?: string;
}

export interface CandidateDerived {
  /** nano banana (§3.4) — solo tras Confirmar. */
  generatedImageUrl?: string;
  /** Vectorizer.AI (§3.2) — solo tras coronar el logo. */
  vectorUrl?: string;
  /** Upgrade render_crop → nativo (Nivel 1 harvest diferido). */
  nativeUpgrade?: NativeUpgradeTrace;
  /** Raster original conservado tras sustituir `value.imageUrl` por el SVG. */
  rasterImageUrl?: string;
  /** Referencia al PDF/página para re-rasterizar a alta resolución antes de trazar. */
  vectorSource?: LogoVectorSourceRef;
  vectorize?: VectorizeTrace;
  generatedAt?: string;
}

export interface Candidate<T> {
  id: string;
  /** La interpretación coronable (nunca el input crudo). */
  value: T;
  /** 0..1 — DERIVADO de `signals`. No editar a mano. */
  evidenceScore: number;
  /** Por qué tiene ese score (auditable). */
  signals: EvidenceSignal[];
  status: CandidateStatus;
  /** pHash (imágenes) o hash normalizado (texto). Para dedup y "material nuevo". */
  signature: string;
  /** `SourceRef.id[]`. */
  sourceRefs: string[];
  createdAt: string;
  /** Solo tras coronar/confirmar. Antes: undefined. */
  derived?: CandidateDerived;
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/**
 * El score sale SIEMPRE de las señales. `user-supplied` gana siempre (el usuario
 * es la fuente más fiable). Determinista y puro: mismas señales ⇒ mismo score.
 */
export function scoreFromSignals(signals: readonly EvidenceSignal[]): number {
  if (signals.some((s) => s.kind === "user-supplied")) return 1;
  if (signals.length === 0) return 0;
  const raw = signals.reduce((sum, s) => sum + s.weight, 0);
  return clamp01(sigmoid(raw));
}

let candidateSeq = 0;

/**
 * Crea un candidato con el score derivado de sus señales. Un candidato con señal
 * `user-supplied` nace con status `user_supplied`.
 */
export function createCandidate<T>(input: {
  value: T;
  signals: EvidenceSignal[];
  signature: string;
  sourceRefs?: string[];
  id?: string;
  createdAt?: string;
}): Candidate<T> {
  const isUser = input.signals.some((s) => s.kind === "user-supplied");
  return {
    id: input.id ?? `cand_${Date.now().toString(36)}_${(candidateSeq++).toString(36)}`,
    value: input.value,
    evidenceScore: scoreFromSignals(input.signals),
    signals: input.signals,
    status: isUser ? "user_supplied" : "proposed",
    signature: input.signature,
    sourceRefs: input.sourceRefs ?? [],
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}

/** Recalcula el score desde las señales (p. ej. tras añadir evidencia nueva). */
export function recomputeScore<T>(candidate: Candidate<T>): Candidate<T> {
  return { ...candidate, evidenceScore: scoreFromSignals(candidate.signals) };
}
