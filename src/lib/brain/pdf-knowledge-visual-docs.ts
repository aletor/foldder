import { v4 as uuidv4 } from "uuid";
import { recordApiUsage } from "@/lib/api-usage";
import { normalizeUploadedImageForFoldder } from "@/lib/foldder-server-image-optimization";
import { buildUserAssetObjectKey } from "@/lib/spaces-access-control";
import { uploadBufferToS3Key } from "@/lib/s3-utils";
import { renderPdfPages } from "@/lib/brain/pdf-page-render";
import { countPdfImageObjects, extractVisualImagesFromPdfBuffer, MAX_PDF_VISUAL_IMAGES } from "@/lib/brain/pdf-visual-extract";

export type PdfKnowledgeVisualDocument = {
  id: string;
  name: string;
  size: number;
  mime: string;
  scope: "core" | "context";
  contextKind?: "competencia" | "mercado" | "referencia" | "general";
  s3Path: string;
  type: "image";
  format: "image";
  status: "Subido";
  uploadedAt: string;
};

export type PdfKnowledgeVisualDiagnostic = {
  name: string;
  pageRenderCount: number;
  extractedImageCount: number;
  uploadedVisualCount: number;
  imageObjectCount: number;
  renderError?: string;
};

function filenameWithExtension(filename: string, ext: string): string {
  const base = (filename || `knowledge-image-${Date.now()}`)
    .trim()
    .replace(/\.[^.]+$/, "");
  return `${base || `knowledge-image-${Date.now()}`}.${ext}`;
}

export async function appendPdfVisualKnowledgeDocuments(input: {
  pdfBuffer: Buffer;
  pdfName: string;
  parentS3Key: string;
  userEmail: string;
  usageUserEmail: string;
  scope: "core" | "context";
  contextKind?: "competencia" | "mercado" | "referencia" | "general";
  route: string;
}): Promise<{ visualDocs: PdfKnowledgeVisualDocument[]; diagnostic: PdfKnowledgeVisualDiagnostic }> {
  const { pdfBuffer, pdfName, parentS3Key, userEmail, usageUserEmail, scope, contextKind, route } = input;
  const imageObjectCount = countPdfImageObjects(pdfBuffer);
  let pageRenderCount = 0;
  let renderError: string | undefined;
  try {
    const pages = await renderPdfPages(pdfBuffer, { maxPages: 5 });
    pageRenderCount = pages.length;
  } catch (renderErr) {
    renderError = renderErr instanceof Error ? renderErr.message.slice(0, 500) : String(renderErr);
    console.error(`[${route}] pdf page render probe failed for ${pdfName}:`, renderErr);
  }

  const extractedImages = await extractVisualImagesFromPdfBuffer(pdfBuffer, pdfName);
  const pdfVisualImages = extractedImages.slice(0, MAX_PDF_VISUAL_IMAGES);

  await recordApiUsage({
    provider: "aws",
    userEmail: usageUserEmail,
    serviceId: "s3-knowledge",
    route,
    operation: "pdf_visual_extract",
    costIsKnown: false,
    costUsd: 0,
    metadata: {
      name: pdfName,
      pageRenderCount,
      extractedImageCount: extractedImages.length,
      uploadedVisualCount: pdfVisualImages.length,
      imageObjectCount,
      ...(renderError ? { renderError } : {}),
      maxVisualImages: MAX_PDF_VISUAL_IMAGES,
      strategy: "embedded_pdf_images_only",
    },
  });

  const visualDocs: PdfKnowledgeVisualDocument[] = [];
  for (const image of pdfVisualImages) {
    const normalizedImage = await normalizeUploadedImageForFoldder(image.buffer, image.mime);
    const imageName = filenameWithExtension(image.name, normalizedImage.ext);
    const imageKey = buildUserAssetObjectKey({
      userEmail,
      folder: "brain/knowledge/pdf-visuals",
      filename: imageName,
    });
    await uploadBufferToS3Key(imageKey, normalizedImage.buffer, normalizedImage.contentType);
    await recordApiUsage({
      provider: "aws",
      userEmail: usageUserEmail,
      serviceId: "s3-knowledge",
      route,
      operation: "put_object",
      costIsKnown: false,
      costUsd: 0,
      bytes: normalizedImage.buffer.length,
      metadata: {
        key: imageKey,
        mime: normalizedImage.contentType,
        source: "pdf_image_extract",
        parent: parentS3Key,
        pdfImageObjectCount: imageObjectCount,
        width: image.width,
        height: image.height,
        optimized: normalizedImage.optimized,
        originalBytes: normalizedImage.originalBytes,
      },
    });
    visualDocs.push({
      id: uuidv4(),
      name: image.name,
      size: normalizedImage.buffer.length,
      mime: normalizedImage.contentType,
      scope,
      contextKind,
      s3Path: imageKey,
      type: "image",
      format: "image",
      status: "Subido",
      uploadedAt: new Date().toISOString(),
    });
  }

  return {
    visualDocs,
    diagnostic: {
      name: pdfName,
      pageRenderCount,
      extractedImageCount: extractedImages.length,
      uploadedVisualCount: pdfVisualImages.length,
      imageObjectCount,
      ...(renderError ? { renderError } : {}),
    },
  };
}
