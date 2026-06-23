/**
 * Utilidades compartidas para convertir salidas de matting (Replicate / fal)
 * en RGBA con alfa real y máscara grayscale.
 */

import sharp from "sharp";

/** True si el buffer tiene transparencia real (no un rectángulo 100% opaco). */
export async function hasMeaningfulTransparency(buf: Buffer, minFraction = 0.03): Promise<boolean> {
  const { data } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let transparent = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 16) transparent++;
  }
  return transparent / (data.length / 4) >= minFraction;
}

/** Extrae máscara grayscale del canal alfa, o convierte a escala de grises si no hay alfa. */
export async function matteBufferToMask(buf: Buffer, w: number, h: number): Promise<Buffer> {
  const resized = await sharp(buf).resize(w, h, { fit: "fill" }).ensureAlpha().png().toBuffer();
  const stats = await sharp(resized).stats();
  const alpha = stats.channels[3];
  if (alpha && alpha.max - alpha.min > 8) {
    return sharp(resized).extractChannel("alpha").png().toBuffer();
  }
  return sharp(buf).resize(w, h, { fit: "fill" }).grayscale().png().toBuffer();
}

/**
 * Bbox [x,y,w,h] del COMPONENTE CONEXO más grande de una máscara grayscale.
 * Usar el componente mayor (en vez del bbox de todos los blancos) evita que blobs
 * espurios o instancias lejanas inflen la caja. Devuelve null si no hay blancos.
 */
export async function largestComponentBBox(
  maskGray: Buffer,
  w: number,
  h: number,
  threshold = 127,
): Promise<[number, number, number, number] | null> {
  const data = await sharp(maskGray).resize(w, h, { fit: "fill" }).grayscale().raw().toBuffer();
  const n = w * h;
  const visited = new Uint8Array(n);
  const stack = new Int32Array(n);
  let best: { area: number; minX: number; minY: number; maxX: number; maxY: number } | null = null;

  for (let start = 0; start < n; start++) {
    if (visited[start] || data[start] <= threshold) continue;
    let top = 0;
    stack[top++] = start;
    visited[start] = 1;
    let area = 0;
    let minX = w, minY = h, maxX = -1, maxY = -1;
    while (top > 0) {
      const idx = stack[--top];
      const x = idx % w;
      const y = (idx - x) / w;
      area++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      // 4-vecindad
      if (x > 0) { const i = idx - 1; if (!visited[i] && data[i] > threshold) { visited[i] = 1; stack[top++] = i; } }
      if (x < w - 1) { const i = idx + 1; if (!visited[i] && data[i] > threshold) { visited[i] = 1; stack[top++] = i; } }
      if (y > 0) { const i = idx - w; if (!visited[i] && data[i] > threshold) { visited[i] = 1; stack[top++] = i; } }
      if (y < h - 1) { const i = idx + w; if (!visited[i] && data[i] > threshold) { visited[i] = 1; stack[top++] = i; } }
    }
    if (!best || area > best.area) best = { area, minX, minY, maxX, maxY };
  }

  if (!best || best.maxX < best.minX) return null;
  return [best.minX, best.minY, best.maxX - best.minX + 1, best.maxY - best.minY + 1];
}

/** Construye un PNG RGBA combinando RGB de `sourceRgb` con alfa = `maskGray` (píxel a píxel). */
export async function applyMaskAsAlpha(
  sourceRgb: Buffer,
  maskGray: Buffer,
  w: number,
  h: number,
): Promise<Buffer> {
  const rgb = await sharp(sourceRgb).resize(w, h, { fit: "fill" }).removeAlpha().raw().toBuffer();
  const mask = await sharp(maskGray).resize(w, h, { fit: "fill" }).grayscale().raw().toBuffer();
  const out = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    out[i * 4] = rgb[i * 3];
    out[i * 4 + 1] = rgb[i * 3 + 1];
    out[i * 4 + 2] = rgb[i * 3 + 2];
    out[i * 4 + 3] = mask[i];
  }
  return sharp(out, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
}

/**
 * A partir de la salida de un modelo de matting (RGBA recortado o máscara gris),
 * devuelve PNG RGBA enmascarado + máscara grayscale del tamaño indicado.
 */
export async function matteOutputToRgba(
  matteBuf: Buffer,
  sourceRgb: Buffer,
  w: number,
  h: number,
): Promise<{ rgba: Buffer; mask: Buffer }> {
  const resized = await sharp(matteBuf).resize(w, h, { fit: "fill" }).ensureAlpha().png().toBuffer();
  const stats = await sharp(resized).stats();
  const alpha = stats.channels[3];
  const hasVariedAlpha = alpha && alpha.max - alpha.min > 8;

  if (hasVariedAlpha) {
    const mask = await sharp(resized).extractChannel("alpha").png().toBuffer();
    return { rgba: resized, mask };
  }

  const mask = await sharp(matteBuf).resize(w, h, { fit: "fill" }).grayscale().toBuffer();
  const rgba = await applyMaskAsAlpha(sourceRgb, mask, w, h);
  return { rgba, mask: await sharp(mask).png().toBuffer() };
}

export function clampBox(
  box: [number, number, number, number],
  width: number,
  height: number,
): [number, number, number, number] {
  let [x, y, w, h] = box.map((n) => Math.round(Number(n) || 0)) as [number, number, number, number];
  x = Math.max(0, Math.min(width - 1, x));
  y = Math.max(0, Math.min(height - 1, y));
  w = Math.max(1, Math.min(width - x, w));
  h = Math.max(1, Math.min(height - y, h));
  return [x, y, w, h];
}

/** Asegura que el RGBA enmascarado coincide con el tamaño del bbox (w×h). */
export async function ensureRgbaBBoxSize(rgba: Buffer, bw: number, bh: number): Promise<Buffer> {
  const meta = await sharp(rgba).metadata();
  const w = meta.width ?? bw;
  const h = meta.height ?? bh;
  if (w === bw && h === bh) return rgba;
  return sharp(rgba).resize(bw, bh, { fit: "fill" }).ensureAlpha().png().toBuffer();
}

/** Ensambla RGBA recortado + máscara full-size a partir del crop enmascarado. */
export async function assembleSegmentResult(
  master: Buffer,
  width: number,
  height: number,
  bbox: [number, number, number, number],
  rgba: Buffer,
  cropMask: Buffer,
): Promise<{ rgba: Buffer; mask: Buffer; bbox: [number, number, number, number] }> {
  const [, , bw, bh] = bbox;
  const sizedRgba = await ensureRgbaBBoxSize(rgba, bw, bh);
  const fullMask = await sharp({
    create: { width, height, channels: 3, background: { r: 0, g: 0, b: 0 } },
  })
    .composite([{ input: cropMask, left: bbox[0], top: bbox[1] }])
    .grayscale()
    .png()
    .toBuffer();
  return { rgba: sizedRgba, mask: fullMask, bbox };
}

/** Expande un bbox un % por lado, recortado a la imagen. */
export function expandBox(
  box: [number, number, number, number],
  width: number,
  height: number,
  frac: number,
): [number, number, number, number] {
  const [x, y, w, h] = box;
  return clampBox([x - w * frac, y - h * frac, w * (1 + 2 * frac), h * (1 + 2 * frac)], width, height);
}

/**
 * Recorta un PNG RGBA al rectángulo de su alfa real (alpha-trim) y devuelve el buffer
 * recortado + el desplazamiento dentro del crop original. Si no hay nada que recortar,
 * devuelve el original sin offset.
 */
export async function trimToAlpha(
  rgba: Buffer,
  cw: number,
  ch: number,
): Promise<{ buffer: Buffer; left: number; top: number; width: number; height: number }> {
  try {
    const { data } = await sharp(rgba).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let minX = cw;
    let minY = ch;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        if (data[(y * cw + x) * 4 + 3] > 12) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < minX || maxY < minY) {
      return { buffer: rgba, left: 0, top: 0, width: cw, height: ch };
    }
    const left = minX;
    const top = minY;
    const width = maxX - minX + 1;
    const height = maxY - minY + 1;
    if (left === 0 && top === 0 && width === cw && height === ch) {
      return { buffer: rgba, left: 0, top: 0, width: cw, height: ch };
    }
    const buffer = await sharp(rgba).extract({ left, top, width, height }).png().toBuffer();
    return { buffer, left, top, width, height };
  } catch {
    return { buffer: rgba, left: 0, top: 0, width: cw, height: ch };
  }
}

/**
 * Finaliza un segmento: recorta el RGBA matteado a su alfa real (bounds exactos a la
 * silueta) y ensambla la máscara grayscale full-size. `cropBox` es la caja (expandida)
 * realmente recortada del master.
 */
export async function finalizeSegment(args: {
  master: Buffer;
  width: number;
  height: number;
  cropBox: [number, number, number, number];
  rgba: Buffer;
}): Promise<{ rgba: Buffer; mask: Buffer; bbox: [number, number, number, number] }> {
  const { width, height, cropBox, rgba } = args;
  const [cx, cy, cw, ch] = cropBox;

  const trimmed = await trimToAlpha(rgba, cw, ch);
  const finalBox: [number, number, number, number] = [
    cx + trimmed.left,
    cy + trimmed.top,
    trimmed.width,
    trimmed.height,
  ];

  const trimmedMask = await sharp(trimmed.buffer)
    .ensureAlpha()
    .extractChannel("alpha")
    .png()
    .toBuffer();

  const fullMask = await sharp({
    create: { width, height, channels: 3, background: { r: 0, g: 0, b: 0 } },
  })
    .composite([{ input: trimmedMask, left: finalBox[0], top: finalBox[1] }])
    .grayscale()
    .png()
    .toBuffer();

  return { rgba: trimmed.buffer, mask: fullMask, bbox: finalBox };
}
