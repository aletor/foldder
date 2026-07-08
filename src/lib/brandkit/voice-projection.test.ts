import { describe, expect, it } from "vitest";
import { defaultProjectAssets, normalizeProjectAssets } from "@/app/spaces/project-assets-metadata";
import { bootstrapSidecarFromAssets, buildBrandBoardView } from "./board-projection";
import { computeCompleteness } from "./completeness";
import { resolveProjectableTagline } from "./voice-projection";

describe("T-F1 — proyección Voz sin artefacto crudo", () => {
  it("corporateContext con header Document nunca llega a Voz", () => {
    const assets = normalizeProjectAssets({
      ...defaultProjectAssets(),
      knowledge: {
        ...defaultProjectAssets().knowledge,
        corporateContext: "### Document: sample-brand-deck.pdf\nTexto crudo sin síntesis",
        documents: [{ id: "d1", name: "sample-brand-deck.pdf", size: 1, mime: "application/pdf" }],
      },
      strategy: {
        ...defaultProjectAssets().strategy,
        languageTraits: ["FORMAL", "TRUSTWORTHY", "INSIGHTFUL"],
      },
    });

    expect(resolveProjectableTagline(assets)).toBeNull();
    const view = buildBrandBoardView(assets);
    expect(view.voice.tagline).toBeNull();
    expect(view.voice.toneChips).toHaveLength(0);
  });
});

describe("T-F6 — medidor no acredita artefactos", () => {
  it("solo corporateContext crudo + tono inglés puntúa menos del 22% legacy", () => {
    const assets = normalizeProjectAssets({
      ...defaultProjectAssets(),
      knowledge: {
        ...defaultProjectAssets().knowledge,
        corporateContext: "### Document: sample-brand-deck.pdf",
        documents: [{ id: "d1", name: "sample-brand-deck.pdf", size: 1, mime: "application/pdf" }],
      },
      strategy: {
        ...defaultProjectAssets().strategy,
        languageTraits: ["FORMAL", "TRUSTWORTHY", "INSIGHTFUL"],
        visualStyle: {
          ...defaultProjectAssets().strategy.visualStyle,
          protagonist: {
            ...defaultProjectAssets().strategy.visualStyle.protagonist,
            description:
              "A forward-thinking executive illustrating the capabilities of an advanced identity platform.",
          },
          environment: {
            ...defaultProjectAssets().strategy.visualStyle.environment,
            description: "A futuristic digital ecosystem encapsulating secure and scalable identity.",
          },
          textures: {
            ...defaultProjectAssets().strategy.visualStyle.textures,
            description: "Sleek, modern textures representing cutting-edge security infrastructure.",
          },
        },
      },
    });

    const boardMeta = bootstrapSidecarFromAssets(assets);
    const percent = computeCompleteness(assets, boardMeta);
    expect(percent).toBeLessThan(10);
  });
});
