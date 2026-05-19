import { describe, expect, it, vi } from "vitest";

import {
  addCorrection,
  createAdvancedImageSession,
  type AdvancedImageAddCorrectionInput,
  type AdvancedImageGenerationSettings,
  type AdvancedImageMaster,
} from "./domain";
import { createAdvancedImageMemoryCacheStore } from "./cache";
import { createZoneFromStrokes } from "./mask";
import {
  findAdvancedImageStrongDependencyPairs,
  resolveAdvancedImageStrongDependencies,
} from "./dependency-resolution";

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
  createdAt: "2026-05-18T10:00:00.000Z",
  height: 1000,
  id: "master",
  imageUrl: "/master.png",
  width: 1000,
};

function correction(
  id: string,
  box: { h: number; w: number; x: number; y: number },
): AdvancedImageAddCorrectionInput {
  return {
    id,
    timestamp: "2026-05-18T10:01:00.000Z",
    userInstruction: id === "shoe" ? "add cream sneakers" : "change the logo on the sneakers to red",
    zone: createZoneFromStrokes({
      sourceSize: { height: 1000, width: 1000 },
      strokes: [
        {
          closed: true,
          id: `poly-${id}`,
          points: [
            { x: box.x, y: box.y },
            { x: box.x + box.w, y: box.y },
            { x: box.x + box.w, y: box.y + box.h },
            { x: box.x, y: box.y + box.h },
            { x: box.x, y: box.y },
          ],
          radius: 1,
        },
      ],
      tool: "polygon",
    }),
  };
}

function session() {
  return createAdvancedImageSession({
    generationSettings: settings,
    id: "session",
    master,
    timestamp: "2026-05-18T10:00:00.000Z",
  });
}

describe("advanced-image dependency resolution", () => {
  it("detects strong geometric dependencies for pending corrections that overlap previous corrections", () => {
    let s = addCorrection(session(), correction("shoe", { h: 220, w: 320, x: 100, y: 600 }), {
      timestamp: "2026-05-18T10:01:00.000Z",
    });
    s = addCorrection(s, correction("logo", { h: 60, w: 90, x: 210, y: 660 }), {
      timestamp: "2026-05-18T10:02:00.000Z",
    });

    const pairs = findAdvancedImageStrongDependencyPairs(s, ["logo"]);

    expect(pairs).toEqual([
      {
        dependencyId: "shoe",
        modifierId: "logo",
        reasons: ["geometric"],
      },
    ]);
  });

  it("resolves dependent instructions through the transport once and reuses the cache afterward", async () => {
    let s = addCorrection(session(), correction("shoe", { h: 220, w: 320, x: 100, y: 600 }), {
      timestamp: "2026-05-18T10:01:00.000Z",
    });
    s = addCorrection(s, correction("logo", { h: 60, w: 90, x: 210, y: 660 }), {
      timestamp: "2026-05-18T10:02:00.000Z",
    });
    const pairs = findAdvancedImageStrongDependencyPairs(s, ["logo"]);
    const cacheStore = createAdvancedImageMemoryCacheStore();
    const transport = vi.fn(async () => ({
      model: "gemini-2.5-flash",
      resolvedInstruction: "Add cream sneakers and make only their logo red.",
    }));

    const first = await resolveAdvancedImageStrongDependencies({
      cacheStore,
      now: "2026-05-18T10:03:00.000Z",
      pairs,
      requestId: "dep-req",
      session: s,
      transport,
      userEmail: "user@example.com",
    });
    const second = await resolveAdvancedImageStrongDependencies({
      cacheStore,
      now: "2026-05-18T10:04:00.000Z",
      pairs,
      requestId: "dep-req-2",
      session: s,
      transport,
      userEmail: "user@example.com",
    });

    expect(transport).toHaveBeenCalledTimes(1);
    expect(first[0]).toMatchObject({ source: "llm", resolvedInstruction: "Add cream sneakers and make only their logo red." });
    expect(second[0]).toMatchObject({ source: "cache", resolvedInstruction: "Add cream sneakers and make only their logo red." });
  });
});
