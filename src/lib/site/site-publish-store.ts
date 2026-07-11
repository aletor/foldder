import fs from "fs/promises";
import path from "path";
import { uploadBufferToS3Key } from "@/lib/s3-utils";
import { foldderCdnHostname } from "./site-domain";
import {
  ddbGetPublishedSiteRecord,
  ddbPutPublishedSiteRecord,
  ddbResolveSlugByDomain,
} from "./site-publish-ddb";

export type PublishedSitePageEntry = {
  pageId: string;
  pathSlug: string;
  title: string;
  file: string;
};

export type PublishedSiteRecord = {
  slug: string;
  projectId: string;
  nodeId: string;
  ownerEmail: string;
  publishedAt: string;
  snapshotHash: string;
  locale: string;
  title: string;
  pages: PublishedSitePageEntry[];
  customDomain?: string;
  cdnHostname?: string;
};

type PublishedSiteRegistry = Record<string, PublishedSiteRecord>;

const LOCAL_ROOT = path.join(process.cwd(), "data", "published-sites");
const REGISTRY_PATH = path.join(LOCAL_ROOT, "registry.json");
const SITES_S3_PREFIX = "sites/published";

function isSitePublishS3Enabled(): boolean {
  return Boolean(
    process.env.AWS_ACCESS_KEY_ID?.trim() &&
      process.env.AWS_SECRET_ACCESS_KEY?.trim() &&
      process.env.AWS_S3_BUCKET_NAME?.trim(),
  );
}

function siteLocalDir(slug: string): string {
  return path.join(LOCAL_ROOT, slug);
}

function siteS3Key(slug: string, file: string): string {
  return `${SITES_S3_PREFIX}/${slug}/${file}`;
}

async function readRegistry(): Promise<PublishedSiteRegistry> {
  try {
    const raw = await fs.readFile(REGISTRY_PATH, "utf8");
    return JSON.parse(raw) as PublishedSiteRegistry;
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === "ENOENT") return {};
    throw error;
  }
}

async function writeRegistry(registry: PublishedSiteRegistry): Promise<void> {
  await fs.mkdir(LOCAL_ROOT, { recursive: true });
  await fs.writeFile(REGISTRY_PATH, JSON.stringify(registry, null, 2), "utf8");
}

export async function readPublishedSiteRecord(slug: string): Promise<PublishedSiteRecord | null> {
  const fromDdb = await ddbGetPublishedSiteRecord(slug);
  if (fromDdb) return fromDdb;
  const registry = await readRegistry();
  return registry[slug] ?? null;
}

export async function readPublishedSiteHtml(slug: string, pathSlug = "index"): Promise<string | null> {
  const record = await readPublishedSiteRecord(slug);
  if (!record) return null;
  const page = record.pages.find((entry) => entry.pathSlug === pathSlug);
  if (!page) return null;
  const localPath = path.join(siteLocalDir(slug), page.file);
  try {
    return await fs.readFile(localPath, "utf8");
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === "ENOENT") return null;
    throw error;
  }
}

export async function resolvePublishedSiteSlugByDomain(host: string): Promise<string | null> {
  const fromDdb = await ddbResolveSlugByDomain(host);
  if (fromDdb) return fromDdb;
  const normalized = host.trim().toLowerCase().split(":")[0] ?? "";
  const registry = await readRegistry();
  for (const record of Object.values(registry)) {
    if (record.customDomain?.toLowerCase() === normalized) return record.slug;
    if (record.cdnHostname?.toLowerCase() === normalized) return record.slug;
    if (`${record.slug}.foldder.com` === normalized) return record.slug;
  }
  return null;
}

export type PersistPublishedSiteInput = {
  record: PublishedSiteRecord;
  documents: Array<{ pathSlug: string; file: string; html: string }>;
};

export async function persistPublishedSite(input: PersistPublishedSiteInput): Promise<void> {
  const { record, documents } = input;
  const enriched: PublishedSiteRecord = {
    ...record,
    cdnHostname: record.cdnHostname ?? foldderCdnHostname(record.slug),
  };
  const dir = siteLocalDir(enriched.slug);
  await fs.mkdir(dir, { recursive: true });

  for (const doc of documents) {
    const localPath = path.join(dir, doc.file);
    await fs.mkdir(path.dirname(localPath), { recursive: true });
    await fs.writeFile(localPath, doc.html, "utf8");
    if (isSitePublishS3Enabled()) {
      await uploadBufferToS3Key(
        siteS3Key(enriched.slug, doc.file),
        Buffer.from(doc.html, "utf8"),
        "text/html; charset=utf-8",
      );
    }
  }

  await fs.writeFile(path.join(dir, "meta.json"), JSON.stringify(enriched, null, 2), "utf8");
  if (isSitePublishS3Enabled()) {
    await uploadBufferToS3Key(
      siteS3Key(enriched.slug, "meta.json"),
      Buffer.from(JSON.stringify(enriched, null, 2), "utf8"),
      "application/json",
    );
  }

  const registry = await readRegistry();
  registry[enriched.slug] = enriched;
  await writeRegistry(registry);
  await ddbPutPublishedSiteRecord(enriched);
}

export async function isSiteSlugTaken(slug: string, ownerEmail: string): Promise<boolean> {
  const existing = await readPublishedSiteRecord(slug);
  if (!existing) return false;
  return existing.ownerEmail.toLowerCase() !== ownerEmail.toLowerCase();
}

export async function isCustomDomainTaken(
  domain: string,
  ownerEmail: string,
  slug?: string,
): Promise<boolean> {
  const normalized = domain.trim().toLowerCase();
  const registry = await readRegistry();
  for (const record of Object.values(registry)) {
    if (record.customDomain?.toLowerCase() !== normalized) continue;
    if (slug && record.slug === slug) continue;
    if (record.ownerEmail.toLowerCase() !== ownerEmail.toLowerCase()) return true;
  }
  const fromHost = await resolvePublishedSiteSlugByDomain(normalized);
  if (!fromHost) return false;
  if (slug && fromHost === slug) return false;
  const record = await readPublishedSiteRecord(fromHost);
  return record ? record.ownerEmail.toLowerCase() !== ownerEmail.toLowerCase() : false;
}
