import path from "path";
import { readJsonStore, updateJsonStore } from "./json-persistence";
import type { PopulateShareRecord } from "./populate-share-types";
import { runPopulateShareExclusive } from "./populate-share-queue";

const populateShareStore = {
  createEmpty: (): PopulateShareRecord[] => [],
  defaultS3Key: "foldder-meta/populate-shares.json",
  localPath: path.join(process.cwd(), "data", "populate-shares.json"),
  s3KeyEnv: "FOLDDER_POPULATE_SHARES_S3_KEY",
};

export async function readPopulateShares(): Promise<PopulateShareRecord[]> {
  return readJsonStore(populateShareStore);
}

export async function writePopulateShares(rows: PopulateShareRecord[]): Promise<void> {
  await updateJsonStore(populateShareStore, async () => rows);
}

export async function withPopulateShares<T>(
  fn: (rows: PopulateShareRecord[]) => Promise<T>,
): Promise<T> {
  return runPopulateShareExclusive(async () => {
    const rows = await readJsonStore(populateShareStore);
    return fn(rows);
  });
}

export async function createPopulateShare(row: PopulateShareRecord): Promise<void> {
  await withPopulateShares(async (rows) => {
    if (rows.some((r) => r.token === row.token)) {
      throw new Error("Populate share token collision");
    }
    rows.push(row);
    await writePopulateShares(rows);
  });
}

export async function updatePopulateShare(
  token: string,
  patch: Partial<Pick<PopulateShareRecord, "name" | "options" | "payload" | "updatedAt">>,
): Promise<PopulateShareRecord | null> {
  let updated: PopulateShareRecord | null = null;
  await withPopulateShares(async (rows) => {
    const i = rows.findIndex((r) => r.token === token);
    if (i === -1) return;
    rows[i] = { ...rows[i], ...patch, updatedAt: patch.updatedAt ?? new Date().toISOString() };
    updated = rows[i];
    await writePopulateShares(rows);
  });
  return updated;
}

export async function listPopulateShares(shareKey?: string): Promise<PopulateShareRecord[]> {
  const rows = await readPopulateShares();
  const filtered = shareKey?.trim()
    ? rows.filter((row) => row.shareKey === shareKey.trim())
    : rows;
  return filtered.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function findPopulateShareByToken(token: string): Promise<PopulateShareRecord | undefined> {
  const rows = await readPopulateShares();
  return rows.find((row) => row.token === token);
}

export async function incrementPopulateShareVisits(token: string): Promise<number | null> {
  let visits: number | null = null;
  await withPopulateShares(async (rows) => {
    const i = rows.findIndex((r) => r.token === token);
    if (i === -1) return;
    rows[i] = { ...rows[i], visits: rows[i].visits + 1 };
    visits = rows[i].visits;
    await writePopulateShares(rows);
  });
  return visits;
}

export async function incrementPopulateShareGenerations(token: string): Promise<number | null> {
  let generations: number | null = null;
  await withPopulateShares(async (rows) => {
    const i = rows.findIndex((r) => r.token === token);
    if (i === -1) return;
    rows[i] = { ...rows[i], generations: rows[i].generations + 1 };
    generations = rows[i].generations;
    await writePopulateShares(rows);
  });
  return generations;
}
