import { describe, expect, it } from "vitest";

import {
  addCorrection,
  appendAdvancedImageHistorySnapshot,
  assignAdvancedImageAppliedBatchNumber,
  changePinMode,
  cloneCorrection,
  computeFinalImageStateHash,
  computeGeminiGenerationStateHash,
  createAdvancedImageSession,
  editCorrection,
  isAdvancedImageGlobalAdjustmentPending,
  markAdvancedImageGlobalAdjustmentApplied,
  promoteToMaster,
  removeCorrection,
  reorderCorrections,
  restoreAdvancedImageHistorySnapshot,
  setAdvancedImageWorkingImage,
  toggleCorrection,
  updateAdvancedImageGlobalAdjustment,
  undo,
  redo,
  type AdvancedImageAddCorrectionInput,
  type AdvancedImageGenerationSettings,
  type AdvancedImageMaster,
  type AdvancedImageSession,
  type AdvancedImageWorkingImage,
  type AdvancedImageZone,
} from "./domain";

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
  height: 2000,
  id: "master-1",
  imageUrl: "/api/spaces/s3-file?key=knowledge-files/project-media/user/x/project/master.png",
  s3Key: "knowledge-files/project-media/user/x/project/master.png",
  sourceModel: "manual",
  width: 3000,
};

function createSession(): AdvancedImageSession {
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
    normalizedBBox: { height: 0.06, width: 0.053333, x: 0.033333 + offset / 3000, y: 0.1 + offset / 2000 },
    sourceSize: { height: 2000, width: 3000 },
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

function correction(id: string, dependencies: string[] = []): AdvancedImageAddCorrectionInput {
  return {
    dependencies,
    id,
    identityAnchor: {
      bbox: { height: 120, width: 160, x: 100, y: 200 },
      createdAt: "2026-05-18T09:01:00.000Z",
      cropHash: `crop-${id}`,
      cropUrl: `/crop-${id}.png`,
      description: `A stable generated object for ${id}.`,
      perceptualHash: `phash-${id}`,
      sourceWorkingHash: `working-${id}`,
    },
    timestamp: "2026-05-18T09:01:00.000Z",
    userInstruction: `Add object ${id}`,
    zone: zone(id, id.length * 10),
  };
}

function workingImage(ids: string[], sourceHash = "working-hash-1"): AdvancedImageWorkingImage {
  return {
    activeCorrectionIds: ids,
    correctionSnapshots: Object.fromEntries(
      ids.map((id) => [
        id,
        {
          geometryHash: `placeholder-${id}`,
          instructionHash: `placeholder-${id}`,
        },
      ]),
    ),
    generatedAt: "2026-05-18T09:05:00.000Z",
    height: 2000,
    imageUrl: `/generated-${sourceHash}.png`,
    model: "gemini-3-pro-image-preview",
    resolution: "4k",
    sourceHash,
    width: 3000,
  };
}

describe("advanced-image-domain", () => {
  it("adds many corrections without mutating or degrading the master", () => {
    let session = createSession();
    const originalMaster = structuredClone(session.master);

    for (let index = 0; index < 12; index += 1) {
      session = addCorrection(session, correction(`c${index}`), {
        timestamp: `2026-05-18T09:${String(index + 1).padStart(2, "0")}:00.000Z`,
      });
    }

    expect(session.master).toEqual(originalMaster);
    expect(session.corrections).toHaveLength(12);
    expect(session.corrections.map((item) => item.order)).toEqual([...Array(12).keys()]);
  });

  it("undo restores the exact correction state after a revert/toggle", () => {
    const added = addCorrection(createSession(), correction("c1"), {
      timestamp: "2026-05-18T09:01:00.000Z",
    });
    const reverted = toggleCorrection(added, "c1", {
      timestamp: "2026-05-18T09:02:00.000Z",
    });

    expect(reverted.corrections[0].status).toBe("inactive");

    const restored = undo(reverted);
    expect(restored.corrections).toEqual(added.corrections);
    expect(restored.master).toEqual(added.master);
    expect(restored.redoStack).toHaveLength(1);
  });

  it("redo is symmetric with undo", () => {
    const added = addCorrection(createSession(), correction("c1"), {
      timestamp: "2026-05-18T09:01:00.000Z",
    });
    const edited = editCorrection(
      added,
      "c1",
      { userInstruction: "Replace object with the same cream labrador" },
      { timestamp: "2026-05-18T09:02:00.000Z" },
    );

    const undone = undo(edited);
    const redone = redo(undone);

    expect(undone.corrections).toEqual(added.corrections);
    expect(redone.corrections).toEqual(edited.corrections);
    expect(redone.revision).toBe(edited.revision);
  });

  it("treats missing undo/redo stacks as empty runtime state", () => {
    const stripped = createSession() as AdvancedImageSession & {
      redoStack?: unknown;
      undoStack?: unknown;
    };
    delete stripped.undoStack;
    delete stripped.redoStack;

    const added = addCorrection(stripped as AdvancedImageSession, correction("c1"), {
      timestamp: "2026-05-18T09:01:00.000Z",
    });

    expect(added.undoStack).toHaveLength(1);
    expect(added.redoStack).toEqual([]);
    expect(undo(stripped as AdvancedImageSession)).toBe(stripped);
    expect(redo(stripped as AdvancedImageSession)).toBe(stripped);
  });

  it("changing pinMode between anchor and composite does not change Gemini hash, only final-image hash", () => {
    const anchored = addCorrection(createSession(), correction("c1"), {
      timestamp: "2026-05-18T09:01:00.000Z",
    });
    const geminiHash = computeGeminiGenerationStateHash(anchored);
    const finalHash = computeFinalImageStateHash(anchored);

    const composited = changePinMode(anchored, "c1", "composite", {
      timestamp: "2026-05-18T09:02:00.000Z",
    });

    expect(computeGeminiGenerationStateHash(composited)).toBe(geminiHash);
    expect(computeFinalImageStateHash(composited)).not.toBe(finalHash);
  });

  it("changing pinMode to regenerate invalidates the Gemini hash", () => {
    const anchored = addCorrection(createSession(), correction("c1"), {
      timestamp: "2026-05-18T09:01:00.000Z",
    });
    const regenerated = changePinMode(anchored, "c1", "regenerate", {
      timestamp: "2026-05-18T09:02:00.000Z",
    });

    expect(computeGeminiGenerationStateHash(regenerated)).not.toBe(computeGeminiGenerationStateHash(anchored));
  });

  it("tracks global adjustment edits in undo and Gemini hash without treating applied status as new pixels", () => {
    const base = createSession();
    const edited = updateAdvancedImageGlobalAdjustment(base, "de noche", {
      timestamp: "2026-05-18T09:02:00.000Z",
    });
    const hashBeforeApply = computeGeminiGenerationStateHash(edited);

    expect(edited.globalAdjustment.text).toBe("de noche");
    expect(edited.globalAdjustment.status).toBe("draft");
    expect(isAdvancedImageGlobalAdjustmentPending(edited)).toBe(true);
    expect(computeGeminiGenerationStateHash(edited)).not.toBe(computeGeminiGenerationStateHash(base));

    const applied = markAdvancedImageGlobalAdjustmentApplied(edited, {
      batchNumber: 1,
      timestamp: "2026-05-18T09:03:00.000Z",
    });

    expect(applied.globalAdjustment.status).toBe("applied");
    expect(applied.globalAdjustment.appliedInBatch).toBe(1);
    expect(isAdvancedImageGlobalAdjustmentPending(applied)).toBe(false);
    expect(computeGeminiGenerationStateHash(applied)).toBe(hashBeforeApply);
    expect(undo(edited).globalAdjustment.text).toBe("");
  });

  it("deactivates dependents when reverting a dependency", () => {
    let session = addCorrection(createSession(), correction("base"), {
      timestamp: "2026-05-18T09:01:00.000Z",
    });
    session = addCorrection(session, correction("dependent", ["base"]), {
      timestamp: "2026-05-18T09:02:00.000Z",
    });

    const next = toggleCorrection(session, "base", {
      timestamp: "2026-05-18T09:03:00.000Z",
    });

    expect(next.corrections.find((item) => item.id === "base")?.status).toBe("inactive");
    expect(next.corrections.find((item) => item.id === "dependent")?.status).toBe("inactive");
  });

  it("assigns and overwrites applied batch numbers without clearing inactive corrections", () => {
    let session = addCorrection(createSession(), correction("c1"), {
      timestamp: "2026-05-18T09:01:00.000Z",
    });
    session = assignAdvancedImageAppliedBatchNumber(session, ["c1"], 1, {
      timestamp: "2026-05-18T09:02:00.000Z",
    });

    expect(session.corrections[0].appliedBatchNumber).toBe(1);

    session = toggleCorrection(session, "c1", {
      timestamp: "2026-05-18T09:03:00.000Z",
    });
    expect(session.corrections[0].status).toBe("inactive");
    expect(session.corrections[0].appliedBatchNumber).toBe(1);

    session = assignAdvancedImageAppliedBatchNumber(session, ["c1"], 3, {
      timestamp: "2026-05-18T09:04:00.000Z",
    });
    expect(session.corrections[0].appliedBatchNumber).toBe(3);
  });

  it("cleans dependencies when removing a correction", () => {
    let session = addCorrection(createSession(), correction("base"), {
      timestamp: "2026-05-18T09:01:00.000Z",
    });
    session = addCorrection(session, correction("dependent", ["base"]), {
      timestamp: "2026-05-18T09:02:00.000Z",
    });

    const next = removeCorrection(session, "base", {
      timestamp: "2026-05-18T09:03:00.000Z",
    });

    expect(next.corrections.map((item) => item.id)).toEqual(["dependent"]);
    expect(next.corrections[0].dependencies).toEqual([]);
    expect(next.corrections[0].status).toBe("inactive");
  });

  it("reorder and clone keep a contiguous order", () => {
    let session = addCorrection(createSession(), correction("a"), {
      timestamp: "2026-05-18T09:01:00.000Z",
    });
    session = addCorrection(session, correction("b"), {
      timestamp: "2026-05-18T09:02:00.000Z",
    });
    session = cloneCorrection(
      session,
      "a",
      { id: "a-copy", insertAfterId: "a", timestamp: "2026-05-18T09:03:00.000Z" },
      { timestamp: "2026-05-18T09:03:00.000Z" },
    );
    session = reorderCorrections(session, ["b", "a", "a-copy"], {
      timestamp: "2026-05-18T09:04:00.000Z",
    });

    expect(session.corrections.map((item) => [item.id, item.order])).toEqual([
      ["b", 0],
      ["a", 1],
      ["a-copy", 2],
    ]);
  });

  it("promoteToMaster archives corrections instead of deleting them forever", () => {
    const session = addCorrection(createSession(), correction("c1"), {
      timestamp: "2026-05-18T09:01:00.000Z",
    });
    const promotedMaster: AdvancedImageMaster = {
      ...master,
      contentHash: "promoted-master-hash",
      createdAt: "2026-05-18T09:05:00.000Z",
      id: "master-2",
      imageUrl: "/promoted.png",
      promotedAt: "2026-05-18T09:05:00.000Z",
      promotedFromSessionId: session.id,
    };

    const promoted = promoteToMaster(
      session,
      { archiveGroupId: "archive-1", newMaster: promotedMaster },
      { timestamp: "2026-05-18T09:05:00.000Z" },
    );

    expect(promoted.master).toEqual(promotedMaster);
    expect(promoted.corrections).toEqual([]);
    expect(promoted.archivedCorrectionGroups[0].corrections).toEqual(session.corrections);
    expect(promoted.archivedCorrectionGroups[0].sourceMaster).toEqual(master);
  });

  it("appends visual history snapshots without embedding new master pixels", () => {
    let session = addCorrection(createSession(), correction("c1"), {
      timestamp: "2026-05-18T09:01:00.000Z",
    });
    session = assignAdvancedImageAppliedBatchNumber(session, ["c1"], 1, {
      timestamp: "2026-05-18T09:02:00.000Z",
    });
    session = setAdvancedImageWorkingImage(session, workingImage(["c1"]), {
      timestamp: "2026-05-18T09:03:00.000Z",
    });

    const withHistory = appendAdvancedImageHistorySnapshot(session, {}, {
      timestamp: "2026-05-18T09:03:00.000Z",
    });

    expect(withHistory.master).toEqual(session.master);
    expect(withHistory.historySnapshots).toHaveLength(1);
    expect(withHistory.historySnapshots[0]).toMatchObject({
      activeCorrectionIds: ["c1"],
      batchNumber: 1,
      masterContentHash: master.contentHash,
      sourceHash: "working-hash-1",
    });
    expect(withHistory.historySnapshots[0].corrections).toEqual(session.corrections);
  });

  it("restores a visual history point and discards later corrections from active state", () => {
    let session = addCorrection(createSession(), correction("c1"), {
      timestamp: "2026-05-18T09:01:00.000Z",
    });
    session = assignAdvancedImageAppliedBatchNumber(session, ["c1"], 1, {
      timestamp: "2026-05-18T09:02:00.000Z",
    });
    session = setAdvancedImageWorkingImage(session, workingImage(["c1"], "batch-1"), {
      timestamp: "2026-05-18T09:03:00.000Z",
    });
    session = appendAdvancedImageHistorySnapshot(session, {}, {
      timestamp: "2026-05-18T09:03:00.000Z",
    });
    const firstSnapshotId = session.historySnapshots[0].id;

    session = addCorrection(session, correction("c2"), {
      timestamp: "2026-05-18T09:04:00.000Z",
    });
    session = assignAdvancedImageAppliedBatchNumber(session, ["c2"], 2, {
      timestamp: "2026-05-18T09:05:00.000Z",
    });
    session = setAdvancedImageWorkingImage(session, workingImage(["c1", "c2"], "batch-2"), {
      timestamp: "2026-05-18T09:06:00.000Z",
    });
    session = appendAdvancedImageHistorySnapshot(session, {}, {
      timestamp: "2026-05-18T09:06:00.000Z",
    });

    const restored = restoreAdvancedImageHistorySnapshot(session, firstSnapshotId, {
      timestamp: "2026-05-18T09:07:00.000Z",
    });

    expect(restored.corrections.map((item) => item.id)).toEqual(["c1"]);
    expect(restored.workingImage?.sourceHash).toBe("batch-1");
    expect(restored.historySnapshots).toHaveLength(1);
    expect(restored.master).toEqual(master);
    expect(restored.undoStack.at(-1)?.action).toBe("restoreHistorySnapshot");
  });
});
