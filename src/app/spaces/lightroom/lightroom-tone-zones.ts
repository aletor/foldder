/** Compresión/expansión tonal con roll-off suave (espacio lineal). */

export function zoneWeight(l: number, linearMax: number, zone: "shadows" | "highlights" | "whites" | "blacks"): number {
  const m = linearMax;
  switch (zone) {
    case "shadows":
      return 1 - smoothstep(0.08 * m, 0.42 * m, l);
    case "highlights":
      return smoothstep(0.55 * m, 0.98 * m, l);
    case "whites":
      return smoothstep(0.82 * m, m, l);
    case "blacks":
      return 1 - smoothstep(0, 0.12 * m, l);
    default:
      return 0;
  }
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) return x >= edge1 ? 1 : 0;
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Aplica altas luces/sombras/blancos/negros con roll-off (mirrors shader). */
export function applyToneZonesLinear(
  r: number,
  g: number,
  b: number,
  linearMax: number,
  highlights: number,
  shadows: number,
  whites: number,
  blacks: number,
): [number, number, number] {
  let c = [Math.max(0, r), Math.max(0, g), Math.max(0, b)] as [number, number, number];
  const l =
    0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  const hiW = zoneWeight(l, linearMax, "highlights");
  const shW = zoneWeight(l, linearMax, "shadows");
  const whW = zoneWeight(l, linearMax, "whites");
  const blW = zoneWeight(l, linearMax, "blacks");

  const pivot = 0.72 * linearMax;
  if (highlights < 0) {
    const w = hiW * Math.abs(highlights) * 0.012;
    const t = Math.max(0, l - pivot);
    const newL = pivot + t / (1 + w * 4);
    const scale = l > 1e-6 ? newL / l : 1;
    c = [c[0] * scale, c[1] * scale, c[2] * scale];
  } else if (highlights > 0) {
    const add = highlights * 0.004 * hiW * linearMax;
    c = [c[0] + add, c[1] + add, c[2] + add];
  }

  if (shadows > 0) {
    const lift = shadows * 0.004 * shW * linearMax;
    c = [c[0] + lift, c[1] + lift, c[2] + lift];
  } else if (shadows < 0) {
    const crush = Math.abs(shadows) * 0.006 * shW;
    const factor = 1 - crush * (1 - Math.min(1, l / Math.max(0.42 * linearMax, 1e-6)));
    c = [c[0] * factor, c[1] * factor, c[2] * factor];
  }

  const wAdd = whites * 0.0035 * whW * linearMax;
  const bAdd = blacks * 0.0035 * blW * linearMax * -1;
  c = [c[0] + wAdd + bAdd, c[1] + wAdd + bAdd, c[2] + wAdd + bAdd];

  return c;
}
