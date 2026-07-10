import { describe, expect, it } from "vitest";
import { createEmptyGenoma } from "../genoma-defaults";
import { createInitialCrawlProgress } from "@/app/spaces/genoma/GenomaCrawlProgress";
import { buildSidebarIngestSteps, resolveGenomaSidebarPhase } from "./sidebar-phase";

describe("resolveGenomaSidebarPhase", () => {
  it("vacío sin fuentes", () => {
    expect(resolveGenomaSidebarPhase(createEmptyGenoma(), { isAnalyzing: false })).toBe("empty");
  });

  it("ingesting mientras analiza", () => {
    const doc = createEmptyGenoma();
    doc.sources.push({ kind: "file", ref: "a.pdf", ts: "2026-01-01" });
    expect(resolveGenomaSidebarPhase(doc, { isAnalyzing: true })).toBe("ingesting");
  });
});

describe("buildSidebarIngestSteps", () => {
  it("marca recibido como running al inicio", () => {
    const steps = buildSidebarIngestSteps(createInitialCrawlProgress());
    expect(steps[0]?.status).toBe("running");
  });

  it("marca listo cuando finalize", () => {
    const progress = {
      ...createInitialCrawlProgress(),
      phase: "finalize" as const,
      step: 6,
      message: "ADN listo",
    };
    const steps = buildSidebarIngestSteps(progress);
    expect(steps.at(-1)?.status).toBe("done");
  });
});
