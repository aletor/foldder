/**
 * Cliente para POST /api/gemini/generate-stream (NDJSON con fases y progreso real de servidor).
 */

export type GeminiStreamResult = {
  output: string;
  key?: string;
  model?: string;
  time?: number;
};

export async function geminiGenerateWithServerProgress(
  body: Record<string, unknown>,
  onProgress: (pct: number, stage: string) => void
): Promise<GeminiStreamResult> {
  const res = await fetch("/api/gemini/generate-stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    let msg = `HTTP ${res.status}`;
    try {
      const j = JSON.parse(t) as { error?: string; message?: string; details?: string };
      if (j?.message) msg = String(j.message);
      else if (j?.details) msg = String(j.details);
      else if (j?.error) msg = String(j.error);
      else if (t) msg = t.slice(0, 300);
    } catch {
      if (t) msg = t.slice(0, 300);
    }
    throw new Error(msg);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("Sin cuerpo de respuesta");

  const dec = new TextDecoder();
  let buf = "";
  let result: GeminiStreamResult | null = null;
  let lastProgress = 0;

  const handleMessage = (msg: {
    type?: string;
    progress?: number;
    stage?: string;
    output?: string;
    key?: string;
    model?: string;
    time?: number;
    error?: string;
    details?: string;
  }) => {
    if (msg.type === "phase" && typeof msg.progress === "number") {
      lastProgress = msg.progress;
      onProgress(msg.progress, msg.stage || "");
    }
    if (msg.type === "done" && typeof msg.output === "string") {
      if (!msg.output.trim()) {
        throw new Error("Salida vacía del generador (posible bloqueo de política o copyright).");
      }
      if (lastProgress < 100) {
        onProgress(100, "complete");
      }
      result = {
        output: msg.output,
        key: typeof msg.key === "string" ? msg.key : undefined,
        model: typeof msg.model === "string" ? msg.model : undefined,
        time: typeof msg.time === "number" ? msg.time : undefined,
      };
    }
    if (msg.type === "error") {
      const main = typeof msg.error === "string" && msg.error.trim() ? msg.error.trim() : "Error en generación";
      const det =
        typeof msg.details === "string" && msg.details.trim() ? msg.details.trim().slice(0, 600) : "";
      throw new Error(det ? `${main} — ${det}` : main);
    }
  };

  const consumeLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let msg: Parameters<typeof handleMessage>[0];
    try {
      msg = JSON.parse(trimmed);
    } catch {
      return;
    }
    handleMessage(msg);
  };

  while (true) {
    const { done, value } = await reader.read();
    if (value) {
      buf += dec.decode(value, { stream: !done });
    }
    for (;;) {
      const nl = buf.indexOf("\n");
      if (nl < 0) break;
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      consumeLine(line);
    }
    if (done) break;
  }
  // Última línea sin \n final (algunos runtimes no la entregan en el buffer)
  if (buf.trim()) {
    consumeLine(buf);
  }

  if (!result) {
    throw new Error("Respuesta incompleta del servidor");
  }
  if (lastProgress < 100) {
    onProgress(100, "complete");
  }
  return result;
}
