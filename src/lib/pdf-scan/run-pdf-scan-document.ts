import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { renderPdfPages } from "@/lib/brain/pdf-page-render";
import { getFromS3, uploadBufferToS3Key } from "@/lib/s3-utils";
import { stableKnowledgeFileUrlFromKey } from "@/lib/spaces-access-control";
import type { MediaListItem, MediaListOutput } from "@/app/spaces/media-list-output";
import { extractPdfDocumentImagesWithPlacement } from "./pdf-document-images";
import { extractPdfDocumentPaths, type ExtractedPdfPath } from "./pdf-document-paths";
import {
  applyFallbackObjects,
  buildFidelityFallbackCrops,
  comparePageFidelity,
} from "./pdf-document-fidelity";
import { attachSoftMaskUrls, prepareSoftMaskLuminanceMasks } from "./pdf-scan-softmask";
import { extractAndUploadPdfScanFonts } from "./pdf-scan-font-extract";
import { remainingMissingPdfFonts } from "./pdf-scan-font-style";
import { collectMissingPdfFonts } from "./pdf-scan-font-map";
import { sha256Hex } from "./pdf-scan-images";
import { extractPdfTextSpans } from "./pdf-scan-text-spans";
import { assertPdfBuffer, pdfScanObjectKey, sanitizePdfFileName, stagePdfScanSource } from "./pdf-scan-stage";
import {
  PDF_SCAN_DEFAULT_DPI,
  PDF_SCAN_MAX_PAGES,
  type PdfDocumentLayoutOutput,
  type PdfDocumentObject,
  type PdfDocumentImageObject,
  type PdfDocumentPathObject,
  type PdfScanFidelity,
  type PdfScanFontAsset,
  type PdfScanImageAsset,
  type PdfScanPageQa,
  type PdfScanSourceMeta,
  type PdfScanSummary,
} from "./pdf-scan-types";

export type RunPdfScanDocumentInput = {
  buffer?: Buffer;
  source?: PdfScanSourceMeta;
  fileName?: string;
  userEmail: string;
  dpi?: number;
  maxPages?: number;
};

export type RunPdfScanDocumentResult = {
  jobId: string;
  mode: "document";
  source: PdfScanSourceMeta;
  scan: PdfScanSummary;
  images: PdfScanImageAsset[];
  fonts: PdfScanFontAsset[];
  textPreview: Array<{ id: string; page: number; text: string }>;
  fidelity: PdfScanFidelity;
  output: PdfDocumentLayoutOutput;
  mediaListOutput: MediaListOutput;
};

async function uploadJpegThumb(buffer: Buffer, maxEdge: number): Promise<Buffer> {
  return sharp(buffer)
    .rotate()
    .resize({ width: maxEdge, height: maxEdge, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 72 })
    .toBuffer();
}

async function resolveBuffer(input: RunPdfScanDocumentInput): Promise<{ buffer: Buffer; source: PdfScanSourceMeta }> {
  if (input.source?.s3Key) {
    const buffer = await getFromS3(input.source.s3Key);
    assertPdfBuffer(buffer);
    return { buffer, source: input.source };
  }
  if (!input.buffer) throw new Error("Se requiere file o source.s3Key.");
  const staged = await stagePdfScanSource({
    buffer: input.buffer,
    fileName: input.fileName || "document.pdf",
    userEmail: input.userEmail,
  });
  return { buffer: input.buffer, source: staged.source };
}

/**
 * Documento editable: paths vectoriales + texto editable + imágenes como capas.
 * Fondos de color = paths a página completa (Designer solo admite pageBackground white/black/transparent).
 * Sin fondo raster full-page. Sin LLM.
 */
export async function runPdfScanDocument(input: RunPdfScanDocumentInput): Promise<RunPdfScanDocumentResult> {
  const { buffer, source } = await resolveBuffer(input);
  const dpi = input.dpi ?? PDF_SCAN_DEFAULT_DPI;
  const maxPages = input.maxPages ?? PDF_SCAN_MAX_PAGES;
  const jobId = `pdfdoc_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;
  const contentSha256 = source.contentSha256 || sha256Hex(buffer);
  const fileName = sanitizePdfFileName(source.fileName || input.fileName || "document.pdf");

  const pages = await renderPdfPages(buffer, { maxPages, dpi });
  if (!pages.length) throw new Error("No se pudo rasterizar ninguna página del PDF.");

  const textSpans = await extractPdfTextSpans(buffer, { dpi, maxPages });
  const { paths, clips, groups, softMaskHits } = await extractPdfDocumentPaths(buffer, { dpi, maxPages });
  const placedImages = await extractPdfDocumentImagesWithPlacement(buffer, { dpi, maxPages });

  const images: PdfScanImageAsset[] = [];
  for (let i = 0; i < placedImages.length; i += 1) {
    const img = placedImages[i]!;
    const id = `img_${img.contentHash.slice(0, 10)}_${i}`;
    const fullKey = pdfScanObjectKey(
      input.userEmail,
      "pdf-scan/images",
      `${contentSha256.slice(0, 12)}-${id}.png`,
    );
    const thumbKey = pdfScanObjectKey(
      input.userEmail,
      "pdf-scan/thumbs",
      `${contentSha256.slice(0, 12)}-${id}-thumb.jpg`,
    );
    await uploadBufferToS3Key(fullKey, img.buffer, img.mime || "image/png");
    const thumb = await uploadJpegThumb(img.buffer, 240);
    await uploadBufferToS3Key(thumbKey, thumb, "image/jpeg");
    images.push({
      id,
      page: img.page,
      width: img.width,
      height: img.height,
      url: stableKnowledgeFileUrlFromKey(fullKey),
      thumbUrl: stableKnowledgeFileUrlFromKey(thumbKey),
      s3Key: fullKey,
      contentHash: img.contentHash,
      x: img.x,
      y: img.y,
    });
  }

  const toPathObject = (p: ExtractedPdfPath, id: string): PdfDocumentPathObject => ({
    type: "path",
    id,
    d: p.d,
    x: p.x,
    y: p.y,
    w: p.w,
    h: p.h,
    fill: p.fill,
    stroke: p.stroke,
    strokeWidth: p.strokeWidth,
    opacity: p.opacity,
    blendMode: p.blendMode,
    softMask: p.softMask,
  });

  const layoutPages: PdfDocumentLayoutOutput["pages"] = [];
  const pageQa: PdfScanPageQa[] = [];
  let fallbackRegionCount = 0;

  for (const page of pages) {
    const previewKey = pdfScanObjectKey(
      input.userEmail,
      "pdf-scan/previews",
      `${contentSha256.slice(0, 12)}-p${page.pageNumber}-${dpi}-preview.jpg`,
    );
    const jpeg = await sharp(page.pngBuffer).jpeg({ quality: 72 }).toBuffer();
    await uploadBufferToS3Key(previewKey, jpeg, "image/jpeg");

    let objects: PdfDocumentObject[] = [];
    const pagePaths = paths.filter((p) => p.page === page.pageNumber);
    for (let i = 0; i < pagePaths.length; i += 1) {
      objects.push(toPathObject(pagePaths[i]!, `path_p${page.pageNumber}_${i}`));
    }

    const pageClips = clips.filter((c) => c.page === page.pageNumber);
    for (let i = 0; i < pageClips.length; i += 1) {
      const clip = pageClips[i]!;
      objects.push({
        type: "clip",
        id: `clip_p${page.pageNumber}_${i}`,
        maskD: clip.mask.d,
        maskX: clip.mask.x,
        maskY: clip.mask.y,
        maskW: clip.mask.w,
        maskH: clip.mask.h,
        content: clip.content.map((p, j) => toPathObject(p, `clip_p${page.pageNumber}_${i}_c${j}`)),
      });
    }

    const pageGroups = groups.filter((g) => g.page === page.pageNumber);
    const nestedImageIds = new Set<string>();
    for (let i = 0; i < pageGroups.length; i += 1) {
      const g = pageGroups[i]!;
      const children: Array<PdfDocumentPathObject | PdfDocumentImageObject> = [
        ...g.paths.map((p, j) => toPathObject(p, `grp_p${page.pageNumber}_${i}_p${j}`)),
      ];
      // clips inside groups flatten as sibling paths under the group for MVP stability
      for (let ci = 0; ci < g.clips.length; ci += 1) {
        const clip = g.clips[ci]!;
        children.push(toPathObject(clip.mask, `grp_p${page.pageNumber}_${i}_cm${ci}`));
        for (let cj = 0; cj < clip.content.length; cj += 1) {
          children.push(toPathObject(clip.content[cj]!, `grp_p${page.pageNumber}_${i}_cc${ci}_${cj}`));
        }
      }
      for (let ii = 0; ii < placedImages.length; ii += 1) {
        const img = placedImages[ii]!;
        if (img.page !== page.pageNumber || img.groupOpenId !== g.openId) continue;
        const asset = images[ii];
        if (!asset) continue;
        nestedImageIds.add(asset.id);
        children.push({
          type: "image",
          id: asset.id,
          src: asset.url,
          s3Key: asset.s3Key,
          x: img.x,
          y: img.y,
          w: img.w,
          h: img.h,
          rotation: img.rotation,
          opacity: img.opacity,
          blendMode: img.blendMode,
          softMask: img.softMask,
        });
      }
      if (!children.length) continue;
      objects.push({
        type: "group",
        id: g.openId || `grp_p${page.pageNumber}_${i}`,
        kind: g.kind,
        opacity: g.opacity,
        blendMode: g.blendMode,
        softMask: g.softMask,
        softMaskSubtype: g.softMaskSubtype,
        children,
      });
    }

    const imageDataUrls: Record<string, string> = {};
    for (let i = 0; i < placedImages.length; i += 1) {
      const img = placedImages[i]!;
      if (img.page !== page.pageNumber) continue;
      const asset = images[i];
      if (!asset) continue;
      imageDataUrls[asset.id] = `data:${img.mime || "image/png"};base64,${img.buffer.toString("base64")}`;
      if (nestedImageIds.has(asset.id)) continue;
      objects.push({
        type: "image",
        id: asset.id,
        src: asset.url,
        s3Key: asset.s3Key,
        x: img.x,
        y: img.y,
        w: img.w,
        h: img.h,
        rotation: img.rotation,
        opacity: img.opacity,
        blendMode: img.blendMode,
        softMask: img.softMask,
      });
    }

    const pageSpans = textSpans.filter((s) => s.page === page.pageNumber);
    for (const span of pageSpans) {
      objects.push({
        type: "text",
        id: span.id,
        text: span.text,
        x: span.x,
        y: span.y,
        w: span.w,
        h: span.h,
        fontSize: span.fontSize,
        fontName: span.fontName,
        fontFamily: span.fontFamily,
        fontWeight: span.fontWeight,
        italic: span.italic,
        color: span.color,
      });
    }

    // Soft-mask luminancia: máscara de capa editable (antes del QA fallback).
    try {
      const softPrep = await prepareSoftMaskLuminanceMasks({
        referencePng: page.pngBuffer,
        objects,
        pageWidth: page.width,
        pageHeight: page.height,
      });
      const softUploads: Array<{ groupId: string; mask: import("./pdf-scan-types").PdfDocumentLayerMask }> = [];
      for (let mi = 0; mi < softPrep.masks.length; mi += 1) {
        const m = softPrep.masks[mi]!;
        const key = pdfScanObjectKey(
          input.userEmail,
          "pdf-scan/softmasks",
          `${contentSha256.slice(0, 12)}-p${page.pageNumber}-sm${mi}.png`,
        );
        await uploadBufferToS3Key(key, m.png, "image/png");
        softUploads.push({
          groupId: m.groupId,
          mask: {
            src: stableKnowledgeFileUrlFromKey(key),
            s3Key: key,
            pixelW: m.pixelW,
            pixelH: m.pixelH,
            inverted: false,
            subtype: "Luminosity",
          },
        });
      }
      objects = attachSoftMaskUrls(objects, softUploads);
    } catch (error) {
      console.warn(
        "[pdf-scan-document] softmask luminance skipped:",
        error instanceof Error ? error.message : error,
      );
    }

    // F5 QA: SSIM vs raster PDFium + fallback regional (determinista, sin LLM).
    // Si falla (SVG corrupto, etc.) no tumba el scan: se conserva el documento editable.
    let report;
    try {
      report = await comparePageFidelity({
        pageNumber: page.pageNumber,
        referencePng: page.pngBuffer,
        objects,
        imageDataUrls,
        width: page.width,
        height: page.height,
      });
    } catch (error) {
      console.warn(
        "[pdf-scan-document] fidelity QA skipped:",
        error instanceof Error ? error.message : error,
      );
      report = {
        pageNumber: page.pageNumber,
        width: page.width,
        height: page.height,
        mae: 255,
        ssim: 0,
        passed: false,
        regions: [] as import("./pdf-document-fidelity").FidelityBox[],
      };
    }
    const crops = await buildFidelityFallbackCrops({ referencePng: page.pngBuffer, report });
    const uploadedFallbacks: Array<{
      id: string;
      src: string;
      s3Key?: string;
      box: (typeof crops)[number]["box"];
    }> = [];
    for (let fi = 0; fi < crops.length; fi += 1) {
      const crop = crops[fi]!;
      const id = `fallback_p${page.pageNumber}_${fi}`;
      const key = pdfScanObjectKey(
        input.userEmail,
        "pdf-scan/fallbacks",
        `${contentSha256.slice(0, 12)}-${id}.png`,
      );
      await uploadBufferToS3Key(key, crop.png, "image/png");
      uploadedFallbacks.push({
        id,
        src: stableKnowledgeFileUrlFromKey(key),
        s3Key: key,
        box: crop.box,
      });
      images.push({
        id,
        page: page.pageNumber,
        width: crop.box.w,
        height: crop.box.h,
        url: stableKnowledgeFileUrlFromKey(key),
        thumbUrl: stableKnowledgeFileUrlFromKey(key),
        s3Key: key,
        contentHash: sha256Hex(crop.png).slice(0, 16),
        x: crop.box.x,
        y: crop.box.y,
      });
    }
    objects = applyFallbackObjects({ objects, fallbacks: uploadedFallbacks });
    fallbackRegionCount += uploadedFallbacks.length;
    pageQa.push({
      page: page.pageNumber,
      ssim: report.ssim,
      mae: report.mae,
      passed: report.passed,
      fallbacks: uploadedFallbacks.length,
    });

    layoutPages.push({
      pageNumber: page.pageNumber,
      widthPx: page.width,
      heightPx: page.height,
      widthPt: page.originalWidthPt,
      heightPt: page.originalHeightPt,
      previewUrl: stableKnowledgeFileUrlFromKey(previewKey),
      objects,
    });
  }

  const first = layoutPages[0]!;
  const pathCount =
    paths.length +
    clips.reduce((n, c) => n + 1 + c.content.length, 0) +
    groups.reduce((n, g) => n + g.paths.length + g.clips.reduce((m, c) => m + 1 + c.content.length, 0), 0);
  const missingCandidates = collectMissingPdfFonts(textSpans.map((s) => s.fontName));
  const fonts = await extractAndUploadPdfScanFonts({
    buffer,
    userEmail: input.userEmail,
    contentSha256,
    missingFamilies: missingCandidates,
    maxPages,
  });
  const fontsMissing = remainingMissingPdfFonts(missingCandidates, fonts);
  const imageSoftMasks = placedImages.filter((img) => img.softMask).length;
  const qaScore =
    pageQa.length > 0 ? pageQa.reduce((s, p) => s + p.ssim, 0) / pageQa.length : undefined;
  const fontNotes: string[] = [];
  if (fonts.length) {
    fontNotes.push(
      `${fonts.length} tipografía(s) embebida(s) recuperada(s) del PDF (se instalan al importar en Designer).`,
    );
  }
  if (fontsMissing.length) {
    fontNotes.push(
      `Sin archivo embebido recuperable: ${fontsMissing.slice(0, 6).join(", ")}.`,
    );
  }
  if (!fonts.length && !fontsMissing.length) {
    fontNotes.push("Tipografías mapeadas a sistema/Google Fonts.");
  }
  const fidelity: PdfScanFidelity = {
    mode: "document",
    textFieldCount: textSpans.length,
    pathCount,
    imageLayerCount: images.filter((img) => !img.id.startsWith("fallback_")).length,
    groupCount: groups.length,
    softMaskHits: softMaskHits + imageSoftMasks,
    qaScore,
    fallbackRegionCount,
    pageQa,
    fontsMissing,
    fontsExtracted: fonts.length,
    notes: [
      "Documento editable: paths, clips, grupos (transparency/form/softmask), tipografía, imágenes CTM (también anidadas en Form), blend/opacidad.",
      qaScore != null
        ? `F5 QA: SSIM medio ${(qaScore * 100).toFixed(1)}% · ${fallbackRegionCount} fallbacks regionales.`
        : "F5 QA no ejecutado.",
      softMaskHits + imageSoftMasks > 0
        ? `Soft masks (${softMaskHits + imageSoftMasks}): máscara de luminancia (layerMask) cuando es posible; fallback raster solo si falla.`
        : "Sin soft masks detectados.",
      ...fontNotes,
    ],
  };

  const output: PdfDocumentLayoutOutput = {
    kind: "pdf_document_layout",
    jobId,
    mode: "document",
    dpi,
    pageCount: layoutPages.length,
    pages: layoutPages,
    fonts,
    fidelity,
  };

  const mediaItems: MediaListItem[] = images.map((img, order) => ({
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
      pdfScanJobId: jobId,
      pageNumber: img.page,
      contentHash: img.contentHash,
    },
  }));

  const mediaListOutput: MediaListOutput = {
    kind: "media_list",
    sourceNodeId: "",
    sourceNodeType: "pdfScan",
    title: fileName,
    status: mediaItems.length ? "frames_ready" : "empty",
    items: mediaItems,
    metadata: {
      cineNodeId: jobId,
      generatedAt: new Date().toISOString(),
      totalFrames: mediaItems.length,
    },
  };

  return {
    jobId,
    mode: "document",
    source: { ...source, fileName, contentSha256 },
    scan: {
      pageCount: layoutPages.length,
      dpi,
      widthPx: first.widthPx,
      heightPx: first.heightPx,
      widthPt: first.widthPt,
      heightPt: first.heightPt,
      textSpanCount: textSpans.length,
      imageCount: images.length,
      pathCount,
      scannedAt: new Date().toISOString(),
      mode: "document",
    },
    images,
    fonts,
    textPreview: textSpans.slice(0, 40).map((s) => ({ id: s.id, page: s.page, text: s.text.slice(0, 120) })),
    fidelity,
    output,
    mediaListOutput,
  };
}
