/**
 * Quema identificadores de página en PNG renderizado (Nivel 1 batch).
 */

import sharp from "sharp";

export function buildPageVisionImageTag(pageNumber: number): string {
  return `PV-P${pageNumber}`;
}

export async function burnPageVisionImageTag(
  pngBuffer: Buffer,
  imageTag: string,
): Promise<Buffer> {
  const meta = await sharp(pngBuffer).metadata();
  const width = meta.width ?? 800;
  const height = meta.height ?? 600;
  const fontSize = Math.max(14, Math.round(Math.min(width, height) * 0.022));
  const pad = Math.round(fontSize * 0.6);
  const label = imageTag.replace(/[<>&'"]/g, "");
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <rect x="${pad}" y="${pad}" width="${label.length * fontSize * 0.62 + pad * 2}" height="${fontSize + pad * 2}" fill="rgba(0,0,0,0.72)" rx="4"/>
  <text x="${pad * 2}" y="${pad * 2 + fontSize * 0.82}" font-family="monospace,sans-serif" font-size="${fontSize}" font-weight="700" fill="#00E5FF">${label}</text>
</svg>`;
  return sharp(pngBuffer)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png()
    .toBuffer();
}
