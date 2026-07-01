import { describe, expect, it } from "vitest";

import {
  findStudioCanvasPresetIdForSize,
  resolveStudioCanvasFormatDisplay,
} from "./studio-canvas-presets";

describe("studio-canvas-presets", () => {
  it("resolves preset display by stored id", () => {
    const display = resolveStudioCanvasFormatDisplay({
      width: 1280,
      height: 720,
      presetId: "yt-thumb",
    });
    expect(display.preset?.title).toBe("YouTube Thumbnail");
    expect(display.sizeLabel).toBe("1280×720px");
  });

  it("falls back to size match when preset id is missing", () => {
    expect(findStudioCanvasPresetIdForSize(1920, 1080)).toBe("web-large");
    const display = resolveStudioCanvasFormatDisplay({ width: 1920, height: 1080, presetId: null });
    expect(display.preset?.title).toBe("Web Large");
  });

  it("shows only size for custom dimensions", () => {
    const display = resolveStudioCanvasFormatDisplay({ width: 1111, height: 2222, presetId: null });
    expect(display.preset).toBeNull();
    expect(display.sizeLabel).toBe("1111×2222px");
  });
});
