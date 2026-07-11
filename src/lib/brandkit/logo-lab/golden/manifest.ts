import fs from "node:fs";
import { GOLDEN_MANIFEST_PATH } from "@/lib/brandkit/logo-lab/golden/paths";
import type { GoldenDocument, GoldenSetManifest } from "@/lib/brandkit/logo-lab/golden/types";

export function sanitizeGoldenDocument(doc: GoldenDocument & { pdfAvailable?: boolean }): GoldenDocument {
  const { pdfAvailable: _pdfAvailable, ...clean } = doc;
  return {
    ...clean,
    groundTruth: clean.groundTruth.map((g) => ({
      ...g,
      bboxPage: [
        roundBboxCoord(g.bboxPage[0]),
        roundBboxCoord(g.bboxPage[1]),
        roundBboxCoord(g.bboxPage[2]),
        roundBboxCoord(g.bboxPage[3]),
      ],
    })),
  };
}

function roundBboxCoord(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}

export function loadGoldenManifest(): GoldenSetManifest {
  const raw = fs.readFileSync(GOLDEN_MANIFEST_PATH, "utf8");
  const parsed = JSON.parse(raw) as GoldenSetManifest;
  if (parsed.version !== 1 || !Array.isArray(parsed.documents)) {
    throw new Error("invalid_golden_manifest");
  }
  return {
    version: 1,
    documents: parsed.documents.map((doc) => sanitizeGoldenDocument(doc)),
  };
}

export function saveGoldenManifest(manifest: GoldenSetManifest): void {
  if (manifest.version !== 1) throw new Error("invalid_manifest_version");
  fs.writeFileSync(GOLDEN_MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

export function getGoldenDocument(id: string): GoldenDocument | null {
  return loadGoldenManifest().documents.find((d) => d.id === id) ?? null;
}

export function upsertGoldenDocument(doc: GoldenDocument): GoldenSetManifest {
  const manifest = loadGoldenManifest();
  const clean = sanitizeGoldenDocument(doc);
  const idx = manifest.documents.findIndex((d) => d.id === clean.id);
  if (idx >= 0) manifest.documents[idx] = clean;
  else manifest.documents.push(clean);
  saveGoldenManifest(manifest);
  return manifest;
}
