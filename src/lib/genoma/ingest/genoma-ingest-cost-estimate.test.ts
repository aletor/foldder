import { describe, expect, it } from "vitest";
import {
  estimateGenomaIngestCost,
  formatGenomaIngestCostDetailLines,
} from "./genoma-ingest-cost-estimate";

describe("estimateGenomaIngestCost", () => {
  it("suma probe + batch + brand board para moodboard con IA", () => {
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

    expect(estimate.lines.some((line) => line.id === "document_probe")).toBe(false);
    expect(estimate.lines.some((line) => line.id === "llm_synthesis")).toBe(true);
    expect(estimate.lines.some((line) => line.id === "vision_brand_board")).toBe(true);
    expect(estimate.lines.some((line) => line.id === "vision_brand_board_logo_focus")).toBe(true);
    expect(estimate.lines.some((line) => line.id === "vision_logo_crop_verify")).toBe(false);
    expect(estimate.lines.length).toBe(3);
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
      [{ name: "deck.pdf", mime: "application/pdf", pageCount: 6 }],
      true,
    );
    const lines = formatGenomaIngestCostDetailLines(estimate, "es");
    expect(lines[0]).toContain("varias llamadas");
    expect(lines.some((line) => line.includes("Total estimado"))).toBe(true);
    expect(lines.some((line) => line.includes("document probe"))).toBe(true);
    expect(lines.some((line) => line.includes("batch IA"))).toBe(true);
  });

  it("PDF largo usa document probe de 2 LLM, sin deck_logo legacy", () => {
    const estimate = estimateGenomaIngestCost(
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
    expect(estimate.lines.some((line) => line.id === "vision_deck_logo")).toBe(false);
    expect(estimate.lines.some((line) => line.id === "document_probe")).toBe(true);
    const probeLine = estimate.lines.find((line) => line.id === "document_probe");
    expect(probeLine?.label).toContain("2 LLM");
    expect(estimate.lines.some((line) => line.id === "llm_synthesis")).toBe(true);
  });
});
