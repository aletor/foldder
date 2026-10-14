import { NextRequest, NextResponse } from "next/server";
import {
  recordApiUsage,
  resolveUsageUserEmailFromRequest,
} from "@/lib/api-usage";
import { estimateSeedanceVideoUsd } from "@/lib/pricing-config";
import { getPresignedUrl, uploadBufferToS3Key } from "@/lib/s3-utils";
import {
  ApiServiceDisabledError,
  assertApiServiceEnabled,
} from "@/lib/api-usage-controls";
import { tryExtractKnowledgeFilesKeyFromUrl } from "@/lib/s3-media-hydrate";
import {
  buildUserAssetObjectKey,
  canUserAccessKnowledgeFileKey,
  requireSpacesAuthUser,
  stableKnowledgeFileUrlFromKey,
} from "@/lib/spaces-access-control";
import {
  appendVideoPromptTail,
  collectAllReferenceImageUrlsOrdered,
  parseVideoRefSlots,
} from "@/lib/video-generator-studio";
import {
  linkApiWalletChargeToProviderJob,
  reserveApiWalletCharge,
  reserveUsdToMicros,
  releaseApiWalletChargeOnError,
  settleProviderJobWalletCharge,
  walletGateErrorResponse,
  type ApiWalletCharge,
} from "@/lib/wallet-api-gate";
import { readVideoProviderJob, saveVideoProviderJob } from "@/lib/video-provider-job";
import crypto from "crypto";

/** El arranque y la descarga final caben en un request corto. El render lo pregunta el cliente. */
export const maxDuration = 120;

const DEFAULT_ARK_BASE = "https://ark.cn-beijing.volces.com/api/v3";
/** ID del modelo en consola 方舟 (Seedance 2.x); configurable por entorno. */
const DEFAULT_SEEDANCE_MODEL = "doubao-seedance-1-5-pro-251215";

function collectHttpsUrls(obj: unknown, out: string[], depth = 0): void {
  if (depth > 12) return;
  if (typeof obj === "string") {
    if (/^https?:\/\//i.test(obj) && /\.(mp4|webm|mov)(\?|$)/i.test(obj)) out.push(obj);
    return;
  }
  if (!obj || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    for (const x of obj) collectHttpsUrls(x, out, depth + 1);
    return;
  }
  for (const k of Object.keys(obj as Record<string, unknown>)) {
    const v = (obj as Record<string, unknown>)[k];
    if (k === "video_url" || k === "url" || k === "uri") {
      if (typeof v === "string" && /^https?:\/\//i.test(v)) out.push(v);
    }
    collectHttpsUrls(v, out, depth + 1);
  }
}

function extractVideoUrlFromTask(data: Record<string, unknown>): string {
  const candidates: string[] = [];
  collectHttpsUrls(data, candidates);
  return candidates[0] || "";
}

function mapResolutionToRatio(resolution: string | undefined): string {
  const r = (resolution || "1080p").toLowerCase();
  if (r.includes("9:16") || r === "portrait") return "9:16";
  if (r.includes("1:1") || r === "square") return "1:1";
  return "16:9";
}

function clampDuration(sec: number): number {
  if (!Number.isFinite(sec) || sec <= 0) return 5;
  return Math.min(12, Math.max(2, Math.round(sec)));
}

/**
 * Construye `content` para la API de generación de vídeo Ark (texto + imágenes opcionales).
 * @see https://www.volcengine.com/docs/82379/1520757
 */
function buildArkContent(payload: {
  prompt: string;
  imageUrls: string[];
}): Array<Record<string, unknown>> {
  const parts: Array<Record<string, unknown>> = [{ type: "text", text: payload.prompt }];
  for (const url of payload.imageUrls) {
    if (!url || typeof url !== "string" || !url.trim()) continue;
    parts.push({
      type: "image_url",
      image_url: { url },
    });
  }
  return parts;
}

export async function POST(req: NextRequest) {
  let walletCharge: ApiWalletCharge | null = null;
  let releaseWalletOnError = true;
  try {
    await assertApiServiceEnabled("seedance-video");
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;
    const usageUserEmail = await resolveUsageUserEmailFromRequest(req);
    const body = await req.json();
    const {
      prompt,
      firstFrame,
      lastFrame,
      resolution,
      aspectRatio,
      durationSeconds,
      audio,
      negativePrompt,
      animationPrompt,
      cameraPreset,
      videoRefSlots,
    } = body as Record<string, unknown>;

    const apiKey =
      process.env.VOLCENGINE_ARK_API_KEY ||
      process.env.SEEDANCE_API_KEY ||
      process.env.ARK_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "Falta VOLCENGINE_ARK_API_KEY (o SEEDANCE_API_KEY) en el servidor. Consola 火山方舟 → API Key.",
        },
        { status: 500 },
      );
    }

    const base = (process.env.VOLCENGINE_ARK_BASE || DEFAULT_ARK_BASE).replace(/\/$/, "");
    const model =
      process.env.SEEDANCE_MODEL_ID ||
      process.env.SEEDANCE_2_MODEL_ID ||
      DEFAULT_SEEDANCE_MODEL;

    const promptStr = typeof prompt === "string" ? prompt : "";
    if (!promptStr.trim()) {
      return NextResponse.json({ error: "Se requiere prompt" }, { status: 400 });
    }

    const finalPrompt = appendVideoPromptTail(promptStr, {
      animationPrompt,
      cameraPreset,
      negativePrompt,
      includeNegative: true,
    });

    const dur = clampDuration(Number(durationSeconds));

    const ratioFromAspect =
      typeof aspectRatio === "string" &&
      ["16:9", "9:16", "1:1"].includes(aspectRatio.trim())
        ? aspectRatio.trim()
        : null;

    const rawImageUrls = collectAllReferenceImageUrlsOrdered({
      firstFrame: typeof firstFrame === "string" ? firstFrame : null,
      lastFrame: typeof lastFrame === "string" ? lastFrame : null,
      extraSlots: parseVideoRefSlots(videoRefSlots),
    });
    const imageUrls: string[] = [];
    for (const rawUrl of rawImageUrls) {
      const s3Key = tryExtractKnowledgeFilesKeyFromUrl(rawUrl);
      if (s3Key) {
        const allowed = await canUserAccessKnowledgeFileKey(authState.user.email, s3Key);
        if (!allowed) throw new Error("Forbidden reference image");
        imageUrls.push(await getPresignedUrl(s3Key));
      } else {
        imageUrls.push(rawUrl);
      }
    }

    const createBody: Record<string, unknown> = {
      model,
      content: buildArkContent({
        prompt: finalPrompt,
        imageUrls,
      }),
      ratio:
        ratioFromAspect ||
        mapResolutionToRatio(typeof resolution === "string" ? resolution : undefined),
      duration: dur,
      ...(audio === true ? { generate_audio: true } : {}),
    };

    const estimatedCostUsd = estimateSeedanceVideoUsd(dur);
    walletCharge = await reserveApiWalletCharge({
      req,
      userEmail: authState.user.email,
      serviceId: "seedance-video",
      provider: "volcengine",
      route: "/api/seedance/video",
      maxCostMicros: reserveUsdToMicros(estimatedCostUsd, { multiplier: 1.2 }),
      metadata: {
        model,
        durationSeconds: dur,
        ratio: createBody.ratio,
        imageCount: imageUrls.length,
      },
    });

    const createUrl = `${base}/contents/generations/tasks`;
    console.log("[Seedance] POST", createUrl, "model=", model);

    const createRes = await fetch(createUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(createBody),
    });

    const createData = (await createRes.json().catch(() => ({}))) as Record<string, unknown>;
    if (!createRes.ok) {
      console.error("[Seedance] create error:", createRes.status, createData);
      await walletCharge?.release({ reason: "provider_create_error", metadata: { status: createRes.status } });
      releaseWalletOnError = false;
      const msg =
        (createData.error as { message?: string } | undefined)?.message ||
        (typeof createData.message === "string" ? createData.message : null) ||
        JSON.stringify(createData).slice(0, 400);
      return NextResponse.json(
        { error: `Seedance (Ark): ${msg}` },
        { status: createRes.status >= 400 ? createRes.status : 502 },
      );
    }

    const nested = createData.data as Record<string, unknown> | undefined;
    const taskId =
      (typeof createData.id === "string" && createData.id) ||
      (typeof createData.task_id === "string" && createData.task_id) ||
      (nested && typeof nested.id === "string" && nested.id) ||
      "";
    if (!taskId) {
      console.error("[Seedance] sin task id:", createData);
      await walletCharge?.release({ reason: "provider_missing_task_id" });
      releaseWalletOnError = false;
      return NextResponse.json({ error: "Ark no devolvió id de tarea" }, { status: 502 });
    }
    releaseWalletOnError = false;

    const actualCostUsd = estimateSeedanceVideoUsd(dur);
    const jobId = crypto.randomUUID();
    try {
      await saveVideoProviderJob({
        id: jobId,
        provider: "seedance",
        userEmail: authState.user.email,
        status: "pending",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        seedance: {
          taskId,
          base,
          model,
          durationSeconds: dur,
          costUsd: actualCostUsd,
          usageUserEmail,
          providerJobId: taskId,
        },
      });
      await linkApiWalletChargeToProviderJob(walletCharge, {
        userEmail: authState.user.email,
        provider: "volcengine",
        providerJobId: taskId,
        serviceId: "seedance-video",
        route: "/api/seedance/video",
        metadata: { jobId, estimatedCostMicros: Math.round(actualCostUsd * 1_000_000) },
      });
    } catch (error) {
      await walletCharge?.release({ reason: "video_job_persist_failed" });
      throw error;
    }

    return NextResponse.json({ status: "pending", jobId });
  } catch (error: unknown) {
    if (error instanceof ApiServiceDisabledError) {
      return NextResponse.json(
        { error: `API bloqueada en admin: ${error.label}` },
        { status: 423 },
      );
    }
    if (releaseWalletOnError) await releaseApiWalletChargeOnError(walletCharge, error);
    const walletResponse = walletGateErrorResponse(error);
    if (walletResponse) return walletResponse;
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Seedance] Exception:", message);
    return NextResponse.json({ error: `Server Exception: ${message}` }, { status: 500 });
  }
}

const SEEDANCE_SUCCESS = new Set(["succeeded", "success", "completed", "done"]);
const SEEDANCE_FAILURE = new Set(["failed", "error", "cancelled"]);

export async function GET(req: NextRequest) {
  try {
    await assertApiServiceEnabled("seedance-video");
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;
    const jobId = new URL(req.url).searchParams.get("jobId")?.trim() ?? "";
    const job = await readVideoProviderJob(authState.user.email, jobId);
    if (!job?.seedance) {
      return NextResponse.json({ error: "Trabajo de vídeo no encontrado." }, { status: 404 });
    }
    if (job.status === "success" && job.outputUrl) {
      return NextResponse.json({ status: "success", output: job.outputUrl, key: job.outputKey });
    }
    if (job.status === "failed") {
      return NextResponse.json({ error: job.error || "La generación de vídeo falló." }, { status: 500 });
    }
    if (job.status === "finalizing" && Date.now() - Date.parse(job.updatedAt) < 90_000) {
      return NextResponse.json({ status: "pending", jobId });
    }

    const apiKey =
      process.env.VOLCENGINE_ARK_API_KEY?.trim() ||
      process.env.SEEDANCE_API_KEY?.trim() ||
      process.env.ARK_API_KEY?.trim() ||
      "";
    const pollUrl = `${job.seedance.base}/contents/generations/tasks/${encodeURIComponent(job.seedance.taskId)}`;
    const pollRes = await fetch(pollUrl, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
    });
    const pollData = (await pollRes.json().catch(() => ({}))) as Record<string, unknown>;
    if (!pollRes.ok) {
      return NextResponse.json({ status: "pending", jobId });
    }
    const status = String(pollData.status ?? pollData.task_status ?? "").toLowerCase();
    if (SEEDANCE_FAILURE.has(status)) {
      const errMsg =
        (pollData.error as { message?: string } | undefined)?.message ||
        JSON.stringify(pollData.error || pollData).slice(0, 500);
      await settleProviderJobWalletCharge({
        provider: "volcengine",
        providerJobId: job.seedance.providerJobId,
        status: "failed",
        successStatuses: ["succeeded"],
        failureStatuses: ["failed"],
        metadata: { message: errMsg.slice(0, 240) },
      });
      await saveVideoProviderJob({ ...job, status: "failed", error: errMsg });
      return NextResponse.json({ error: `Seedance: ${errMsg}` }, { status: 500 });
    }
    if (!SEEDANCE_SUCCESS.has(status)) {
      return NextResponse.json({ status: "pending", jobId });
    }

    const videoUrl = extractVideoUrlFromTask(pollData);
    if (!videoUrl) {
      const errMsg = "La tarea terminó pero no se encontró URL de vídeo en la respuesta.";
      await settleProviderJobWalletCharge({
        provider: "volcengine",
        providerJobId: job.seedance.providerJobId,
        status: "failed",
        successStatuses: ["succeeded"],
        failureStatuses: ["failed"],
      });
      await saveVideoProviderJob({ ...job, status: "failed", error: errMsg });
      return NextResponse.json({ error: errMsg }, { status: 500 });
    }

    await saveVideoProviderJob({ ...job, status: "finalizing" });
    let videoRes = await fetch(videoUrl);
    if (!videoRes.ok && apiKey) {
      videoRes = await fetch(videoUrl, { headers: { Authorization: `Bearer ${apiKey}` } });
    }
    if (!videoRes.ok) {
      throw new Error(`Descarga del vídeo falló: HTTP ${videoRes.status}`);
    }
    const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
    const key = buildUserAssetObjectKey({
      userEmail: authState.user.email,
      folder: "generated/video/seedance",
      filename: `seedance_${crypto.randomUUID()}.mp4`,
    });
    await uploadBufferToS3Key(key, videoBuffer, "video/mp4");
    const url = stableKnowledgeFileUrlFromKey(key);
    await settleProviderJobWalletCharge({
      provider: "volcengine",
      providerJobId: job.seedance.providerJobId,
      status: "succeeded",
      successStatuses: ["succeeded"],
      failureStatuses: ["failed"],
      actualCostUsd: job.seedance.costUsd,
      metadata: { model: job.seedance.model, durationSeconds: job.seedance.durationSeconds, taskId: job.seedance.taskId },
    });
    await recordApiUsage({
      provider: "volcengine",
      userEmail: job.seedance.usageUserEmail,
      serviceId: "seedance-video",
      route: "/api/seedance/video",
      model: job.seedance.model,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      costUsd: job.seedance.costUsd,
      note: "Seedance / Ark vídeo (coste orientativo por segundo)",
    });
    await saveVideoProviderJob({ ...job, status: "success", outputUrl: url, outputKey: key });
    return NextResponse.json({ output: url, key, status: "success" });
  } catch (error: unknown) {
    if (error instanceof ApiServiceDisabledError) {
      return NextResponse.json({ error: `API bloqueada en admin: ${error.label}` }, { status: 423 });
    }
    const walletResponse = walletGateErrorResponse(error);
    if (walletResponse) return walletResponse;
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Seedance] Poll exception:", message);
    return NextResponse.json({ error: `Server Exception: ${message}` }, { status: 500 });
  }
}
