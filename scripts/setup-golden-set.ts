#!/usr/bin/env tsx
/**
 * Copia PDFs al golden-set/ (gitignored) y siembra vision-cache desde audits de fixtures.
 */
import fs from "node:fs";
import path from "node:path";
import { LOGO_LAB_FIXTURES } from "../src/lib/brandKit/logo-lab/fixtures";
import { loadLatestAuditByPrefix } from "../src/lib/brandKit/logo-lab/load-audit";
import { goldenSetDir, visionCacheDir } from "../src/lib/brandKit/logo-lab/golden/paths";
import { writeVisionCache } from "../src/lib/brandKit/logo-lab/golden/vision-cache";
import { loadGoldenManifest } from "../src/lib/brandKit/logo-lab/golden/manifest";

const FIXTURE_FILE_MAP: Record<string, string> = {
  catalogo26: "catalogo26.pdf",
  "oaro-deck": "oaro-deck.pdf",
  "esade-pitch": "esade-pitch.pdf",
  "lean-finance": "lean-finance.pdf",
};

const DOWNLOADS = path.join(process.env.HOME ?? "", "Downloads");

function copyPdf(src: string, dest: string): void {
  if (!fs.existsSync(src)) {
    console.warn(`skip missing: ${src}`);
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  console.log(`copied ${path.basename(dest)}`);
}

function main(): void {
  const outDir = goldenSetDir();
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(visionCacheDir(), { recursive: true });

  for (const fixture of LOGO_LAB_FIXTURES) {
    const destName = FIXTURE_FILE_MAP[fixture.id] ?? `${fixture.id}.pdf`;
    copyPdf(fixture.pdfPath, path.join(outDir, destName));

    const audit = loadLatestAuditByPrefix(fixture.auditPrefix);
    if (audit?.contentSha256) {
      writeVisionCache(audit.contentSha256, audit, "fixture_seed");
      console.log(`vision-cache seeded: ${fixture.id} (fixture_seed)`);
    }
  }

  copyPdf(
    path.join(DOWNLOADS, "ES_BULLS BROSE 14d_2020_1.0.pdf"),
    path.join(outDir, "bulls-brose.pdf"),
  );
  copyPdf(
    path.join(DOWNLOADS, "Nike-Run-Club-Marathon-Training-Plan-Audio-Guided-Runs.pdf"),
    path.join(outDir, "nike-nrc.pdf"),
  );

  const manifest = loadGoldenManifest();
  console.log(`golden-set ready: ${manifest.documents.length} documents in manifest`);
}

main();
