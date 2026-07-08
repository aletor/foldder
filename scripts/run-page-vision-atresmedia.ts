#!/usr/bin/env npx tsx
/**
 * Corrida Fase A sobre catálogo Atresmedia — genera audit log + golden fixtures reales.
 * Requiere GEMINI_API_KEY y fixtures/brandkit/einf_2023_atresmedia.pdf
 */

import fs from "node:fs";
import {
  ATRESMEDIA_CATALOG_FILENAME,
  ATRESMEDIA_CATALOG_PDF,
  hasAtresmediaCatalogPdf,
} from "../src/lib/genoma/fixtures/brandkit-paths";
import { bufferContentSha256 } from "../src/lib/genoma/ingest/paid-operations-server";
import { runPageVisionPassForPdf, summarizePageVisionPassRun } from "../src/lib/genoma/ingest/page-vision-pass-runner";
import { assertValidGeminiApiKey } from "./load-script-env";

async function main() {
  assertValidGeminiApiKey();
  if (!hasAtresmediaCatalogPdf()) {
    console.error(`Missing PDF: ${ATRESMEDIA_CATALOG_PDF}`);
    process.exit(1);
  }

  const buffer = fs.readFileSync(ATRESMEDIA_CATALOG_PDF);
  const contentSha256 = await bufferContentSha256(buffer);
  console.info(`Running Fase A on ${ATRESMEDIA_CATALOG_FILENAME} sha=${contentSha256.slice(0, 16)}…`);

  const audit = await runPageVisionPassForPdf({
    buffer,
    contentSha256,
    fileName: ATRESMEDIA_CATALOG_FILENAME,
    route: "/scripts/run-page-vision-atresmedia",
    writeGoldenPages: [1, 2, 24],
  });

  console.info(summarizePageVisionPassRun(audit));
  console.info(JSON.stringify({ pages: audit.pages.length, selected: audit.selectedPages }, null, 2));
  for (const page of audit.pages) {
    console.info(
      `p${page.pageNumber} ok=${page.ok} rejected=${page.rejected.length} warnings=${page.warnings.length} retried=${page.retried}`,
    );
  }
}

void main();
