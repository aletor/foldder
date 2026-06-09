import { parseGeminiUsageMetadata, recordApiUsage } from "@/lib/api-usage";

const VISION_MODEL = "gemini-2.5-flash";
const BATCH_SIZE = 4;
const MAX_CANDIDATES = 36;

async function imageUrlToBase64(url: string): Promise<{ data: string; mimeType: string } | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });
    if (!res.ok) return null;
    const buffer = await res.arrayBuffer();
    const headerMime = res.headers.get("content-type")?.split(";")[0]?.trim();
    const mimeType =
      headerMime ||
      (url.toLowerCase().includes(".png") ? "image/png" : "image/jpeg");
    return {
      data: Buffer.from(buffer).toString("base64"),
      mimeType,
    };
  } catch {
    return null;
  }
}

function parseResultsJson(text: string, expected: number): boolean[] | null {
  const trimmed = text.trim();
  const tryParse = (s: string): boolean[] | null => {
    try {
      const o = JSON.parse(s) as { results?: unknown };
      const arr = o.results;
      if (!Array.isArray(arr)) return null;
      return arr.map((x) => x === true);
    } catch {
      return null;
    }
  };
  let out = tryParse(trimmed);
  if (out) return normalizeLength(out, expected);
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    out = tryParse(fence[1].trim());
    if (out) return normalizeLength(out, expected);
  }
  const brace = trimmed.match(/\{[\s\S]*"results"[\s\S]*\}/);
  if (brace) {
    out = tryParse(brace[0]);
    if (out) return normalizeLength(out, expected);
  }
  return null;
}

function normalizeLength(arr: boolean[], n: number): boolean[] {
  const r = [...arr];
  while (r.length < n) r.push(false);
  return r.slice(0, n);
}

async function verifyOneBatch(
  urls: string[],
  intent: string,
  apiKey: string,
  relaxed: boolean
): Promise<{ results: boolean[]; usage: ReturnType<typeof parseGeminiUsageMetadata> }> {
  const parts: { text?: string; inline_data?: { mime_type: string; data: string } }[] = [];
  /** Posición en `urls` de cada imagen enviada a Gemini (mismo orden que `results` del modelo). */
  const okIndices: number[] = [];

  for (let i = 0; i < urls.length; i++) {
    const parsed = await imageUrlToBase64(urls[i]);
    if (parsed) {
      parts.push({ inline_data: { mime_type: parsed.mimeType, data: parsed.data } });
      okIndices.push(i);
    }
  }

  const nInline = okIndices.length;
  if (nInline === 0) {
    return {
      results: urls.map(() => false),
      usage: null,
    };
  }

  const strictBlock = relaxed
    ? `Modo menos estricto: acepta solo si el tema principal de la foto encaja claramente con la intención (p. ej. la persona nombrada, el satélite natural de la Tierra). Rechaza genéricos sin sujeto claro (solo un micrófono, iconos, textos promocionales) salvo que la intención pida explícitamente eso.`
    : `Sé ESTRICTO: la imagen debe mostrar claramente lo pedido. Rechaza:
- Fotos de stock genéricas (micrófono solo, manos, siluetas) cuando se pide una persona o celebridad concreta.
- Personas u objetos homónimos (p. ej. actor "Luna" o "Diego Luna" cuando se pide el satélite natural "Moon").
- Logos o carteles donde el tema no es la escena principal.`;

  const prompt = `Eres un verificador de relevancia de imágenes para búsqueda web.

INTENCIÓN (qué debe cumplir la imagen):
${intent}

${strictBlock}

Hay ${nInline} imágenes numeradas del 1 al ${nInline} en el mismo orden en que aparecen abajo.

Para cada imagen, decide si CUMPLE la intención (true) o NO (false).

Responde SOLO con un JSON válido, sin markdown:
{"results":[true,false,...]}
El array "results" debe tener exactamente ${nInline} elementos en el mismo orden que las imágenes enviadas.`;

  parts.push({ text: prompt });

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${VISION_MODEL}:generateContent`;
  const payload = {
    contents: [{ role: "user", parts }],
    generationConfig: { temperature: 0.1 },
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (data.error) {
    console.error("[gemini-image-intent-verify] Gemini error:", data.error);
    return {
      results: urls.map(() => false),
      usage: null,
    };
  }

  const text =
    data.candidates?.[0]?.content?.parts?.find((p: { text?: string }) => p.text)?.text || "";
  const parsed = parseResultsJson(text, nInline);
  const inlineResults =
    parsed && parsed.length === nInline ? parsed : new Array(nInline).fill(false);

  const results: boolean[] = new Array(urls.length).fill(false);
  for (let k = 0; k < okIndices.length; k++) {
    const pos = okIndices[k];
    results[pos] = inlineResults[k] === true;
  }

  const usage = parseGeminiUsageMetadata(data);
  return { results, usage };
}

/**
 * Filtra URLs de imágenes candidatas dejando solo las que coinciden con la intención semántica (visión).
 */
export async function filterImageUrlsByIntent(
  urls: string[],
  intent: string,
  apiKey: string,
  options?: {
    targetCount?: number;
    relaxedFallback?: boolean;
    onUsage?: (u: { inputTokens: number; outputTokens: number; totalTokens: number }) => void;
    usageUserEmail?: string;
  }
): Promise<string[]> {
  const target = Math.min(options?.targetCount ?? 10, 20);
  const capped = urls.slice(0, MAX_CANDIDATES);
  const intentTrim = intent.trim().slice(0, 800);
  if (!intentTrim || capped.length === 0) return [];

  const runPass = async (relaxed: boolean): Promise<string[]> => {
    const kept: string[] = [];
    for (let i = 0; i < capped.length; i += BATCH_SIZE) {
      const batch = capped.slice(i, i + BATCH_SIZE);
      const { results, usage } = await verifyOneBatch(batch, intentTrim, apiKey, relaxed);
      if (usage && options?.onUsage) {
        options.onUsage({
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          totalTokens: usage.totalTokens,
        });
      } else if (usage) {
        await recordApiUsage({
          provider: "gemini",
          userEmail: options?.usageUserEmail,
          serviceId: "gemini-search-verify",
          route: "/api/spaces/search",
          model: VISION_MODEL,
          operation: "image_intent_verify",
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          totalTokens: usage.totalTokens,
          note: relaxed ? "verify relaxed" : "verify strict",
        });
      }

      for (let k = 0; k < batch.length; k++) {
        if (results[k]) kept.push(batch[k]);
        if (kept.length >= target) return kept.slice(0, target);
      }
    }
    return kept.slice(0, target);
  };

  let out = await runPass(false);
  if (out.length === 0 && options?.relaxedFallback !== false) {
    out = await runPass(true);
  }
  return out;
}

export { MAX_CANDIDATES, VISION_MODEL };
