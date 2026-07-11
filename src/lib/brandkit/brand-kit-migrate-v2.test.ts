import { describe, expect, it } from "vitest";
import { compileBrandKit } from "./compile-brand-kit";
import { applySlotAction } from "./brand-kit-slot-actions";
import { createEmptyBrandKit, mergeBrandKitDocument, normalizeBrandKitDocument } from "./brand-kit-defaults";
import { hasLegacyBrandKitSlots, LEGACY_SLOT_KEYS, migrateBrandKitDocument } from "./brand-kit-migrate-v2";
import type { BrandKitDocument, Provenance, SlotState } from "./brand-kit-types";

const NOW = "2026-07-08T12:00:00.000Z";

function prov(type: Provenance["type"], detail: string, sourceUrl?: string): Provenance {
  return { type, detail, sourceUrl };
}

function createAlimaLegacyFixture(): Record<string, unknown> {
  const base = createEmptyBrandKit();
  return {
    ...base,
    brandName: { value: "Alima Producciones", provenance: prov("jsonld", "Organization.name", "https://alimafilms.com/") },
    sources: [{ kind: "url", ref: "https://alimafilms.com/", ts: NOW }],
    slots: {
      ...base.slots,
      oneliner: {
        id: "oneliner",
        status: "resolved",
        value: { text: "¿Quieres contar una buena historia?", origin: "extracted" },
        candidates: [],
        confidence: 0.82,
        provenance: prov("og_meta", "tagline home", "https://alimafilms.com/"),
        locked: false,
        history: [],
        updatedAt: NOW,
      },
      values: {
        id: "values",
        status: "resolved",
        value: {
          values: [
            { label: "Hacemos cine", evidence: "Declaración de principios" },
            { label: "tenemos cómplices", evidence: "No tenemos clientes: tenemos cómplices" },
            { label: "no grabamos en vertical", evidence: "Vamos muy en serio" },
          ],
        },
        candidates: [],
        confidence: 0.74,
        provenance: prov("llm_synthesis", "corpus web", "https://alimafilms.com/about"),
        locked: true,
        history: [],
        updatedAt: NOW,
      },
      voice: {
        id: "voice",
        status: "resolved",
        value: {
          summary: "Voz cinematográfica y cercana, con reglas extraídas del manifiesto web.",
          descriptors: ["cinematográfico", "cercano"],
          rules: ["tenemos cómplices", "no grabamos en vertical"],
          avoid: [],
          evidence: [{ quote: "Somos directores de cine frustrados", sourceUrl: "https://alimafilms.com/about" }],
        },
        candidates: [],
        confidence: 0.7,
        provenance: prov("llm_synthesis", "corpus web", "https://alimafilms.com/"),
        locked: false,
        history: [],
        updatedAt: NOW,
      },
      palette: {
        id: "palette",
        status: "resolved",
        value: { colors: [{ hex: "#FFFFFF", role: "primary" }] },
        candidates: [],
        confidence: 0.6,
        provenance: prov("css_var", "--brand-primary", "https://alimafilms.com/"),
        locked: false,
        history: [],
        updatedAt: NOW,
      },
      typography: {
        id: "typography",
        status: "resolved",
        value: {
          families: [
            {
              family: "Helvetica Neue",
              role: "body",
              source: "system",
              fallbacks: ["Helvetica", "Arial", "sans-serif"],
              weights: [400, 700],
            },
          ],
        },
        candidates: [],
        confidence: 0.65,
        provenance: prov("computed_style", "font-family body", "https://alimafilms.com/"),
        locked: false,
        history: [],
        updatedAt: NOW,
      },
      logo: {
        id: "logo",
        status: "resolved",
        value: {
          assetId: "alima-logo",
          previewUrl: "/fixtures/alima-logo-white.png",
          format: "png",
          width: 400,
          height: 120,
          background: "transparent",
          variants: [],
        },
        candidates: [],
        confidence: 0.9,
        provenance: prov("header_img", "logo header", "https://alimafilms.com/"),
        locked: false,
        history: [],
        updatedAt: NOW,
      },
      prohibitions: {
        id: "prohibitions",
        status: "resolved",
        value: {
          items: [
            { text: "no grabamos en vertical" },
            { text: "evitar lenguaje técnico en copy" },
          ],
        },
        candidates: [],
        confidence: 0.5,
        provenance: prov("llm_synthesis", "brand safety"),
        locked: true,
        history: [],
        updatedAt: NOW,
      },
    },
    compiled: null,
    updatedAt: NOW,
  };
}

function legacySlots(raw: Record<string, unknown>): Record<string, SlotState<unknown> | undefined> {
  return (raw.slots ?? {}) as Record<string, SlotState<unknown> | undefined>;
}

describe("brandKit migrate v2", () => {
  it("detects legacy slots in raw documents", () => {
    const legacy = createAlimaLegacyFixture();
    expect(hasLegacyBrandKitSlots(legacy)).toBe(true);
    expect(hasLegacyBrandKitSlots(createEmptyBrandKit())).toBe(false);
  });

  it("migrates essence from oneliner + values with AND lock merge", () => {
    const legacy = createAlimaLegacyFixture();
    const migrated = migrateBrandKitDocument(createEmptyBrandKit(), legacySlots(legacy));
    const essence = migrated.slots.essence;

    expect(essence?.value).toMatchObject({
      headline: "¿Quieres contar una buena historia?",
    });
    expect(essence?.locked).toBe(false);
    expect((essence?.value as { beliefs: { label: string }[] }).beliefs).toHaveLength(3);
  });

  it("locks essence only when all contributing legacy slots with content were locked", () => {
    const legacy = createAlimaLegacyFixture();
    const slots = legacySlots(legacy);
    slots.oneliner = { ...slots.oneliner!, locked: true };
    slots.values = { ...slots.values!, locked: true };
    const migrated = migrateBrandKitDocument(createEmptyBrandKit(), slots);
    expect(migrated.slots.essence?.locked).toBe(true);
  });

  it("oneliner locked alone locks essence when values is empty", () => {
    const legacy = createAlimaLegacyFixture();
    const slots = legacySlots(legacy);
    slots.oneliner = { ...slots.oneliner!, locked: true };
    slots.values = { ...createEmptyBrandKit().slots.voice, id: "values", status: "empty", candidates: [], confidence: 0, locked: false, history: [], updatedAt: NOW };
    const migrated = migrateBrandKitDocument(createEmptyBrandKit(), slots);
    expect(migrated.slots.essence?.locked).toBe(true);
  });

  it("never propagates prohibitions lock to voice or visualWorld", () => {
    const legacy = createAlimaLegacyFixture();
    const migrated = migrateBrandKitDocument(mergeBrandKitDocument(legacy), legacySlots(legacy));
    expect(migrated.slots.voice?.locked).toBe(false);
    expect(migrated.slots.visualWorld?.locked).toBe(false);
  });

  it("routes verbal prohibitions to voice.avoid and visual to visualWorld.limits", () => {
    const legacy = createAlimaLegacyFixture();
    const migrated = migrateBrandKitDocument(mergeBrandKitDocument(legacy), legacySlots(legacy));
    const voice = migrated.slots.voice?.value as { avoid?: string[] };
    const visual = migrated.slots.visualWorld?.candidates?.[0]?.value as { limits: string[] };
    expect(voice?.avoid).toContain("evitar lenguaje técnico en copy");
    expect(visual?.limits).toContain("no grabamos en vertical");
  });

  it("normalize persists v2-only document without legacy slot keys", () => {
    const legacy = createAlimaLegacyFixture();
    const normalized = normalizeBrandKitDocument(legacy) as BrandKitDocument & { slots: Record<string, unknown> };
    for (const key of LEGACY_SLOT_KEYS) {
      expect(normalized.slots[key]).toBeUndefined();
    }
    expect(normalized.slots.essence?.value).toMatchObject({
      headline: "¿Quieres contar una buena historia?",
      summary: expect.stringContaining("Marca orientada"),
    });
  });

  it("preserves user edits after migration roundtrip", () => {
    const legacy = createAlimaLegacyFixture();
    let doc = normalizeBrandKitDocument(legacy);
    doc = applySlotAction(doc, "essence", {
      action: "set",
      value: {
        summary: "Historia que importa para marcas que buscan narrativa con carácter.",
        headline: "Historia que importa.",
        headlineOrigin: "generated",
        beliefs: [{ label: "Cine con alma" }],
        evidence: [],
      },
    });
    const reloaded = normalizeBrandKitDocument(doc);
    expect(reloaded.slots.essence?.value).toMatchObject({
      headline: "Historia que importa.",
      summary: expect.stringContaining("Historia que importa"),
    });
  });

  it("compiles migrated document with beliefs and headline", async () => {
    const legacy = createAlimaLegacyFixture();
    const normalized = normalizeBrandKitDocument(legacy);
    const compiled = await compileBrandKit(normalized);
    expect(compiled.compiled.copyRules).toContain("Hacemos cine");
    expect(compiled.compiled.stylePrompt).toContain("Alima Producciones");
    expect(compiled.compiled.stylePrompt).toContain("cinematográfica");
    expect(compiled.compiledHash).toHaveLength(64);
  });
});
