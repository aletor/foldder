import { NextRequest, NextResponse } from "next/server";
import { recordApiUsage, resolveUsageUserEmailFromRequest } from "@/lib/api-usage";
import { countPdfImageObjects, extractVisualImagesFromPdfBuffer, MAX_PDF_VISUAL_IMAGES } from "@/lib/brain/pdf-visual-extract";
import { normalizeUploadedImageForFoldder } from "@/lib/foldder-server-image-optimization";
import { buildUserAssetObjectKey, requireSpacesAuthUser } from "@/lib/spaces-access-control";
import { uploadBufferToS3Key } from "@/lib/s3-utils";
import { v4 as uuidv4 } from "uuid";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

const ALLOWED_EXT = new Set(["pdf", "docx", "txt", "md", "rtf", "html", "htm", "jpg", "jpeg", "png", "webp"]);
const ALLOWED_MIME = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/rtf",
  "text/plain",
  "text/markdown",
  "text/rtf",
  "text/html",
  "application/xhtml+xml",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export const runtime = "nodejs";

function getExt(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  return ext === "jpeg" ? "jpg" : ext;
}

function imageContentTypeForExt(ext: string): string {
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  return "image/jpeg";
}

function documentContentTypeForExt(ext: string): string {
  if (ext === "pdf") return "application/pdf";
  if (ext === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (ext === "txt") return "text/plain";
  if (ext === "md") return "text/markdown";
  if (ext === "rtf") return "application/rtf";
  if (ext === "html" || ext === "htm") return "text/html";
  return "application/octet-stream";
}

function filenameWithExtension(filename: string, ext: string): string {
  const base = (filename || `knowledge-image-${Date.now()}`)
    .trim()
    .replace(/\.[^.]+$/, "");
  return `${base || `knowledge-image-${Date.now()}`}.${ext}`;
}

export async function POST(req: NextRequest) {
  try {
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;
    const usageUserEmail = await resolveUsageUserEmailFromRequest(req);
    const formData = await req.formData();
    const files = formData.getAll("file") as File[];
    const scopeRaw = String(formData.get("scope") || "core");
    const contextKindRaw = String(formData.get("contextKind") || "");
    const scope: "core" | "context" = scopeRaw === "context" ? "context" : "core";
    const contextKind =
      contextKindRaw === "competencia" ||
      contextKindRaw === "mercado" ||
      contextKindRaw === "referencia" ||
      contextKindRaw === "general"
        ? contextKindRaw
        : undefined;

    if (!files || files.length === 0) {
      return NextResponse.json({
        message: "No files uploaded.",
        documents: [],
        rejected: [],
      });
    }

    const uploadedDocs = [];
    const rejected: Array<{ name: string; reason: string }> = [];
    const pdfVisualDiagnostics: Array<{
      name: string;
      pageRenderCount: number;
      extractedImageCount: number;
      uploadedVisualCount: number;
      imageObjectCount: number;
    }> = [];
    for (const file of files) {
      const ext = getExt(file.name);
      const mime = (file.type || "application/octet-stream").toLowerCase();
      const isImage = mime.startsWith("image/") || ["jpg", "png", "webp"].includes(ext);
      const isHtml = ext === "html" || ext === "htm";
      const isBrowserUnknownMime = mime === "application/octet-stream" && ALLOWED_EXT.has(ext);

      if (
        !ALLOWED_EXT.has(ext) ||
        (!ALLOWED_MIME.has(mime) && !mime.startsWith("text/") && !isImage && !isHtml && !isBrowserUnknownMime)
      ) {
        rejected.push({ name: file.name, reason: "unsupported_type" });
        continue;
      }

      if (!isImage && file.size > MAX_FILE_BYTES) {
        rejected.push({ name: file.name, reason: "file_too_large" });
        continue;
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const uploadMime = isImage && !mime.startsWith("image/")
        ? imageContentTypeForExt(ext)
        : mime === "application/octet-stream"
          ? documentContentTypeForExt(ext)
          : mime;
      const normalized = isImage
        ? await normalizeUploadedImageForFoldder(buffer, uploadMime)
        : {
            buffer,
            contentType: uploadMime,
            ext,
            optimized: false,
            originalBytes: buffer.length,
          };
      if (normalized.buffer.length > MAX_FILE_BYTES) {
        rejected.push({ name: file.name, reason: "file_too_large" });
        continue;
      }

      const uploadName = isImage ? filenameWithExtension(file.name, normalized.ext) : file.name;
      const s3Key = buildUserAssetObjectKey({
        userEmail: authState.user.email,
        folder: "brain/knowledge",
        filename: uploadName,
      });
      await uploadBufferToS3Key(s3Key, normalized.buffer, normalized.contentType);
      await recordApiUsage({
        provider: "aws",
        userEmail: usageUserEmail,
        serviceId: "s3-knowledge",
        route: "/api/spaces/brain/knowledge/upload",
        operation: "put_object",
        costIsKnown: false,
        costUsd: 0,
        bytes: normalized.buffer.length,
        metadata: {
          key: s3Key,
          mime: normalized.contentType,
          optimized: normalized.optimized,
          originalBytes: normalized.originalBytes,
        },
      });
      const format = isImage ? "image" : ext === "pdf" ? "pdf" : ext === "docx" ? "docx" : isHtml ? "html" : "txt";

      uploadedDocs.push({
        id: uuidv4(),
        name: file.name,
        size: normalized.buffer.length,
        mime: normalized.contentType,
        scope,
        contextKind,
        s3Path: s3Key,
        type: isImage ? "image" : "document",
        format,
        status: "Subido",
        uploadedAt: new Date().toISOString(),
      });

      if (format === "pdf") {
        const imageObjectCount = countPdfImageObjects(buffer);
        const extractedImages = await extractVisualImagesFromPdfBuffer(buffer, file.name);
        const pdfVisualImages = extractedImages.slice(0, MAX_PDF_VISUAL_IMAGES);
        pdfVisualDiagnostics.push({
          name: file.name,
          pageRenderCount: 0,
          extractedImageCount: extractedImages.length,
          uploadedVisualCount: pdfVisualImages.length,
          imageObjectCount,
        });
        await recordApiUsage({
          provider: "aws",
          userEmail: usageUserEmail,
          serviceId: "s3-knowledge",
          route: "/api/spaces/brain/knowledge/upload",
          operation: "pdf_visual_extract",
          costIsKnown: false,
          costUsd: 0,
          metadata: {
            name: file.name,
            pageRenderCount: 0,
            extractedImageCount: extractedImages.length,
            uploadedVisualCount: pdfVisualImages.length,
            imageObjectCount,
            maxVisualImages: MAX_PDF_VISUAL_IMAGES,
            strategy: "embedded_pdf_images_only",
          },
        });
        for (const image of pdfVisualImages) {
          const normalizedImage = await normalizeUploadedImageForFoldder(image.buffer, image.mime);
          const imageName = filenameWithExtension(image.name, normalizedImage.ext);
          const imageKey = buildUserAssetObjectKey({
            userEmail: authState.user.email,
            folder: "brain/knowledge/pdf-visuals",
            filename: imageName,
          });
          await uploadBufferToS3Key(imageKey, normalizedImage.buffer, normalizedImage.contentType);
          await recordApiUsage({
            provider: "aws",
            userEmail: usageUserEmail,
            serviceId: "s3-knowledge",
            route: "/api/spaces/brain/knowledge/upload",
            operation: "put_object",
            costIsKnown: false,
            costUsd: 0,
            bytes: normalizedImage.buffer.length,
            metadata: {
              key: imageKey,
              mime: normalizedImage.contentType,
              source: "pdf_image_extract",
              parent: s3Key,
              pdfImageObjectCount: imageObjectCount,
              width: image.width,
              height: image.height,
              optimized: normalizedImage.optimized,
              originalBytes: normalizedImage.originalBytes,
            },
          });
          uploadedDocs.push({
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
      }
    }

    return NextResponse.json({
      message:
        uploadedDocs.length > 0
          ? `Successfully uploaded ${uploadedDocs.length} file(s)${
              rejected.length ? ` · ${rejected.length} skipped` : ""
            }`
          : `No compatible files were uploaded (${rejected.length} skipped).`,
      documents: uploadedDocs,
      rejected,
      pdfVisualDiagnostics,
    });
  } catch (error) {
    console.error("[brain/knowledge/upload]", error);
    return NextResponse.json({ error: "Failed to upload file(s)." }, { status: 500 });
  }
}
