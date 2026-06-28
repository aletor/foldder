import { describe, expect, it } from "vitest";
import type { BezierPoint } from "../FreehandStudio";
import {
  applyPenCreationHandleDrag,
  applyVertexHandleDrag,
  getVertexMode,
  isCollapsedBezierHandle,
  normalizeBezierPointForVertexMode,
} from "./bezier-point";

function pt(extra?: Partial<BezierPoint>): BezierPoint {
  return {
    anchor: { x: 0, y: 0 },
    handleIn: { x: -10, y: 0 },
    handleOut: { x: 10, y: 0 },
    ...extra,
  };
}

describe("bezier-point", () => {
  it("isCollapsedBezierHandle detecta un tirador pegado al anclaje", () => {
    expect(isCollapsedBezierHandle({ x: 0, y: 0 }, { x: 0, y: 0 })).toBe(true);
    expect(isCollapsedBezierHandle({ x: 0, y: 0 }, { x: 5, y: 0 })).toBe(false);
  });

  it("getVertexMode prioriza cornerMode, luego vertexMode, tiradores colapsados y por defecto smooth", () => {
    expect(getVertexMode(pt({ cornerMode: true }))).toBe("corner");
    expect(getVertexMode(pt({ vertexMode: "cusp" }))).toBe("cusp");
    // Tirador colapsado → corner aunque no haya flag.
    expect(getVertexMode(pt({ handleIn: { x: 0, y: 0 } }))).toBe("corner");
    expect(getVertexMode(pt())).toBe("smooth");
  });

  it("applyVertexHandleDrag smooth mantiene tiradores simétricos respecto al anclaje", () => {
    const out = applyVertexHandleDrag(pt({ vertexMode: "smooth" }), "handleOut", { x: 4, y: 6 });
    expect(out.handleOut).toEqual({ x: 4, y: 6 });
    expect(out.handleIn).toEqual({ x: -4, y: -6 });
  });

  it("applyVertexHandleDrag corner mueve solo el tirador arrastrado", () => {
    const out = applyVertexHandleDrag(pt({ cornerMode: true }), "handleOut", { x: 4, y: 6 });
    expect(out.handleOut).toEqual({ x: 4, y: 6 });
    expect(out.handleIn).toEqual({ x: -10, y: 0 });
  });

  it("applyPenCreationHandleDrag refleja handleIn y marca smooth", () => {
    const out = applyPenCreationHandleDrag(pt(), { x: 8, y: 2 });
    expect(out.handleOut).toEqual({ x: 8, y: 2 });
    expect(out.handleIn).toEqual({ x: -8, y: -2 });
    expect(out.vertexMode).toBe("smooth");
    expect(out.cornerMode).toBe(false);
  });

  it("normalizeBezierPointForVertexMode corner marca cornerMode sin tocar tiradores", () => {
    const out = normalizeBezierPointForVertexMode(pt(), "corner");
    expect(out.vertexMode).toBe("corner");
    expect(out.cornerMode).toBe(true);
  });
});
