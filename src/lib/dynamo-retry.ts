const RETRYABLE_ERROR_NAMES = new Set([
  "InternalServerError",
  "LimitExceededException",
  "ProvisionedThroughputExceededException",
  "RequestLimitExceeded",
  "ThrottlingException",
]);

export function isDynamoTransactionConflict(error: unknown): boolean {
  if ((error as { name?: string })?.name !== "TransactionCanceledException") return false;
  const reasons = (error as { CancellationReasons?: Array<{ Code?: string }> }).CancellationReasons;
  return reasons?.some((reason) => reason.Code === "TransactionConflict") ?? false;
}

function isRetryable(error: unknown): boolean {
  const name = (error as { name?: string })?.name;
  if (!name) return false;
  return RETRYABLE_ERROR_NAMES.has(name);
}

export function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withDynamoRetry<T>(
  fn: () => Promise<T>,
  options?: { baseDelayMs?: number; maxAttempts?: number },
): Promise<T> {
  const maxAttempts = options?.maxAttempts ?? 5;
  const baseDelayMs = options?.baseDelayMs ?? 25;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isRetryable(error) || attempt >= maxAttempts) {
        throw error;
      }
      const jitter = Math.floor(Math.random() * baseDelayMs);
      const delay = baseDelayMs * 2 ** (attempt - 1) + jitter;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
