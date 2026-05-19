import { describe, expect, it } from "vitest";

import {
  canvasToMasterPoint,
  computeContainedImageRect,
  masterToCanvasPoint,
} from "./canvas-coordinate";
import {
  addCorrection,
  createAdvancedImageSession,
  type AdvancedImageGenerationSettings,
  type AdvancedImageMaster,
  type AdvancedImagePoint,
  type AdvancedImageSession,
} from "./domain";
import { createZoneFromStrokes } from "./mask";
import { parseAdvancedImageSessionJson, serializeAdvancedImageSession } from "./persistence";

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
  contentHash: "master-hash-drawing",
  createdAt: "2026-05-18T11:00:00.000Z",
  height: 1200,
  id: "master-drawing",
  imageUrl: "/api/spaces/s3-file?key=knowledge-files/project-media/user/x/project/master.png",
  sourceResolution: "1600x1200",
  width: 1600,
};

function session(): AdvancedImageSession {
  return createAdvancedImageSession({
    generationSettings: settings,
    id: "session-drawing",
    master,
    timestamp: "2026-05-18T11:00:00.000Z",
  });
}

function lassoFromCanvas(points: AdvancedImagePoint[], container: { height: number; width: number }): AdvancedImagePoint[] {
  const rendered = computeContainedImageRect(container, master);
  return points.map((point) => canvasToMasterPoint(point, rendered, master));
}

function addLassoCorrection(
  s: AdvancedImageSession,
  id: string,
  points: AdvancedImagePoint[],
): AdvancedImageSession {
  const timestamp = `2026-05-18T11:0${s.corrections.length + 1}:00.000Z`;
  const zone = createZoneFromStrokes({
    sourceSize: { height: s.master.height, width: s.master.width },
    strokes: [
      {
        closed: true,
        id: `lasso-${id}`,
        points: [...points, points[0]],
        radius: 1.5,
      },
    ],
  });
  return addCorrection(
    s,
    {
      id,
      timestamp,
      userInstruction: `Placeholder ${id}`,
      zone,
    },
    { timestamp },
  );
}

describe("advanced-image drawing persistence", () => {
  it("restores two freehand zones in master coordinates and reprojects them after resize", () => {
    const initialContainer = { height: 700, width: 1100 };
    const resizedContainer = { height: 360, width: 900 };
    const firstCanvasLasso = [
      { x: 380, y: 160 },
      { x: 520, y: 150 },
      { x: 590, y: 230 },
      { x: 500, y: 320 },
      { x: 370, y: 280 },
    ];
    const secondCanvasLasso = [
      { x: 660, y: 390 },
      { x: 840, y: 370 },
      { x: 900, y: 500 },
      { x: 760, y: 610 },
      { x: 630, y: 520 },
    ];

    let s = session();
    s = addLassoCorrection(s, "c1", lassoFromCanvas(firstCanvasLasso, initialContainer));
    s = addLassoCorrection(s, "c2", lassoFromCanvas(secondCanvasLasso, initialContainer));

    const serialized = serializeAdvancedImageSession(s, { includeUndoRedo: true });
    const parsed = parseAdvancedImageSessionJson(serialized);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const restored = parsed.session;
    expect(restored.corrections).toHaveLength(2);
    expect(restored.corrections.map((correction) => correction.zone.sourceSize)).toEqual([
      { height: master.height, width: master.width },
      { height: master.height, width: master.width },
    ]);
    expect(restored.corrections[0].zone.strokes[0].points).toEqual(s.corrections[0].zone.strokes[0].points);
    expect(restored.corrections[1].zone.strokes[0].points).toEqual(s.corrections[1].zone.strokes[0].points);

    const firstMasterPoint = restored.corrections[0].zone.strokes[0].points[0];
    const initialRendered = computeContainedImageRect(initialContainer, master);
    const resizedRendered = computeContainedImageRect(resizedContainer, master);
    const initialCanvasPoint = masterToCanvasPoint(firstMasterPoint, initialRendered, master);
    const resizedCanvasPoint = masterToCanvasPoint(firstMasterPoint, resizedRendered, master);

    expect(initialCanvasPoint).not.toEqual(resizedCanvasPoint);
    expect(canvasToMasterPoint(initialCanvasPoint, initialRendered, master)).toEqual(firstMasterPoint);
    expect(canvasToMasterPoint(resizedCanvasPoint, resizedRendered, master)).toEqual(firstMasterPoint);
  });
});
