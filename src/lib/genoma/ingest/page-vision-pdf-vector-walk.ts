/**
 * Operador paint-walk sobre content stream PDF → SVG (Fase B).
 * Depende del formato interno de args de pdf.js — ver pdfjs-construct-path-canary.test.ts
 */

import type { BBoxXYXY } from "./page-vision-pass-bbox";

type PathSegment = { op: number; coords: number[] };

type PdfMinMax = { x1: number; y1: number; x2: number; y2: number };

type SvgPathEl = {
  d: string;
  fill: string;
  pdfMinMax: PdfMinMax;
};

const IDENTITY_CTM = [1, 0, 0, 1, 0, 0];

function multiplyCtm(a: number[], b: number[]): number[] {
  return [
    a[0]! * b[0]! + a[2]! * b[1]!,
    a[1]! * b[0]! + a[3]! * b[1]!,
    a[0]! * b[2]! + a[2]! * b[3]!,
    a[1]! * b[2]! + a[3]! * b[3]!,
    a[0]! * b[4]! + a[2]! * b[5]! + a[4]!,
    a[1]! * b[4]! + a[3]! * b[5]! + a[5]!,
  ];
}

function transformPoint(ctm: number[], x: number, y: number): [number, number] {
  return [ctm[0]! * x + ctm[2]! * y + ctm[4]!, ctm[1]! * x + ctm[3]! * y + ctm[5]!];
}

function transformMinMax(ctm: number[], minMax: PdfMinMax): PdfMinMax {
  const corners: [number, number][] = [
    transformPoint(ctm, minMax.x1, minMax.y1),
    transformPoint(ctm, minMax.x2, minMax.y1),
    transformPoint(ctm, minMax.x1, minMax.y2),
    transformPoint(ctm, minMax.x2, minMax.y2),
  ];
  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => c[1]);
  return {
    x1: Math.min(...xs),
    y1: Math.min(...ys),
    x2: Math.max(...xs),
    y2: Math.max(...ys),
  };
}

function transformSegments(ctm: number[], segments: PathSegment[]): PathSegment[] {
  return segments.map((seg) => {
    if (seg.op === 4) return { op: 4, coords: [] };
    const coords: number[] = [];
    for (let i = 0; i < seg.coords.length; i += 2) {
      const [tx, ty] = transformPoint(ctm, seg.coords[i]!, seg.coords[i + 1]!);
      coords.push(tx, ty);
    }
    return { op: seg.op, coords };
  });
}

function bboxIntersects(a: BBoxXYXY, b: BBoxXYXY): boolean {
  return a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
}

function pdfMinMaxToNorm(minMax: PdfMinMax, pw: number, ph: number): BBoxXYXY {
  const x1 = minMax.x1 / pw;
  const y1 = 1 - minMax.y2 / ph;
  const x2 = minMax.x2 / pw;
  const y2 = 1 - minMax.y1 / ph;
  return [
    Math.max(0, Math.min(x1, x2)),
    Math.max(0, Math.min(y1, y2)),
    Math.min(1, Math.max(x1, x2)),
    Math.min(1, Math.max(y1, y2)),
  ];
}

function pathAreaRatio(minMax: PdfMinMax, pw: number, ph: number): number {
  const w = Math.abs(minMax.x2 - minMax.x1);
  const h = Math.abs(minMax.y2 - minMax.y1);
  return (w * h) / Math.max(1, pw * ph);
}

function parseFillColor(args: unknown[]): string {
  if (typeof args[0] === "string" && args[0].startsWith("#")) return args[0];
  if (args.length >= 3 && typeof args[0] === "number") {
    const r = Math.round(Math.min(1, Math.max(0, args[0] as number)) * 255);
    const g = Math.round(Math.min(1, Math.max(0, args[1] as number)) * 255);
    const b = Math.round(Math.min(1, Math.max(0, args[2] as number)) * 255);
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
  }
  return "#000000";
}

export function parseConstructPathSegments(raw: unknown): PathSegment[] {
  const items = Array.isArray(raw) ? raw : raw && typeof raw === "object" ? [raw] : [];
  const segments: PathSegment[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const segObj = item as Record<string, number>;
    const keys = Object.keys(segObj)
      .map(Number)
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b);
    for (let i = 0; i < keys.length; ) {
      const op = segObj[String(keys[i]!)];
      if (op === 4) {
        segments.push({ op: 4, coords: [] });
        i += 1;
        continue;
      }
      if (op === 0 || op === 1) {
        segments.push({ op, coords: [segObj[String(keys[i + 1]!)], segObj[String(keys[i + 2]!)]] });
        i += 3;
        continue;
      }
      if (op === 2) {
        segments.push({
          op: 2,
          coords: [
            segObj[String(keys[i + 1]!)],
            segObj[String(keys[i + 2]!)],
            segObj[String(keys[i + 3]!)],
            segObj[String(keys[i + 4]!)],
            segObj[String(keys[i + 5]!)],
            segObj[String(keys[i + 6]!)],
          ],
        });
        i += 7;
        continue;
      }
      i += 1;
    }
  }
  return segments;
}

/** pdf.js constructPath: args[1]=segmentos, args[2]=Float32Array minMax user space. */
export function readConstructPathMinMax(args: unknown[]): PdfMinMax | null {
  const minMax = args[2] as ArrayLike<number> | undefined;
  if (!minMax || minMax.length < 4) return null;
  const x1 = Number(minMax[0]);
  const y1 = Number(minMax[1]);
  const x2 = Number(minMax[2]);
  const y2 = Number(minMax[3]);
  if (![x1, y1, x2, y2].every(Number.isFinite)) return null;
  return { x1, y1, x2, y2 };
}

function pdfPathToSvgD(segments: PathSegment[], pageHeight: number): string {
  const parts: string[] = [];
  for (const seg of segments) {
    const c = seg.coords;
    if (seg.op === 0 && c.length >= 2) parts.push(`M ${c[0]} ${pageHeight - c[1]}`);
    else if (seg.op === 1 && c.length >= 2) parts.push(`L ${c[0]} ${pageHeight - c[1]}`);
    else if (seg.op === 2 && c.length >= 6) {
      parts.push(
        `C ${c[0]} ${pageHeight - c[1]} ${c[2]} ${pageHeight - c[3]} ${c[4]} ${pageHeight - c[5]}`,
      );
    } else if (seg.op === 4) parts.push("Z");
  }
  return parts.join(" ");
}

type AxialGradientDef = {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stops: Array<{ offset: number; color: string }>;
};

function parseAxialShadingPattern(raw: unknown, ph: number): Omit<AxialGradientDef, "id"> | null {
  if (!Array.isArray(raw) || raw[1] !== "axial") return null;
  const stopsRaw = raw[3] as Array<[number, string]> | undefined;
  const coords = raw[4] as [number, number] | undefined;
  const coordsEnd = raw[5] as [number, number] | undefined;
  if (!stopsRaw?.length || !coords || !coordsEnd) return null;
  return {
    x1: coords[0],
    y1: ph - coords[1],
    x2: coordsEnd[0],
    y2: ph - coordsEnd[1],
    stops: stopsRaw.map(([offset, color]) => ({ offset, color })),
  };
}

function shouldIncludePath(minMax: PdfMinMax, targetBbox: BBoxXYXY, pw: number, ph: number): boolean {
  if (pathAreaRatio(minMax, pw, ph) > 0.12) return false;
  const norm = pdfMinMaxToNorm(minMax, pw, ph);
  return bboxIntersects(norm, targetBbox);
}

function inLogoClusterPath(
  minMax: PdfMinMax,
  targetBbox: BBoxXYXY,
  pw: number,
  ph: number,
  inTextDepth: number,
): boolean {
  if (inTextDepth > 0) return true;
  return shouldIncludePath(minMax, targetBbox, pw, ph);
}

function shouldApplySeparatorAreaFilter(
  minMax: PdfMinMax,
  targetBbox: BBoxXYXY,
  pw: number,
  ph: number,
  inTextDepth: number,
): boolean {
  return !inLogoClusterPath(minMax, targetBbox, pw, ph, inTextDepth);
}

export type PathFilterRule =
  | "accepted"
  | "outside_target_bbox"
  | "page_clip_area_ratio_gt_0.12"
  | "restore_area_ratio_gte_0.008"
  | "clip_area_ratio_gte_0.002"
  | "orphan_glyph_emitted"
  | "orphan_glyph_discarded";

export type PaintWalkPathAuditEntry = {
  opIndex: number;
  emitOp: string;
  x: number;
  w: number;
  h: number;
  areaRatio: number;
  inTextDepth: number;
  decision: "accepted" | "rejected";
  rule: PathFilterRule;
};

export type PaintWalkAudit = {
  beforeCount: number;
  afterCount: number;
  entries: PaintWalkPathAuditEntry[];
};

type PaintWalkPage = {
  getOperatorList(): Promise<{ fnArray: number[]; argsArray: unknown[][] }>;
  objs: { get(name: string): Promise<unknown> };
};

type PaintWalkOps = Record<string, number | undefined>;

/** Recorre el content stream y emite paths SVG dentro del bbox objetivo. */
export async function walkPdfPaintToSvgPaths(input: {
  page: PaintWalkPage;
  ops: PaintWalkOps;
  pageWidth: number;
  pageHeight: number;
  targetBbox: BBoxXYXY;
  collectAudit?: boolean;
}): Promise<{ paths: SvgPathEl[]; gradients: AxialGradientDef[]; audit?: PaintWalkAudit }> {
  const { page, ops, pageWidth: pw, pageHeight: ph, targetBbox, collectAudit } = input;
  const ol = await page.getOperatorList();
  const paths: SvgPathEl[] = [];
  const gradients: AxialGradientDef[] = [];
  const gradientCache = new Map<string, string>();
  const auditEntries: PaintWalkPathAuditEntry[] = [];
  let beforeCount = 0;

  let fillColor = "#000000";
  let pending: { opIndex: number; segments: PathSegment[]; minMax: PdfMinMax; ctm: number[] } | null = null;
  let gradientCounter = 0;
  let ctm = [...IDENTITY_CTM];
  const ctmStack: number[][] = [];
  let inTextDepth = 0;

  const recordAudit = (
    pendingPath: { opIndex: number; minMax: PdfMinMax; ctm: number[] },
    emitOp: string,
    decision: "accepted" | "rejected",
    rule: PathFilterRule,
  ) => {
    if (!collectAudit) return;
    const txMinMax = transformMinMax(pendingPath.ctm, pendingPath.minMax);
    auditEntries.push({
      opIndex: pendingPath.opIndex,
      emitOp,
      x: (txMinMax.x1 + txMinMax.x2) / 2,
      w: Math.abs(txMinMax.x2 - txMinMax.x1),
      h: Math.abs(txMinMax.y2 - txMinMax.y1),
      areaRatio: pathAreaRatio(txMinMax, pw, ph),
      inTextDepth,
      decision,
      rule,
    });
  };

  const emitPath = (
    minMax: PdfMinMax,
    segments: PathSegment[],
    fill: string,
    pendingPath: { opIndex: number; minMax: PdfMinMax; ctm: number[] },
    emitOp: string,
    rule: PathFilterRule = "accepted",
  ) => {
    if (!shouldIncludePath(minMax, targetBbox, pw, ph)) {
      recordAudit(pendingPath, emitOp, "rejected", "outside_target_bbox");
      return;
    }
    const d = pdfPathToSvgD(segments, ph);
    if (!d) {
      recordAudit(pendingPath, emitOp, "rejected", rule === "accepted" ? "outside_target_bbox" : rule);
      return;
    }
    recordAudit(pendingPath, emitOp, "accepted", rule);
    paths.push({ d, fill, pdfMinMax: minMax });
  };

  const emitPending = (
    pendingPath: { opIndex: number; segments: PathSegment[]; minMax: PdfMinMax; ctm: number[] },
    fill: string,
    emitOp: string,
    rule: PathFilterRule = "accepted",
  ) => {
    const minMax = transformMinMax(pendingPath.ctm, pendingPath.minMax);
    const segments = transformSegments(pendingPath.ctm, pendingPath.segments);
    emitPath(minMax, segments, fill, pendingPath, emitOp, rule);
  };

  const tryEmitWithSeparatorRules = (
    pendingPath: { opIndex: number; segments: PathSegment[]; minMax: PdfMinMax; ctm: number[] },
    fill: string,
    emitOp: "restore" | "clip",
    areaLimit: number,
  ) => {
    const txMinMax = transformMinMax(pendingPath.ctm, pendingPath.minMax);
    if (!shouldIncludePath(txMinMax, targetBbox, pw, ph)) {
      recordAudit(pendingPath, emitOp, "rejected", "outside_target_bbox");
      return;
    }
    const ar = pathAreaRatio(txMinMax, pw, ph);
    if (ar > 0.12) {
      recordAudit(pendingPath, emitOp, "rejected", "page_clip_area_ratio_gt_0.12");
      return;
    }
    if (shouldApplySeparatorAreaFilter(txMinMax, targetBbox, pw, ph, inTextDepth) && ar >= areaLimit) {
      recordAudit(
        pendingPath,
        emitOp,
        "rejected",
        areaLimit === 0.008 ? "restore_area_ratio_gte_0.008" : "clip_area_ratio_gte_0.002",
      );
      return;
    }
    emitPending(pendingPath, fill, emitOp);
  };

  const emitOrphanPendingBeforeReplace = () => {
    if (!pending) return;
    const txMinMax = transformMinMax(pending.ctm, pending.minMax);
    const ar = pathAreaRatio(txMinMax, pw, ph);
    if (
      inLogoClusterPath(txMinMax, targetBbox, pw, ph, inTextDepth) &&
      ar < 0.008 &&
      shouldIncludePath(txMinMax, targetBbox, pw, ph)
    ) {
      emitPending(pending, fillColor, "constructPath", "orphan_glyph_emitted");
    } else if (collectAudit && shouldIncludePath(txMinMax, targetBbox, pw, ph)) {
      recordAudit(pending, "constructPath", "rejected", "orphan_glyph_discarded");
    }
    pending = null;
  };

  for (let i = 0; i < ol.fnArray.length; i += 1) {
    const fn = ol.fnArray[i]!;
    const args = ol.argsArray[i] ?? [];

    if (fn === ops.beginText) {
      inTextDepth += 1;
      continue;
    }
    if (fn === ops.endText) {
      inTextDepth = Math.max(0, inTextDepth - 1);
      continue;
    }

    if (fn === ops.save) {
      ctmStack.push([...ctm]);
      continue;
    }

    if (fn === ops.restore) {
      if (pending) {
        tryEmitWithSeparatorRules(pending, fillColor, "restore", 0.008);
        pending = null;
      }
      ctm = ctmStack.pop() ?? [...IDENTITY_CTM];
      continue;
    }

    if (fn === ops.transform && args.length >= 6) {
      const t = args.map(Number) as number[];
      ctm = multiplyCtm(ctm, t);
      continue;
    }

    if (fn === ops.setFillRGBColor) {
      fillColor = parseFillColor(args);
    }

    if (fn === ops.constructPath) {
      const minMax = readConstructPathMinMax(args);
      const segments = parseConstructPathSegments(args[1]);
      if (minMax && segments.length) {
        if (collectAudit) {
          const txMinMax = transformMinMax(ctm, minMax);
          if (shouldIncludePath(txMinMax, targetBbox, pw, ph)) beforeCount += 1;
        }
        emitOrphanPendingBeforeReplace();
        pending = { opIndex: i, segments, minMax, ctm: [...ctm] };
      }
      continue;
    }

    if (fn === ops.shadingFill && pending) {
      const patternName = typeof args[0] === "string" ? args[0] : null;
      let fill = fillColor;
      if (patternName) {
        let gradId = gradientCache.get(patternName);
        if (!gradId) {
          const shading = await page.objs.get(patternName);
          const parsed = parseAxialShadingPattern(shading, ph);
          if (parsed) {
            gradId = `g${gradientCounter++}`;
            gradients.push({ id: gradId, ...parsed });
            gradientCache.set(patternName, gradId);
          }
        }
        if (gradId) fill = `url(#${gradId})`;
      }
      emitPending(pending, fill, "shadingFill");
      pending = null;
      continue;
    }

    if ((fn === ops.fill || fn === ops.eoFill) && pending) {
      emitPending(pending, fillColor, "fill");
      pending = null;
      continue;
    }

    if (fn === ops.clip || fn === ops.eoClip) {
      if (pending) {
        tryEmitWithSeparatorRules(pending, fillColor, "clip", 0.002);
      }
      pending = null;
    }
  }

  const audit: PaintWalkAudit | undefined = collectAudit
    ? { beforeCount, afterCount: paths.length, entries: auditEntries }
    : undefined;
  return { paths, gradients, audit };
}

export function composeSvgFromPaintWalk(input: {
  paths: SvgPathEl[];
  gradients: AxialGradientDef[];
  pageHeight: number;
}): string | null {
  if (!input.paths.length) return null;
  const union = input.paths.reduce(
    (acc, p) => ({
      x1: Math.min(acc.x1, p.pdfMinMax.x1),
      y1: Math.min(acc.y1, p.pdfMinMax.y1),
      x2: Math.max(acc.x2, p.pdfMinMax.x2),
      y2: Math.max(acc.y2, p.pdfMinMax.y2),
    }),
    { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity },
  );
  const vbX = union.x1;
  const vbY = input.pageHeight - union.y2;
  const vbW = Math.max(0.001, union.x2 - union.x1);
  const vbH = Math.max(0.001, union.y2 - union.y1);
  const defs = input.gradients
    .map(
      (g) =>
        `<linearGradient id="${g.id}" gradientUnits="objectBoundingBox" x1="0" y1="0.5" x2="1" y2="0.5">${g.stops.map((s) => `<stop offset="${s.offset}" stop-color="${s.color}"/>`).join("")}</linearGradient>`,
    )
    .join("");
  const pathEls = input.paths
    .map((p) => `<path d="${p.d}" fill="${p.fill}" fill-rule="nonzero"/>`)
    .join("");
  const defsBlock = defs ? `<defs>${defs}</defs>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vbX.toFixed(2)} ${vbY.toFixed(2)} ${vbW.toFixed(2)} ${vbH.toFixed(2)}">${defsBlock}${pathEls}</svg>`;
}

/** Formato esperado de args en constructPath — canario anti-upgrade pdf.js. */
export function assertConstructPathArgsFormat(args: unknown[]): void {
  if (args.length < 3) {
    throw new Error(
      "pdf.js constructPath: se esperaban ≥3 args [opCount, segments[], Float32Array minMax]. " +
        "¿Cambió el formato tras upgrade de pdfjs-dist? Ver pdfjs-construct-path-canary.test.ts",
    );
  }
  const minMax = args[2];
  if (!minMax || typeof (minMax as ArrayLike<number>).length !== "number" || (minMax as ArrayLike<number>).length < 4) {
    throw new Error(
      "pdf.js constructPath: args[2] debe ser Float32Array minMax (len≥4). " +
        "¿Cambió el formato tras upgrade de pdfjs-dist?",
    );
  }
}

export const PDFJS_CONSTRUCT_PATH_CANARY = {
  opCount: 28,
  minMax: [271.1449890136719, 274.2690124511719, 330.8529968261719, 350.2569885253906] as const,
};

export type PdfPaintObjectKind = "vector_path" | "xobject";

export type PdfPaintObjectRecord = {
  kind: PdfPaintObjectKind;
  bbox: BBoxXYXY;
  areaRatio: number;
};

function imageUnitSquareMinMax(ctm: number[]): PdfMinMax {
  const corners: [number, number][] = [
    transformPoint(ctm, 0, 0),
    transformPoint(ctm, 1, 0),
    transformPoint(ctm, 0, 1),
    transformPoint(ctm, 1, 1),
  ];
  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => c[1]);
  return {
    x1: Math.min(...xs),
    y1: Math.min(...ys),
    x2: Math.max(...xs),
    y2: Math.max(...ys),
  };
}

function pushPaintObject(
  out: PdfPaintObjectRecord[],
  kind: PdfPaintObjectKind,
  minMax: PdfMinMax,
  pw: number,
  ph: number,
  minAreaRatio: number,
  maxAreaRatio: number,
) {
  const ar = pathAreaRatio(minMax, pw, ph);
  if (ar < minAreaRatio || ar > maxAreaRatio) return;
  out.push({ kind, bbox: pdfMinMaxToNorm(minMax, pw, ph), areaRatio: ar });
}

/** Enumera bboxes exactos de paths vectoriales y XObjects pintados en la página. */
export async function enumeratePdfPaintObjectBboxes(input: {
  page: PaintWalkPage;
  ops: PaintWalkOps;
  pageWidth: number;
  pageHeight: number;
  minAreaRatio?: number;
  maxAreaRatio?: number;
}): Promise<PdfPaintObjectRecord[]> {
  const { page, ops, pageWidth: pw, pageHeight: ph } = input;
  const minAreaRatio = input.minAreaRatio ?? 0.00002;
  const maxAreaRatio = input.maxAreaRatio ?? 0.18;
  const ol = await page.getOperatorList();
  const out: PdfPaintObjectRecord[] = [];

  let pending: { minMax: PdfMinMax; ctm: number[] } | null = null;
  let ctm = [...IDENTITY_CTM];
  const ctmStack: number[][] = [];

  const imageOps = new Set(
    [ops.paintImageXObject, ops.paintInlineImageXObject, ops.paintJpegXObject].filter(
      (v): v is number => typeof v === "number",
    ),
  );

  const emitPendingPath = () => {
    if (!pending) return;
    const txMinMax = transformMinMax(pending.ctm, pending.minMax);
    pushPaintObject(out, "vector_path", txMinMax, pw, ph, minAreaRatio, maxAreaRatio);
    pending = null;
  };

  for (let i = 0; i < ol.fnArray.length; i += 1) {
    const fn = ol.fnArray[i]!;
    const args = ol.argsArray[i] ?? [];

    if (fn === ops.save) {
      ctmStack.push([...ctm]);
      continue;
    }
    if (fn === ops.restore) {
      emitPendingPath();
      ctm = ctmStack.pop() ?? [...IDENTITY_CTM];
      continue;
    }
    if (fn === ops.transform && args.length >= 6) {
      ctm = multiplyCtm(ctm, args.map(Number) as number[]);
      continue;
    }
    if (fn === ops.constructPath) {
      const minMax = readConstructPathMinMax(args);
      if (minMax) pending = { minMax, ctm: [...ctm] };
      continue;
    }
    if ((fn === ops.fill || fn === ops.eoFill || fn === ops.shadingFill) && pending) {
      emitPendingPath();
      continue;
    }
    if ((fn === ops.clip || fn === ops.eoClip) && pending) {
      emitPendingPath();
      continue;
    }
    if (imageOps.has(fn)) {
      emitPendingPath();
      pushPaintObject(out, "xobject", imageUnitSquareMinMax(ctm), pw, ph, minAreaRatio, maxAreaRatio);
    }
  }

  return out;
}
