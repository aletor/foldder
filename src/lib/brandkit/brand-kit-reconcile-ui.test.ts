import { describe, expect, it } from "vitest";
import {
  buildReconcileOptionDetail,
  bulletsUniqueToOption,
  chipsUniqueToOption,
  isGenericReconcileSummary,
} from "./brand-kit-reconcile-ui";

describe("brand-kit-reconcile-ui", () => {
  it("detects generic placeholder summaries", () => {
    expect(isGenericReconcileSummary("Voz inferida del corpus web; revisa la síntesis generada.")).toBe(true);
    expect(isGenericReconcileSummary("Opción generada por IA — revisa la síntesis antes de confirmar.")).toBe(true);
    expect(isGenericReconcileSummary("Voz directa y cercana para la marca.")).toBe(false);
  });

  it("builds voice detail with full rules list", () => {
    const detail = buildReconcileOptionDetail("voice", {
      summary: "Voz directa",
      descriptors: ["Clara", "Cercana"],
      rules: ["Frases cortas", "Segunda persona"],
      avoid: ["Jerga vacía"],
      evidence: [],
    });
    expect(detail.chips).toEqual(["Clara", "Cercana"]);
    expect(detail.bullets).toEqual(["Frases cortas", "Segunda persona"]);
    expect(detail.avoid).toEqual(["Jerga vacía"]);
  });

  it("shows essence headline instead of generic summary", () => {
    const detail = buildReconcileOptionDetail("essence", {
      summary: "Opción generada por IA — revisa la síntesis antes de confirmar.",
      headline: "Identidad digital que conecta y simplifica tu mundo.",
      beliefs: [{ label: "Trust" }, { label: "Security" }],
      evidence: [],
    });
    expect(detail.summary).toBe("");
    expect(detail.headline).toBe("Identidad digital que conecta y simplifica tu mundo.");
    expect(detail.chips).toEqual(["Trust", "Security"]);
  });

  it("synthesizes voice summary from descriptors when placeholder", () => {
    const detail = buildReconcileOptionDetail("voice", {
      summary: "Voz inferida del corpus web; revisa la síntesis generada.",
      descriptors: ["Tecnológico", "Seguro", "Eficiente"],
      rules: ["Usar datos verificables", "Evitar alarmismo"],
      avoid: [],
      evidence: [],
    });
    expect(detail.summary).toContain("Tecnológico");
    expect(detail.summaryIsSynthetic).toBe(true);
    expect(detail.bullets).toHaveLength(2);
  });

  it("builds visual world detail with separate traits and limits", () => {
    const detail = buildReconcileOptionDetail("visualWorld", {
      summary: "Mundo visual seguro y moderno.",
      moodTags: ["Tecnológico", "Limpio"],
      visualTraits: ["Fotografía con luz fría"],
      limits: ["Evitar clipart"],
      evidence: [],
      galleryRefs: [],
    });
    expect(detail.visualTraits).toEqual(["Fotografía con luz fría"]);
    expect(detail.limits).toEqual(["Evitar clipart"]);
    expect(detail.chipsLabel).toBe("mood");
  });

  it("marks chips and bullets unique to one option", () => {
    expect([...chipsUniqueToOption(["A", "B"], ["B", "C"])]).toEqual(["A"]);
    expect([...bulletsUniqueToOption(["R1"], ["R2"])]).toEqual(["R1"]);
  });
});
