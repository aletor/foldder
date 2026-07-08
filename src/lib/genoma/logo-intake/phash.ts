import sharp from "sharp";
import { phashHammingDistance } from "@/lib/brandkit/logo-phash";

/** dHash 64-bit → 16 hex chars. */
export async function computeDHashHex(pngBuffer: Buffer): Promise<string> {
  const { data } = await sharp(pngBuffer).greyscale().resize(9, 8, { fit: "fill" }).raw().toBuffer({
    resolveWithObject: true,
  });
  let bits = "";
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      const left = data[y * 9 + x] ?? 0;
      const right = data[y * 9 + x + 1] ?? 0;
      bits += left < right ? "1" : "0";
    }
  }
  let hex = "";
  for (let i = 0; i < bits.length; i += 4) {
    hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  }
  return hex.padStart(16, "0");
}

export function dHashHamming(a: string, b: string): number {
  if (a.length !== b.length) return 64;
  let dist = 0;
  for (let i = 0; i < a.length; i += 1) {
    const va = parseInt(a[i]!, 16);
    const vb = parseInt(b[i]!, 16);
    let x = va ^ vb;
    while (x) {
      dist += x & 1;
      x >>= 1;
    }
  }
  return dist;
}

export const LOGO_INTAKE_PHASH_THRESHOLD = 12;

export function phashNear(a: string, b: string): boolean {
  return dHashHamming(a, b) <= LOGO_INTAKE_PHASH_THRESHOLD;
}

/** Compat con util compartida cuando ambos son strings de bits largos. */
export function logoPhashDistance(a: string, b: string): number {
  if (/^[0-9a-f]{16}$/i.test(a) && /^[0-9a-f]{16}$/i.test(b)) return dHashHamming(a, b);
  return phashHammingDistance(a, b);
}
