/**
 * Regenera public/assets/camera-profiles/index.json a partir de los .dcp en canon/.
 * Uso: npx tsx scripts/build-camera-profile-index.ts
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseDcpFile } from "../src/app/spaces/lightroom/lightroom-dcp-parser";

const ROOT = join(process.cwd(), "public/assets/camera-profiles");
const CANON_DIR = join(ROOT, "canon");

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/\.dcp$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function displayNameFromFile(file: string): string {
  return file
    .replace(/\.dcp$/i, "")
    .replace(/\s+Adobe Standard/i, " — Adobe Standard")
    .trim();
}

function profileVersionRank(file: string): number {
  if (/\sv2\.dcp$/i.test(file)) return 0;
  if (/\sv2 /i.test(file)) return 0;
  return 1;
}

const files = readdirSync(CANON_DIR)
  .filter((f) => f.toLowerCase().endsWith(".dcp"))
  .sort((a, b) => a.localeCompare(b, "en"));

type Entry = {
  id: string;
  name: string;
  path: string;
  uniqueCameraModel: string;
  profileName: string | null;
  illuminant1: number | null;
  illuminant2: number | null;
  hasToneCurve: boolean;
  hasLookTable: boolean;
  hasColorMatrix: boolean;
  _sortKey: string;
  _versionRank: number;
};

const entries: Entry[] = [];

for (const file of files) {
  const buf = readFileSync(join(CANON_DIR, file));
  const dcp = parseDcpFile(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), file);
  const uniqueCameraModel = dcp.uniqueCameraModel?.trim() || file.replace(/\.dcp$/i, "");
  entries.push({
    id: `bundled:canon-${slugify(file)}`,
    name: displayNameFromFile(file),
    path: `canon/${file}`,
    uniqueCameraModel,
    profileName: dcp.name !== file ? dcp.name : null,
    illuminant1: dcp.illuminant1,
    illuminant2: dcp.illuminant2,
    hasToneCurve: dcp.toneCurve.some((v, i) => Math.abs(v - i / 255) > 0.02),
    hasLookTable: dcp.hasLookTable,
    hasColorMatrix: dcp.colorMatrix1.some((v, i) => (i % 4 === 0 ? Math.abs(v - 1) > 0.01 : Math.abs(v) > 0.001)),
    _sortKey: uniqueCameraModel.toLowerCase(),
    _versionRank: profileVersionRank(file),
  });
}

entries.sort((a, b) => {
  const model = a._sortKey.localeCompare(b._sortKey);
  if (model !== 0) return model;
  return a._versionRank - b._versionRank;
});

const index = {
  version: 2,
  license:
    "Adobe Camera Raw DCP profiles (Adobe Standard). Bundled for local matching; verify Adobe license terms before SaaS redistribution.",
  source: "Adobe Camera Raw / DNG Converter (user-provided)",
  profiles: entries.map(({ _sortKey: _s, _versionRank: _v, ...rest }) => rest),
};

writeFileSync(join(ROOT, "index.json"), `${JSON.stringify(index, null, 2)}\n`);
console.log(`Wrote ${entries.length} profiles to index.json`);
