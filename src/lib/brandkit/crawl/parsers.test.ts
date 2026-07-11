import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeStaticHtml } from "./static-analyze";
import { hexNormalize, normalizeHttpUrl } from "./url-utils";
import { rankLogoCandidates, shouldAutoResolveLogo } from "./scoring";

const FIXTURES_DIR = path.join(__dirname, "fixtures");

function readFixture(name: string): string {
  return fs.readFileSync(path.join(FIXTURES_DIR, name), "utf8");
}

describe("brandKit crawl parsers", () => {
  it("normalizes http urls", () => {
    expect(normalizeHttpUrl("https://example.com")?.hostname).toBe("example.com");
    expect(normalizeHttpUrl("ftp://bad.com")).toBeNull();
  });

  it("normalizes hex colors", () => {
    expect(hexNormalize("#abc")).toBe("#AABBCC");
    expect(hexNormalize("#E41A1C")).toBe("#E41A1C");
  });

  it("extracts json-ld logo in top candidates", () => {
    const html = readFixture("01-corporate-jsonld.html");
    const result = analyzeStaticHtml(html, "https://acme.test/");
    const urls = result.logos.map((c) => c.value.previewUrl);
    expect(urls.some((u) => u?.includes("logo.svg"))).toBe(true);
    expect(result.brand?.value).toBe("Acme Corp");
  });

  it("extracts css var primary color", () => {
    const html = readFixture("02-css-vars.html");
    const css = ":root { --brand-primary: #E41A1C; --brand-accent: #1F2328; --tw-ring-offset-color: #fff; }";
    const result = analyzeStaticHtml(html, "https://css.test/", [css]);
    expect(result.palette?.value.colors[0]?.hex).toBe("#E41A1C");
  });

  it("ignores tailwind css vars for palette", () => {
    const css = ":root { --tw-ring-offset-color: #ffffff; --brand-primary: rgb(228, 26, 28); }";
    const result = analyzeStaticHtml("<html></html>", "https://css.test/", [css]);
    expect(result.palette?.value.colors[0]?.hex).toBe("#E41A1C");
  });

  it("extracts google font families", () => {
    const html = readFixture("03-google-fonts.html");
    const result = analyzeStaticHtml(html, "https://fonts.test/");
    const families = result.typography?.value.families.map((f) => f.family) ?? [];
    expect(families).toContain("DM Sans");
  });

  it("auto-resolves logo when score gap is sufficient", () => {
    const candidates = rankLogoCandidates([
      {
        url: "https://x.test/logo.svg",
        score: 0.95,
        provenance: { type: "jsonld", detail: "Organization.logo" },
        format: "svg",
      },
      {
        url: "https://x.test/favicon.ico",
        score: 0.3,
        provenance: { type: "link_icon", detail: "favicon" },
        format: "ico",
      },
    ]);
    expect(shouldAutoResolveLogo(candidates).auto).toBe(true);
  });
});
