import { stableHash } from "./domain";
import type {
  AdvancedImageGenerationPlan,
  AdvancedImagePipelineReference,
} from "./pipeline";

export type AdvancedImageGeminiReferenceInput = {
  correctionId?: string;
  hash: string;
  label: "MASTER" | string;
  role: "base" | "direction" | "identity" | "previous_state";
  s3Key?: string;
  url: string;
};

export type AdvancedImageGeminiPayload = {
  cacheKeys: AdvancedImageGenerationPlan["cacheKeys"];
  finalImageStateHash: string;
  geminiStateHash: string;
  idempotencyKey: string;
  imageInputs: string[];
  model: string;
  prompt: string;
  promptVersion: string;
  referenceInputs: AdvancedImageGeminiReferenceInput[];
  resolution: string;
};

export type AdvancedImageGeminiTransportContext = {
  requestId: string;
  signal?: AbortSignal;
  userEmail: string;
};

export type AdvancedImageGeminiTransportResult = {
  durationMs?: number;
  key: string;
  model: string;
  outputUrl: string;
  raw?: unknown;
};

export type AdvancedImageGeminiGenerationResult = AdvancedImageGeminiTransportResult & {
  cacheKeys: AdvancedImageGenerationPlan["cacheKeys"];
  finalImageStateHash: string;
  geminiStateHash: string;
  idempotencyKey: string;
  requestId: string;
};

export type AdvancedImageGeminiTransport = (
  payload: AdvancedImageGeminiPayload,
  context: AdvancedImageGeminiTransportContext,
) => Promise<AdvancedImageGeminiTransportResult>;

export type AdvancedImageGeminiPayloadOptions = {
  maxImageInputs?: number;
};

export type AdvancedImageGeminiExecuteOptions = AdvancedImageGeminiPayloadOptions & {
  costApproval: {
    approved: boolean;
    reason: "cached_replay" | "explicit_user_action" | "manual_retry";
  };
  requestId: string;
  signal?: AbortSignal;
  transport: AdvancedImageGeminiTransport;
  userEmail: string;
};

export type AdvancedImageGeminiPayloadResult =
  | { ok: true; payload: AdvancedImageGeminiPayload }
  | { issues: AdvancedImageGeminiSafetyIssue[]; ok: false };

export type AdvancedImageGeminiSafetyIssue = {
  code:
    | "BASE_IMAGE_MISSING"
    | "COST_NOT_APPROVED"
    | "IMAGE_INPUT_LIMIT_EXCEEDED"
    | "MODEL_MISSING"
    | "PROMPT_MISSING"
    | "REQUEST_ID_MISSING"
    | "TRANSPORT_MISSING"
    | "USER_MISSING";
  detail: string;
};

export class AdvancedImageGeminiAdapterError extends Error {
  constructor(
    message: string,
    public issues: AdvancedImageGeminiSafetyIssue[],
  ) {
    super(message);
    this.name = "AdvancedImageGeminiAdapterError";
  }
}

const DEFAULT_MAX_IMAGE_INPUTS = 9; // master + 8 operational references

export function buildAdvancedImageGeminiPayload(
  plan: AdvancedImageGenerationPlan,
  options: AdvancedImageGeminiPayloadOptions = {},
): AdvancedImageGeminiPayloadResult {
  const maxImageInputs = Math.max(1, options.maxImageInputs ?? DEFAULT_MAX_IMAGE_INPUTS);
  const issues: AdvancedImageGeminiSafetyIssue[] = [];
  if (!plan.baseImage.imageUrl) {
    issues.push({ code: "BASE_IMAGE_MISSING", detail: "Advanced image generation requires a master base image URL." });
  }
  if (!plan.prompt.promptText.trim()) {
    issues.push({ code: "PROMPT_MISSING", detail: "Advanced image generation requires a non-empty structured prompt." });
  }
  if (!plan.model.trim()) {
    issues.push({ code: "MODEL_MISSING", detail: "Advanced image generation requires an explicit model." });
  }

  const referenceInputs = buildReferenceInputs(plan);
  if (referenceInputs.length > maxImageInputs) {
    issues.push({
      code: "IMAGE_INPUT_LIMIT_EXCEEDED",
      detail: `Payload has ${referenceInputs.length} image inputs, max allowed is ${maxImageInputs}. No truncation is allowed.`,
    });
  }

  if (issues.length > 0) return { issues, ok: false };

  const prompt = enrichPromptWithReferenceOrder(plan, referenceInputs);
  const idempotencyKey = stableHash({
    finalImageStateHash: plan.finalImageStateHash,
    geminiStateHash: plan.geminiStateHash,
    imageInputs: referenceInputs.map((input) => [input.label, input.hash, input.url]),
    model: plan.model,
    prompt,
    promptVersion: plan.promptVersion,
    resolution: plan.resolution,
  });

  return {
    ok: true,
    payload: {
      cacheKeys: plan.cacheKeys,
      finalImageStateHash: plan.finalImageStateHash,
      geminiStateHash: plan.geminiStateHash,
      idempotencyKey,
      imageInputs: referenceInputs.map((input) => input.url),
      model: plan.model,
      prompt,
      promptVersion: plan.promptVersion,
      referenceInputs,
      resolution: plan.resolution,
    },
  };
}

export async function executeAdvancedImageGeminiGeneration(
  plan: AdvancedImageGenerationPlan,
  options: AdvancedImageGeminiExecuteOptions,
): Promise<AdvancedImageGeminiGenerationResult> {
  const issues = validateExecuteOptions(options);
  const payloadResult = buildAdvancedImageGeminiPayload(plan, options);
  if (!payloadResult.ok) issues.push(...payloadResult.issues);
  if (issues.length > 0 || !payloadResult.ok) {
    throw new AdvancedImageGeminiAdapterError("Advanced image Gemini call blocked by safety guard.", issues);
  }

  const result = await options.transport(payloadResult.payload, {
    requestId: options.requestId,
    signal: options.signal,
    userEmail: normalizeEmail(options.userEmail),
  });

  return {
    ...result,
    cacheKeys: payloadResult.payload.cacheKeys,
    finalImageStateHash: payloadResult.payload.finalImageStateHash,
    geminiStateHash: payloadResult.payload.geminiStateHash,
    idempotencyKey: payloadResult.payload.idempotencyKey,
    requestId: options.requestId,
  };
}

export function createGeminiImageGenerateTransport(args: {
  geminiImageGenerate: (
    raw: {
      images?: string[];
      model?: string;
      prompt: string;
      resolution?: string;
    },
    onProgress?: (progress: number, stage: string) => void,
    options?: { usageRoute?: string; usageUserEmail?: string },
  ) => Promise<{ key: string; model: string; output: string; time: number }>;
  maxSupportedImageInputs?: number;
  onProgress?: (progress: number, stage: string) => void;
  usageRoute?: string;
}): AdvancedImageGeminiTransport {
  const maxSupportedImageInputs = Math.max(1, args.maxSupportedImageInputs ?? DEFAULT_MAX_IMAGE_INPUTS);
  return async (payload, context) => {
    if (payload.imageInputs.length > maxSupportedImageInputs) {
      throw new AdvancedImageGeminiAdapterError("Configured Gemini transport cannot send all image inputs.", [
        {
          code: "IMAGE_INPUT_LIMIT_EXCEEDED",
          detail: `Transport supports ${maxSupportedImageInputs} image inputs, payload needs ${payload.imageInputs.length}.`,
        },
      ]);
    }
    const result = await args.geminiImageGenerate(
      {
        images: payload.imageInputs,
        model: payload.model,
        prompt: payload.prompt,
        resolution: payload.resolution,
      },
      args.onProgress,
      {
        usageRoute: args.usageRoute ?? "/api/gemini/advanced-image",
        usageUserEmail: context.userEmail,
      },
    );
    return {
      durationMs: result.time,
      key: result.key,
      model: result.model,
      outputUrl: result.output,
      raw: result,
    };
  };
}

function validateExecuteOptions(options: AdvancedImageGeminiExecuteOptions): AdvancedImageGeminiSafetyIssue[] {
  const issues: AdvancedImageGeminiSafetyIssue[] = [];
  if (!options.transport) {
    issues.push({ code: "TRANSPORT_MISSING", detail: "No Gemini transport was provided." });
  }
  if (!options.requestId.trim()) {
    issues.push({ code: "REQUEST_ID_MISSING", detail: "A stable requestId is required for cost traceability." });
  }
  if (!normalizeEmail(options.userEmail)) {
    issues.push({ code: "USER_MISSING", detail: "A user email is required before any billable generation call." });
  }
  if (!options.costApproval.approved) {
    issues.push({ code: "COST_NOT_APPROVED", detail: "Billable generation requires explicit cost approval." });
  }
  return issues;
}

function buildReferenceInputs(plan: AdvancedImageGenerationPlan): AdvancedImageGeminiReferenceInput[] {
  return [
    {
      hash: plan.baseImage.contentHash,
      label: "MASTER",
      role: "base",
      s3Key: plan.baseImage.s3Key,
      url: plan.baseImage.imageUrl,
    },
    ...(plan.previousStateReference
      ? [
          {
            hash: plan.previousStateReference.hash,
            label: plan.previousStateReference.label,
            role: plan.previousStateReference.role,
            s3Key: plan.previousStateReference.s3Key,
            url: plan.previousStateReference.url,
          } satisfies AdvancedImageGeminiReferenceInput,
        ]
      : []),
    ...plan.identityReferences.map(referenceInputFromPlanReference),
    ...plan.directionReferences.map(referenceInputFromPlanReference),
  ];
}

function referenceInputFromPlanReference(reference: AdvancedImagePipelineReference): AdvancedImageGeminiReferenceInput {
  return {
    correctionId: reference.correctionId,
    hash: reference.hash,
    label: reference.label,
    role: reference.role,
    s3Key: reference.s3Key,
    url: reference.url,
  };
}

function enrichPromptWithReferenceOrder(
  plan: AdvancedImageGenerationPlan,
  referenceInputs: AdvancedImageGeminiReferenceInput[],
): string {
  const referenceLines = referenceInputs.map((input, index) => {
    const correction = input.correctionId ? `, correction=${input.correctionId}` : "";
    return `IMAGE ${index + 1}: ${input.label} (${input.role}${correction})`;
  });
  const omittedIdentity =
    plan.omittedIdentityReferenceCorrectionIds.length > 0
      ? [
          "",
          "OMITTED VISUAL IDENTITY REFERENCES:",
          ...plan.omittedIdentityReferenceCorrectionIds.map(
            (id) => `- ${id}: no image reference included due to reference limit; preserve using text identity block.`,
          ),
        ]
      : [];
  const omittedDirection =
    plan.omittedDirectionReferenceCorrectionIds.length > 0
      ? [
          "",
          "OMITTED VISUAL DIRECTION REFERENCES:",
          ...plan.omittedDirectionReferenceCorrectionIds.map(
            (id) => `- ${id}: no REF-DIR image included due to reference limit; use the written correction block only.`,
          ),
        ]
      : [];
  return [
    "REFERENCE IMAGE ORDER:",
    ...referenceLines,
    "",
    plan.prompt.promptText,
    ...omittedIdentity,
    ...omittedDirection,
  ].join("\n");
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
