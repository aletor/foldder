#!/usr/bin/env npx tsx
/**
 * Ingesta server-side de catalogo26.pdf — smoke sin UI (wallet off).
 */

import fs from "node:fs";
import { CATALOGO26_FILENAME, CATALOGO26_PDF } from "../src/lib/brandKit/fixtures/brandkit-paths";
import { ingestPdfIntoGenome } from "../src/lib/brandKit/ingest/pdf-ingest-server";
import { emptyGenome } from "../src/lib/brandKit/model/trait";
import { assertValidGeminiApiKey } from "./load-script-env";

async function main() {
  assertValidGeminiApiKey();
  if (process.env.BRAND_KIT_PAGE_VISION_PASS_ENABLED !== "1") {
    console.error("Set BRAND_KIT_PAGE_VISION_PASS_ENABLED=1 en .env.local");
    process.exit(1);
  }
  const buffer = fs.readFileSync(CATALOGO26_PDF);
  let genome = emptyGenome();
  for await (const event of ingestPdfIntoGenome(buffer, CATALOGO26_FILENAME, genome, {
    allowPaidAnalysis: true,
    allowMaterialPrompts: false,
  })) {
    if (event.type === "page_vision_pass") {
      console.info("page_vision_pass", JSON.stringify(event));
    }
    if (event.type === "micro") console.info("micro:", event.text);
    if (event.type === "section_resolved" && event.section === "logo") {
      console.info("logo:", event.micro);
    }
    if (event.type === "genome_update") genome = event.genome;
  }
  const primary = genome.traits["logo.primary"];
  const candidates = primary?.candidates.filter((c) => c.status !== "archived") ?? [];
  console.info(
    JSON.stringify(
      {
        sources: genome.sources.map((s) => ({ label: s.label, pageVisionPass: s.pageVisionPass })),
        logoCandidates: candidates.map((c) => ({
          id: c.id,
          label: (c.value as { label?: string }).label,
          score: c.evidenceScore,
          hasImage: Boolean((c.value as { imageUrl?: string }).imageUrl?.startsWith("data:")),
        })),
      },
      null,
      2,
    ),
  );
  fs.mkdirSync("fixtures/page-vision-pass/runs", { recursive: true });
  fs.writeFileSync(
    "fixtures/page-vision-pass/runs/catalogo26-ingest-genome.json",
    `${JSON.stringify(genome, null, 2)}\n`,
  );
}

void main();
