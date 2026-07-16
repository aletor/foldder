import sharp from "sharp";
import { renderPdfPagesAt } from "@/lib/brain/pdf-page-render";
import type { NormalizedBboxPage } from "@/lib/brandkit/brand-kit-logo-bbox";
import { LOGO_ADJUST_CROP_DPI } from "@/lib/brandkit/brand-kit-logo-crop-server";
import {
  loadBrandKitLogoAdjustPageCache,
  logoAdjustPageCacheFormatForDpi,
  persistBrandKitLogoAdjustPageCache,
  type BrandKitSourceDocKind,
} from "@/lib/brandkit/ingest/brand-kit-source-pdf-store";

/** DPI del editor (bbox normalizado; el crop final usa LOGO_ADJUST_CROP_DPI). */
export const LOGO_ADJUST_EDITOR_DPI = 96;

export { LOGO_ADJUST_CROP_DPI };

const MEMORY_PAGE_CACHE_MAX = 12;
const memoryPageCache = new Map<
  string,
  { imageBuffer: Buffer; mime: string; width: number; height: number }
>();

const warmInFlight = new Set<string>();

function memoryCacheKey(contentSha256: string, pageNumber: number, dpi: number): string {
  return `${contentSha256.trim().toLowerCase()}|${pageNumber}|${dpi}`;
}

function mimeForDpi(dpi: number): string {
  return logoAdjustPageCacheFormatForDpi(dpi) === "png" ? "image/png" : "image/jpeg";
}

async function toEditorJpeg(pngBuffer: Buffer): Promise<{
  imageBuffer: Buffer;
  mime: string;
  width: number;
  height: number;
}> {
  const imageBuffer = await sharp(pngBuffer, { failOn: "none" })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
  const meta = await sharp(imageBuffer).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) throw new Error("page_not_found");
  return { imageBuffer, mime: "image/jpeg", width, height };
}

function rememberPage(
  key: string,
  value: { imageBuffer: Buffer; mime: string; width: number; height: number },
): void {
  if (memoryPageCache.has(key)) memoryPageCache.delete(key);
  memoryPageCache.set(key, value);
  while (memoryPageCache.size > MEMORY_PAGE_CACHE_MAX) {
    const oldest = memoryPageCache.keys().next().value;
    if (oldest == null) break;
    memoryPageCache.delete(oldest);
  }
}

export async function loadCachedLogoAdjustPage(input: {
  userEmail: string;
  contentSha256: string;
  pageNumber: number;
  dpi?: number;
}): Promise<{ imageBuffer: Buffer; mime: string; width: number; height: number } | null> {
  const dpi = input.dpi ?? LOGO_ADJUST_EDITOR_DPI;
  const memKey = memoryCacheKey(input.contentSha256, input.pageNumber, dpi);
  const hit = memoryPageCache.get(memKey);
  if (hit) {
    rememberPage(memKey, hit);
    return hit;
  }

  const imageBuffer = await loadBrandKitLogoAdjustPageCache(
    input.userEmail,
    input.contentSha256,
    input.pageNumber,
    dpi,
  );
  if (!imageBuffer) return null;
  const meta = await sharp(imageBuffer, { failOn: "none" }).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) return null;
  const value = { imageBuffer, mime: mimeForDpi(dpi), width, height };
  rememberPage(memKey, value);
  return value;
}

export async function persistCachedLogoAdjustPage(input: {
  userEmail: string;
  contentSha256: string;
  pageNumber: number;
  imageBuffer: Buffer;
  mime: string;
  width: number;
  height: number;
  dpi?: number;
}): Promise<void> {
  const dpi = input.dpi ?? LOGO_ADJUST_EDITOR_DPI;
  const memKey = memoryCacheKey(input.contentSha256, input.pageNumber, dpi);
  rememberPage(memKey, {
    imageBuffer: input.imageBuffer,
    mime: input.mime,
    width: input.width,
    height: input.height,
  });
  await persistBrandKitLogoAdjustPageCache(
    input.userEmail,
    input.contentSha256,
    input.pageNumber,
    dpi,
    input.imageBuffer,
  );
}

export async function renderLogoAdjustPage(input: {
  source: { buffer: Buffer; kind: BrandKitSourceDocKind };
  pageNumber: number;
  dpi?: number;
}): Promise<{ pngBuffer: Buffer; width: number; height: number }> {
  const dpi = input.dpi ?? LOGO_ADJUST_EDITOR_DPI;
  if (input.source.kind === "pdf") {
    const pages = await renderPdfPagesAt(input.source.buffer, [input.pageNumber], { dpi });
    const page = pages[0];
    if (!page) throw new Error("page_not_found");
    return { pngBuffer: page.pngBuffer, width: page.width, height: page.height };
  }

  if (input.pageNumber !== 1) throw new Error("page_not_found");

  const pngBuffer = await sharp(input.source.buffer, { failOn: "none" }).rotate().png().toBuffer();
  const meta = await sharp(pngBuffer).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) throw new Error("page_not_found");
  return { pngBuffer, width, height };
}

export type LogoAdjustPagePayload = {
  imageBase64: string;
  mime: string;
  width: number;
  height: number;
  page: number;
  bboxPage: NormalizedBboxPage;
  sourceKind: BrandKitSourceDocKind;
};

export async function buildLogoAdjustPagePayload(input: {
  source: { buffer: Buffer; kind: BrandKitSourceDocKind };
  pageNumber: number;
  bboxPage: NormalizedBboxPage;
  dpi?: number;
}): Promise<LogoAdjustPagePayload> {
  const rendered = await renderLogoAdjustPage(input);
  const jpeg = await toEditorJpeg(rendered.pngBuffer);
  return {
    imageBase64: jpeg.imageBuffer.toString("base64"),
    mime: jpeg.mime,
    width: jpeg.width,
    height: jpeg.height,
    page: input.pageNumber,
    bboxPage: input.bboxPage,
    sourceKind: input.source.kind,
  };
}

/** Garantiza página hi-res en caché (memoria + S3) para el confirm/crop. */
export async function ensureLogoAdjustCropPage(input: {
  userEmail: string;
  contentSha256: string;
  pageNumber: number;
  loadSource: () => Promise<{ buffer: Buffer; kind: BrandKitSourceDocKind } | null>;
}): Promise<{ imageBuffer: Buffer; mime: string; width: number; height: number; sourceKind: BrandKitSourceDocKind }> {
  const cached = await loadCachedLogoAdjustPage({
    userEmail: input.userEmail,
    contentSha256: input.contentSha256,
    pageNumber: input.pageNumber,
    dpi: LOGO_ADJUST_CROP_DPI,
  });
  if (cached) {
    return { ...cached, sourceKind: "pdf" };
  }

  const source = await input.loadSource();
  if (!source) throw new Error("source_not_found");

  const rendered = await renderLogoAdjustPage({
    source,
    pageNumber: input.pageNumber,
    dpi: LOGO_ADJUST_CROP_DPI,
  });
  await persistCachedLogoAdjustPage({
    userEmail: input.userEmail,
    contentSha256: input.contentSha256,
    pageNumber: input.pageNumber,
    imageBuffer: rendered.pngBuffer,
    mime: "image/png",
    width: rendered.width,
    height: rendered.height,
    dpi: LOGO_ADJUST_CROP_DPI,
  });

  return {
    imageBuffer: rendered.pngBuffer,
    mime: "image/png",
    width: rendered.width,
    height: rendered.height,
    sourceKind: source.kind,
  };
}

/** Precalienta la página 216 DPI en segundo plano al abrir el editor. */
export function warmLogoAdjustCropPage(input: {
  userEmail: string;
  contentSha256: string;
  pageNumber: number;
  loadSource: () => Promise<{ buffer: Buffer; kind: BrandKitSourceDocKind } | null>;
}): void {
  const key = memoryCacheKey(input.contentSha256, input.pageNumber, LOGO_ADJUST_CROP_DPI);
  if (warmInFlight.has(key) || memoryPageCache.has(key)) return;
  warmInFlight.add(key);
  void ensureLogoAdjustCropPage(input)
    .catch(() => undefined)
    .finally(() => {
      warmInFlight.delete(key);
    });
}

export async function resolveLogoAdjustPagePayload(input: {
  userEmail: string;
  contentSha256: string;
  pageNumber: number;
  bboxPage: NormalizedBboxPage;
  loadSource: () => Promise<{ buffer: Buffer; kind: BrandKitSourceDocKind } | null>;
}): Promise<LogoAdjustPagePayload> {
  const cached = await loadCachedLogoAdjustPage({
    userEmail: input.userEmail,
    contentSha256: input.contentSha256,
    pageNumber: input.pageNumber,
  });
  if (cached) {
    warmLogoAdjustCropPage({
      userEmail: input.userEmail,
      contentSha256: input.contentSha256,
      pageNumber: input.pageNumber,
      loadSource: input.loadSource,
    });
    return {
      imageBase64: cached.imageBuffer.toString("base64"),
      mime: cached.mime,
      width: cached.width,
      height: cached.height,
      page: input.pageNumber,
      bboxPage: input.bboxPage,
      sourceKind: "pdf",
    };
  }

  const source = await input.loadSource();
  if (!source) throw new Error("source_not_found");

  const rendered = await renderLogoAdjustPage({ source, pageNumber: input.pageNumber });
  const jpeg = await toEditorJpeg(rendered.pngBuffer);
  await persistCachedLogoAdjustPage({
    userEmail: input.userEmail,
    contentSha256: input.contentSha256,
    pageNumber: input.pageNumber,
    imageBuffer: jpeg.imageBuffer,
    mime: jpeg.mime,
    width: jpeg.width,
    height: jpeg.height,
  });

  warmLogoAdjustCropPage({
    userEmail: input.userEmail,
    contentSha256: input.contentSha256,
    pageNumber: input.pageNumber,
    loadSource: async () => source,
  });

  return {
    imageBase64: jpeg.imageBuffer.toString("base64"),
    mime: jpeg.mime,
    width: jpeg.width,
    height: jpeg.height,
    page: input.pageNumber,
    bboxPage: input.bboxPage,
    sourceKind: source.kind,
  };
}
