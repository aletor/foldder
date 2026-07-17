import { loadPdfJsDocumentFromBuffer } from "@/lib/brain/pdfjs-server";
import {
  parseConstructPathSegments,
  readConstructPathMinMax,
} from "@/lib/brandkit/ingest/page-vision-pdf-vector-walk";
import { applyPdfGState, createPdfGState, type PdfGState } from "./pdf-scan-gstate";
import { isNearWhiteHex, parsePdfRgbColor } from "./pdf-scan-color";
import { sanitizeSvgPathD } from "./pdf-scan-sanitize";
import { PDF_SCAN_MAX_DOCUMENT_PATHS, PDF_SCAN_MAX_PAGES } from "./pdf-scan-types";

export { applyPdfGState } from "./pdf-scan-gstate";

type PathSegment = { op: number; coords: number[] };

export type ExtractedPdfPath = {
  page: number;
  d: string;
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  opacity: number;
  blendMode: string;
  softMask: boolean;
};

export type ExtractedPdfClip = {
  page: number;
  mask: ExtractedPdfPath;
  content: ExtractedPdfPath[];
};

export type ExtractedPdfGroup = {
  page: number;
  /** Estable por página: p{n}_g{seq} — alinea con imágenes anidadas. */
  openId: string;
  kind: "transparency" | "form" | "softmask";
  opacity: number;
  blendMode: string;
  softMask: boolean;
  softMaskSubtype?: "Alpha" | "Luminosity";
  paths: ExtractedPdfPath[];
  clips: ExtractedPdfClip[];
};

export type ExtractedPdfVectors = {
  paths: ExtractedPdfPath[];
  clips: ExtractedPdfClip[];
  groups: ExtractedPdfGroup[];
  softMaskHits: number;
};

const IDENTITY = [1, 0, 0, 1, 0, 0];

function multiply(a: number[], b: number[]): number[] {
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

function transformMinMax(
  ctm: number[],
  minMax: { x1: number; y1: number; x2: number; y2: number },
): { x1: number; y1: number; x2: number; y2: number } {
  const corners: [number, number][] = [
    transformPoint(ctm, minMax.x1, minMax.y1),
    transformPoint(ctm, minMax.x2, minMax.y1),
    transformPoint(ctm, minMax.x1, minMax.y2),
    transformPoint(ctm, minMax.x2, minMax.y2),
  ];
  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => c[1]);
  return { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) };
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

function pdfPathToSvgD(segments: PathSegment[], pageHeightPt: number): string {
  const parts: string[] = [];
  for (const seg of segments) {
    const c = seg.coords;
    if (seg.op === 0 && c.length >= 2) parts.push(`M ${c[0]} ${pageHeightPt - c[1]!}`);
    else if (seg.op === 1 && c.length >= 2) parts.push(`L ${c[0]} ${pageHeightPt - c[1]!}`);
    else if (seg.op === 2 && c.length >= 6) {
      parts.push(
        `C ${c[0]} ${pageHeightPt - c[1]!} ${c[2]} ${pageHeightPt - c[3]!} ${c[4]} ${pageHeightPt - c[5]!}`,
      );
    } else if (seg.op === 4) parts.push("Z");
  }
  return parts.join(" ");
}

function parseRgb(args: unknown[]): string {
  return parsePdfRgbColor(args);
}

function scaleSvgD(d: string, scale: number): string {
  return d.replace(/-?\d*\.?\d+/g, (num) => {
    const n = Number(num);
    if (!Number.isFinite(n)) return num;
    return String(Math.round(n * scale * 1000) / 1000);
  });
}

type GroupFrame = {
  openId: string;
  kind: ExtractedPdfGroup["kind"];
  opacity: number;
  blendMode: string;
  softMask: boolean;
  softMaskSubtype?: "Alpha" | "Luminosity";
  paths: ExtractedPdfPath[];
  clips: ExtractedPdfClip[];
};

/**
 * Paths + clips + grupos (transparency / Form XObject / soft-mask runs).
 * Sin LLM.
 */
export async function extractPdfDocumentPaths(
  buffer: Buffer,
  options: { dpi: number; maxPages?: number; maxPaths?: number },
): Promise<ExtractedPdfVectors> {
  const dpi = options.dpi;
  const scale = dpi / 72;
  const maxPages = options.maxPages ?? PDF_SCAN_MAX_PAGES;
  const maxPaths = options.maxPaths ?? PDF_SCAN_MAX_DOCUMENT_PATHS;
  const loaded = await loadPdfJsDocumentFromBuffer(buffer);
  const pdf = await loaded.pdf;
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const ops = pdfjs.OPS as Record<string, number | undefined>;
  const paths: ExtractedPdfPath[] = [];
  const clips: ExtractedPdfClip[] = [];
  const groups: ExtractedPdfGroup[] = [];
  let softMaskHits = 0;

  try {
    const pageLimit = Math.min(pdf.numPages, maxPages);
    for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber += 1) {
      if (paths.length + clips.length + groups.length >= maxPaths) break;
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const pageWidthPt = viewport.width;
      const pageHeightPt = viewport.height;
      const ol = await page.getOperatorList();

      let fillColor = "#000000";
      let strokeColor = "#000000";
      let strokeWidth = 1;
      let gstate: PdfGState = createPdfGState();
      let ctm = [...IDENTITY];
      const ctmStack: number[][] = [];
      const gstateStack: PdfGState[] = [];
      let inTextDepth = 0;
      let pending: { segments: PathSegment[]; minMax: { x1: number; y1: number; x2: number; y2: number }; ctm: number[] } | null =
        null;
      let activeClip: { mask: ExtractedPdfPath; content: ExtractedPdfPath[]; depth: number } | null = null;
      const groupStack: GroupFrame[] = [];
      let softMaskGroup: GroupFrame | null = null;
      let softMaskWasOn = false;
      let groupSeq = 0;
      /** pdf.js emite `clip` y luego `constructPath(endPath|fill)` con la geometría. */
      let clipAwaitingPath = false;

      const nextOpenId = () => {
        groupSeq += 1;
        return `p${pageNumber}_g${groupSeq}`;
      };

      const pushPath = (path: ExtractedPdfPath) => {
        if (path.softMask) softMaskHits += 1;
        if (activeClip) {
          activeClip.content.push(path);
          return;
        }
        const top = groupStack[groupStack.length - 1] ?? softMaskGroup;
        if (top) top.paths.push(path);
        else paths.push(path);
      };

      const pushClip = (clip: ExtractedPdfClip) => {
        const top = groupStack[groupStack.length - 1] ?? softMaskGroup;
        if (top) top.clips.push(clip);
        else clips.push(clip);
      };

      const closeGroup = (frame: GroupFrame) => {
        // Puede quedar vacío de paths/clips y aún así recibir imágenes anidadas después.
        groups.push({ page: pageNumber, ...frame });
      };

      const syncSoftMaskGroup = () => {
        if (gstate.softMask && !softMaskWasOn) {
          softMaskGroup = {
            openId: nextOpenId(),
            kind: "softmask",
            opacity: gstate.fillAlpha,
            blendMode: gstate.blendMode,
            softMask: true,
            softMaskSubtype: gstate.softMaskSubtype ?? "Luminosity",
            paths: [],
            clips: [],
          };
        } else if (!gstate.softMask && softMaskWasOn && softMaskGroup) {
          closeGroup(softMaskGroup);
          softMaskGroup = null;
        }
        softMaskWasOn = gstate.softMask;
      };

      const buildPath = (fill: string, stroke: string, sw: number): ExtractedPdfPath | null => {
        if (!pending || inTextDepth > 0) {
          pending = null;
          return null;
        }
        const minMax = transformMinMax(pending.ctm, pending.minMax);
        const wPt = Math.abs(minMax.x2 - minMax.x1);
        const hPt = Math.abs(minMax.y2 - minMax.y1);
        const areaRatio = (wPt * hPt) / Math.max(1, pageWidthPt * pageHeightPt);
        // Conservar fondos de color a página completa; solo descartar blanco casi puro
        // (redundante con pageBackground white) o paths degenerados.
        if (wPt < 0.5 && hPt < 0.5) {
          pending = null;
          return null;
        }
        if (areaRatio > 0.92 && (fill === "none" || isNearWhiteHex(fill))) {
          pending = null;
          return null;
        }
        const segments = transformSegments(pending.ctm, pending.segments);
        const d = pdfPathToSvgD(segments, pageHeightPt);
        pending = null;
        if (!d) return null;
        const xPt = Math.min(minMax.x1, minMax.x2);
        const yTopPt = pageHeightPt - Math.max(minMax.y1, minMax.y2);
        return {
          page: pageNumber,
          d: sanitizeSvgPathD(scaleSvgD(d, scale)),
          x: Math.round(xPt * scale),
          y: Math.round(yTopPt * scale),
          w: Math.max(1, Math.round(wPt * scale)),
          h: Math.max(1, Math.round(hPt * scale)),
          fill,
          stroke,
          strokeWidth: Math.max(0, sw * scale),
          opacity: fill === "none" ? gstate.strokeAlpha : gstate.fillAlpha,
          blendMode: gstate.blendMode,
          softMask: gstate.softMask,
        };
      };

      const emit = (fill: string, stroke: string, sw: number) => {
        const path = buildPath(fill, stroke, sw);
        if (!path) return;
        pushPath(path);
      };

      for (let i = 0; i < ol.fnArray.length; i += 1) {
        if (paths.length + clips.length + groups.length >= maxPaths) break;
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
          gstateStack.push({ ...gstate });
          continue;
        }
        if (fn === ops.restore) {
          if (pending) emit(fillColor, "none", 0);
          if (activeClip && activeClip.depth === ctmStack.length) {
            if (activeClip.content.length > 0) pushClip({ page: pageNumber, mask: activeClip.mask, content: activeClip.content });
            else pushPath(activeClip.mask);
            activeClip = null;
          }
          ctm = ctmStack.pop() ?? [...IDENTITY];
          gstate = gstateStack.pop() ?? createPdfGState();
          syncSoftMaskGroup();
          continue;
        }
        if (fn === ops.setGState) {
          applyPdfGState(args, gstate);
          syncSoftMaskGroup();
          continue;
        }
        if (fn === ops.beginGroup) {
          if (pending) emit(fillColor, "none", 0);
          groupStack.push({
            openId: nextOpenId(),
            kind: "transparency",
            opacity: gstate.fillAlpha,
            blendMode: gstate.blendMode,
            softMask: gstate.softMask,
            paths: [],
            clips: [],
          });
          continue;
        }
        if (fn === ops.endGroup) {
          if (pending) emit(fillColor, "none", 0);
          const frame = groupStack.pop();
          if (frame) closeGroup(frame);
          continue;
        }
        if (fn === ops.paintFormXObjectBegin) {
          if (pending) emit(fillColor, "none", 0);
          groupStack.push({
            openId: nextOpenId(),
            kind: "form",
            opacity: gstate.fillAlpha,
            blendMode: gstate.blendMode,
            softMask: gstate.softMask,
            paths: [],
            clips: [],
          });
          continue;
        }
        if (fn === ops.paintFormXObjectEnd) {
          if (pending) emit(fillColor, "none", 0);
          const frame = groupStack.pop();
          if (frame) closeGroup(frame);
          continue;
        }
        if (fn === ops.transform && args.length >= 6) {
          ctm = multiply(ctm, args.map(Number));
          continue;
        }
        if (fn === ops.setFillRGBColor) fillColor = parseRgb(args);
        if (fn === ops.setStrokeRGBColor) strokeColor = parseRgb(args);
        if (fn === ops.setFillTransparent) fillColor = "none";
        if (fn === ops.setStrokeTransparent) strokeColor = "none";
        if (fn === ops.setLineWidth && typeof args[0] === "number") strokeWidth = args[0];

        if (fn === ops.constructPath) {
          const minMax = readConstructPathMinMax(args);
          const segments = parseConstructPathSegments(args[1]);
          const drawOp = typeof args[0] === "number" ? args[0] : null;
          if (minMax && segments.length) {
            if (pending) emit(fillColor, "none", 0);
            pending = { segments, minMax, ctm: [...ctm] };
            // pdf.js pliega fill/stroke/clip en constructPath via args[0] (OPS.fill=22, …).
            if (drawOp === ops.fill || drawOp === ops.eoFill) {
              if (clipAwaitingPath && !activeClip && pending) {
                const saved = {
                  segments: pending.segments,
                  minMax: { ...pending.minMax },
                  ctm: [...pending.ctm],
                };
                const mask = buildPath("none", "#000000", 0);
                if (mask) {
                  activeClip = { mask, content: [], depth: ctmStack.length };
                  pending = saved;
                  emit(fillColor, "none", 0);
                }
                clipAwaitingPath = false;
              } else {
                emit(fillColor, "none", 0);
              }
            } else if (drawOp === ops.stroke || drawOp === ops.closeStroke) {
              emit("none", strokeColor, strokeWidth);
            } else if (
              drawOp === ops.fillStroke ||
              drawOp === ops.eoFillStroke ||
              drawOp === ops.closeFillStroke ||
              drawOp === ops.closeEOFillStroke
            ) {
              emit(fillColor, strokeColor, strokeWidth);
            } else if ((drawOp === ops.clip || drawOp === ops.eoClip) && !activeClip) {
              const mask = buildPath("none", "#000000", 0);
              if (mask) activeClip = { mask, content: [], depth: ctmStack.length };
              clipAwaitingPath = false;
            } else if (drawOp === ops.endPath) {
              if (clipAwaitingPath && !activeClip) {
                const mask = buildPath("none", "#000000", 0);
                if (mask) activeClip = { mask, content: [], depth: ctmStack.length };
              } else {
                pending = null;
              }
              clipAwaitingPath = false;
            }
          }
          continue;
        }

        if (fn === ops.clip || fn === ops.eoClip) {
          clipAwaitingPath = true;
          continue;
        }

        if ((fn === ops.fill || fn === ops.eoFill) && pending) {
          emit(fillColor, "none", 0);
          continue;
        }
        if ((fn === ops.stroke || fn === ops.closeStroke) && pending) {
          emit("none", strokeColor, strokeWidth);
          continue;
        }
        if (
          (fn === ops.fillStroke ||
            fn === ops.eoFillStroke ||
            fn === ops.closeFillStroke ||
            fn === ops.closeEOFillStroke) &&
          pending
        ) {
          emit(fillColor, strokeColor, strokeWidth);
          continue;
        }
        if ((fn === ops.clip || fn === ops.eoClip) && pending && !activeClip) {
          const mask = buildPath("none", "#000000", 0);
          if (mask) activeClip = { mask, content: [], depth: ctmStack.length };
          continue;
        }

        // Image mask sólido: relleno del cuadrado unidad [0,1]² con el fill actual (CTM).
        if (fn === ops.paintSolidColorImageMask && fillColor !== "none") {
          if (pending) emit(fillColor, "none", 0);
          pending = {
            segments: [
              { op: 0, coords: [0, 0] },
              { op: 1, coords: [1, 0] },
              { op: 1, coords: [1, 1] },
              { op: 1, coords: [0, 1] },
              { op: 4, coords: [] },
            ],
            minMax: { x1: 0, y1: 0, x2: 1, y2: 1 },
            ctm: [...ctm],
          };
          emit(fillColor, "none", 0);
        }
      }
      if (pending) emit(fillColor, "none", 0);
      if (activeClip) {
        if (activeClip.content.length > 0) pushClip({ page: pageNumber, mask: activeClip.mask, content: activeClip.content });
        else pushPath(activeClip.mask);
      }
      while (groupStack.length) {
        const frame = groupStack.pop();
        if (frame) closeGroup(frame);
      }
      if (softMaskGroup) {
        closeGroup(softMaskGroup);
        softMaskGroup = null;
      }
    }
  } finally {
    await pdf.destroy();
  }

  return { paths, clips, groups, softMaskHits };
}
