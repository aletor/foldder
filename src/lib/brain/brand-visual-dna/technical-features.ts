import sharp from "sharp";
import type {
  BrandVisualDnaBackgroundType,
  BrandVisualDnaCompositionType,
  BrandVisualDnaObjectCategoryHint,
  BrandVisualDnaOrientation,
  BrandVisualDnaRawImageAnalysis,
} from "./types";

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return `#${[clamp(r), clamp(g), clamp(b)].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

function luminance(r: number, g: number, b: number): number {
  return 0.2126 * (r / 255) + 0.7152 * (g / 255) + 0.0722 * (b / 255);
}

function rgbToHsv(
  r: number,
  g: number,
  b: number,
): { h: number; s: number; v: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d > 1e-6) {
    if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
    else if (max === gn) h = ((bn - rn) / d + 2) / 6;
    else h = ((rn - gn) / d + 4) / 6;
  }
  const s = max <= 1e-6 ? 0 : d / max;
  return { h, s, v: max };
}

function dominantColorsFromRaw(
  data: Buffer,
  channels: number,
  width: number,
  height: number,
  maxColors: number,
): string[] {
  const buckets = new Map<string, { r: number; g: number; b: number; n: number }>();
  const step = Math.max(1, Math.floor((width * height) / 4000));
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      if ((x + y * width) % step !== 0) continue;
      const i = (y * width + x) * channels;
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;
      const qr = Math.round(r / 36) * 36;
      const qg = Math.round(g / 36) * 36;
      const qb = Math.round(b / 36) * 36;
      const key = `${qr},${qg},${qb}`;
      const cur = buckets.get(key);
      if (cur) {
        cur.r += r;
        cur.g += g;
        cur.b += b;
        cur.n += 1;
      } else {
        buckets.set(key, { r, g, b, n: 1 });
      }
    }
  }
  const sorted = [...buckets.values()].sort((a, b) => b.n - a.n);
  const out: string[] = [];
  for (const row of sorted.slice(0, maxColors)) {
    out.push(rgbToHex(row.r / row.n, row.g / row.n, row.b / row.n));
  }
  return out.length ? out : ["#808080"];
}

function orientationFromSize(w: number, h: number): BrandVisualDnaOrientation {
  if (!w || !h) return "unknown";
  const r = w / h;
  if (Math.abs(r - 1) < 0.06) return "square";
  return r > 1 ? "landscape" : "portrait";
}

function edgeAndVarianceScores(
  data: Buffer,
  channels: number,
  width: number,
  height: number,
): { edgeMean: number; localVarMean: number } {
  const gray = (x: number, y: number): number => {
    const i = (y * width + x) * channels;
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    return luminance(r, g, b);
  };
  let edgeSum = 0;
  let edgeN = 0;
  const win = 2;
  for (let y = win; y < height - win; y += 2) {
    for (let x = win; x < width - win; x += 2) {
      const gx = gray(x + 1, y) - gray(x - 1, y);
      const gy = gray(x, y + 1) - gray(x, y - 1);
      edgeSum += Math.sqrt(gx * gx + gy * gy);
      edgeN++;
    }
  }
  let varSum = 0;
  let varN = 0;
  for (let y = win; y < height - win; y += 4) {
    for (let x = win; x < width - win; x += 4) {
      const vals: number[] = [];
      for (let dy = -win; dy <= win; dy++) {
        for (let dx = -win; dx <= win; dx++) {
          vals.push(gray(x + dx, y + dy));
        }
      }
      const m = vals.reduce((a, b) => a + b, 0) / vals.length;
      const v = vals.reduce((a, b) => a + (b - m) * (b - m), 0) / vals.length;
      varSum += v;
      varN++;
    }
  }
  return {
    edgeMean: edgeN ? edgeSum / edgeN : 0,
    localVarMean: varN ? varSum / varN : 0,
  };
}

function skinLikeRatio(data: Buffer, channels: number, width: number, height: number): number {
  let n = 0;
  let skin = 0;
  const x0 = Math.floor(width * 0.25);
  const x1 = Math.ceil(width * 0.75);
  const y0 = Math.floor(height * 0.15);
  const y1 = Math.ceil(height * 0.85);
  for (let y = y0; y < y1; y += 2) {
    for (let x = x0; x < x1; x += 2) {
      const i = (y * width + x) * channels;
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;
      const hsv = rgbToHsv(r, g, b);
      n++;
      const hueDeg = hsv.h * 360;
      const warm =
        ((hueDeg >= 0 && hueDeg <= 55) || (hueDeg >= 330 && hueDeg <= 360)) &&
        hsv.s > 0.12 &&
        hsv.v > 0.18 &&
        hsv.v < 0.95;
      if (warm) skin++;
    }
  }
  return n ? skin / n : 0;
}

function borderVariance(data: Buffer, channels: number, width: number, height: number): number {
  const band = Math.max(2, Math.floor(Math.min(width, height) * 0.06));
  const samples: number[] = [];
  const pushPx = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = (y * width + x) * channels;
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    samples.push(luminance(r, g, b));
  };
  for (let x = 0; x < width; x += 3) {
    for (let t = 0; t < band; t++) {
      pushPx(x, t);
      pushPx(x, height - 1 - t);
    }
  }
  for (let y = 0; y < height; y += 3) {
    for (let t = 0; t < band; t++) {
      pushPx(t, y);
      pushPx(width - 1 - t, y);
    }
  }
  if (!samples.length) return 0;
  const m = samples.reduce((a, b) => a + b, 0) / samples.length;
  return samples.reduce((a, b) => a + (b - m) * (b - m), 0) / samples.length;
}

function centerContrast(data: Buffer, channels: number, width: number, height: number): number {
  const cx0 = Math.floor(width * 0.35);
  const cx1 = Math.ceil(width * 0.65);
  const cy0 = Math.floor(height * 0.35);
  const cy1 = Math.ceil(height * 0.65);
  const vals: number[] = [];
  for (let y = cy0; y < cy1; y += 2) {
    for (let x = cx0; x < cx1; x += 2) {
      const i = (y * width + x) * channels;
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;
      vals.push(luminance(r, g, b));
    }
  }
  if (vals.length < 8) return 0;
  const mn = Math.min(...vals);
  const mx = Math.max(...vals);
  return (mx - mn) / 255;
}

export async function extractTechnicalImageFeatures(
  imageId: string,
  buffer: Buffer,
): Promise<Omit<BrandVisualDnaRawImageAnalysis, "image_id" | "status" | "fallback_used">> {
  const meta = await sharp(buffer).metadata();
  const width_px = meta.width ?? 0;
  const height_px = meta.height ?? 0;

  const { data, info } = await sharp(buffer)
    .resize(96, 96, { fit: "inside" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const w = info.width;
  const h = info.height;
  const ch = info.channels;
  const dominant_colors = dominantColorsFromRaw(data, ch, w, h, 6);

  let sumL = 0;
  let sumL2 = 0;
  let sumS = 0;
  let nPix = 0;
  for (let i = 0; i < data.length; i += ch) {
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    const L = luminance(r, g, b);
    const { s } = rgbToHsv(r, g, b);
    sumL += L;
    sumL2 += L * L;
    sumS += s;
    nPix++;
  }
  const meanL = nPix ? sumL / nPix : 0;
  const varL = nPix ? sumL2 / nPix - meanL * meanL : 0;
  const brightness_0_1 = meanL;
  const contrast_0_1 = Math.min(1, Math.sqrt(Math.max(0, varL)) * 2.2);
  const saturation_0_1 = nPix ? sumS / nPix : 0;

  const { edgeMean, localVarMean } = edgeAndVarianceScores(data, ch, w, h);
  const text_presence_score_0_1 = Math.min(
    1,
    edgeMean * 3.2 * (localVarMean > 0.012 ? 1.15 : 0.85) + (centerContrast(data, ch, w, h) > 0.35 ? 0.12 : 0),
  );
  const human_presence_score_0_1 = Math.min(1, skinLikeRatio(data, ch, w, h) * 1.8 + (meanL > 0.35 ? 0.05 : 0));
  const product_heuristic =
    Math.min(1, edgeMean * 2.4) * (1 - human_presence_score_0_1 * 0.35) + centerContrast(data, ch, w, h) * 0.25;
  const product_presence_score_0_1 = Math.min(1, product_heuristic);

  const visual_density_0_1 = Math.min(1, edgeMean * 2.8 + localVarMean * 18);

  const bVar = borderVariance(data, ch, w, h);
  let background_type: BrandVisualDnaBackgroundType = "unknown";
  if (bVar < 0.004) background_type = "solid_neutral";
  else if (bVar < 0.018) background_type = "minimal_studio";
  else if (bVar < 0.045) background_type = "gradient";
  else background_type = "busy_environment";

  let composition_type: BrandVisualDnaCompositionType = "mixed";
  const symDiff =
    Math.abs(luminance(data[0] ?? 0, data[1] ?? 0, data[2] ?? 0) - luminance(data[ch * (w - 1)] ?? 0, data[ch * (w - 1) + 1] ?? 0, data[ch * (w - 1) + 2] ?? 0)) < 0.08;
  if (symDiff && contrast_0_1 < 0.55) composition_type = "symmetrical";
  else if (width_px > 0 && height_px > 0 && width_px / height_px > 1.45 && visual_density_0_1 > 0.45)
    composition_type = "environmental_wide";
  else if (orientationFromSize(width_px, height_px) === "landscape" && visual_density_0_1 < 0.28)
    composition_type = "rule_of_thirds";
  else if (visual_density_0_1 > 0.62 && human_presence_score_0_1 < 0.2) composition_type = "layered";
  else if (orientationFromSize(width_px, height_px) === "square" && visual_density_0_1 > 0.35)
    composition_type = "center_weighted";

  let object_category_hint: BrandVisualDnaObjectCategoryHint = "unknown";
  if (human_presence_score_0_1 > 0.22) object_category_hint = "people";
  else if (product_presence_score_0_1 > 0.42 && text_presence_score_0_1 < 0.35) object_category_hint = "product";
  else if (text_presence_score_0_1 > 0.45) object_category_hint = "abstract_graphic";
  else if (saturation_0_1 > 0.35 && human_presence_score_0_1 < 0.12) object_category_hint = "food";
  else object_category_hint = "mixed";

  return {
    dominant_colors,
    brightness_0_1: Number(brightness_0_1.toFixed(4)),
    contrast_0_1: Number(contrast_0_1.toFixed(4)),
    saturation_0_1: Number(saturation_0_1.toFixed(4)),
    text_presence_score_0_1: Number(text_presence_score_0_1.toFixed(4)),
    human_presence_score_0_1: Number(human_presence_score_0_1.toFixed(4)),
    product_presence_score_0_1: Number(product_presence_score_0_1.toFixed(4)),
    composition_type,
    orientation: orientationFromSize(width_px, height_px),
    visual_density_0_1: Number(visual_density_0_1.toFixed(4)),
    background_type,
    object_category_hint,
    width_px,
    height_px,
    analyzed_at: new Date().toISOString(),
  };
}
