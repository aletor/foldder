import { describe, expect, it } from "vitest";

import { crownedGenome, ghostGenome, proposedGenome } from "../fixtures";
import { computeCompleteness } from "./completeness";
import { buildBookView } from "./book-view";
import { projectGenomeToBrandKit } from "./exports";

describe("buildBookView — estados de la cara", () => {
  it("ghost: todos los rasgos vacíos y completitud 0", () => {
    const view = buildBookView(ghostGenome());
    expect(view.completenessPercent).toBe(0);
    expect(view.logo.primary.state).toBe("ghost");
    expect(view.typography.primary.state).toBe("ghost");
    expect(view.palette.every((p) => p.slot.state === "ghost")).toBe(true);
    expect(view.voice.tagline.state).toBe("ghost");
    expect(view.logo.primary.value).toBeNull();
    expect(view.sourcesCount).toBe(0);
  });

  it("proposed: hay propuestas visibles pero ninguna coronada", () => {
    const view = buildBookView(proposedGenome());
    expect(view.typography.primary.state).toBe("proposed");
    expect(view.typography.primary.value?.family).toBe("Montserrat");
    expect(view.logo.primary.state).toBe("proposed");
    // Con señales de evidencia hay profundidad tras el "···".
    expect(view.typography.primary.hasDepth).toBe(true);
    expect(view.palette.every((p) => p.slot.state === "proposed")).toBe(true);
    expect(view.sourcesCount).toBe(1);
  });

  it("crowned: rasgos principales coronados y valores presentes", () => {
    const view = buildBookView(crownedGenome());
    expect(view.logo.primary.state).toBe("crowned");
    expect(view.typography.primary.state).toBe("crowned");
    expect(view.typography.primary.value?.family).toBe("Montserrat");
    expect(view.palette.every((p) => p.slot.state === "crowned")).toBe(true);
    expect(view.voice.tagline.state).toBe("crowned");
    expect(view.voice.tagline.value?.text).toBe("Hacemos que pase.");
    // Una imagen confirmada trae su render generado.
    const people = view.visualUniverse.find((v) => v.category === "people")!;
    expect(people.slot.state).toBe("crowned");
    expect(people.slot.items[0].derived?.generatedImageUrl).toBeTruthy();
  });
});

describe("projectGenomeToBrandKit", () => {
  it("logoSignature usa la firma del candidato coronado (pHash)", () => {
    const kit = projectGenomeToBrandKit(crownedGenome());
    expect(kit.logoSignature).toBe("logo-primary");
  });

  it("sin logo coronado ⇒ logoSignature null", () => {
    expect(projectGenomeToBrandKit(ghostGenome()).logoSignature).toBeNull();
  });
});

describe("computeCompleteness — límites y monotonía", () => {
  it("ghost=0 · proposed>0 · crowned>proposed · siempre 0..100", () => {
    const ghost = computeCompleteness(ghostGenome());
    const proposed = computeCompleteness(proposedGenome());
    const crowned = computeCompleteness(crownedGenome());

    expect(ghost).toBe(0);
    expect(proposed).toBeGreaterThan(0);
    expect(crowned).toBeGreaterThan(proposed);
    for (const v of [ghost, proposed, crowned]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
    // Coronar la mayoría del libro debe superar el 70%.
    expect(crowned).toBeGreaterThan(70);
  });
});
