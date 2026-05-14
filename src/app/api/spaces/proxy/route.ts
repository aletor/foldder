import { NextRequest, NextResponse } from "next/server";
import {
  canUserAccessKnowledgeFileKey,
  requireSpacesAuthUser,
} from "@/lib/spaces-access-control";
import { BUCKET_NAME, getFromS3 } from "@/lib/s3-utils";

/** Muchos CDNs devuelven 403 si el fetch parece un bot sin User-Agent de navegador. */
const UPSTREAM_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

type ProxyTarget =
  | { kind: "remote"; url: string }
  | { kind: "s3"; key: string };

const KNOWLEDGE_FILES_PREFIX = "knowledge-files/";

function safeDecodeUriComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function inferImageContentType(value: string): string {
  const lower = value.toLowerCase().split("?")[0] || "";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".avif")) return "image/avif";
  return "image/jpeg";
}

function looksLikeImageUrl(value: string): boolean {
  return /\.(png|jpe?g|webp|gif|avif|svg)(\?|$)/i.test(value);
}

function isPrivateOrLocalHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    return true;
  }
  if (host === "::1" || host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd")) {
    return true;
  }
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!match) return false;
  const octets = match.slice(1).map(Number);
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return true;
  const [a, b] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

function tryExtractKnowledgeFilesKey(value: string, baseUrl: string): string | null {
  const raw = value.trim();
  if (raw.startsWith(KNOWLEDGE_FILES_PREFIX)) return raw;
  try {
    const url = new URL(raw, baseUrl);
    const routeKey = url.pathname === "/api/spaces/s3-file" ? url.searchParams.get("key")?.trim() : "";
    if (routeKey?.startsWith(KNOWLEDGE_FILES_PREFIX)) return routeKey;
    const decodedPath = safeDecodeUriComponent(url.pathname.replace(/^\/+/, ""));
    const idx = decodedPath.indexOf(KNOWLEDGE_FILES_PREFIX);
    if (idx >= 0) return decodedPath.slice(idx);
    const pathStylePrefix = `${BUCKET_NAME}/${KNOWLEDGE_FILES_PREFIX}`;
    const pathStyleIdx = decodedPath.indexOf(pathStylePrefix);
    return pathStyleIdx >= 0 ? decodedPath.slice(pathStyleIdx + BUCKET_NAME.length + 1) : null;
  } catch {
    return null;
  }
}

async function authorizeProxyTarget(req: NextRequest, imageUrl: string, userEmail: string): Promise<ProxyTarget | NextResponse> {
  const key = tryExtractKnowledgeFilesKey(imageUrl, req.url);
  if (key) {
    const allowed = await canUserAccessKnowledgeFileKey(userEmail, key);
    if (!allowed) return NextResponse.json({ error: "forbidden_key" }, { status: 403 });
    return { kind: "s3", key };
  }

  let url: URL;
  try {
    url = new URL(imageUrl, req.url);
  } catch {
    return NextResponse.json({ error: "invalid_url" }, { status: 400 });
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return NextResponse.json({ error: "unsupported_url_protocol" }, { status: 400 });
  }
  if (url.username || url.password || isPrivateOrLocalHostname(url.hostname)) {
    return NextResponse.json({ error: "blocked_url" }, { status: 400 });
  }
  return { kind: "remote", url: url.toString() };
}

async function proxyImage(target: ProxyTarget): Promise<Response> {
  if (target.kind === "s3") {
    const buffer = await getFromS3(target.key);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": inferImageContentType(target.key),
        "Cache-Control": "private, max-age=3600",
      },
    });
  }

  let response: Response;
  try {
    const imageUrl = target.url;
    const headers: Record<string, string> = {
      Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      "User-Agent": UPSTREAM_UA,
    };

    response = await fetch(imageUrl, {
      redirect: "follow",
      cache: "no-store",
      headers,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `fetch failed: ${msg}` }, { status: 502 });
  }

  if (!response.ok) {
    const snippet = await response.text().catch(() => "");
    return NextResponse.json(
      {
        error: `upstream ${response.status} ${response.statusText}`,
        upstreamStatus: response.status,
        bodySnippet: snippet.slice(0, 240),
      },
      { status: 502 },
    );
  }

  const contentType = response.headers.get("content-type") || "application/octet-stream";
  const isImage = contentType.toLowerCase().startsWith("image/") || looksLikeImageUrl(response.url || target.url);
  if (!isImage) {
    return NextResponse.json({ error: "upstream_not_image", contentType }, { status: 415 });
  }
  const blob = await response.blob();

  return new Response(blob, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export async function GET(req: NextRequest) {
  const authState = await requireSpacesAuthUser(req);
  if (!authState.ok) return authState.response;

  const { searchParams } = new URL(req.url);
  const imageUrl = searchParams.get("url");

  if (!imageUrl) {
    return NextResponse.json({ error: "URL parameter is required" }, { status: 400 });
  }

  const target = await authorizeProxyTarget(req, imageUrl, authState.user.email);
  if (target instanceof NextResponse) return target;
  return proxyImage(target);
}

/** Prefer POST: presigned S3 URLs exceed safe query-string limits for GET. */
export async function POST(req: NextRequest) {
  const authState = await requireSpacesAuthUser(req);
  if (!authState.ok) return authState.response;

  let imageUrl: string;
  try {
    const body = (await req.json()) as { url?: unknown };
    imageUrl = typeof body.url === "string" ? body.url.trim() : "";
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!imageUrl) {
    return NextResponse.json({ error: "url is required in body" }, { status: 400 });
  }

  const target = await authorizeProxyTarget(req, imageUrl, authState.user.email);
  if (target instanceof NextResponse) return target;
  return proxyImage(target);
}
