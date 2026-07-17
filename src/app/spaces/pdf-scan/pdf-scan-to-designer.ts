import { solidFill } from "../freehand/fill";
import { DEFAULT_DOCUMENT_FONT_FAMILY, DEFAULT_DOCUMENT_FONT_WEIGHT } from "../freehand/google-fonts";
import { DEFAULT_DESIGNER_PAGE_FORMAT } from "../indesign/page-formats";
import type { FreehandObject, TextObject } from "../FreehandStudio";
import type { DesignerPageState } from "../designer/DesignerNode";
import type { MediaListItem, MediaListOutput } from "../media-list-output";
import type {
  PdfDocumentLayoutOutput,
  PdfDocumentObject,
  PdfScanImageAsset,
  PdfScanLayoutOutput,
} from "@/lib/pdf-scan/pdf-scan-types";
import {
  isPdfDocumentLayoutOutput,
  isPdfScanAnyLayoutOutput,
  isPdfScanLayoutOutput,
} from "@/lib/pdf-scan/pdf-scan-types";

export { isPdfDocumentLayoutOutput, isPdfScanAnyLayoutOutput, isPdfScanLayoutOutput };

export function buildMediaListFromPdfScanImages(args: {
  nodeId: string;
  jobId: string;
  title: string;
  images: PdfScanImageAsset[];
}): MediaListOutput {
  const items: MediaListItem[] = args.images.map((img, order) => ({
    id: img.id,
    order,
    title: `Imagen p${img.page} · ${img.width}×${img.height}`,
    mediaType: "image",
    url: img.url,
    s3Key: img.s3Key,
    width: img.width,
    height: img.height,
    status: "generated",
    metadata: {
      pdfScanJobId: args.jobId,
      pageNumber: img.page,
      contentHash: img.contentHash,
    },
  }));

  return {
    kind: "media_list",
    sourceNodeId: args.nodeId,
    sourceNodeType: "pdfScan",
    title: args.title,
    status: items.length ? "frames_ready" : "empty",
    items,
    metadata: {
      cineNodeId: args.nodeId,
      generatedAt: new Date().toISOString(),
      totalFrames: items.length,
    },
  };
}

function imageObject(args: {
  id: string;
  name: string;
  src: string;
  x?: number;
  y?: number;
  width: number;
  height: number;
  locked?: boolean;
  rotation?: number;
  opacity?: number;
  blendMode?: string;
}): FreehandObject {
  return {
    id: args.id,
    type: "image",
    x: args.x ?? 0,
    y: args.y ?? 0,
    width: args.width,
    height: args.height,
    fill: solidFill("none"),
    stroke: "none",
    strokeWidth: 0,
    opacity: args.opacity ?? 1,
    blendMode: (args.blendMode as FreehandObject["blendMode"]) ?? "normal",
    rotation: args.rotation ?? 0,
    visible: true,
    locked: args.locked ?? true,
    name: args.name,
    src: args.src,
    intrinsicRatio: args.width / Math.max(1, args.height),
  } as unknown as FreehandObject;
}

function textObject(args: {
  id: string;
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  fontSize: number;
  fontFamily?: string;
  fontWeight?: number;
  italic?: boolean;
  opacity?: number;
  color?: string;
}): TextObject {
  return {
    id: args.id,
    type: "text",
    textMode: "area",
    text: args.text,
    x: args.x,
    y: args.y,
    width: Math.max(args.w, args.fontSize * 2),
    height: Math.max(args.h, args.fontSize * 1.2),
    fill: solidFill(args.color && args.color !== "none" ? args.color : "#111827"),
    stroke: "none",
    strokeWidth: 0,
    strokeLinecap: "butt",
    strokeLinejoin: "miter",
    strokeDasharray: "",
    opacity: args.opacity ?? 1,
    blendMode: "normal",
    rotation: 0,
    visible: true,
    locked: false,
    name: args.text.slice(0, 40).replace(/\n/g, " "),
    fontFamily: args.fontFamily ?? DEFAULT_DOCUMENT_FONT_FAMILY,
    fontSize: args.fontSize,
    fontWeight: args.fontWeight ?? DEFAULT_DOCUMENT_FONT_WEIGHT,
    fontStyle: args.italic ? "italic" : "normal",
    lineHeight: 1.25,
    letterSpacing: 0,
    textAlign: "left",
  };
}

/** Traslada pares x,y absolutos en un `d` SVG (heurística igual que svg-import). */
function translateSvgPathD(d: string, dx: number, dy: number): string {
  if ((dx === 0 && dy === 0) || !d) return d;
  let numIdx = 0;
  return d.replace(/[-+]?[0-9]*\.?[0-9]+([eE][-+]?\d+)?/g, (m) => {
    const n = parseFloat(m);
    const t = numIdx % 2 === 0 ? dx : dy;
    numIdx += 1;
    return String(Math.round((n + t) * 1000) / 1000);
  });
}

/** Detecta rectángulo eje-alineado en coords de página (M/L/Z). */
export function isAxisAlignedRectPathD(d: string, x: number, y: number, w: number, h: number): boolean {
  const nums = [...d.matchAll(/[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/g)].map((m) => parseFloat(m[0]!));
  if (nums.length < 8) return false;
  if (!/z/i.test(d)) return false;
  const xs = nums.filter((_, i) => i % 2 === 0);
  const ys = nums.filter((_, i) => i % 2 === 1);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const tol = 1.5;
  return (
    Math.abs(minX - x) <= tol &&
    Math.abs(minY - y) <= tol &&
    Math.abs(maxX - (x + w)) <= tol &&
    Math.abs(maxY - (y + h)) <= tol &&
    xs.every((v) => Math.abs(v - minX) <= tol || Math.abs(v - maxX) <= tol) &&
    ys.every((v) => Math.abs(v - minY) <= tol || Math.abs(v - maxY) <= tol)
  );
}

function rectObject(args: {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  opacity?: number;
  blendMode?: string;
  name?: string;
}): FreehandObject {
  return {
    id: args.id,
    type: "rect",
    x: args.x,
    y: args.y,
    width: args.w,
    height: args.h,
    fill: solidFill(args.fill === "none" ? "none" : args.fill),
    stroke: args.stroke === "none" ? "none" : args.stroke,
    strokeWidth: args.strokeWidth,
    strokeLinecap: "butt",
    strokeLinejoin: "miter",
    strokeDasharray: "",
    opacity: args.opacity ?? 1,
    blendMode: (args.blendMode as FreehandObject["blendMode"]) ?? "normal",
    rotation: 0,
    visible: true,
    locked: false,
    name: args.name ?? "Rectangle",
    cornerRadius: 0,
  } as unknown as FreehandObject;
}

function pathObject(args: {
  id: string;
  d: string;
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  opacity?: number;
  blendMode?: string;
}): FreehandObject {
  const hasFill = args.fill !== "none";
  // Freehand pinta fill solo si closed; forzar cerrado cuando hay relleno.
  const closed = hasFill || /z/i.test(args.d);
  // Coords locales 0…w/h + intrínsecos: el render hace translate(x,y) scale(w/iw,h/ih).
  const localD = translateSvgPathD(args.d, -args.x, -args.y);
  return {
    id: args.id,
    type: "path",
    x: args.x,
    y: args.y,
    width: args.w,
    height: args.h,
    fill: solidFill(hasFill ? args.fill : "none"),
    stroke: args.stroke,
    strokeWidth: args.strokeWidth,
    strokeLinecap: "butt",
    strokeLinejoin: "miter",
    strokeDasharray: "",
    opacity: args.opacity ?? 1,
    blendMode: (args.blendMode as FreehandObject["blendMode"]) ?? "normal",
    rotation: 0,
    visible: true,
    locked: false,
    name: "Path",
    points: [],
    closed,
    svgPathD: localD,
    svgPathIntrinsicW: Math.max(1, args.w),
    svgPathIntrinsicH: Math.max(1, args.h),
  } as unknown as FreehandObject;
}

function pathOrRectObject(args: {
  id: string;
  d: string;
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  opacity?: number;
  blendMode?: string;
}): FreehandObject {
  if (
    args.fill !== "none" &&
    args.stroke === "none" &&
    isAxisAlignedRectPathD(args.d, args.x, args.y, args.w, args.h)
  ) {
    return rectObject({
      id: args.id,
      x: args.x,
      y: args.y,
      w: args.w,
      h: args.h,
      fill: args.fill,
      stroke: "none",
      strokeWidth: 0,
      opacity: args.opacity,
      blendMode: args.blendMode,
      name: "Rectangle",
    });
  }
  return pathObject(args);
}

function offsetFreehandToLocal(obj: FreehandObject, ox: number, oy: number): FreehandObject {
  return { ...obj, x: obj.x - ox, y: obj.y - oy };
}

function documentObjectToFreehand(obj: PdfDocumentObject): FreehandObject {
  if (obj.type === "text") {
    return textObject({
      id: obj.id,
      text: obj.text,
      x: obj.x,
      y: obj.y,
      w: obj.w,
      h: obj.h,
      fontSize: obj.fontSize,
      fontFamily: obj.fontFamily,
      fontWeight: obj.fontWeight,
      italic: obj.italic,
      opacity: obj.opacity,
      color: obj.color,
    });
  }
  if (obj.type === "image") {
    return imageObject({
      id: obj.id,
      name: obj.fallback ? "Fallback raster" : "Image",
      src: obj.src,
      x: obj.x,
      y: obj.y,
      width: obj.w,
      height: obj.h,
      locked: Boolean(obj.fallback),
      rotation: obj.rotation ?? 0,
      opacity: obj.opacity,
      blendMode: obj.blendMode,
    });
  }
  if (obj.type === "clip") {
    const x = Math.min(obj.maskX, ...obj.content.map((c) => c.x));
    const y = Math.min(obj.maskY, ...obj.content.map((c) => c.y));
    const right = Math.max(obj.maskX + obj.maskW, ...obj.content.map((c) => c.x + c.w));
    const bottom = Math.max(obj.maskY + obj.maskH, ...obj.content.map((c) => c.y + c.h));
    const maskWorld = pathOrRectObject({
      id: `${obj.id}_mask`,
      d: obj.maskD,
      x: obj.maskX,
      y: obj.maskY,
      w: obj.maskW,
      h: obj.maskH,
      fill: "none",
      stroke: "none",
      strokeWidth: 0,
    });
    const contentWorld = obj.content.map(documentObjectToFreehand);
    return {
      id: obj.id,
      type: "clippingContainer",
      x,
      y,
      width: Math.max(1, right - x),
      height: Math.max(1, bottom - y),
      fill: solidFill("none"),
      stroke: "none",
      strokeWidth: 0,
      strokeLinecap: "butt",
      strokeLinejoin: "miter",
      strokeDasharray: "",
      opacity: 1,
      blendMode: "normal",
      rotation: 0,
      visible: true,
      locked: false,
      name: "Clip",
      mask: offsetFreehandToLocal(maskWorld, x, y),
      content: contentWorld.map((ch) => offsetFreehandToLocal(ch, x, y)),
    } as unknown as FreehandObject;
  }
  if (obj.type === "group") {
    const children = obj.children.map(documentObjectToFreehand);
    if (!children.length) {
      return pathObject({
        id: obj.id,
        d: "M 0 0 L 1 0 L 1 1 L 0 1 Z",
        x: 0,
        y: 0,
        w: 1,
        h: 1,
        fill: "none",
        stroke: "none",
        strokeWidth: 0,
      });
    }
    const xs = children.map((c) => c.x);
    const ys = children.map((c) => c.y);
    const rights = children.map((c) => c.x + c.width);
    const bottoms = children.map((c) => c.y + c.height);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return {
      id: obj.id,
      type: "groupContainer",
      x,
      y,
      width: Math.max(1, Math.max(...rights) - x),
      height: Math.max(1, Math.max(...bottoms) - y),
      fill: solidFill("none"),
      stroke: "none",
      strokeWidth: 0,
      strokeLinecap: "butt",
      strokeLinejoin: "miter",
      strokeDasharray: "",
      opacity: obj.opacity ?? 1,
      blendMode: (obj.blendMode as FreehandObject["blendMode"]) ?? "normal",
      rotation: 0,
      visible: true,
      locked: false,
      name:
        obj.kind === "softmask"
          ? "Soft mask"
          : obj.kind === "form"
            ? "Form"
            : "Transparency group",
      children,
      layerMask: obj.layerMask?.src
        ? {
            src: obj.layerMask.src,
            pixelW: obj.layerMask.pixelW,
            pixelH: obj.layerMask.pixelH,
            enabled: true,
            inverted: Boolean(obj.layerMask.inverted),
          }
        : undefined,
    } as unknown as FreehandObject;
  }
  return pathOrRectObject({
    ...obj,
    opacity: obj.opacity,
    blendMode: obj.blendMode,
  });
}

export function buildDesignerPagesFromPdfScan(
  output: PdfScanLayoutOutput,
  pageIdPrefix: string,
): DesignerPageState[] {
  return output.pages.map((page) => {
    const bg = imageObject({
      id: `${pageIdPrefix}_p${page.pageNumber}_bg`,
      name: `PDF p${page.pageNumber}`,
      src: page.backgroundUrl,
      width: page.widthPx,
      height: page.heightPx,
      locked: true,
    });
    const texts = page.textSpans.map((span) =>
      textObject({
        id: `${pageIdPrefix}_${span.id}`,
        text: span.text,
        x: span.x,
        y: span.y,
        w: span.w,
        h: span.h,
        fontSize: span.fontSize,
        fontFamily: span.fontFamily,
        fontWeight: span.fontWeight,
        italic: span.italic,
        color: span.color,
      }),
    );
    return {
      id: `${pageIdPrefix}_p${page.pageNumber}`,
      format: DEFAULT_DESIGNER_PAGE_FORMAT,
      customWidth: page.widthPx,
      customHeight: page.heightPx,
      pageBackground: "white",
      objects: [bg, ...texts],
      textFrames: [],
      imageFrames: [],
      stories: [],
    } satisfies DesignerPageState;
  });
}

export function buildDesignerPagesFromPdfDocument(
  output: PdfDocumentLayoutOutput,
  pageIdPrefix: string,
): DesignerPageState[] {
  return output.pages.map((page) => ({
    id: `${pageIdPrefix}_p${page.pageNumber}`,
    format: DEFAULT_DESIGNER_PAGE_FORMAT,
    customWidth: page.widthPx,
    customHeight: page.heightPx,
    pageBackground: "white",
    objects: page.objects.map(documentObjectToFreehand),
    textFrames: [],
    imageFrames: [],
    stories: [],
  }));
}

export function buildDesignerPagesFromPdfScanOutput(
  output: PdfScanLayoutOutput | PdfDocumentLayoutOutput,
  pageIdPrefix: string,
): DesignerPageState[] {
  if (isPdfDocumentLayoutOutput(output)) {
    return buildDesignerPagesFromPdfDocument(output, pageIdPrefix);
  }
  return buildDesignerPagesFromPdfScan(output, pageIdPrefix);
}
