import { describe, expect, it } from "vitest";
import { normalizeProjectAssets } from "@/app/spaces/project-assets-metadata";
import { LEGACY_BRANDKIT_RUNTIME_FIXTURE } from "./fixtures/legacy-brandkit-assets.fixture";
import { renderStyleGuideHtml, renderStyleGuideV2, styleGuideFilename } from "./style-guide-render";
import { resolveStyleGuideSoloValidado } from "./style-guide-export-types";
import { applyVoiceExamplesSynthesisOnAssets } from "./synthesize-voice-examples";
import { shouldIncludeInStyleGuide } from "./style-guide-filter";
import { createValidatedMeta, createGhostMeta, emptyBrandKitBoardMeta, getMeta, patchMeta } from "./interpretation";

describe("style-guide-filter", () => {
  it("default incluye proposed y excluye conflict", () => {
    expect(shouldIncludeInStyleGuide(createGhostMeta(), false)).toBe(false);
    const proposed = patchMeta(emptyBrandKitBoardMeta(), "tone", {
      status: "proposed",
      confidence: 0.7,
      evidence: [],
    });
    expect(shouldIncludeInStyleGuide(getMeta(proposed, "tone"), false)).toBe(true);
    const conflict = patchMeta(emptyBrandKitBoardMeta(), "tone", {
      status: "conflict",
      confidence: 0.5,
      evidence: [],
      conflict: { candidates: [], raisedAt: "2026-01-01T00:00:00.000Z" },
    });
    expect(shouldIncludeInStyleGuide(getMeta(conflict, "tone"), false)).toBe(false);
  });

  it("soloValidado excluye proposed", () => {
    const meta = patchMeta(emptyBrandKitBoardMeta(), "messages.tagline", createValidatedMeta()).interpretation[
      "messages.tagline"
    ];
    expect(shouldIncludeInStyleGuide(meta, true)).toBe(true);
    expect(
      shouldIncludeInStyleGuide({ status: "proposed", confidence: 0.7, evidence: [] }, true),
    ).toBe(false);
  });
});

describe("renderStyleGuideHtml — PR6", () => {
  it("genera HTML con sello versión y completitud", () => {
    const assets = normalizeProjectAssets(LEGACY_BRANDKIT_RUNTIME_FIXTURE);
    const doc = renderStyleGuideHtml(assets, {
      projectName: "Acme",
      brainVersion: 3,
      generatedAt: "2026-06-29T10:00:00.000Z",
    });
    expect(doc.completenessPercent).toBe(52);
    expect(doc.html).toContain("BrandKit v3");
    expect(doc.html).toContain("Acme");
    expect(doc.html).toContain("Libro de estilo");
    expect(doc.html).toContain("Claridad visual");
    expect(doc.html).toContain("Especificación extendida");
    expect(doc.html).toContain("60 / 30 / 10");
    expect(doc.derivations.palette.length).toBeGreaterThan(0);
  });

  it("incluye derivaciones de logo cuando hay logoPositive", () => {
    const assets = normalizeProjectAssets(LEGACY_BRANDKIT_RUNTIME_FIXTURE);
    const doc = renderStyleGuideHtml(assets, { projectName: "Acme" });
    expect(doc.derivations.logoMisuses).toHaveLength(6);
    expect(doc.html).toContain("Usos incorrectos");
    expect(doc.html).toContain("Área de seguridad");
    expect(doc.html).toContain("Ejemplos de voz");
  });

  it("soloValidado reduce contenido propuesto", () => {
    const assets = normalizeProjectAssets(LEGACY_BRANDKIT_RUNTIME_FIXTURE);
    const full = renderStyleGuideHtml(assets, { soloValidado: false });
    const validatedOnly = renderStyleGuideHtml(assets, { soloValidado: true });
    expect(full.html.length).toBeGreaterThan(validatedOnly.html.length);
  });

  it("styleGuideFilename es estable", () => {
    expect(styleGuideFilename("Mi Marca", "2026-06-29T10:00:00.000Z")).toBe("mi-marca-libro-estilo-2026-06-29.pdf");
  });
});

describe("renderStyleGuideV2 — B3", () => {
  it("expone capítulos y data-chapter en HTML", () => {
    const assets = normalizeProjectAssets(LEGACY_BRANDKIT_RUNTIME_FIXTURE);
    const doc = renderStyleGuideV2(assets, { exportMode: "operativo", projectName: "Acme" });
    expect(doc.version).toBe(2);
    expect(doc.exportMode).toBe("operativo");
    expect(doc.chapters.some((chapter) => chapter.id === "logo-usage" && chapter.origin === "derivado")).toBe(true);
    expect(doc.html).toContain('data-chapter="cover"');
    expect(doc.html).toContain('data-chapter="color-system"');
    expect(doc.html).toContain("Edición operativa");
  });

  it("modo cliente fuerza solo validado y oculta etiquetas internas", () => {
    const assets = normalizeProjectAssets(LEGACY_BRANDKIT_RUNTIME_FIXTURE);
    const operativo = renderStyleGuideV2(assets, { exportMode: "operativo", projectName: "Acme" });
    const cliente = renderStyleGuideV2(assets, { exportMode: "cliente", projectName: "Acme" });
    expect(resolveStyleGuideSoloValidado("cliente")).toBe(true);
    expect(cliente.soloValidado).toBe(true);
    expect(cliente.html).toContain("Edición cliente");
    expect(cliente.html).toContain("uso externo");
    expect(cliente.html.length).toBeLessThan(operativo.html.length);
    expect(cliente.html).not.toMatch(/<em>Propuesto<\/em>/);
  });

  it("capítulo voz es sintetizado cuando hay evidencia llm-synthesis", () => {
    const assets = applyVoiceExamplesSynthesisOnAssets(normalizeProjectAssets(LEGACY_BRANDKIT_RUNTIME_FIXTURE), [
      { id: "s1", kind: "approved_voice", text: "Ejemplo sintetizado." },
      { id: "s2", kind: "bad_piece", text: "Mal ejemplo." },
    ]);
    const doc = renderStyleGuideV2(assets, { exportMode: "operativo", projectName: "Acme" });
    const voiceChapter = doc.chapters.find((chapter) => chapter.id === "voice");
    expect(voiceChapter?.origin).toBe("sintetizado");
    expect(doc.html).toContain("Ejemplo sintetizado.");
  });
});
