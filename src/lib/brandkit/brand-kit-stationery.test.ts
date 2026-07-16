import { describe, expect, it } from "vitest";
import { createEmptyBrandKit } from "@/lib/brandkit/brand-kit-defaults";
import type { PaletteValue } from "@/lib/brandkit/brand-kit-types";
import { resolveStationeryContact, stationeryRequirementsMet } from "@/lib/brandkit/brand-kit-stationery";

describe("brand-kit-stationery", () => {
  it("resuelve contacto con defaults y overrides", () => {
    const doc = createEmptyBrandKit();
    doc.brandName = { value: "OARO", provenance: { type: "user_input", detail: "t" } };
    doc.sources = [{ kind: "url", ref: "https://www.oaro.net", ts: new Date().toISOString() }];
    doc.stationeryContact = { personName: "Ana Tornero", role: "Directora" };

    const contact = resolveStationeryContact(doc, { brandName: "OARO", contactEmail: undefined });
    expect(contact.personName).toBe("Ana Tornero");
    expect(contact.role).toBe("Directora");
    expect(contact.email).toBe("hola@oaro.net");
    expect(contact.website).toBe("oaro.net");
  });

  it("exige logo, paleta y tipografía para papelería", () => {
    const doc = createEmptyBrandKit();
    expect(stationeryRequirementsMet(doc, false)).toBe(false);

    const palette: PaletteValue = { colors: [{ hex: "#112233", role: "primary" }] };
    doc.slots.palette = { ...doc.slots.palette, status: "resolved", locked: true, value: palette };
    doc.slots.logo = {
      ...doc.slots.logo,
      status: "resolved",
      locked: true,
      value: { assetId: "l", previewUrl: "https://x.com/l.png", format: "png", width: 1, height: 1, background: "transparent", variants: [] },
    };
    doc.slots.typography = {
      ...doc.slots.typography,
      status: "resolved",
      locked: true,
      value: { families: [{ family: "Inter", role: "body", source: "system", fallbacks: [], weights: [400] }] },
    };

    expect(stationeryRequirementsMet(doc, false)).toBe(true);
  });
});
