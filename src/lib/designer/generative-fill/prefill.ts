import sharp from "sharp";

const FILL_MASK_THRESHOLD = 128;

const NEIGHBOR_DX = [1, -1, 0, 0, 1, 1, -1, -1];
const NEIGHBOR_DY = [0, 0, 1, -1, 1, -1, 1, -1];

/**
 * Propaga color desde píxeles no enmascarados hacia el interior de la máscara.
 * Ideal para márgenes blancos / outpaint con fondo uniforme junto al contenido.
 */
export async function fillMaskedFromNearestBoundary(
  rgbBuf: Buffer,
  maskBuf: Buffer,
  w: number,
  h: number,
): Promise<{ rgb: Buffer; filledRatio: number }> {
  const rgb = await sharp(rgbBuf).resize(w, h, { fit: "fill" }).removeAlpha().raw().toBuffer();
  const mask = await sharp(maskBuf).resize(w, h, { fit: "fill" }).grayscale().raw().toBuffer();
  const out = Buffer.from(rgb);
  const state = new Uint8Array(w * h);

  let maskedTotal = 0;
  for (let i = 0; i < w * h; i++) {
    if (mask[i]! >= FILL_MASK_THRESHOLD) {
      state[i] = 0;
      maskedTotal++;
    } else {
      state[i] = 1;
    }
  }

  if (maskedTotal === 0) {
    return {
      rgb: await sharp(out, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer(),
      filledRatio: 1,
    };
  }

  let filledMasked = 0;
  let changed = true;
  let iterations = 0;
  const maxIter = w + h + 4;

  while (changed && iterations < maxIter) {
    changed = false;
    iterations++;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        if (state[idx] !== 0) continue;

        for (let d = 0; d < 8; d++) {
          const nx = x + NEIGHBOR_DX[d]!;
          const ny = y + NEIGHBOR_DY[d]!;
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
          const nidx = ny * w + nx;
          if (state[nidx] === 0) continue;

          const oi = idx * 3;
          const ni = nidx * 3;
          out[oi] = out[ni]!;
          out[oi + 1] = out[ni + 1]!;
          out[oi + 2] = out[ni + 2]!;
          state[idx] = 2;
          filledMasked++;
          changed = true;
          break;
        }
      }
    }
  }

  const filledRatio = maskedTotal > 0 ? filledMasked / maskedTotal : 1;
  return {
    rgb: await sharp(out, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer(),
    filledRatio,
  };
}

/** Muestrea si la zona enmascarada del origen es mayormente blanca/vacía. */
export async function maskedRegionMostlyWhite(
  rgbBuf: Buffer,
  maskBuf: Buffer,
  w: number,
  h: number,
): Promise<boolean> {
  const rgb = await sharp(rgbBuf).resize(w, h, { fit: "fill" }).removeAlpha().raw().toBuffer();
  const mask = await sharp(maskBuf).resize(w, h, { fit: "fill" }).grayscale().raw().toBuffer();
  let masked = 0;
  let whiteish = 0;
  for (let i = 0; i < w * h; i++) {
    if (mask[i]! < FILL_MASK_THRESHOLD) continue;
    masked++;
    const r = rgb[i * 3]!;
    const g = rgb[i * 3 + 1]!;
    const b = rgb[i * 3 + 2]!;
    if (r >= 240 && g >= 240 && b >= 240) whiteish++;
  }
  if (masked < 1) return false;
  return whiteish / masked >= 0.85;
}
