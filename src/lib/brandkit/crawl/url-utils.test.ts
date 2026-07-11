import { describe, expect, it } from "vitest";
import {
  crawlPathPrefix,
  extractInlineStyles,
  extractLinkedStylesheets,
  isAllowedCrawlUrl,
  normalizeBrandKitUrlInput,
  normalizeHttpUrl,
} from "./url-utils";

describe("brandKit url-utils", () => {
  it("normalizes bare domains", () => {
    const parsed = normalizeBrandKitUrlInput("coca-cola.com/es/es");
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.url).toBe("https://coca-cola.com/es/es");
  });

  it("normalizes www without scheme", () => {
    const parsed = normalizeBrandKitUrlInput("www.coca-cola.com/es/es");
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.url.startsWith("https://www.coca-cola.com/es/es")).toBe(true);
  });

  it("keeps https urls", () => {
    expect(normalizeHttpUrl("https://example.com")?.hostname).toBe("example.com");
    expect(normalizeHttpUrl("ftp://bad.com")).toBeNull();
  });

  it("detects locale crawl prefix", () => {
    expect(crawlPathPrefix("https://www.coca-cola.com/es/es")).toBe("/es/es");
    expect(crawlPathPrefix("https://example.com/about")).toBeNull();
  });

  it("blocks country selector outside locale prefix", () => {
    expect(isAllowedCrawlUrl("https://www.coca-cola.com/country-selector", "https://www.coca-cola.com/es/es")).toBe(false);
    expect(isAllowedCrawlUrl("https://www.coca-cola.com/es/es/ofertas", "https://www.coca-cola.com/es/es")).toBe(true);
  });

  it("extracts preload stylesheet links", () => {
    const html =
      '<link as="style" href="https://www.coca-cola.com/onexp-theme/theme.css" rel="preload stylesheet" type="text/css">';
    const urls = extractLinkedStylesheets(html, "https://www.coca-cola.com/es/es");
    expect(urls[0]).toContain("theme.css");
  });

  it("extracts inline styles", () => {
    const css = extractInlineStyles("<style>.hero { color: #f70000; }</style>");
    expect(css[0]).toContain("#f70000");
  });
});
