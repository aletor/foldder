import fs from "node:fs";
import path from "node:path";
import type { IntakeDocInput } from "@/lib/genoma/logo-intake/render";
import type { LogoProposal } from "@/lib/genoma/logo-intake/types";

const BATCH_ROOT = path.join(process.cwd(), "data/logo-intake-batches");
const BATCH_TTL_MS = 60 * 60 * 1000;

export type BatchManifest = {
  batchId: string;
  projectId: string;
  createdAt: string;
  docs: Array<{ docId: string; docName: string; kind: "pdf" | "image" }>;
};

function batchDir(batchId: string): string {
  return path.join(BATCH_ROOT, batchId.replace(/[^a-zA-Z0-9._-]/g, "_"));
}

function docsDir(batchId: string): string {
  return path.join(batchDir(batchId), "docs");
}

function purgeExpiredBatches(): void {
  if (!fs.existsSync(BATCH_ROOT)) return;
  const now = Date.now();
  for (const entry of fs.readdirSync(BATCH_ROOT)) {
    const dir = path.join(BATCH_ROOT, entry);
    try {
      const stat = fs.statSync(dir);
      if (!stat.isDirectory()) continue;
      if (now - stat.mtimeMs > BATCH_TTL_MS) fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

export function saveBatchDocs(input: {
  batchId: string;
  projectId: string;
  docs: IntakeDocInput[];
}): BatchManifest {
  purgeExpiredBatches();
  const dir = batchDir(input.batchId);
  fs.mkdirSync(docsDir(input.batchId), { recursive: true });
  const manifest: BatchManifest = {
    batchId: input.batchId,
    projectId: input.projectId,
    createdAt: new Date().toISOString(),
    docs: input.docs.map((d) => ({ docId: d.docId, docName: d.docName, kind: d.kind })),
  };
  for (const doc of input.docs) {
    fs.writeFileSync(path.join(docsDir(input.batchId), `${doc.docId}.bin`), doc.buffer);
  }
  fs.writeFileSync(path.join(dir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifest;
}

export function getBatchDocBuffer(batchId: string, docId: string): Buffer {
  const file = path.join(docsDir(batchId), `${docId}.bin`);
  if (!fs.existsSync(file)) throw new Error(`batch_doc_missing:${batchId}:${docId}`);
  return fs.readFileSync(file);
}

export function getBatchManifest(batchId: string): BatchManifest | null {
  const file = path.join(batchDir(batchId), "manifest.json");
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8")) as BatchManifest;
}

export function saveBatchProposal(batchId: string, proposal: LogoProposal): void {
  const file = path.join(batchDir(batchId), "proposal.json");
  fs.writeFileSync(file, `${JSON.stringify(proposal, null, 2)}\n`, "utf8");
}

export function getBatchProposal(batchId: string): LogoProposal | null {
  const file = path.join(batchDir(batchId), "proposal.json");
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8")) as LogoProposal;
}
