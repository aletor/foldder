import { describe, expect, it } from "vitest";
import zlib from "zlib";
import {
  extractEmbeddedSvgsFromPdfBuffer,
  isPlausibleBrandSvg,
  scoreEmbeddedSvg,
  selectCorpusVectorLogo,
} from "./pdf-vector-logo";

const BRAND_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 32"><rect width="120" height="32" fill="#111"/></svg>';

const HUGE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 3000 3000"><rect width="3000" height="3000" fill="#ccc"/></svg>';

function buildPdfWithStream(streamBody: string | Buffer, filter?: "FlateDecode"): Buffer {
  const body = typeof streamBody === "string" ? Buffer.from(streamBody, "utf8") : streamBody;
  const streamPayload = filter === "FlateDecode" ? zlib.deflateSync(body) : body;
  const filterLine = filter ? `/Filter /${filter}\n` : "";
  const pdf = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj
4 0 obj<</Length ${streamPayload.length}\n${filterLine}>>stream
${streamPayload.toString("binary")}endstream
endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000206 00000 n 
trailer<</Size 5/Root 1 0 R>>
startxref
350
%%EOF`;
  return Buffer.from(pdf, "binary");
}

describe("extractEmbeddedSvgsFromPdfBuffer (T-vección embebida)", () => {
  it("detecta SVG en stream plano del PDF", () => {
    const pdf = buildPdfWithStream(BRAND_SVG);
    const found = extractEmbeddedSvgsFromPdfBuffer(pdf, "brand-logo-mark.pdf");
    expect(found.length).toBeGreaterThan(0);
    expect(found[0].svg).toContain("<svg");
    expect(selectCorpusVectorLogo(found, "brand-logo-mark.pdf")).not.toBeNull();
  });

  it("detecta SVG en stream FlateDecode", () => {
    const pdf = buildPdfWithStream(BRAND_SVG, "FlateDecode");
    const found = extractEmbeddedSvgsFromPdfBuffer(pdf, "deck.pdf");
    expect(found.some((s) => s.svg.includes("viewBox"))).toBe(true);
  });

  it("descarta ilustraciones enormes por viewBox", () => {
    expect(isPlausibleBrandSvg(HUGE_SVG)).toBe(false);
  });

  it("prioriza SVG con nombre de logo y viewBox compacto", () => {
    const compact = {
      svg: BRAND_SVG,
      contentSha256: "a",
      label: "logo.svg",
      occurrenceCount: 1,
    };
    const huge = {
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><rect width="400" height="400"/></svg>',
      contentSha256: "b",
      label: "page.svg",
      occurrenceCount: 1,
    };
    expect(scoreEmbeddedSvg(compact, "brand.pdf")).toBeGreaterThan(scoreEmbeddedSvg(huge, "brand.pdf"));
  });
});

describe("selectCorpusVectorLogo", () => {
  it("devuelve null si no hay SVG plausible", () => {
    const pdf = buildPdfWithStream("plain text without vectors");
    const found = extractEmbeddedSvgsFromPdfBuffer(pdf, "empty.pdf");
    expect(selectCorpusVectorLogo(found, "empty.pdf")).toBeNull();
  });
});
