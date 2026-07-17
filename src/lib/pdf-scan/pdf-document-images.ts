import crypto from "crypto";
import sharp from "sharp";
import { configurePdfJsForNodeServer, pdfJsGetDocumentInit } from "@/lib/brain/pdfjs-server";
import { getPdfJsObject, warmPdfJsPageObjects } from "@/lib/brandkit/ingest/pdfjs-object-resolve";
import { parsePdfRgbColor } from "./pdf-scan-color";
import { applyPdfGState, createPdfGState } from "./pdf-scan-gstate";
import { PDF_SCAN_MAX_IMAGES, PDF_SCAN_MAX_PAGES } from "./pdf-scan-types";

export type PdfDocumentImagePlacement = {
  page: number;
  contentHash: string;
  buffer: Buffer;
  mime: string;
  width: number;
  height: number;
  /** Top-left placement in page px @ dpi */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Rotation degrees clockwise from CTM (approx). */
  rotation: number;
  opacity: number;
  blendMode: string;
  softMask: boolean;
  /**
   * Id del grupo (form / transparency / softmask) abierto al pintar.
   * Misma secuencia que `extractPdfDocumentPaths` → se puede anidar en el group.
   */
  groupOpenId?: string;
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

/** Image XObject se pinta como cuadrado unidad [0,1]² transformado por CTM. */
export function imageBBoxFromCtm(ctm: number[]): { x1: number; y1: number; x2: number; y2: number } {
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

export function rotationDegFromCtm(ctm: number[]): number {
  const deg = (Math.atan2(ctm[1]!, ctm[0]!) * 180) / Math.PI;
  if (!Number.isFinite(deg)) return 0;
  return Math.round((-deg) * 100) / 100;
}

function parseFillHexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return { r: 0, g: 0, b: 0 };
  const n = parseInt(m[1]!, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

async function convertPdfJsImageToPng(
  image: unknown,
  options?: { tintHex?: string },
): Promise<{ buffer: Buffer; width: number; height: number; mime: string } | null> {
  if (image == null || typeof image !== "object") return null;
  const imageLike = image as {
    data?: Uint8Array | Uint8ClampedArray;
    height?: number;
    width?: number;
  };
  const width = imageLike.width ?? 0;
  const height = imageLike.height ?? 0;
  const data = imageLike.data;
  if (!width || !height || !data) return null;

  const pixelCount = width * height;
  const bytes = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  const channels =
    bytes.length === pixelCount * 4
      ? 4
      : bytes.length === pixelCount * 3
        ? 3
        : bytes.length === pixelCount
          ? 1
          : null;
  if (!channels) return null;

  try {
    if (options?.tintHex && channels === 1) {
      const { r, g, b } = parseFillHexToRgb(options.tintHex);
      const rgba = Buffer.alloc(pixelCount * 4);
      for (let i = 0; i < pixelCount; i += 1) {
        const a = bytes[i]!;
        const o = i * 4;
        rgba[o] = r;
        rgba[o + 1] = g;
        rgba[o + 2] = b;
        rgba[o + 3] = a;
      }
      const png = await sharp(rgba, { raw: { width, height, channels: 4 } }).png().toBuffer();
      return { buffer: png, mime: "image/png", width, height };
    }
    const png = await sharp(bytes, { raw: { width, height, channels: channels as 1 | 2 | 3 | 4 } })
      .png()
      .toBuffer();
    return { buffer: png, mime: "image/png", width, height };
  } catch {
    return null;
  }
}

/**
 * Extrae imágenes embebidas con bbox real desde la CTM del content stream.
 * Una aparición = una capa (aunque el XObject se reutilice).
 */
export async function extractPdfDocumentImagesWithPlacement(
  buffer: Buffer,
  options: { dpi: number; maxPages?: number; maxImages?: number },
): Promise<PdfDocumentImagePlacement[]> {
  const dpi = options.dpi;
  const scale = dpi / 72;
  const maxPages = options.maxPages ?? PDF_SCAN_MAX_PAGES;
  const maxImages = options.maxImages ?? PDF_SCAN_MAX_IMAGES;
  const pdfjs = await configurePdfJsForNodeServer();
  const ops = pdfjs.OPS as Record<string, number | undefined>;
  const imageOps = new Set(
    [
      ops.paintImageXObject,
      ops.paintInlineImageXObject,
      ops.paintJpegXObject,
      ops.paintImageMaskXObject,
    ].filter((value): value is number => typeof value === "number"),
  );
  const pdf = await pdfjs.getDocument(pdfJsGetDocumentInit(buffer) as Parameters<typeof pdfjs.getDocument>[0]).promise;
  const out: PdfDocumentImagePlacement[] = [];

  try {
    const pageLimit = Math.min(pdf.numPages, maxPages);
    for (let pageNumber = 1; pageNumber <= pageLimit && out.length < maxImages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const pageHeightPt = viewport.height;
      const ol = await page.getOperatorList();
      await warmPdfJsPageObjects(page, ol, imageOps);

      let ctm = [...IDENTITY];
      const ctmStack: number[][] = [];
      let gstate = createPdfGState();
      const gstateStack: ReturnType<typeof createPdfGState>[] = [];
      const groupOpenIdStack: string[] = [];
      let groupSeq = 0;
      let softMaskOpenId: string | null = null;
      let softMaskWasOn = false;
      let fillColor = "#000000";

      const syncSoftMaskOpenId = () => {
        if (gstate.softMask && !softMaskWasOn) {
          groupSeq += 1;
          softMaskOpenId = `p${pageNumber}_g${groupSeq}`;
        } else if (!gstate.softMask && softMaskWasOn) {
          softMaskOpenId = null;
        }
        softMaskWasOn = gstate.softMask;
      };

      const pushGroupOpenId = () => {
        groupSeq += 1;
        groupOpenIdStack.push(`p${pageNumber}_g${groupSeq}`);
      };

      for (let i = 0; i < ol.fnArray.length && out.length < maxImages; i += 1) {
        const fn = ol.fnArray[i]!;
        const args = ol.argsArray[i] ?? [];

        if (fn === ops.save) {
          ctmStack.push([...ctm]);
          gstateStack.push({ ...gstate });
          continue;
        }
        if (fn === ops.restore) {
          ctm = ctmStack.pop() ?? [...IDENTITY];
          gstate = gstateStack.pop() ?? createPdfGState();
          syncSoftMaskOpenId();
          continue;
        }
        if (fn === ops.transform && args.length >= 6) {
          ctm = multiply(ctm, args.map(Number));
          continue;
        }
        if (fn === ops.setGState) {
          applyPdfGState(args, gstate);
          syncSoftMaskOpenId();
          continue;
        }
        if (fn === ops.beginGroup) {
          pushGroupOpenId();
          continue;
        }
        if (fn === ops.endGroup) {
          groupOpenIdStack.pop();
          continue;
        }
        if (fn === ops.paintFormXObjectBegin) {
          pushGroupOpenId();
          continue;
        }
        if (fn === ops.paintFormXObjectEnd) {
          groupOpenIdStack.pop();
          continue;
        }
        if (fn === ops.setFillRGBColor) {
          fillColor = parsePdfRgbColor(args);
          continue;
        }
        if (fn === ops.setFillTransparent) {
          fillColor = "none";
          continue;
        }
        if (!imageOps.has(fn)) continue;

        try {
          const isMask = fn === ops.paintImageMaskXObject;
          const first = args[0];
          let image: unknown = null;
          if (fn === ops.paintInlineImageXObject) {
            image = first;
          } else if (typeof first === "string") {
            image = await getPdfJsObject(page, first);
          } else if (first && typeof first === "object") {
            const maskRef = first as { data?: unknown; width?: number; height?: number };
            if (typeof maskRef.data === "string") {
              image = await getPdfJsObject(page, maskRef.data);
            } else if (maskRef.data != null || (maskRef.width && maskRef.height)) {
              image = first;
            }
          }
          const converted = await convertPdfJsImageToPng(
            image,
            isMask && fillColor !== "none" ? { tintHex: fillColor } : undefined,
          );
          if (!converted) continue;
          if (converted.width < 8 || converted.height < 8) continue;

          const box = imageBBoxFromCtm(ctm);
          const wPt = Math.abs(box.x2 - box.x1);
          const hPt = Math.abs(box.y2 - box.y1);
          // Filtrar por tamaño en página (pt), no solo píxeles nativos del XObject.
          if (wPt < 2 || hPt < 2) continue;
          if (wPt * scale < 6 || hPt * scale < 6) continue;

          const xPt = Math.min(box.x1, box.x2);
          const yTopPt = pageHeightPt - Math.max(box.y1, box.y2);
          const contentHash = crypto.createHash("sha256").update(converted.buffer).digest("hex");
          const groupOpenId =
            groupOpenIdStack[groupOpenIdStack.length - 1] ?? softMaskOpenId ?? undefined;

          out.push({
            page: pageNumber,
            contentHash,
            buffer: converted.buffer,
            mime: converted.mime,
            width: converted.width,
            height: converted.height,
            x: Math.round(xPt * scale),
            y: Math.round(yTopPt * scale),
            w: Math.max(1, Math.round(wPt * scale)),
            h: Math.max(1, Math.round(hPt * scale)),
            rotation: rotationDegFromCtm(ctm),
            opacity: gstate.fillAlpha,
            blendMode: gstate.blendMode,
            softMask: gstate.softMask,
            groupOpenId,
          });
        } catch {
          // skip broken xobject
        }
      }
    }
  } finally {
    await pdf.destroy();
  }

  return out;
}
