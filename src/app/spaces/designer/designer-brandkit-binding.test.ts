import { describe, expect, it } from "vitest";
import { mergeBrandKitsIntoConstants, brandKitConstantId, createDefaultBrandKit } from "@/app/spaces/brandkit/brandkit-logic";
import { BRANDKIT_FIELD_IDS } from "@/app/spaces/brandkit/brandkit-types";
import type { ConnectedBrandKit } from "@/app/spaces/brandkit/brandkit-logic";
import { resolveDesignerDatasetPropertyValue } from "./designer-dataset-property";
import { applyDatasetRowToDesignerObject } from "./designer-dataset-page";
import type { DesignerDatasetPropertyBinding } from "@/app/spaces/dataset/dataset-types";
import type { FreehandObject } from "../FreehandStudio";

function kit(nodeId: string): ConnectedBrandKit {
  const brand = createDefaultBrandKit();
  brand.values[BRANDKIT_FIELD_IDS.primaryColor] = { type: "color", value: "#ff0000" };
  brand.values[BRANDKIT_FIELD_IDS.socialHandle] = { type: "text", value: "@rfevb" };
  brand.values[BRANDKIT_FIELD_IDS.logo] = { type: "image", assetId: "a", url: "https://cdn/logo.png", w: 200, h: 100 };
  return { nodeId, brand };
}

describe("designer BrandKit binding (source node)", () => {
  it("resuelve color de propiedad desde BrandKit (fill)", () => {
    const ds = mergeBrandKitsIntoConstants(null, [kit("bk1")]);
    const binding: DesignerDatasetPropertyBinding = {
      propertyKey: "fill",
      source: "node",
      nodeId: "bk1",
      fieldId: BRANDKIT_FIELD_IDS.primaryColor,
      fieldKey: BRANDKIT_FIELD_IDS.primaryColor,
    };
    const value = resolveDesignerDatasetPropertyValue(binding, ds, 0, "fill");
    expect(value).toBe("#ff0000");
  });

  it("aplica texto de contenido (handle) desde BrandKit a un objeto de texto", () => {
    const ds = mergeBrandKitsIntoConstants(null, [kit("bk1")]);
    const obj = {
      id: "t1",
      type: "text",
      text: "viejo",
      _designerDatasetBinding: {
        source: "node",
        nodeId: "bk1",
        listId: "",
        listKey: "",
        fieldId: BRANDKIT_FIELD_IDS.socialHandle,
        fieldKey: BRANDKIT_FIELD_IDS.socialHandle,
        kind: "text",
      },
    } as unknown as FreehandObject;
    const next = applyDatasetRowToDesignerObject(obj, ds, 0) as unknown as { text: string };
    expect(next.text).toBe("@rfevb");
  });

  it("aplica imagen de contenido (logo) desde BrandKit a un objeto imagen", () => {
    const ds = mergeBrandKitsIntoConstants(null, [kit("bk1")]);
    const obj = {
      id: "i1",
      type: "image",
      src: "",
      _designerDatasetBinding: {
        source: "node",
        nodeId: "bk1",
        listId: "",
        listKey: "",
        fieldId: BRANDKIT_FIELD_IDS.logo,
        fieldKey: BRANDKIT_FIELD_IDS.logo,
        kind: "image",
      },
    } as unknown as FreehandObject;
    const next = applyDatasetRowToDesignerObject(obj, ds, 0) as unknown as { src: string; intrinsicRatio: number };
    expect(next.src).toBe("https://cdn/logo.png");
    expect(next.intrinsicRatio).toBeCloseTo(2);
  });

  it("constant id namespacing coincide con el binding", () => {
    expect(brandKitConstantId("bk1", BRANDKIT_FIELD_IDS.logo)).toBe("bk:bk1:logo");
  });
});
