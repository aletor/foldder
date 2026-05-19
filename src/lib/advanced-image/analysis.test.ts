import { describe, expect, it, vi } from "vitest";

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
  AdvancedImageAnalysisError,
  buildAdvancedImageIdentityAnalysisRequest,
  computeAdvancedImageIdentityDrift,
  executeAdvancedImageIdentityAnalysis,
  normalizeIdentityDescription,
  type AdvancedImageCropExtractor,
  type AdvancedImageIdentityDescriptionTransport,
} from "./analysis";

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

function sessionWithWorking(): AdvancedImageSession {
  const added = addCorrection(session(), correction(), {
    timestamp: "2026-05-18T09:01:00.000Z",
  });
  const workingImage: AdvancedImageWorkingImage = {
    activeCorrectionIds: added.corrections.map((item) => item.id),
    generatedAt: "2026-05-18T09:02:00.000Z",
    height: 2000,
    imageUrl: "/api/spaces/s3-file?key=knowledge-files/project-media/user/x/project/working.png",
    model: settings.model,
    resolution: settings.resolution,
    s3Key: "knowledge-files/project-media/user/x/project/working.png",
    sourceHash: computeFinalImageStateHash(added),
    width: 3000,
  };
  return { ...added, workingImage };
}

function transports() {
  const cropExtractor: AdvancedImageCropExtractor = vi.fn(async () => ({
    cropHash: "crop-hash-1",
    cropS3Key: "knowledge-files/project-media/user/x/project/crop.png",
    cropUrl: "/api/spaces/s3-file?key=knowledge-files/project-media/user/x/project/crop.png",
    height: 512,
    perceptualHash: "00110011",
    width: 768,
  }));
  const descriptionTransport: AdvancedImageIdentityDescriptionTransport = vi.fn(async () => ({
    description: "A cream labrador with soft fur, warm lighting and a calm seated posture.",
    durationMs: 123,
  }));
  return { cropExtractor, descriptionTransport };
}

describe("advanced-image-analysis", () => {
  it("builds a crop and description request from the current working image", () => {
    const s = sessionWithWorking();
    const result = buildAdvancedImageIdentityAnalysisRequest(s, "c1");

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.request.expectedWorkingHash).toBe(s.workingImage?.sourceHash);
    expect(result.request.cropRequest).toMatchObject({
      bbox: { height: 120, width: 160, x: 100, y: 200 },
      correctionId: "c1",
      imageS3Key: "knowledge-files/project-media/user/x/project/working.png",
      paddingRatio: 0.1,
      paddedBBox: { height: 144, width: 192, x: 84, y: 188 },
      targetMaxSide: 768,
    });
    expect(result.request.descriptionRequest).toMatchObject({
      correctionId: "c1",
      maxWords: 80,
      model: "gemini-2.5-flash",
      sourceWorkingHash: s.workingImage?.sourceHash,
    });
    expect(result.request.descriptionRequest.prompt).toContain("Max 80 words.");
  });

  it("blocks analysis without explicit approval before any transport runs", async () => {
    const s = sessionWithWorking();
    const { cropExtractor, descriptionTransport } = transports();

    await expect(
      executeAdvancedImageIdentityAnalysis(s, "c1", s.workingImage, {
        cropExtractor,
        descriptionTransport,
        now: "2026-05-18T09:03:00.000Z",
        requestId: "req-1",
        userEmail: "user@example.com",
      }),
    ).rejects.toMatchObject({
      issues: expect.arrayContaining([expect.objectContaining({ code: "ANALYSIS_NOT_APPROVED" })]),
    });

    expect(cropExtractor).not.toHaveBeenCalled();
    expect(descriptionTransport).not.toHaveBeenCalled();
  });

  it("blocks stale working images before any transport runs", async () => {
    const s = sessionWithWorking();
    const { cropExtractor, descriptionTransport } = transports();
    const staleWorking = { ...s.workingImage!, sourceHash: "old-working-hash" };

    await expect(
      executeAdvancedImageIdentityAnalysis(s, "c1", staleWorking, {
        analysisApproval: { approved: true, reason: "post_generation_required" },
        cropExtractor,
        descriptionTransport,
        now: "2026-05-18T09:03:00.000Z",
        requestId: "req-2",
        userEmail: "user@example.com",
      }),
    ).rejects.toMatchObject({
      issues: expect.arrayContaining([expect.objectContaining({ code: "STALE_WORKING_IMAGE" })]),
    });

    expect(cropExtractor).not.toHaveBeenCalled();
    expect(descriptionTransport).not.toHaveBeenCalled();
  });

  it("creates an identity anchor with a bounded description after guarded transports", async () => {
    const s = sessionWithWorking();
    const { cropExtractor } = transports();
    const descriptionTransport: AdvancedImageIdentityDescriptionTransport = vi.fn(async () => ({
      description: Array.from({ length: 90 }, (_, index) => `word${index + 1}`).join(" "),
      durationMs: 88,
    }));

    const result = await executeAdvancedImageIdentityAnalysis(s, "c1", s.workingImage, {
      analysisApproval: { approved: true, reason: "post_generation_required" },
      cropExtractor,
      descriptionTransport,
      now: "2026-05-18T09:03:00.000Z",
      requestId: "req-3",
      userEmail: "USER@EXAMPLE.COM",
    });

    expect(cropExtractor).toHaveBeenCalledTimes(1);
    expect(descriptionTransport).toHaveBeenCalledTimes(1);
    expect(descriptionTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        imageS3Key: "knowledge-files/project-media/user/x/project/crop.png",
        imageUrl: "/api/spaces/s3-file?key=knowledge-files/project-media/user/x/project/crop.png",
        maxWords: 80,
      }),
      expect.objectContaining({ requestId: "req-3", userEmail: "user@example.com" }),
    );
    expect(result.identityAnchor).toMatchObject({
      bbox: { height: 120, width: 160, x: 100, y: 200 },
      createdAt: "2026-05-18T09:03:00.000Z",
      cropHash: "crop-hash-1",
      perceptualHash: "00110011",
      sourceWorkingHash: s.workingImage?.sourceHash,
    });
    expect(result.identityAnchor.description.split(" ")).toHaveLength(80);
  });

  it("does not call the paid description transport if local crop extraction fails", async () => {
    const s = sessionWithWorking();
    const cropExtractor: AdvancedImageCropExtractor = vi.fn(async () => {
      throw new Error("crop failed");
    });
    const descriptionTransport: AdvancedImageIdentityDescriptionTransport = vi.fn();

    await expect(
      executeAdvancedImageIdentityAnalysis(s, "c1", s.workingImage, {
        analysisApproval: { approved: true, reason: "post_generation_required" },
        cropExtractor,
        descriptionTransport,
        now: "2026-05-18T09:03:00.000Z",
        requestId: "req-4",
        userEmail: "user@example.com",
      }),
    ).rejects.toThrow("crop failed");

    expect(descriptionTransport).not.toHaveBeenCalled();
  });

  it("reports missing corrections clearly", () => {
    const result = buildAdvancedImageIdentityAnalysisRequest(sessionWithWorking(), "missing");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0]).toMatchObject({ code: "CORRECTION_NOT_FOUND", correctionId: "missing" });
  });

  it("normalizes identity descriptions to 80 words", () => {
    const text = Array.from({ length: 95 }, (_, index) => `word${index + 1}`).join("   ");
    expect(normalizeIdentityDescription(text).split(" ")).toHaveLength(80);
  });

  it("detects perceptual drift with crop-hash fallback", () => {
    expect(
      computeAdvancedImageIdentityDrift(
        { cropHash: "same", perceptualHash: "0000" },
        { cropHash: "same", perceptualHash: "0000" },
        0.25,
      ),
    ).toMatchObject({ exceedsThreshold: false, score: 0 });

    expect(
      computeAdvancedImageIdentityDrift(
        { cropHash: "a", perceptualHash: "0000" },
        { cropHash: "b", perceptualHash: "1111" },
        0.25,
      ),
    ).toMatchObject({ exceedsThreshold: true, reason: "perceptual_hash_distance", score: 1 });

    expect(
      computeAdvancedImageIdentityDrift(
        { cropHash: "same", perceptualHash: "" },
        { cropHash: "same", perceptualHash: "1010" },
        0.25,
      ),
    ).toMatchObject({ exceedsThreshold: false, reason: "perceptual_hash_missing", score: 0 });
  });

  it("throws a typed error with all missing execution guards", async () => {
    const s = sessionWithWorking();

    await expect(executeAdvancedImageIdentityAnalysis(s, "c1", s.workingImage, {})).rejects.toBeInstanceOf(
      AdvancedImageAnalysisError,
    );
  });
});
