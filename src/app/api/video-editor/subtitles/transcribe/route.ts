import { NextResponse } from "next/server";

import type { RenderSubtitleMode, SubtitleWord } from "@/app/spaces/video-editor/subtitles-types";
import {
  composeSegmentsFromWords,
  createSubtitleDocumentFromSegments,
  createSubtitleDocumentFromText,
  exportSubtitleDocumentToAss,
  exportSubtitleDocumentToSrt,
  exportSubtitleDocumentToVtt,
} from "@/app/spaces/video-editor/subtitle-utils";
import { resolveUsageUserEmailFromRequest, recordApiUsage } from "@/lib/api-usage";
import {
  ApiServiceDisabledError,
  assertApiServiceEnabled,
} from "@/lib/api-usage-controls";
import { tryExtractKnowledgeFilesKeyFromUrl } from "@/lib/s3-media-hydrate";
import { getFromS3, uploadBufferToS3Key } from "@/lib/s3-utils";
import {
  buildUserAssetObjectKey,
  canUserAccessKnowledgeFileKey,
  requireSpacesAuthUser,
} from "@/lib/spaces-access-control";
import { estimateOpenAITranscriptionUsd } from "@/lib/pricing-config";
import {
  reserveApiWalletCharge,
  reserveUsdToMicros,
  releaseApiWalletChargeOnError,
  walletGateErrorResponse,
  type ApiWalletCharge,
} from "@/lib/wallet-api-gate";

export const runtime = "nodejs";
export const maxDuration = 300;

type TranscribeRequestBody = {
  sourceAssetId?: string;
  sourceUrl?: string;
  s3Key?: string;
  language?: string;
  mode?: RenderSubtitleMode;
  timelineId?: string;
  durationSeconds?: number;
};

type OpenAIWord = {
  word?: string;
  text?: string;
  start?: number;
  end?: number;
  confidence?: number;
};

type OpenAISegment = {
  text?: string;
  start?: number;
  end?: number;
};

type OpenAITranscriptionResponse = {
  text?: string;
  words?: OpenAIWord[];
  segments?: OpenAISegment[];
  duration?: number;
  language?: string;
};

function transcriptionUsdPerMinute(): number | undefined {
  const raw = process.env.FOLDDER_OPENAI_TRANSCRIPTION_USD_PER_MINUTE?.trim();
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function estimateTranscriptionDurationSeconds(body: TranscribeRequestBody, sourceBytes: number): number {
  const explicit = Number(body.durationSeconds);
  const declaredSeconds = Number.isFinite(explicit) && explicit > 0 ? explicit : 0;
  const conservativeBytesFloorSeconds = Math.max(0, sourceBytes) / 1_000;
  return Math.min(
    4 * 60 * 60,
    Math.max(30, Math.ceil(declaredSeconds), Math.ceil(conservativeBytesFloorSeconds)),
  );
}

function estimateTranscriptionCostUsd(durationSeconds: number): number {
  return estimateOpenAITranscriptionUsd(durationSeconds, {
    usdPerMinute: transcriptionUsdPerMinute(),
  });
}

function mimeFromSource(source: string | undefined): string {
  const lower = (source || "").split("?")[0]!.toLowerCase();
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".mov")) return "video/quicktime";
  if (lower.endsWith(".m4a")) return "audio/mp4";
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".webm")) return "audio/webm";
  return "audio/mpeg";
}

function filenameFromSource(source: string | undefined): string {
  const clean = (source || "foldder-audio.mp4").split("?")[0] || "foldder-audio.mp4";
  const name = clean.split("/").filter(Boolean).pop() || "foldder-audio.mp4";
  return name.includes(".") ? name : `${name}.mp4`;
}

async function resolveSource(
  body: TranscribeRequestBody,
  userEmail: string,
): Promise<{ buffer: Buffer; mimeType: string; filename: string; sourceId: string }> {
  const source = body.s3Key || body.sourceAssetId || body.sourceUrl || "";
  const directS3Key = body.s3Key?.startsWith("knowledge-files/") ? body.s3Key : null;
  const s3Key = directS3Key
    || (body.sourceAssetId?.startsWith("knowledge-files/") ? body.sourceAssetId : null)
    || (body.sourceUrl ? tryExtractKnowledgeFilesKeyFromUrl(body.sourceUrl) : null)
    || (body.sourceAssetId ? tryExtractKnowledgeFilesKeyFromUrl(body.sourceAssetId) : null);
  if (s3Key) {
    const allowed = await canUserAccessKnowledgeFileKey(userEmail, s3Key);
    if (!allowed) throw new Error("source_forbidden");
    return {
      buffer: await getFromS3(s3Key),
      mimeType: mimeFromSource(s3Key),
      filename: filenameFromSource(s3Key),
      sourceId: s3Key,
    };
  }
  const direct = body.sourceUrl || body.sourceAssetId;
  if (!direct) throw new Error("missing_source_asset");
  if (direct.startsWith("data:")) {
    const header = direct.slice(0, direct.indexOf(","));
    const mime = /data:([^;]+)/.exec(header)?.[1] || mimeFromSource(source);
    const payload = direct.slice(direct.indexOf(",") + 1);
    return {
      buffer: Buffer.from(payload, "base64"),
      mimeType: mime,
      filename: filenameFromSource(source),
      sourceId: "data-url",
    };
  }
  if (!direct.startsWith("http")) throw new Error("source_asset_not_resolvable");
  const response = await fetch(direct);
  if (!response.ok) throw new Error(`source_fetch_failed:${response.status}`);
  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    mimeType: response.headers.get("content-type") || mimeFromSource(direct),
    filename: filenameFromSource(direct),
    sourceId: direct,
  };
}

function documentFromOpenAI(args: {
  response: OpenAITranscriptionResponse;
  sourceAssetId: string;
  timelineId?: string;
  mode: RenderSubtitleMode;
  language?: string;
  durationSeconds?: number;
}) {
  const words: SubtitleWord[] = (args.response.words || [])
    .map((word, index) => ({
      id: `word_${index + 1}`,
      text: String(word.word || word.text || "").trim(),
      start: Number(word.start) || 0,
      end: Math.max(Number(word.end) || 0, (Number(word.start) || 0) + 0.05),
      confidence: word.confidence,
      emphasis: "none" as const,
    }))
    .filter((word) => word.text);
  if (words.length) {
    const segments = composeSegmentsFromWords(words, {
      targetFormat: "16:9",
      maxCharsPerLine: args.mode === "word-by-word" || args.mode === "karaoke" ? 28 : 38,
      maxLines: 2,
    });
    return createSubtitleDocumentFromSegments({
      segments,
      durationSeconds: args.response.duration ?? args.durationSeconds,
      sourceAssetId: args.sourceAssetId,
      timelineId: args.timelineId,
      mode: args.mode,
      language: args.language || args.response.language || "es",
      status: "synced",
    });
  }
  const segments = (args.response.segments || [])
    .map((segment, index) => ({
      id: `sub_${index + 1}`,
      start: Math.max(0, Number(segment.start) || 0),
      end: Math.max(Number(segment.end) || 0, (Number(segment.start) || 0) + 1),
      text: String(segment.text || "").replace(/\s+/g, " ").trim(),
      words: [],
    }))
    .filter((segment) => segment.text);
  if (segments.length) {
    return createSubtitleDocumentFromSegments({
      segments,
      durationSeconds: args.response.duration ?? args.durationSeconds,
      sourceAssetId: args.sourceAssetId,
      timelineId: args.timelineId,
      mode: args.mode,
      language: args.language || args.response.language || "es",
      status: "synced",
    });
  }
  return createSubtitleDocumentFromText({
    text: args.response.text || "",
    durationSeconds: args.response.duration ?? args.durationSeconds ?? 8,
    sourceAssetId: args.sourceAssetId,
    timelineId: args.timelineId,
    mode: args.mode,
    language: args.language || args.response.language || "es",
  });
}

async function transcribeWithOpenAI(body: TranscribeRequestBody, req: Request, userEmail: string) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("provider_not_configured:OPENAI_API_KEY");
  const source = await resolveSource(body, userEmail);
  const model = process.env.OPENAI_TRANSCRIPTION_MODEL?.trim() || "whisper-1";
  let walletCharge: ApiWalletCharge | null = null;
  let releaseWalletOnError = true;
  const reserveDurationSeconds = estimateTranscriptionDurationSeconds(body, source.buffer.length);
  const estimatedCostUsd = estimateTranscriptionCostUsd(reserveDurationSeconds);

  try {
    walletCharge = await reserveApiWalletCharge({
      req,
      userEmail,
      serviceId: "openai-subtitles",
      provider: "openai",
      route: "/api/video-editor/subtitles/transcribe",
      maxCostMicros: reserveUsdToMicros(estimatedCostUsd, { multiplier: 1.5 }),
      metadata: {
        model,
        reserveDurationSeconds,
        sourceBytes: source.buffer.length,
        sourceId: source.sourceId,
      },
    });
  } catch (error) {
    throw error;
  }

  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(source.buffer)], { type: source.mimeType }), source.filename);
  form.append("model", model);
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "word");
  form.append("timestamp_granularities[]", "segment");
  if (body.language?.trim()) form.append("language", body.language.trim());

  const started = Date.now();
  try {
    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    const json = (await response.json().catch(() => ({}))) as OpenAITranscriptionResponse & { error?: { message?: string } };
    if (!response.ok) {
      await walletCharge?.release({
        reason: "provider_transcription_error",
        metadata: { status: response.status },
      });
      releaseWalletOnError = false;
      throw new Error(json.error?.message || `openai_transcription_failed:${response.status}`);
    }
    const document = documentFromOpenAI({
      response: json,
      sourceAssetId: source.sourceId,
      timelineId: body.timelineId,
      mode: body.mode || "lines",
      language: body.language,
      durationSeconds: body.durationSeconds,
    });
    const actualDurationSeconds = Math.max(
      1,
      Math.ceil(Number(json.duration) || Number(document.durationSeconds) || reserveDurationSeconds),
    );
    const actualCostUsd = estimateTranscriptionCostUsd(actualDurationSeconds);
    releaseWalletOnError = false;
    await walletCharge?.capture({
      actualCostUsd,
      metadata: {
        model,
        actualDurationSeconds,
        reserveDurationSeconds,
        sourceBytes: source.buffer.length,
      },
    });
    await recordApiUsage({
      provider: "openai",
      serviceId: "openai-subtitles",
      route: "/api/video-editor/subtitles/transcribe",
      model,
      operation: "audio_transcription",
      userEmail: await resolveUsageUserEmailFromRequest(req),
      costUsd: actualCostUsd,
      bytes: source.buffer.length,
      metadata: {
        durationSeconds: actualDurationSeconds,
        segments: document.segments.length,
        runtimeMs: Date.now() - started,
        sourceAssetId: source.sourceId,
      },
      note: "OpenAI transcription priced from returned duration and configured per-minute rate.",
    });
    return document;
  } catch (error) {
    if (releaseWalletOnError) await releaseApiWalletChargeOnError(walletCharge, error);
    throw error;
  }
}

async function persistSubtitleDocument(
  document: ReturnType<typeof documentFromOpenAI>,
  userEmail: string,
): Promise<{ documentKey?: string; srtKey?: string; vttKey?: string; assKey?: string }> {
  const folder = `video-editor/subtitles/${document.id.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
  const documentKey = buildUserAssetObjectKey({ userEmail, folder, filename: "subtitle.json", unique: false });
  const srtKey = buildUserAssetObjectKey({ userEmail, folder, filename: "subtitle.srt", unique: false });
  const vttKey = buildUserAssetObjectKey({ userEmail, folder, filename: "subtitle.vtt", unique: false });
  const assKey = buildUserAssetObjectKey({ userEmail, folder, filename: "subtitle.ass", unique: false });
  await uploadBufferToS3Key(documentKey, Buffer.from(JSON.stringify(document, null, 2), "utf8"), "application/json");
  await uploadBufferToS3Key(srtKey, Buffer.from(exportSubtitleDocumentToSrt(document), "utf8"), "text/plain; charset=utf-8");
  await uploadBufferToS3Key(vttKey, Buffer.from(exportSubtitleDocumentToVtt(document), "utf8"), "text/vtt; charset=utf-8");
  await uploadBufferToS3Key(assKey, Buffer.from(exportSubtitleDocumentToAss(document), "utf8"), "text/plain; charset=utf-8");
  return { documentKey, srtKey, vttKey, assKey };
}

export async function POST(req: Request) {
  try {
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;
    await assertApiServiceEnabled("openai-subtitles");
    const body = (await req.json()) as TranscribeRequestBody;
    const provider = (process.env.SUBTITLE_TRANSCRIPTION_PROVIDER?.trim() || "openai").toLowerCase();
    if (provider !== "openai") {
      return NextResponse.json({ ok: false, error: `provider_not_implemented:${provider}` }, { status: 501 });
    }
    const document = await transcribeWithOpenAI(body, req, authState.user.email);
    let documentKey: string | undefined;
    try {
      const persisted = await persistSubtitleDocument(document, authState.user.email);
      documentKey = persisted.documentKey;
      document.exports = {
        srtKey: persisted.srtKey,
        vttKey: persisted.vttKey,
        assKey: persisted.assKey,
      };
    } catch (persistError) {
      console.warn("[video-editor-subtitles-transcribe] subtitle persistence skipped", persistError);
    }
    return NextResponse.json({ ok: true, document, documentKey });
  } catch (error) {
    if (error instanceof ApiServiceDisabledError) {
      return NextResponse.json(
        { ok: false, error: `API bloqueada en admin: ${error.label}` },
        { status: 423 },
      );
    }
    const walletResponse = walletGateErrorResponse(error);
    if (walletResponse) return walletResponse;
    const message = error instanceof Error ? error.message : "subtitle_transcription_failed";
    const status = message.startsWith("provider_not_configured") ? 501 : 500;
    if (!message.startsWith("provider_not_")) {
      console.error("[video-editor-subtitles-transcribe]", error);
    }
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
