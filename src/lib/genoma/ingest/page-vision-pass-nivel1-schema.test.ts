import { describe, expect, it } from "vitest";
import { filterProductContentTitles, normalizeContentTitleEntries } from "./page-vision-content-titles";
import {
  enrichIndexBrandNameEvidenceFromTypography,
  normalizeSlimPageRaw,
  validateNivel1SlimPage,
} from "./page-vision-pass-nivel1-schema";
import { arbitrateBrandIdentity } from "./page-vision-identity-arbitration";
import type { PageVisionPassRunAudit } from "./page-vision-pass-runner";

describe("page-vision-content-titles", () => {
  it("filtra seccion_documento por kind, no regex", () => {
    const product = filterProductContentTitles([
      { text: "LAS HIJAS DE LA CRIADA", kind: "titulo_obra" },
      { text: "1. Carta del Presidente", kind: "seccion_documento" },
      { text: "ANEXO I. Taxonomía Europea", kind: "seccion_documento" },
    ]);
    expect(product).toEqual(["LAS HIJAS DE LA CRIADA"]);
  });
});

describe("page-vision-pass-nivel1-schema", () => {
  it("cap contentTitles a 20 en normalize", () => {
    const normalized = normalizeSlimPageRaw({
      pageTag: "PV-P3",
      pageNumber: 3,
      logoInstances: [],
      brandNameEvidence: [],
      contentTitles: Array.from({ length: 30 }, (_, i) => ({
        text: `Titulo ${i}`,
        kind: "titulo_obra",
      })),
      typographyRoles: [],
      pageKind: "indice",
    }) as { contentTitles: Array<{ text: string }> };
    expect(normalized.contentTitles).toHaveLength(20);
  });

  it("descarta seccion_documento en normalize", () => {
    const entries = normalizeContentTitleEntries(
      [
        { text: "1. Carta del Presidente", kind: "seccion_documento" },
        { text: "Física o Química", kind: "titulo_obra" },
      ],
      20,
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]?.text).toBe("Física o Química");
  });

  it("coerce strings legacy a titulo_obra", () => {
    const normalized = normalizeSlimPageRaw({
      pageTag: "PV-P3",
      pageNumber: 3,
      logoInstances: [],
      brandNameEvidence: [],
      contentTitles: ["DRAMA / THRILLER"],
      typographyRoles: [],
      pageKind: "indice",
    }) as { contentTitles: Array<{ text: string; kind: string }> };
    expect(normalized.contentTitles[0]?.kind).toBe("titulo_obra");
  });

  it("enriquece índice desde typographyRoles cuando bne y contentTitles vacíos", () => {
    const enriched = enrichIndexBrandNameEvidenceFromTypography({
      pageKind: "indice",
      brandNameEvidence: [],
      typographyRoles: [
        {
          role: "cuerpo",
          sampleText: "LAS HIJAS DE LA CRIADA",
          styleObserved: "sans",
          bbox: [0.08, 0.07, 0.49, 0.08],
        },
      ],
      contentTitles: [],
    });
    expect(enriched.some((e) => e.kind === "lista_indice")).toBe(true);
  });

  it("valida página slim con contentTitles tipados y BNE emisor", () => {
    const out = validateNivel1SlimPage(
      {
        pageTag: "PV-P1",
        pageNumber: 1,
        logoInstances: [
          {
            variant: "horizontal",
            onBackground: "oscuro",
            textInLogo: "OARO",
            isComplete: true,
            cutEdges: [],
            confidence: 0.9,
            bbox: [0.1, 0.05, 0.3, 0.1],
          },
        ],
        brandNameEvidence: [
          {
            text: "OARO",
            kind: "wordmark_logo",
            bbox: [0.1, 0.05, 0.3, 0.1],
          },
        ],
        contentTitles: [],
        typographyRoles: [{ role: "display", bbox: [0.1, 0.5, 0.4, 0.7] }],
        pageKind: "portada",
      },
      { pageNumber: 1 },
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.images).toHaveLength(0);
  });

  it("arbitraje descarta seccion_documento de contentNames", () => {
    const audit = {
      pages: [
        {
          pageNumber: 2,
          ok: true,
          result: {
            version: "2026-07-07-page-structured-5",
            page: 2,
            logoInstances: [],
            brandNameEvidence: [],
            contentTitles: [
              { text: "1. Carta del Presidente", kind: "seccion_documento" },
              { text: "LAS HIJAS DE LA CRIADA", kind: "titulo_obra" },
            ],
            typographyRoles: [],
            brandSurfaces: [],
            images: [],
            pageKind: "ficha_contenido",
          },
        },
      ],
    } as PageVisionPassRunAudit;
    const arb = arbitrateBrandIdentity(audit);
    expect(arb.contentNames).toEqual(["LAS HIJAS DE LA CRIADA"]);
  });

  it("arbitraje descarta titulo_obra suelto en pageKind unknown", () => {
    const audit = {
      pages: [
        {
          pageNumber: 4,
          ok: true,
          result: {
            version: "2026-07-07-page-structured-5",
            page: 4,
            logoInstances: [],
            brandNameEvidence: [],
            contentTitles: [{ text: "Carta del Presidente", kind: "titulo_obra" }],
            typographyRoles: [],
            brandSurfaces: [],
            images: [],
            pageKind: "unknown",
          },
        },
      ],
    } as PageVisionPassRunAudit;
    expect(arbitrateBrandIdentity(audit).contentNames).toEqual([]);
  });
});
