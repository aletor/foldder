import {
  estimateBrandKitGalleryWalletCost,
} from "@/lib/brandkit/brand-kit-gallery-cost";
import {
  estimateGeminiImageGenerationUsd,
  estimateGeminiUsd,
  estimateGeminiVeoVideoUsd,
  estimateOpenAiImageGenerationUsd,
  estimateOpenAITranscriptionUsd,
  estimateOpenAIUsd,
  estimateVideoEditorRenderReserveUsd,
  estimateSeedanceVideoUsd,
  resolveOpenAiImageQuality,
  veoResolutionMultiplier,
} from "@/lib/pricing-config";

export type WalletCostEstimate = {
  label: string;
  route: string;
  category: "text" | "image" | "video" | "analysis" | "utility";
  estimatedCostMicros: number;
  reserveMicros: number;
  tone: "quiet" | "confirm" | "strong";
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function numberValue(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function usdToMicros(usd: number): number {
  if (!Number.isFinite(usd) || usd <= 0) return 0;
  return Math.ceil(usd * 1_000_000);
}

function reserveUsdToMicros(usd: number, multiplier: number, minimumMicros = 1_000): number {
  const base = usdToMicros(usd);
  if (base <= 0) return 0;
  return Math.max(minimumMicros, Math.ceil(base * multiplier));
}

function roundedUsd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function textLengthFromFields(body: Record<string, unknown>, fields: string[], fallback = 1200): number {
  let total = 0;
  for (const field of fields) {
    const value = body[field];
    if (typeof value === "string") total += value.length;
    else if (value != null) total += JSON.stringify(value).length;
  }
  return Math.max(fallback, total);
}

function estimateTextRoute(args: {
  label: string;
  route: string;
  body: Record<string, unknown>;
  inputChars: number;
  model?: string;
  outputTokens: number;
  multiplier: number;
}): WalletCostEstimate {
  const inputTokens = Math.ceil(args.inputChars / 4);
  const estimated = estimateOpenAIUsd(args.model || "gpt-4o-mini", inputTokens, args.outputTokens);
  return {
    label: args.label,
    route: args.route,
    category: "text",
    estimatedCostMicros: usdToMicros(estimated),
    reserveMicros: reserveUsdToMicros(estimated, args.multiplier),
    tone: "quiet",
  };
}

function videoDuration(body: Record<string, unknown>, fallback: number): number {
  return numberValue(body.durationSeconds ?? body.duration, fallback);
}

function transcriptionDuration(body: Record<string, unknown>): number {
  return Math.min(4 * 60 * 60, Math.max(30, videoDuration(body, 60)));
}

export function estimateWalletCostForRoute(
  route: string,
  rawBody: unknown,
): WalletCostEstimate | null {
  const body = asRecord(rawBody);

  if (route === "/api/gemini/generate" || route === "/api/gemini/generate-stream") {
    const model = stringValue(body.model, "flash31");
    const resolution = stringValue(body.resolution);
    const estimated = estimateGeminiImageGenerationUsd(model, resolution);
    return {
      label: "Generar imagen",
      route,
      category: "image",
      estimatedCostMicros: usdToMicros(estimated),
      reserveMicros: reserveUsdToMicros(estimated, 1.15),
      tone: "confirm",
    };
  }

  if (route === "/api/openai/generate-stream") {
    const resolution = stringValue(body.resolution);
    const quality = resolveOpenAiImageQuality(resolution);
    const estimated = estimateOpenAiImageGenerationUsd(resolution, quality);
    return {
      label: "Generar imagen ChatGPT",
      route,
      category: "image",
      estimatedCostMicros: usdToMicros(estimated),
      reserveMicros: reserveUsdToMicros(estimated, 1.15),
      tone: "confirm",
    };
  }

  if (route === "/api/gemini/video") {
    const resolution = stringValue(body.resolution, "1080p");
    const rawDuration = videoDuration(body, 8);
    const dur = rawDuration < 5 ? 4 : rawDuration < 7 ? 6 : 8;
    const needsEight = resolution.toLowerCase().includes("1080") || resolution.toLowerCase().includes("4k");
    const effectiveDuration = needsEight ? 8 : dur;
    const estimated = roundedUsd(
      estimateGeminiVeoVideoUsd(effectiveDuration) * veoResolutionMultiplier(resolution),
    );
    return {
      label: "Generar vídeo Veo",
      route,
      category: "video",
      estimatedCostMicros: usdToMicros(estimated),
      reserveMicros: reserveUsdToMicros(estimated, 1.15),
      tone: "strong",
    };
  }

  if (route === "/api/runway/generate") {
    const dur = videoDuration(body, 5) === 10 ? 10 : 5;
    const estimated = roundedUsd(dur * 0.05);
    return {
      label: "Generar vídeo Runway",
      route,
      category: "video",
      estimatedCostMicros: usdToMicros(estimated),
      reserveMicros: reserveUsdToMicros(estimated, 1.2),
      tone: "strong",
    };
  }

  if (route === "/api/grok/generate") {
    const dur = Math.max(1, videoDuration(body, 5));
    const estimated = roundedUsd(dur * 0.04);
    return {
      label: "Generar vídeo Grok",
      route,
      category: "video",
      estimatedCostMicros: usdToMicros(estimated),
      reserveMicros: reserveUsdToMicros(estimated, 1.2),
      tone: "strong",
    };
  }

  if (route === "/api/seedance/video") {
    const dur = Math.min(12, Math.max(2, Math.round(videoDuration(body, 5))));
    const estimated = estimateSeedanceVideoUsd(dur);
    return {
      label: "Generar vídeo Seedance",
      route,
      category: "video",
      estimatedCostMicros: usdToMicros(estimated),
      reserveMicros: reserveUsdToMicros(estimated, 1.2),
      tone: "strong",
    };
  }

  if (route === "/api/spaces/video-matte") {
    const estimated = 0.05;
    return {
      label: "Video matte",
      route,
      category: "video",
      estimatedCostMicros: usdToMicros(estimated),
      reserveMicros: reserveUsdToMicros(estimated, 1.25),
      tone: "confirm",
    };
  }

  if (route === "/api/spaces/matte") {
    const estimated = 0.01;
    return {
      label: "Quitar fondo",
      route,
      category: "image",
      estimatedCostMicros: usdToMicros(estimated),
      reserveMicros: reserveUsdToMicros(estimated, 1.25),
      tone: "quiet",
    };
  }

  if (route === "/api/gemini/analyze-areas") {
    const estimated = 0.02;
    return {
      label: "Analizar imagen",
      route,
      category: "analysis",
      estimatedCostMicros: usdToMicros(estimated),
      reserveMicros: reserveUsdToMicros(estimated, 1.25),
      tone: "quiet",
    };
  }

  if (route === "/api/gemini/analyze-correction") {
    const estimated = 0.006;
    return {
      label: "Analizar corrección",
      route,
      category: "analysis",
      estimatedCostMicros: usdToMicros(estimated),
      reserveMicros: reserveUsdToMicros(estimated, 1.25),
      tone: "confirm",
    };
  }

  if (route === "/api/gemini/describe-region") {
    const estimated = 0.004;
    return {
      label: "Describir región",
      route,
      category: "analysis",
      estimatedCostMicros: usdToMicros(estimated),
      reserveMicros: reserveUsdToMicros(estimated, 1.25),
      tone: "confirm",
    };
  }

  if (route === "/api/openai/enhance") {
    const estimated = 0.02;
    return {
      label: "Mejorar prompt",
      route,
      category: "text",
      estimatedCostMicros: usdToMicros(estimated),
      reserveMicros: reserveUsdToMicros(estimated, 1.25),
      tone: "quiet",
    };
  }

  if (route === "/api/spaces/describe") {
    const mediaType = stringValue(body.type, "image").toLowerCase();
    if (mediaType !== "image" && mediaType !== "video") return null;
    const estimated = 0.03;
    return {
      label: mediaType === "video" ? "Describir vídeo" : "Describir imagen",
      route,
      category: "analysis",
      estimatedCostMicros: usdToMicros(estimated),
      reserveMicros: reserveUsdToMicros(estimated, 1.25),
      tone: "confirm",
    };
  }

  if (route === "/api/spaces/pdf-scan/ocr") {
    const maxPages = Math.min(10, Math.max(1, numberValue(body.maxPages, 10)));
    const pagesDone = Array.isArray(body.pagesDone) ? body.pagesDone.length : 0;
    const pages = Math.max(1, maxPages - pagesDone);
    const estimated = roundedUsd(pages * 0.008);
    return {
      label: pages === 1 ? "OCR PDF (1 página)" : `OCR PDF (${pages} páginas)`,
      route,
      category: "analysis",
      estimatedCostMicros: usdToMicros(estimated),
      reserveMicros: reserveUsdToMicros(estimated, 1.25),
      tone: "confirm",
    };
  }

  if (route === "/api/spaces/search") {
    if (body.verify === false) return null;
    const estimated = 0.02;
    return {
      label: "Búsqueda visual verificada",
      route,
      category: "analysis",
      estimatedCostMicros: usdToMicros(estimated),
      reserveMicros: reserveUsdToMicros(estimated, 1.5),
      tone: "confirm",
    };
  }

  if (route === "/api/spaces/guionista") {
    const task = stringValue(body.task, "draft");
    const outputTokens = task === "social" ? 1700 : task === "approaches" ? 1000 : task.includes("apply") ? 3600 : 2600;
    return estimateTextRoute({
      label: "Guionista",
      route,
      body,
      inputChars: textLengthFromFields(body, ["idea", "brief", "currentVersion", "settings", "brainContext"], 1600),
      model: "gpt-4o",
      outputTokens,
      multiplier: 1.6,
    });
  }

  if (route === "/api/spaces/text-content") {
    const text = stringValue(body.text);
    const maxTokens = Math.min(4096, Math.max(256, Math.ceil(text.length / 2) + 256));
    return estimateTextRoute({
      label: "Editar texto",
      route,
      body,
      inputChars: Math.max(800, text.length + 180),
      model: "gpt-4o-mini",
      outputTokens: maxTokens,
      multiplier: 1.6,
    });
  }

  if (route === "/api/spaces/assistant") {
    return estimateTextRoute({
      label: "Asistente",
      route,
      body,
      inputChars: textLengthFromFields(body, ["prompt", "nodes", "edges", "projectAssets"], 2400),
      model: "gpt-4o-mini",
      outputTokens: 1600,
      multiplier: 1.8,
    });
  }

  if (route === "/api/spaces/brandKit/crawl") {
    if (body.enableLlm === false) return null;
    const model = "gemini-2.5-flash";
    const textCall = estimateGeminiUsd(model, 6500, 900);
    const estimated = roundedUsd(textCall * 2.5 + 0.008);
    return {
      label: "BrandKit · analizar web",
      route,
      category: "analysis",
      estimatedCostMicros: usdToMicros(estimated),
      reserveMicros: reserveUsdToMicros(estimated, 1.5),
      tone: "confirm",
    };
  }

  if (route === "/api/spaces/brandKit/ingest") {
    if (body.enableLlm === false) return null;
    const model = "gemini-2.5-flash";
    const textCall = estimateGeminiUsd(model, 6500, 900);
    const estimated = roundedUsd(textCall * 2 + 0.008);
    return {
      label: "BrandKit · ingestar archivos",
      route,
      category: "analysis",
      estimatedCostMicros: usdToMicros(estimated),
      reserveMicros: reserveUsdToMicros(estimated, 1.5),
      tone: "confirm",
    };
  }

  if (route === "/api/spaces/brandKit/gallery/analyze-briefs") {
    const model = "gemini-2.5-flash";
    const estimated = roundedUsd(estimateGeminiUsd(model, 9000, 1800));
    return {
      label: "BrandKit · analizar briefs de galería",
      route,
      category: "analysis",
      estimatedCostMicros: usdToMicros(estimated),
      reserveMicros: reserveUsdToMicros(estimated, 1.5),
      tone: "confirm",
    };
  }

  if (route === "/api/spaces/brandKit/gallery/generate") {
    const category =
      body && typeof body === "object" && typeof (body as { category?: string }).category === "string"
        ? (body as { category?: import("@/lib/brandkit/brand-kit-gallery-plan").GalleryGenerateCategory }).category
        : undefined;
    const variantIndex =
      body && typeof body === "object" && typeof (body as { variantIndex?: number }).variantIndex === "number"
        ? (body as { variantIndex?: number }).variantIndex
        : undefined;
    const imageCount =
      variantIndex != null ? 1 : category ? 4 : undefined;
    const wallet = estimateBrandKitGalleryWalletCost(category, imageCount);
    return {
      label: wallet.label,
      route,
      category: wallet.category,
      estimatedCostMicros: wallet.estimatedCostMicros,
      reserveMicros: wallet.reserveMicros,
      tone: wallet.tone,
    };
  }

  if (route === "/api/spaces/cine/analyze") {
    return estimateTextRoute({
      label: "Analizar guion",
      route,
      body,
      inputChars: textLengthFromFields(body, ["script", "mode"], 2400),
      model: "gpt-4o",
      outputTokens: 5200,
      multiplier: 1.5,
    });
  }

  if (route === "/api/video-editor/subtitles/transcribe") {
    const estimated = estimateOpenAITranscriptionUsd(transcriptionDuration(body));
    return {
      label: "Transcribir subtítulos",
      route,
      category: "utility",
      estimatedCostMicros: usdToMicros(estimated),
      reserveMicros: reserveUsdToMicros(estimated, 1.5),
      tone: "quiet",
    };
  }

  if (route === "/api/video-editor/render") {
    const manifest = asRecord(body.manifest);
    const settings = asRecord(manifest.settings);
    const estimated = estimateVideoEditorRenderReserveUsd({
      durationSeconds: numberValue(manifest.durationSeconds, 60),
      fps: numberValue(settings.fps, 30),
      width: numberValue(settings.width, 1920),
      height: numberValue(settings.height, 1080),
    });
    return {
      label: "Renderizar vídeo",
      route,
      category: "video",
      estimatedCostMicros: usdToMicros(estimated),
      reserveMicros: reserveUsdToMicros(estimated, 1.25),
      tone: "confirm",
    };
  }

  if (route === "/api/spaces/brandKit/visual/generate") {
    const estimated = estimateGeminiImageGenerationUsd("flash31", "1k");
    return {
      label: "BrandKit · imagen de referencia",
      route,
      category: "image",
      estimatedCostMicros: usdToMicros(estimated),
      reserveMicros: reserveUsdToMicros(estimated, 1.15),
      tone: "confirm",
    };
  }

  if (route === "/api/spaces/brandKit/logo/vectorize") {
    const estimated = 0.05;
    return {
      label: "BrandKit · vectorizar logo",
      route,
      category: "utility",
      estimatedCostMicros: usdToMicros(estimated),
      reserveMicros: reserveUsdToMicros(estimated, 1.2),
      tone: "confirm",
    };
  }

  if (route === "/api/spaces/brandKit/ingest") {
    const kind = stringValue(body.paidAnalysisKind, "pdf");
    const estimated = kind === "url" ? 0.012 : 0.045;
    return {
      label: kind === "url" ? "BrandKit · refinado de voz (web)" : "BrandKit · análisis de marca (PDF)",
      route,
      category: "analysis",
      estimatedCostMicros: usdToMicros(estimated),
      reserveMicros: reserveUsdToMicros(estimated, 1.25),
      tone: "confirm",
    };
  }

  return null;
}
