import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { cropAndScoreIngestLogo } from "./ingest-logo-crop-core";

const FIXTURE = path.join(__dirname, "..", "fixtures", "qwords-brand-board.png");

describe("ingest-logo-crop-core", () => {
  it("recorta y puntúa región hero en Qwords", async () => {
    if (!fs.existsSync(FIXTURE)) return;

    const buffer = fs.readFileSync(FIXTURE);
    const png = await sharp(buffer).png().toBuffer();
    const meta = await sharp(png).metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;

    const crop = await cropAndScoreIngestLogo({
      pagePng: png,
      pageWidth: width,
      pageHeight: height,
      bboxPage: [0.5, 0.02, 0.98, 0.42],
      padding: 0.04,
      trim: true,
      qualityMeta: { isComplete: true, cutEdges: false, confidence: 0.8 },
    });

    expect(crop).not.toBeNull();
    expect(crop!.width).toBeGreaterThan(20);
    expect(crop!.height).toBeGreaterThan(12);
    expect(crop!.quality.total).toBeGreaterThan(30);
  });
});
