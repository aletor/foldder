import type {
  BrushMask,
  ColorRangeMask,
  LinearGradientMask,
  LuminanceRangeMask,
  MaskAdjustmentLayer,
  MaskCombineOp,
  MaskPrimitive,
  RadialGradientMask,
} from "./lightroom-mask-types";

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function colorDistance(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

export function combineAlphaValues(current: number, next: number, op: MaskCombineOp, isFirst: boolean): number {
  const n = clamp01(next);
  if (isFirst) return n;
  const c = clamp01(current);
  switch (op) {
    case "subtract":
      return clamp01(c - n);
    case "intersect":
      return Math.min(c, n);
    case "add":
    default:
      return clamp01(c + n);
  }
}

export function renderLinearGradientAlpha(width: number, height: number, mask: LinearGradientMask): Float32Array {
  const out = new Float32Array(width * height);
  const ax = mask.a.x * width;
  const ay = mask.a.y * height;
  const bx = mask.b.x * width;
  const by = mask.b.y * height;
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy || 1;
  const feather = Math.max(mask.feather, 0.02) * Math.min(width, height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const px = x + 0.5;
      const py = y + 0.5;
      const t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
      const dist = Math.abs((px - ax) * -dy + (py - ay) * dx) / Math.sqrt(lenSq);
      const along = clamp01(t);
      const edge = smoothstep(0, feather, dist);
      let v = along * (1 - edge * 0.35);
      if (mask.invert) v = 1 - v;
      out[y * width + x] = clamp01(v);
    }
  }
  return out;
}

export function renderRadialGradientAlpha(width: number, height: number, mask: RadialGradientMask): Float32Array {
  const out = new Float32Array(width * height);
  const cx = mask.center.x * width;
  const cy = mask.center.y * height;
  const minDim = Math.min(width, height);
  const radius = Math.max(mask.radius, 0.01) * minDim;
  const feather = Math.max(mask.feather, 0.02) * radius;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dist = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      let v = 1 - smoothstep(radius - feather, radius, dist);
      if (mask.invert) v = 1 - v;
      out[y * width + x] = clamp01(v);
    }
  }
  return out;
}

export function renderColorRangeAlpha(
  width: number,
  height: number,
  mask: ColorRangeMask,
  source: Uint8ClampedArray,
): Float32Array {
  const out = new Float32Array(width * height);
  const tol = (mask.tolerance / 100) * 1.2;
  const smooth = Math.max(mask.smoothness, 0.05);

  for (let i = 0; i < width * height; i += 1) {
    const si = i * 4;
    const px = {
      r: (source[si] ?? 0) / 255,
      g: (source[si + 1] ?? 0) / 255,
      b: (source[si + 2] ?? 0) / 255,
    };
    const d = colorDistance(px, mask.color);
    let v = 1 - smoothstep(tol, tol + smooth, d);
    if (mask.invert) v = 1 - v;
    out[i] = clamp01(v);
  }
  return out;
}

export function renderLuminanceRangeAlpha(
  width: number,
  height: number,
  mask: LuminanceRangeMask,
  source: Uint8ClampedArray,
): Float32Array {
  const out = new Float32Array(width * height);
  const lo = mask.min / 100;
  const hi = mask.max / 100;
  const sm = Math.max(mask.smoothness, 0.02);

  for (let i = 0; i < width * height; i += 1) {
    const si = i * 4;
    const l = luminance((source[si] ?? 0) / 255, (source[si + 1] ?? 0) / 255, (source[si + 2] ?? 0) / 255);
    let v = smoothstep(lo - sm, lo + sm, l) * (1 - smoothstep(hi - sm, hi + sm, l));
    if (mask.invert) v = 1 - v;
    out[i] = clamp01(v);
  }
  return out;
}

export async function renderBrushAlpha(width: number, height: number, mask: BrushMask): Promise<Float32Array> {
  const out = new Float32Array(width * height);
  if (!mask.alphaDataUrl) return out;
  const img = await loadImage(mask.alphaDataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return out;
  ctx.drawImage(img, 0, 0, width, height);
  const data = ctx.getImageData(0, 0, width, height).data;
  for (let i = 0; i < width * height; i += 1) {
    out[i] = (data[i * 4] ?? 0) / 255;
  }
  return out;
}

export function renderPrimitiveAlphaSync(
  width: number,
  height: number,
  mask: MaskPrimitive,
  source?: Uint8ClampedArray,
): Float32Array | null {
  switch (mask.type) {
    case "linear":
      return renderLinearGradientAlpha(width, height, mask);
    case "radial":
      return renderRadialGradientAlpha(width, height, mask);
    case "colorRange":
      return source ? renderColorRangeAlpha(width, height, mask, source) : null;
    case "luminanceRange":
      return source ? renderLuminanceRangeAlpha(width, height, mask, source) : null;
    case "brush":
      return null;
    default:
      return null;
  }
}

export async function buildMaskLayerAlpha(
  layer: MaskAdjustmentLayer,
  width: number,
  height: number,
  source?: Uint8ClampedArray,
): Promise<Uint8Array> {
  const combined = new Float32Array(width * height);
  let first = true;

  for (const mask of layer.masks) {
    let primitive: Float32Array | null = null;
    if (mask.type === "brush") {
      primitive = await renderBrushAlpha(width, height, mask);
    } else {
      primitive = renderPrimitiveAlphaSync(width, height, mask, source);
    }
    if (!primitive) continue;
    for (let i = 0; i < combined.length; i += 1) {
      combined[i] = combineAlphaValues(combined[i] ?? 0, primitive[i] ?? 0, mask.combine, first);
    }
    first = false;
  }

  const amount = Math.max(0, Math.min(100, layer.amount ?? 100)) / 100;

  const out = new Uint8Array(width * height);
  for (let i = 0; i < combined.length; i += 1) {
    let v = clamp01(combined[i] ?? 0);
    if (layer.inverted) v = 1 - v;
    v *= amount;
    out[i] = Math.round(clamp01(v) * 255);
  }
  return out;
}

export function paintBrushStroke(
  ctx: CanvasRenderingContext2D,
  mask: BrushMask,
  from: { x: number; y: number },
  to: { x: number; y: number },
  erase: boolean,
): void {
  const size = Math.max(2, (mask.size / 100) * 120);
  const hardness = clamp01(mask.hardness);
  const flow = clamp01(mask.flow) * clamp01(mask.density);
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = size;
  if (erase) {
    ctx.globalCompositeOperation = "destination-out";
    ctx.strokeStyle = `rgba(0,0,0,${flow})`;
  } else {
    ctx.globalCompositeOperation = "source-over";
    const inner = hardness;
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 0.5);
    grad.addColorStop(0, `rgba(255,255,255,${flow})`);
    grad.addColorStop(inner, `rgba(255,255,255,${flow * 0.85})`);
    grad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.strokeStyle = `rgba(255,255,255,${flow})`;
  }
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
  ctx.restore();
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / Math.max(edge1 - edge0, 1e-6));
  return t * t * (3 - 2 * t);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("No se pudo cargar alpha de pincel"));
    img.src = src;
  });
}

/** Muestra de color bajo cursor (RGB 0…1). */
export function sampleColorAt(
  source: Uint8ClampedArray,
  width: number,
  x: number,
  y: number,
): { r: number; g: number; b: number } {
  const px = Math.max(0, Math.min(width - 1, Math.round(x)));
  const py = Math.max(0, Math.min(Math.floor(source.length / (width * 4)) - 1, Math.round(y)));
  const i = (py * width + px) * 4;
  return {
    r: (source[i] ?? 0) / 255,
    g: (source[i + 1] ?? 0) / 255,
    b: (source[i + 2] ?? 0) / 255,
  };
}

export { smoothstep };
