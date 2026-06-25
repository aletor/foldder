import { describe, expect, it } from "vitest";
import type { InspirationResult } from "@/lib/inspiration/inspiration-shared";
import {
  buildInspirationFeed,
  createEmptyFeedEntry,
  dedupeKeyForResult,
  inspirationFeedKey,
  passesQuality,
  type InspirationFeedEntry,
} from "./inspiration-feed";

function result(over: Partial<InspirationResult> & { id: string }): InspirationResult {
  return {
    source: "Pexels",
    imageUrl: `https://img/${over.id}.jpg`,
    thumbUrl: `https://img/${over.id}-thumb.jpg`,
    width: 1600,
    height: 1200,
    ...over,
  };
}

function entryWith(bySource: InspirationFeedEntry["bySource"]): InspirationFeedEntry {
  const base = createEmptyFeedEntry("query", "similar", "prompt");
  return { ...base, bySource };
}

describe("inspirationFeedKey", () => {
  it("es estable para la misma consulta normalizada e ignora mayúsculas/espacios", () => {
    const a = inspirationFeedKey({ query: "  Red SHOES  ", facet: "style", inputKind: "prompt" });
    const b = inspirationFeedKey({ query: "red shoes", facet: "style", inputKind: "prompt" });
    expect(a).toBe(b);
  });

  it("cambia con la faceta", () => {
    const a = inspirationFeedKey({ query: "red shoes", facet: "style", inputKind: "prompt" });
    const b = inspirationFeedKey({ query: "red shoes", facet: "colors", inputKind: "prompt" });
    expect(a).not.toBe(b);
  });
});

describe("passesQuality", () => {
  it("descarta imágenes pequeñas", () => {
    expect(passesQuality(result({ id: "small", width: 320, height: 240 }))).toBe(false);
  });

  it("descarta proporciones extremas (tiras/banners)", () => {
    expect(passesQuality(result({ id: "banner", width: 4000, height: 600 }))).toBe(false);
  });

  it("acepta imágenes grandes con proporción razonable", () => {
    expect(passesQuality(result({ id: "ok", width: 1600, height: 1200 }))).toBe(true);
  });

  it("acepta cuando no hay dimensiones fiables (no penaliza a Are.na)", () => {
    expect(passesQuality(result({ id: "nodims", width: undefined, height: undefined }))).toBe(true);
  });
});

describe("dedupeKeyForResult", () => {
  it("ignora la query string del proveedor para detectar la misma foto en distintos tamaños", () => {
    const a = result({ id: "a", imageUrl: "https://cdn/photo.jpg?w=400&h=300" });
    const b = result({ id: "b", imageUrl: "https://cdn/photo.jpg?w=1600&h=1200" });
    expect(dedupeKeyForResult(a)).toBe(dedupeKeyForResult(b));
  });
});

describe("buildInspirationFeed", () => {
  it("mezcla las fuentes en round-robin", () => {
    const entry = entryWith({
      pexels: [result({ id: "p1" }), result({ id: "p2" })],
      unsplash: [result({ id: "u1", source: "Unsplash" })],
      arena: [result({ id: "a1", source: "Are.na" })],
    });
    const feed = buildInspirationFeed(entry, {});
    // round-robin: p1, u1, a1, p2
    expect(feed.map((r) => r.id)).toEqual(["p1", "u1", "a1", "p2"]);
  });

  it("respeta las fuentes activadas", () => {
    const entry = entryWith({
      pexels: [result({ id: "p1" })],
      unsplash: [result({ id: "u1", source: "Unsplash" })],
    });
    const feed = buildInspirationFeed(entry, { providers: ["unsplash"] });
    expect(feed.map((r) => r.id)).toEqual(["u1"]);
  });

  it("aplica el filtro de calidad cuando qualityOnly está activo", () => {
    const entry = entryWith({
      pexels: [result({ id: "good" }), result({ id: "tiny", width: 100, height: 100 })],
    });
    expect(buildInspirationFeed(entry, { qualityOnly: true }).map((r) => r.id)).toEqual(["good"]);
    expect(buildInspirationFeed(entry, { qualityOnly: false }).map((r) => r.id)).toEqual([
      "good",
      "tiny",
    ]);
  });

  it("deduplica entre fuentes la misma imagen", () => {
    const entry = entryWith({
      pexels: [result({ id: "p", imageUrl: "https://cdn/x.jpg?w=400" })],
      unsplash: [result({ id: "u", source: "Unsplash", imageUrl: "https://cdn/x.jpg?w=1600" })],
    });
    const feed = buildInspirationFeed(entry, {});
    expect(feed).toHaveLength(1);
  });
});
