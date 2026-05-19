import type { AdvancedImageGenerationPlan } from "./pipeline";

export type AdvancedImageCacheKind = "final-image" | "gemini-raw" | "payload-reference";

export type AdvancedImageCacheRecord<TValue> = {
  createdAt: string;
  expiresAt: string;
  key: string;
  kind: AdvancedImageCacheKind;
  metadata?: Record<string, unknown>;
  value: TValue;
};

export type AdvancedImageCacheContext = {
  requestId?: string;
  userEmail?: string;
};

export type AdvancedImageCacheStore = {
  delete?: (key: string, context?: AdvancedImageCacheContext) => Promise<void>;
  get: <TValue>(key: string, context?: AdvancedImageCacheContext) => Promise<AdvancedImageCacheRecord<TValue> | undefined>;
  set: <TValue>(record: AdvancedImageCacheRecord<TValue>, context?: AdvancedImageCacheContext) => Promise<void>;
};

export type AdvancedImageCacheReadResult<TValue> =
  | {
      hit: true;
      record: AdvancedImageCacheRecord<TValue>;
      value: TValue;
    }
  | {
      hit: false;
      reason: "expired" | "missing";
    };

export type AdvancedImageCachedGeneratedImage = {
  durationMs?: number;
  height: number;
  imageUrl: string;
  model: string;
  raw?: unknown;
  resolution: string;
  s3Key?: string;
  sourceHash: string;
  width: number;
};

export type AdvancedImageCachedPayloadReference = {
  hash: string;
  role: "direction" | "identity" | "master";
  s3Key?: string;
  uploadedAt: string;
  url: string;
};

export type AdvancedImageCacheWriteOptions = {
  createdAt: string;
  ttlMs?: number;
};

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

export function createAdvancedImageMemoryCacheStore(
  seed?: Array<AdvancedImageCacheRecord<unknown>>,
): AdvancedImageCacheStore & { dump: () => Array<AdvancedImageCacheRecord<unknown>> } {
  const records = new Map<string, AdvancedImageCacheRecord<unknown>>();
  for (const record of seed ?? []) records.set(record.key, cloneJson(record));
  return {
    async delete(key) {
      records.delete(key);
    },
    dump() {
      return Array.from(records.values()).map((record) => cloneJson(record));
    },
    async get<TValue>(key: string) {
      const record = records.get(key);
      return record ? (cloneJson(record) as AdvancedImageCacheRecord<TValue>) : undefined;
    },
    async set<TValue>(record: AdvancedImageCacheRecord<TValue>) {
      records.set(record.key, cloneJson(record) as AdvancedImageCacheRecord<unknown>);
    },
  };
}

export async function readAdvancedImageCache<TValue>(
  store: AdvancedImageCacheStore,
  key: string,
  now: string,
  context?: AdvancedImageCacheContext,
): Promise<AdvancedImageCacheReadResult<TValue>> {
  const record = await store.get<TValue>(key, context);
  if (!record) return { hit: false, reason: "missing" };
  if (isExpired(record.expiresAt, now)) {
    await store.delete?.(key, context);
    return { hit: false, reason: "expired" };
  }
  return {
    hit: true,
    record,
    value: record.value,
  };
}

export async function writeAdvancedImageCache<TValue>(
  store: AdvancedImageCacheStore,
  args: {
    context?: AdvancedImageCacheContext;
    key: string;
    kind: AdvancedImageCacheKind;
    metadata?: Record<string, unknown>;
    options: AdvancedImageCacheWriteOptions;
    value: TValue;
  },
): Promise<AdvancedImageCacheRecord<TValue>> {
  const ttlMs = args.options.ttlMs ?? DEFAULT_TTL_MS;
  const record: AdvancedImageCacheRecord<TValue> = {
    createdAt: args.options.createdAt,
    expiresAt: new Date(Date.parse(args.options.createdAt) + ttlMs).toISOString(),
    key: args.key,
    kind: args.kind,
    metadata: args.metadata,
    value: cloneJson(args.value),
  };
  await store.set(record, args.context);
  return record;
}

export function getAdvancedImageGeminiRawCacheKey(plan: AdvancedImageGenerationPlan): string {
  return plan.cacheKeys.geminiRaw;
}

export function getAdvancedImageFinalCacheKey(plan: AdvancedImageGenerationPlan): string {
  return plan.cacheKeys.finalImage;
}

export function getAdvancedImagePayloadReferenceCacheKey(referenceHash: string): string {
  return `advanced-image/payload-reference/${referenceHash}`;
}

export async function readAdvancedImageGeminiRawCache(
  store: AdvancedImageCacheStore,
  plan: AdvancedImageGenerationPlan,
  now: string,
  context?: AdvancedImageCacheContext,
): Promise<AdvancedImageCacheReadResult<AdvancedImageCachedGeneratedImage>> {
  return readAdvancedImageCache<AdvancedImageCachedGeneratedImage>(store, getAdvancedImageGeminiRawCacheKey(plan), now, context);
}

export async function writeAdvancedImageGeminiRawCache(
  store: AdvancedImageCacheStore,
  plan: AdvancedImageGenerationPlan,
  value: AdvancedImageCachedGeneratedImage,
  options: AdvancedImageCacheWriteOptions,
  context?: AdvancedImageCacheContext,
): Promise<AdvancedImageCacheRecord<AdvancedImageCachedGeneratedImage>> {
  return writeAdvancedImageCache(store, {
    context,
    key: getAdvancedImageGeminiRawCacheKey(plan),
    kind: "gemini-raw",
    metadata: {
      finalImageStateHash: plan.finalImageStateHash,
      geminiStateHash: plan.geminiStateHash,
      model: plan.model,
      promptVersion: plan.promptVersion,
    },
    options,
    value,
  });
}

export async function readAdvancedImageFinalCache(
  store: AdvancedImageCacheStore,
  plan: AdvancedImageGenerationPlan,
  now: string,
  context?: AdvancedImageCacheContext,
): Promise<AdvancedImageCacheReadResult<AdvancedImageCachedGeneratedImage>> {
  return readAdvancedImageCache<AdvancedImageCachedGeneratedImage>(store, getAdvancedImageFinalCacheKey(plan), now, context);
}

export async function writeAdvancedImageFinalCache(
  store: AdvancedImageCacheStore,
  plan: AdvancedImageGenerationPlan,
  value: AdvancedImageCachedGeneratedImage,
  options: AdvancedImageCacheWriteOptions,
  context?: AdvancedImageCacheContext,
): Promise<AdvancedImageCacheRecord<AdvancedImageCachedGeneratedImage>> {
  return writeAdvancedImageCache(store, {
    context,
    key: getAdvancedImageFinalCacheKey(plan),
    kind: "final-image",
    metadata: {
      finalImageStateHash: plan.finalImageStateHash,
      geminiStateHash: plan.geminiStateHash,
      model: plan.model,
      postCompositeStepCount: plan.postCompositeSteps?.length ?? 0,
      promptVersion: plan.promptVersion,
      strictCompositeStepCount: plan.strictCompositeSteps?.length ?? 0,
    },
    options,
    value,
  });
}

export async function readAdvancedImagePayloadReferenceCache(
  store: AdvancedImageCacheStore,
  referenceHash: string,
  now: string,
  context?: AdvancedImageCacheContext,
): Promise<AdvancedImageCacheReadResult<AdvancedImageCachedPayloadReference>> {
  return readAdvancedImageCache<AdvancedImageCachedPayloadReference>(
    store,
    getAdvancedImagePayloadReferenceCacheKey(referenceHash),
    now,
    context,
  );
}

export async function writeAdvancedImagePayloadReferenceCache(
  store: AdvancedImageCacheStore,
  value: AdvancedImageCachedPayloadReference,
  options: AdvancedImageCacheWriteOptions,
  context?: AdvancedImageCacheContext,
): Promise<AdvancedImageCacheRecord<AdvancedImageCachedPayloadReference>> {
  return writeAdvancedImageCache(store, {
    context,
    key: getAdvancedImagePayloadReferenceCacheKey(value.hash),
    kind: "payload-reference",
    metadata: {
      role: value.role,
      s3Key: value.s3Key,
    },
    options,
    value,
  });
}

function isExpired(expiresAt: string, now: string): boolean {
  const expires = Date.parse(expiresAt);
  const current = Date.parse(now);
  return Number.isFinite(expires) && Number.isFinite(current) ? expires <= current : true;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
