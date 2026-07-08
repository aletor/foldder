import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { recordApiUsage, resolveUsageUserEmailFromRequest } from "@/lib/api-usage";
import {
  canUserAccessKnowledgeFileKey,
  isSafeKnowledgeFilesKey,
  requireSpacesAuthUser,
} from "@/lib/spaces-access-control";
import { BUCKET_NAME, getFromS3, s3Client } from "@/lib/s3-utils";
import { hashPdfBuffer } from "@/lib/brain/pdf-brand-extract";
import { appendPdfVisualKnowledgeDocuments } from "@/lib/brain/pdf-knowledge-visual-docs";
import { buildUploadCheckpoints, type BrandPipelineCheckpointUpload } from "@/lib/brandkit/brand-pipeline-diagnostics";

export const runtime = "nodejs";

const MAX_DIRECT_UPLOAD_BYTES = 40 * 1024 * 1024;
const S3_HEAD_RETRIES = 4;
const S3_HEAD_RETRY_MS = 350;

type RegisterItem = {
  key?: unknown;
  name?: unknown;
  size?: unknown;
  mime?: unknown;
  scope?: unknown;
  contextKind?: unknown;
};

function getExt(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  return ext === "jpeg" ? "jpg" : ext;
}

function docFormat(name: string, mime: string): "pdf" | "docx" | "txt" | "html" | "image" {
  const ext = getExt(name);
  if (mime.startsWith("image/") || ["jpg", "png", "webp", "avif"].includes(ext)) return "image";
  if (ext === "pdf") return "pdf";
  if (ext === "docx") return "docx";
  if (ext === "html" || ext === "htm") return "html";
  return "txt";
}

function normalizeContextKind(value: unknown): "competencia" | "mercado" | "referencia" | "general" | undefined {
  return value === "competencia" || value === "mercado" || value === "referencia" || value === "general"
    ? value
    : undefined;
}

async function headUploadedObject(key: string) {
  let lastError: unknown;
  for (let attempt = 0; attempt < S3_HEAD_RETRIES; attempt += 1) {
    try {
      return await s3Client.send(new HeadObjectCommand({ Bucket: BUCKET_NAME, Key: key }));
    } catch (error) {
      lastError = error;
      const status = (error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
      const name = (error as { name?: string })?.name;
      const missing = status === 404 || name === "NotFound";
      if (!missing || attempt === S3_HEAD_RETRIES - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, S3_HEAD_RETRY_MS * (attempt + 1)));
    }
  }
  throw lastError;
}

export async function POST(req: Request) {
  try {
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;
    const usageUserEmail = await resolveUsageUserEmailFromRequest(req);
    const body = (await req.json().catch(() => null)) as { items?: RegisterItem[] } | null;
    const items = Array.isArray(body?.items) ? body.items : [];
    if (!items.length) {
      return NextResponse.json({ error: "items_required" }, { status: 400 });
    }

    const documents = [];
    const rejected: Array<{ name: string; reason: string }> = [];
    const pdfVisualDiagnostics: Array<{
      name: string;
      pageRenderCount: number;
      extractedImageCount: number;
      uploadedVisualCount: number;
      imageObjectCount: number;
      renderError?: string;
    }> = [];

    for (const item of items) {
      const key = typeof item.key === "string" ? item.key.trim() : "";
      const name = typeof item.name === "string" && item.name.trim() ? item.name.trim() : key.split("/").pop() || "document";
      const requestedMime = typeof item.mime === "string" && item.mime.trim()
        ? item.mime.trim().toLowerCase()
        : "application/octet-stream";
      const scope: "core" | "context" = item.scope === "context" ? "context" : "core";
      const contextKind = normalizeContextKind(item.contextKind);

      if (!isSafeKnowledgeFilesKey(key)) {
        rejected.push({ name, reason: "invalid_key" });
        continue;
      }
      const allowed = await canUserAccessKnowledgeFileKey(authState.user.email, key);
      if (!allowed) {
        rejected.push({ name, reason: "forbidden_key" });
        continue;
      }

      const head = await headUploadedObject(key);
      const size = Number(head.ContentLength ?? item.size ?? 0);
      const mime = (head.ContentType || requestedMime).toLowerCase();
      if (!Number.isFinite(size) || size <= 0) {
        rejected.push({ name, reason: "empty_file" });
        continue;
      }
      if (size > MAX_DIRECT_UPLOAD_BYTES) {
        rejected.push({ name, reason: "file_too_large" });
        continue;
      }

      await recordApiUsage({
        provider: "aws",
        userEmail: usageUserEmail,
        serviceId: "s3-knowledge",
        route: "/api/spaces/brain/knowledge/register",
        operation: "browser_put_object_registered",
        costIsKnown: false,
        costUsd: 0,
        bytes: size,
        metadata: { key, mime },
      });

      const format = docFormat(name, mime);
      let contentSha256: string | undefined;
      let pdfBuffer: Buffer | undefined;
      if (format === "pdf") {
        pdfBuffer = await getFromS3(key);
        contentSha256 = hashPdfBuffer(pdfBuffer);
      }
      documents.push({
        id: uuidv4(),
        name,
        size,
        mime,
        scope,
        contextKind,
        s3Path: key,
        type: format === "image" ? "image" : "document",
        format,
        status: "Subido",
        uploadedAt: new Date().toISOString(),
        ...(contentSha256 ? { contentSha256 } : {}),
      });

      if (format === "pdf" && pdfBuffer) {
        const { visualDocs, diagnostic } = await appendPdfVisualKnowledgeDocuments({
          pdfBuffer,
          pdfName: name,
          parentS3Key: key,
          userEmail: authState.user.email,
          usageUserEmail,
          scope,
          contextKind,
          route: "/api/spaces/brain/knowledge/register",
        });
        pdfVisualDiagnostics.push(diagnostic);
        documents.push(...visualDocs);
      }
    }

    const brandPipelineUpload: BrandPipelineCheckpointUpload[] = buildUploadCheckpoints({
      existingDocs: [],
      addedDocs: documents.map((doc) => ({
        id: doc.id,
        contentSha256: (doc as { contentSha256?: string }).contentSha256,
        name: doc.name,
      })),
    });

    return NextResponse.json({
      message:
        documents.length > 0
          ? `Successfully uploaded ${documents.length} file(s)${rejected.length ? ` · ${rejected.length} skipped` : ""}`
          : `No compatible files were uploaded (${rejected.length} skipped).`,
      documents,
      rejected,
      pdfVisualDiagnostics,
      brandPipelineUpload,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to register file(s).";
    console.error("[brain/knowledge/register]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
