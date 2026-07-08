/**
 * Política unificada de reintentos Gemini (503 / 429 / UNAVAILABLE).
 */

export const GEMINI_RETRY_DELAYS_MS = [500, 2000, 8000] as const;
export const GEMINI_RETRY_MAX_ATTEMPTS = 3;

export function isTransientGeminiError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return /503|UNAVAILABLE|high demand|429|RESOURCE_EXHAUSTED/i.test(msg);
}

export function geminiRetryDelayMs(attemptIndex: number): number {
  const base = GEMINI_RETRY_DELAYS_MS[Math.min(attemptIndex, GEMINI_RETRY_DELAYS_MS.length - 1)] ?? 8000;
  const jitter = Math.floor(Math.random() * 200);
  return base + jitter;
}

export async function withGeminiRetries<T>(input: {
  maxAttempts?: number;
  onRetry?: (attempt: number, max: number) => void;
  run: () => Promise<T>;
}): Promise<T> {
  const max = input.maxAttempts ?? GEMINI_RETRY_MAX_ATTEMPTS;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < max; attempt += 1) {
    try {
      return await input.run();
    } catch (error) {
      lastError = error;
      if (!isTransientGeminiError(error) || attempt >= max - 1) throw error;
      input.onRetry?.(attempt + 1, max);
      await new Promise((r) => setTimeout(r, geminiRetryDelayMs(attempt)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("gemini_retry_exhausted");
}
