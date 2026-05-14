/**
 * Parse fetch Response bodies as JSON without throwing when the server returns HTML (404/500 pages).
 */
export type HttpJsonError = Error & {
  code?: string;
  context?: string;
  detail?: unknown;
  retryable?: boolean;
  status?: number;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function createHttpJsonError(message: string, context: string, status: number, parsed?: unknown): HttpJsonError {
  const error = new Error(message) as HttpJsonError;
  const body = asRecord(parsed);
  error.context = context;
  error.status = status;
  if (typeof body?.code === "string") error.code = body.code;
  if (typeof body?.retryable === "boolean") error.retryable = body.retryable;
  if (body && Object.prototype.hasOwnProperty.call(body, "detail")) {
    error.detail = body.detail;
  }
  return error;
}

export async function readResponseJson<T>(res: Response, context: string): Promise<T | null> {
  const text = await res.text();
  const trimmed = text.trim();
  if (
    trimmed.startsWith("<!DOCTYPE") ||
    trimmed.startsWith("<!doctype") ||
    trimmed.startsWith("<html")
  ) {
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
  if (
    trimmed.startsWith("<!DOCTYPE") ||
    trimmed.startsWith("<!doctype") ||
    trimmed.startsWith("<html")
  ) {
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
    const body = asRecord(parsed);
    const msg =
      typeof body?.error === "string"
        ? body.error
        : `HTTP ${res.status}`;
    throw createHttpJsonError(msg, context, res.status, parsed);
  }
  return parsed as T;
}
