import { describe, expect, it } from "vitest";
import { BRAND_LOGO_MARK_FILENAME } from "../fixtures/brandkit-paths";
import { emptyGenome, crownedCandidates, getTrait } from "../model/trait";
import { ingestSvgIntoGenome } from "../ingest/pdf-ingest-server";

const MINIMAL_SVG = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 40"><rect width="100" height="40" fill="#000"/></svg>`,
  "utf8",
);

describe("ingestSvgIntoGenome (T-svg-directo)", () => {
  it("corona logo.primary con vectorUrl sin modal", async () => {
    const { genome, events } = await ingestSvgIntoGenome(MINIMAL_SVG, BRAND_LOGO_MARK_FILENAME, emptyGenome());
    const trait = getTrait(genome, "logo.primary");
    expect(trait).toBeDefined();
    const crowned = crownedCandidates(trait!);
    expect(crowned).toHaveLength(1);
    expect(crowned[0].status).toBe("crowned");
    expect(crowned[0].derived?.vectorUrl).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(crowned[0].signals.some((s) => s.kind === "user-supplied")).toBe(true);
    expect(events.some((e) => e.type === "material_prompt")).toBe(false);
    expect(events.some((e) => e.type === "section_resolved" && e.section === "logo")).toBe(true);
  });
});
