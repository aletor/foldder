import { describe, expect, it } from "vitest";
import {
  clampCanvasThumbMaxSide,
  FOLDDER_CANVAS_THUMB_MAX_SIDE,
  parseCanvasThumbMaxSideParam,
  resolveCanvasThumbnailMediaUrl,
  resolveFullQualityMediaUrl,
  stableKnowledgeFileThumbnailUrlFromKey,
} from "@/lib/canvas-media-thumbnail";

describe("canvas-media-thumbnail", () => {
  const key = "knowledge-files/user-assets/abc/out.png";

  it("builds thumbnail URL with thumb query param", () => {
    const url = stableKnowledgeFileThumbnailUrlFromKey(key);
    expect(url).toBe(`/api/spaces/s3-file?key=${encodeURIComponent(key)}&thumb=${FOLDDER_CANVAS_THUMB_MAX_SIDE}`);
  });

  it("clamps thumb max side", () => {
    expect(clampCanvasThumbMaxSide(32)).toBe(64);
    expect(clampCanvasThumbMaxSide(960)).toBe(960);
    expect(clampCanvasThumbMaxSide(4096)).toBe(2048);
  });

  it("parses thumb query param safely", () => {
    expect(parseCanvasThumbMaxSideParam("960")).toBe(960);
    expect(parseCanvasThumbMaxSideParam("63")).toBeNull();
    expect(parseCanvasThumbMaxSideParam("2049")).toBeNull();
    expect(parseCanvasThumbMaxSideParam("")).toBeNull();
  });

  it("resolves canvas vs full URLs from s3 key", () => {
    const full = resolveFullQualityMediaUrl(null, key);
    const thumb = resolveCanvasThumbnailMediaUrl(null, key);
    expect(full).toBe(`/api/spaces/s3-file?key=${encodeURIComponent(key)}`);
    expect(thumb).toBe(`${full}&thumb=${FOLDDER_CANVAS_THUMB_MAX_SIDE}`);
  });

  it("preserves data URLs for client-side thumbnail path", () => {
    const dataUrl = "data:image/png;base64,abc";
    expect(resolveCanvasThumbnailMediaUrl(dataUrl)).toBe(dataUrl);
    expect(resolveFullQualityMediaUrl(dataUrl)).toBe(dataUrl);
  });
});
