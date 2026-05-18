import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { recordApiUsage, resolveUsageUserEmailFromRequest } from "@/lib/api-usage";
import {
  canUserAccessKnowledgeFileKey,
  isSafeKnowledgeFilesKey,
  requireSpacesAuthUser,
} from "@/lib/spaces-access-control";
import { BUCKET_NAME, s3Client } from "@/lib/s3-utils";

export const runtime = "nodejs";

const MAX_DIRECT_UPLOAD_BYTES = 40 * 1024 * 1024;

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
  if (mime.startsWith("image/") || ["jpg", "png", "webp"].includes(ext)) return "image";
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

      const head = await s3Client.send(new HeadObjectCommand({ Bucket: BUCKET_NAME, Key: key }));
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
      });
    }

    return NextResponse.json({
      message:
        documents.length > 0
          ? `Successfully uploaded ${documents.length} file(s)${rejected.length ? ` · ${rejected.length} skipped` : ""}`
          : `No compatible files were uploaded (${rejected.length} skipped).`,
      documents,
      rejected,
      pdfVisualDiagnostics: [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to register file(s).";
    console.error("[brain/knowledge/register]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
