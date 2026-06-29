/** Registro en sesión de LUTs creativas .cube (Pieza 2 — post-sRGB). */

import type { CubeLut3D } from "./lightroom-cube-lut";
import { parseCubeLut } from "./lightroom-cube-lut";

const luts = new Map<string, CubeLut3D>();

export function listCreativeLuts(): CubeLut3D[] {
  return [...luts.values()];
}

export function getCreativeLut(id: string | null | undefined): CubeLut3D | null {
  if (!id) return null;
  return luts.get(id) ?? null;
}

export function registerCreativeCubeFile(text: string, fileName: string): CubeLut3D {
  const lut = parseCubeLut(text, fileName);
  luts.set(lut.id, lut);
  return lut;
}
