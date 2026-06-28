import { describe, expect, it, beforeEach } from "vitest";
import {
  getCanvasAnimatedEdgesEnabledSnapshot,
  readCanvasAnimatedEdgesEnabled,
  resetCanvasAnimatedEdgesPreferenceForTests,
  writeCanvasAnimatedEdgesEnabled,
} from "./canvas-animated-edges-preference";

describe("canvas-animated-edges-preference", () => {
  beforeEach(() => {
    resetCanvasAnimatedEdgesPreferenceForTests();
  });

  it("defaults to animated edges enabled", () => {
    expect(readCanvasAnimatedEdgesEnabled()).toBe(true);
    expect(getCanvasAnimatedEdgesEnabledSnapshot()).toBe(true);
  });

  it("persists disabled state", () => {
    writeCanvasAnimatedEdgesEnabled(false);
    expect(readCanvasAnimatedEdgesEnabled()).toBe(false);
    writeCanvasAnimatedEdgesEnabled(true);
    expect(readCanvasAnimatedEdgesEnabled()).toBe(true);
  });
});
