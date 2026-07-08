import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Genome } from "@/lib/genoma/model/trait";
import { normalizeGenome } from "@/lib/genoma/model/trait";
import type { BrandLogoState } from "@/lib/genoma/logo-intake/types";

const UNDO_TTL_MS = 10_000;
const STORE_DIR = path.join(process.cwd(), "data/genoma-brand-logo");

export type LogoIntakeUndoSnapshot = {
  token: string;
  projectId: string;
  expiresAt: string;
  brandLogoState: BrandLogoState;
  genome: Genome;
  s3Key?: string;
};

function safeProjectId(projectId: string): string {
  return projectId.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function undoPath(projectId: string): string {
  return path.join(STORE_DIR, safeProjectId(projectId), "undo-validate.json");
}

export function createUndoToken(): { token: string; expiresAt: string } {
  return {
    token: randomUUID(),
    expiresAt: new Date(Date.now() + UNDO_TTL_MS).toISOString(),
  };
}

export function saveUndoSnapshot(snapshot: LogoIntakeUndoSnapshot): void {
  fs.mkdirSync(path.dirname(undoPath(snapshot.projectId)), { recursive: true });
  fs.writeFileSync(undoPath(snapshot.projectId), `${JSON.stringify(snapshot)}\n`, "utf8");
}

export function loadUndoSnapshot(projectId: string): LogoIntakeUndoSnapshot | null {
  const file = undoPath(projectId);
  if (!fs.existsSync(file)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as LogoIntakeUndoSnapshot;
    return {
      ...raw,
      genome: normalizeGenome(raw.genome),
    };
  } catch {
    return null;
  }
}

export function clearUndoSnapshot(projectId: string): void {
  const file = undoPath(projectId);
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

export function isUndoSnapshotValid(snapshot: LogoIntakeUndoSnapshot, token: string): boolean {
  if (snapshot.token !== token) return false;
  return Date.now() <= new Date(snapshot.expiresAt).getTime();
}
