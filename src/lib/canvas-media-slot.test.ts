import { describe, expect, it } from "vitest";
import {
  acquireCanvasMediaSlot,
  CANVAS_MEDIA_SLOT_LIMIT,
  resetCanvasMediaSlotsForTests,
} from "@/lib/canvas-media-slot";

describe("canvas media slots", () => {
  it("lets only a handful of images start at once", async () => {
    resetCanvasMediaSlotsForTests();
    const releases = await Promise.all(
      Array.from({ length: CANVAS_MEDIA_SLOT_LIMIT }, () => acquireCanvasMediaSlot()),
    );
    let seventhStarted = false;
    const seventh = acquireCanvasMediaSlot().then((release) => {
      seventhStarted = true;
      release();
    });
    await Promise.resolve();
    expect(seventhStarted).toBe(false);
    releases[0]();
    await seventh;
    expect(seventhStarted).toBe(true);
    for (const release of releases.slice(1)) release();
  });
});
