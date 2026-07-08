import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ESADE_PITCH_FILENAME,
  ESADE_PITCH_PDF,
  LEAN_FINANCE_PITCH_FILENAME,
  LEAN_FINANCE_PITCH_PDF,
  hasEsadePitchPdf,
  hasLeanFinancePitchPdf,
} from "../fixtures/brandkit-paths";
import { runPageVisionPrepass } from "./page-vision-prepass";
import { extractEmbeddedRasterImagesFromPdf } from "@/lib/brain/pdf-visual-extract";

describe.skipIf(!hasLeanFinancePitchPdf())("page-vision-prepass — Lean Finance pitch (JPEG2000)", () => {
  it("prepass completa aunque falle alguna imagen embebida", async () => {
    const buffer = fs.readFileSync(LEAN_FINANCE_PITCH_PDF);
    const prepass = await runPageVisionPrepass({
      buffer,
      fileName: LEAN_FINANCE_PITCH_FILENAME,
      profile: "nivel1",
    });
    expect(prepass.logoLikelyPages.length).toBeGreaterThan(0);
    expect(prepass.durationMs).toBeGreaterThanOrEqual(0);
  }, 60_000);

  it("scan raster embebido no lanza", async () => {
    const buffer = fs.readFileSync(LEAN_FINANCE_PITCH_PDF);
    await expect(
      extractEmbeddedRasterImagesFromPdf(buffer, { maxPages: 5 }),
    ).resolves.toBeInstanceOf(Array);
  }, 60_000);
});

describe.skipIf(!hasEsadePitchPdf())("page-vision-prepass — ESADE pitch (JPEG2000)", () => {
  it("prepass completa sin abortar", async () => {
    const buffer = fs.readFileSync(ESADE_PITCH_PDF);
    const prepass = await runPageVisionPrepass({
      buffer,
      fileName: ESADE_PITCH_FILENAME,
      profile: "nivel1",
    });
    expect(prepass.logoLikelyPages).toContain(1);
  }, 60_000);
});
