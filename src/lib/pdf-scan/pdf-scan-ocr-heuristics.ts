import type { PdfScanTextSpan } from "./pdf-scan-types";

export function looksLikeScannedPdf(args: {
  pageCount: number;
  textSpanCount: number;
  /** Caracteres totales en preview/spans si se conoce. */
  textCharCount?: number;
}): boolean {
  if (args.pageCount <= 0) return false;
  if (args.textSpanCount <= 0) return true;
  const perPage = args.textSpanCount / args.pageCount;
  if (perPage < 1.5) return true;
  if (typeof args.textCharCount === "number" && args.textCharCount < args.pageCount * 40) return true;
  return false;
}

export function pageNeedsOcr(spans: PdfScanTextSpan[]): boolean {
  if (!spans.length) return true;
  const chars = spans.reduce((n, s) => n + s.text.trim().length, 0);
  return chars < 24;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export function parseOcrBlocksJson(
  raw: unknown,
  pageWidth: number,
  pageHeight: number,
): Omit<PdfScanTextSpan, "id" | "page">[] {
  if (!raw || typeof raw !== "object") return [];
  const blocks = (raw as { blocks?: unknown }).blocks;
  if (!Array.isArray(blocks)) return [];
  const out: Omit<PdfScanTextSpan, "id" | "page">[] = [];
  for (const block of blocks) {
    if (!block || typeof block !== "object") continue;
    const b = block as Record<string, unknown>;
    const text = String(b.text ?? "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    const x = clamp01(Number(b.x)) * pageWidth;
    const y = clamp01(Number(b.y)) * pageHeight;
    const w = Math.max(8, clamp01(Number(b.w)) * pageWidth);
    const h = Math.max(10, clamp01(Number(b.h)) * pageHeight);
    const fontSize = Math.max(10, Math.min(48, Math.round(h * 0.75)));
    out.push({
      x,
      y,
      w,
      h,
      text,
      fontSize,
      fontFamily: "Helvetica, Arial, sans-serif",
      fontWeight: 400,
    });
  }
  return out;
}
