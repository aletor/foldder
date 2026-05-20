import { describe, expect, it, vi } from "vitest";

import {
  addCorrection,
  createAdvancedImageSession,
  editCorrection,
  setAdvancedImageWorkingImage,
  toggleCorrection,
  type AdvancedImageAddCorrectionInput,
  type AdvancedImageGenerationSettings,
  type AdvancedImageIntegrationContract,
  type AdvancedImageMaster,
  type AdvancedImageSession,
} from "./domain";
import { createZoneFromStrokes } from "./mask";
import {
  analyzeAdvancedImageCorrectionContract,
  buildAdvancedImageCorrectionContractCacheKey,
  buildAdvancedImageCorrectionMasterContextHash,
  getAdvancedImageCorrectionsNeedingIntegrationContract,
  normalizeAdvancedImageIntegrationContract,
} from "./integration-contract";

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
  createdAt: "2026-05-19T10:00:00.000Z",
  height: 1000,
  id: "master-main",
  imageUrl: "/api/spaces/s3-file?key=knowledge-files/project-media/user/a/project/master.png",
  s3Key: "knowledge-files/project-media/user/a/project/master.png",
  width: 1000,
};

function session(): AdvancedImageSession {
  return createAdvancedImageSession({
    generationSettings: settings,
    id: "session-main",
    master,
    timestamp: "2026-05-19T10:00:00.000Z",
  });
}

function contract(category: AdvancedImageIntegrationContract["category"] = "add_object"): AdvancedImageIntegrationContract {
  return {
    avoidList: ["avoid sticker appearance"],
    category,
    contract: "Match perspective, contact shadows, focus, grain and color temperature.",
    generatedAt: "2026-05-19T10:00:30.000Z",
    generatedBy: "gemini-2.5-flash",
    needsBinaryMask: category !== "environmental",
  };
}

function correction(id: string, offset = 0, integrationContract?: AdvancedImageIntegrationContract): AdvancedImageAddCorrectionInput {
  return {
    id,
    integrationContract,
    timestamp: "2026-05-19T10:01:00.000Z",
    userInstruction: `Apply ${id}`,
    zone: createZoneFromStrokes({
      sourceSize: { height: 1000, width: 1000 },
      strokes: [
        {
          id: `stroke-${id}`,
          points: [
            { x: 100 + offset, y: 100 + offset },
            { x: 180 + offset, y: 120 + offset },
            { x: 170 + offset, y: 190 + offset },
          ],
          radius: 24,
        },
      ],
    }),
  };
}

function add(base: AdvancedImageSession, input: AdvancedImageAddCorrectionInput): AdvancedImageSession {
  return addCorrection(base, input, { timestamp: "2026-05-19T10:01:00.000Z" });
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
      generatedAt: "2026-05-19T10:04:00.000Z",
      height: base.master.height,
      imageUrl: "/api/spaces/s3-file?key=knowledge-files/generated/working.png",
      model: base.generationSettings.model,
      resolution: base.generationSettings.resolution,
      sourceHash: "working-hash",
      width: base.master.width,
    },
    { timestamp: "2026-05-19T10:04:00.000Z" },
  );
}

describe("advanced-image integration contracts", () => {
  it("selects pending corrections and applied legacy corrections missing contracts", () => {
    let s = session();
    s = add(s, correction("applied-legacy", 0));
    s = add(s, correction("applied-ready", 100, contract()));
    s = add(s, correction("pending-new", 200));
    s = add(s, correction("inactive-legacy", 300));
    s = markApplied(s, ["applied-legacy", "applied-ready", "inactive-legacy"]);
    s = toggleCorrection(s, "inactive-legacy", { timestamp: "2026-05-19T10:05:00.000Z" });

    const result = getAdvancedImageCorrectionsNeedingIntegrationContract(s, ["pending-new"]);

    expect(result.map((item) => item.id)).toEqual(["pending-new", "applied-legacy"]);
  });

  it("passes masterCropUrl to the pre-analysis transport and keys cache by master crop context", async () => {
    let s = add(session(), correction("shoe"));
    const c = s.corrections[0];
    const cache = new Map<string, AdvancedImageIntegrationContract>();
    const transport = vi.fn(async () => ({ integrationContract: contract("substitute_object") }));

    const first = await analyzeAdvancedImageCorrectionContract(c, {
      cache,
      masterCropUrl: "/api/spaces/s3-file?key=knowledge-files/master-crop.jpg",
      model: "gemini-2.5-flash",
      now: "2026-05-19T10:02:00.000Z",
      session: s,
      transport,
    });
    const second = await analyzeAdvancedImageCorrectionContract(c, {
      cache,
      masterCropUrl: "/api/spaces/s3-file?key=knowledge-files/master-crop.jpg",
      model: "gemini-2.5-flash",
      now: "2026-05-19T10:03:00.000Z",
      session: s,
      transport,
    });

    expect(first.cacheHit).toBe(false);
    expect(second.cacheHit).toBe(true);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport).toHaveBeenCalledWith(expect.objectContaining({
      masterCropUrl: "/api/spaces/s3-file?key=knowledge-files/master-crop.jpg",
    }));

    const keyA = buildAdvancedImageCorrectionContractCacheKey({
      masterContextHash: buildAdvancedImageCorrectionMasterContextHash(s, c),
      userInstruction: c.userInstruction,
      userReferenceHash: c.referenceHash,
      zoneSize: "large",
    });
    s = {
      ...s,
      master: {
        ...s.master,
        contentHash: "different-master-content",
      },
    };
    const keyB = buildAdvancedImageCorrectionContractCacheKey({
      masterContextHash: buildAdvancedImageCorrectionMasterContextHash(s, c),
      userInstruction: c.userInstruction,
      userReferenceHash: c.referenceHash,
      zoneSize: "large",
    });
    expect(keyA).not.toBe(keyB);
  });

  it("invalidates integration contracts when instruction or reference content changes", () => {
    let s = add(session(), correction("shoe", 0, contract("substitute_object")));

    s = editCorrection(
      s,
      "shoe",
      { userInstruction: "Replace the pointe shoe with a black and white Nike sneaker" },
      { timestamp: "2026-05-19T10:06:00.000Z" },
    );

    expect(s.corrections[0].integrationContract).toBeUndefined();
    expect(s.corrections[0].analysisStatus).toBe("pending");
  });

  it("normalizes substitution original and target elements from pre-analysis JSON", () => {
    const normalized = normalizeAdvancedImageIntegrationContract(
      {
        AVOID_LIST: ["do not restore the original shoe"],
        CATEGORY: "substitute_object",
        INTEGRATION_CONTRACT: "Replace the existing pointe shoe with the referenced sneaker while matching pose and shadows.",
        NEEDS_BINARY_MASK: true,
        ORIGINAL_ELEMENT: "pink ballet pointe shoe on the foot",
        TARGET_ELEMENT: "black and white Nike Dunk Low sneaker",
      },
      {
        generatedAt: "2026-05-19T10:08:00.000Z",
        generatedBy: "gemini-2.5-flash",
      },
    );

    expect(normalized.category).toBe("substitute_object");
    expect(normalized.originalElement).toBe("pink ballet pointe shoe on the foot");
    expect(normalized.targetElement).toBe("black and white Nike Dunk Low sneaker");
  });
});
