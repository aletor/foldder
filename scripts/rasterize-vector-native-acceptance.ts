#!/usr/bin/env npx tsx
/** Visual acceptance — rasteriza SVG extraído sobre fondos claro/oscuro. */
import fs from "node:fs";
import sharp from "sharp";
import { renderPdfPageCrop } from "../src/lib/brain/pdf-page-render";
import { extractNativeLogoInBbox } from "../src/lib/genoma/ingest/page-vision-native-extract";

const OUT = "docs/genoma-evidence";
const BBOX: [number, number, number, number] = [0.308, 0.46, 0.69, 0.54];

async function rasterSvgOnBg(svg: string, bg: string, outPath: string) {
  const meta = await sharp(Buffer.from(svg)).metadata();
  const w = meta.width ?? 500;
  const h = meta.height ?? 200;
  const targetW = 500;
  const targetH = Math.max(1, Math.round((h / w) * targetW));
  const logoPng = await sharp(Buffer.from(svg)).resize(targetW, targetH, { fit: "inside" }).png().toBuffer();
  const logoMeta = await sharp(logoPng).metadata();
  const lw = logoMeta.width ?? targetW;
  const lh = logoMeta.height ?? targetH;
  const pad = 40;
  const canvasW = lw + pad * 2;
  const canvasH = lh + pad * 2;
  await sharp({
    create: { width: canvasW, height: canvasH, channels: 3, background: bg },
  })
    .composite([{ input: logoPng, left: pad, top: pad }])
    .png()
    .toFile(outPath);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const buffer = fs.readFileSync("fixtures/brandkit/catalogo26.pdf");
  const asset = await extractNativeLogoInBbox({ buffer, pageNumber: 2, bbox: BBOX });
  if (!asset?.svg) throw new Error(`no svg: ${asset?.origin}`);

  fs.writeFileSync(`${OUT}/catalogo26-vector-native.svg`, asset.svg);
  await rasterSvgOnBg(asset.svg, "#f5f5f0", `${OUT}/catalogo26-vector-native-light.png`);
  await rasterSvgOnBg(asset.svg, "#1a1a2e", `${OUT}/catalogo26-vector-native-dark.png`);

  const pixel = {
    x: Math.round(BBOX[0] * 481.89),
    y: Math.round(BBOX[1] * 623.622),
    width: Math.round((BBOX[2] - BBOX[0]) * 481.89),
    height: Math.round((BBOX[3] - BBOX[1]) * 623.622),
  };
  const pdfCrop = await renderPdfPageCrop(buffer, 2, pixel, 300);
  await sharp(pdfCrop).resize(500).png().toFile(`${OUT}/catalogo26-pdf-reference.png`);

  console.log(JSON.stringify({ origin: asset.origin, svgLen: asset.svg.length, out: OUT }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
