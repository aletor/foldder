import { describe, expect, it } from "vitest";

import {
  addCorrection,
  changePinMode,
  createAdvancedImageSession,
  setAdvancedImageWorkingImage,
  updateAdvancedImageGlobalAdjustment,
  type AdvancedImageAddCorrectionInput,
  type AdvancedImageGenerationSettings,
  type AdvancedImageIdentityAnchor,
  type AdvancedImageMaster,
  type AdvancedImageSession,
  type AdvancedImageUserReferenceGrid,
} from "./domain";
import { createZoneFromStrokes } from "./mask";
import {
  buildAdvancedImageGenerationPlan,
  computeAdvancedImagePlanFingerprint,
  getAdvancedImageActiveCorrections,
  getAdvancedImagePendingCorrectionIds,
} from "./pipeline";

const settings: AdvancedImageGenerationSettings = {
  analysisModel: "gemini-2.5-flash",
  cropMaxSide: 768,
  driftThreshold: 0.22,
  maxReferenceImages: 8,
  model: "gemini-3-pro-image-preview",
  promptVersion: "advanced-image-prompt-v1",
  resolution: "4k",
};

const master: AdvancedImageMaster = {
  contentHash: "master-content-hash",
  createdAt: "2026-05-18T10:00:00.000Z",
  height: 1000,
  id: "master-main",
  imageUrl: "/api/spaces/s3-file?key=knowledge-files/project-media/user/a/project/master.png",
  s3Key: "knowledge-files/project-media/user/a/project/master.png",
  width: 1000,
};

function session(overrides: Partial<AdvancedImageGenerationSettings> = {}): AdvancedImageSession {
  return createAdvancedImageSession({
    generationSettings: { ...settings, ...overrides },
    id: "advanced-session",
    master,
    timestamp: "2026-05-18T10:00:00.000Z",
    workingImage: {
      activeCorrectionIds: ["stale"],
      generatedAt: "2026-05-18T10:00:01.000Z",
      height: 999,
      imageUrl: "/stale-working-image.png",
      model: "old-model",
      resolution: "1k",
      sourceHash: "stale-working-hash",
      width: 999,
    },
  });
}

function anchor(id: string): AdvancedImageIdentityAnchor {
  return {
    bbox: { height: 100, width: 100, x: 100, y: 100 },
    createdAt: "2026-05-18T10:01:00.000Z",
    cropHash: `crop-${id}`,
    cropS3Key: `knowledge-files/anchors/${id}.png`,
    cropUrl: `/api/spaces/s3-file?key=knowledge-files%2Fanchors%2F${id}.png`,
    description: `Stable identity for ${id}: same color, texture and silhouette.`,
    perceptualHash: `phash-${id}`,
    sourceWorkingHash: `working-${id}`,
  };
}

function grid(id: string): AdvancedImageUserReferenceGrid {
  return {
    createdAt: "2026-05-18T10:02:00.000Z",
    gridHash: `grid-${id}`,
    gridImageUrl: `/grid-${id}.png`,
    gridS3Key: `knowledge-files/grids/${id}.png`,
    id: `grid-${id}`,
    sourceImageCount: 3,
  };
}

function correction(
  id: string,
  args: {
    dependencies?: string[];
    offset?: number;
    reference?: AdvancedImageUserReferenceGrid;
  } = {},
): AdvancedImageAddCorrectionInput {
  const offset = args.offset ?? 0;
  return {
    dependencies: args.dependencies,
    id,
    identityAnchor: anchor(id),
    timestamp: "2026-05-18T10:01:00.000Z",
    userInstruction: `Apply correction ${id}`,
    userReference: args.reference,
    zone: createZoneFromStrokes({
      sourceSize: { height: 1000, width: 1000 },
      strokes: [
        {
          id: `stroke-${id}`,
          points: [
            { x: 100 + offset, y: 100 + offset },
            { x: 180 + offset, y: 160 + offset },
          ],
          radius: 35,
        },
      ],
    }),
  };
}

function addMany(base: AdvancedImageSession, ids: string[]): AdvancedImageSession {
  return ids.reduce(
    (next, id, index) =>
      addCorrection(next, correction(id, { offset: index * 90 }), {
        timestamp: `2026-05-18T10:${String(index + 1).padStart(2, "0")}:00.000Z`,
      }),
    base,
  );
}

function markApplied(base: AdvancedImageSession, ids: string[]): AdvancedImageSession {
  const wanted = new Set(ids);
  return setAdvancedImageWorkingImage(
    base,
    {
      activeCorrectionIds: ids,
      correctionSnapshots: Object.fromEntries(
        base.corrections
          .filter((item) => wanted.has(item.id))
          .map((item) => [
            item.id,
            {
              geometryHash: item.geometryHash,
              instructionHash: item.instructionHash,
              referenceHash: item.referenceHash,
            },
          ]),
      ),
      generatedAt: "2026-05-18T10:05:00.000Z",
      height: base.master.height,
      imageUrl: "/api/spaces/s3-file?key=knowledge-files/generated/working.png",
      model: base.generationSettings.model,
      resolution: base.generationSettings.resolution,
      sourceHash: "working-source",
      width: base.master.width,
    },
    { timestamp: "2026-05-18T10:05:00.000Z" },
  );
}

describe("advanced-image-pipeline", () => {
  it("uses the immutable master as base image, never the stale working image", () => {
    const result = buildAdvancedImageGenerationPlan(session());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.baseImage.imageUrl).toBe(master.imageUrl);
    expect(result.plan.baseImage.contentHash).toBe(master.contentHash);
    expect(result.plan.prompt.promptText).toContain("BASE IMAGE: master-main");
    expect(result.plan.prompt.promptText).not.toContain("stale-working-image");
  });

  it("keeps REF-DIR from an applied correction with userReference in a later batch", () => {
    let s = addCorrection(session({ maxReferenceImages: 4 }), correction("previous", { reference: grid("previous") }), {
      timestamp: "2026-05-18T10:01:00.000Z",
    });
    s = addCorrection(s, correction("current", { reference: grid("current") }), {
      timestamp: "2026-05-18T10:02:00.000Z",
    });
    s = markApplied(s, ["previous"]);

    const result = buildAdvancedImageGenerationPlan(s, { batchPendingIds: ["current"] });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.batchPendingIds).toEqual(["current"]);
    expect(result.plan.appliedPreserveCorrectionIds).toEqual(["previous"]);
    expect(result.plan.directionReferences.map((ref) => ref.id)).toEqual(["REF-DIR-previous", "REF-DIR-current"]);
    expect(result.plan.identityReferences.map((ref) => ref.id)).toEqual(["REF-ID-previous"]);
    expect(result.plan.prompt.blocks.find((block) => block.correctionId === "current")?.referenceId).toBe("REF-DIR-current");
    expect(result.plan.prompt.blocks.find((block) => block.correctionId === "current")?.phase).toBe("apply");
    const previousBlock = result.plan.prompt.blocks.find((block) => block.correctionId === "previous");
    expect(previousBlock?.referenceId).toBe("REF-ID-previous");
    expect(previousBlock?.originalReferenceId).toBe("REF-DIR-previous");
    expect(previousBlock?.phase).toBe("preserve");
    expect(result.plan.prompt.promptText).toContain(
      "Original visual reference: REF-DIR-previous. Preserve coherence with this reference.",
    );
    expect(result.plan.prompt.promptText).toContain("- Original instruction: Apply correction previous.");
    expect(result.plan.prompt.promptText).toContain(
      "Reconstruct this previous correction only inside this exact marked zone.",
    );
  });

  it("adds a GLOBAL TRANSFORMATION block and global-specific final rules when active", () => {
    const s = updateAdvancedImageGlobalAdjustment(session(), "make the entire scene night time with cool moonlight", {
      timestamp: "2026-05-18T10:06:00.000Z",
    });

    const result = buildAdvancedImageGenerationPlan(s);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.globalAdjustmentActive).toBe(true);
    expect(result.plan.globalAdjustmentPending).toBe(true);
    expect(result.plan.prompt.promptText).toContain("GLOBAL TRANSFORMATION (applied to entire image):");
    expect(result.plan.prompt.promptText).toContain("make the entire scene night time with cool moonlight");
    expect(result.plan.prompt.promptText).toContain("The GLOBAL TRANSFORMATION affects the entire image.");
    expect(result.plan.prompt.promptText).toContain(
      "Do NOT extend a local change to similar, paired, repeated or symmetric visual elements outside the marked zone",
    );
    expect(result.plan.prompt.promptText).not.toContain("Only modify the explicitly marked zones.\n");
  });

  it("does not create REF-DIR for an applied correction without userReference", () => {
    let s = addCorrection(session({ maxReferenceImages: 4 }), correction("previous"), {
      timestamp: "2026-05-18T10:01:00.000Z",
    });
    s = addCorrection(s, correction("current", { reference: grid("current") }), {
      timestamp: "2026-05-18T10:02:00.000Z",
    });
    s = markApplied(s, ["previous"]);

    const result = buildAdvancedImageGenerationPlan(s, { batchPendingIds: ["current"] });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.directionReferences.map((ref) => ref.id)).toEqual(["REF-DIR-current"]);
    expect(result.plan.prompt.blocks.find((block) => block.correctionId === "previous")?.originalReferenceId).toBeUndefined();
  });

  it("enforces reference limit with composite, overlap and recency priorities", () => {
    let s = session({ maxReferenceImages: 3 });
    s = addCorrection(s, correction("composite-far", { offset: 720 }), {
      timestamp: "2026-05-18T10:01:00.000Z",
    });
    s = changePinMode(s, "composite-far", "composite", {
      timestamp: "2026-05-18T10:01:30.000Z",
    });
    s = addCorrection(s, correction("overlap", { offset: 5 }), {
      timestamp: "2026-05-18T10:02:00.000Z",
    });
    s = addCorrection(s, correction("recent", { offset: 450 }), {
      timestamp: "2026-05-18T10:03:00.000Z",
    });
    s = addCorrection(s, correction("current", { offset: 0, reference: grid("current") }), {
      timestamp: "2026-05-18T10:04:00.000Z",
    });
    s = markApplied(s, ["composite-far", "overlap", "recent"]);

    const result = buildAdvancedImageGenerationPlan(s, { batchPendingIds: ["current"] });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.referenceLimit).toBe(3);
    expect(result.plan.identityReferences.map((ref) => ref.correctionId)).toEqual(["composite-far", "overlap"]);
    expect(result.plan.identityReferences[0].priorityReasons).toContain("composite-critical");
    expect(result.plan.identityReferences[1].priorityReasons).toContain("spatial-overlap");
    expect(result.plan.omittedIdentityReferenceCorrectionIds).toEqual(["recent"]);
    expect(result.plan.consolidationRecommended).toBe(true);
  });

  it("prioritizes pending directions, composite anchors, applied directions and then anchor identities at the reference limit", () => {
    let s = session({ maxReferenceImages: 3 });
    s = addCorrection(s, correction("composite", { reference: grid("composite") }), {
      timestamp: "2026-05-18T10:01:00.000Z",
    });
    s = changePinMode(s, "composite", "composite", {
      timestamp: "2026-05-18T10:01:30.000Z",
    });
    s = addCorrection(s, correction("anchor", { offset: 220, reference: grid("anchor") }), {
      timestamp: "2026-05-18T10:02:00.000Z",
    });
    s = addCorrection(s, correction("pending", { offset: 440, reference: grid("pending") }), {
      timestamp: "2026-05-18T10:03:00.000Z",
    });
    s = markApplied(s, ["composite", "anchor"]);

    const result = buildAdvancedImageGenerationPlan(s, { batchPendingIds: ["pending"] });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.identityReferences.map((ref) => ref.id)).toEqual(["REF-ID-composite"]);
    expect(result.plan.directionReferences.map((ref) => ref.id)).toEqual(["REF-DIR-composite", "REF-DIR-pending"]);
    expect(result.plan.omittedDirectionReferenceCorrectionIds).toEqual(["anchor"]);
    expect(result.plan.omittedIdentityReferenceCorrectionIds).toEqual(["anchor"]);
    expect(result.plan.prompt.promptText).toContain(
      "Reference image originally used for this change is not included in this call; preserve from written description.",
    );
  });

  it("caps operational references to the model transport limit to avoid silent server truncation", () => {
    let s = session({ maxReferenceImages: 8 });
    s = addCorrection(s, correction("applied-a", { reference: grid("applied-a") }), {
      timestamp: "2026-05-18T10:01:00.000Z",
    });
    s = addCorrection(s, correction("applied-b", { offset: 180, reference: grid("applied-b") }), {
      timestamp: "2026-05-18T10:02:00.000Z",
    });
    s = addCorrection(s, correction("pending-a", { offset: 360, reference: grid("pending-a") }), {
      timestamp: "2026-05-18T10:03:00.000Z",
    });
    s = addCorrection(s, correction("pending-b", { offset: 540, reference: grid("pending-b") }), {
      timestamp: "2026-05-18T10:04:00.000Z",
    });
    s = markApplied(s, ["applied-a", "applied-b"]);

    const result = buildAdvancedImageGenerationPlan(s, { batchPendingIds: ["pending-a", "pending-b"] });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.referenceLimit).toBe(4);
    expect(result.plan.identityReferences.length + result.plan.directionReferences.length).toBeLessThanOrEqual(4);
    expect(result.plan.directionReferences.map((ref) => ref.id)).toEqual([
      "REF-DIR-applied-a",
      "REF-DIR-applied-b",
      "REF-DIR-pending-a",
      "REF-DIR-pending-b",
    ]);
    expect(result.plan.omittedIdentityReferenceCorrectionIds).toEqual(["applied-a", "applied-b"]);
    expect(result.plan.consolidationRecommended).toBe(true);
  });

  it("changing anchor to composite preserves gemini cache key but changes final cache key and post-composite plan", () => {
    const anchored = addCorrection(session(), correction("pinned"), {
      timestamp: "2026-05-18T10:01:00.000Z",
    });
    const anchoredPlan = buildAdvancedImageGenerationPlan(anchored);
    const composited = changePinMode(anchored, "pinned", "composite", {
      timestamp: "2026-05-18T10:02:00.000Z",
    });
    const compositedPlan = buildAdvancedImageGenerationPlan(composited);

    expect(anchoredPlan.ok).toBe(true);
    expect(compositedPlan.ok).toBe(true);
    if (!anchoredPlan.ok || !compositedPlan.ok) return;

    expect(compositedPlan.plan.cacheKeys.geminiRaw).toBe(anchoredPlan.plan.cacheKeys.geminiRaw);
    expect(compositedPlan.plan.cacheKeys.finalImage).not.toBe(anchoredPlan.plan.cacheKeys.finalImage);
    expect(compositedPlan.plan.postCompositeSteps).toHaveLength(1);
    expect(compositedPlan.plan.postCompositeSteps[0]).toMatchObject({
      correctionId: "pinned",
      cropHash: "crop-pinned",
      featherPx: 12,
    });
  });

  it("changing model invalidates gemini cache key without changing the master", () => {
    const base = addCorrection(session(), correction("c1"), {
      timestamp: "2026-05-18T10:01:00.000Z",
    });
    const differentModel = {
      ...base,
      generationSettings: {
        ...base.generationSettings,
        model: "gemini-3-flash-image-preview",
      },
    };

    const basePlan = buildAdvancedImageGenerationPlan(base);
    const differentModelPlan = buildAdvancedImageGenerationPlan(differentModel);

    expect(basePlan.ok).toBe(true);
    expect(differentModelPlan.ok).toBe(true);
    if (!basePlan.ok || !differentModelPlan.ok) return;

    expect(differentModelPlan.plan.baseImage).toEqual(basePlan.plan.baseImage);
    expect(differentModelPlan.plan.cacheKeys.geminiRaw).not.toBe(basePlan.plan.cacheKeys.geminiRaw);
  });

  it("reports batch pending correction errors instead of creating a stale plan", () => {
    const s = addMany(session(), ["a", "b"]);
    const result = buildAdvancedImageGenerationPlan(s, { batchPendingIds: ["missing"] });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0]).toMatchObject({ code: "BATCH_PENDING_CORRECTION_NOT_FOUND" });
  });

  it("creates a deterministic fingerprint for identical plans", () => {
    const s = addMany(session(), ["a", "b", "c"]);
    const first = buildAdvancedImageGenerationPlan(s);
    const second = buildAdvancedImageGenerationPlan(s);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    expect(computeAdvancedImagePlanFingerprint(first.plan)).toBe(computeAdvancedImagePlanFingerprint(second.plan));
    expect(getAdvancedImageActiveCorrections(s).map((item) => item.id)).toEqual(["a", "b", "c"]);
    expect(getAdvancedImagePendingCorrectionIds(s)).toEqual(["a", "b", "c"]);
  });
});
