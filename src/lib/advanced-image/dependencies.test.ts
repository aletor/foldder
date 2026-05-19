import { describe, expect, it, vi } from "vitest";

import {
  addCorrection,
  createAdvancedImageSession,
  type AdvancedImageAddCorrectionInput,
  type AdvancedImageGenerationSettings,
  type AdvancedImageMaster,
  type AdvancedImageSession,
  type AdvancedImageZone,
} from "./domain";
import { createZoneFromStrokes } from "./mask";
import {
  detectAdvancedImageDependencies,
  detectGeometricDependencyCandidates,
  shouldRunSemanticDependencyDetection,
  type AdvancedImageSemanticDependencyTransport,
} from "./dependencies";

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
  height: 1000,
  id: "master-1",
  imageUrl: "/api/spaces/s3-file?key=knowledge-files/project-media/user/x/project/master.png",
  s3Key: "knowledge-files/project-media/user/x/project/master.png",
  width: 1000,
};

function session(): AdvancedImageSession {
  return createAdvancedImageSession({
    generationSettings: settings,
    id: "session-1",
    master,
    timestamp: "2026-05-18T09:00:00.000Z",
  });
}

function zone(id: string, x: number, y: number, radius = 48): AdvancedImageZone {
  return createZoneFromStrokes({
    locationDescription: `${id} zone`,
    sourceSize: { height: 1000, width: 1000 },
    strokes: [
      {
        id: `stroke-${id}`,
        points: [{ x, y }],
        radius,
      },
    ],
  });
}

function correction(id: string, inputZone: AdvancedImageZone, instruction = `Add ${id}`): AdvancedImageAddCorrectionInput {
  return {
    id,
    timestamp: "2026-05-18T09:01:00.000Z",
    userInstruction: instruction,
    zone: inputZone,
  };
}

function addBaseCorrections(): AdvancedImageSession {
  let s = addCorrection(
    session(),
    correction("dog", zone("dog", 120, 120), "Add a cream labrador on the sofa"),
    { timestamp: "2026-05-18T09:01:00.000Z" },
  );
  s = addCorrection(
    s,
    correction("lamp", zone("lamp", 760, 200), "Add a small brass lamp"),
    { timestamp: "2026-05-18T09:02:00.000Z" },
  );
  return s;
}

describe("advanced-image-dependencies", () => {
  it("detects geometric dependencies when a new zone contains a previous zone", () => {
    const s = addBaseCorrections();
    const candidates = detectGeometricDependencyCandidates(s.corrections, zone("new", 120, 120, 96));

    expect(candidates[0]).toMatchObject({
      correctionId: "dog",
      preselected: true,
      sources: ["geometric"],
    });
    expect(candidates[0].reasons.join(" ")).toContain("contains");
  });

  it("skips semantic detection when geometric candidates already exist", async () => {
    const s = addBaseCorrections();
    const semanticTransport: AdvancedImageSemanticDependencyTransport = vi.fn();

    const result = await detectAdvancedImageDependencies(
      s,
      {
        userInstruction: "Make it bigger like before",
        zone: zone("new", 120, 120, 96),
      },
      {
        semanticTransport,
      },
    );

    expect(result.candidates.map((candidate) => candidate.correctionId)).toContain("dog");
    expect(result.semantic).toMatchObject({ attempted: false, skippedReason: "geometric_candidates_found" });
    expect(semanticTransport).not.toHaveBeenCalled();
  });

  it("does not call semantic detection when the instruction is not eligible", async () => {
    const s = addBaseCorrections();
    const semanticTransport: AdvancedImageSemanticDependencyTransport = vi.fn();

    const result = await detectAdvancedImageDependencies(
      s,
      {
        userInstruction: "Add blue sky",
        zone: zone("far", 500, 800),
      },
      {
        semanticTransport,
      },
    );

    expect(result.candidates).toEqual([]);
    expect(result.issues[0]).toMatchObject({ code: "SEMANTIC_REQUEST_NOT_ELIGIBLE" });
    expect(semanticTransport).not.toHaveBeenCalled();
  });

  it("blocks semantic dependency calls without explicit approval", async () => {
    const s = addBaseCorrections();
    const semanticTransport: AdvancedImageSemanticDependencyTransport = vi.fn();

    const result = await detectAdvancedImageDependencies(
      s,
      {
        userInstruction: "Make it warmer like the previous labrador",
        zone: zone("far", 500, 800),
      },
      {
        requestId: "req-1",
        semanticTransport,
        userEmail: "user@example.com",
      },
    );

    expect(result.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "SEMANTIC_NOT_APPROVED" })]));
    expect(semanticTransport).not.toHaveBeenCalled();
  });

  it("calls the injected semantic transport once when guards and heuristic pass", async () => {
    const s = addBaseCorrections();
    const semanticTransport: AdvancedImageSemanticDependencyTransport = vi.fn(async () => ({
      dependencyIds: ["dog"],
      rationaleById: { dog: "The instruction references the previous labrador." },
    }));

    const result = await detectAdvancedImageDependencies(
      s,
      {
        userInstruction: "Make it warmer like the previous labrador",
        zone: zone("far", 500, 800),
      },
      {
        requestId: "req-2",
        semanticApproval: { approved: true, reason: "dependency_detection" },
        semanticTransport,
        userEmail: "USER@EXAMPLE.COM",
      },
    );

    expect(semanticTransport).toHaveBeenCalledTimes(1);
    expect(semanticTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        currentInstruction: "Make it warmer like the previous labrador",
        previousCorrections: expect.arrayContaining([expect.objectContaining({ id: "dog" })]),
      }),
      expect.objectContaining({ requestId: "req-2", userEmail: "user@example.com" }),
    );
    expect(result.semantic).toMatchObject({ attempted: true });
    expect(result.candidates).toEqual([
      expect.objectContaining({
        correctionId: "dog",
        preselected: true,
        sources: ["semantic"],
      }),
    ]);
  });

  it("ignores unknown semantic dependency ids and reports them", async () => {
    const s = addBaseCorrections();
    const semanticTransport: AdvancedImageSemanticDependencyTransport = vi.fn(async () => ({
      dependencyIds: ["dog", "missing"],
    }));

    const result = await detectAdvancedImageDependencies(
      s,
      {
        userInstruction: "Make it warmer like the previous labrador",
        zone: zone("far", 500, 800),
      },
      {
        requestId: "req-3",
        semanticApproval: { approved: true, reason: "dependency_detection" },
        semanticTransport,
        userEmail: "user@example.com",
      },
    );

    expect(result.candidates.map((candidate) => candidate.correctionId)).toEqual(["dog"]);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "UNKNOWN_SEMANTIC_DEPENDENCY", dependencyId: "missing" })]),
    );
  });

  it("uses only active corrections before the current correction when editing", async () => {
    let s = addBaseCorrections();
    s = addCorrection(s, correction("current", zone("current", 500, 800), "Make it match the dog"), {
      timestamp: "2026-05-18T09:03:00.000Z",
    });

    const semanticTransport: AdvancedImageSemanticDependencyTransport = vi.fn(async () => ({
      dependencyIds: ["dog", "current"],
    }));
    const result = await detectAdvancedImageDependencies(
      s,
      { currentCorrectionId: "current" },
      {
        requestId: "req-4",
        semanticApproval: { approved: true, reason: "dependency_detection" },
        semanticTransport,
        userEmail: "user@example.com",
      },
    );

    expect(semanticTransport).toHaveBeenCalledTimes(1);
    expect(result.candidates.map((candidate) => candidate.correctionId)).toEqual(["dog"]);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "UNKNOWN_SEMANTIC_DEPENDENCY", dependencyId: "current" })]),
    );
  });

  it("keeps semantic detection behind a simple reference heuristic", () => {
    const previous = [{ userInstruction: "Add a cream labrador on the sofa" }];

    expect(shouldRunSemanticDependencyDetection("Make it larger and warmer", previous)).toEqual({ eligible: true });
    expect(shouldRunSemanticDependencyDetection("Add a labrador collar", previous)).toEqual({ eligible: true });
    expect(shouldRunSemanticDependencyDetection("Blue", previous)).toMatchObject({ eligible: false });
    expect(shouldRunSemanticDependencyDetection("Add bright mountains", previous)).toMatchObject({ eligible: false });
  });
});
