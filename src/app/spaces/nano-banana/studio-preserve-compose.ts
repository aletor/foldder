/**
 * Cliente de "Conservar zonas sin cambios" (preserve-compose) para el Image Creation Studio.
 *
 * Tras una generación puramente local (todas las instrucciones tienen lazo, sin texto global ni
 * esquema), pide al servidor que compare base vs. generada, deduzca las áreas realmente
 * modificadas y las superponga sobre la base a resolución completa. No hay coste de API:
 * la generación ya está pagada y persistida antes de este paso, y un fallo aquí nunca la pierde.
 */

import type { ChangeMaskSensitivity, ChangeMaskStats } from "@/lib/nano-banana/preserve-compose/analyze-change-mask";
import type { OpticalMatchStats } from "@/lib/nano-banana/preserve-compose/optical-match";
import { tryExtractKnowledgeFilesKeyFromUrl } from "@/lib/s3-media-hydrate";
import { closeLassoPoints, isValidClosedLasso } from "./lasso-to-paint-data";
import { loadImageElement } from "./studio-compact";
import { cropCardsToRect, type StudioContextCrop } from "./studio-context-crop";
import { cardIsDescribed } from "./studio-generate-payload";
import type { StudioCard, StudioComposeSummary, StudioGlobal } from "./studio-types";

export const PRESERVE_COMPOSE_ENDPOINT = "/api/spaces/nano-banana/preserve-compose";
const PRIOR_MASK_MAX_SIDE = 1024;
const SOURCE_DATA_URL_MAX_BYTES = 20_000_000;

export type PreserveComposeEligibility = { ok: true } | { ok: false; reason: string };

/**
 * Solo se compone cuando la generación es puramente local. Con texto global o esquema el
 * usuario quiere que cambie toda la escena; componer revertiría ese cambio fuera del lazo.
 */
export function preserveComposeEligibility(args: {
  baseImage: string | null;
  cards: StudioCard[];
  global: StudioGlobal;
}): PreserveComposeEligibility {
  if (!args.baseImage) return { ok: false, reason: "Sin imagen base: la generación es completa." };
  if (args.global.text.trim()) return { ok: false, reason: "Hay una instrucción global: la escena cambia entera." };
  if (args.global.schemaData) return { ok: false, reason: "Hay un esquema de composición: cambio global." };
  const described = args.cards.filter(cardIsDescribed);
  if (described.length === 0) return { ok: false, reason: "No hay cambios locales descritos." };
  const missingZone = described.some((card) => !card.paintData && !isValidClosedLasso(card.lassoPoints));
  if (missingZone) return { ok: false, reason: "Alguna instrucción no tiene zona marcada con lazo." };
  return { ok: true };
}

/**
 * Unión de los lazos de las cards descritas como PNG (blanco sobre transparente), a ≤1024 px
 * de lado y con la relación de aspecto del fotograma. Es el prior que envía el servidor al analizador.
 */
export async function buildPriorMaskDataUrl(
  cards: StudioCard[],
  frame: { width: number; height: number },
  maxSide = PRIOR_MASK_MAX_SIDE,
): Promise<string | null> {
  if (typeof document === "undefined" || frame.width < 1 || frame.height < 1) return null;
  const scale = Math.min(1, maxSide / Math.max(frame.width, frame.height));
  const width = Math.max(1, Math.round(frame.width * scale));
  const height = Math.max(1, Math.round(frame.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.clearRect(0, 0, width, height);
  let painted = false;
  for (const card of cards.filter(cardIsDescribed)) {
    if (card.paintData) {
      try {
        const img = await loadImageElement(card.paintData);
        ctx.drawImage(img, 0, 0, width, height);
        painted = true;
        continue;
      } catch {
        /* cae al polígono */
      }
    }
    if (isValidClosedLasso(card.lassoPoints)) {
      const closed = closeLassoPoints(card.lassoPoints);
      ctx.beginPath();
      ctx.moveTo(closed[0]!.x * scale, closed[0]!.y * scale);
      for (let i = 1; i < closed.length; i++) ctx.lineTo(closed[i]!.x * scale, closed[i]!.y * scale);
      ctx.closePath();
      ctx.fillStyle = "rgba(255,255,255,1)";
      ctx.fill();
      painted = true;
    }
  }
  return painted ? canvas.toDataURL("image/png") : null;
}

export type ComposeImageSource = { key: string } | { dataUrl: string };

/** Referencia servible por el servidor: clave S3 propia o, si no hay, la imagen como data URL. */
export async function resolveComposeImageSource(src: string | null | undefined): Promise<ComposeImageSource | null> {
  if (!src) return null;
  const key = tryExtractKnowledgeFilesKeyFromUrl(src);
  if (key) return { key };
  if (src.startsWith("data:image/")) return { dataUrl: src };
  if (/^(blob:|https?:|\/)/i.test(src)) {
    try {
      const res = await fetch(src, { cache: "no-store" });
      if (!res.ok) return null;
      const blob = await res.blob();
      if (!blob.type.startsWith("image/") || blob.size > SOURCE_DATA_URL_MAX_BYTES) return null;
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("No se pudo leer la imagen."));
        reader.readAsDataURL(blob);
      });
      return dataUrl.startsWith("data:image/") ? { dataUrl } : null;
    } catch {
      return null;
    }
  }
  return null;
}

export type PreserveComposeOutcome = {
  composed: boolean;
  output: string | null;
  key: string | null;
  decision: string;
  reason: string | null;
  stats: ChangeMaskStats | null;
  maskPreview: string | null;
  timeMs: number | null;
  optical: OpticalMatchStats | null;
  usedPriorFallback: boolean;
  contextCrop: boolean;
};

export type { StudioComposeSummary };

export function summarizeComposeOutcome(outcome: PreserveComposeOutcome): StudioComposeSummary {
  return {
    composed: outcome.composed,
    decision: outcome.decision,
    reason: outcome.reason,
    changedPct: outcome.stats ? Math.round(outcome.stats.changedFraction * 1000) / 10 : null,
    componentsKept: outcome.stats?.componentsKept ?? null,
    componentsDropped: outcome.stats?.componentsDropped ?? null,
    blurSigmaPx: outcome.optical?.blurSigmaPx ?? null,
    grainAdded: outcome.optical?.grainAdded ?? null,
    usedPriorFallback: outcome.usedPriorFallback || null,
    contextCrop: outcome.contextCrop || null,
  };
}

function unavailable(reason: string, contextCrop = false): PreserveComposeOutcome {
  return {
    composed: false,
    output: null,
    key: null,
    decision: "unavailable",
    reason,
    stats: null,
    maskPreview: null,
    timeMs: null,
    optical: null,
    usedPriorFallback: false,
    contextCrop,
  };
}

export async function runPreserveCompose(args: {
  baseImage: string;
  generatedOutput: string;
  generatedKey?: string | null;
  cards: StudioCard[];
  frame: { width: number; height: number };
  sensitivity?: ChangeMaskSensitivity;
  /** Recorte de contexto (coordenadas del fotograma) con el que se generó `generatedOutput`. */
  crop?: StudioContextCrop | null;
}): Promise<PreserveComposeOutcome> {
  const crop = args.crop ?? null;
  const priorCards = crop ? cropCardsToRect(args.cards, crop) : args.cards;
  const priorFrame = crop ? { width: crop.width, height: crop.height } : args.frame;
  const [base, generated, priorMask] = await Promise.all([
    resolveComposeImageSource(args.baseImage),
    args.generatedKey ? Promise.resolve<ComposeImageSource>({ key: args.generatedKey }) : resolveComposeImageSource(args.generatedOutput),
    buildPriorMaskDataUrl(priorCards, priorFrame),
  ]);
  if (!base) return unavailable("La imagen base no está disponible para componer.", Boolean(crop));
  if (!generated) return unavailable("La imagen generada no está disponible para componer.", Boolean(crop));

  const res = await fetch(PRESERVE_COMPOSE_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      base,
      generated,
      priorMask,
      sensitivity: args.sensitivity ?? "auto",
      crop,
      cropFrame: crop ? args.frame : null,
    }),
  });
  const json = (await res.json().catch(() => null)) as
    | {
        composed?: boolean;
        output?: string;
        key?: string;
        decision?: string;
        reason?: string;
        stats?: ChangeMaskStats | null;
        maskPreview?: string | null;
        timeMs?: number;
        optical?: OpticalMatchStats | null;
        usedPriorFallback?: boolean;
        error?: string;
      }
    | null;
  if (!res.ok || !json) {
    throw new Error(json?.error || `No se pudo componer la imagen (HTTP ${res.status}).`);
  }
  return {
    composed: json.composed === true && typeof json.output === "string",
    output: typeof json.output === "string" ? json.output : null,
    key: typeof json.key === "string" ? json.key : null,
    decision: typeof json.decision === "string" ? json.decision : json.composed ? "compose" : "unknown",
    reason: typeof json.reason === "string" ? json.reason : null,
    stats: json.stats ?? null,
    maskPreview: typeof json.maskPreview === "string" ? json.maskPreview : null,
    timeMs: typeof json.timeMs === "number" ? json.timeMs : null,
    optical: json.optical ?? null,
    usedPriorFallback: json.usedPriorFallback === true,
    contextCrop: Boolean(crop),
  };
}
