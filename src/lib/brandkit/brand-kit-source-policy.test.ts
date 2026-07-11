import { describe, expect, it } from "vitest";
import { createEmptyBrandKit } from "./brand-kit-defaults";
import { mergeSlotStreamPatch } from "./brand-kit-stream-merge";
import {
  applyLockedSlotPolicy,
  setSourceAuthoritative,
  isAuthoritativeProvenance,
} from "./brand-kit-source-policy";
import { rankLogoCandidatesMultiSource } from "./brand-kit-visual-rank";

describe("setSourceAuthoritative", () => {
  it("keeps only one authoritative source", () => {
    let doc = createEmptyBrandKit();
    doc = {
      ...doc,
      sources: [
        { kind: "url", ref: "https://a.test", ts: "1" },
        { kind: "file", ref: "brandbook.pdf", ts: "2" },
      ],
    };
    doc = setSourceAuthoritative(doc, "brandbook.pdf", true);
    expect(doc.sources.find((s) => s.ref === "brandbook.pdf")?.authoritative).toBe(true);
    expect(doc.sources.find((s) => s.ref === "https://a.test")?.authoritative).toBeFalsy();
  });
});

describe("applyLockedSlotPolicy", () => {
  it("stores supplemental evidence without changing resolved value", () => {
    const current = {
      ...createEmptyBrandKit().slots.voice,
      status: "resolved" as const,
      locked: true,
      value: {
        summary: "Voz cercana",
        descriptors: ["cercano"],
        rules: [],
        avoid: [],
        evidence: [{ quote: "Hola mundo" }],
      },
      confidence: 0.9,
    };
    const next = applyLockedSlotPolicy(
      "voice",
      current,
      {
        status: "resolved",
        value: {
          summary: "Voz institucional",
          descriptors: ["formal"],
          rules: [],
          avoid: [],
          evidence: [{ quote: "Estimados accionistas" }, { quote: "Hola mundo" }],
        },
        provenance: { type: "file_upload", detail: "brandbook.pdf" },
      },
      [{ kind: "file", ref: "brandbook.pdf", ts: "1" }],
    );

    expect((next.value as { summary: string }).summary).toBe("Voz cercana");
    expect(next.supplementalEvidence).toHaveLength(1);
    expect(next.supplementalEvidence?.[0]?.quote).toBe("Estimados accionistas");
  });

  it("archives logo candidates when locked", () => {
    const current = {
      ...createEmptyBrandKit().slots.logo,
      status: "resolved" as const,
      locked: true,
      value: {
        assetId: "logo-a",
        previewUrl: "/a.png",
        format: "png" as const,
        width: 100,
        height: 100,
        background: "transparent" as const,
        variants: [],
      },
    };
    const next = applyLockedSlotPolicy(
      "logo",
      current,
      {
        candidates: [
          {
            value: {
              assetId: "logo-b",
              previewUrl: "/b.svg",
              format: "svg" as const,
              width: 100,
              height: 100,
              background: "transparent" as const,
              variants: [],
            },
            score: 0.9,
            provenance: { type: "jsonld", detail: "logo" },
          },
        ],
      },
      [],
    );
    expect(next.archivedCandidates).toHaveLength(1);
    expect((next.archivedCandidates?.[0]?.value as { assetId: string }).assetId).toBe("logo-b");
  });
});

describe("authoritative ranking", () => {
  it("boosts logo candidates from authoritative source", () => {
    const sources = [{ kind: "file" as const, ref: "brandbook.pdf", ts: "1", authoritative: true }];
    const ranked = rankLogoCandidatesMultiSource(
      [
        {
          score: 0.8,
          provenance: { type: "header_img", detail: "header", sourceUrl: "https://web.test" },
          value: {
            assetId: "web",
            previewUrl: "https://web.test/logo.png",
            format: "png",
            width: 100,
            height: 40,
            background: "transparent",
            variants: [],
          },
        },
        {
          score: 0.78,
          provenance: { type: "file_upload", detail: "pdf", sourceUrl: "brandbook.pdf" },
          value: {
            assetId: "pdf",
            previewUrl: "https://cdn.test/logo.svg",
            format: "svg",
            width: 100,
            height: 40,
            background: "transparent",
            variants: [],
          },
        },
      ],
      sources,
    );

    expect(isAuthoritativeProvenance(sources, ranked[0]?.provenance)).toBe(true);
    expect(ranked[0]?.rankSignals).toEqual(expect.arrayContaining(["fuente autoritativa"]));
  });
});

describe("mergeSlotStreamPatch locked", () => {
  it("applies locked policy instead of ignoring patch", () => {
    const current = {
      ...createEmptyBrandKit().slots.voice,
      status: "resolved" as const,
      locked: true,
      value: {
        summary: "Voz confirmada",
        descriptors: [],
        rules: [],
        avoid: [],
        evidence: [],
      },
    };
    const merged = mergeSlotStreamPatch(
      "voice",
      current,
      {
        status: "resolved",
        value: {
          summary: "Otra voz",
          descriptors: [],
          rules: [],
          avoid: [],
          evidence: [{ quote: "Nueva cita de respaldo" }],
        },
      },
      { respectLocks: true, sources: [] },
    );
    expect(merged?.supplementalEvidence).toHaveLength(1);
    expect((merged?.value as { summary: string }).summary).toBe("Voz confirmada");
  });
});
