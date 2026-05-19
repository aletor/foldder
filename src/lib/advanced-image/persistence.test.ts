import { describe, expect, it } from "vitest";

import {
  addCorrection,
  computeFinalImageStateHash,
  createAdvancedImageSession,
  type AdvancedImageAddCorrectionInput,
  type AdvancedImageGenerationSettings,
  type AdvancedImageMaster,
  type AdvancedImageSession,
  type AdvancedImageWorkingImage,
  type AdvancedImageZone,
} from "./domain";
import {
  computeAdvancedImageSessionPersistenceFingerprint,
  createAdvancedImageSessionSnapshot,
  estimateAdvancedImageSessionStorageBytes,
  parseAdvancedImageSessionJson,
  restoreAdvancedImageSession,
  serializeAdvancedImageSession,
  stripAdvancedImageUndoRedo,
} from "./persistence";

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
  width: 3000,
};

function session(): AdvancedImageSession {
  return createAdvancedImageSession({
    generationSettings: settings,
    id: "session-1",
    master,
    timestamp: "2026-05-18T09:00:00.000Z",
  });
}

function zone(): AdvancedImageZone {
  return {
    areaRatio: 0.01,
    bbox: { height: 120, width: 160, x: 100, y: 200 },
    locationDescription: "upper-left subject detail",
    normalizedBBox: { height: 0.06, width: 0.053333, x: 0.033333, y: 0.1 },
    sourceSize: { height: 2000, width: 3000 },
    strokes: [
      {
        id: "stroke-c1",
        points: [
          { x: 100, y: 200 },
          { x: 160, y: 250 },
        ],
        radius: 18,
      },
    ],
  };
}

function correction(): AdvancedImageAddCorrectionInput {
  return {
    id: "c1",
    timestamp: "2026-05-18T09:01:00.000Z",
    userInstruction: "Add a cream labrador sitting on the sofa",
    zone: zone(),
  };
}

function editedSession(): AdvancedImageSession {
  return addCorrection(session(), correction(), {
    timestamp: "2026-05-18T09:01:00.000Z",
  });
}

function withWorkingImage(s: AdvancedImageSession): AdvancedImageSession {
  const workingImage: AdvancedImageWorkingImage = {
    activeCorrectionIds: s.corrections.map((item) => item.id),
    generatedAt: "2026-05-18T09:02:00.000Z",
    height: 2000,
    imageUrl: "/api/spaces/s3-file?key=knowledge-files/project-media/user/x/project/working.png",
    model: settings.model,
    resolution: settings.resolution,
    sourceHash: computeFinalImageStateHash(s),
    width: 3000,
  };
  return { ...s, workingImage };
}

describe("advanced-image-persistence", () => {
  it("serializes and restores a valid session without undo history by default", () => {
    const s = editedSession();
    expect(s.undoStack).toHaveLength(1);

    const parsed = parseAdvancedImageSessionJson(serializeAdvancedImageSession(s));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.session.corrections).toEqual(s.corrections);
    expect(parsed.session.undoStack).toEqual([]);
    expect(parsed.session.redoStack).toEqual([]);
  });

  it("can include undo and redo stacks when explicitly requested", () => {
    const s = editedSession();
    const snapshot = createAdvancedImageSessionSnapshot(s, { includeUndoRedo: true });
    const parsed = parseAdvancedImageSessionJson(JSON.stringify(snapshot));

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.session.undoStack).toHaveLength(1);
  });

  it("strips undo and redo stacks without changing project content", () => {
    const s = editedSession();
    const stripped = stripAdvancedImageUndoRedo(s);

    expect(stripped.corrections).toEqual(s.corrections);
    expect(stripped.undoStack).toEqual([]);
    expect(stripped.redoStack).toEqual([]);
  });

  it("rejects invalid JSON, invalid schema and invariant violations", () => {
    expect(parseAdvancedImageSessionJson("{broken")).toMatchObject({
      issues: [expect.objectContaining({ code: "INVALID_JSON" })],
      ok: false,
    });
    expect(restoreAdvancedImageSession({ schemaVersion: "advanced_image_session_v1" })).toMatchObject({
      issues: [expect.objectContaining({ code: "INVALID_SCHEMA" })],
      ok: false,
    });

    const invalid = { ...session(), master: { ...master, imageUrl: "" } };
    expect(restoreAdvancedImageSession(invalid)).toMatchObject({
      issues: [expect.objectContaining({ code: "SESSION_INVARIANT_FAILED" })],
      ok: false,
    });
  });

  it("computes stable persistence fingerprints with explicit working/undo controls", () => {
    const s = editedSession();
    const withWorking = withWorkingImage(s);

    expect(computeAdvancedImageSessionPersistenceFingerprint(s)).not.toBe(
      computeAdvancedImageSessionPersistenceFingerprint(withWorking),
    );
    expect(computeAdvancedImageSessionPersistenceFingerprint(s, { includeWorkingImage: false })).toBe(
      computeAdvancedImageSessionPersistenceFingerprint(withWorking, { includeWorkingImage: false }),
    );
    expect(computeAdvancedImageSessionPersistenceFingerprint(s)).toBe(
      computeAdvancedImageSessionPersistenceFingerprint(stripAdvancedImageUndoRedo(s)),
    );
    expect(computeAdvancedImageSessionPersistenceFingerprint(s, { includeUndoRedo: true })).not.toBe(
      computeAdvancedImageSessionPersistenceFingerprint(stripAdvancedImageUndoRedo(s), { includeUndoRedo: true }),
    );
  });

  it("estimates serialized storage size", () => {
    expect(estimateAdvancedImageSessionStorageBytes(editedSession())).toBeGreaterThan(100);
  });
});
