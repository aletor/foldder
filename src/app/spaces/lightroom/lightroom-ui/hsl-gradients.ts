/** Gradientes CSS para tracks de SliderConGradiente. */

import type { HslColorChannel } from "../lightroom-develop-settings";

export const TEMP_GRADIENT = "linear-gradient(to right, #4a90d9, #f5f5dc, #ffd54a)";
export const TINT_GRADIENT = "linear-gradient(to right, #6bcb77, #f5f5f5, #e879f9)";
export const SATURATION_GRADIENT = "linear-gradient(to right, #808080, #ff3366)";

const HSL_HUE: Record<HslColorChannel, string> = {
  red: "linear-gradient(to right, hsl(30,90%,50%), hsl(0,90%,50%), hsl(330,90%,50%))",
  orange: "linear-gradient(to right, hsl(45,90%,50%), hsl(25,90%,50%), hsl(5,90%,50%))",
  yellow: "linear-gradient(to right, hsl(60,90%,50%), hsl(48,90%,50%), hsl(36,90%,50%))",
  green: "linear-gradient(to right, hsl(150,90%,45%), hsl(120,90%,45%), hsl(90,90%,45%))",
  aqua: "linear-gradient(to right, hsl(195,90%,45%), hsl(180,90%,45%), hsl(165,90%,45%))",
  blue: "linear-gradient(to right, hsl(225,90%,50%), hsl(210,90%,50%), hsl(195,90%,50%))",
  purple: "linear-gradient(to right, hsl(285,70%,50%), hsl(270,70%,50%), hsl(255,70%,50%))",
  magenta: "linear-gradient(to right, hsl(330,80%,55%), hsl(300,80%,55%), hsl(270,80%,55%))",
};

const HSL_SAT: Record<HslColorChannel, string> = {
  red: "linear-gradient(to right, #888, hsl(0,100%,50%))",
  orange: "linear-gradient(to right, #888, hsl(25,100%,50%))",
  yellow: "linear-gradient(to right, #888, hsl(48,100%,50%))",
  green: "linear-gradient(to right, #888, hsl(120,100%,40%))",
  aqua: "linear-gradient(to right, #888, hsl(180,100%,40%))",
  blue: "linear-gradient(to right, #888, hsl(210,100%,50%))",
  purple: "linear-gradient(to right, #888, hsl(270,80%,55%))",
  magenta: "linear-gradient(to right, #888, hsl(300,100%,50%))",
};

const HSL_LUM: Record<HslColorChannel, string> = {
  red: "linear-gradient(to right, hsl(0,80%,15%), hsl(0,80%,50%), hsl(0,80%,85%))",
  orange: "linear-gradient(to right, hsl(25,80%,15%), hsl(25,80%,50%), hsl(25,80%,85%))",
  yellow: "linear-gradient(to right, hsl(48,80%,15%), hsl(48,80%,50%), hsl(48,80%,85%))",
  green: "linear-gradient(to right, hsl(120,60%,12%), hsl(120,60%,40%), hsl(120,60%,75%))",
  aqua: "linear-gradient(to right, hsl(180,60%,12%), hsl(180,60%,40%), hsl(180,60%,75%))",
  blue: "linear-gradient(to right, hsl(210,70%,15%), hsl(210,70%,50%), hsl(210,70%,85%))",
  purple: "linear-gradient(to right, hsl(270,50%,15%), hsl(270,50%,50%), hsl(270,50%,85%))",
  magenta: "linear-gradient(to right, hsl(300,60%,15%), hsl(300,60%,50%), hsl(300,60%,85%))",
};

export const HSL_SWATCH: Record<HslColorChannel, string> = {
  red: "hsl(0, 75%, 50%)",
  orange: "hsl(25, 85%, 52%)",
  yellow: "hsl(48, 90%, 52%)",
  green: "hsl(120, 55%, 42%)",
  aqua: "hsl(180, 60%, 45%)",
  blue: "hsl(210, 75%, 52%)",
  purple: "hsl(270, 55%, 55%)",
  magenta: "hsl(300, 70%, 52%)",
};

export function hslTrackGradient(channel: HslColorChannel, kind: "hue" | "saturation" | "luminance"): string {
  if (kind === "hue") return HSL_HUE[channel];
  if (kind === "saturation") return HSL_SAT[channel];
  return HSL_LUM[channel];
}

/** Convierte slider temp (−100…+100) a Kelvin aproximado para display. */
export function tempSliderToKelvin(v: number): number {
  const norm = v / 100;
  const kelvin = 5500 * Math.pow(0.5, -norm * 0.85);
  return Math.round(Math.max(2000, Math.min(50000, kelvin)));
}
