import {
  computeFinalImageStateHash,
  stableHash,
  type AdvancedImageBox,
  type AdvancedImageCorrection,
  type AdvancedImageIdentityAnchor,
  type AdvancedImageSession,
  type AdvancedImageWorkingImage,
} from "./domain";

export type AdvancedImageCropRequest = {
  bbox: AdvancedImageBox;
  correctionId: string;
  imageS3Key?: string;
  imageUrl: string;
  paddingRatio: number;
  paddedBBox: AdvancedImageBox;
  sourceWorkingHash: string;
  targetMaxSide: number;
};

export type AdvancedImageCropResult = {
  cropHash: string;
  cropS3Key?: string;
  cropUrl: string;
  height: number;
  perceptualHash: string;
  width: number;
};

export type AdvancedImageIdentityDescriptionRequest = {
  bbox: AdvancedImageBox;
  correctionId: string;
  imageS3Key?: string;
  imageUrl: string;
  maxWords: number;
  model: string;
  prompt: string;
  sourceWorkingHash: string;
};

export type AdvancedImageIdentityDescriptionResult = {
  description: string;
  durationMs?: number;
  raw?: unknown;
};

export type AdvancedImageCropExtractor = (
  request: AdvancedImageCropRequest,
  context: AdvancedImageAnalysisContext,
) => Promise<AdvancedImageCropResult>;

export type AdvancedImageIdentityDescriptionTransport = (
  request: AdvancedImageIdentityDescriptionRequest,
  context: AdvancedImageAnalysisContext,
) => Promise<AdvancedImageIdentityDescriptionResult>;

export type AdvancedImageAnalysisContext = {
  requestId: string;
  signal?: AbortSignal;
  userEmail: string;
};

export type AdvancedImageIdentityAnalysisRequest = {
  correctionId: string;
  cropRequest: AdvancedImageCropRequest;
  descriptionRequest: AdvancedImageIdentityDescriptionRequest;
  expectedWorkingHash: string;
};

export type AdvancedImageIdentityAnalysisResult = {
  correctionId: string;
  descriptionDurationMs?: number;
  identityAnchor: AdvancedImageIdentityAnchor;
  requestId: string;
};

export type AdvancedImageAnalysisApproval = {
  approved: boolean;
  reason: "manual_retry" | "post_generation_required";
};

export type AdvancedImageIdentityAnalysisOptions = {
  analysisApproval?: AdvancedImageAnalysisApproval;
  cropExtractor?: AdvancedImageCropExtractor;
  descriptionTransport?: AdvancedImageIdentityDescriptionTransport;
  now?: string;
  requestId?: string;
  signal?: AbortSignal;
  userEmail?: string;
};

export type AdvancedImageAnalysisIssue = {
  code:
    | "ANALYSIS_NOT_APPROVED"
    | "CORRECTION_NOT_FOUND"
    | "CROP_EXTRACTOR_MISSING"
    | "DESCRIPTION_TRANSPORT_MISSING"
    | "REQUEST_ID_MISSING"
    | "STALE_WORKING_IMAGE"
    | "TIMESTAMP_MISSING"
    | "USER_MISSING"
    | "WORKING_IMAGE_MISSING";
  correctionId?: string;
  detail: string;
};

export type AdvancedImageIdentityAnalysisRequestResult =
  | { ok: true; request: AdvancedImageIdentityAnalysisRequest }
  | { issues: AdvancedImageAnalysisIssue[]; ok: false };

export class AdvancedImageAnalysisError extends Error {
  constructor(
    message: string,
    public issues: AdvancedImageAnalysisIssue[],
  ) {
    super(message);
    this.name = "AdvancedImageAnalysisError";
  }
}

export type AdvancedImageIdentityDrift = {
  exceedsThreshold: boolean;
  reason: "crop_hash_changed" | "perceptual_hash_distance" | "perceptual_hash_missing";
  score: number;
  threshold: number;
};

const DEFAULT_PADDING_RATIO = 0.1;
const MAX_DESCRIPTION_WORDS = 80;

export function buildAdvancedImageIdentityAnalysisRequest(
  session: AdvancedImageSession,
  correctionId: string,
  workingImage: AdvancedImageWorkingImage | undefined = session.workingImage,
): AdvancedImageIdentityAnalysisRequestResult {
  const correction = session.corrections.find((item) => item.id === correctionId);
  if (!correction) {
    return {
      issues: [{ code: "CORRECTION_NOT_FOUND", correctionId, detail: `Correction '${correctionId}' does not exist.` }],
      ok: false,
    };
  }
  if (!workingImage) {
    return {
      issues: [{ code: "WORKING_IMAGE_MISSING", correctionId, detail: "A working image is required before identity analysis." }],
      ok: false,
    };
  }
  const expectedWorkingHash = computeFinalImageStateHash(session);
  if (workingImage.sourceHash !== expectedWorkingHash) {
    return {
      issues: [
        {
          code: "STALE_WORKING_IMAGE",
          correctionId,
          detail: "Working image sourceHash does not match the current final image state hash.",
        },
      ],
      ok: false,
    };
  }

  const paddedBBox = padBox(correction.zone.bbox, DEFAULT_PADDING_RATIO, {
    height: workingImage.height,
    width: workingImage.width,
  });
  const cropRequest: AdvancedImageCropRequest = {
    bbox: correction.zone.bbox,
    correctionId,
    imageS3Key: workingImage.s3Key,
    imageUrl: workingImage.imageUrl,
    paddingRatio: DEFAULT_PADDING_RATIO,
    paddedBBox,
    sourceWorkingHash: workingImage.sourceHash,
    targetMaxSide: session.generationSettings.cropMaxSide,
  };
  const descriptionRequest: AdvancedImageIdentityDescriptionRequest = {
    bbox: correction.zone.bbox,
    correctionId,
    imageS3Key: workingImage.s3Key,
    imageUrl: workingImage.imageUrl,
    maxWords: MAX_DESCRIPTION_WORDS,
    model: session.generationSettings.analysisModel,
    prompt: buildIdentityDescriptionPrompt(correction),
    sourceWorkingHash: workingImage.sourceHash,
  };

  return {
    ok: true,
    request: {
      correctionId,
      cropRequest,
      descriptionRequest,
      expectedWorkingHash,
    },
  };
}

export async function executeAdvancedImageIdentityAnalysis(
  session: AdvancedImageSession,
  correctionId: string,
  workingImage: AdvancedImageWorkingImage | undefined,
  options: AdvancedImageIdentityAnalysisOptions,
): Promise<AdvancedImageIdentityAnalysisResult> {
  const issues = validateAnalysisOptions(options);
  const requestResult = buildAdvancedImageIdentityAnalysisRequest(session, correctionId, workingImage);
  if (!requestResult.ok) issues.push(...requestResult.issues);
  if (issues.length > 0 || !requestResult.ok) {
    throw new AdvancedImageAnalysisError("Advanced image identity analysis blocked by safety guard.", issues);
  }

  const context: AdvancedImageAnalysisContext = {
    requestId: options.requestId!,
    signal: options.signal,
    userEmail: normalizeEmail(options.userEmail ?? ""),
  };

  const crop = await options.cropExtractor!(requestResult.request.cropRequest, context);
  const description = await options.descriptionTransport!(
    {
      ...requestResult.request.descriptionRequest,
      imageS3Key: crop.cropS3Key,
      imageUrl: crop.cropUrl,
    },
    context,
  );

  const identityAnchor: AdvancedImageIdentityAnchor = {
    bbox: requestResult.request.cropRequest.bbox,
    createdAt: options.now!,
    cropHash: crop.cropHash || stableHash({ cropUrl: crop.cropUrl, sourceWorkingHash: workingImage!.sourceHash }),
    cropS3Key: crop.cropS3Key,
    cropUrl: crop.cropUrl,
    description: normalizeIdentityDescription(description.description),
    perceptualHash: crop.perceptualHash,
    sourceWorkingHash: workingImage!.sourceHash,
  };

  return {
    correctionId,
    descriptionDurationMs: description.durationMs,
    identityAnchor,
    requestId: options.requestId!,
  };
}

export function buildIdentityDescriptionPrompt(correction: AdvancedImageCorrection): string {
  return [
    "Examine the marked region of this image.",
    "Describe in detail the visual element or change present in the region (subject, color, texture, posture, accessories, lighting in the region, style).",
    "Max 80 words. Focus only on the marked region, not the surrounding context. Be specific and visual.",
    `Correction ID: ${correction.id}`,
    `Zone: ${correction.zone.locationDescription}`,
    `User instruction: ${correction.userInstruction}`,
  ].join("\n");
}

export function normalizeIdentityDescription(description: string): string {
  const words = description.trim().replace(/\s+/g, " ").split(" ").filter(Boolean);
  return words.slice(0, MAX_DESCRIPTION_WORDS).join(" ");
}

export function computeAdvancedImageIdentityDrift(
  previous: Pick<AdvancedImageIdentityAnchor, "cropHash" | "perceptualHash">,
  next: Pick<AdvancedImageIdentityAnchor, "cropHash" | "perceptualHash">,
  threshold: number,
): AdvancedImageIdentityDrift {
  const normalizedThreshold = Math.max(0, Math.min(1, threshold));
  if (!previous.perceptualHash || !next.perceptualHash || previous.perceptualHash.length !== next.perceptualHash.length) {
    const score = previous.cropHash === next.cropHash ? 0 : 1;
    return {
      exceedsThreshold: score > normalizedThreshold,
      reason: previous.cropHash === next.cropHash ? "perceptual_hash_missing" : "crop_hash_changed",
      score,
      threshold: normalizedThreshold,
    };
  }

  const distance = normalizedHammingDistance(previous.perceptualHash, next.perceptualHash);
  return {
    exceedsThreshold: distance > normalizedThreshold,
    reason: "perceptual_hash_distance",
    score: distance,
    threshold: normalizedThreshold,
  };
}

function validateAnalysisOptions(options: AdvancedImageIdentityAnalysisOptions): AdvancedImageAnalysisIssue[] {
  const issues: AdvancedImageAnalysisIssue[] = [];
  if (!options.cropExtractor) {
    issues.push({ code: "CROP_EXTRACTOR_MISSING", detail: "A crop extractor is required for identity analysis." });
  }
  if (!options.descriptionTransport) {
    issues.push({ code: "DESCRIPTION_TRANSPORT_MISSING", detail: "A description transport is required for identity analysis." });
  }
  if (!options.requestId?.trim()) {
    issues.push({ code: "REQUEST_ID_MISSING", detail: "A requestId is required for identity analysis traceability." });
  }
  if (!normalizeEmail(options.userEmail ?? "")) {
    issues.push({ code: "USER_MISSING", detail: "A user email is required before any analysis call." });
  }
  if (!options.now?.trim()) {
    issues.push({ code: "TIMESTAMP_MISSING", detail: "A timestamp is required for identity anchor creation." });
  }
  if (!options.analysisApproval?.approved) {
    issues.push({ code: "ANALYSIS_NOT_APPROVED", detail: "Automatic identity analysis must be explicitly approved by the caller." });
  }
  return issues;
}

function padBox(
  box: AdvancedImageBox,
  paddingRatio: number,
  sourceSize: { height: number; width: number },
): AdvancedImageBox {
  const padX = box.width * paddingRatio;
  const padY = box.height * paddingRatio;
  const x = Math.max(0, Math.floor(box.x - padX));
  const y = Math.max(0, Math.floor(box.y - padY));
  const right = Math.min(sourceSize.width, Math.ceil(box.x + box.width + padX));
  const bottom = Math.min(sourceSize.height, Math.ceil(box.y + box.height + padY));
  return {
    height: Math.max(0, bottom - y),
    width: Math.max(0, right - x),
    x,
    y,
  };
}

function normalizedHammingDistance(a: string, b: string): number {
  if (a.length !== b.length || a.length === 0) return 1;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) diff += 1;
  }
  return diff / a.length;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
