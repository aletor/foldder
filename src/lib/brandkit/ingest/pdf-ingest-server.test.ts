import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  hasSampleBrandDeckPdf,
  SAMPLE_BRAND_DECK_FILENAME,
  SAMPLE_BRAND_DECK_PDF,
} from "../fixtures/brandkit-paths";
import { emptyGenome } from "../model/trait";
import { ingestPdfIntoGenome } from "./pdf-ingest-server";

describe.skipIf(!hasSampleBrandDeckPdf())("pdf-ingest-server", () => {
  it("emite paleta, logo, tipografía, visual y voz con genome_update", async () => {
    const buffer = fs.readFileSync(SAMPLE_BRAND_DECK_PDF);
    const events = [];
    let genome = emptyGenome();
    for await (const event of ingestPdfIntoGenome(buffer, SAMPLE_BRAND_DECK_FILENAME, genome, {
      allowMaterialPrompts: false,
    })) {
      events.push(event);
      if (event.type === "genome_update") genome = event.genome;
    }

    const resolved = events.filter((e) => e.type === "section_resolved").map((e) => e.section);
    expect(resolved).toContain("palette");
    expect(resolved).toContain("logo");
    expect(resolved).toContain("typography");
    expect(resolved).toContain("visual");
    expect(resolved).toContain("voice");
    expect(genome.sources.length).toBeGreaterThan(0);
    expect(Object.keys(genome.traits).length).toBeGreaterThan(0);
  }, 120_000);
});
