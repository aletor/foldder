import fs from "node:fs/promises";
import path from "node:path";
import {
  isWriterDocumentId,
  type WriterDocumentContent,
} from "@/app/spaces/writer/writer-document";
import type { WriterMemoryEntry } from "@/app/spaces/writer/writer-memory";
import { migrateMemoryToStory, normalizeStory, projectWriterMemory, type WriterStory } from "@/app/spaces/writer/writer-story";
import { getFromS3, uploadBufferToS3Key, BUCKET_NAME } from "@/lib/s3-utils";
import { buildUserAssetObjectKey, spacesOwnerHash } from "@/lib/spaces-access-control";

export const WRITER_DOCUMENT_MAX_BYTES = 4_000_000;

export type WriterStoredDocument = {
  schemaVersion: 2;
  content: WriterDocumentContent;
  story: WriterStory;
  memory: WriterMemoryEntry[];
  dismissals: string[];
};

export type WriterDocumentStoreOptions = {
  localRoot?: string;
  s3Enabled?: boolean;
};

const DEFAULT_LOCAL_ROOT = path.join(process.cwd(), "data", "writer-documents");

export class WriterDocumentStoreError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export function writerDocumentObjectKey(userEmail: string, documentId: string): string {
  if (!isWriterDocumentId(documentId)) {
    throw new WriterDocumentStoreError("Documento no válido", 400);
  }
  return buildUserAssetObjectKey({
    userEmail,
    folder: "writer-documents",
    filename: `${documentId}.json`,
    unique: false,
  });
}

function s3EnabledByDefault(): boolean {
  const localOnly = (process.env.FOLDDER_JSON_STORE_LOCAL_ONLY || "").trim().toLowerCase();
  if (localOnly === "1" || localOnly === "true" || localOnly === "yes") return false;
  return Boolean(
    process.env.AWS_ACCESS_KEY_ID?.trim() &&
      process.env.AWS_SECRET_ACCESS_KEY?.trim() &&
      BUCKET_NAME,
  );
}

function asStoredContent(value: unknown): WriterDocumentContent {
  if (!value || typeof value !== "object") {
    throw new WriterDocumentStoreError("Documento no válido", 400);
  }
  const row = value as WriterDocumentContent;
  if (row.type !== "doc" || !Array.isArray(row.content)) {
    throw new WriterDocumentStoreError("Documento no válido", 400);
  }
  return row;
}

function localFilePath(root: string, userEmail: string, documentId: string): string {
  const owner = spacesOwnerHash(userEmail);
  const file = path.resolve(root, owner, `${documentId}.json`);
  const base = path.resolve(root);
  if (file !== base && !file.startsWith(`${base}${path.sep}`)) {
    throw new WriterDocumentStoreError("Documento no válido", 400);
  }
  return file;
}

function isMissingObject(error: unknown): boolean {
  const err = error as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } };
  return err.name === "NoSuchKey" || err.Code === "NoSuchKey" || err.name === "NotFound" || err.$metadata?.httpStatusCode === 404;
}

export async function readWriterDocument(
  userEmail: string,
  documentId: string,
  options: WriterDocumentStoreOptions = {},
): Promise<WriterStoredDocument | null> {
  const useS3 = options.s3Enabled ?? s3EnabledByDefault();
  if (useS3) {
    try {
      const raw = (await getFromS3(writerDocumentObjectKey(userEmail, documentId))).toString("utf8");
      return parseStored(raw);
    } catch (error) {
      if (isMissingObject(error)) return null;
      throw error;
    }
  }

  try {
    const raw = await fs.readFile(localFilePath(options.localRoot ?? DEFAULT_LOCAL_ROOT, userEmail, documentId), "utf8");
    return parseStored(raw);
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === "ENOENT") return null;
    throw error;
  }
}

export async function writeWriterDocument(
  userEmail: string,
  documentId: string,
  document: { content: unknown; story?: unknown; memory?: unknown; dismissals?: unknown },
  options: WriterDocumentStoreOptions = {},
): Promise<{ documentKey: string }> {
  const story = normalizeStory(document.story) ?? migrateMemoryToStory(document.memory);
  const stored: WriterStoredDocument = {
    schemaVersion: 2,
    content: asStoredContent(document.content),
    story,
    memory: projectWriterMemory(story),
    dismissals: normalizeDismissals(document.dismissals),
  };
  const payload = JSON.stringify(stored);
  if (Buffer.byteLength(payload, "utf8") > WRITER_DOCUMENT_MAX_BYTES) {
    throw new WriterDocumentStoreError("El documento es demasiado grande", 413);
  }

  const documentKey = writerDocumentObjectKey(userEmail, documentId);
  const useS3 = options.s3Enabled ?? s3EnabledByDefault();
  if (useS3) {
    await uploadBufferToS3Key(documentKey, Buffer.from(payload, "utf8"), "application/json");
    return { documentKey };
  }

  const file = localFilePath(options.localRoot ?? DEFAULT_LOCAL_ROOT, userEmail, documentId);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, payload, "utf8");
  await fs.rename(tmp, file);
  return { documentKey };
}

function normalizeDismissals(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const keys: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !item.trim()) continue;
    keys.push(item.trim().slice(0, 200));
    if (keys.length >= 200) break;
  }
  return keys;
}

function parseStored(raw: string): WriterStoredDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new WriterDocumentStoreError("Documento no válido", 400);
  }
  if (parsed && typeof parsed === "object" && (parsed as WriterDocumentContent).type === "doc") {
    const story = migrateMemoryToStory(undefined);
    return { schemaVersion: 2, content: asStoredContent(parsed), story, memory: [], dismissals: [] };
  }
  if (parsed && typeof parsed === "object" && "content" in parsed) {
    const row = parsed as { content?: unknown; story?: unknown; memory?: unknown; dismissals?: unknown };
    const story = normalizeStory(row.story) ?? migrateMemoryToStory(row.memory);
    return {
      schemaVersion: 2,
      content: asStoredContent(row.content),
      story,
      memory: projectWriterMemory(story),
      dismissals: normalizeDismissals(row.dismissals),
    };
  }
  throw new WriterDocumentStoreError("Documento no válido", 400);
}
