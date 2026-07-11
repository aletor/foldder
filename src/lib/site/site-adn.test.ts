import { describe, expect, it } from "vitest";
import { createDemoBrandKitFixture } from "@/lib/brandkit/brand-kit-defaults";
import type { PaletteValue } from "@/lib/brandkit/brand-kit-types";
import { resolveSiteAdnFromBrandKit } from "./site-adn";
import { compileSiteTheme } from "./site-theme";
import { inferMotionDnaFromText } from "./site-motion-dna";
import { createEmptySiteProject } from "./site-defaults";
import { applySiteAdnToProject } from "./site-adn";
import { getActiveSitePage } from "./site-project";

describe("site-motion-dna", () => {
  it("infers bounce from cercana voice keywords", () => {
    const result = inferMotionDnaFromText("Tono cercano y claro para equipos creativos");
    expect(result.motionDNA).toBe("bounce");
    expect(result.source).toContain("Tono cercano");
  });

  it("infers expo from energetic voice", () => {
    const result = inferMotionDnaFromText("Marca joven y dinámica con energía urbana");
    expect(result.motionDNA).toBe("expo");
  });

  it("defaults to soft when no keywords match", () => {
    const result = inferMotionDnaFromText("Marca sin señales de movimiento");
    expect(result.motionDNA).toBe("soft");
  });
});

describe("site-adn", () => {
  it("resolves brand theme and motion DNA from demo brandKit", () => {
    const doc = createDemoBrandKitFixture();
    const adn = resolveSiteAdnFromBrandKit(doc, { brandKitNodeId: "brand-kit-1" });

    expect(adn.ready).toBe(true);
    expect(adn.document).toBe(doc);
    expect(adn.brandName).toBe("Acme Studio");
    expect(adn.oneLiner).toBe("Tu marca, desglosada.");
    expect(adn.motionDNA).toBe("bounce");
    expect(adn.brandTheme.ready).toBe(true);
    expect(adn.brandTheme.vars["--brand-surface-page"]).toBeTruthy();
  });

  it("compiles different palettes for two brands on the same project", () => {
    const project = createEmptySiteProject();
    const acme = resolveSiteAdnFromBrandKit(createLightBrandBrandKit("Acme Studio", "#F4F1EE"));
    const qwords = resolveSiteAdnFromBrandKit(createDarkBrandBrandKit());

    const acmeCss = compileSiteTheme(applySiteAdnToProject(project, acme).theme, acme);
    const qwordsCss = compileSiteTheme(applySiteAdnToProject(project, qwords).theme, qwords);

    expect(acmeCss.variables["--c-bg"]).not.toBe(qwordsCss.variables["--c-bg"]);
    expect(acmeCss.polarity).toBe("light");
    expect(qwordsCss.polarity).toBe("dark");
    expect(acmeCss.variables["--c-accent"]).not.toBe(qwordsCss.variables["--c-accent"]);
  });

  it("prefills seo from brand when empty", () => {
    const project = createEmptySiteProject();
    const adn = resolveSiteAdnFromBrandKit(createDemoBrandKitFixture());
    const merged = applySiteAdnToProject(project, adn);

    const mergedPage = getActiveSitePage(merged);
    expect(mergedPage.seo.title).toBe("Acme Studio");
    expect(mergedPage.seo.description).toBe("Tu marca, desglosada.");
    expect(merged.theme.base).toBe("brandKit");
    expect(merged.theme.motionDNA).toBe("bounce");
  });
});

function createLightBrandBrandKit(name: string, background: string) {
  const doc = createDemoBrandKitFixture();
  const palette = doc.slots.palette.value as PaletteValue;
  palette.colors = [
    { hex: "#6B4C9A", role: "primary", usageWeight: 0.4 },
    { hex: "#E07A5F", role: "accent", usageWeight: 0.2 },
    { hex: background, role: "background", usageWeight: 0.25 },
    { hex: "#1F2328", role: "text", usageWeight: 0.1 },
    { hex: "#D8DCE2", role: "neutral", usageWeight: 0.05 },
  ];
  doc.brandName = { value: name, provenance: doc.brandName!.provenance };
  return doc;
}

function createDarkBrandBrandKit() {
  const doc = createDemoBrandKitFixture();
  const palette = doc.slots.palette.value as PaletteValue;
  palette.colors = [
    { hex: "#0B1F3A", role: "primary", usageWeight: 0.4 },
    { hex: "#4ECDC4", role: "accent", usageWeight: 0.2 },
    { hex: "#0E1624", role: "background", usageWeight: 0.25 },
    { hex: "#F5F7FA", role: "text", usageWeight: 0.1 },
    { hex: "#6B7A90", role: "neutral", usageWeight: 0.05 },
  ];
  doc.brandName = { value: "Qwords", provenance: doc.brandName!.provenance };
  return doc;
}
