import { describe, expect, it } from "vitest";
import {
  classifyModelBboxTuple,
  isViableLogoHarvestBbox,
  normalizeModelBboxTuple,
} from "../ingest/page-vision-pass-bbox";
import { loadLatestAuditByPrefix } from "./load-audit";
import { LOGO_LAB_FIXTURES } from "./fixtures";

describe("classifyModelBboxTuple", () => {
  it("OARO/ESADE/Randstad encajan xywh_legacy", () => {
    expect(classifyModelBboxTuple([0.09, 0.1, 0.15, 0.12])).toBe("xywh_legacy");
    expect(classifyModelBboxTuple([0.049, 0.17, 0.238, 0.194])).toBe("xywh_legacy");
    expect(classifyModelBboxTuple([0.02, 0.05, 0.08, 0.1])).toBe("xywh_legacy");
  });

  it("Atresmedia esquina queda xyxy_literal (xywh no cabe)", () => {
    expect(classifyModelBboxTuple([0.808, 0.864, 0.949, 0.894])).toBe("xyxy_literal");
  });
});

describe("normalizeModelBboxTuple", () => {
  it("conserva orden literal [x1,y1,x2,y2] sin intercambio de ejes", () => {
    const parsed = normalizeModelBboxTuple([0.808, 0.864, 0.949, 0.894]);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect([...parsed.bbox]).toEqual([0.808, 0.864, 0.949, 0.894]);
  });

  it("divide escala 0–1000 antes de validar", () => {
    const parsed = normalizeModelBboxTuple([864, 808, 949, 894]);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect([...parsed.bbox]).toEqual([0.864, 0.808, 0.949, 0.894]);
  });

  it("no convierte xyxy válido en esquina inferior (Atresmedia)", () => {
    const parsed = normalizeModelBboxTuple([0.808, 0.864, 0.949, 0.894]);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect([...parsed.bbox]).toEqual([0.808, 0.864, 0.949, 0.894]);
  });

  it("convierte xywh legacy sospechoso a xyxy (OARO p1)", () => {
    const parsed = normalizeModelBboxTuple([0.09, 0.1, 0.15, 0.12]);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect([...parsed.bbox]).toEqual([0.09, 0.1, 0.24, 0.22]);
  });

  it("convierte xywh legacy sospechoso a xyxy (ESADE p1)", () => {
    const parsed = normalizeModelBboxTuple([0.049, 0.17, 0.238, 0.194]);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect([...parsed.bbox]).toEqual([0.049, 0.17, 0.287, 0.364]);
  });
  it("no escala tuplas 0–1 con un eje >1 (fuera de rango)", () => {
    const parsed = normalizeModelBboxTuple([0.9, 0.02, 1.05, 0.09]);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.reason).toBe("bbox_out_of_range");
  });

  it("escala mixta 0–1000 sin dividir ejes ya normalizados (BULLS-like)", () => {
    const parsed = normalizeModelBboxTuple([0.79, 79, 2.52, 252]);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.bbox[2] - parsed.bbox[0]).toBeGreaterThan(0.05);
    expect((parsed.bbox[2] - parsed.bbox[0]) * (parsed.bbox[3] - parsed.bbox[1])).toBeGreaterThan(0.01);
  });

  it("repara tuplas corruptas por /1000 global previo", () => {
    const parsed = normalizeModelBboxTuple([0.00079, 0.079, 0.00252, 0.252]);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.bbox[2] - parsed.bbox[0]).toBeGreaterThan(0.005);
  });
});

describe("logo-lab audits", () => {
  it("carga el último audit para los 4 fixtures de regresión", () => {
    for (const fixture of LOGO_LAB_FIXTURES) {
      const audit = loadLatestAuditByPrefix(fixture.auditPrefix);
      expect(audit, fixture.id).not.toBeNull();
      expect(audit!.contentSha256.startsWith(fixture.auditPrefix)).toBe(true);
      expect(audit!.selectedPages.length).toBeGreaterThan(0);
    }
  });
});
