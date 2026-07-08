import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { analyzeLogoShapeFromImageBuffer } from "./logo-shape-detect";

const LOGO_FIXTURE = path.join(process.cwd(), "fixtures/brandkit/logo-atresmedia-quienes-somos.png");
const DIAGRAM_FIXTURE = path.join(process.cwd(), "fixtures/brandkit/quienes-somos-diagram.png");
const hasLogoFixture = fs.existsSync(LOGO_FIXTURE);
const hasDiagramFixture = fs.existsSync(DIAGRAM_FIXTURE);

describe.skipIf(!hasLogoFixture)("T-logo-atres — logo limpio por forma", () => {
  it("PNG suelto es candidato top sin depender del nombre", async () => {
    const buffer = fs.readFileSync(LOGO_FIXTURE);
    const analysis = await analyzeLogoShapeFromImageBuffer(buffer, { filename: "asset.png" });
    expect(analysis.isLogoCandidate).toBe(true);
    expect(analysis.isReferenceDiagram).toBe(false);
    expect(analysis.score).toBeGreaterThan(0.7);
    expect(analysis.inkRatio).toBeGreaterThan(0.01);
    expect(analysis.inkRatio).toBeLessThan(0.15);
  });

  it("bonus de nombre suma score pero no auto-valida", async () => {
    const buffer = fs.readFileSync(LOGO_FIXTURE);
    const neutral = await analyzeLogoShapeFromImageBuffer(buffer, { filename: "asset.png" });
    const named = await analyzeLogoShapeFromImageBuffer(buffer, { filename: "logo-atresmedia.png" });
    expect(named.score).toBeGreaterThan(neutral.score);
    expect(named.filenameBonus).toBeGreaterThan(0);
  });
});

describe.skipIf(!hasDiagramFixture)("T-img-formats — clasificación referencia vs logo", () => {
  it("diagrama quiénes-somos no es candidato de logo", async () => {
    const buffer = fs.readFileSync(DIAGRAM_FIXTURE);
    const analysis = await analyzeLogoShapeFromImageBuffer(buffer, { filename: "Quienes_somos_3.png" });
    expect(analysis.isLogoCandidate).toBe(false);
    expect(analysis.isReferenceDiagram).toBe(true);
  });
});
