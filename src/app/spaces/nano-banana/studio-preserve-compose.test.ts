import { describe, expect, it } from "vitest";
import { preserveComposeEligibility, resolveComposeImageSource, summarizeComposeOutcome } from "./studio-preserve-compose";
import { createStudioCard, emptyStudioGlobal, type StudioCard } from "./studio-types";

function lasso(): { x: number; y: number }[] {
  const pts = [];
  for (let i = 0; i <= 40; i++) pts.push({ x: 10 + i, y: 10 });
  for (let i = 0; i <= 40; i++) pts.push({ x: 50, y: 10 + i });
  for (let i = 0; i <= 40; i++) pts.push({ x: 50 - i, y: 50 });
  for (let i = 0; i <= 40; i++) pts.push({ x: 10, y: 50 - i });
  return pts;
}

function localCard(overrides: Partial<StudioCard> = {}): StudioCard {
  return { ...createStudioCard(0), description: "añadir sombrero", lassoPoints: lasso(), paintData: "data:image/png;base64,AAAA", ...overrides };
}

describe("preserveComposeEligibility · solo generaciones puramente locales", () => {
  const base = "/api/spaces/s3-file?key=knowledge-files%2Fuser-assets%2Fabc%2Fgenerated%2Fx.png";

  it("acepta cards descritas con lazo y sin instrucción global", () => {
    expect(preserveComposeEligibility({ baseImage: base, cards: [localCard()], global: emptyStudioGlobal() })).toEqual({ ok: true });
  });

  it("acepta una card con lazo pero sin paintData hidratado", () => {
    expect(preserveComposeEligibility({ baseImage: base, cards: [localCard({ paintData: null })], global: emptyStudioGlobal() })).toEqual({ ok: true });
  });

  it("rechaza sin base, con texto global, con esquema o con card sin zona", () => {
    expect(preserveComposeEligibility({ baseImage: null, cards: [localCard()], global: emptyStudioGlobal() }).ok).toBe(false);
    expect(
      preserveComposeEligibility({ baseImage: base, cards: [localCard()], global: { ...emptyStudioGlobal(), text: "hazlo nocturno" } }).ok,
    ).toBe(false);
    expect(
      preserveComposeEligibility({ baseImage: base, cards: [localCard()], global: { ...emptyStudioGlobal(), schemaData: "data:image/png;base64,AA" } }).ok,
    ).toBe(false);
    expect(
      preserveComposeEligibility({
        baseImage: base,
        cards: [localCard(), localCard({ id: "c2", lassoPoints: [], paintData: null, description: "más luz" })],
        global: emptyStudioGlobal(),
      }).ok,
    ).toBe(false);
  });

  it("ignora cards vacías (sin descripción ni referencias)", () => {
    const empty = { ...createStudioCard(1), lassoPoints: lasso() };
    expect(preserveComposeEligibility({ baseImage: base, cards: [localCard(), empty], global: emptyStudioGlobal() })).toEqual({ ok: true });
    expect(preserveComposeEligibility({ baseImage: base, cards: [empty], global: emptyStudioGlobal() }).ok).toBe(false);
  });
});

describe("resolveComposeImageSource", () => {
  it("prefiere la clave S3 embebida en la URL y acepta data URLs", async () => {
    await expect(
      resolveComposeImageSource("/api/spaces/s3-file?key=knowledge-files%2Fuser-assets%2Fabc%2Fgenerated%2Fx.png"),
    ).resolves.toEqual({ key: "knowledge-files/user-assets/abc/generated/x.png" });
    await expect(resolveComposeImageSource("data:image/png;base64,AAAA")).resolves.toEqual({ dataUrl: "data:image/png;base64,AAAA" });
    await expect(resolveComposeImageSource(null)).resolves.toBeNull();
  });
});

describe("summarizeComposeOutcome", () => {
  it("reduce el resultado a datos persistibles", () => {
    const summary = summarizeComposeOutcome({
      composed: true,
      output: "/api/spaces/s3-file?key=k",
      key: "k",
      decision: "compose",
      reason: null,
      maskPreview: "data:image/png;base64,AA",
      timeMs: 900,
      stats: {
        decision: "compose",
        reason: null,
        changedFraction: 0.0634,
        rawChangedFraction: 0.05,
        priorFraction: 0.02,
        componentsKept: 1,
        componentsDropped: 2,
        noiseFloor: 0.1,
        toneGain: [1, 1, 1],
        toneOffset: [0, 0, 0],
        shift: { dx: 0, dy: 0 },
        ringRadiusPx: 24,
        analysisWidth: 1024,
        analysisHeight: 576,
      },
    });
    expect(summary).toEqual({ composed: true, decision: "compose", reason: null, changedPct: 6.3, componentsKept: 1, componentsDropped: 2 });
  });
});
