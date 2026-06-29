import { describe, expect, it } from "vitest";
import { createArtboard } from "./artboard";
import { resolveEffectLayerFxBounds } from "./effect-layer-utils";

describe("resolveEffectLayerFxBounds", () => {
  const artboards = [
    createArtboard({ x: 0, y: 0, width: 800, height: 600, background: "#fff" }),
  ];

  it("wholeStack usa el artboard actual aunque la capa tenga tamaño antiguo", () => {
    const bounds = resolveEffectLayerFxBounds(
      {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
        effectScope: "wholeStack",
        adjustment: { brightness: 0, contrast: 0, saturation: 0, levels: { black: 0, white: 255, gamma: 1 } },
      },
      { x: 100, y: 100, w: 50, h: 50 },
      artboards,
    );
    expect(bounds).toEqual({ x: 0, y: 0, w: 800, h: 600 });
  });

  it("belowSelection usa contentBounds", () => {
    const content = { x: 120, y: 80, w: 240, h: 160 };
    const bounds = resolveEffectLayerFxBounds(
      {
        x: 0,
        y: 0,
        width: 800,
        height: 600,
        effectScope: "belowSelection",
        adjustment: { brightness: 0, contrast: 0, saturation: 0, levels: { black: 0, white: 255, gamma: 1 } },
      },
      content,
      artboards,
    );
    expect(bounds).toEqual(content);
  });

  it("selectedFolder usa contentBounds de la carpeta", () => {
    const content = { x: 40, y: 60, w: 320, h: 200 };
    const bounds = resolveEffectLayerFxBounds(
      {
        x: 10,
        y: 20,
        width: 400,
        height: 300,
        effectScope: "selectedFolder",
        effectTargetFolderId: "folder-1",
        adjustment: { brightness: 0, contrast: 0, saturation: 0, levels: { black: 0, white: 255, gamma: 1 } },
      },
      content,
      artboards,
    );
    expect(bounds).toEqual(content);
  });

  it("selectedLayer usa contentBounds de la capa", () => {
    const content = { x: 12, y: 34, w: 88, h: 44 };
    const bounds = resolveEffectLayerFxBounds(
      {
        x: 0,
        y: 0,
        width: 800,
        height: 600,
        effectScope: "selectedLayer",
        effectTargetLayerId: "layer-1",
        adjustment: { brightness: 0, contrast: 0, saturation: 0, levels: { black: 0, white: 255, gamma: 1 } },
      },
      content,
      artboards,
    );
    expect(bounds).toEqual(content);
  });
});
