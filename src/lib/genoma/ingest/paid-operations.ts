/**
 * Firmas estables e IDs de operación de pago (wallet + idempotencia).
 * Sin dependencias Node — seguro para importar desde componentes cliente.
 */

import { textSignature } from "../model/signature";
import type { ImageAxes } from "../model/trait-values";

export function genomaOperationId(kind: "visual" | "vectorize" | "voice" | "ingest", signature: string): string {
  const sig = signature.replace(/[^\w.-]+/g, "_").slice(0, 64);
  return `genoma:${kind}:${sig}`;
}

/** ID de wallet único por intento de ingesta (evita duplicate_wallet_operation al reintentar). */
export function freshGenomaIngestOperationId(contentSignature: string, nonce?: string): string {
  const base = contentSignature.replace(/[^\w.-]+/g, "_").slice(0, 16);
  const unique = nonce ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return genomaOperationId("ingest", `${base}-${unique}`);
}

/** ID de wallet único por intento de imagen visual (mismo axes puede reintentarse). */
export function freshGenomaVisualOperationId(axesSig: string, nonce?: string): string {
  const base = axesSig.replace(/[^\w.-]+/g, "_").slice(0, 16);
  const unique = nonce ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return genomaOperationId("visual", `${base}-${unique}`);
}

/** ID de wallet único por intento de vectorización (mismo logo puede reintentarse). */
export function freshGenomaVectorizeOperationId(logoSignature: string, nonce?: string): string {
  const base = logoSignature.replace(/[^\w.-]+/g, "_").slice(0, 16);
  const unique = nonce ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return genomaOperationId("vectorize", `${base}-${unique}`);
}

export function axesSignature(axes: ImageAxes): string {
  const parts = Object.entries(axes)
    .filter(([, v]) => v)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${String(v).trim()}`);
  return textSignature(parts.join("|"));
}

export function textSampleSignature(text: string): string {
  return textSignature(text.slice(0, 2000));
}
