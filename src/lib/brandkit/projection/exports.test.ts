import { describe, expect, it } from "vitest";
import { crownedGenome, BRAND_KIT_FIXTURES } from "../fixtures";
import { projectGenomeToBrandKit, projectGenomeToDataset } from "./exports";
import { renderBrandKitStyleGuide } from "./style-guide-render";

describe("projectGenomeToDataset — inventario completo", () => {
  it("incluye paleta con roles, mensajes, claims con porqué y fuentes", () => {
    const projection = projectGenomeToDataset("node1", crownedGenome());
    expect(projection.constants.some((c) => c.fieldId === "color_primary" && c.role === "primary")).toBe(true);
    expect(projection.constants.some((c) => c.fieldId === "color_background")).toBe(true);
    expect(projection.lists.messages.some((m) => m.message.includes("Hacemos que pase"))).toBe(true);
    expect(projection.lists.forbiddenClaims[0]?.why).toContain("legal");
    expect(projection.lists.sources.length).toBeGreaterThan(0);
    expect(projection.lists.tone.length).toBeGreaterThan(0);
  });

  it("marca meta.crowned en filas coronadas vs propuestas", () => {
    const crowned = projectGenomeToDataset("n", crownedGenome());
    const proposed = projectGenomeToDataset("n", BRAND_KIT_FIXTURES.proposed());
    const crownedTagline = crowned.constants.find((c) => c.fieldId === "context");
    const proposedTagline = proposed.constants.find((c) => c.fieldId === "context");
    expect(crownedTagline?.meta.crowned).toBe(true);
    expect(proposedTagline?.meta.crowned).toBe(false);
  });
});

describe("projectGenomeToBrandKit — solo coronado", () => {
  it("expone tagline, tono, claims y referencias visuales coronadas", () => {
    const brand = projectGenomeToBrandKit(crownedGenome());
    expect(brand.tagline).toContain("Hacemos que pase");
    expect(brand.toneTraits.length).toBeGreaterThan(0);
    expect(brand.claimsForbidden[0]?.why).toBeTruthy();
    expect(brand.visualReferences.length).toBeGreaterThan(0);
    expect(brand.typographyPrimary).toBe("Montserrat");
  });

  it("propuesto sin corona ⇒ tagline null en brand", () => {
    const brand = projectGenomeToBrandKit(BRAND_KIT_FIXTURES.proposed());
    expect(brand.tagline).toBeNull();
  });
});

describe("renderBrandKitStyleGuide — modos de export", () => {
  it("modo cliente oculta badges de propuesto en HTML", async () => {
    const genome = BRAND_KIT_FIXTURES.proposed();
    const operativo = await renderBrandKitStyleGuide(genome, { exportMode: "operativo" });
    const cliente = await renderBrandKitStyleGuide(genome, { exportMode: "cliente" });
    expect(operativo.html).toMatch(/class="sg-badge"/);
    expect(cliente.html).not.toMatch(/class="sg-badge"/);
  });

  it("modo operativo incluye capítulos mosaic de voz y paleta", async () => {
    const doc = await renderBrandKitStyleGuide(crownedGenome(), { exportMode: "operativo", projectName: "Test" });
    expect(doc.html).toContain("sg-palette-card");
    expect(doc.html).toContain("Evitar");
    expect(doc.html).toContain("Test");
    expect(doc.html).toContain("sg-bands");
  });

  it("modo cliente incluye rasgos coronados completos", async () => {
    const doc = await renderBrandKitStyleGuide(crownedGenome(), { exportMode: "cliente", projectName: "OARO" });
    expect(doc.html).toContain("OARO");
    expect(doc.html).toContain("Hacemos que pase");
    expect(doc.html).toContain("#FFBD1B");
    expect(doc.html).toContain("Montserrat");
    expect(doc.html).toContain("sg-gallery-grid");
    expect(doc.html).not.toContain('class="sg-badge"');
  });

  it("incluye índice, cierre y versión final en el HTML", async () => {
    const doc = await renderBrandKitStyleGuide(crownedGenome(), {
      exportMode: "cliente",
      projectName: "OARO",
    });
    expect(doc.html).toContain("sg-toc");
    expect(doc.html).toContain("sg-chapter-closing");
    expect(doc.html).toContain("versión final");
  });
});
