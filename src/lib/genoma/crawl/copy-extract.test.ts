import { describe, expect, it } from "vitest";
import { buildCopyCorpus } from "./copy-corpus";
import {
  extractOnelinerDeterministic,
  extractValuesDeterministic,
  extractVoiceDeterministic,
  isWeakOneliner,
} from "./copy-extract";
import type { CrawlPageSnapshot } from "./types";

const ALIMA_ABOUT_HTML = `
<html><head><title>Alima Producciones</title></head><body>
<main>
<p>Somos directores de cine frustrados, guionistas creativos y un poco sabelotodo que nos metimos en publicidad sin manual de instrucciones.</p>
<p>Declaración de principios:</p>
<p>Hacemos cine</p>
<p>y publicidad</p>
<p>No tenemos clientes:</p>
<p>tenemos cómplices</p>
<p>Vamos muy en serio</p>
<p>no grabamos en vertical</p>
</main></body></html>`;

const ALIMA_HOME_HTML = `
<html><head><title>Alima Producciones</title>
<meta name="description" content="Productora audiovisual en Madrid" /></head><body>
<p>¿Quieres contar una buena historia?</p>
<p>¿Una buena historia?</p>
</body></html>`;

function page(url: string, html: string): CrawlPageSnapshot {
  return { url, html, cssTexts: [] };
}

describe("copy extract alima-like site", () => {
  const pages = [
    page("https://alimafilms.com/", ALIMA_HOME_HTML),
    page("https://alimafilms.com/about", ALIMA_ABOUT_HTML),
  ];

  it("builds a richer corpus prioritizing about", () => {
    const corpus = buildCopyCorpus(pages);
    expect(corpus.length).toBeGreaterThan(400);
    expect(corpus).toContain("tenemos cómplices");
    expect(corpus).toContain("¿Quieres contar una buena historia?");
  });

  it("rejects generic document title as oneliner", () => {
    expect(isWeakOneliner("Alima Producciones", "Alima Producciones")).toBe(true);
    const oneliner = extractOnelinerDeterministic(pages, "Alima Producciones");
    expect(oneliner?.value.text).toMatch(/buena historia|cómplices|cine/i);
  });

  it("extracts voice and values from manifesto copy", () => {
    const voice = extractVoiceDeterministic(pages, "Alima Producciones");
    const values = extractValuesDeterministic(pages);
    expect(voice?.summary.length).toBeGreaterThan(24);
    expect(voice?.descriptors.join(" ")).toMatch(/cinematográfico|narrativo/i);
    expect(values?.values.length).toBeGreaterThanOrEqual(3);
  });
});
