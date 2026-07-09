import { NextRequest, NextResponse } from "next/server";
import { recordApiUsage, resolveUsageUserEmailFromRequest } from "@/lib/api-usage";
import { hashPdfBuffer } from "@/lib/brain/pdf-brand-extract";
import { appendPdfVisualKnowledgeDocuments } from "@/lib/brain/pdf-knowledge-visual-docs";
import {
  getKnowledgeFileExt,
  isAllowedKnowledgeUpload,
  knowledgeContentTypeForExt,
  resolveKnowledgeContentType,
} from "@/lib/brain/knowledge-upload-policy";
import { buildUploadCheckpoints, type BrandPipelineCheckpointUpload } from "@/lib/brandkit/brand-pipeline-diagnostics";
import { normalizeUploadedImageForFoldder } from "@/lib/foldder-server-image-optimization";
import { buildUserAssetObjectKey, requireSpacesAuthUser } from "@/lib/spaces-access-control";
import { uploadBufferToS3Key } from "@/lib/s3-utils";
import { v4 as uuidv4 } from "uuid";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

export const runtime = "nodejs";

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
    const usageUserEmail = (await resolveUsageUserEmailFromRequest(req)) ?? authState.user.email;
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
      renderError?: string;
    }> = [];
    for (const file of files) {
      const ext = getKnowledgeFileExt(file.name);
      const mime = resolveKnowledgeContentType(file.name, file.type);
      const isImage = mime.startsWith("image/") || ["jpg", "png", "webp", "avif"].includes(ext);
      const isHtml = ext === "html" || ext === "htm";

      if (!isAllowedKnowledgeUpload(file.name, file.type)) {
        rejected.push({ name: file.name, reason: "unsupported_type" });
        continue;
      }

      if (!isImage && file.size > MAX_FILE_BYTES) {
        rejected.push({ name: file.name, reason: "file_too_large" });
        continue;
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const uploadMime = isImage && !mime.startsWith("image/")
        ? knowledgeContentTypeForExt(ext)
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
      const contentSha256 = format === "pdf" ? hashPdfBuffer(normalized.buffer) : undefined;

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
        ...(contentSha256 ? { contentSha256 } : {}),
      });

      if (format === "pdf") {
        const { visualDocs, diagnostic } = await appendPdfVisualKnowledgeDocuments({
          pdfBuffer: normalized.buffer,
          pdfName: file.name,
          parentS3Key: s3Key,
          userEmail: authState.user.email,
          usageUserEmail,
          scope,
          contextKind,
          route: "/api/spaces/brain/knowledge/upload",
        });
        pdfVisualDiagnostics.push(diagnostic);
        uploadedDocs.push(...visualDocs);
      }
    }

    const brandPipelineUpload: BrandPipelineCheckpointUpload[] = buildUploadCheckpoints({
      existingDocs: [],
      addedDocs: uploadedDocs.map((doc) => ({
        id: doc.id,
        contentSha256: (doc as { contentSha256?: string }).contentSha256,
        name: doc.name,
      })),
    });

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
      brandPipelineUpload,
    });
  } catch (error) {
    console.error("[brain/knowledge/upload]", error);
    return NextResponse.json({ error: "Failed to upload file(s)." }, { status: 500 });
  }
}
