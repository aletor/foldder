import type { HslColorChannel } from "./lightroom-develop-settings";
import { HSL_COLOR_CHANNELS, LIGHTROOM_SLIDER_MAX, LIGHTROOM_SLIDER_MIN } from "./lightroom-develop-settings";

/** RGB 0…1 → canal HSL más cercano. */
export function nearestHslChannel(r: number, g: number, b: number): HslColorChannel {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return "orange";
  let h = 0;
  const d = max - min;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;

  const centers: Record<HslColorChannel, number> = {
    red: 0,
    orange: 0.083,
    yellow: 0.153,
    green: 0.25,
    aqua: 0.458,
    blue: 0.583,
    purple: 0.764,
    magenta: 0.889,
  };

  let best: HslColorChannel = "red";
  let bestD = Infinity;
  for (const ch of HSL_COLOR_CHANNELS) {
    const c = centers[ch] ?? 0;
    let dist = Math.abs(h - c);
    dist = Math.min(dist, 1 - dist);
    if (dist < bestD) {
      bestD = dist;
      best = ch;
    }
  }
  return best;
}

/** Delta vertical en píxeles → ajuste slider −100…+140. */
export function tatDeltaToSlider(dyPx: number, sensitivity = 0.35): number {
  return Math.round(Math.max(LIGHTROOM_SLIDER_MIN, Math.min(LIGHTROOM_SLIDER_MAX, -dyPx * sensitivity)));
}
