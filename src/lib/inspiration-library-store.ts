import path from "path";
import { normalizeOwnerEmail, spacesOwnerHash } from "@/lib/spaces-access-control";
import { readJsonStore, updateJsonStore, type JsonStoreConfig } from "@/lib/json-persistence";

/**
 * Librería de Inspiración por usuario (cross-proyecto).
 *
 * - Catálogo de metadatos: `foldder-meta/inspiration-library/<ownerHash>.json`
 * - Carga útil por plantilla Designer (páginas): `foldder-meta/inspiration-library/<ownerHash>/items/<id>.json`
 *
 * Separar las páginas del catálogo evita enviar documentos pesados cada vez que el studio lista
 * la librería. Mismo patrón de almacenamiento que `dataset-store`.
 */

export type InspirationLibraryItemKind = "designer-template" | "image" | "flow" | "brand-kit";

export type InspirationLibraryItem = {
  id: string;
  kind: InspirationLibraryItemKind;
  title: string;
  /** Miniatura estable en S3 (opcional para flujos, que se pintan con tarjeta propia). */
  thumbUrl?: string;
  thumbS3Key?: string;
  /** designer-template */
  pageCount?: number;
  /** image */
  imageUrl?: string;
  imageS3Key?: string;
  width?: number;
  height?: number;
  /** flow */
  nodeCount?: number;
  /** brand-kit */
  completenessPercent?: number;
  createdAt: string;
  updatedAt: string;
};

export type OwnerInspirationLibrary = {
  version: 1;
  items: InspirationLibraryItem[];
};

export type InspirationFlowPayload = {
  nodes: unknown[];
  edges: unknown[];
};

type InspirationItemPayload = {
  version: 1;
  /** designer-template */
  pages?: unknown[];
  /** flow */
  flow?: InspirationFlowPayload;
  /** brand-kit */
  brandKit?: unknown;
};

export type AddInspirationLibraryInput = {
  id?: string;
  kind: InspirationLibraryItemKind;
  title: string;
  thumbUrl?: string;
  thumbS3Key?: string;
  pages?: unknown[];
  imageUrl?: string;
  imageS3Key?: string;
  width?: number;
  height?: number;
  flow?: InspirationFlowPayload;
  brandKit?: unknown;
  completenessPercent?: number;
};

const MAX_ITEMS = 300;
const ownerLocks = new Map<string, Promise<unknown>>();

function ownerHashFromEmail(email: string): string {
  return spacesOwnerHash(normalizeOwnerEmail(email));
}

function catalogConfig(ownerHash: string): JsonStoreConfig<OwnerInspirationLibrary> {
  return {
    createEmpty: () => ({ version: 1, items: [] }),
    defaultS3Key: `foldder-meta/inspiration-library/${ownerHash}.json`,
    localPath: path.join(process.cwd(), "data", "inspiration-library", `${ownerHash}.json`),
    s3KeyEnv: "FOLDDER_INSPIRATION_LIBRARY_S3_KEY_UNUSED",
  };
}

function payloadConfig(ownerHash: string, itemId: string): JsonStoreConfig<InspirationItemPayload> {
  const safeId = itemId.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 80);
  return {
    createEmpty: () => ({ version: 1 }),
    defaultS3Key: `foldder-meta/inspiration-library/${ownerHash}/items/${safeId}.json`,
    localPath: path.join(process.cwd(), "data", "inspiration-library", ownerHash, "items", `${safeId}.json`),
    s3KeyEnv: "FOLDDER_INSPIRATION_LIBRARY_ITEM_S3_KEY_UNUSED",
  };
}

async function withOwnerLock<T>(ownerHash: string, fn: () => Promise<T>): Promise<T> {
  const prev = ownerLocks.get(ownerHash) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  ownerLocks.set(
    ownerHash,
    prev.then(() => gate),
  );
  await prev;
  try {
    return await fn();
  } finally {
    release();
  }
}

function newItemId(): string {
  return `insplib_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

export async function listInspirationLibraryItems(ownerEmail: string): Promise<InspirationLibraryItem[]> {
  const ownerHash = ownerHashFromEmail(ownerEmail);
  const catalog = await readJsonStore(catalogConfig(ownerHash));
  return [...catalog.items].sort((a, b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0));
}

export async function getInspirationTemplatePages(
  ownerEmail: string,
  itemId: string,
): Promise<unknown[] | null> {
  const ownerHash = ownerHashFromEmail(ownerEmail);
  const catalog = await readJsonStore(catalogConfig(ownerHash));
  const item = catalog.items.find((i) => i.id === itemId);
  if (!item || item.kind !== "designer-template") return null;
  const payload = await readJsonStore(payloadConfig(ownerHash, itemId));
  return Array.isArray(payload.pages) ? payload.pages : [];
}

export async function getInspirationFlow(
  ownerEmail: string,
  itemId: string,
): Promise<InspirationFlowPayload | null> {
  const ownerHash = ownerHashFromEmail(ownerEmail);
  const catalog = await readJsonStore(catalogConfig(ownerHash));
  const item = catalog.items.find((i) => i.id === itemId);
  if (!item || item.kind !== "flow") return null;
  const payload = await readJsonStore(payloadConfig(ownerHash, itemId));
  const flow = payload.flow;
  return {
    nodes: Array.isArray(flow?.nodes) ? flow!.nodes : [],
    edges: Array.isArray(flow?.edges) ? flow!.edges : [],
  };
}

export async function getInspirationBrandKit(
  ownerEmail: string,
  itemId: string,
): Promise<unknown | null> {
  const ownerHash = ownerHashFromEmail(ownerEmail);
  const catalog = await readJsonStore(catalogConfig(ownerHash));
  const item = catalog.items.find((i) => i.id === itemId);
  if (!item || item.kind !== "brand-kit") return null;
  const payload = await readJsonStore(payloadConfig(ownerHash, itemId));
  return payload.brandKit ?? null;
}

export async function addInspirationLibraryItem(
  ownerEmail: string,
  input: AddInspirationLibraryInput,
): Promise<InspirationLibraryItem> {
  const ownerHash = ownerHashFromEmail(ownerEmail);
  const id = input.id?.trim() || newItemId();
  const ts = nowIso();

  const item: InspirationLibraryItem = {
    id,
    kind: input.kind,
    title: input.title.trim().slice(0, 120) || "Sin título",
    thumbUrl: input.thumbUrl,
    thumbS3Key: input.thumbS3Key,
    createdAt: ts,
    updatedAt: ts,
  };
  if (input.kind === "designer-template") {
    item.pageCount = Array.isArray(input.pages) ? input.pages.length : 0;
  } else if (input.kind === "flow") {
    item.nodeCount = Array.isArray(input.flow?.nodes) ? input.flow!.nodes.length : 0;
  } else if (input.kind === "brand-kit") {
    item.completenessPercent =
      typeof input.completenessPercent === "number" ? Math.round(input.completenessPercent) : undefined;
  } else {
    item.imageUrl = input.imageUrl;
    item.imageS3Key = input.imageS3Key;
    item.width = input.width;
    item.height = input.height;
  }

  return withOwnerLock(ownerHash, async () => {
    if (input.kind === "designer-template") {
      await updateJsonStore(
        payloadConfig(ownerHash, id),
        async (): Promise<InspirationItemPayload> => ({
          version: 1,
          pages: Array.isArray(input.pages) ? input.pages : [],
        }),
      );
    } else if (input.kind === "flow") {
      await updateJsonStore(
        payloadConfig(ownerHash, id),
        async (): Promise<InspirationItemPayload> => ({
          version: 1,
          flow: {
            nodes: Array.isArray(input.flow?.nodes) ? input.flow!.nodes : [],
            edges: Array.isArray(input.flow?.edges) ? input.flow!.edges : [],
          },
        }),
      );
    } else if (input.kind === "brand-kit") {
      await updateJsonStore(
        payloadConfig(ownerHash, id),
        async (): Promise<InspirationItemPayload> => ({
          version: 1,
          brandKit: input.brandKit ?? null,
        }),
      );
    }
    await updateJsonStore(catalogConfig(ownerHash), async (catalog) => {
      const items = catalog.items.filter((i) => i.id !== id);
      items.unshift(item);
      return { ...catalog, items: items.slice(0, MAX_ITEMS) };
    });
    return item;
  });
}

export async function deleteInspirationLibraryItem(ownerEmail: string, itemId: string): Promise<boolean> {
  const ownerHash = ownerHashFromEmail(ownerEmail);
  return withOwnerLock(ownerHash, async () => {
    let deleted = false;
    await updateJsonStore(catalogConfig(ownerHash), async (catalog) => {
      if (!catalog.items.some((i) => i.id === itemId)) return catalog;
      deleted = true;
      return { ...catalog, items: catalog.items.filter((i) => i.id !== itemId) };
    });
    if (deleted) {
      // Vacía la carga útil best-effort (no bloquea si falla).
      try {
        await updateJsonStore(
          payloadConfig(ownerHash, itemId),
          async (): Promise<InspirationItemPayload> => ({ version: 1 }),
        );
      } catch {
        /* best-effort */
      }
    }
    return deleted;
  });
}
