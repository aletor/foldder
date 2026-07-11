import fs from "fs/promises";
import path from "path";
import { uploadBufferToS3Key } from "@/lib/s3-utils";

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

export type PersistPublishedSiteInput = {
  record: PublishedSiteRecord;
  documents: Array<{ pathSlug: string; file: string; html: string }>;
};

export async function persistPublishedSite(input: PersistPublishedSiteInput): Promise<void> {
  const { record, documents } = input;
  const dir = siteLocalDir(record.slug);
  await fs.mkdir(dir, { recursive: true });

  for (const doc of documents) {
    const localPath = path.join(dir, doc.file);
    await fs.mkdir(path.dirname(localPath), { recursive: true });
    await fs.writeFile(localPath, doc.html, "utf8");
    if (isSitePublishS3Enabled()) {
      await uploadBufferToS3Key(
        siteS3Key(record.slug, doc.file),
        Buffer.from(doc.html, "utf8"),
        "text/html; charset=utf-8",
      );
    }
  }

  await fs.writeFile(path.join(dir, "meta.json"), JSON.stringify(record, null, 2), "utf8");
  if (isSitePublishS3Enabled()) {
    await uploadBufferToS3Key(
      siteS3Key(record.slug, "meta.json"),
      Buffer.from(JSON.stringify(record, null, 2), "utf8"),
      "application/json",
    );
  }

  const registry = await readRegistry();
  registry[record.slug] = record;
  await writeRegistry(registry);
}

export async function isSiteSlugTaken(slug: string, ownerEmail: string): Promise<boolean> {
  const registry = await readRegistry();
  const existing = registry[slug];
  if (!existing) return false;
  return existing.ownerEmail.toLowerCase() !== ownerEmail.toLowerCase();
}
