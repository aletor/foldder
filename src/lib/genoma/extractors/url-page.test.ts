import { describe, expect, it } from "vitest";
import {
  discoverFontFamilies,
  discoverImageUrls,
  discoverLogoUrls,
  domainFromUrl,
  extractPaletteFromHtml,
  extractTypographyFromHtml,
  extractVoiceFromHtml,
  findExistingUrlSource,
  metaContent,
  normalizePageUrl,
  normalizeUrlForCompare,
  scoreUrlLogoUrl,
  scaleSubordinationFromPixelArea,
  sourceRefForUrl,
} from "./url-page";
import { emptyGenome } from "../model/trait";
import type { SourceRef } from "../model/evidence";

const SAMPLE_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta name="theme-color" content="#112233">
  <meta property="og:description" content="Hacemos que pase">
  <meta property="og:image" content="https://marca.example/logo.png">
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;700&display=swap" rel="stylesheet">
  <style>body{font-family:Montserrat,sans-serif;color:#445566}</style>
</head>
<body><img src="/hero.jpg" alt="hero"></body>
</html>`;

describe("url-page extractors", () => {
  it("normaliza URLs y dominio", () => {
    expect(normalizePageUrl("marca.example")).toBe("https://marca.example");
    expect(domainFromUrl("https://www.marca.example/path")).toBe("marca.example");
  });

  it("extrae meta, paleta y familias Google", () => {
    expect(metaContent(SAMPLE_HTML, "og:description")).toBe("Hacemos que pase");
    const palette = extractPaletteFromHtml(SAMPLE_HTML, "src1");
    expect(palette.length).toBeGreaterThan(0);
    expect(palette[0].value.hex).toBe("#112233");
    expect(discoverFontFamilies(SAMPLE_HTML)).toContain("Montserrat");
  });

  it("resuelve imágenes relativas y absolutas", () => {
    const urls = discoverImageUrls(SAMPLE_HTML, "https://marca.example/about");
    expect(urls[0]).toBe("https://marca.example/logo.png");
    expect(urls.some((u) => u.endsWith("/hero.jpg"))).toBe(true);
  });

  it("prioriza URLs con señal de logo y penaliza hero/banner", () => {
    const html = `${SAMPLE_HTML}<img src="/assets/hero-banner.jpg"><link href="/brand-mark.svg" rel="icon">`;
    const urls = discoverLogoUrls(html, "https://marca.example");
    expect(urls[0]).toContain("brand-mark.svg");
    expect(scoreUrlLogoUrl("https://x.example/logo-dark.svg")).toBeGreaterThan(
      scoreUrlLogoUrl("https://x.example/hero-banner.jpg"),
    );
    expect(scaleSubordinationFromPixelArea(120, 40)).toBeGreaterThan(
      scaleSubordinationFromPixelArea(1200, 630),
    );
  });

  it("tipografía Montserrat → espécimen Google Fonts", () => {
    const source = sourceRefForUrl("https://marca.example");
    const typo = extractTypographyFromHtml(SAMPLE_HTML, [source]);
    expect(typo.primary[0]?.value.family).toBe("Montserrat");
    expect(typo.primary[0]?.value.specimenAvailable).toBe(true);
    expect(typo.primary[0]?.value.specimenSource).toBe("google-fonts");
  });

  it("voz desde meta y léxico", () => {
    const voice = extractVoiceFromHtml(`${SAMPLE_HTML} somos cercanos y profesionales`, "src1");
    expect(voice.tagline[0]?.value.text).toContain("Hacemos que pase");
    expect(voice.tone.map((t) => t.value.text)).toEqual(expect.arrayContaining(["cercano", "profesional"]));
  });

  it("detecta URL ya ingerida sin duplicar fuente", () => {
    const url = "https://marca.example/";
    const src: SourceRef = { id: "s1", kind: "url", label: url, addedAt: "2026-01-01T00:00:00.000Z" };
    const genome = { ...emptyGenome(), sources: [src] };
    expect(findExistingUrlSource(genome, "marca.example")?.id).toBe("s1");
    expect(normalizeUrlForCompare("https://marca.example")).toBe(normalizeUrlForCompare(url));
  });
});
