/**
 * Layerizer — contratos de datos (§6 del spec).
 *
 * Operación inversa de Composite: descompone una imagen (master inmutable) en una
 * pila de capas pixel-exactas (fondo limpio + objetos con alfa real).
 *
 * Reglas duras reflejadas en los tipos:
 * - El master nunca se reescribe: solo se referencia (`masterUrl`).
 * - Extracción = recorte del master (SAM 3 + matting). `source: 'extracted'` SIEMPRE.
 * - Fondo limpio = generativo (Nano Banana / Gemini). `source: 'clean_plate'`.
 * - Amodal es opt-in por objeto (`amodalComplete`), nunca automático.
 */

/** Ciclo de vida del job. `detecting` es pre-pago; el resto ocurre tras "Extract Layout". */
export type LayerizerJobStatus =
  | "detecting" // Paso A (Gemini), pre-pago
  | "queued" // job pagado encolado tras Extract Layout
  | "segmenting" // Paso B (SAM 3)
  | "matting" // Paso C (BiRefNet Matting)
  | "compositing_bg" // Paso D (fondo limpio generativo)
  | "amodal" // Paso E, solo si hay objetos con amodalComplete=true
  | "assembling" // Paso F (montaje de capas)
  | "done"
  | "partial" // algún paso falló pero hay salida usable
  | "failed";

/** Estados en los que el job sigue trabajando (para UI de progreso). */
export const LAYERIZER_ACTIVE_STATUSES: readonly LayerizerJobStatus[] = [
  "detecting",
  "queued",
  "segmenting",
  "matting",
  "compositing_bg",
  "amodal",
  "assembling",
] as const;

/** Estados terminales del job. */
export const LAYERIZER_TERMINAL_STATUSES: readonly LayerizerJobStatus[] = [
  "done",
  "partial",
  "failed",
] as const;

export function isLayerizerTerminalStatus(status: LayerizerJobStatus): boolean {
  return (LAYERIZER_TERMINAL_STATUSES as readonly string[]).includes(status);
}

/** Orden de etapas que paga el wallet (para captura por paso y barra de progreso). */
export const LAYERIZER_PAID_STAGES: readonly LayerizerJobStatus[] = [
  "segmenting",
  "matting",
  "compositing_bg",
  "amodal",
  "assembling",
] as const;

/** Objeto detectado por Gemini en el Paso A (pre-pago). */
export interface DetectedObject {
  id: string;
  label: string; // etiqueta semántica de Gemini
  bbox: [number, number, number, number]; // [x, y, w, h] en px del master
  isText: boolean; // OCR: true si es un bloque de texto
  score: number; // confianza 0..1
  /** id del sujeto contenedor; undefined = sujeto de nivel superior. */
  parentId?: string;
  /** true si proviene de un análisis local manual (área dibujada por el usuario). */
  manual?: boolean;
}

/** Prompt que se le pasa a SAM 3 para segmentar un objeto. */
export type SamPrompt =
  | { kind: "point"; points: Array<{ x: number; y: number; label: 0 | 1 }> }
  | { kind: "box"; box: [number, number, number, number] }
  | { kind: "text"; text: string };

/** Objeto que el usuario ha marcado para extraer en el Estado 2. */
export interface SelectedObject {
  id: string; // referencia a DetectedObject.id o id de selección manual
  prompt: SamPrompt; // lo que recibe SAM 3
  amodalComplete: boolean; // toggle por objeto, default false (opt-in)
  label?: string; // etiqueta heredada de la detección (UI / Designer)
  /** id del sujeto contenedor; las partes se apilan por encima de su sujeto. */
  parentId?: string;
  /** Bloque de tipografía/gráfico (extracción rectangular + borrado del fondo). */
  isText?: boolean;
}

/** Una capa extraída del master (objeto recortado con alfa real). */
export interface Layer {
  id: string;
  label: string;
  url: string; // PNG RGBA del objeto en S3 (o URL estable /api/spaces/s3-file)
  s3Key?: string; // clave durable persistida en node data
  x: number; // posición original (de bbox)
  y: number;
  w: number;
  h: number;
  zHint: number; // inferido por aritmética de solape de máscaras (sin LLM)
  source: "extracted"; // SIEMPRE 'extracted' para objetos, nunca 'generated'
  amodalCompleted: boolean;
  /** id del sujeto contenedor; las partes quedan por encima de su sujeto. */
  parentId?: string;
  /** Capa de bloque tipográfico (recorte rectangular). */
  isText?: boolean;
}

/** Capa de fondo a página completa (original o fondo limpio generativo). */
export interface LayerizerBackground {
  url: string;
  s3Key?: string;
  w: number;
  h: number;
  source: "original" | "clean_plate";
}

/** Salida del job, consumible por Designer (cada layer → un slot). */
export interface LayerizerOutput {
  jobId: string;
  masterUrl: string; // inmutable, solo referencia
  masterS3Key?: string;
  /** Capa 1 (inferior): imagen original a página completa. */
  original: LayerizerBackground;
  /** Capa 2: fondo limpio generativo (Paso D). */
  background: LayerizerBackground;
  layers: Layer[];
  /** Método usado para `background` (flag del Paso D). */
  cleanPlateMethod?: LayerizerCleanPlateMethod;
  /** Fondo alternativo cuando se pidió comparar ambos métodos (Paso D). */
  backgroundAlt?: LayerizerBackground;
  /** Método usado para `backgroundAlt`. */
  cleanPlateMethodAlt?: LayerizerCleanPlateMethod;
}

/** Registro del job (persistido en DynamoDB para idempotencia + estado). */
export interface LayerizerJob {
  id: string;
  status: LayerizerJobStatus;
  masterUrl: string;
  masterS3Key?: string;
  selected: SelectedObject[];
  output?: LayerizerOutput;
  walletReservationId: string;
  /** Método de fondo limpio a usar (flag de test del Paso D). */
  cleanPlateMethod?: LayerizerCleanPlateMethod;
  error?: { step: LayerizerJobStatus; message: string };
  createdAt?: string;
  updatedAt?: string;
  ownerEmail?: string;
}

/**
 * Método de fondo limpio (Paso D) — implementados ambos detrás de flag para comparar.
 * `mask`: "rellena exactamente estas zonas" (reusa máscaras).
 * `describe`: "el vaso de la izquierda…" (referencia espacial del bbox).
 */
export type LayerizerCleanPlateMethod = "mask" | "describe";

// ---------------------------------------------------------------------------
// Mensajes de progreso (stream NDJSON del endpoint /extract).
// ---------------------------------------------------------------------------

export interface LayerizerProgressEvent {
  type: "progress";
  jobId: string;
  status: LayerizerJobStatus;
  /** 0..1 dentro de la etapa actual (p. ej. matting 2/3 objetos). */
  stageProgress?: number;
  message?: string;
}

export interface LayerizerDoneEvent {
  type: "done";
  jobId: string;
  output: LayerizerOutput;
  status: "done" | "partial";
}

export interface LayerizerErrorEvent {
  type: "error";
  jobId: string;
  status: "failed";
  step: LayerizerJobStatus;
  message: string;
}

export type LayerizerStreamEvent =
  | LayerizerProgressEvent
  | LayerizerDoneEvent
  | LayerizerErrorEvent;

// ---------------------------------------------------------------------------
// Forma de `node.data` para el nodo Layerizer en el canvas.
// ---------------------------------------------------------------------------

export interface LayerizerNodeData {
  label?: string;
  /** Imagen de entrada resuelta (URL o data URL del master). */
  masterUrl?: string;
  masterS3Key?: string;
  /** Detección del Estado 1 (Gemini). */
  detected?: DetectedObject[];
  /** Dimensiones del master en px (para rehidratar overlays al reabrir el studio). */
  masterWidth?: number;
  masterHeight?: number;
  /** Selección actual del usuario (Estado 2). */
  selected?: SelectedObject[];
  /** Job en curso / último job. */
  jobId?: string;
  status?: LayerizerJobStatus;
  /** Salida montada (Estado 4). También es lo que viaja por el handle `layout`. */
  output?: LayerizerOutput;
  /** El valor del handle de salida `layout` (espejo de `output`). */
  value?: LayerizerOutput;
  type?: "image_layout";
}
