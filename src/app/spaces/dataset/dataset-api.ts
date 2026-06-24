import type { Dataset } from "./dataset-types";

export type DatasetListItem = {
  id: string;
  name: string;
  version: number;
  updatedAt: string;
  listCount: number;
  cardCount: number;
  constantCount: number;
  consumerCount: number;
};

export type GlobalDatasetResponse = {
  dataset: Dataset;
  consumerCount: number;
  consumerProjectIds: string[];
};

async function parseJson<T>(res: Response): Promise<T> {
  const body = (await res.json()) as T & { error?: string };
  if (!res.ok) {
    throw new Error(typeof body.error === "string" ? body.error : `Request failed (${res.status})`);
  }
  return body;
}

export async function listGlobalDatasets(): Promise<DatasetListItem[]> {
  const res = await fetch("/api/spaces/datasets", { cache: "no-store" });
  const body = await parseJson<{ datasets: DatasetListItem[] }>(res);
  return body.datasets ?? [];
}

export async function fetchGlobalDataset(id: string): Promise<GlobalDatasetResponse> {
  const res = await fetch(`/api/spaces/datasets/${encodeURIComponent(id)}`, { cache: "no-store" });
  return parseJson<GlobalDatasetResponse>(res);
}

export async function saveGlobalDataset(
  dataset: Dataset,
  expectedVersion?: number | null,
): Promise<GlobalDatasetResponse> {
  const res = await fetch(`/api/spaces/datasets/${encodeURIComponent(dataset.id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      dataset: { ...dataset, scope: "global", projectId: undefined },
      expectedVersion: expectedVersion ?? undefined,
    }),
  });
  return parseJson<GlobalDatasetResponse>(res);
}

export async function createGlobalDataset(name: string, seed?: Dataset): Promise<GlobalDatasetResponse> {
  const res = await fetch("/api/spaces/datasets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(seed ? { dataset: seed } : { name }),
  });
  const body = await parseJson<{ dataset: Dataset }>(res);
  return {
    dataset: body.dataset,
    consumerCount: 0,
    consumerProjectIds: [],
  };
}

export async function deleteGlobalDataset(id: string): Promise<void> {
  const res = await fetch(`/api/spaces/datasets/${encodeURIComponent(id)}`, { method: "DELETE" });
  await parseJson<{ ok: boolean }>(res);
}

export async function registerProjectDatasetConsumers(
  projectId: string,
  datasetIds: string[],
): Promise<void> {
  if (!projectId.trim() || !datasetIds.length) return;
  await fetch("/api/spaces/datasets/consumers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, datasetIds }),
  });
}
