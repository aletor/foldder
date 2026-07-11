import fs from "node:fs";
import path from "node:path";
import type { PageVisionPassRunAudit } from "@/lib/brandkit/ingest/page-vision-pass-runner";

const RUNS_DIR = path.join(process.cwd(), "fixtures/page-vision-pass/runs");

/** Último audit por prefijo sha (misma lógica que brand-kit-regression-matrix). */
export function loadLatestAuditByPrefix(prefix: string): PageVisionPassRunAudit | null {
  if (!fs.existsSync(RUNS_DIR)) return null;
  const file = fs
    .readdirSync(RUNS_DIR)
    .filter((f) => f.startsWith(prefix) && f.endsWith(".audit.json"))
    .sort()
    .pop();
  if (!file) return null;
  return JSON.parse(fs.readFileSync(path.join(RUNS_DIR, file), "utf8")) as PageVisionPassRunAudit;
}

export function auditFileNameForPrefix(prefix: string): string | null {
  if (!fs.existsSync(RUNS_DIR)) return null;
  return (
    fs
      .readdirSync(RUNS_DIR)
      .filter((f) => f.startsWith(prefix) && f.endsWith(".audit.json"))
      .sort()
      .pop() ?? null
  );
}
