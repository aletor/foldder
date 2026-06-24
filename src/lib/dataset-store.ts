import path from "path";
import type { Dataset } from "@/app/spaces/dataset/dataset-types";
import { normalizeDataset, totalCardCount } from "@/app/spaces/dataset/dataset-migrate";
import { normalizeOwnerEmail, spacesOwnerHash } from "@/lib/spaces-access-control";
import { readJsonStore, updateJsonStore, type JsonStoreConfig } from "@/lib/json-persistence";

export type StoredDataset = Dataset & {
  consumerProjectIds: string[];
};

export type OwnerDatasetCatalog = {
  version: 1;
  datasets: Record<string, StoredDataset>;
};

export class DatasetVersionConflictError extends Error {
  readonly datasetId: string;
  readonly expectedVersion: number;
  readonly actualVersion: number;

  constructor(datasetId: string, expectedVersion: number, actualVersion: number) {
    super(
      `[dataset-store] version conflict for ${datasetId}: expected ${expectedVersion}, got ${actualVersion}`,
    );
    this.name = "DatasetVersionConflictError";
    this.datasetId = datasetId;
    this.expectedVersion = expectedVersion;
    this.actualVersion = actualVersion;
  }
}

const ownerLocks = new Map<string, Promise<unknown>>();

function catalogConfig(ownerHash: string): JsonStoreConfig<OwnerDatasetCatalog> {
  return {
    createEmpty: () => ({ version: 1, datasets: {} }),
    defaultS3Key: `foldder-meta/datasets/${ownerHash}.json`,
    localPath: path.join(process.cwd(), "data", "datasets", `${ownerHash}.json`),
    s3KeyEnv: "FOLDDER_DATASETS_S3_KEY_UNUSED",
  };
}

function ownerHashFromEmail(email: string): string {
  return spacesOwnerHash(normalizeOwnerEmail(email));
}

async function withOwnerCatalogLock<T>(ownerHash: string, fn: () => Promise<T>): Promise<T> {
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

function normalizeStoredDataset(dataset: Dataset, consumerProjectIds: string[] = []): StoredDataset {
  const normalized = normalizeDataset(dataset);
  const mergedConsumers =
    consumerProjectIds.length > 0
      ? consumerProjectIds
      : Array.isArray((dataset as StoredDataset).consumerProjectIds)
        ? [...new Set((dataset as StoredDataset).consumerProjectIds.filter(Boolean))]
        : [];
  return {
    ...normalized,
    scope: "global",
    projectId: undefined,
    consumerProjectIds: mergedConsumers,
  };
}

export async function listGlobalDatasets(ownerEmail: string): Promise<StoredDataset[]> {
  const ownerHash = ownerHashFromEmail(ownerEmail);
  const catalog = await readJsonStore(catalogConfig(ownerHash));
  return Object.values(catalog.datasets).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getGlobalDataset(
  ownerEmail: string,
  datasetId: string,
): Promise<StoredDataset | null> {
  const ownerHash = ownerHashFromEmail(ownerEmail);
  const catalog = await readJsonStore(catalogConfig(ownerHash));
  return catalog.datasets[datasetId] ?? null;
}

export async function upsertGlobalDataset(
  ownerEmail: string,
  dataset: Dataset,
  options?: { expectedVersion?: number | null },
): Promise<StoredDataset> {
  const ownerHash = ownerHashFromEmail(ownerEmail);
  return withOwnerCatalogLock(ownerHash, async () => {
    let saved!: StoredDataset;
    await updateJsonStore(catalogConfig(ownerHash), async (catalog) => {
      const existing = catalog.datasets[dataset.id];
      const expectedVersion =
        typeof options?.expectedVersion === "number" && Number.isFinite(options.expectedVersion)
          ? options.expectedVersion
          : null;
      if (expectedVersion !== null && existing && existing.version !== expectedVersion) {
        throw new DatasetVersionConflictError(dataset.id, expectedVersion, existing.version);
      }
      const consumerProjectIds = existing?.consumerProjectIds ?? [];
      saved = normalizeStoredDataset(dataset, consumerProjectIds);
      return {
        ...catalog,
        datasets: { ...catalog.datasets, [dataset.id]: saved },
      };
    });
    return saved;
  });
}

export async function deleteGlobalDataset(ownerEmail: string, datasetId: string): Promise<boolean> {
  const ownerHash = ownerHashFromEmail(ownerEmail);
  return withOwnerCatalogLock(ownerHash, async () => {
    let deleted = false;
    await updateJsonStore(catalogConfig(ownerHash), async (catalog) => {
      if (!catalog.datasets[datasetId]) return catalog;
      deleted = true;
      const next = { ...catalog.datasets };
      delete next[datasetId];
      return { ...catalog, datasets: next };
    });
    return deleted;
  });
}

export async function registerDatasetConsumers(
  ownerEmail: string,
  projectId: string,
  datasetIds: string[],
): Promise<void> {
  const normalizedProjectId = projectId.trim();
  if (!normalizedProjectId) return;
  const uniqueIds = [...new Set(datasetIds.map((id) => id.trim()).filter(Boolean))];
  if (!uniqueIds.length) return;

  const ownerHash = ownerHashFromEmail(ownerEmail);
  await withOwnerCatalogLock(ownerHash, async () => {
    await updateJsonStore(catalogConfig(ownerHash), async (catalog) => {
      let changed = false;
      const datasets = { ...catalog.datasets };
      for (const id of uniqueIds) {
        const row = datasets[id];
        if (!row) continue;
        const consumers = new Set(row.consumerProjectIds ?? []);
        if (consumers.has(normalizedProjectId)) continue;
        consumers.add(normalizedProjectId);
        datasets[id] = { ...row, consumerProjectIds: [...consumers] };
        changed = true;
      }
      if (!changed) return catalog;
      return { ...catalog, datasets };
    });
  });
}

export function datasetConsumerCount(stored: StoredDataset | null | undefined): number {
  return stored?.consumerProjectIds?.length ?? 0;
}
