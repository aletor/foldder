import { describe, expect, it, vi } from "vitest";

import type { AdvancedImageGenerationPlan } from "./pipeline";
import {
  createAdvancedImageMemoryCacheStore,
  getAdvancedImageFinalCacheKey,
  getAdvancedImageGeminiRawCacheKey,
  getAdvancedImagePayloadReferenceCacheKey,
  readAdvancedImageCache,
  readAdvancedImageFinalCache,
  readAdvancedImageGeminiRawCache,
  readAdvancedImagePayloadReferenceCache,
  writeAdvancedImageCache,
  writeAdvancedImageFinalCache,
  writeAdvancedImageGeminiRawCache,
  writeAdvancedImagePayloadReferenceCache,
  type AdvancedImageCachedGeneratedImage,
} from "./cache";

function plan(overrides: Partial<AdvancedImageGenerationPlan> = {}): AdvancedImageGenerationPlan {
  return {
    activeCorrectionIds: ["c1"],
    appliedPreserveCorrectionIds: [],
    baseImage: {
      contentHash: "master-hash",
      height: 1200,
      imageUrl: "/master.png",
      masterId: "master-1",
      width: 1600,
    },
    batchPendingIds: ["c1"],
    cacheKeys: {
      finalImage: "advanced-image/final/final-hash",
      geminiRaw: "advanced-image/gemini/gemini-hash",
    },
    consolidationRecommended: false,
    directionReferences: [],
    finalImageStateHash: "final-hash",
    geminiStateHash: "gemini-hash",
    globalAdjustmentActive: false,
    globalAdjustmentPending: false,
    identityReferences: [],
    omittedDirectionReferenceCorrectionIds: [],
    omittedIdentityReferenceCorrectionIds: [],
    postCompositeSteps: [],
    prompt: {
      blocks: [],
      combinedBlocks: [],
      finalInstruction: "Preserve the master.",
      promptText: "IMAGE CREATION ADVANCED",
    },
    promptVersion: "advanced-image-prompt-v1",
    referenceLimit: 8,
    strictCompositeSteps: [],
    strictCorrectionIds: [],
    model: "gemini-3-pro-image-preview",
    resolution: "4k",
    ...overrides,
  };
}

const generatedImage: AdvancedImageCachedGeneratedImage = {
  durationMs: 1200,
  height: 1200,
  imageUrl: "/working.png",
  model: "gemini-3-pro-image-preview",
  resolution: "4k",
  s3Key: "knowledge-files/project-media/user/x/project/working.png",
  sourceHash: "final-hash",
  width: 1600,
};

describe("advanced-image-cache", () => {
  it("writes and reads a generic cache record with TTL", async () => {
    const store = createAdvancedImageMemoryCacheStore();
    await writeAdvancedImageCache(store, {
      key: "key-1",
      kind: "gemini-raw",
      options: { createdAt: "2026-05-18T10:00:00.000Z", ttlMs: 1000 },
      value: { ok: true },
    });

    const hit = await readAdvancedImageCache<{ ok: boolean }>(store, "key-1", "2026-05-18T10:00:00.500Z");
    expect(hit).toMatchObject({ hit: true, value: { ok: true } });
  });

  it("treats expired records as misses and deletes them when supported", async () => {
    const store = createAdvancedImageMemoryCacheStore();
    await writeAdvancedImageCache(store, {
      key: "expired",
      kind: "gemini-raw",
      options: { createdAt: "2026-05-18T10:00:00.000Z", ttlMs: 1000 },
      value: { ok: true },
    });

    const miss = await readAdvancedImageCache(store, "expired", "2026-05-18T10:00:01.000Z");
    expect(miss).toEqual({ hit: false, reason: "expired" });
    expect(await readAdvancedImageCache(store, "expired", "2026-05-18T10:00:01.001Z")).toEqual({
      hit: false,
      reason: "missing",
    });
  });

  it("keeps Gemini raw and final image cache layers separate", async () => {
    const store = createAdvancedImageMemoryCacheStore();
    const p = plan();

    await writeAdvancedImageGeminiRawCache(store, p, generatedImage, {
      createdAt: "2026-05-18T10:00:00.000Z",
    });
    await writeAdvancedImageFinalCache(
      store,
      p,
      { ...generatedImage, imageUrl: "/final-composited.png" },
      { createdAt: "2026-05-18T10:00:00.000Z" },
    );

    expect(getAdvancedImageGeminiRawCacheKey(p)).not.toBe(getAdvancedImageFinalCacheKey(p));
    const raw = await readAdvancedImageGeminiRawCache(store, p, "2026-05-18T10:30:00.000Z");
    const final = await readAdvancedImageFinalCache(store, p, "2026-05-18T10:30:00.000Z");

    expect(raw).toMatchObject({ hit: true, value: { imageUrl: "/working.png" } });
    expect(final).toMatchObject({ hit: true, value: { imageUrl: "/final-composited.png" } });
  });

  it("does not expose mutable cache values from the memory store", async () => {
    const store = createAdvancedImageMemoryCacheStore();
    const value = { nested: { count: 1 } };
    await writeAdvancedImageCache(store, {
      key: "immutable",
      kind: "payload-reference",
      options: { createdAt: "2026-05-18T10:00:00.000Z" },
      value,
    });
    value.nested.count = 999;

    const hit = await readAdvancedImageCache<typeof value>(store, "immutable", "2026-05-18T10:01:00.000Z");
    expect(hit).toMatchObject({ hit: true, value: { nested: { count: 1 } } });
  });

  it("stores payload references by stable hash key", async () => {
    const store = createAdvancedImageMemoryCacheStore();
    await writeAdvancedImagePayloadReferenceCache(
      store,
      {
        hash: "reference-hash-1",
        role: "identity",
        s3Key: "knowledge-files/temp/reference.png",
        uploadedAt: "2026-05-18T10:00:00.000Z",
        url: "/api/spaces/s3-file?key=knowledge-files/temp/reference.png",
      },
      { createdAt: "2026-05-18T10:00:00.000Z" },
    );

    expect(getAdvancedImagePayloadReferenceCacheKey("reference-hash-1")).toBe(
      "advanced-image/payload-reference/reference-hash-1",
    );
    expect(
      await readAdvancedImagePayloadReferenceCache(store, "reference-hash-1", "2026-05-18T10:30:00.000Z"),
    ).toMatchObject({
      hit: true,
      value: { role: "identity", url: "/api/spaces/s3-file?key=knowledge-files/temp/reference.png" },
    });
  });

  it("passes cache context through to the injected store", async () => {
    const get = vi.fn(async () => undefined);
    const set = vi.fn(async () => undefined);
    const store = { get, set };
    const context = { requestId: "req-1", userEmail: "user@example.com" };

    await writeAdvancedImageFinalCache(store, plan(), generatedImage, { createdAt: "2026-05-18T10:00:00.000Z" }, context);
    await readAdvancedImageFinalCache(store, plan(), "2026-05-18T10:01:00.000Z", context);

    expect(set).toHaveBeenCalledWith(expect.objectContaining({ key: "advanced-image/final/final-hash" }), context);
    expect(get).toHaveBeenCalledWith("advanced-image/final/final-hash", context);
  });
});
