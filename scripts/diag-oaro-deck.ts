#!/usr/bin/env npx tsx
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { loadScriptEnv } from "./load-script-env";
import { prepareIntakeDocFromBuffer } from "../src/lib/brandKit/logo-intake/ingest-files";
import { runLogoIntakePipeline } from "../src/lib/brandKit/logo-intake/pipeline";
import { saveBatchDocs } from "../src/lib/brandKit/logo-intake/batch-store";
import { ingestPdfIntoGenome } from "../src/lib/brandKit/ingest/pdf-ingest-server";
import { emptyGenome } from "../src/lib/brandKit/model/trait";
import { extractVisualFromPdf, visualTerritoryCount } from "../src/lib/brandKit/extractors/visual";

const PDF = "/Users/alejandrotornero/Desktop/OARO/Investor Deck V1.pdf";

async function main() {
  loadScriptEnv();
  const buffer = fs.readFileSync(PDF);
  const fileName = "Investor Deck V1.pdf";

  console.log("\n=== LOGO INTAKE ===");
  const doc = await prepareIntakeDocFromBuffer({ fileName, buffer });
  const events: string[] = [];
  const batchId = randomUUID();
  saveBatchDocs({ batchId, projectId: "diag", docs: [doc] });
  const proposal = await runLogoIntakePipeline({
    batchId,
    docs: [doc],
    onEvent: (e) => events.push(`${e.type}${"done" in e ? `:${(e as { done?: number }).done}/${(e as { total?: number }).total}` : ""}`),
  });
  console.log("timings", proposal.timings);
  console.log(
    "best",
    proposal.best
      ? {
          page: proposal.best.page,
          q: proposal.best.quality.total,
          brand: proposal.best.model.brandText,
          issuer: proposal.best.model.isDocumentIssuerLogo,
          bbox: proposal.best.bboxPage,
          cropPx: `${proposal.best.cropWidthPx}x${proposal.best.cropHeightPx}`,
        }
      : null,
  );
  console.log(
    "alternatives",
    proposal.alternatives.map((a) => ({
      page: a.page,
      q: a.quality.total,
      brand: a.model.brandText,
      bbox: a.bboxPage,
    })),
  );
  console.log("palette", proposal.semanticPalette?.entries);
  console.log("events", events);

  console.log("\n=== CLASSIC INGEST (skipClassicLogo=true) ===");
  let genome = emptyGenome();
  const classicEvents: Array<{ type: string; section?: string; micro?: string; summary?: string; status?: string }> = [];
  for await (const event of ingestPdfIntoGenome(buffer, fileName, genome, {
    allowMaterialPrompts: false,
    skipClassicLogoExtraction: true,
  })) {
    if (event.type === "genome_update") genome = event.genome;
    if (
      event.type === "section_resolved" ||
      event.type === "page_vision_pass" ||
      event.type === "section_error"
    ) {
      classicEvents.push(event as typeof classicEvents[number]);
    }
  }
  console.log(
    "classic sections",
    classicEvents.map((e) => ({ type: e.type, section: e.section, micro: e.micro, summary: e.summary, status: e.status })),
  );
  const visualTraits = Object.keys(genome.traits).filter((k) => k.startsWith("visual."));
  console.log("visual traits in genome", visualTraits.length, visualTraits.slice(0, 5));

  console.log("\n=== HEURISTIC VISUAL ONLY ===");
  const visual = await extractVisualFromPdf(buffer, fileName, { sources: [], maxImages: 8 });
  console.log("heuristic visual territories", visualTerritoryCount(visual));
}

void main();
