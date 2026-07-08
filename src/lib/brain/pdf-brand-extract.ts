import crypto from "crypto";
import type { ProjectBrandKit } from "@/app/spaces/project-assets-metadata";
import { detectLogosFromPdfBuffer } from "@/lib/brain/pdf-logo-pipeline";
import {
  isBrandFontStopword,
  parseEmbeddedPdfFontFamilies as parseEmbeddedPdfFontFamiliesFromPdf,
} from "@/lib/brain/pdf-font-extract";
import {
  synthesizeTypographyFromPdfRenders,
  type TypographyVisionInvoker,
} from "@/lib/brain/pdf-typography-vision-fallback";
import { loadPdfJsDocumentFromBuffer } from "@/lib/brain/pdfjs-server";
import { renderPdfPages } from "@/lib/brain/pdf-page-render";
import sharp from "sharp";

// Bump obligatorio con cada cambio del extractor (regla Paso 0).
export const PDF_BRAND_EXTRACT_VERSION = "2026-07-05-brand-precision-1";
export const DEFAULT_MAX_PDF_PAGES = 30;
export const DEFAULT_PDF_PAGE_DPI = 150;

export type PdfPaletteRole = "fondo" | "primario" | "secundario" | "acento" | "soporte";

export type PdfPaletteColor = {
  hex: string;
  role: PdfPaletteRole;
  frequency: number;
  confidence: number;
  detail: string;
};

export type PdfLogoCandidate = {
  buffer: Buffer;
  mime: "image/png";
  bbox: { x: number; y: number; width: number; height: number };
  variant: "positive" | "negative";
  confidence: number;
  pageNumber: number;
  evidenceDetail?: string;
  isolationMethod?: "keying" | "birefnet";
  logoPHash?: string;
};

export type PdfTypographySlot = {
  family: string;
  weights: string[];
};

export type PdfTypographyDraft = {
  primary?: PdfTypographySlot;
  secondary?: PdfTypographySlot;
};

export type PdfBrandExtractDiagnostics = {
  paginas: number;
  fontFamilies: number;
  colorOps: number;
  logoCandidates: number;
};

export type PdfBrandExtractResult = {
  contentSha256: string;
  pageRenderCount: number;
  embeddedImageCount: number;
  palette: PdfPaletteColor[];
  logos: PdfLogoCandidate[];
  typography: PdfTypographyDraft;
  typographySource?: "pdf-embedded" | "llm-synthesis";
  typographyConfidence?: number;
  brand: Partial<ProjectBrandKit>;
  diagnostics: PdfBrandExtractDiagnostics;
};

export function hashPdfBuffer(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export function shouldSkipPdfBrandExtract(input: {
  contentSha256: string;
  previousContentSha256?: string | null;
  previousBrandExtractVersion?: string | null;
  forceReextract?: boolean;
}): boolean {
  if (input.forceReextract) return false;
  return (
    Boolean(input.previousContentSha256) &&
    input.previousContentSha256 === input.contentSha256 &&
    input.previousBrandExtractVersion === PDF_BRAND_EXTRACT_VERSION
  );
}

function hexFromRgb(r: number, g: number, b: number): string {
  return `#${[r, g, b]
    .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0"))
    .join("")}`;
}

function parseHexColor(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.startsWith("#")) return null;
  const hex = raw.trim().toLowerCase();
  if (!/^#[0-9a-f]{3}([0-9a-f]{3})?$/.test(hex)) return null;
  if (hex.length === 4) {
    return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }
  return hex;
}

function luminance255(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function saturation255(r: number, g: number, b: number): number {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  if (mx <= 0) return 0;
  return (mx - mn) / mx;
}

function isNearNeutral(r: number, g: number, b: number): boolean {
  const L = luminance255(r, g, b);
  if (L > 97 * 2.55 || L < 4 * 2.55) return true;
  if (saturation255(r, g, b) < 0.08 && L > 35 && L < 225) return true;
  return false;
}

function normalizeFontFamily(raw: string): string | null {
  const cleaned = raw
    .trim()
    .replace(/^\/(?:[A-Z0-9]{6}\+)?/, "")
    .replace(/[,;].*$/, "")
    .replace(/^\(/, "")
    .replace(/\)$/, "")
    .trim();
  if (!cleaned || cleaned.toLowerCase() === "sans-serif") return null;
  const base = cleaned.split("-")[0]?.trim();
  return base || cleaned;
}

function normalizeFontWeightToken(raw: string): string | null {
  const part = raw.includes("::") ? raw.split("::")[1] ?? "" : raw.includes("-") ? raw.split("-").slice(1).join("-") : "";
  if (!part) return "Regular";
  return part.replace(/([a-z])([A-Z])/g, "$1 $2");
}

/** @deprecated Usar parseEmbeddedPdfFontFamilies async (pdf.js). Sync regex no lee ObjStm comprimidos. */
export function parseEmbeddedPdfFontFamiliesSync(buffer: Buffer): Map<string, number> {
  const latin = buffer.toString("latin1");
  const counts = new Map<string, number>();

  const bump = (family: string, weight = 1) => {
    const normalized = normalizeFontFamily(family);
    if (!normalized) return;
    const weightLabel = normalizeFontWeightLabel(family.replace(/^[A-Z]{6}\+/, ""), normalized);
    const mapKey = `${normalized}::${weightLabel}`;
    counts.set(mapKey, (counts.get(mapKey) ?? 0) + weight);
  };

  for (const match of latin.matchAll(/\/FontFamily\s*\(([^)]+)\)/g)) {
    bump(match[1] ?? "", 3);
  }
  for (const match of latin.matchAll(/<stFnt:fontName>([^<]+)<\/stFnt:fontName>/g)) {
    bump(match[1] ?? "", 2);
  }
  for (const match of latin.matchAll(/\/BaseFont\s*\/(?:[A-Z0-9]{6}\+)?([A-Za-z0-9-]+)/g)) {
    bump(match[1] ?? "", 1);
  }

  return counts;
}

function normalizeFontWeightLabel(rawFamilyWithWeight: string, family: string): string {
  const suffix = rawFamilyWithWeight.slice(family.length).replace(/^-/, "").trim();
  if (!suffix) return "Regular";
  if (/bolditalic/i.test(suffix.replace(/\s+/g, ""))) return "Bold Italic";
  if (/italic/i.test(suffix)) return "Italic";
  if (/bold/i.test(suffix)) return "Bold";
  if (/regular/i.test(suffix)) return "Regular";
  return suffix.replace(/([a-z])([A-Z])/g, "$1 $2");
}

export { parseEmbeddedPdfFontFamiliesFromPdf as parseEmbeddedPdfFontFamilies };

export function buildTypographyDraft(fontCounts: Map<string, number>): PdfTypographyDraft {
  const byFamily = new Map<string, { count: number; weights: Map<string, number> }>();
  for (const [mapKey, count] of fontCounts.entries()) {
    const [familyRaw, weightRaw] = mapKey.includes("::")
      ? mapKey.split("::")
      : [mapKey, normalizeFontWeightToken(mapKey) ?? "Regular"];
    const family = familyRaw?.trim();
    const weight = weightRaw?.trim() || "Regular";
    if (!family || isBrandFontStopword(family)) continue;
    const row = byFamily.get(family) ?? { count: 0, weights: new Map<string, number>() };
    row.count += count;
    row.weights.set(weight, (row.weights.get(weight) ?? 0) + count);
    byFamily.set(family, row);
  }

  const ranked = [...byFamily.entries()].sort((a, b) => b[1].count - a[1].count);
  if (ranked.length === 0) return {};

  const [primaryFamily, primaryRow] = ranked[0]!;
  const secondaryEntry = ranked.find(([name]) => name !== primaryFamily);

  const weightsSorted = (row: { weights: Map<string, number> }) =>
    [...row.weights.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([w]) => w);

  const draft: PdfTypographyDraft = {
    primary: {
      family: primaryFamily,
      weights: weightsSorted(primaryRow).length ? weightsSorted(primaryRow) : ["Regular"],
    },
  };
  if (secondaryEntry) {
    draft.secondary = {
      family: secondaryEntry[0],
      weights: weightsSorted(secondaryEntry[1]).length ? weightsSorted(secondaryEntry[1]) : ["Regular"],
    };
  }
  return draft;
}

async function loadPdfJsDocument(buffer: Buffer) {
  return loadPdfJsDocumentFromBuffer(buffer);
}

export async function countPdfPagesInBuffer(buffer: Buffer, maxPages = DEFAULT_MAX_PDF_PAGES): Promise<number> {
  const { pdf } = await loadPdfJsDocument(buffer);
  try {
    return Math.min(pdf.numPages, maxPages);
  } finally {
    await pdf.destroy();
  }
}

export async function extractPdfOperatorColors(
  buffer: Buffer,
  maxPages = DEFAULT_MAX_PDF_PAGES,
): Promise<Map<string, number>> {
  const colors = new Map<string, number>();
  const { pdfjs, pdf } = await loadPdfJsDocument(buffer);
  const ops = pdfjs.OPS as Record<string, number | undefined>;

  try {
    const pageLimit = Math.min(pdf.numPages, maxPages);
    for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const operatorList = await page.getOperatorList();
      for (let index = 0; index < operatorList.fnArray.length; index += 1) {
        const fn = operatorList.fnArray[index];
        const args = operatorList.argsArray[index] ?? [];
        const weight = fn === ops.setFillRGBColor ? 3 : fn === ops.setStrokeRGBColor ? 2 : 0;
        if (!weight) continue;
        const hex = parseHexColor(args[0]);
        if (!hex) continue;
        colors.set(hex, (colors.get(hex) ?? 0) + weight);
      }
    }
  } finally {
    await pdf.destroy();
  }

  return colors;
}

const RENDER_PALETTE_MAX_SIDE = 256;
const RENDER_PALETTE_SAMPLE_STRIDE = 2;
const RENDER_PALETTE_QUANT_STEP = 16;

function quantizeChannel255(value: number): number {
  return Math.round(value / RENDER_PALETTE_QUANT_STEP) * RENDER_PALETTE_QUANT_STEP;
}

function hexFromQuantizedRgb(r: number, g: number, b: number): string {
  return hexFromRgb(quantizeChannel255(r), quantizeChannel255(g), quantizeChannel255(b));
}

/** C1 — cuantiza color sobre páginas renderizadas (frecuencia ≈ área muestreada). */
export async function extractPdfRenderPaletteColors(
  buffer: Buffer,
  maxPages = DEFAULT_MAX_PDF_PAGES,
  options?: { dpi?: number; maxSide?: number; sampleStride?: number },
): Promise<Map<string, number>> {
  const colors = new Map<string, number>();
  const dpi = options?.dpi ?? 110;
  const maxSide = options?.maxSide ?? RENDER_PALETTE_MAX_SIDE;
  const sampleStride = options?.sampleStride ?? RENDER_PALETTE_SAMPLE_STRIDE;
  const pages = await renderPdfPages(buffer, { maxPages, dpi });
  if (pages.length === 0) return colors;

  for (const page of pages) {
    const { data, info } = await sharp(page.pngBuffer)
      .resize(maxSide, maxSide, { fit: "inside", withoutEnlargement: true })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const channels = info.channels;
    for (let y = 0; y < info.height; y += sampleStride) {
      for (let x = 0; x < info.width; x += sampleStride) {
        const i = (y * info.width + x) * channels;
        const r = data[i] ?? 0;
        const g = data[i + 1] ?? 0;
        const b = data[i + 2] ?? 0;
        const hex = hexFromQuantizedRgb(r, g, b);
        colors.set(hex, (colors.get(hex) ?? 0) + 1);
      }
    }
  }

  return colors;
}

/** C1b — peso por páginas distintas donde aparece el color (no por área total). */
export async function extractPdfRenderPalettePageRecurrence(
  buffer: Buffer,
  maxPages = DEFAULT_MAX_PDF_PAGES,
  options?: { dpi?: number; maxSide?: number; sampleStride?: number },
): Promise<Map<string, number>> {
  const pagePresence = new Map<string, Set<number>>();
  const dpi = options?.dpi ?? 110;
  const maxSide = options?.maxSide ?? RENDER_PALETTE_MAX_SIDE;
  const sampleStride = options?.sampleStride ?? RENDER_PALETTE_SAMPLE_STRIDE;
  const pages = await renderPdfPages(buffer, { maxPages, dpi });
  if (pages.length === 0) return new Map();

  if (process.env.GENOMA_RENDER_CHANNEL_DEBUG === "1") {
    const sample = pages[0]!;
    const { data } = await sharp(sample.pngBuffer)
      .extract({ left: Math.floor(sample.width / 2), top: Math.floor(sample.height / 2), width: 1, height: 1 })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const r = data[0] ?? 0;
    const g = data[1] ?? 0;
    const b = data[2] ?? 0;
    console.info(
      `[palette] render sample px page=1 center R=${r} G=${g} B=${b} hex=#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`,
    );
  }

  for (const page of pages) {
    const { data, info } = await sharp(page.pngBuffer)
      .resize(maxSide, maxSide, { fit: "inside", withoutEnlargement: true })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const channels = info.channels;
    const seenOnPage = new Set<string>();
    for (let y = 0; y < info.height; y += sampleStride) {
      for (let x = 0; x < info.width; x += sampleStride) {
        const i = (y * info.width + x) * channels;
        const r = data[i] ?? 0;
        const g = data[i + 1] ?? 0;
        const b = data[i + 2] ?? 0;
        seenOnPage.add(hexFromQuantizedRgb(r, g, b));
      }
    }
    for (const hex of seenOnPage) {
      if (!pagePresence.has(hex)) pagePresence.set(hex, new Set());
      pagePresence.get(hex)!.add(page.pageNumber);
    }
  }

  const weights = new Map<string, number>();
  for (const [hex, pageSet] of pagePresence.entries()) {
    weights.set(hex, pageSet.size);
  }
  return weights;
}

export function rankPdfPaletteColors(
  colorCounts: Map<string, number>,
  options?: { detailPrefix?: string },
): PdfPaletteColor[] {
  const detailPrefix = options?.detailPrefix ?? "pdf operator";
  const parsed = [...colorCounts.entries()]
    .map(([hex, frequency]) => {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return { hex, frequency, r, g, b, L: luminance255(r, g, b), s: saturation255(r, g, b) };
    })
    .filter((c) => !isNearNeutral(c.r, c.g, c.b))
    .sort((a, b) => b.frequency - a.frequency);

  if (parsed.length === 0) return [];

  const roles: PdfPaletteColor[] = [];
  const used = new Set<string>();

  const pick = (predicate: (c: (typeof parsed)[number]) => boolean, role: PdfPaletteRole): void => {
    const candidate = parsed.find((c) => !used.has(c.hex) && predicate(c));
    if (!candidate) return;
    used.add(candidate.hex);
    roles.push({
      hex: candidate.hex,
      role,
      frequency: candidate.frequency,
      confidence: Math.min(0.95, 0.55 + candidate.frequency / 120),
      detail: `${detailPrefix} ${role}`,
    });
  };

  pick((c) => c.L < 70 && c.s > 0.2, "primario");
  pick((c) => c.s >= 0.28, "acento");
  pick((c) => c.s >= 0.22 && c.L >= 120, "acento");
  pick((c) => c.L >= 70 && c.s < 0.25, "fondo");
  pick((c) => c.s >= 0.12 && c.L >= 45 && c.L <= 180, "secundario");

  const highSat = [...parsed]
    .filter((c) => !used.has(c.hex) && c.s >= 0.24)
    .sort((a, b) => b.s - a.s);
  for (const candidate of highSat) {
    if (roles.filter((r) => r.role === "acento").length >= 2) break;
    if (used.has(candidate.hex)) continue;
    used.add(candidate.hex);
    roles.push({
      hex: candidate.hex,
      role: "acento",
      frequency: candidate.frequency,
      confidence: Math.min(0.9, 0.5 + candidate.s),
      detail: `${detailPrefix} acento`,
    });
  }

  for (const candidate of parsed) {
    if (roles.length >= 5) break;
    if (used.has(candidate.hex)) continue;
    used.add(candidate.hex);
    roles.push({
      hex: candidate.hex,
      role: "soporte",
      frequency: candidate.frequency,
      confidence: Math.min(0.85, 0.45 + candidate.frequency / 150),
      detail: `${detailPrefix} soporte`,
    });
  }

  return roles.slice(0, 5);
}

export async function detectPdfLogoCandidates(
  buffer: Buffer,
  _originalName: string,
  options?: { paletteDarkHex?: string; maxPages?: number },
): Promise<PdfLogoCandidate[]> {
  const { logos } = await detectLogosFromPdfBuffer(buffer, options);
  return logos;
}

export function mapPaletteToBrandKit(palette: PdfPaletteColor[]): Partial<ProjectBrandKit> {
  const byRole = Object.fromEntries(palette.map((c) => [c.role, c.hex] as const));
  return {
    colorPrimary: byRole.primario ?? palette[0]?.hex ?? null,
    colorSecondary: byRole.secundario ?? palette[1]?.hex ?? null,
    colorAccent: byRole.acento ?? palette[2]?.hex ?? null,
  };
}

export async function extractBrandKitFromPdfBuffer(
  buffer: Buffer,
  _originalName: string,
  options?: {
    maxPages?: number;
    userEmail?: string;
    route?: string;
    typographyVisionInvoker?: TypographyVisionInvoker;
  },
): Promise<PdfBrandExtractResult> {
  const contentSha256 = hashPdfBuffer(buffer);
  const maxPages = options?.maxPages ?? DEFAULT_MAX_PDF_PAGES;

  const [operatorColors, fontCounts, paginas] = await Promise.all([
    extractPdfOperatorColors(buffer, maxPages),
    parseEmbeddedPdfFontFamiliesFromPdf(buffer, maxPages),
    countPdfPagesInBuffer(buffer, maxPages),
  ]);

  const palette = rankPdfPaletteColors(operatorColors);
  const logoPass = await detectLogosFromPdfBuffer(buffer, {
    maxPages,
    paletteDarkHex: palette.find((c) => c.role === "primario")?.hex,
  });
  const logos = logoPass.logos;

  let typography = buildTypographyDraft(fontCounts);
  let typographySource: PdfBrandExtractResult["typographySource"] = typography.primary
    ? "pdf-embedded"
    : undefined;
  let typographyConfidence: number | undefined;

  if (!typography.primary) {
    const visionTypo = await synthesizeTypographyFromPdfRenders({
      buffer,
      maxPages: 3,
      userEmail: options?.userEmail,
      route: options?.route ?? "/lib/brain/pdf-brand-extract",
      invokeVision: options?.typographyVisionInvoker,
    });
    if (visionTypo?.typography.primary) {
      typography = visionTypo.typography;
      typographySource = "llm-synthesis";
      typographyConfidence = visionTypo.confidence;
    }
  }

  const colorOps = [...operatorColors.values()].reduce((sum, n) => sum + n, 0);
  const brand = mapPaletteToBrandKit(palette);

  return {
    contentSha256,
    pageRenderCount: logoPass.pages.length,
    embeddedImageCount: 0,
    palette,
    logos,
    typography,
    typographySource,
    typographyConfidence,
    brand,
    diagnostics: {
      paginas,
      fontFamilies: fontCounts.size,
      colorOps,
      logoCandidates: logos.length,
    },
  };
}
