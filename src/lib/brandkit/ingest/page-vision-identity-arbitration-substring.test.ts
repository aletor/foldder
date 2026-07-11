import { describe, expect, it } from "vitest";
import {
  arbitrateBrandIdentity,
  buildWordmarkStats,
  decideSubstringDegrades,
  degradeProductLineWordmarks,
  isWordBoundedEmitterSubstring,
  pickEmitterWordmark,
} from "./page-vision-identity-arbitration";
import type { PageVisionPassRunAudit } from "./page-vision-pass-runner";

const wm = (text: string, pageNumber: number) => ({
  text,
  kind: "wordmark_logo" as const,
  pageNumber,
  classification: "emitter_wordmark" as const,
});

describe("salvaguarda subcadena — límite de palabra", () => {
  it("OARO ⊂ OARO IDENTITY® con límite de palabra", () => {
    expect(isWordBoundedEmitterSubstring("OARO", "OARO IDENTITY®")).toBe(true);
  });

  it("MEDIA no es subcadena con límite de palabra en ATRESMEDIA", () => {
    expect(isWordBoundedEmitterSubstring("MEDIA", "ATRESMEDIA")).toBe(false);
  });

  it("OARO/OARO IDENTITY® degrada la línea de producto cuando domina frecuencia", () => {
    const wordmarks = [wm("OARO", 1), wm("OARO", 16), wm("OARO IDENTITY®", 4)];
    const stats = buildWordmarkStats(wordmarks);
    const decision = decideSubstringDegrades(stats);
    expect(decision.conflict).toBe(false);
    expect(decision.degradeTexts).toContain("OARO IDENTITY®");
    expect(pickEmitterWordmark(wordmarks)).toBe("OARO");
    expect(degradeProductLineWordmarks(wordmarks, "OARO")).toContain("OARO IDENTITY®");
  });

  it("empate 1-1 → ámbar, no degrada", () => {
    const wordmarks = [wm("OARO", 1), wm("OARO IDENTITY®", 4)];
    const stats = buildWordmarkStats(wordmarks);
    const decision = decideSubstringDegrades(stats);
    expect(decision.conflict).toBe(true);
    expect(decision.degradeTexts).toHaveLength(0);
    const audit = {
      pages: [
        { pageNumber: 1, ok: true, result: { brandNameEvidence: [{ text: "OARO", kind: "wordmark_logo" }] } },
        {
          pageNumber: 4,
          ok: true,
          result: { brandNameEvidence: [{ text: "OARO IDENTITY®", kind: "wordmark_logo" }] },
        },
      ],
    } as PageVisionPassRunAudit;
    const result = arbitrateBrandIdentity(audit);
    expect(result.arbitrationStatus).toBe("conflict");
    expect(result.contentNames.some((n) => n.includes("IDENTITY"))).toBe(false);
  });
});
