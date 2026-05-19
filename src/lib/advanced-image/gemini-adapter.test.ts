import { describe, expect, it, vi } from "vitest";

import {
  addCorrection,
  createAdvancedImageSession,
  setAdvancedImageWorkingImage,
  type AdvancedImageAddCorrectionInput,
  type AdvancedImageGenerationSettings,
  type AdvancedImageIdentityAnchor,
  type AdvancedImageMaster,
  type AdvancedImageUserReferenceGrid,
} from "./domain";
import { createGeminiImageGenerateTransport, executeAdvancedImageGeminiGeneration, buildAdvancedImageGeminiPayload, AdvancedImageGeminiAdapterError } from "./gemini-adapter";
import { createZoneFromStrokes } from "./mask";
import { buildAdvancedImageGenerationPlan, type AdvancedImageGenerationPlan } from "./pipeline";

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
  contentHash: "master-hash",
  createdAt: "2026-05-18T11:00:00.000Z",
  height: 1000,
  id: "master",
  imageUrl: "/api/spaces/s3-file?key=knowledge-files%2Fmaster.png",
  s3Key: "knowledge-files/master.png",
  width: 1000,
};

function anchor(id: string): AdvancedImageIdentityAnchor {
  return {
    bbox: { height: 100, width: 100, x: 100, y: 100 },
    createdAt: "2026-05-18T11:01:00.000Z",
    cropHash: `crop-${id}`,
    cropS3Key: `knowledge-files/anchors/${id}.png`,
    cropUrl: `/api/spaces/s3-file?key=knowledge-files%2Fanchors%2F${id}.png`,
    description: `Stable identity ${id}`,
    perceptualHash: `phash-${id}`,
    sourceWorkingHash: `working-${id}`,
  };
}

function grid(id: string): AdvancedImageUserReferenceGrid {
  return {
    createdAt: "2026-05-18T11:01:00.000Z",
    gridHash: `grid-${id}`,
    gridImageUrl: `/api/spaces/s3-file?key=knowledge-files%2Fgrids%2F${id}.png`,
    gridS3Key: `knowledge-files/grids/${id}.png`,
    id: `grid-${id}`,
    sourceImageCount: 2,
  };
}

function correction(id: string, reference?: AdvancedImageUserReferenceGrid): AdvancedImageAddCorrectionInput {
  return {
    id,
    identityAnchor: anchor(id),
    timestamp: "2026-05-18T11:01:00.000Z",
    userInstruction: `Add and preserve ${id}`,
    userReference: reference,
    zone: createZoneFromStrokes({
      sourceSize: { height: 1000, width: 1000 },
      strokes: [{ id: `stroke-${id}`, points: [{ x: 100, y: 100 }], radius: 50 }],
    }),
  };
}

function markApplied(session: ReturnType<typeof createAdvancedImageSession>, ids: string[]): ReturnType<typeof createAdvancedImageSession> {
  const wanted = new Set(ids);
  return setAdvancedImageWorkingImage(
    session,
    {
      activeCorrectionIds: ids,
      correctionSnapshots: Object.fromEntries(
        session.corrections
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
      generatedAt: "2026-05-18T11:05:00.000Z",
      height: session.master.height,
      imageUrl: "/api/spaces/s3-file?key=knowledge-files%2Fgenerated%2Fworking.png",
      model: session.generationSettings.model,
      resolution: session.generationSettings.resolution,
      sourceHash: "working-source",
      width: session.master.width,
    },
    { timestamp: "2026-05-18T11:05:00.000Z" },
  );
}

function planWithCorrections(ids: string[], currentId?: string): AdvancedImageGenerationPlan {
  let session = createAdvancedImageSession({
    generationSettings: settings,
    id: "session",
    master,
    timestamp: "2026-05-18T11:00:00.000Z",
  });
  ids.forEach((id, index) => {
    session = addCorrection(session, correction(id, id === currentId ? grid(id) : undefined), {
      timestamp: `2026-05-18T11:${String(index + 1).padStart(2, "0")}:00.000Z`,
    });
  });
  if (currentId) {
    session = markApplied(session, ids.filter((id) => id !== currentId));
  }
  const result = buildAdvancedImageGenerationPlan(session, currentId ? { batchPendingIds: [currentId] } : {});
  if (!result.ok) throw new Error(result.issues[0].detail);
  return result.plan;
}

describe("advanced-image-gemini-adapter", () => {
  it("builds payload without calling any transport", () => {
    const transport = vi.fn();
    const payloadResult = buildAdvancedImageGeminiPayload(planWithCorrections(["a", "b"], "b"));

    expect(payloadResult.ok).toBe(true);
    expect(transport).not.toHaveBeenCalled();
    if (!payloadResult.ok) return;
    expect(payloadResult.payload.imageInputs).toEqual([
      master.imageUrl,
      "/api/spaces/s3-file?key=knowledge-files%2Fanchors%2Fa.png",
      "/api/spaces/s3-file?key=knowledge-files%2Fgrids%2Fb.png",
    ]);
    expect(payloadResult.payload.prompt).toContain("REFERENCE IMAGE ORDER:");
    expect(payloadResult.payload.prompt).toContain("IMAGE 1: MASTER");
    expect(payloadResult.payload.prompt).toContain("IMAGE 2: REF-ID-a");
    expect(payloadResult.payload.prompt).toContain("IMAGE 3: REF-DIR-b");
  });

  it("orders payload references as anchors, applied directions and pending directions", () => {
    let session = createAdvancedImageSession({
      generationSettings: settings,
      id: "session",
      master,
      timestamp: "2026-05-18T11:00:00.000Z",
    });
    session = addCorrection(session, correction("a", grid("a")), {
      timestamp: "2026-05-18T11:01:00.000Z",
    });
    session = addCorrection(session, correction("b", grid("b")), {
      timestamp: "2026-05-18T11:02:00.000Z",
    });
    session = addCorrection(session, correction("c", grid("c")), {
      timestamp: "2026-05-18T11:03:00.000Z",
    });
    session = markApplied(session, ["a", "b"]);
    const planResult = buildAdvancedImageGenerationPlan(session, { batchPendingIds: ["c"] });
    expect(planResult.ok).toBe(true);
    if (!planResult.ok) return;

    const payloadResult = buildAdvancedImageGeminiPayload(planResult.plan);

    expect(payloadResult.ok).toBe(true);
    if (!payloadResult.ok) return;
    expect(payloadResult.payload.imageInputs).toEqual([
      master.imageUrl,
      "/api/spaces/s3-file?key=knowledge-files%2Fanchors%2Fb.png",
      "/api/spaces/s3-file?key=knowledge-files%2Fgrids%2Fa.png",
      "/api/spaces/s3-file?key=knowledge-files%2Fgrids%2Fb.png",
      "/api/spaces/s3-file?key=knowledge-files%2Fgrids%2Fc.png",
    ]);
    expect(payloadResult.payload.prompt).toContain("IMAGE 2: REF-ID-b");
    expect(payloadResult.payload.prompt).toContain("IMAGE 3: REF-DIR-a");
    expect(payloadResult.payload.prompt).toContain("IMAGE 4: REF-DIR-b");
    expect(payloadResult.payload.prompt).toContain("IMAGE 5: REF-DIR-c");
    expect(payloadResult.payload.prompt).toContain("Original visual reference: REF-DIR-a");
    expect(payloadResult.payload.prompt).toContain("a: no image reference included due to reference limit");
  });

  it("blocks execution without explicit cost approval and does not call transport", async () => {
    const transport = vi.fn();

    await expect(
      executeAdvancedImageGeminiGeneration(planWithCorrections(["a"]), {
        costApproval: { approved: false, reason: "explicit_user_action" },
        requestId: "req-1",
        transport,
        userEmail: "user@example.com",
      }),
    ).rejects.toMatchObject({
      issues: [expect.objectContaining({ code: "COST_NOT_APPROVED" })],
    });
    expect(transport).not.toHaveBeenCalled();
  });

  it("blocks execution without requestId or userEmail and does not call transport", async () => {
    const transport = vi.fn();

    await expect(
      executeAdvancedImageGeminiGeneration(planWithCorrections(["a"]), {
        costApproval: { approved: true, reason: "explicit_user_action" },
        requestId: " ",
        transport,
        userEmail: " ",
      }),
    ).rejects.toMatchObject({
      issues: expect.arrayContaining([
        expect.objectContaining({ code: "REQUEST_ID_MISSING" }),
        expect.objectContaining({ code: "USER_MISSING" }),
      ]),
    });
    expect(transport).not.toHaveBeenCalled();
  });

  it("blocks payloads that exceed configured image input limit instead of truncating", async () => {
    const transport = vi.fn();
    const plan = planWithCorrections(["a", "b", "c", "d"], "d");

    await expect(
      executeAdvancedImageGeminiGeneration(plan, {
        costApproval: { approved: true, reason: "explicit_user_action" },
        maxImageInputs: 3,
        requestId: "req-2",
        transport,
        userEmail: "user@example.com",
      }),
    ).rejects.toMatchObject({
      issues: [expect.objectContaining({ code: "IMAGE_INPUT_LIMIT_EXCEEDED" })],
    });
    expect(transport).not.toHaveBeenCalled();
  });

  it("calls injected transport exactly once when all safety guards pass", async () => {
    const transport = vi.fn(async () => ({
      durationMs: 1200,
      key: "knowledge-files/user-assets/u/generated/out.png",
      model: "gemini-3-pro-image-preview",
      outputUrl: "/api/spaces/s3-file?key=knowledge-files%2Fuser-assets%2Fu%2Fgenerated%2Fout.png",
    }));

    const result = await executeAdvancedImageGeminiGeneration(planWithCorrections(["a"], "a"), {
      costApproval: { approved: true, reason: "explicit_user_action" },
      requestId: "req-3",
      transport,
      userEmail: "USER@EXAMPLE.COM",
    });

    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0][1]).toMatchObject({
      requestId: "req-3",
      userEmail: "user@example.com",
    });
    expect(result).toMatchObject({
      key: "knowledge-files/user-assets/u/generated/out.png",
      requestId: "req-3",
    });
  });

  it("compat transport refuses to silently truncate image inputs before calling the shared generator", async () => {
    const geminiImageGenerate = vi.fn(async () => ({
      key: "key",
      model: "model",
      output: "url",
      time: 1,
    }));
    const transport = createGeminiImageGenerateTransport({
      geminiImageGenerate,
      maxSupportedImageInputs: 2,
    });

    await expect(
      executeAdvancedImageGeminiGeneration(planWithCorrections(["a", "b"], "b"), {
        costApproval: { approved: true, reason: "explicit_user_action" },
        requestId: "req-4",
        transport,
        userEmail: "user@example.com",
      }),
    ).rejects.toBeInstanceOf(AdvancedImageGeminiAdapterError);
    expect(geminiImageGenerate).not.toHaveBeenCalled();
  });

  it("compat transport forwards user, route, prompt and all image inputs when supported", async () => {
    const geminiImageGenerate = vi.fn(async () => ({
      key: "knowledge-files/generated.png",
      model: "gemini-3-pro-image-preview",
      output: "/api/spaces/s3-file?key=knowledge-files%2Fgenerated.png",
      time: 321,
    }));
    const transport = createGeminiImageGenerateTransport({
      geminiImageGenerate,
      maxSupportedImageInputs: 4,
    });

    await executeAdvancedImageGeminiGeneration(planWithCorrections(["a", "b"], "b"), {
      costApproval: { approved: true, reason: "explicit_user_action" },
      requestId: "req-5",
      transport,
      userEmail: "user@example.com",
    });

    expect(geminiImageGenerate).toHaveBeenCalledTimes(1);
    expect(geminiImageGenerate.mock.calls[0][0]).toMatchObject({
      images: [
        master.imageUrl,
        "/api/spaces/s3-file?key=knowledge-files%2Fanchors%2Fa.png",
        "/api/spaces/s3-file?key=knowledge-files%2Fgrids%2Fb.png",
      ],
      model: "gemini-3-pro-image-preview",
      resolution: "4k",
    });
    expect(geminiImageGenerate.mock.calls[0][0].prompt).toContain("IMAGE CREATION ADVANCED");
    expect(geminiImageGenerate.mock.calls[0][2]).toMatchObject({
      usageRoute: "/api/gemini/advanced-image",
      usageUserEmail: "user@example.com",
    });
  });
});
