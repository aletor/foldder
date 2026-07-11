import { describe, expect, it } from "vitest";
import { resolveNivel1BatchPageByEchoedTag } from "./page-vision-pass-nivel1-attribution";

describe("page-vision-pass-nivel1-attribution", () => {
  const batchPages = [
    { pageTag: "PV-P3", pageNumber: 3, logoInstances: [], brandNameEvidence: [], typographyRoles: [], pageKind: "indice" },
    { pageTag: "PV-P1", pageNumber: 1, logoInstances: [], brandNameEvidence: [], typographyRoles: [], pageKind: "portada" },
    { pageTag: "PV-P2", pageNumber: 2, logoInstances: [], brandNameEvidence: [], typographyRoles: [], pageKind: "contenido" },
  ];

  it("atribuye por tag ecoado aunque el array venga invertido", () => {
    const p1 = resolveNivel1BatchPageByEchoedTag({ pages: batchPages, expectedTag: "PV-P1" });
    expect(p1.error).toBeUndefined();
    expect(p1.page?.pageNumber).toBe(1);

    const p3 = resolveNivel1BatchPageByEchoedTag({ pages: batchPages, expectedTag: "PV-P3" });
    expect(p3.page?.pageNumber).toBe(3);
  });

  it("página ausente → missing, sin heredar vecino por posición", () => {
    const missing = resolveNivel1BatchPageByEchoedTag({ pages: batchPages, expectedTag: "PV-P99" });
    expect(missing.page).toBeNull();
    expect(missing.error).toBe("missing");
  });

  it("tag duplicado en respuesta → duplicate_tag", () => {
    const dup = resolveNivel1BatchPageByEchoedTag({
      pages: [
        { pageTag: "PV-P2", pageNumber: 2 },
        { pageTag: "PV-P2", pageNumber: 4 },
      ],
      expectedTag: "PV-P2",
    });
    expect(dup.page).toBeNull();
    expect(dup.error).toBe("duplicate_tag");
  });

  it("sin pageTag ecoado no empareja por pageNumber solo", () => {
    const byNumOnly = resolveNivel1BatchPageByEchoedTag({
      pages: [{ pageNumber: 2, logoInstances: [] }],
      expectedTag: "PV-P2",
    });
    expect(byNumOnly.error).toBe("missing");
  });
});
