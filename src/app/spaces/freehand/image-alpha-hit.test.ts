import { describe, expect, it } from "vitest";
import {
  ALPHA_HIT_THRESHOLD,
  sampleAlphaAtNaturalPixel,
  type ImageAlphaEntry,
} from "./image-alpha-hit";

function readyEntry(): Extract<ImageAlphaEntry, { status: "ready" }> {
  // Mapa 2×2: esquina (0,0) opaca, resto transparente.
  const alpha = new Uint8Array([255, 0, 0, 0]);
  return { status: "ready", natW: 4, natH: 4, aw: 2, ah: 2, alpha };
}

describe("sampleAlphaAtNaturalPixel", () => {
  it("mapea coords naturales al mapa reducido", () => {
    const e = readyEntry();
    // (0,0)..(1,1) natural → celda (0,0) del mapa 2×2 (opaca)
    expect(sampleAlphaAtNaturalPixel(e, 0, 0)).toBe(255);
    expect(sampleAlphaAtNaturalPixel(e, 1, 1)).toBe(255);
    // (3,3) natural → celda (1,1) del mapa (transparente)
    expect(sampleAlphaAtNaturalPixel(e, 3, 3)).toBe(0);
    // (3,0) natural → celda (1,0) transparente
    expect(sampleAlphaAtNaturalPixel(e, 3, 0)).toBe(0);
  });

  it("devuelve 0 fuera del bitmap (letterbox / margen)", () => {
    const e = readyEntry();
    expect(sampleAlphaAtNaturalPixel(e, -1, 0)).toBe(0);
    expect(sampleAlphaAtNaturalPixel(e, 4, 0)).toBe(0);
    expect(sampleAlphaAtNaturalPixel(e, 0, 99)).toBe(0);
  });

  it("el umbral distingue opaco de transparente", () => {
    const e = readyEntry();
    expect(sampleAlphaAtNaturalPixel(e, 0, 0) > ALPHA_HIT_THRESHOLD).toBe(true);
    expect(sampleAlphaAtNaturalPixel(e, 3, 3) > ALPHA_HIT_THRESHOLD).toBe(false);
  });
});
