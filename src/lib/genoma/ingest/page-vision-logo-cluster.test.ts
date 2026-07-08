import { describe, expect, it } from "vitest";
import { clusterHarvestedLogos } from "./page-vision-logo-cluster";
import type { PageVisionLogoInstance } from "./page-vision-pass-schema";

function mockInstance(overrides: Partial<PageVisionLogoInstance> = {}): PageVisionLogoInstance {
  return {
    variant: "isotipo",
    onBackground: "claro",
    textInLogo: "unknown",
    isComplete: true,
    cutEdges: [],
    confidence: 0.9,
    bbox: [0.1, 0.1, 0.2, 0.2],
    ...overrides,
  };
}

describe("page-vision-logo-cluster known-limitation", () => {
  /**
   * KNOWN-LIMITATION (pre-Fase-B-post-extracción):
   * isotipos sin texto legible no se agrupan solo por pHash de tinta sobre render crop.
   * Fase B debe poner este test en verde consolidando sobre asset nativo sin fondo.
   */
  it("KNOWN-LIMITATION: dos isotipos idénticos sin textInLogo → hoy 2 clusters", () => {
    const phashA = "a".repeat(1024);
    const phashB = "b".repeat(1024);
    const harvested = [
      { pageNumber: 1, instance: mockInstance({ bbox: [0.1, 0.1, 0.2, 0.2] }), buffer: Buffer.alloc(8), logoPHash: phashA },
      { pageNumber: 2, instance: mockInstance({ bbox: [0.1, 0.1, 0.2, 0.2] }), buffer: Buffer.alloc(8), logoPHash: phashB },
    ];
    const clusters = clusterHarvestedLogos(harvested);
    expect(clusters.length).toBe(2);
  });

  it.todo("Fase B: dos isotipos idénticos sin textInLogo → 1 cluster tras extracción nativa");
});
