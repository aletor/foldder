import { describe, expect, it } from "vitest";
import type { LayerizerOutput } from "./layerizer-types";
import { buildPhotoRoomFromLayerizerOutput } from "./layerizer-to-designer";

const sampleOutput: LayerizerOutput = {
  jobId: "job_abc",
  masterUrl: "https://example.com/master.png",
  background: { url: "https://example.com/bg.png", s3Key: "bg", w: 1200, h: 800, source: "clean_plate" },
  layers: [
    {
      id: "obj1",
      label: "Botella",
      url: "https://example.com/l1.png",
      s3Key: "l1",
      x: 100,
      y: 200,
      w: 300,
      h: 400,
      zHint: 2,
      source: "extracted",
      amodalCompleted: false,
    },
  ],
};

describe("buildPhotoRoomFromLayerizerOutput", () => {
  it("ajusta el artboard al fondo y apila capas en posición", () => {
    const result = buildPhotoRoomFromLayerizerOutput(sampleOutput, "pr_node_1");

    expect(result.studioArtboard.width).toBe(1200);
    expect(result.studioArtboard.height).toBe(800);
    expect(result._layerizerImportedJobId).toBe("job_abc");
    expect(result.studioObjects).toHaveLength(3);

    const bg = result.studioObjects.find((o) => o.id.endsWith("__bg"));
    expect(bg).toMatchObject({ x: 0, y: 0, width: 1200, height: 800 });

    const layer = result.studioObjects.find((o) => o.id.includes("__layer_obj1"));
    expect(layer).toMatchObject({ x: 100, y: 200, width: 300, height: 400 });
  });
});
