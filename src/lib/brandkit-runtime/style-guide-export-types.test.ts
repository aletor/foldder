import { describe, expect, it } from "vitest";
import { resolveStyleGuideSoloValidado, STYLE_GUIDE_EXPORT_MODE_LABELS } from "./style-guide-export-types";

describe("style-guide-export-types", () => {
  it("define etiquetas de modo", () => {
    expect(STYLE_GUIDE_EXPORT_MODE_LABELS.operativo).toContain("Borrador");
    expect(STYLE_GUIDE_EXPORT_MODE_LABELS.cliente).toContain("final");
  });

  it("modo cliente implica solo validado", () => {
    expect(resolveStyleGuideSoloValidado("operativo")).toBe(false);
    expect(resolveStyleGuideSoloValidado("cliente")).toBe(true);
  });
});
