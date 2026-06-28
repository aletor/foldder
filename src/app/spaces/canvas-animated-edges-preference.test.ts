import { describe, expect, it, beforeEach } from "vitest";
import {
  getCanvasAnimatedEdgesEnabledSnapshot,
  getCanvasEdgeLineModeSnapshot,
  readCanvasAnimatedEdgesEnabled,
  readCanvasEdgeLineMode,
  resetCanvasEdgeLinePreferenceForTests,
  writeCanvasAnimatedEdgesEnabled,
  writeCanvasEdgeLineMode,
} from "./canvas-animated-edges-preference";

describe("canvas-edge-line-mode-preference", () => {
  beforeEach(() => {
    resetCanvasEdgeLinePreferenceForTests();
  });

  it("defaults to animated", () => {
    expect(readCanvasEdgeLineMode()).toBe("animated");
    expect(getCanvasEdgeLineModeSnapshot()).toBe("animated");
  });

  it("persists each of the three modes", () => {
    writeCanvasEdgeLineMode("basic");
    expect(readCanvasEdgeLineMode()).toBe("basic");
    writeCanvasEdgeLineMode("none");
    expect(readCanvasEdgeLineMode()).toBe("none");
    writeCanvasEdgeLineMode("animated");
    expect(readCanvasEdgeLineMode()).toBe("animated");
  });

  it("migrates the legacy boolean storage values", () => {
    window.localStorage.setItem("foldder-canvas-animated-edges", "1");
    expect(readCanvasEdgeLineMode()).toBe("animated");
    window.localStorage.setItem("foldder-canvas-animated-edges", "0");
    expect(readCanvasEdgeLineMode()).toBe("basic");
  });

  it("keeps the boolean compatibility API (enabled === animated)", () => {
    expect(readCanvasAnimatedEdgesEnabled()).toBe(true);
    expect(getCanvasAnimatedEdgesEnabledSnapshot()).toBe(true);

    writeCanvasAnimatedEdgesEnabled(false);
    expect(readCanvasEdgeLineMode()).toBe("basic");
    expect(readCanvasAnimatedEdgesEnabled()).toBe(false);

    writeCanvasEdgeLineMode("none");
    expect(readCanvasAnimatedEdgesEnabled()).toBe(false);
  });
});
