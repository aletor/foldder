import { describe, expect, it, vi } from "vitest";

import {
  addCorrection,
  createAdvancedImageSession,
  editCorrection,
  toggleCorrection,
  updateAdvancedImageGlobalAdjustment,
  type AdvancedImageAddCorrectionInput,
  type AdvancedImageGenerationSettings,
  type AdvancedImageMaster,
  type AdvancedImageSession,
  type AdvancedImageZone,
} from "./domain";
import { createAdvancedImageMemoryCacheStore } from "./cache";
import {
  AdvancedImageClientGenerationError,
  runAdvancedImageClientGeneration,
} from "./client-orchestrator";
import type { AdvancedImageGeminiTransport } from "./gemini-adapter";

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
  contentHash: "master-hash-001",
  createdAt: "2026-05-18T09:00:00.000Z",
  height: 1200,
  id: "master-1",
  imageUrl: "/api/spaces/s3-file?key=knowledge-files/project-media/user/x/project/master.png",
  s3Key: "knowledge-files/project-media/user/x/project/master.png",
  sourceModel: "input-image",
  sourceResolution: "1600x1200",
  width: 1600,
};

function session(): AdvancedImageSession {
  return createAdvancedImageSession({
    generationSettings: settings,
    id: "session-1",
    master,
    timestamp: "2026-05-18T09:00:00.000Z",
  });
}

function zone(id: string, offset = 0): AdvancedImageZone {
  return {
    areaRatio: 0.01,
    bbox: { height: 120, width: 160, x: 100 + offset, y: 200 + offset },
    locationDescription: `zone ${id}`,
    normalizedBBox: { height: 0.1, width: 0.1, x: 0.1 + offset / 1600, y: 0.1 + offset / 1200 },
    sourceSize: { height: 1200, width: 1600 },
    strokes: [
      {
        id: `stroke-${id}`,
        points: [
          { x: 100 + offset, y: 200 + offset },
          { x: 160 + offset, y: 250 + offset },
        ],
        radius: 18,
      },
    ],
  };
}

function correction(id: string, offset = 0): AdvancedImageAddCorrectionInput {
  return {
    id,
    timestamp: "2026-05-18T09:01:00.000Z",
    userInstruction: `Add object ${id}`,
    zone: zone(id, offset),
  };
}

function appendCorrection(s: AdvancedImageSession, id: string, offset = 0): AdvancedImageSession {
  return addCorrection(s, correction(id, offset), {
    timestamp: `2026-05-18T09:0${Math.min(8, s.corrections.length + 1)}:00.000Z`,
  });
}

function transport(): AdvancedImageGeminiTransport {
  return vi.fn(async (payload) => ({
    durationMs: 1000,
    key: `knowledge-files/generated/${payload.finalImageStateHash}.png`,
    model: payload.model,
    outputUrl: `/api/spaces/s3-file?key=knowledge-files/generated/${payload.finalImageStateHash}.png`,
    raw: { idempotencyKey: payload.idempotencyKey },
  }));
}

describe("advanced-image-client-orchestrator", () => {
  it("generates three working images from the same immutable master", async () => {
    const cacheStore = createAdvancedImageMemoryCacheStore();
    const t = transport();
    let s = session();
    const masterHash = s.master.contentHash;
    const outputs: string[] = [];

    for (let index = 0; index < 3; index += 1) {
      const id = `c${index + 1}`;
      s = appendCorrection(s, id, index * 25);
      const result = await runAdvancedImageClientGeneration(s, {
        batchPendingIds: [id],
        cacheStore,
        costApproval: { approved: true, reason: "explicit_user_action" },
        now: `2026-05-18T09:1${index}:00.000Z`,
        requestId: `req-${index}`,
        transport: t,
        userEmail: "user@example.com",
      });
      s = result.session;
      outputs.push(result.workingImage.imageUrl);
      expect(s.master.contentHash).toBe(masterHash);
      expect(result.workingImage.sourceHash).toBe(result.plan.finalImageStateHash);
      expect(s.corrections.find((correction) => correction.id === id)?.appliedBatchNumber).toBe(index + 1);
      expect(result.workingImage.correctionSnapshots?.[id]).toMatchObject({
        geometryHash: s.corrections.find((correction) => correction.id === id)?.geometryHash,
        instructionHash: s.corrections.find((correction) => correction.id === id)?.instructionHash,
      });
    }

    expect(t).toHaveBeenCalledTimes(3);
    expect(new Set(outputs)).toHaveProperty("size", 3);
    expect(s.historySnapshots).toHaveLength(3);
    expect(s.historySnapshots.map((snapshot) => snapshot.batchNumber)).toEqual([1, 2, 3]);
    expect(s.historySnapshots[2].workingImage.imageUrl).toBe(outputs[2]);
    expect(s.master).toEqual(master);
  });

  it("reverting a correction regenerates from master with remaining active corrections", async () => {
    const cacheStore = createAdvancedImageMemoryCacheStore();
    const t = transport();
    let s = appendCorrection(appendCorrection(session(), "a", 0), "b", 360);
    s = (await runAdvancedImageClientGeneration(s, {
      batchPendingIds: ["a", "b"],
      cacheStore,
      costApproval: { approved: true, reason: "explicit_user_action" },
      now: "2026-05-18T09:10:00.000Z",
      requestId: "req-a",
      transport: t,
      userEmail: "user@example.com",
    })).session;

    const reverted = toggleCorrection(s, "b", { timestamp: "2026-05-18T09:11:00.000Z" });
    const regenerated = await runAdvancedImageClientGeneration(reverted, {
      batchPendingIds: ["a"],
      cacheStore,
      costApproval: { approved: true, reason: "explicit_user_action" },
      now: "2026-05-18T09:12:00.000Z",
      requestId: "req-b",
      transport: t,
      userEmail: "user@example.com",
    });

    expect(regenerated.workingImage.activeCorrectionIds).toEqual(["a"]);
    expect(regenerated.session.master.contentHash).toBe(master.contentHash);
  });

  it("generates pending corrections in one batch and next batches still start from master", async () => {
    const cacheStore = createAdvancedImageMemoryCacheStore();
    const t = transport();
    let s = appendCorrection(appendCorrection(session(), "a", 0), "b", 40);
    const masterHash = s.master.contentHash;

    const firstBatch = await runAdvancedImageClientGeneration(s, {
      batchPendingIds: ["a", "b"],
      cacheStore,
      costApproval: { approved: true, reason: "explicit_user_action" },
      now: "2026-05-18T09:10:00.000Z",
      requestId: "req-batch-1",
      transport: t,
      userEmail: "user@example.com",
    });
    s = firstBatch.session;

    expect(t).toHaveBeenCalledTimes(1);
    expect(firstBatch.plan.batchPendingIds).toEqual(["a", "b"]);
    expect(firstBatch.plan.appliedPreserveCorrectionIds).toEqual([]);
    expect(firstBatch.workingImage.activeCorrectionIds).toEqual(["a", "b"]);
    expect(firstBatch.session.master.contentHash).toBe(masterHash);
    expect(firstBatch.session.corrections.map((item) => [item.id, item.appliedBatchNumber])).toEqual([
      ["a", 1],
      ["b", 1],
    ]);

    s = appendCorrection(s, "c", 720);
    const secondBatch = await runAdvancedImageClientGeneration(s, {
      batchPendingIds: ["c"],
      cacheStore,
      costApproval: { approved: true, reason: "explicit_user_action" },
      now: "2026-05-18T09:11:00.000Z",
      requestId: "req-batch-2",
      transport: t,
      userEmail: "user@example.com",
    });

    expect(t).toHaveBeenCalledTimes(2);
    expect(secondBatch.plan.appliedPreserveCorrectionIds).toEqual(["a", "b"]);
    expect(secondBatch.plan.batchPendingIds).toEqual(["c"]);
    expect(secondBatch.plan.baseImage.contentHash).toBe(masterHash);
    expect(secondBatch.plan.prompt.promptText).toContain("PRESERVE EXISTING CHANGES:");
    expect(secondBatch.plan.prompt.promptText).toContain("APPLY NEW CHANGES:");
    expect(secondBatch.session.master.contentHash).toBe(masterHash);
    expect(secondBatch.workingImage.activeCorrectionIds).toEqual(["a", "b", "c"]);
    expect(secondBatch.session.corrections.map((item) => [item.id, item.appliedBatchNumber])).toEqual([
      ["a", 1],
      ["b", 1],
      ["c", 2],
    ]);
  });

  it("generates a global adjustment without local pending corrections and marks it applied", async () => {
    const cacheStore = createAdvancedImageMemoryCacheStore();
    const t = transport();
    const s = updateAdvancedImageGlobalAdjustment(session(), "turn the whole scene into night", {
      timestamp: "2026-05-18T09:02:00.000Z",
    });

    const result = await runAdvancedImageClientGeneration(s, {
      batchPendingIds: [],
      cacheStore,
      costApproval: { approved: true, reason: "explicit_user_action" },
      now: "2026-05-18T09:10:00.000Z",
      requestId: "req-global",
      transport: t,
      userEmail: "user@example.com",
    });

    expect(t).toHaveBeenCalledTimes(1);
    expect(result.plan.globalAdjustmentActive).toBe(true);
    expect(result.plan.prompt.promptText).toContain("GLOBAL TRANSFORMATION");
    expect(result.session.globalAdjustment.status).toBe("applied");
    expect(result.session.globalAdjustment.appliedInBatch).toBe(1);
    expect(result.session.master.contentHash).toBe(master.contentHash);
  });

  it("overwrites an edited correction batch number when it is regenerated later", async () => {
    const cacheStore = createAdvancedImageMemoryCacheStore();
    const t = transport();
    let s = appendCorrection(session(), "a", 0);
    s = (await runAdvancedImageClientGeneration(s, {
      batchPendingIds: ["a"],
      cacheStore,
      costApproval: { approved: true, reason: "explicit_user_action" },
      now: "2026-05-18T09:10:00.000Z",
      requestId: "req-a",
      transport: t,
      userEmail: "user@example.com",
    })).session;
    s = appendCorrection(s, "b", 600);
    s = (await runAdvancedImageClientGeneration(s, {
      batchPendingIds: ["b"],
      cacheStore,
      costApproval: { approved: true, reason: "explicit_user_action" },
      now: "2026-05-18T09:11:00.000Z",
      requestId: "req-b",
      transport: t,
      userEmail: "user@example.com",
    })).session;
    s = editCorrection(
      s,
      "a",
      { userInstruction: "Edit object a with a warmer material" },
      { timestamp: "2026-05-18T09:12:00.000Z" },
    );

    const regenerated = await runAdvancedImageClientGeneration(s, {
      batchPendingIds: ["a"],
      cacheStore,
      costApproval: { approved: true, reason: "explicit_user_action" },
      now: "2026-05-18T09:13:00.000Z",
      requestId: "req-a-regenerated",
      transport: t,
      userEmail: "user@example.com",
    });

    expect(regenerated.session.corrections.map((item) => [item.id, item.appliedBatchNumber])).toEqual([
      ["a", 3],
      ["b", 2],
    ]);
    expect(regenerated.plan.appliedPreserveCorrectionIds).toEqual(["b"]);
    expect(regenerated.plan.batchPendingIds).toEqual(["a"]);
  });

  it("reuses the Gemini raw cache for an identical state without a second transport call", async () => {
    const cacheStore = createAdvancedImageMemoryCacheStore();
    const t = transport();
    const logs: Array<{ hit: boolean; stateHash: string }> = [];
    const s = appendCorrection(session(), "a");
    const baseOptions = {
      cacheStore,
      costApproval: { approved: true, reason: "explicit_user_action" as const },
      batchPendingIds: ["a"],
      transport: t,
      userEmail: "user@example.com",
    };

    const first = await runAdvancedImageClientGeneration(s, {
      ...baseOptions,
      logger: (event) => logs.push(event),
      now: "2026-05-18T09:10:00.000Z",
      requestId: "req-1",
    });
    const second = await runAdvancedImageClientGeneration(s, {
      ...baseOptions,
      costApproval: { approved: true, reason: "cached_replay" },
      logger: (event) => logs.push(event),
      now: "2026-05-18T09:11:00.000Z",
      requestId: "req-2",
    });

    expect(t).toHaveBeenCalledTimes(1);
    expect(first.cacheHit).toBe(false);
    expect(second.cacheHit).toBe(true);
    expect(second.workingImage.imageUrl).toBe(first.workingImage.imageUrl);
    expect(logs.map((log) => log.hit)).toEqual([false, true]);
    expect(logs[0].stateHash).toBe(logs[1].stateHash);
  });

  it("keeps master intact and marks the current correction failed on transport errors", async () => {
    const cacheStore = createAdvancedImageMemoryCacheStore();
    const s = appendCorrection(session(), "a");
    const failingTransport: AdvancedImageGeminiTransport = vi.fn(async () => {
      throw new Error("forced adapter failure");
    });

    await expect(
      runAdvancedImageClientGeneration(s, {
        batchPendingIds: ["a"],
        cacheStore,
        costApproval: { approved: true, reason: "manual_retry" },
        now: "2026-05-18T09:10:00.000Z",
        requestId: "req-fail",
        transport: failingTransport,
        userEmail: "user@example.com",
      }),
    ).rejects.toBeInstanceOf(AdvancedImageClientGenerationError);

    try {
      await runAdvancedImageClientGeneration(s, {
        batchPendingIds: ["a"],
        cacheStore,
        costApproval: { approved: true, reason: "manual_retry" },
        now: "2026-05-18T09:10:00.000Z",
        requestId: "req-fail",
        transport: failingTransport,
        userEmail: "user@example.com",
      });
    } catch (error) {
      const next = (error as AdvancedImageClientGenerationError).session;
      expect(next.master.contentHash).toBe(master.contentHash);
      expect(next.workingImage).toBeUndefined();
      expect(next.corrections[0]).toMatchObject({
        lastGenerationError: "forced adapter failure",
        lastGenerationStatus: "failed",
      });
    }
  });

  it("clears a previous generation error after a successful retry", async () => {
    const cacheStore = createAdvancedImageMemoryCacheStore();
    const s = appendCorrection(session(), "a");
    const failingTransport: AdvancedImageGeminiTransport = vi.fn(async () => {
      throw new Error("forced adapter failure");
    });
    let failed = s;
    try {
      await runAdvancedImageClientGeneration(s, {
        batchPendingIds: ["a"],
        cacheStore,
        costApproval: { approved: true, reason: "manual_retry" },
        now: "2026-05-18T09:10:00.000Z",
        requestId: "req-fail",
        transport: failingTransport,
        userEmail: "user@example.com",
      });
    } catch (error) {
      failed = (error as AdvancedImageClientGenerationError).session;
    }

    const retried = await runAdvancedImageClientGeneration(failed, {
      batchPendingIds: ["a"],
      cacheStore,
      costApproval: { approved: true, reason: "manual_retry" },
      now: "2026-05-18T09:11:00.000Z",
      requestId: "req-retry",
      transport: transport(),
      userEmail: "user@example.com",
    });

    expect(retried.session.corrections[0].lastGenerationStatus).toBe("idle");
    expect(retried.session.corrections[0].lastGenerationError).toBeUndefined();
    expect(retried.session.master.contentHash).toBe(master.contentHash);
  });
});
