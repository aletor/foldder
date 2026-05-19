import {
  assignAdvancedImageAppliedBatchNumber,
  isAdvancedImageGlobalAdjustmentPending,
  markAdvancedImageCorrectionRuntime,
  markAdvancedImageGlobalAdjustmentApplied,
  setAdvancedImageWorkingImage,
  stableHash,
  type AdvancedImageSession,
  type AdvancedImageWorkingImage,
} from "./domain";
import {
  readAdvancedImageFinalCache,
  readAdvancedImageGeminiRawCache,
  writeAdvancedImageFinalCache,
  writeAdvancedImageGeminiRawCache,
  type AdvancedImageCacheStore,
  type AdvancedImageCachedGeneratedImage,
} from "./cache";
import {
  AdvancedImageGeminiAdapterError,
  executeAdvancedImageGeminiGeneration,
  type AdvancedImageGeminiTransport,
} from "./gemini-adapter";
import { buildAdvancedImageGenerationPlan, type AdvancedImageGenerationPlan } from "./pipeline";

export type AdvancedImageGenerationLogger = (event: {
  cacheKey: string;
  hit: boolean;
  stateHash: string;
  type: "final-image" | "gemini-raw";
}) => void;

export type AdvancedImageFinalImageProcessor = (args: {
  generated: AdvancedImageCachedGeneratedImage;
  now: string;
  plan: AdvancedImageGenerationPlan;
  requestId: string;
  session: AdvancedImageSession;
  userEmail: string;
}) => Promise<AdvancedImageCachedGeneratedImage>;

export type AdvancedImageClientGenerationOptions = {
  batchPendingIds?: string[];
  cacheStore: AdvancedImageCacheStore;
  costApproval: {
    approved: boolean;
    reason: "cached_replay" | "explicit_user_action" | "manual_retry";
  };
  logger?: AdvancedImageGenerationLogger;
  now: string;
  finalImageProcessor?: AdvancedImageFinalImageProcessor;
  requestId: string;
  transport: AdvancedImageGeminiTransport;
  userEmail: string;
};

export type AdvancedImageClientGenerationResult = {
  cacheHit: boolean;
  plan: AdvancedImageGenerationPlan;
  requestId: string;
  resolutionWarning?: string;
  session: AdvancedImageSession;
  workingImage: AdvancedImageWorkingImage;
};

export async function runAdvancedImageClientGeneration(
  session: AdvancedImageSession,
  options: AdvancedImageClientGenerationOptions,
): Promise<AdvancedImageClientGenerationResult> {
  const planResult = buildAdvancedImageGenerationPlan(session, {
    batchPendingIds: options.batchPendingIds,
  });
  if (!planResult.ok) {
    throw new AdvancedImageGeminiAdapterError("Advanced image generation plan failed.", [
      {
        code: "PROMPT_MISSING",
        detail: planResult.issues.map((issue) => `${issue.code}: ${issue.detail}`).join("\n"),
      },
    ]);
  }
  const plan = planResult.plan;

  if (plan.activeCorrectionIds.length === 0 && !plan.globalAdjustmentActive && !plan.globalAdjustmentPending) {
    const masterWorking = workingImageFromMaster(session, plan, options.now);
    return {
      cacheHit: true,
      plan,
      requestId: options.requestId,
      resolutionWarning: undefined,
      session: setAdvancedImageWorkingImage(session, masterWorking, { timestamp: options.now }),
      workingImage: masterWorking,
    };
  }

  if (plan.activeCorrectionIds.length === 0 && !plan.globalAdjustmentActive && plan.globalAdjustmentPending) {
    const masterWorking = workingImageFromMaster(session, plan, options.now);
    const nextSession = assignBatchNumberToGeneratedCorrections(
      setAdvancedImageWorkingImage(session, masterWorking, { timestamp: options.now }),
      plan.batchPendingIds,
      options.now,
      true,
    );
    return {
      cacheHit: true,
      plan,
      requestId: options.requestId,
      resolutionWarning: undefined,
      session: nextSession,
      workingImage: masterWorking,
    };
  }

  const cached = await readAdvancedImageGeminiRawCache(
    options.cacheStore,
    plan,
    options.now,
    { requestId: options.requestId, userEmail: options.userEmail },
  );
  options.logger?.({
    cacheKey: plan.cacheKeys.geminiRaw,
    hit: cached.hit,
    stateHash: plan.geminiStateHash,
    type: "gemini-raw",
  });

  if (cached.hit) {
    const finalValue = await resolveFinalGeneratedImage(session, plan, cached.value, options);
    const workingImage = workingImageFromCached(plan, finalValue, options.now, session);
    const nextSession = assignBatchNumberToGeneratedCorrections(
      setAdvancedImageWorkingImage(session, workingImage, { timestamp: options.now }),
      plan.batchPendingIds,
      options.now,
      plan.globalAdjustmentPending,
    );
    return {
      cacheHit: true,
      plan,
      requestId: options.requestId,
      resolutionWarning: undefined,
      session: markGenerationSuccess(
        nextSession,
        plan.activeCorrectionIds,
        options.now,
      ),
      workingImage,
    };
  }

  try {
    const generated = await executeAdvancedImageGeminiGeneration(plan, {
      costApproval: options.costApproval,
      maxImageInputs: plan.referenceLimit + 1,
      requestId: options.requestId,
      transport: options.transport,
      userEmail: options.userEmail,
    });
    const generatedDimensions = await probeGeneratedImageDimensions(generated.outputUrl);
    const resolutionWarning = evaluateGeneratedResolution({
      generated: generatedDimensions,
      master: { height: session.master.height, width: session.master.width },
    });
    if (resolutionWarning?.severity === "error") {
      throw new Error(resolutionWarning.message);
    }
    const cacheValue: AdvancedImageCachedGeneratedImage = {
      durationMs: generated.durationMs,
      height: generatedDimensions?.height ?? session.master.height,
      imageUrl: generated.outputUrl,
      model: generated.model,
      raw: generated.raw,
      resolution: plan.resolution,
      s3Key: generated.key,
      sourceHash: plan.finalImageStateHash,
      width: generatedDimensions?.width ?? session.master.width,
    };
    await writeAdvancedImageGeminiRawCache(options.cacheStore, plan, cacheValue, { createdAt: options.now }, {
      requestId: options.requestId,
      userEmail: options.userEmail,
    });
    const finalValue = await resolveFinalGeneratedImage(session, plan, cacheValue, options);
    await writeAdvancedImageFinalCache(options.cacheStore, plan, finalValue, { createdAt: options.now }, {
      requestId: options.requestId,
      userEmail: options.userEmail,
    });

    const workingImage = workingImageFromCached(plan, finalValue, options.now, session);
    const nextSession = assignBatchNumberToGeneratedCorrections(
      setAdvancedImageWorkingImage(session, workingImage, { timestamp: options.now }),
      plan.batchPendingIds,
      options.now,
      plan.globalAdjustmentPending,
    );
    return {
      cacheHit: false,
      plan,
      requestId: options.requestId,
      resolutionWarning: resolutionWarning?.severity === "warning" ? resolutionWarning.message : undefined,
      session: markGenerationSuccess(
        nextSession,
        plan.activeCorrectionIds,
        options.now,
      ),
      workingImage,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Advanced image generation failed.";
    const next = markGenerationFailure(session, options.batchPendingIds ?? plan.batchPendingIds, message, options.now);
    throw new AdvancedImageClientGenerationError(message, next, error);
  }
}

async function resolveFinalGeneratedImage(
  session: AdvancedImageSession,
  plan: AdvancedImageGenerationPlan,
  generated: AdvancedImageCachedGeneratedImage,
  options: AdvancedImageClientGenerationOptions,
): Promise<AdvancedImageCachedGeneratedImage> {
  if (plan.strictCompositeSteps.length === 0 || !options.finalImageProcessor) {
    return generated;
  }

  const cachedFinal = await readAdvancedImageFinalCache(
    options.cacheStore,
    plan,
    options.now,
    { requestId: options.requestId, userEmail: options.userEmail },
  );
  options.logger?.({
    cacheKey: plan.cacheKeys.finalImage,
    hit: cachedFinal.hit,
    stateHash: plan.finalImageStateHash,
    type: "final-image",
  });
  if (cachedFinal.hit) return cachedFinal.value;

  const processed = await options.finalImageProcessor({
    generated,
    now: options.now,
    plan,
    requestId: options.requestId,
    session,
    userEmail: options.userEmail,
  });
  return {
    ...processed,
    sourceHash: plan.finalImageStateHash,
  };
}

function assignBatchNumberToGeneratedCorrections(
  session: AdvancedImageSession,
  batchPendingIds: string[],
  timestamp: string,
  applyGlobalAdjustment = false,
): AdvancedImageSession {
  if (batchPendingIds.length === 0 && !applyGlobalAdjustment) return session;
  const currentMax = session.corrections.reduce(
    (max, correction) => Math.max(max, correction.appliedBatchNumber ?? 0),
    0,
  );
  const nextBatchNumber = currentMax + 1;
  const withCorrections = batchPendingIds.length > 0
    ? assignAdvancedImageAppliedBatchNumber(session, batchPendingIds, nextBatchNumber, { timestamp })
    : session;
  return applyGlobalAdjustment || isAdvancedImageGlobalAdjustmentPending(withCorrections)
    ? markAdvancedImageGlobalAdjustmentApplied(withCorrections, { batchNumber: nextBatchNumber, timestamp })
    : withCorrections;
}

export class AdvancedImageClientGenerationError extends Error {
  constructor(
    message: string,
    public session: AdvancedImageSession,
    public cause?: unknown,
  ) {
    super(message);
    this.name = "AdvancedImageClientGenerationError";
  }
}

function markGenerationSuccess(
  session: AdvancedImageSession,
  activeCorrectionIds: string[],
  timestamp: string,
): AdvancedImageSession {
  let next = session;
  for (const correctionId of activeCorrectionIds) {
    next = markAdvancedImageCorrectionRuntime(
      next,
      correctionId,
      {
        lastGenerationError: null,
        lastGenerationStatus: "idle",
      },
      { timestamp },
    );
  }
  return next;
}

function markGenerationFailure(
  session: AdvancedImageSession,
  correctionIds: string[],
  message: string,
  timestamp: string,
): AdvancedImageSession {
  let next = session;
  for (const correctionId of correctionIds) {
    next = markAdvancedImageCorrectionRuntime(
      next,
      correctionId,
      {
        lastGenerationError: message,
        lastGenerationStatus: "failed",
      },
      { timestamp },
    );
  }
  return next;
}

function workingImageFromCached(
  plan: AdvancedImageGenerationPlan,
  value: AdvancedImageCachedGeneratedImage,
  generatedAt: string,
  session?: AdvancedImageSession,
): AdvancedImageWorkingImage {
  return {
    activeCorrectionIds: plan.activeCorrectionIds,
    correctionSnapshots: session ? buildCorrectionSnapshots(session, plan.activeCorrectionIds) : undefined,
    generatedAt,
    height: value.height,
    imageUrl: value.imageUrl,
    model: value.model,
    resolution: value.resolution,
    s3Key: value.s3Key,
    sourceHash: plan.finalImageStateHash,
    width: value.width,
  };
}

function workingImageFromMaster(
  session: AdvancedImageSession,
  plan: AdvancedImageGenerationPlan,
  generatedAt: string,
): AdvancedImageWorkingImage {
  return {
    activeCorrectionIds: [],
    correctionSnapshots: {},
    generatedAt,
    height: session.master.height,
    imageUrl: session.master.imageUrl,
    model: session.master.sourceModel ?? "master",
    resolution: session.master.sourceResolution ?? `${session.master.width}x${session.master.height}`,
    s3Key: session.master.s3Key,
    sourceHash: plan.finalImageStateHash || stableHash({ master: session.master.contentHash }),
    width: session.master.width,
  };
}

function buildCorrectionSnapshots(
  session: AdvancedImageSession,
  correctionIds: string[],
): NonNullable<AdvancedImageWorkingImage["correctionSnapshots"]> {
  const wanted = new Set(correctionIds);
  return Object.fromEntries(
    session.corrections
      .filter((correction) => wanted.has(correction.id))
      .map((correction) => [
        correction.id,
        {
          geometryHash: correction.geometryHash,
          instructionHash: correction.instructionHash,
          referenceHash: correction.referenceHash,
          strictZoneBoundary: correction.strictZoneBoundary === true,
        },
      ]),
  );
}

async function probeGeneratedImageDimensions(
  imageUrl: string,
): Promise<{ height: number; width: number } | undefined> {
  if (typeof Image === "undefined" || !imageUrl) return undefined;
  return new Promise((resolve) => {
    let done = false;
    const finish = (value: { height: number; width: number } | undefined) => {
      if (done) return;
      done = true;
      window.clearTimeout(timeout);
      resolve(value);
    };
    const timeout = window.setTimeout(() => finish(undefined), 1500);
    const image = new Image();
    image.onload = () => {
      finish(
        image.naturalWidth > 0 && image.naturalHeight > 0
          ? { height: image.naturalHeight, width: image.naturalWidth }
          : undefined,
      );
    };
    image.onerror = () => finish(undefined);
    image.src = imageUrl;
  });
}

function evaluateGeneratedResolution(args: {
  generated: { height: number; width: number } | undefined;
  master: { height: number; width: number };
}): { message: string; severity: "error" | "warning" } | undefined {
  if (!args.generated) return undefined;
  const widthRatio = args.generated.width / Math.max(1, args.master.width);
  const heightRatio = args.generated.height / Math.max(1, args.master.height);
  if (widthRatio < 0.6 || heightRatio < 0.6) {
    return {
      message: "Generated image is too small compared with the master. Retry generation.",
      severity: "error",
    };
  }
  if (widthRatio < 0.95 || heightRatio < 0.95) {
    return {
      message: "Generated image resolution differs from master.",
      severity: "warning",
    };
  }
  return undefined;
}
