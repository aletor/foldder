import { loadPdfJsDocumentFromBuffer } from "@/lib/brain/pdfjs-server";
import { mapPdfFontToDesigner } from "./pdf-scan-font-map";
import {
  pickPdfFontNameForMapping,
  resolvePdfFontResourceName,
} from "./pdf-scan-font-resolve";
import { parsePdfRgbColor } from "./pdf-scan-color";
import { sanitizePdfExtractedText } from "./pdf-scan-sanitize";
import { PDF_SCAN_MAX_PAGES, PDF_SCAN_MAX_TEXT_SPANS, type PdfScanTextSpan } from "./pdf-scan-types";

type TextItemLike = {
  str?: unknown;
  transform?: number[];
  width?: number;
  height?: number;
  fontName?: string;
};

type TextStyleLike = {
  fontFamily?: string;
};

/** Ítem tipográfico en puntos PDF (origen top-left de página). */
export type PdfScanRawTextItem = {
  text: string;
  xPt: number;
  yTopPt: number;
  wPt: number;
  hPt: number;
  fontSize: number;
  fontName?: string;
  color?: string;
};

export type PdfScanTextBlock = {
  text: string;
  xPt: number;
  yTopPt: number;
  wPt: number;
  hPt: number;
  fontSize: number;
  fontName?: string;
  color?: string;
};

/** Gap horizontal máximo (en anchos de espacio ≈ 0.5×fontSize) para unir palabras de la misma línea. */
export const PDF_SCAN_LINE_GAP_SPACE_FACTOR = 2.25;
/** Tolerancia vertical relativa al fontSize para considerar misma banda de línea. */
export const PDF_SCAN_LINE_Y_TOL_FACTOR = 0.35;
/** Pitch (ΔyTop) mínimo / máximo respecto a fontSize para seguir en el mismo párrafo. */
export const PDF_SCAN_PARA_PITCH_MIN_FACTOR = 0.55;
export const PDF_SCAN_PARA_PITCH_MAX_FACTOR = 2.35;
/** Tolerancia relativa al pitch de referencia del párrafo (±). */
export const PDF_SCAN_PARA_PITCH_TOL_FACTOR = 0.28;
/** Solape mínimo (0–1) o proximidad de borde izquierdo para asignar a una columna. */
export const PDF_SCAN_COLUMN_OVERLAP_MIN = 0.28;
export const PDF_SCAN_COLUMN_LEFT_TOL_FACTOR = 2.2;

/**
 * Extrae spans de texto con bbox en píxeles (origen top-left) al DPI indicado.
 * Pipeline: palabras → líneas → columnas → párrafos por pitch → texto plano (sin \\n).
 */
export async function extractPdfTextSpans(
  buffer: Buffer,
  options: { dpi: number; maxPages?: number },
): Promise<PdfScanTextSpan[]> {
  const dpi = options.dpi;
  const scale = dpi / 72;
  const maxPages = options.maxPages ?? PDF_SCAN_MAX_PAGES;
  const loaded = await loadPdfJsDocumentFromBuffer(buffer);
  const pdf = await loaded.pdf;
  const spans: PdfScanTextSpan[] = [];
  let spanIndex = 0;

  try {
    const pageLimit = Math.min(pdf.numPages, maxPages);
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const ops = pdfjs.OPS as Record<string, number | undefined>;

    for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const view = page.view as number[];
      const pageHeightPt = Math.abs((view[3] ?? 0) - (view[1] ?? 0)) || page.getViewport({ scale: 1 }).height;
      const textContent = await page.getTextContent();
      const styles = (textContent.styles ?? {}) as Record<string, TextStyleLike>;
      const ol = await page.getOperatorList();

      // Colores de relleno en orden de showText (aprox. alineado con getTextContent).
      const textColorsInOrder: string[] = [];
      let fillColor = "#111827";
      for (let i = 0; i < ol.fnArray.length; i += 1) {
        const fn = ol.fnArray[i]!;
        const args = ol.argsArray[i] ?? [];
        if (fn === ops.setFillRGBColor) fillColor = parsePdfRgbColor(args);
        if (fn === ops.setFillTransparent) fillColor = "#111827";
        if (
          fn === ops.showText ||
          fn === ops.showSpacedText ||
          fn === ops.nextLineShowText ||
          fn === ops.nextLineSetSpacingShowText
        ) {
          textColorsInOrder.push(fillColor);
        }
      }

      const fontNameCache = new Map<string, string | null>();
      const resolveFont = async (fontId: string) => {
        if (fontNameCache.has(fontId)) return fontNameCache.get(fontId) ?? null;
        const name = await resolvePdfFontResourceName(page, fontId);
        fontNameCache.set(fontId, name);
        return name;
      };

      const raw: PdfScanRawTextItem[] = [];
      let textOpIndex = 0;

      for (const item of textContent.items) {
        if (!item || typeof item !== "object" || !("str" in item)) continue;
        const typed = item as TextItemLike;
        const text = flattenExtractedText(String(typed.str ?? ""));
        if (!text) continue;
        const transform = typed.transform ?? [];
        const fontSize = Math.abs(transform[0] ?? 0) || Math.hypot(transform[2] ?? 0, transform[3] ?? 0) || 12;
        const xPt = transform[4] ?? 0;
        const yBottomPt = transform[5] ?? 0;
        const hPt = typeof typed.height === "number" && typed.height > 0 ? typed.height : fontSize;
        const wPt =
          typeof typed.width === "number" && typed.width > 0
            ? typed.width
            : Math.max(fontSize * text.length * 0.45, fontSize);
        const yTopPt = pageHeightPt - yBottomPt - hPt;
        const resourceFont = typeof typed.fontName === "string" ? typed.fontName : undefined;
        const styleFamily =
          resourceFont && typeof styles[resourceFont]?.fontFamily === "string"
            ? styles[resourceFont]!.fontFamily
            : undefined;
        const embeddedName = resourceFont ? await resolveFont(resourceFont) : null;
        const fontName = pickPdfFontNameForMapping({
          resourceFont,
          embeddedName,
          styleFamily,
        });
        const color = textColorsInOrder[textOpIndex] ?? "#111827";
        textOpIndex += 1;
        raw.push({
          text,
          xPt,
          yTopPt,
          wPt,
          hPt,
          fontSize,
          fontName,
          color,
        });
      }

      const blocks = clusterPdfTextItemsIntoBlocks(raw);
      for (const block of blocks) {
        if (spans.length >= PDF_SCAN_MAX_TEXT_SPANS) break;
        spanIndex += 1;
        const mapped = mapPdfFontToDesigner(block.fontName);
        spans.push({
          id: `txt_p${pageNumber}_${spanIndex}`,
          page: pageNumber,
          text: block.text,
          x: Math.round(block.xPt * scale),
          y: Math.round(block.yTopPt * scale),
          w: Math.max(1, Math.round(block.wPt * scale)),
          h: Math.max(1, Math.round(block.hPt * scale)),
          fontSize: Math.max(8, Math.round(block.fontSize * scale)),
          fontName: block.fontName,
          fontFamily: mapped.fontFamily,
          fontWeight: mapped.fontWeight,
          italic: mapped.italic,
          color: block.color,
        });
      }
      if (spans.length >= PDF_SCAN_MAX_TEXT_SPANS) break;
    }
  } finally {
    await pdf.destroy();
  }

  return spans;
}

/** Pipeline puro: ítems → líneas → columnas → párrafos por pitch. */
export function clusterPdfTextItemsIntoBlocks(items: PdfScanRawTextItem[]): PdfScanTextBlock[] {
  const lines = groupTextItemsIntoLines(items);
  return groupLinesIntoParagraphs(lines);
}

/**
 * Agrupa ítems en líneas. Misma banda Y no implica misma línea:
 * un gap horizontal grande (columnas) abre un nuevo segmento.
 */
export function groupTextItemsIntoLines(items: PdfScanRawTextItem[]): PdfScanTextBlock[] {
  if (!items.length) return [];
  const sorted = [...items].sort((a, b) => a.yTopPt - b.yTopPt || a.xPt - b.xPt);
  const bands: PdfScanRawTextItem[][] = [];
  let currentBand: PdfScanRawTextItem[] = [];
  let bandY = sorted[0]!.yTopPt;

  for (const item of sorted) {
    const yTol = Math.max(2, item.fontSize * PDF_SCAN_LINE_Y_TOL_FACTOR);
    if (currentBand.length && Math.abs(item.yTopPt - bandY) > yTol) {
      bands.push(currentBand);
      currentBand = [item];
      bandY = item.yTopPt;
    } else {
      currentBand.push(item);
      bandY = (bandY * (currentBand.length - 1) + item.yTopPt) / currentBand.length;
    }
  }
  if (currentBand.length) bands.push(currentBand);

  const lines: PdfScanTextBlock[] = [];
  for (const band of bands) {
    const ordered = [...band].sort((a, b) => a.xPt - b.xPt);
    let run: PdfScanRawTextItem[] = [];
    for (const item of ordered) {
      if (!run.length) {
        run = [item];
        continue;
      }
      const prev = run[run.length - 1]!;
      const gap = item.xPt - (prev.xPt + prev.wPt);
      const spaceW = Math.max(prev.fontSize, item.fontSize) * 0.5;
      const maxGap = spaceW * PDF_SCAN_LINE_GAP_SPACE_FACTOR;
      if (gap > maxGap) {
        lines.push(mergeItemsToBlock(run));
        run = [item];
      } else {
        run.push(item);
      }
    }
    if (run.length) lines.push(mergeItemsToBlock(run));
  }
  return lines;
}

/**
 * Columnas primero (evita intercalado A1,B1,A2…), luego párrafos por pitch estable dentro de cada columna.
 * El texto del párrafo es plano (espacios, sin \\n).
 */
export function groupLinesIntoParagraphs(lines: PdfScanTextBlock[]): PdfScanTextBlock[] {
  if (!lines.length) return [];
  const columns = clusterLinesIntoColumns(lines);
  const paragraphs: PdfScanTextBlock[] = [];
  for (const column of columns) {
    paragraphs.push(...groupColumnLinesIntoParagraphs(column));
  }
  return paragraphs.sort((a, b) => a.yTopPt - b.yTopPt || a.xPt - b.xPt);
}

/** Agrupa líneas en columnas por solape / borde izquierdo. Exportado para tests. */
export function clusterLinesIntoColumns(lines: PdfScanTextBlock[]): PdfScanTextBlock[][] {
  if (!lines.length) return [];
  const sorted = [...lines].sort((a, b) => a.xPt - b.xPt || a.yTopPt - b.yTopPt);
  const columns: PdfScanTextBlock[][] = [];

  for (const line of sorted) {
    let bestIdx = -1;
    let bestScore = 0;
    for (let i = 0; i < columns.length; i += 1) {
      const score = columnAffinity(line, columns[i]!);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0 && bestScore >= PDF_SCAN_COLUMN_OVERLAP_MIN) {
      columns[bestIdx]!.push(line);
    } else {
      columns.push([line]);
    }
  }

  return columns.map((col) => [...col].sort((a, b) => a.yTopPt - b.yTopPt || a.xPt - b.xPt));
}

function columnAffinity(line: PdfScanTextBlock, column: PdfScanTextBlock[]): number {
  const fontRef = Math.max(line.fontSize, ...column.map((l) => l.fontSize), 1);
  const leftTol = fontRef * PDF_SCAN_COLUMN_LEFT_TOL_FACTOR;
  const colLeft = median(column.map((l) => l.xPt));
  const colRight = median(column.map((l) => l.xPt + l.wPt));
  const colW = Math.max(1, colRight - colLeft);

  const overlapLeft = Math.max(line.xPt, colLeft);
  const overlapRight = Math.min(line.xPt + line.wPt, colRight);
  const overlap = Math.max(0, overlapRight - overlapLeft);
  const overlapRatio = overlap / Math.max(1, Math.min(line.wPt, colW));

  const leftClose = Math.abs(line.xPt - colLeft) <= leftTol ? 0.45 : 0;
  return Math.max(overlapRatio, leftClose);
}

function groupColumnLinesIntoParagraphs(lines: PdfScanTextBlock[]): PdfScanTextBlock[] {
  if (!lines.length) return [];
  const sorted = [...lines].sort((a, b) => a.yTopPt - b.yTopPt || a.xPt - b.xPt);
  const groups: PdfScanTextBlock[][] = [];
  let current: PdfScanTextBlock[] = [sorted[0]!];
  let pitchRef: number | null = null;

  for (let i = 1; i < sorted.length; i += 1) {
    const prev = current[current.length - 1]!;
    const next = sorted[i]!;
    const pitch = next.yTopPt - prev.yTopPt;
    if (canContinueParagraphByPitch(prev, next, pitch, pitchRef, current)) {
      current.push(next);
      pitchRef = pitchRef == null ? pitch : pitchRef * 0.65 + pitch * 0.35;
    } else {
      groups.push(current);
      current = [next];
      pitchRef = null;
    }
  }
  groups.push(current);
  return groups.map((group) => mergeItemsToBlock(group));
}

function canContinueParagraphByPitch(
  prev: PdfScanTextBlock,
  next: PdfScanTextBlock,
  pitch: number,
  pitchRef: number | null,
  current: PdfScanTextBlock[],
): boolean {
  const fontRef = Math.max(prev.fontSize, next.fontSize, 1);
  if (Math.abs(prev.fontSize - next.fontSize) > fontRef * 0.22) return false;

  if (pitch < fontRef * PDF_SCAN_PARA_PITCH_MIN_FACTOR) return false;
  if (pitch > fontRef * PDF_SCAN_PARA_PITCH_MAX_FACTOR) return false;

  if (pitchRef != null) {
    const tol = Math.max(2.5, Math.abs(pitchRef) * PDF_SCAN_PARA_PITCH_TOL_FACTOR);
    if (Math.abs(pitch - pitchRef) > tol) return false;
  }

  const paraLeft = median(current.map((l) => l.xPt));
  const leftTol = fontRef * PDF_SCAN_COLUMN_LEFT_TOL_FACTOR;
  const leftOk =
    Math.abs(next.xPt - prev.xPt) <= leftTol ||
    Math.abs(next.xPt - paraLeft) <= leftTol ||
    horizontalOverlapRatio(prev, next) >= PDF_SCAN_COLUMN_OVERLAP_MIN;
  if (!leftOk) return false;

  return true;
}

function horizontalOverlapRatio(a: PdfScanTextBlock, b: PdfScanTextBlock): number {
  const left = Math.max(a.xPt, b.xPt);
  const right = Math.min(a.xPt + a.wPt, b.xPt + b.wPt);
  const overlap = Math.max(0, right - left);
  const minW = Math.max(1, Math.min(a.wPt, b.wPt));
  return overlap / minW;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

/** Elimina saltos de línea y colapsa espacios — el wrap lo hace Designer. */
export function flattenExtractedText(text: string): string {
  return sanitizePdfExtractedText(text);
}

function mergeItemsToBlock(
  items: Array<
    Pick<PdfScanRawTextItem, "text" | "xPt" | "yTopPt" | "wPt" | "hPt" | "fontSize" | "fontName" | "color">
  >,
): PdfScanTextBlock {
  const ordered = [...items].sort((a, b) => a.yTopPt - b.yTopPt || a.xPt - b.xPt);
  const text = flattenExtractedText(ordered.map((i) => i.text).join(" "));
  const xPt = Math.min(...ordered.map((i) => i.xPt));
  const yTopPt = Math.min(...ordered.map((i) => i.yTopPt));
  const right = Math.max(...ordered.map((i) => i.xPt + i.wPt));
  const bottom = Math.max(...ordered.map((i) => i.yTopPt + i.hPt));
  const fontSize = Math.max(...ordered.map((i) => i.fontSize));
  return {
    text,
    xPt,
    yTopPt,
    wPt: Math.max(1, right - xPt),
    hPt: Math.max(1, bottom - yTopPt),
    fontSize,
    fontName: ordered[0]?.fontName,
    color: ordered[0]?.color,
  };
}
