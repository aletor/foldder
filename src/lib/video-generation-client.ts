export type GeneratedVideoResponse = {
  output?: string;
  key?: string;
  status?: string;
  jobId?: string;
  error?: string;
};

const DEFAULT_POLL_MS = 8_000;
const DEFAULT_TIMEOUT_MS = 8 * 60 * 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Arranca la generación y pregunta el estado en llamadas cortas.
 * La Function ya no se queda abierta mientras el proveedor renderiza.
 */
export async function requestGeneratedVideo(
  apiPath: string,
  body: unknown,
  options?: { intervalMs?: number; timeoutMs?: number },
): Promise<GeneratedVideoResponse> {
  const startRes = await fetch(apiPath, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const started = (await startRes.json().catch(() => ({}))) as GeneratedVideoResponse;
  if (!startRes.ok) {
    throw new Error(started.error || "Generation failed");
  }
  if (started.output) return started;
  if (started.status !== "pending" || !started.jobId) {
    throw new Error(started.error || "No video output");
  }

  const intervalMs = options?.intervalMs ?? DEFAULT_POLL_MS;
  const deadline = Date.now() + (options?.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  while (Date.now() < deadline) {
    await sleep(intervalMs);
    const pollRes = await fetch(`${apiPath}?jobId=${encodeURIComponent(started.jobId)}`);
    const polled = (await pollRes.json().catch(() => ({}))) as GeneratedVideoResponse;
    if (!pollRes.ok) {
      throw new Error(polled.error || "Generation failed");
    }
    if (polled.output) return polled;
  }
  throw new Error("Tiempo de espera agotado esperando el vídeo.");
}
