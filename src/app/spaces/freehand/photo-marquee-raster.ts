import type {
  PhotoMarqueeEllipse,
  PhotoMarqueePoint,
  PhotoMarqueeRect,
} from "./photo-marquee-geometry";

export type PhotoMarqueeWorldRect = { x: number; y: number; w: number; h: number };

export type ActivePixelSelection = {
  sourceLayerId: string;
  naturalWidth: number;
  naturalHeight: number;
  pixelCrop: { minIx: number; minIy: number; maxIx: number; maxIy: number };
  worldBounds: PhotoMarqueeWorldRect;
};

/** Portapapeles interno: PNG + metadatos para pegar sin rescalar mal. */
export type PhotoMarqueeRasterClip = ActivePixelSelection & {
  dataUrl: string;
  cropW: number;
  cropH: number;
};

export const PHOTO_MARQUEE_PASTE_STAGGER_PX = 24;

const PHOTO_MARQUEE_BBOX_PAD_PX = 1;

export type PhotoMarqueePixelMapper = {
  worldToPixel: (wp: PhotoMarqueePoint) => { ix: number; iy: number } | null;
  /** Esquinas mundo del rectángulo de píxeles [ix0,ix1)×[iy0,iy1) (fin exclusivo). */
  pixelRectToWorldBounds: (
    ix0: number,
    iy0: number,
    ix1: number,
    iy1: number,
  ) => PhotoMarqueeWorldRect;
};

function fillMarqueePixelMaskPath(
  ctx: CanvasRenderingContext2D,
  worldToPx: (wp: PhotoMarqueePoint) => { x: number; y: number } | null,
  rects: PhotoMarqueeRect[],
  polys: PhotoMarqueePoint[][],
  ellipses: PhotoMarqueeEllipse[],
): void {
  ctx.beginPath();
  for (const r of rects) {
    const c0 = worldToPx({ x: r.x, y: r.y });
    const c1 = worldToPx({ x: r.x + r.w, y: r.y });
    const c2 = worldToPx({ x: r.x + r.w, y: r.y + r.h });
    const c3 = worldToPx({ x: r.x, y: r.y + r.h });
    if (c0 && c1 && c2 && c3) {
      ctx.moveTo(c0.x, c0.y);
      ctx.lineTo(c1.x, c1.y);
      ctx.lineTo(c2.x, c2.y);
      ctx.lineTo(c3.x, c3.y);
      ctx.closePath();
    }
  }
  for (const ring of polys) {
    if (ring.length < 3) continue;
    const p0 = worldToPx(ring[0]!);
    if (!p0) continue;
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < ring.length; i++) {
      const p = worldToPx(ring[i]!);
      if (p) ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
  }
  for (const e of ellipses) {
    if (e.rx <= 0 || e.ry <= 0) continue;
    const segs = 48;
    let first: { x: number; y: number } | null = null;
    for (let i = 0; i <= segs; i++) {
      const t = (i / segs) * Math.PI * 2;
      const c = worldToPx({ x: e.cx + e.rx * Math.cos(t), y: e.cy + e.ry * Math.sin(t) });
      if (!c) continue;
      if (!first) {
        first = c;
        ctx.moveTo(c.x, c.y);
      } else {
        ctx.lineTo(c.x, c.y);
      }
    }
    if (first) ctx.closePath();
  }
}

function computePhotoMarqueeImagePixelBBox(
  mapper: PhotoMarqueePixelMapper,
  iw: number,
  ih: number,
  rects: PhotoMarqueeRect[],
  polys: PhotoMarqueePoint[][],
  ellipses: PhotoMarqueeEllipse[],
): { minIx: number; minIy: number; maxIx: number; maxIy: number } | null {
  let minF = Infinity;
  let minG = Infinity;
  let maxF = -Infinity;
  let maxG = -Infinity;
  const add = (wp: PhotoMarqueePoint) => {
    const f = mapper.worldToPixel(wp);
    if (!f) return;
    minF = Math.min(minF, f.ix);
    minG = Math.min(minG, f.iy);
    maxF = Math.max(maxF, f.ix);
    maxG = Math.max(maxG, f.iy);
  };
  for (const r of rects) {
    add({ x: r.x, y: r.y });
    add({ x: r.x + r.w, y: r.y });
    add({ x: r.x + r.w, y: r.y + r.h });
    add({ x: r.x, y: r.y + r.h });
  }
  for (const ring of polys) {
    for (const p of ring) add(p);
  }
  for (const e of ellipses) {
    const segs = 48;
    for (let i = 0; i <= segs; i++) {
      const t = (i / segs) * Math.PI * 2;
      add({ x: e.cx + e.rx * Math.cos(t), y: e.cy + e.ry * Math.sin(t) });
    }
  }
  if (!Number.isFinite(minF)) return null;
  const pad = PHOTO_MARQUEE_BBOX_PAD_PX;
  const minIx = Math.max(0, Math.floor(minF) - pad);
  const minIy = Math.max(0, Math.floor(minG) - pad);
  const maxIx = Math.min(iw - 1, Math.ceil(maxF) + pad);
  const maxIy = Math.min(ih - 1, Math.ceil(maxG) + pad);
  if (minIx > maxIx || minIy > maxIy) return null;
  return { minIx, minIy, maxIx, maxIy };
}

function buildPhotoMarqueeCropAlphaMask(
  mapper: PhotoMarqueePixelMapper,
  iw: number,
  ih: number,
  minIx: number,
  minIy: number,
  cw: number,
  ch: number,
  rects: PhotoMarqueeRect[],
  polys: PhotoMarqueePoint[][],
  ellipses: PhotoMarqueeEllipse[],
  featherPx: number,
): HTMLCanvasElement | null {
  if (typeof document === "undefined" || cw < 1 || ch < 1) return null;
  const feather = Math.max(0, Math.min(200, featherPx));
  const margin = feather > 0.5 ? Math.max(2, Math.ceil(feather * 3)) : 0;
  const W = cw + 2 * margin;
  const H = ch + 2 * margin;
  const toRel = (wp: PhotoMarqueePoint): { x: number; y: number } | null => {
    const f = mapper.worldToPixel(wp);
    if (!f) return null;
    return { x: f.ix - minIx + margin, y: f.iy - minIy + margin };
  };
  const mask = document.createElement("canvas");
  mask.width = W;
  mask.height = H;
  const mctx = mask.getContext("2d");
  if (!mctx) return null;
  mctx.fillStyle = "#000";
  mctx.fillRect(0, 0, W, H);
  mctx.fillStyle = "#fff";
  fillMarqueePixelMaskPath(mctx, toRel, rects, polys, ellipses);
  mctx.fill("evenodd");

  let blurPlane: HTMLCanvasElement;
  if (margin > 0) {
    const blurC = document.createElement("canvas");
    blurC.width = W;
    blurC.height = H;
    const bctx = blurC.getContext("2d");
    if (!bctx) return null;
    bctx.filter = `blur(${feather}px)`;
    bctx.drawImage(mask, 0, 0);
    bctx.filter = "none";
    blurPlane = blurC;
  } else {
    blurPlane = mask;
  }

  let blurData: ImageData;
  try {
    const bctx = blurPlane.getContext("2d");
    if (!bctx) return null;
    blurData = bctx.getImageData(margin, margin, cw, ch);
  } catch {
    return null;
  }

  const out = document.createElement("canvas");
  out.width = cw;
  out.height = ch;
  const octx = out.getContext("2d");
  if (!octx) return null;
  const outImg = octx.createImageData(cw, ch);
  const d = blurData.data;
  const od = outImg.data;
  for (let i = 0; i < cw * ch; i++) {
    const a = d[i * 4] ?? 0;
    od[i * 4] = 255;
    od[i * 4 + 1] = 255;
    od[i * 4 + 2] = 255;
    od[i * 4 + 3] = a;
  }
  octx.putImageData(outImg, 0, 0);
  return out;
}

function applySoftMarqueeDestinationOut(
  octx: CanvasRenderingContext2D,
  mapper: PhotoMarqueePixelMapper,
  iw: number,
  ih: number,
  rects: PhotoMarqueeRect[],
  polys: PhotoMarqueePoint[][],
  ellipses: PhotoMarqueeEllipse[],
  featherPx: number,
): void {
  const bbox = computePhotoMarqueeImagePixelBBox(mapper, iw, ih, rects, polys, ellipses);
  if (!bbox) return;
  let { minIx, minIy, maxIx, maxIy } = bbox;
  const feather = Math.max(0, Math.min(200, featherPx));
  const grow = feather > 0.5 ? Math.ceil(feather * 2.5) : 0;
  if (grow > 0) {
    minIx = Math.max(0, minIx - grow);
    minIy = Math.max(0, minIy - grow);
    maxIx = Math.min(iw - 1, maxIx + grow);
    maxIy = Math.min(ih - 1, maxIy + grow);
  }
  const cw = maxIx - minIx + 1;
  const ch = maxIy - minIy + 1;
  const alphaCrop = buildPhotoMarqueeCropAlphaMask(
    mapper,
    iw,
    ih,
    minIx,
    minIy,
    cw,
    ch,
    rects,
    polys,
    ellipses,
    feather,
  );
  if (!alphaCrop) return;
  const punch = document.createElement("canvas");
  punch.width = iw;
  punch.height = ih;
  const pctx = punch.getContext("2d");
  if (!pctx) return;
  pctx.clearRect(0, 0, iw, ih);
  pctx.drawImage(alphaCrop, minIx, minIy);
  octx.save();
  octx.globalCompositeOperation = "destination-out";
  octx.drawImage(punch, 0, 0);
  octx.restore();
}

export async function extractPhotoMarqueeRasterFromImage(
  imgSrc: string,
  sourceLayerId: string,
  mapper: PhotoMarqueePixelMapper,
  rects: PhotoMarqueeRect[],
  polys: PhotoMarqueePoint[][],
  ellipses: PhotoMarqueeEllipse[],
  maskFeatherPx = 0,
): Promise<PhotoMarqueeRasterClip | null> {
  if (typeof document === "undefined") return null;
  const load = await new Promise<HTMLImageElement | null>((res) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => res(null);
    im.src = imgSrc;
  });
  if (!load || !load.complete) return null;
  const iw = load.naturalWidth || 1;
  const ih = load.naturalHeight || 1;

  const bbox0 = computePhotoMarqueeImagePixelBBox(mapper, iw, ih, rects, polys, ellipses);
  if (!bbox0) return null;
  let { minIx, minIy, maxIx, maxIy } = bbox0;
  const feather = Math.max(0, Math.min(200, maskFeatherPx));
  const grow = feather > 0.5 ? Math.ceil(feather * 2.5) : 0;
  if (grow > 0) {
    minIx = Math.max(0, minIx - grow);
    minIy = Math.max(0, minIy - grow);
    maxIx = Math.min(iw - 1, maxIx + grow);
    maxIy = Math.min(ih - 1, maxIy + grow);
  }
  const cw = maxIx - minIx + 1;
  const ch = maxIy - minIy + 1;

  const rgb = document.createElement("canvas");
  rgb.width = cw;
  rgb.height = ch;
  const rctx = rgb.getContext("2d");
  if (!rctx) return null;
  rctx.drawImage(load, minIx, minIy, cw, ch, 0, 0, cw, ch);

  const alphaMask = buildPhotoMarqueeCropAlphaMask(
    mapper,
    iw,
    ih,
    minIx,
    minIy,
    cw,
    ch,
    rects,
    polys,
    ellipses,
    feather,
  );
  if (!alphaMask) return null;

  const out = document.createElement("canvas");
  out.width = cw;
  out.height = ch;
  const octx = out.getContext("2d");
  if (!octx) return null;
  octx.drawImage(rgb, 0, 0);
  octx.globalCompositeOperation = "destination-in";
  octx.drawImage(alphaMask, 0, 0);
  octx.globalCompositeOperation = "source-over";

  let dataUrl: string;
  try {
    dataUrl = out.toDataURL("image/png");
  } catch {
    return null;
  }

  const worldBounds = mapper.pixelRectToWorldBounds(minIx, minIy, maxIx + 1, maxIy + 1);
  return {
    sourceLayerId,
    naturalWidth: iw,
    naturalHeight: ih,
    pixelCrop: { minIx, minIy, maxIx, maxIy },
    worldBounds,
    dataUrl,
    cropW: cw,
    cropH: ch,
  };
}

export async function rasterErasePhotoMarqueeRegionFromImage(
  imgSrc: string,
  mapper: PhotoMarqueePixelMapper,
  rects: PhotoMarqueeRect[],
  polys: PhotoMarqueePoint[][],
  ellipses: PhotoMarqueeEllipse[],
  maskFeatherPx = 0,
): Promise<string | null> {
  if (typeof document === "undefined") return null;
  const load = await new Promise<HTMLImageElement | null>((res) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => res(null);
    im.src = imgSrc;
  });
  if (!load?.complete) return null;
  const iw = load.naturalWidth || 1;
  const ih = load.naturalHeight || 1;
  const out = document.createElement("canvas");
  out.width = iw;
  out.height = ih;
  const octx = out.getContext("2d");
  if (!octx) return null;
  octx.drawImage(load, 0, 0);
  const feather = Math.max(0, Math.min(200, maskFeatherPx));
  const worldToPx = (wp: PhotoMarqueePoint) => {
    const f = mapper.worldToPixel(wp);
    if (!f) return null;
    return { x: f.ix, y: f.iy };
  };
  if (feather > 0.5) {
    applySoftMarqueeDestinationOut(octx, mapper, iw, ih, rects, polys, ellipses, feather);
  } else {
    octx.save();
    octx.globalCompositeOperation = "destination-out";
    fillMarqueePixelMaskPath(octx, worldToPx, rects, polys, ellipses);
    octx.fillStyle = "rgba(0,0,0,1)";
    octx.fill("evenodd");
    octx.restore();
  }
  try {
    return out.toDataURL("image/png");
  } catch {
    return null;
  }
}

/** Vista previa al mover la selección raster: textura + geometría inicial del hueco sobre la capa. */
export type PhotoMarqueeFloatLift = {
  sourceLayerId: string;
  dataUrl: string;
  cropW: number;
  cropH: number;
  liftRects: PhotoMarqueeRect[];
  liftPolys: PhotoMarqueePoint[][];
  liftEllipses: PhotoMarqueeEllipse[];
  maskFeatherPx: number;
};

export type PhotoMarqueeFloatTf = { rotationDeg: number; scaleX: number; scaleY: number };

export async function buildPhotoMarqueeFloatLiftFromMarquee(
  imgSrc: string,
  sourceLayerId: string,
  mapper: PhotoMarqueePixelMapper,
  rects: PhotoMarqueeRect[],
  polys: PhotoMarqueePoint[][],
  ellipses: PhotoMarqueeEllipse[],
  maskFeatherPx: number,
): Promise<PhotoMarqueeFloatLift | null> {
  const clip = await extractPhotoMarqueeRasterFromImage(
    imgSrc,
    sourceLayerId,
    mapper,
    rects,
    polys,
    ellipses,
    maskFeatherPx,
  );
  if (!clip) return null;
  return {
    sourceLayerId: clip.sourceLayerId,
    dataUrl: clip.dataUrl,
    cropW: clip.cropW,
    cropH: clip.cropH,
    liftRects: rects.map((r) => ({ ...r })),
    liftPolys: polys.map((ring) => ring.map((p) => ({ ...p }))),
    liftEllipses: ellipses.map((e) => ({ ...e })),
    maskFeatherPx: Math.max(0, Math.min(200, maskFeatherPx)),
  };
}

function meetInnerRectInWorld(outer: PhotoMarqueeWorldRect, intrinsicW: number, intrinsicH: number): PhotoMarqueeWorldRect {
  const iw = Math.max(1, intrinsicW);
  const ih = Math.max(1, intrinsicH);
  const s = Math.min(outer.w / iw, outer.h / ih);
  const rw = iw * s;
  const rh = ih * s;
  return {
    x: outer.x + (outer.w - rw) / 2,
    y: outer.y + (outer.h - rh) / 2,
    w: rw,
    h: rh,
  };
}

export function mapPhotoMarqueeFloatTf(
  p: PhotoMarqueePoint,
  u: PhotoMarqueeWorldRect,
  rotationDeg: number,
  scaleX: number,
  scaleY: number,
): PhotoMarqueePoint {
  const cx = u.x + u.w / 2;
  const cy = u.y + u.h / 2;
  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = (p.x - cx) * scaleX;
  const dy = (p.y - cy) * scaleY;
  const xr = dx * cos - dy * sin;
  const yr = dx * sin + dy * cos;
  return { x: xr + cx, y: yr + cy };
}

export async function rasterCommitPhotoMarqueeFloatToImage(
  imgSrc: string,
  mapper: PhotoMarqueePixelMapper,
  lift: PhotoMarqueeFloatLift,
  currentUnion: PhotoMarqueeWorldRect,
  tf: PhotoMarqueeFloatTf,
): Promise<string | null> {
  if (typeof document === "undefined") return null;
  const load = await new Promise<HTMLImageElement | null>((res) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => res(null);
    im.src = imgSrc;
  });
  const floatImg = await new Promise<HTMLImageElement | null>((res) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => res(null);
    im.src = lift.dataUrl;
  });
  if (!load?.complete || !floatImg?.complete) return null;
  const iw = load.naturalWidth || 1;
  const ih = load.naturalHeight || 1;
  const cw = lift.cropW;
  const ch = lift.cropH;

  const out = document.createElement("canvas");
  out.width = iw;
  out.height = ih;
  const octx = out.getContext("2d");
  if (!octx) return null;
  octx.drawImage(load, 0, 0);

  const worldToPx = (wp: PhotoMarqueePoint) => {
    const f = mapper.worldToPixel(wp);
    if (!f) return null;
    return { x: f.ix, y: f.iy };
  };

  if (lift.maskFeatherPx > 0.5) {
    applySoftMarqueeDestinationOut(
      octx,
      mapper,
      iw,
      ih,
      lift.liftRects,
      lift.liftPolys,
      lift.liftEllipses,
      lift.maskFeatherPx,
    );
  } else {
    octx.save();
    octx.globalCompositeOperation = "destination-out";
    fillMarqueePixelMaskPath(octx, worldToPx, lift.liftRects, lift.liftPolys, lift.liftEllipses);
    octx.fillStyle = "rgba(0,0,0,1)";
    octx.fill("evenodd");
    octx.restore();
  }

  const inner = meetInnerRectInWorld(currentUnion, cw, ch);
  const cornersWorld = [
    { x: inner.x, y: inner.y },
    { x: inner.x + inner.w, y: inner.y },
    { x: inner.x + inner.w, y: inner.y + inner.h },
    { x: inner.x, y: inner.y + inner.h },
  ].map((c) => mapPhotoMarqueeFloatTf(c, currentUnion, tf.rotationDeg, tf.scaleX, tf.scaleY));
  const cornersPx = cornersWorld
    .map((c) => mapper.worldToPixel(c))
    .filter((p): p is NonNullable<typeof p> => p != null);
  if (cornersPx.length !== 4) {
    try {
      return out.toDataURL("image/png");
    } catch {
      return null;
    }
  }
  const d0 = { x: cornersPx[0]!.ix, y: cornersPx[0]!.iy };
  const d1 = { x: cornersPx[1]!.ix, y: cornersPx[1]!.iy };
  const d2 = { x: cornersPx[3]!.ix, y: cornersPx[3]!.iy };

  const a = (d1.x - d0.x) / Math.max(cw, 1);
  const c = (d2.x - d0.x) / Math.max(ch, 1);
  const b = (d1.y - d0.y) / Math.max(cw, 1);
  const d = (d2.y - d0.y) / Math.max(ch, 1);
  const ee = d0.x;
  const f = d0.y;

  octx.save();
  octx.setTransform(a, b, c, d, ee, f);
  octx.globalCompositeOperation = "source-over";
  octx.drawImage(floatImg, 0, 0, cw, ch);
  octx.restore();

  try {
    return out.toDataURL("image/png");
  } catch {
    return null;
  }
}
