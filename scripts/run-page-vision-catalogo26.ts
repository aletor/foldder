#!/usr/bin/env npx tsx
/**
 * Corrida Fase A — fixture principal catalogo26.pdf (+ audit log).
 * Requiere GEMINI_API_KEY y GENOMA_PAGE_VISION_PASS_ENABLED=1
 */

import fs from "node:fs";
import {
  CATALOGO26_FILENAME,
  CATALOGO26_PDF,
  hasCatalogo26Pdf,
} from "../src/lib/genoma/fixtures/brandkit-paths";
import { bufferContentSha256 } from "../src/lib/genoma/ingest/paid-operations-server";
import { runPageVisionPassForPdf, summarizePageVisionPassRun } from "../src/lib/genoma/ingest/page-vision-pass-runner";
import { assertValidGeminiApiKey } from "./load-script-env";

async function main() {
  assertValidGeminiApiKey();
  if (process.env.GENOMA_PAGE_VISION_PASS_ENABLED !== "1") {
    console.error("Set GENOMA_PAGE_VISION_PASS_ENABLED=1 en .env.local");
    process.exit(1);
  }
  if (!hasCatalogo26Pdf()) {
    console.error(`Missing PDF: ${CATALOGO26_PDF}`);
    process.exit(1);
  }

  const buffer = fs.readFileSync(CATALOGO26_PDF);
  const contentSha256 = await bufferContentSha256(buffer);
  console.info(`Running Fase A on ${CATALOGO26_FILENAME} sha=${contentSha256.slice(0, 16)}…`);

  const audit = await runPageVisionPassForPdf({
    buffer,
    contentSha256,
    fileName: CATALOGO26_FILENAME,
    route: "/scripts/run-page-vision-catalogo26",
    selectionScope: "guaranteed-only",
    writeGoldenPages: [1, 2, 3],
  });

  console.info(summarizePageVisionPassRun(audit));
  console.info(JSON.stringify({ pages: audit.pages.length, selected: audit.selectedPages }, null, 2));
  for (const page of audit.pages) {
    console.info(
      `p${page.pageNumber} ok=${page.ok} logos=${page.result?.logoInstances.length ?? 0} rejected=${page.rejected.length} warnings=${page.warnings.length}`,
    );
  }
}

void main();
