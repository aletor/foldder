import { describe, expect, it } from "vitest";
import { assessWordmarkIntegrityStatus, nativeAssetAllowsVectorize, wordmarkIntegrityPasses } from "./logo-crown-policy";

describe("logo-crown-policy", () => {
  it("bloquea vectorize para vector_native", () => {
    expect(nativeAssetAllowsVectorize("vector_native")).toBe(false);
    expect(nativeAssetAllowsVectorize("xobject_native")).toBe(true);
    expect(nativeAssetAllowsVectorize("render_crop")).toBe(true);
  });

  it("wordmarkIntegrityPasses exige señal ✓", () => {
    expect(
      wordmarkIntegrityPasses([{ kind: "wordmark-integrity", detail: "wordmark integrity ✓ · ATRESMEDIA SALES" }]),
    ).toBe(true);
    expect(wordmarkIntegrityPasses([{ kind: "wordmark-integrity", detail: "faltan glifos [I]" }])).toBe(false);
  });

  it("assessWordmarkIntegrityStatus tri-estado", () => {
    expect(assessWordmarkIntegrityStatus("xobject_native", [])).toBe("not_applicable_raster");
    expect(
      assessWordmarkIntegrityStatus("vector_native", [
        { kind: "wordmark-integrity", detail: "wordmark integrity ✓ · OARO" },
      ]),
    ).toBe("ok");
    expect(
      assessWordmarkIntegrityStatus("vector_native", [
        { kind: "wordmark-integrity", detail: "faltan glifos [I]" },
      ]),
    ).toBe("failed");
  });
});
