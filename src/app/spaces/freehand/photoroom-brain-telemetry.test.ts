import { describe, expect, it, vi } from "vitest";
import type { FreehandObject } from "../FreehandStudio";
import {
  buildPhotoroomExportSummaryFromObjects,
  emitPhotoroomExportToBrain,
  trackPhotoroomImageImported,
} from "./photoroom-brain-telemetry";
import type { BrainNodeTelemetryApi } from "@/lib/brain/brain-telemetry";

describe("photo-room-brain-telemetry", () => {
  it("IMAGE_IMPORTED incluye canvasObjectId y payload photoroom", () => {
    const track = vi.fn();
    trackPhotoroomImageImported(track, {
      source: "USER_UPLOAD",
      canvasObjectId: "img-1",
      fileName: "a.png",
      mimeType: "image/png",
      imageWidth: 100,
      imageHeight: 80,
    });
    expect(track).toHaveBeenCalledTimes(1);
    const ev = track.mock.calls[0]![0] as { kind: string; canvasObjectId?: string; photoroom?: unknown };
    expect(ev.kind).toBe("IMAGE_IMPORTED");
    expect(ev.canvasObjectId).toBe("img-1");
    expect(ev.photoroom).toEqual({ visualHints: {} });
  });

  it("buildPhotoroomExportSummaryFromObjects cuenta capas visibles, máscaras e imágenes", () => {
    const objects = [
      { id: "1", type: "image", visible: true, width: 10, height: 10 } as unknown as FreehandObject,
      { id: "2", type: "rect", visible: true, layerMask: { src: "x", pixelW: 1, pixelH: 1, enabled: true, inverted: false } } as unknown as FreehandObject,
    ];
    const s = buildPhotoroomExportSummaryFromObjects(objects, "png", 1920, 1080);
    expect(s.exportFormat).toBe("png");
    expect(s.exportWidth).toBe(1920);
    expect(s.exportHeight).toBe(1080);
    expect(s.layersCount).toBe(2);
    expect(s.masksCount).toBe(1);
    expect(s.imagesUsed).toBe(1);
  });

  it("emitPhotoroomExportToBrain emite IMAGE_EXPORTED + CONTENT_EXPORTED y hace flush export", async () => {
    const track = vi.fn();
    const flushTelemetry = vi.fn(async () => {});
    const api: BrainNodeTelemetryApi = {
      nodeType: "PHOTOROOM",
      track,
      flushTelemetry,
    };
    const objects: FreehandObject[] = [];
    await emitPhotoroomExportToBrain(api, objects, { exportFormat: "png", width: 400, height: 300 });
    const kinds = track.mock.calls.map((c) => (c[0] as { kind: string }).kind);
    expect(kinds).toEqual(["IMAGE_EXPORTED", "CONTENT_EXPORTED"]);
    expect(flushTelemetry).toHaveBeenCalledWith("export");
  });
});
