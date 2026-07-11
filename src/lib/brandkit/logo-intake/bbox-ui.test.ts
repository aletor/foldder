import { describe, expect, it } from "vitest";
import {
  bboxAreaDelta,
  bboxPageToPixel,
  moveBBoxPage,
  normalizeBBoxPage,
  pixelRectToBBoxPage,
  resizeBBoxPage,
} from "@/lib/brandkit/logo-intake/bbox-ui";

describe("bbox-ui", () => {
  it("normaliza y convierte bbox page ↔ pixel", () => {
    const bbox = normalizeBBoxPage([0.2, 0.1, 0.6, 0.4]);
    expect(bbox).toEqual([0.2, 0.1, 0.6, 0.4]);
    const px = bboxPageToPixel(bbox, 2048, 1024);
    expect(px.left).toBe(410);
    expect(px.top).toBe(102);
    expect(px.width).toBe(819);
    expect(px.height).toBe(307);
    const back = pixelRectToBBoxPage(px.left, px.top, px.width, px.height, 2048, 1024);
    expect(back[0]).toBeCloseTo(0.2, 2);
    expect(back[1]).toBeCloseTo(0.1, 2);
  });

  it("mueve bbox manteniendo tamaño", () => {
    const moved = moveBBoxPage([0.1, 0.1, 0.3, 0.3], 0.05, 0.02);
    expect(moved[2] - moved[0]).toBeCloseTo(0.2, 5);
    expect(moved[0]).toBeCloseTo(0.15, 5);
    expect(moved[1]).toBeCloseTo(0.12, 5);
  });

  it("redimensiona con handle este", () => {
    const orig: [number, number, number, number] = [0.2, 0.2, 0.5, 0.5];
    const anchor = [...orig] as [number, number, number, number];
    const resized = resizeBBoxPage(orig, "e", { x: 0.7, y: 0.35 }, anchor);
    expect(resized[2]).toBeCloseTo(0.7, 5);
    expect(resized[0]).toBeCloseTo(0.2, 5);
  });

  it("calcula delta de área relativo", () => {
    expect(bboxAreaDelta([0, 0, 0.5, 0.5], [0, 0, 0.6, 0.5])).toBeCloseTo(0.2, 3);
    expect(bboxAreaDelta([0, 0, 0, 0], [0, 0, 0.5, 0.5])).toBe(0);
  });
});
