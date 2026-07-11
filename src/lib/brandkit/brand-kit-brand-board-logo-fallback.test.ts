import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { rankBrandBoardLogoRegions } from "./brand-kit-brand-board-logo-regions";

const FIXTURE = path.join(__dirname, "fixtures", "qwords-brand-board.png");

describe("rankBrandBoardLogoRegions", () => {
  it("prioriza el panel hero arriba-derecha en Qwords Systems", async () => {
    if (!fs.existsSync(FIXTURE)) return;

    const buffer = fs.readFileSync(FIXTURE);
    const png = await sharp(buffer).png().toBuffer();
    const meta = await sharp(png).metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;

    const ranked = await rankBrandBoardLogoRegions(png, width, height);
    expect(ranked.length).toBeGreaterThan(0);
    expect(ranked[0]?.label).toBe("top_right_hero");
    expect(ranked[0]?.score).toBeGreaterThan(0.5);
  });
});
