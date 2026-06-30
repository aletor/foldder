import path from "path";
import { readJsonStore, updateJsonStore } from "./json-persistence";
import type { LoopShareRecord } from "./loop-share-types";
import { runLoopShareExclusive } from "./loop-share-queue";

const loopShareStore = {
  createEmpty: (): LoopShareRecord[] => [],
  defaultS3Key: "foldder-meta/loop-shares.json",
  localPath: path.join(process.cwd(), "data", "loop-shares.json"),
  s3KeyEnv: "FOLDDER_LOOP_SHARES_S3_KEY",
};

export async function readLoopShares(): Promise<LoopShareRecord[]> {
  return readJsonStore(loopShareStore);
}

export async function writeLoopShares(rows: LoopShareRecord[]): Promise<void> {
  await updateJsonStore(loopShareStore, async () => rows);
}

export async function withLoopShares<T>(
  fn: (rows: LoopShareRecord[]) => Promise<T>,
): Promise<T> {
  return runLoopShareExclusive(async () => {
    const rows = await readJsonStore(loopShareStore);
    return fn(rows);
  });
}

export async function createLoopShare(row: LoopShareRecord): Promise<void> {
  await withLoopShares(async (rows) => {
    if (rows.some((r) => r.token === row.token)) {
      throw new Error("Loop share token collision");
    }
    rows.push(row);
    await writeLoopShares(rows);
  });
}

export async function updateLoopShare(
  token: string,
  patch: Partial<Pick<LoopShareRecord, "name" | "options" | "payload" | "updatedAt">>,
): Promise<LoopShareRecord | null> {
  let updated: LoopShareRecord | null = null;
  await withLoopShares(async (rows) => {
    const i = rows.findIndex((r) => r.token === token);
    if (i === -1) return;
    rows[i] = { ...rows[i], ...patch, updatedAt: patch.updatedAt ?? new Date().toISOString() };
    updated = rows[i];
    await writeLoopShares(rows);
  });
  return updated;
}

export async function listLoopShares(shareKey?: string): Promise<LoopShareRecord[]> {
  const rows = await readLoopShares();
  const filtered = shareKey?.trim()
    ? rows.filter((row) => row.shareKey === shareKey.trim())
    : rows;
  return filtered.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function findLoopShareByToken(token: string): Promise<LoopShareRecord | undefined> {
  const rows = await readLoopShares();
  return rows.find((row) => row.token === token);
}

export async function incrementLoopShareVisits(token: string): Promise<number | null> {
  let visits: number | null = null;
  await withLoopShares(async (rows) => {
    const i = rows.findIndex((r) => r.token === token);
    if (i === -1) return;
    rows[i] = { ...rows[i], visits: rows[i].visits + 1 };
    visits = rows[i].visits;
    await writeLoopShares(rows);
  });
  return visits;
}

export async function incrementLoopShareGenerations(token: string): Promise<number | null> {
  let generations: number | null = null;
  await withLoopShares(async (rows) => {
    const i = rows.findIndex((r) => r.token === token);
    if (i === -1) return;
    rows[i] = { ...rows[i], generations: rows[i].generations + 1 };
    generations = rows[i].generations;
    await writeLoopShares(rows);
  });
  return generations;
}
