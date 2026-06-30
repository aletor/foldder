import path from "path";
import { readJsonStore, updateJsonStore } from "./json-persistence";
import type { PopulateShareRecord } from "./populate-share-types";

let queue: Promise<unknown> = Promise.resolve();

export function runPopulateShareExclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

const populateShareStore = {
  createEmpty: (): PopulateShareRecord[] => [],
  defaultS3Key: "foldder-meta/populate-shares.json",
  localPath: path.join(process.cwd(), "data", "populate-shares.json"),
  s3KeyEnv: "FOLDDER_POPULATE_SHARES_S3_KEY",
};

export async function readPopulateShares(): Promise<PopulateShareRecord[]> {
  return readJsonStore(populateShareStore);
}

async function writePopulateShares(rows: PopulateShareRecord[]): Promise<void> {
  await updateJsonStore(populateShareStore, async () => rows);
}

export async function createPopulateShare(row: PopulateShareRecord): Promise<void> {
  await runPopulateShareExclusive(async () => {
    const rows = await readJsonStore(populateShareStore);
    if (rows.some((r) => r.token === row.token)) throw new Error("Populate share token collision");
    rows.push(row);
    await writePopulateShares(rows);
  });
}

export async function updatePopulateShare(
  token: string,
  patch: Partial<
    Pick<
      PopulateShareRecord,
      "name" | "options" | "payload" | "updatedAt" | "projectId" | "matchId" | "matchLabel"
    >
  >,
): Promise<PopulateShareRecord | null> {
  let updated: PopulateShareRecord | null = null;
  await runPopulateShareExclusive(async () => {
    const rows = await readJsonStore(populateShareStore);
    const i = rows.findIndex((r) => r.token === token);
    if (i === -1) return;
    rows[i] = { ...rows[i], ...patch, updatedAt: patch.updatedAt ?? new Date().toISOString() };
    updated = rows[i];
    await writePopulateShares(rows);
  });
  return updated;
}

export async function findPopulateShareByToken(token: string): Promise<PopulateShareRecord | undefined> {
  const rows = await readPopulateShares();
  return rows.find((row) => row.token === token);
}

export async function incrementPopulateShareVisits(token: string): Promise<number | null> {
  let visits: number | null = null;
  await runPopulateShareExclusive(async () => {
    const rows = await readJsonStore(populateShareStore);
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
  await runPopulateShareExclusive(async () => {
    const rows = await readJsonStore(populateShareStore);
    const i = rows.findIndex((r) => r.token === token);
    if (i === -1) return;
    rows[i] = { ...rows[i], generations: rows[i].generations + 1 };
    generations = rows[i].generations;
    await writePopulateShares(rows);
  });
  return generations;
}
