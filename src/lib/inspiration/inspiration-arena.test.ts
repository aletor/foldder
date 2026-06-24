import { describe, expect, it } from "vitest";
import { normalizeArenaImageBlock } from "./arena-normalize";
import { fallbackArenaSearchTerms, sanitizeArenaTerms } from "./inspiration-arena-query";

describe("inspiration-arena-query", () => {
  it("sanitizes arena terms to short aesthetic tags", () => {
    expect(sanitizeArenaTerms("brutalism, concrete | grid")).toBe("brutalism concrete grid");
    expect(sanitizeArenaTerms('"editorial fashion" + studio')).toBe("editorial fashion studio");
  });

  it("builds fallback arena terms from intent and facet", () => {
    const terms = fallbackArenaSearchTerms("skate urban culture photography", "style");
    expect(terms.split(" ").length).toBeLessThanOrEqual(5);
    expect(terms).toContain("skate");
    expect(terms).toContain("aesthetic");
  });
});

describe("arena-api normalizeArenaImageBlock", () => {
  it("maps v2 Image blocks to inspiration results", () => {
    const result = normalizeArenaImageBlock({
      id: 9876,
      class: "Image",
      state: "available",
      title: "Brutalist facade",
      user: { full_name: "Jane Doe", username: "jane" },
      image: {
        width: 1600,
        height: 900,
        large: { url: "https://cdn.example/large.jpg" },
        thumb: { url: "https://cdn.example/thumb.jpg" },
      },
    });

    expect(result?.source).toBe("Are.na");
    expect(result?.id).toBe("arena-9876");
    expect(result?.imageUrl).toBe("https://cdn.example/large.jpg");
    expect(result?.thumbUrl).toBe("https://cdn.example/thumb.jpg");
    expect(result?.author).toBe("Jane Doe");
    expect(result?.sourceUrl).toBe("https://www.are.na/block/9876");
  });

  it("maps v3 Image blocks to inspiration results", () => {
    const result = normalizeArenaImageBlock({
      id: 12345,
      type: "Image",
      state: "available",
      title: "Concrete study",
      user: { full_name: "Ada Lovelace", username: "ada" },
      _links: { self: { href: "https://api.are.na/v3/blocks/12345" } },
      image: {
        width: 1200,
        height: 800,
        src: "https://cdn.example/original.jpg",
        small: { src: "https://cdn.example/small.jpg", src_2x: "https://cdn.example/small@2x.jpg" },
        medium: { src: "https://cdn.example/medium.jpg", src_2x: "https://cdn.example/medium@2x.jpg" },
        large: { src: "https://cdn.example/large.jpg", src_2x: "https://cdn.example/large@2x.jpg" },
        square: { src: "https://cdn.example/square.jpg", src_2x: "https://cdn.example/square@2x.jpg" },
      },
    });

    expect(result?.source).toBe("Are.na");
    expect(result?.imageUrl).toBe("https://cdn.example/large@2x.jpg");
    expect(result?.thumbUrl).toBe("https://cdn.example/small@2x.jpg");
    expect(result?.author).toBe("Ada Lovelace");
  });
});
