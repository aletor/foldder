/**
 * Cliente para POST /api/gemini/generate-stream (NDJSON con fases y progreso real de servidor).
 */

export type GeminiStreamResult = {
  output: string;
  key?: string;
  model?: string;
  time?: number;
};

const GEMINI_STREAM_SOFT_PAYLOAD_LIMIT = 3_200_000;
const GEMINI_STREAM_HARD_PAYLOAD_LIMIT = 4_000_000;
const GEMINI_REF_INITIAL_MAX_DIMENSION = 1536;
const GEMINI_REF_MIN_MAX_DIMENSION = 768;
const GEMINI_REF_UPLOAD_MAX_BYTES = 2_800_000;

function isDataImage(value: unknown): value is string {
  return typeof value === "string" && /^data:image\/[^;,]+(?:;[^,]*)?;base64,/i.test(value);
}

function jsonSize(body: Record<string, unknown>): number {
  return new TextEncoder().encode(JSON.stringify(body)).length;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("No se pudo preparar una referencia visual para Gemini."));
    img.src = src;
  });
}

async function compressDataImageForGemini(
  dataUrl: string,
  options?: { maxDimension?: number; quality?: number },
): Promise<string> {
  if (typeof document === "undefined") return dataUrl;
  const img = await loadImage(dataUrl);
  const maxDimension = Math.max(
    GEMINI_REF_MIN_MAX_DIMENSION,
    Math.floor(options?.maxDimension ?? GEMINI_REF_INITIAL_MAX_DIMENSION),
  );
  const quality = Math.max(0.52, Math.min(0.9, options?.quality ?? 0.78));
  const scale = Math.min(1, maxDimension / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height, 1));
  const width = Math.max(1, Math.round((img.naturalWidth || img.width || 1) * scale));
  const height = Math.max(1, Math.round((img.naturalHeight || img.height || 1) * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", quality);
}

function dataUrlToFile(dataUrl: string, filename: string): File | null {
  const match = /^data:([^;,]+)(?:;[^,]*)?;base64,(.*)$/i.exec(dataUrl);
  if (!match) return null;
  const mimeType = match[1] || "image/jpeg";
  const binary = atob(match[2] || "");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new File([bytes], filename, { type: mimeType });
}

async function uploadGeminiReference(dataUrl: string, index: number): Promise<string> {
  let maxDimension = GEMINI_REF_INITIAL_MAX_DIMENSION;
  let quality = 0.78;
  let compacted = await compressDataImageForGemini(dataUrl, { maxDimension, quality });
  let file = dataUrlToFile(compacted, `gemini-reference-${Date.now()}-${index}.jpg`);

  while (file && file.size > GEMINI_REF_UPLOAD_MAX_BYTES && maxDimension > GEMINI_REF_MIN_MAX_DIMENSION) {
    maxDimension = Math.max(GEMINI_REF_MIN_MAX_DIMENSION, Math.floor(maxDimension * 0.72));
    quality = Math.max(0.58, quality - 0.08);
    compacted = await compressDataImageForGemini(compacted, { maxDimension, quality });
    file = dataUrlToFile(compacted, `gemini-reference-${Date.now()}-${index}.jpg`);
  }

  if (!file || file.size > GEMINI_REF_UPLOAD_MAX_BYTES) {
    throw new Error("Una referencia visual sigue siendo demasiado pesada para prepararla para Gemini.");
  }

  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch("/api/gemini/reference-upload", {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `No se pudo subir la referencia visual (${res.status}).`);
  }
  const json = (await res.json()) as { url?: string };
  if (!json.url) throw new Error("La subida de referencia visual no devolvió URL.");
  return json.url;
}

async function compactGeminiStreamReferences(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const next: Record<string, unknown> = { ...body };
  const imageValues = Array.isArray(next.images)
    ? next.images
    : isDataImage(next.image)
      ? [next.image]
      : [];

  if (!imageValues.some(isDataImage)) return next;

  const compactedImages = await Promise.all(
    imageValues.map((value, index) =>
      isDataImage(value) ? uploadGeminiReference(value, index) : value,
    ),
  );
  next.images = compactedImages;
  delete next.image;

  return next;
}

export async function geminiGenerateWithServerProgress(
  body: Record<string, unknown>,
  onProgress: (pct: number, stage: string) => void
): Promise<GeminiStreamResult> {
  const preparedBody = await compactGeminiStreamReferences(body);
  const preparedSize = jsonSize(preparedBody);
  if (preparedSize > GEMINI_STREAM_HARD_PAYLOAD_LIMIT) {
    throw new Error(
      "Las referencias visuales son demasiado pesadas para Gemini Stream. Reduce el número de imágenes o usa referencias ya subidas a S3.",
    );
  }

  const res = await fetch("/api/gemini/generate-stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(preparedBody),
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
