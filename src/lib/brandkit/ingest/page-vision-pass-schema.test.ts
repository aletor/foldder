import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertNoPromptAnchoringInOutput,
  collectPromptAnchoringViolations,
  SYNTHETIC_EMPTY_PAGE_VISION_MODEL_OUTPUT,
} from "./page-vision-pass-anchoring";
import {
  bboxOverlapRatioXYXY,
  bboxXYXYSchema,
  convertLegacyXYWHToXYXY,
  suspectedLegacyXYWH,
} from "./page-vision-pass-bbox";
import {
  validatePageVisionPass,
  type PageVisionPassResult,
} from "./page-vision-pass-schema";
import { guaranteedVisionPageNumbers, selectPageVisionPassPages } from "./page-vision-pass-selection";
import { selectNivel1GuaranteedVisionPages } from "./page-vision-prepass";
import {
  buildPageVisionPassUserPrompt,
  canonicalPageVisionPassPromptText,
  PAGE_VISION_PASS_PROMPT_SHA256,
  PAGE_VISION_PASS_SYSTEM_INSTRUCTION,
} from "./page-vision-pass-prompt";
import {
  BRAND_KIT_PAGE_VISION_PASS_VERSION,
  PAGE_VISION_PASS_DPI,
  PAGE_VISION_PASS_GEMINI_SEED,
  pageVisionPassCacheKey,
} from "./page-vision-pass-version";

const FIXTURES_DIR = path.join(__dirname, "fixtures/page-vision-pass");
const PAGE = 2;

function loadGolden(name: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, name), "utf8"));
}

function modelPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    logoInstances: [
      {
        bbox: [0.06, 0.02, 0.28, 0.09],
        variant: "horizontal",
        onBackground: "oscuro",
        textInLogo: "MARCA-EJEMPLO",
        isComplete: true,
        cutEdges: [],
        confidence: 0.93,
      },
    ],
    brandNameEvidence: [
      {
        text: "dominio-ejemplo.invalid",
        kind: "dominio_pie",
        bbox: [0.3, 0.96, 0.7, 0.985],
      },
    ],
    typographyRoles: [],
    brandSurfaces: [[0, 0.9, 1, 1]],
    images: [
      {
        bbox: [0.05, 0.1, 0.48, 0.55],
        visualDna: {
          sujeto: "descripción de sujeto de muestra",
          ropa: "unknown",
          lugar: "entorno de muestra",
          animo: "unknown",
          estiloArtistico: "unknown",
          encuadre: "unknown",
          luzTratamiento: "unknown",
          paletaAprox: ["#000001", "unknown"],
          texturas: "unknown",
          vozVisual: "unknown",
        },
        esFotoDeProducto: true,
        confidence: 0.88,
      },
    ],
    pageKind: "ficha_contenido",
    ...overrides,
  };
}

function validateModel(raw: unknown, pageNumber = PAGE) {
  return validatePageVisionPass(raw, { pageNumber });
}

describe("bboxXYXYSchema", () => {
  it("bbox degenerado no lanza excepción — safeParse falla limpio", () => {
    const parsed = bboxXYXYSchema.safeParse([0.3, 0.4, 0.0, 0.5]);
    expect(parsed.success).toBe(false);
  });

  it("bbox degenerado en instancia → rejected[], página ok:true", () => {
    const out = validateModel(
      modelPayload({
        logoInstances: [
          {
            bbox: [0.3, 0.4, 0.0, 0.5],
            variant: "horizontal",
            onBackground: "claro",
            textInLogo: "unknown",
            isComplete: true,
            cutEdges: [],
            confidence: 0.5,
          },
        ],
      }),
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.logoInstances).toHaveLength(0);
    expect(out.rejected.some((r) => r.detail === "bbox_degenerate")).toBe(true);
  });
});

describe("page-vision-pass-schema", () => {
  it("acepta contrato válido xyxy y estampa version/page", () => {
    const out = validateModel(modelPayload());
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.version).toBe(BRAND_KIT_PAGE_VISION_PASS_VERSION);
    expect(out.result.page).toBe(PAGE);
    expect(out.result.logoInstances).toHaveLength(1);
    expect(out.rejected).toHaveLength(0);
  });

  it("eco page erróneo del modelo → warning soft, página ok", () => {
    const out = validateModel({ ...modelPayload(), page: 11 });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.page).toBe(PAGE);
    expect(out.warnings.some((w) => w.type === "page_echo_mismatch")).toBe(true);
  });

  it("pageKind desconocido → unknown (normalizado)", () => {
    const out = validateModel({ ...modelPayload(), pageKind: "separador" });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.pageKind).toBe("unknown");
  });

  it("normaliza pageKind inglés del batch", () => {
    const out = validateModel({ ...modelPayload(), pageKind: "cover" });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.pageKind).toBe("portada");
  });

  it("confidence ausente rechaza instancia de logo", () => {
    const raw = modelPayload();
    const logos = (raw.logoInstances as Record<string, unknown>[]).map(({ confidence: _c, ...rest }) => rest);
    const out = validateModel({ ...raw, logoInstances: logos });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.logoInstances).toHaveLength(0);
  });

  it("isComplete true + cutEdges → normaliza isComplete false en result + warning", () => {
    const out = validateModel(
      modelPayload({
        logoInstances: [
          {
            bbox: [0.06, 0.02, 0.28, 0.09],
            variant: "horizontal",
            onBackground: "oscuro",
            textInLogo: "X",
            isComplete: true,
            cutEdges: ["left"],
            confidence: 0.9,
          },
        ],
      }),
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.logoInstances).toHaveLength(1);
    expect(out.result.logoInstances[0]?.isComplete).toBe(false);
    expect(out.rejected).toHaveLength(0);
    expect(out.warnings).toEqual([
      {
        type: "consistency_normalized",
        section: "logoInstances",
        field: "isComplete",
        instanceIndex: 0,
      },
    ]);
  });

  it("visualDna todo unknown parsea OK", () => {
    const out = validateModel(
      modelPayload({
        images: [
          {
            bbox: [0.1, 0.1, 0.5, 0.5],
            visualDna: {
              sujeto: "unknown",
              ropa: "unknown",
              lugar: "unknown",
              animo: "unknown",
              estiloArtistico: "unknown",
              encuadre: "unknown",
              luzTratamiento: "unknown",
              paletaAprox: ["unknown"],
              texturas: "unknown",
              vozVisual: "unknown",
            },
            esFotoDeProducto: false,
            confidence: 0.4,
          },
        ],
      }),
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.images).toHaveLength(1);
  });

  it("legacy xywh footer (y2<y1) se convierte a xyxy", () => {
    const out = validateModel(
      modelPayload({
        logoInstances: [],
        brandNameEvidence: [
          {
            text: "dominio-ejemplo.invalid",
            kind: "dominio_pie",
            bbox: [0.3, 0.96, 0.4, 0.025],
          },
        ],
      }),
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.brandNameEvidence).toHaveLength(1);
    expect([...out.result.brandNameEvidence[0].bbox]).toEqual([0.3, 0.96, 0.7, 0.985]);
    expect(suspectedLegacyXYWH([0.3, 0.96, 0.4, 0.025])).toBe(true);
  });

  it("legacy xywh se convierte en frontera xyxy", () => {
    expect(convertLegacyXYWHToXYXY(0.05, 0.1, 0.43, 0.45)).toEqual([0.05, 0.1, 0.48, 0.55]);
  });

  it("solapamiento >90% en brandNameEvidence desempata por área", () => {
    const out = validateModel(
      modelPayload({
        logoInstances: [],
        brandNameEvidence: [
          {
            text: "a",
            kind: "dominio_pie",
            bbox: [0.1, 0.9, 0.5, 0.98],
          },
          {
            text: "b",
            kind: "dominio_pie",
            bbox: [0.12, 0.91, 0.48, 0.97],
          },
        ],
      }),
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.brandNameEvidence).toHaveLength(1);
    expect(out.rejected.some((r) => r.reason === "bbox_overlap")).toBe(true);
  });

  it("salva contenido válido cuando una instancia de logo es mala", () => {
    const out = validateModel(
      modelPayload({
        brandNameEvidence: [],
        logoInstances: [
          {
            bbox: [0.06, 0.02, 0.28, 0.09],
            variant: "horizontal",
            onBackground: "oscuro",
            textInLogo: "OK",
            isComplete: true,
            cutEdges: [],
            confidence: 0.9,
          },
          {
            bbox: [0.9, 0.02, 1.05, 0.09],
            variant: "horizontal",
            onBackground: "claro",
            textInLogo: "BAD",
            isComplete: true,
            cutEdges: [],
            confidence: 0.5,
          },
        ],
      }),
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.logoInstances).toHaveLength(1);
    expect(out.result.brandNameEvidence).toHaveLength(1);
    expect(out.result.brandNameEvidence[0]?.kind).toBe("wordmark_logo");
    expect(out.result.brandNameEvidence[0]?.text).toBe("OK");
  });

  it("acepta pageKind asset_marca y otro", () => {
    for (const pageKind of ["asset_marca", "otro"] as const) {
      const out = validateModel(modelPayload({ pageKind, logoInstances: [], images: [] }));
      expect(out.ok).toBe(true);
      if (!out.ok) return;
      expect(out.result.pageKind).toBe(pageKind);
    }
  });
  it("enriquece wordmark_logo desde logoInstances si falta en brandNameEvidence", () => {
    const out = validateModel(
      modelPayload({
        brandNameEvidence: [],
        logoInstances: [
          {
            bbox: [0.06, 0.02, 0.28, 0.09],
            variant: "horizontal",
            onBackground: "oscuro",
            textInLogo: "MARCA-EJEMPLO",
            isComplete: true,
            cutEdges: [],
            confidence: 0.93,
          },
        ],
      }),
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.brandNameEvidence.some((e) => e.kind === "wordmark_logo")).toBe(true);
  });
});

describe("page-vision-pass-golden-fixtures", () => {
  it("oaro deck cover", () => {
    const out = validateModel(loadGolden("oaro-deck-cover.golden.json"), 1);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.pageKind).toBe("portada");
  });

  it("atresmedia catalog cover", () => {
    const out = validateModel(loadGolden("atresmedia-catalog-cover.golden.json"), 2);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.brandNameEvidence.some((e) => e.kind === "wordmark_logo")).toBe(true);
  });

  it("atresmedia ficha contenido con visualDna denso", () => {
    const out = validateModel(loadGolden("atresmedia-catalog-ficha.golden.json"), 24);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.pageKind).toBe("ficha_contenido");
    expect(out.result.images[0]?.visualDna.sujeto).not.toBe("unknown");
  });
});

describe("page-vision-pass-selection", () => {
  it("cobertura garantizada 130p", () => {
    expect(guaranteedVisionPageNumbers(130)).toEqual([1, 2, 3, 4, 128, 129, 130]);
  });

  it("Nivel 1 garantizado cap 5: portada + contraportada sin prepass", () => {
    expect(selectNivel1GuaranteedVisionPages({ totalPages: 130 })).toEqual([1, 2, 3, 4, 130]);
    expect(selectNivel1GuaranteedVisionPages({ totalPages: 17 })).toEqual([1, 2, 3, 4, 17]);
  });

  it("estima ~15–20 llamadas catálogo 130p / 4 plantillas", () => {
    const plan = selectPageVisionPassPages({
      totalPages: 130,
      templateClusters: [
        { clusterId: "a", pageNumbers: range(5, 40) },
        { clusterId: "b", pageNumbers: range(41, 80) },
        { clusterId: "c", pageNumbers: range(81, 120) },
        { clusterId: "d", pageNumbers: range(121, 127) },
      ],
      pagesPerCluster: 2,
    });
    expect(plan.estimatedCalls).toBeGreaterThanOrEqual(14);
    expect(plan.estimatedCalls).toBeLessThanOrEqual(20);
  });

  it("cache key incluye version y dpi fijo", () => {
    const key = pageVisionPassCacheKey("abc123", 5);
    expect(key).toContain(BRAND_KIT_PAGE_VISION_PASS_VERSION);
    expect(key).toContain(`dpi${PAGE_VISION_PASS_DPI}`);
  });

  it("gemini seed fijo distinto de cero", () => {
    expect(PAGE_VISION_PASS_GEMINI_SEED).toBeGreaterThan(0);
  });
});

describe("page-vision-pass-prompt", () => {
  it("candado anti-deriva: hash del prompt canónico", () => {
    const hash = crypto.createHash("sha256").update(canonicalPageVisionPassPromptText()).digest("hex");
    expect(hash).toBe(PAGE_VISION_PASS_PROMPT_SHA256);
  });

  it("prompt sin marcas reales del ejemplo antiguo", () => {
    const prompt = buildPageVisionPassUserPrompt({ pageNumber: 12, totalPages: 130 });
    expect(prompt).not.toContain("ATRESMEDIA SALES");
    expect(prompt).not.toContain("atresmediatv.com");
    expect(prompt).toContain("brandNameEvidence (OBLIGATORIO");
    expect(prompt).toContain("[x1, y1, x2, y2]");
  });

  it("página sintética vacía no contiene literales de anclaje", () => {
    const json = JSON.stringify(SYNTHETIC_EMPTY_PAGE_VISION_MODEL_OUTPUT);
    expect(() => assertNoPromptAnchoringInOutput(json)).not.toThrow();
    expect(collectPromptAnchoringViolations(json)).toHaveLength(0);
  });

  it("system instruction sin notas de ingeniería", () => {
    expect(PAGE_VISION_PASS_SYSTEM_INSTRUCTION).not.toContain("al cablear");
    expect(PAGE_VISION_PASS_SYSTEM_INSTRUCTION).not.toContain("temperature=0");
    expect(PAGE_VISION_PASS_SYSTEM_INSTRUCTION).toContain("unknown");
  });
});

function range(from: number, to: number): number[] {
  const out: number[] = [];
  for (let i = from; i <= to; i += 1) out.push(i);
  return out;
}
