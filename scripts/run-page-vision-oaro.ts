#!/usr/bin/env npx tsx
/**
 * Regresión Nivel 1 — sample-brand-deck.pdf (OARO) · batch ≤5 páginas.
 * Fixture canónico: fixtures/brandkit/sample-brand-deck.pdf (sha 1403be85…).
 */

import fs from "node:fs";
import path from "node:path";
import { bufferContentSha256 } from "../src/lib/genoma/ingest/paid-operations-server";
import {
  runPageVisionPassNivel1ForPdf,
  summarizeNivel1PageVisionRun,
} from "../src/lib/genoma/ingest/page-vision-pass-nivel1-runner";
import { assertValidGeminiApiKey } from "./load-script-env";

const OARO_PDF = path.join(process.cwd(), "fixtures/brandkit/sample-brand-deck.pdf");
const OARO_FILENAME = "sample-brand-deck.pdf";

async function main() {
  assertValidGeminiApiKey();
  if (process.env.GENOMA_PAGE_VISION_PASS_ENABLED !== "1") {
    console.error("Set GENOMA_PAGE_VISION_PASS_ENABLED=1 en .env.local");
    process.exit(1);
  }
  if (process.env.GENOMA_PAGE_VISION_NIVEL1 !== "1") {
    console.error("Set GENOMA_PAGE_VISION_NIVEL1=1 en .env.local");
    process.exit(1);
  }
  if (!fs.existsSync(OARO_PDF)) {
    console.error(`Missing PDF: ${OARO_PDF}`);
    process.exit(1);
  }

  const buffer = fs.readFileSync(OARO_PDF);
  const contentSha256 = await bufferContentSha256(buffer);
  console.info(`Running Nivel 1 OARO on ${OARO_FILENAME} sha=${contentSha256.slice(0, 16)}…`);

  const audit = await runPageVisionPassNivel1ForPdf({
    buffer,
    contentSha256,
    fileName: OARO_FILENAME,
    route: "/scripts/run-page-vision-oaro",
    writeGoldenPages: undefined,
  });

  console.info(summarizeNivel1PageVisionRun(audit));
  console.info(JSON.stringify(audit.ingestMetrics, null, 2));
  for (const page of audit.pages) {
    const bne = page.result?.brandNameEvidence ?? [];
    console.info(
      `p${page.pageNumber} ok=${page.ok} logos=${page.result?.logoInstances.length ?? 0} bne=${bne.length} rejected=${page.rejected.length}`,
    );
  }
}

void main();
