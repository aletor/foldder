/**
 * Parse fetch Response bodies as JSON without throwing when the server returns HTML (404/500 pages).
 */
export type HttpJsonError = Error & {
  actualRevision?: number;
  code?: string;
  conflict?: boolean;
  context?: string;
  detail?: unknown;
  retryable?: boolean;
  status?: number;
};

function notifyWalletError(parsed: unknown, status: number): void {
  if (typeof window === "undefined" || status !== 402) return;
  const body = asRecord(parsed);
  if (body?.code !== "insufficient_balance") return;
  window.dispatchEvent(new CustomEvent("foldder:wallet-refresh", { detail: { reason: "insufficient_balance" } }));
  window.dispatchEvent(new CustomEvent("foldder:wallet-open", { detail: { reason: "insufficient_balance" } }));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function looksLikeHtmlErrorPage(text: string): boolean {
  const trimmed = text.trim();
  return (
    trimmed.startsWith("<!DOCTYPE") ||
    trimmed.startsWith("<!doctype") ||
    trimmed.startsWith("<html") ||
    trimmed.includes("__next_error__") ||
    /<html[\s>]/i.test(trimmed)
  );
}

/** Evita mostrar páginas HTML de error de Next/Vercel en toasts o alerts. */
export function sanitizeUserFacingErrorMessage(
  text: string,
  options?: { status?: number; maxLength?: number },
): string {
  const trimmed = text.trim();
  const maxLength = options?.maxLength ?? 300;
  const status = options?.status;

  if (!trimmed) {
    return status ? `Error del servidor (${status}).` : "Error inesperado del servidor.";
  }

  if (looksLikeHtmlErrorPage(trimmed)) {
    return status
      ? `El servidor devolvió un error (${status}). Reintenta en unos segundos.`
      : "El servidor devolvió un error inesperado. Reintenta en unos segundos.";
  }

  if (/<[a-z][^>]*>/i.test(trimmed) && trimmed.length > 120) {
    return status ? `Error del servidor (${status}).` : "Error del servidor.";
  }

  if (trimmed.length > maxLength) {
    return `${trimmed.slice(0, maxLength)}…`;
  }

  return trimmed;
}

function createHttpJsonError(message: string, context: string, status: number, parsed?: unknown): HttpJsonError {
  const error = new Error(message) as HttpJsonError;
  const body = asRecord(parsed);
  error.context = context;
  error.status = status;
  if (typeof body?.code === "string") error.code = body.code;
  if (body?.conflict === true) error.conflict = true;
  if (typeof body?.actualRevision === "number" && Number.isFinite(body.actualRevision)) {
    error.actualRevision = body.actualRevision;
  }
  if (typeof body?.retryable === "boolean") error.retryable = body.retryable;
  if (body && Object.prototype.hasOwnProperty.call(body, "detail")) {
    error.detail = body.detail;
  }
  return error;
}

export async function readResponseJson<T>(res: Response, context: string): Promise<T | null> {
  const text = await res.text();
  const trimmed = text.trim();
  if (looksLikeHtmlErrorPage(trimmed)) {
    console.warn(
      `[${context}] Expected JSON but received HTML (status ${res.status}). Check the API route or dev server.`
    );
    return null;
  }
  try {
    return JSON.parse(text) as T;
  } catch (e) {
    console.warn(`[${context}] JSON parse failed:`, (e as Error).message);
    return null;
  }
}

/**
 * JSON + comprobación de `res.ok`: lanza con mensaje útil (body `error` o status).
 * Usar en flujos donde un fallo HTTP no debe pasar desapercibido.
 */
export async function readJsonWithHttpError<T>(res: Response, context: string): Promise<T> {
  const text = await res.text();
  const trimmed = text.trim();
  if (looksLikeHtmlErrorPage(trimmed)) {
    throw createHttpJsonError(
      `${context}: el servidor devolvió HTML (${res.status}), no JSON. Revisa la ruta API o el límite del cuerpo.`,
      context,
      res.status,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw createHttpJsonError(`${context}: respuesta no válida (${res.status}).`, context, res.status);
  }
  if (!res.ok) {
    notifyWalletError(parsed, res.status);
    const body = asRecord(parsed);
    const msg =
      typeof body?.error === "string"
        ? body.error
        : `HTTP ${res.status}`;
    throw createHttpJsonError(msg, context, res.status, parsed);
  }
  return parsed as T;
}
