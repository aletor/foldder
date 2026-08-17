import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { BUCKET_NAME, getFromS3, s3Client } from "@/lib/s3-utils";
import type { PublishImageRef } from "@/app/spaces/site-creator/site-creator-publish-placeholders";

export const PUBLISHED_SITE_PREFIX = "public-sites/";
export const PUBLISHED_SITE_HTML = "index.html";
export const PUBLISHED_SITE_CSS = "styles.css";
export const PUBLISHED_SITE_JS = "script.js";

export type PublishedSiteFile = {
  relativePath: string;
  body: Buffer;
  contentType: string;
};

export type PublishedSiteStoreOptions = {
  localRoot?: string;
  s3Enabled?: boolean;
};

const DEFAULT_LOCAL_ROOT = path.join(process.cwd(), "data", "public-sites");

export function createPublishedSiteId(): string {
  return randomBytes(16).toString("hex");
}

export function isValidPublishedSiteId(siteId: string): boolean {
  return /^[a-f0-9]{32}$/.test(siteId);
}

export function publicSitePath(siteId: string): string {
  return `/s/${siteId}/`;
}

export function publishedSitePrefix(siteId: string): string {
  if (!isValidPublishedSiteId(siteId)) {
    throw new Error("siteId público no válido");
  }
  return `${PUBLISHED_SITE_PREFIX}${siteId}/`;
}

export function isSafePublishedRelativePath(relativePath: string): boolean {
  if (!relativePath || relativePath.includes("\0") || relativePath.includes("\\")) return false;
  if (relativePath.startsWith("/") || relativePath.includes("..")) return false;
  const parts = relativePath.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) return false;
  return /^(index\.html|styles\.css|script\.js|assets\/[a-zA-Z0-9._-]+)$/.test(relativePath);
}

export function planPublishedSiteOverwrite(args: {
  existingRelativePaths: string[];
  nextRelativePaths: string[];
}): { uploadOrder: string[]; deleteRelativePaths: string[] } {
  const next = [...new Set(args.nextRelativePaths.filter(isSafePublishedRelativePath))];
  const uploadOrder = [
    ...next.filter((rel) => rel !== PUBLISHED_SITE_HTML),
    ...(next.includes(PUBLISHED_SITE_HTML) ? [PUBLISHED_SITE_HTML] : []),
  ];
  const nextSet = new Set(next);
  const deleteRelativePaths = [...new Set(args.existingRelativePaths)].filter(
    (rel) => isSafePublishedRelativePath(rel) && !nextSet.has(rel),
  );
  return { uploadOrder, deleteRelativePaths };
}

export function contentTypeForPublishedPath(relativePath: string): string {
  const ext = path.posix.extname(relativePath).toLowerCase();
  switch (ext) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".svg":
      return "image/svg+xml";
    case ".woff2":
      return "font/woff2";
    case ".woff":
      return "font/woff";
    default:
      return "application/octet-stream";
  }
}

export function cacheControlForPublishedPath(relativePath: string): string {
  if (relativePath.startsWith("assets/")) return "public, max-age=31536000, immutable";
  return "public, max-age=0, must-revalidate";
}

function isS3Enabled(): boolean {
  const localOnly = (process.env.FOLDDER_JSON_STORE_LOCAL_ONLY || "").trim().toLowerCase();
  if (localOnly === "1" || localOnly === "true" || localOnly === "yes") return false;
  return Boolean(
    process.env.AWS_ACCESS_KEY_ID?.trim() &&
      process.env.AWS_SECRET_ACCESS_KEY?.trim() &&
      BUCKET_NAME,
  );
}

function resolveOptions(options?: PublishedSiteStoreOptions): Required<PublishedSiteStoreOptions> {
  return {
    localRoot: options?.localRoot ?? DEFAULT_LOCAL_ROOT,
    s3Enabled: options?.s3Enabled ?? isS3Enabled(),
  };
}

function localFilePath(localRoot: string, siteId: string, relativePath: string): string {
  if (!isValidPublishedSiteId(siteId) || !isSafePublishedRelativePath(relativePath)) {
    throw new Error("ruta de sitio publicado no válida");
  }
  const root = path.resolve(path.join(localRoot, siteId));
  const full = path.resolve(path.join(root, ...relativePath.split("/")));
  if (full !== root && !full.startsWith(root + path.sep)) {
    throw new Error("ruta de sitio publicado fuera de carpeta");
  }
  return full;
}

export async function listPublishedSiteRelativePaths(
  siteId: string,
  options?: PublishedSiteStoreOptions,
): Promise<string[]> {
  const opts = resolveOptions(options);
  if (opts.s3Enabled) {
    const prefix = publishedSitePrefix(siteId);
    const keys: string[] = [];
    let token: string | undefined;
    do {
      const resp = await s3Client.send(
        new ListObjectsV2Command({
          Bucket: BUCKET_NAME,
          Prefix: prefix,
          ContinuationToken: token,
        }),
      );
      for (const obj of resp.Contents ?? []) {
        if (!obj.Key) continue;
        const rel = obj.Key.slice(prefix.length);
        if (rel && isSafePublishedRelativePath(rel)) keys.push(rel);
      }
      token = resp.IsTruncated ? resp.NextContinuationToken : undefined;
    } while (token);
    return keys;
  }
  const dir = path.join(opts.localRoot, siteId);
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
      if (entry.isFile() && isSafePublishedRelativePath(entry.name)) files.push(entry.name);
      if (entry.isDirectory() && entry.name === "assets") {
        const assets = await fs.readdir(path.join(dir, "assets"));
        for (const name of assets) {
          const rel = `assets/${name}`;
          if (isSafePublishedRelativePath(rel)) files.push(rel);
        }
      }
    }
    return files;
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === "ENOENT") return [];
    throw error;
  }
}

async function writeOneFile(
  siteId: string,
  file: PublishedSiteFile,
  opts: Required<PublishedSiteStoreOptions>,
): Promise<void> {
  if (!isSafePublishedRelativePath(file.relativePath)) {
    throw new Error(`archivo publicado no permitido: ${file.relativePath}`);
  }
  if (opts.s3Enabled) {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: `${publishedSitePrefix(siteId)}${file.relativePath}`,
        Body: file.body,
        ContentType: file.contentType,
        CacheControl: cacheControlForPublishedPath(file.relativePath),
      }),
    );
    return;
  }
  const full = localFilePath(opts.localRoot, siteId, file.relativePath);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, file.body);
}

async function deleteOneFile(
  siteId: string,
  relativePath: string,
  opts: Required<PublishedSiteStoreOptions>,
): Promise<void> {
  if (!isSafePublishedRelativePath(relativePath)) return;
  if (opts.s3Enabled) {
    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: BUCKET_NAME,
        Key: `${publishedSitePrefix(siteId)}${relativePath}`,
      }),
    );
    return;
  }
  const full = localFilePath(opts.localRoot, siteId, relativePath);
  await fs.unlink(full).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });
}

export async function writePublishedSite(
  siteId: string,
  files: PublishedSiteFile[],
  options?: PublishedSiteStoreOptions,
): Promise<{ fileCount: number; deletedCount: number }> {
  if (!isValidPublishedSiteId(siteId)) throw new Error("siteId público no válido");
  const opts = resolveOptions(options);
  const byPath = new Map<string, PublishedSiteFile>();
  for (const file of files) {
    if (!isSafePublishedRelativePath(file.relativePath)) {
      throw new Error(`archivo publicado no permitido: ${file.relativePath}`);
    }
    byPath.set(file.relativePath, file);
  }
  const existing = await listPublishedSiteRelativePaths(siteId, opts);
  const plan = planPublishedSiteOverwrite({
    existingRelativePaths: existing,
    nextRelativePaths: [...byPath.keys()],
  });
  for (const rel of plan.uploadOrder) {
    const file = byPath.get(rel);
    if (file) await writeOneFile(siteId, file, opts);
  }
  for (const rel of plan.deleteRelativePaths) {
    await deleteOneFile(siteId, rel, opts);
  }
  return { fileCount: byPath.size, deletedCount: plan.deleteRelativePaths.length };
}

export async function deletePublishedSite(
  siteId: string,
  options?: PublishedSiteStoreOptions,
): Promise<number> {
  if (!isValidPublishedSiteId(siteId)) throw new Error("siteId público no válido");
  const opts = resolveOptions(options);
  const existing = await listPublishedSiteRelativePaths(siteId, opts);
  for (const rel of existing) {
    await deleteOneFile(siteId, rel, opts);
  }
  if (!opts.s3Enabled) {
    await fs.rm(path.join(opts.localRoot, siteId), { recursive: true, force: true });
  }
  return existing.length;
}

export async function readPublishedSiteFile(
  siteId: string,
  relativePath: string,
  options?: PublishedSiteStoreOptions,
): Promise<PublishedSiteFile | null> {
  if (!isValidPublishedSiteId(siteId) || !isSafePublishedRelativePath(relativePath)) return null;
  const opts = resolveOptions(options);
  if (opts.s3Enabled) {
    try {
      const resp = await s3Client.send(
        new GetObjectCommand({
          Bucket: BUCKET_NAME,
          Key: `${publishedSitePrefix(siteId)}${relativePath}`,
        }),
      );
      if (!resp.Body) return null;
      const bytes = await resp.Body.transformToByteArray();
      return {
        relativePath,
        body: Buffer.from(bytes),
        contentType: resp.ContentType || contentTypeForPublishedPath(relativePath),
      };
    } catch (error) {
      const err = error as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (err.name === "NoSuchKey" || err.$metadata?.httpStatusCode === 404) return null;
      throw error;
    }
  }
  try {
    const body = await fs.readFile(localFilePath(opts.localRoot, siteId, relativePath));
    return { relativePath, body, contentType: contentTypeForPublishedPath(relativePath) };
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === "ENOENT") return null;
    throw error;
  }
}

export function extensionForContentType(contentType: string, fallbackPath = ""): string {
  const mime = contentType.split(";")[0]?.trim().toLowerCase() || "";
  const fromName = path.posix.extname(fallbackPath).toLowerCase();
  if (mime === "image/png") return ".png";
  if (mime === "image/jpeg") return ".jpg";
  if (mime === "image/webp") return ".webp";
  if (mime === "image/gif") return ".gif";
  if (mime === "image/svg+xml") return ".svg";
  if (mime === "font/woff2") return ".woff2";
  if (fromName && fromName.length <= 5) return fromName;
  return ".bin";
}

export function decodeDataUrl(src: string): { body: Buffer; contentType: string } | null {
  const match = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/.exec(src);
  if (!match) return null;
  const contentType = match[1] || "application/octet-stream";
  const body = match[2] ? Buffer.from(match[3], "base64") : Buffer.from(decodeURIComponent(match[3]));
  if (!body.length) return null;
  return { body, contentType };
}

export async function materializePublishImages(
  refs: PublishImageRef[],
): Promise<{ files: PublishedSiteFile[]; hrefByLayerId: Record<string, string> }> {
  const hrefByLayerId: Record<string, string> = {};
  const files: PublishedSiteFile[] = [];
  const seenHash = new Map<string, string>();

  for (const ref of refs) {
    const resolved = await resolveImageBytes(ref);
    if (!resolved) {
      throw new Error(`No se pudo copiar la imagen de la capa ${ref.layerId}`);
    }
    const hash = createHash("sha256").update(resolved.body).digest("hex").slice(0, 16);
    const existing = seenHash.get(hash);
    if (existing) {
      hrefByLayerId[ref.layerId] = existing;
      continue;
    }
    const ext = extensionForContentType(resolved.contentType, ref.s3Key || ref.src || "");
    const relativePath = `assets/img-${hash}${ext}`;
    seenHash.set(hash, relativePath);
    hrefByLayerId[ref.layerId] = relativePath;
    files.push({
      relativePath,
      body: resolved.body,
      contentType: contentTypeForPublishedPath(relativePath),
    });
  }

  return { files, hrefByLayerId };
}

async function resolveImageBytes(
  ref: PublishImageRef,
): Promise<{ body: Buffer; contentType: string } | null> {
  if (ref.s3Key) {
    const body = await getFromS3(ref.s3Key);
    return { body, contentType: contentTypeForPublishedPath(ref.s3Key) };
  }
  if (ref.src?.startsWith("data:")) return decodeDataUrl(ref.src);
  if (ref.src?.startsWith("http://") || ref.src?.startsWith("https://")) {
    const response = await fetch(ref.src);
    if (!response.ok) return null;
    const mime = response.headers.get("content-type") || "application/octet-stream";
    const body = Buffer.from(await response.arrayBuffer());
    if (!body.length) return null;
    return { body, contentType: mime };
  }
  return null;
}
