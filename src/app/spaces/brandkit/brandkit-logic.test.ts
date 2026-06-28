import { describe, expect, it } from "vitest";
import {
  brainBrandSignature,
  brandKitConstantId,
  brandKitFilledFieldCount,
  brandKitsSignature,
  createDefaultBrandKit,
  isBrandKitConstantId,
  mergeBrainBrandIntoConstants,
  mergeBrandKitsIntoConstants,
  normalizeBrandKit,
  type ConnectedBrandKit,
} from "./brandkit-logic";
import { BRANDKIT_FIELD_IDS } from "./brandkit-types";
import type { Dataset } from "@/app/spaces/dataset/dataset-types";

function brandKit(nodeId: string): ConnectedBrandKit {
  const brand = createDefaultBrandKit();
  brand.values[BRANDKIT_FIELD_IDS.logo] = { type: "image", assetId: "a1", url: "https://cdn/logo.png", hasAlpha: true };
  brand.values[BRANDKIT_FIELD_IDS.primaryColor] = { type: "color", value: "#ff0000" };
  brand.values[BRANDKIT_FIELD_IDS.socialHandle] = { type: "text", value: "@rfevb" };
  return { nodeId, brand };
}

describe("brandkit-logic", () => {
  it("createDefaultBrandKit tiene los 4 campos vacíos", () => {
    const b = createDefaultBrandKit();
    expect(b.fields.map((f) => f.id).sort()).toEqual(
      ["logo", "primaryColor", "secondaryColor", "socialHandle"].sort(),
    );
    expect(brandKitFilledFieldCount(b)).toBe(0);
  });

  it("normalizeBrandKit conserva valores válidos y rellena faltantes", () => {
    const b = normalizeBrandKit({ fields: [], values: { primaryColor: { type: "color", value: "#123456" } } });
    expect(b.values.primaryColor).toEqual({ type: "color", value: "#123456" });
    expect(b.values.logo?.type).toBe("image");
  });

  it("brandKitConstantId namespacea y es reconocible", () => {
    const id = brandKitConstantId("bk1", "logo");
    expect(id).toBe("bk:bk1:logo");
    expect(isBrandKitConstantId(id)).toBe(true);
    expect(isBrandKitConstantId("logo")).toBe(false);
  });

  it("mergeBrandKitsIntoConstants inyecta constantes namespaced sobre un dataset base", () => {
    const base: Dataset = {
      id: "ds1",
      name: "D",
      scope: "local",
      lists: [],
      constants: { fields: [{ id: "c0", key: "c0", label: "C0", type: "text", required: false }], values: { c0: { type: "text", value: "x" } } },
      createdAt: "",
      updatedAt: "",
      version: 1,
    };
    const merged = mergeBrandKitsIntoConstants(base, [brandKit("bk1")]);
    expect(merged.constants.values["c0"]).toEqual({ type: "text", value: "x" });
    expect(merged.constants.values[brandKitConstantId("bk1", "logo")]).toMatchObject({ type: "image", url: "https://cdn/logo.png" });
    expect(merged.constants.values[brandKitConstantId("bk1", "primaryColor")]).toEqual({ type: "color", value: "#ff0000" });
    // No muta el base.
    expect(Object.keys(base.constants.values)).toEqual(["c0"]);
  });

  it("mergeBrandKitsIntoConstants sin base devuelve dataset sintético solo-constantes", () => {
    const merged = mergeBrandKitsIntoConstants(null, [brandKit("bk1"), brandKit("bk2")]);
    expect(merged.lists).toHaveLength(0);
    expect(merged.constants.values[brandKitConstantId("bk2", "socialHandle")]).toEqual({ type: "text", value: "@rfevb" });
  });

  it("mergeBrainBrandIntoConstants expone solo los campos con contenido (logo + colores)", () => {
    const merged = mergeBrainBrandIntoConstants(null, "brain1", {
      logoPositive: "https://cdn/brain-logo.png",
      colorPrimary: "#112233",
      colorSecondary: "",
      colorAccent: "#abcdef",
    });
    expect(merged).not.toBeNull();
    const c = merged!.constants;
    expect(c.values[brandKitConstantId("brain1", "logo")]).toMatchObject({ type: "image", url: "https://cdn/brain-logo.png" });
    expect(c.values[brandKitConstantId("brain1", "primaryColor")]).toEqual({ type: "color", value: "#112233" });
    expect(c.values[brandKitConstantId("brain1", "accentColor")]).toEqual({ type: "color", value: "#abcdef" });
    // El secundario vacío no se incluye.
    expect(c.values[brandKitConstantId("brain1", "secondaryColor")]).toBeUndefined();
    // Las constantes de Brain también son reconocibles como vinculables (mismo prefijo bk:).
    expect(isBrandKitConstantId(brandKitConstantId("brain1", "logo"))).toBe(true);
  });

  it("mergeBrainBrandIntoConstants sin contenido devuelve el base sin tocar", () => {
    expect(mergeBrainBrandIntoConstants(null, "brain1", { colorPrimary: "" })).toBeNull();
    const base: Dataset = {
      id: "d", name: "D", scope: "local", lists: [],
      constants: { fields: [], values: {} }, createdAt: "", updatedAt: "", version: 1,
    };
    expect(mergeBrainBrandIntoConstants(base, "brain1", null)).toBe(base);
  });

  it("brainBrandSignature cambia cuando cambia un color", () => {
    const a = brainBrandSignature("brain1", { colorPrimary: "#111111" });
    const b = brainBrandSignature("brain1", { colorPrimary: "#222222" });
    expect(a).not.toBe(b);
    expect(brainBrandSignature(null, { colorPrimary: "#111111" })).toBe("");
  });

  it("brandKitsSignature cambia cuando cambia un valor", () => {
    const a = brandKitsSignature([brandKit("bk1")]);
    const kit = brandKit("bk1");
    kit.brand.values[BRANDKIT_FIELD_IDS.primaryColor] = { type: "color", value: "#00ff00" };
    const b = brandKitsSignature([kit]);
    expect(a).not.toBe(b);
  });
});
