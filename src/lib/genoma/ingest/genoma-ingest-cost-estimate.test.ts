import { describe, expect, it } from "vitest";
import {
  estimateGenomaIngestCost,
  formatGenomaIngestCostDetailLines,
} from "./genoma-ingest-cost-estimate";

describe("estimateGenomaIngestCost", () => {
  it("suma síntesis IA + brand board para moodboard con IA", () => {
    const estimate = estimateGenomaIngestCost(
      [
        {
          name: "qwords-brand-board.png",
          mime: "image/png",
          width: 736,
          height: 736,
        },
      ],
      true,
    );

    expect(estimate.lines.some((line) => line.id === "llm_synthesis")).toBe(true);
    expect(estimate.lines.some((line) => line.id === "vision_brand_board")).toBe(true);
    expect(estimate.lines.some((line) => line.id === "vision_brand_board_logo_focus")).toBe(true);
    expect(estimate.lines.some((line) => line.id === "vision_logo_crop_verify")).toBe(true);
    expect(estimate.lines.length).toBe(4);
    expect(estimate.totalEstimatedUsd).toBeGreaterThan(0.03);
    expect(estimate.totalReserveMicros).toBeGreaterThan(estimate.totalEstimatedMicros);
  });

  it("sin IA no hay líneas de coste", () => {
    const estimate = estimateGenomaIngestCost(
      [{ name: "qwords-brand-board.png", mime: "image/png", width: 736, height: 736 }],
      false,
    );
    expect(estimate.lines).toHaveLength(0);
    expect(estimate.totalEstimatedUsd).toBe(0);
  });

  it("formatea desglose con total", () => {
    const estimate = estimateGenomaIngestCost(
      [{ name: "moodboard.jpg", mime: "image/jpeg", width: 800, height: 800 }],
      true,
    );
    const lines = formatGenomaIngestCostDetailLines(estimate, "es");
    expect(lines[0]).toContain("varias llamadas");
    expect(lines.some((line) => line.includes("Total estimado"))).toBe(true);
    expect(lines.some((line) => line.includes("brand board"))).toBe(true);
    expect(lines.some((line) => line.includes("refuerzo logo"))).toBe(true);
    expect(lines.some((line) => line.includes("solo se ejecuta"))).toBe(true);
    expect(lines.some((line) => line.includes("verificación de recorte"))).toBe(true);
  });

  it("alinea deck PDF con isLikelyDeckPdf (pageCount, no solo nombre)", () => {
    const byNameOnly = estimateGenomaIngestCost(
      [{ name: "Company Overview.pdf", mime: "application/pdf" }],
      true,
    );
    expect(byNameOnly.lines.some((line) => line.id === "vision_deck_logo")).toBe(false);

    const byPages = estimateGenomaIngestCost(
      [
        {
          name: "Company Overview.pdf",
          mime: "application/pdf",
          pageCount: 18,
          textSampleExcerpt: "Executive summary",
        },
      ],
      true,
    );
    expect(byPages.lines.some((line) => line.id === "vision_deck_logo")).toBe(true);
    expect(byPages.lines.some((line) => line.id === "vision_logo_crop_verify")).toBe(true);
  });
});
