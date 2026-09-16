import { describe, expect, it } from "vitest";
import {
  applyFrameHandleDelta,
  clampFramePad,
  expandAspectToken,
  frameFromPad,
  hasCropPad,
  hasExpandPad,
  pickGeminiContainingRatio,
  resolveStudioGenerateAspect,
  STUDIO_FRAME_MIN_SIDE,
  translateCardsForCrop,
  translateCardsForExpand,
  ZERO_FRAME_PAD,
} from "./studio-frame-adjust";
import { createStudioCard } from "./studio-types";

describe("studio-frame-adjust", () => {
  it("frameFromPad coloca la foto y calcula el lienzo", () => {
    const layout = frameFromPad(1000, 600, { left: 80, top: 0, right: 120, bottom: 40 });
    expect(layout).toMatchObject({
      canvasW: 1200,
      canvasH: 640,
      photoX: 80,
      photoY: 0,
      photoW: 1000,
      photoH: 600,
      srcX: 0,
      srcY: 0,
      srcW: 1000,
      srcH: 600,
    });
  });

  it("frameFromPad recorta hacia dentro", () => {
    const layout = frameFromPad(1000, 600, { left: -100, top: -20, right: -50, bottom: 0 });
    expect(layout.srcX).toBe(100);
    expect(layout.srcY).toBe(20);
    expect(layout.srcW).toBe(850);
    expect(layout.srcH).toBe(580);
    expect(layout.canvasW).toBe(850);
    expect(layout.canvasH).toBe(580);
    expect(layout.photoX).toBe(0);
    expect(layout.photoY).toBe(0);
  });

  it("arrastrar el borde derecho hacia fuera amplía; hacia dentro recorta", () => {
    const expanded = applyFrameHandleDelta(ZERO_FRAME_PAD, "e", 40, 0);
    expect(expanded.right).toBe(40);
    expect(hasExpandPad(expanded)).toBe(true);
    const cropped = applyFrameHandleDelta(ZERO_FRAME_PAD, "e", -30, 0);
    expect(cropped.right).toBe(-30);
    expect(hasCropPad(cropped)).toBe(true);
  });

  it("Shift duplica el lado opuesto", () => {
    const next = applyFrameHandleDelta(ZERO_FRAME_PAD, "e", 50, 0, { symmetric: true });
    expect(next.left).toBe(50);
    expect(next.right).toBe(50);
  });

  it("clamp impide dejar la foto por debajo del mínimo", () => {
    const clamped = clampFramePad(200, 200, { left: -180, top: 0, right: -180, bottom: 0 });
    const layout = frameFromPad(200, 200, clamped);
    expect(layout.srcW).toBeGreaterThanOrEqual(STUDIO_FRAME_MIN_SIDE);
  });

  it("elige un ratio Gemini que contiene el lienzo", () => {
    const picked = pickGeminiContainingRatio(1920, 1080);
    expect(picked.ratio).toBe("16:9");
    expect(picked.extraFraction).toBeLessThan(0.02);
    const wide = pickGeminiContainingRatio(3000, 1000);
    expect(["3:1", "4:1", "8:1", "21:9"]).toContain(wide.ratio);
  });

  it("translateCards desplaza lazos al recortar y al ampliar", () => {
    const card = { ...createStudioCard(0), lassoPoints: [{ x: 120, y: 80 }] };
    const cropped = translateCardsForCrop([card], frameFromPad(400, 300, { left: -40, top: -10, right: 0, bottom: 0 }));
    expect(cropped[0]!.lassoPoints[0]).toEqual({ x: 80, y: 70 });
    const expanded = translateCardsForExpand(cropped, { left: 15, top: 5, right: 0, bottom: 0 });
    expect(expanded[0]!.lassoPoints[0]).toEqual({ x: 95, y: 75 });
  });

  it("resolveStudioGenerateAspect usa píxeles reales en ChatGPT y un ratio Gemini que contiene el lienzo", () => {
    expect(resolveStudioGenerateAspect({ width: 1920, height: 1440, provider: "openai" })).toBe("1920:1440");
    expect(resolveStudioGenerateAspect({ width: 1920, height: 1440, provider: "gemini" })).toBe("4:3");
  });

  it("expandAspectToken usa el tamaño del lienzo", () => {
    expect(expandAspectToken(frameFromPad(100, 50, { left: 0, top: 0, right: 50, bottom: 0 }))).toBe("150:50");
  });
});
