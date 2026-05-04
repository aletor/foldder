import { NextRequest, NextResponse } from "next/server";
import { recordApiUsage, resolveUsageUserEmailFromRequest } from "@/lib/api-usage";
import { uploadToS3 } from "@/lib/s3-utils";
import { v4 as uuidv4 } from "uuid";
import axios from "axios";
import * as cheerio from "cheerio";

type KnowledgeScope = "core" | "context";
type KnowledgeContextKind = "competencia" | "mercado" | "referencia" | "general";
type UrlVisualDocument = {
  id: string;
  name: string;
  size: number;
  mime: string;
  scope: KnowledgeScope;
  contextKind?: KnowledgeContextKind;
  s3Path: string;
  type: "image";
  format: "image";
  status: "Subido";
  uploadedAt: string;
  originalSourceUrl: string;
};

function absoluteUrl(raw: string | undefined, base: string): string | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    return new URL(value, base).toString();
  } catch {
    return null;
  }
}

function uniqueUrls(urls: Array<string | null>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const url of urls) {
    if (!url || seen.has(url)) continue;
    if (!/^https?:\/\//i.test(url)) continue;
    seen.add(url);
    out.push(url);
    if (out.length >= 4) break;
  }
  return out;
}

function extensionFromMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes("png")) return "png";
  if (m.includes("webp")) return "webp";
  if (m.includes("svg")) return "svg";
  return "jpg";
}

async function fetchUrlVisualDocument(params: {
  contextKind?: KnowledgeContextKind;
  imageUrl: string;
  index: number;
  scope: KnowledgeScope;
  title: string;
  usageUserEmail: string | undefined;
}): Promise<UrlVisualDocument | null> {
  try {
    const img = await axios.get<ArrayBuffer>(params.imageUrl, {
      responseType: "arraybuffer",
      timeout: 10_000,
      maxContentLength: 4 * 1024 * 1024,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      },
    });
    const mime = String(img.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
    if (!mime.startsWith("image/")) return null;
    const buf = Buffer.from(img.data);
    if (!buf.length || buf.length > 4 * 1024 * 1024) return null;
    const ext = extensionFromMime(mime);
    const visualFilename = `URL-visual-${Date.now()}-${params.index + 1}.${ext}`;
    const visualKey = await uploadToS3(visualFilename, buf, mime);
    await recordApiUsage({
      provider: "aws",
      userEmail: params.usageUserEmail,
      serviceId: "s3-knowledge",
      route: "/api/spaces/brain/knowledge/url",
      operation: "put_object",
      costIsKnown: false,
      costUsd: 0,
      bytes: buf.length,
      metadata: { key: visualKey, source: "url_visual_extract" },
    });
    return {
      id: uuidv4(),
      name: `[URL visual] ${params.title}`,
      size: buf.length,
      mime,
      scope: params.scope,
      contextKind: params.contextKind,
      s3Path: visualKey,
      type: "image",
      format: "image",
      status: "Subido",
      uploadedAt: new Date().toISOString(),
      originalSourceUrl: params.imageUrl,
    };
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const usageUserEmail = await resolveUsageUserEmailFromRequest(req);
    const { url, scope: scopeRaw, contextKind: contextKindRaw } = (await req.json()) as {
      url?: string;
      scope?: "core" | "context";
      contextKind?: "competencia" | "mercado" | "referencia" | "general";
    };
    if (!url) return NextResponse.json({ error: "URL is required" }, { status: 400 });
    const scope: KnowledgeScope = scopeRaw === "context" ? "context" : "core";
    const contextKind =
      contextKindRaw === "competencia" ||
      contextKindRaw === "mercado" ||
      contextKindRaw === "referencia" ||
      contextKindRaw === "general"
        ? contextKindRaw
        : undefined;

    const normalized = url.includes("://") ? url.trim() : `https://${url.trim()}`;
    const response = await axios.get(normalized, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
      },
      timeout: 15_000,
    });

    const $ = cheerio.load(response.data);
    const visualCandidates = uniqueUrls([
      absoluteUrl($('meta[property="og:image"]').attr("content"), normalized),
      absoluteUrl($('meta[name="twitter:image"]').attr("content"), normalized),
      absoluteUrl($('link[rel="apple-touch-icon"]').attr("href"), normalized),
      absoluteUrl($('link[rel="icon"]').attr("href"), normalized),
      absoluteUrl($('img[src]').first().attr("src"), normalized),
    ]);
    $("script, style, nav, footer, header, noscript").remove();
    const title = $("title").text() || normalized.replace(/^https?:\/\//, "").replace(/\/$/, "");
    const bodyText = $("body").text().replace(/\s+/g, " ").trim();
    if (bodyText.length < 50) {
      return NextResponse.json(
        { error: "Could not extract enough content from the URL." },
        { status: 400 },
      );
    }

    const filename = `URL-${Date.now()}.txt`;
    const textBuf = Buffer.from(bodyText, "utf-8");
    const s3Key = await uploadToS3(filename, textBuf, "text/plain");
    await recordApiUsage({
      provider: "aws",
      userEmail: usageUserEmail,
      serviceId: "s3-knowledge",
      route: "/api/spaces/brain/knowledge/url",
      operation: "put_object",
      costIsKnown: false,
      costUsd: 0,
      bytes: textBuf.length,
      metadata: { key: s3Key, source: "url_extract" },
    });
    const docRecord = {
      id: uuidv4(),
      name: `[URL] ${title}`,
      size: textBuf.length,
      mime: "text/plain",
      scope,
      contextKind,
      s3Path: s3Key,
      type: "document",
      format: "url",
      status: "Subido",
      uploadedAt: new Date().toISOString(),
      originalSourceUrl: normalized,
    };

    const visualDocuments = (
      await Promise.all(
        visualCandidates.map((imageUrl, index) =>
          fetchUrlVisualDocument({ contextKind, imageUrl, index, scope, title, usageUserEmail }),
        ),
      )
    ).filter((doc): doc is UrlVisualDocument => Boolean(doc));

    return NextResponse.json({
      message: "URL added successfully",
      document: docRecord,
      documents: [docRecord, ...visualDocuments],
    });
  } catch (error) {
    console.error("[brain/knowledge/url]", error);
    return NextResponse.json({ error: "Failed to extract content from URL." }, { status: 500 });
  }
}
