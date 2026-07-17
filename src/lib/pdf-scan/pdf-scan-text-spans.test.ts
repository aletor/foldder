import { describe, expect, it } from "vitest";
import {
  clusterLinesIntoColumns,
  clusterPdfTextItemsIntoBlocks,
  flattenExtractedText,
  groupLinesIntoParagraphs,
  groupTextItemsIntoLines,
  type PdfScanRawTextItem,
  type PdfScanTextBlock,
} from "./pdf-scan-text-spans";
import { buildCoverSvg } from "./pdf-scan-clean-background";

function item(
  text: string,
  xPt: number,
  yTopPt: number,
  wPt: number,
  hPt = 12,
  fontSize = 12,
  fontName = "Helvetica",
): PdfScanRawTextItem {
  return { text, xPt, yTopPt, wPt, hPt, fontSize, fontName };
}

function line(
  text: string,
  xPt: number,
  yTopPt: number,
  wPt: number,
  hPt = 12,
  fontSize = 12,
): PdfScanTextBlock {
  return { text, xPt, yTopPt, wPt, hPt, fontSize, fontName: "Helvetica" };
}

describe("groupTextItemsIntoLines", () => {
  it("keeps same-Y columns as separate lines when X gap is large", () => {
    const lines = groupTextItemsIntoLines([
      item("Col A", 40, 100, 40),
      item("Col B", 220, 100, 40),
      item("Col C", 400, 100, 40),
    ]);
    expect(lines).toHaveLength(3);
    expect(lines.map((l) => l.text)).toEqual(["Col A", "Col B", "Col C"]);
  });

  it("joins adjacent words on the same line", () => {
    const lines = groupTextItemsIntoLines([
      item("Hola", 40, 100, 30),
      item("mundo", 78, 100, 40),
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.text).toBe("Hola mundo");
  });
});

describe("clusterLinesIntoColumns + paragraphs by pitch", () => {
  it("merges a long uniform-pitch paragraph into one flat field", () => {
    const lines = Array.from({ length: 8 }, (_, i) =>
      line(`L${i + 1}`, 40, 100 + i * 18, 200, i % 2 === 0 ? 11 : 14, 12),
    );
    const paragraphs = groupLinesIntoParagraphs(lines);
    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0]!.text).toBe("L1 L2 L3 L4 L5 L6 L7 L8");
    expect(paragraphs[0]!.text).not.toContain("\n");
  });

  it("does not merge when pitch jumps (new paragraph)", () => {
    const paragraphs = groupLinesIntoParagraphs([
      line("Título", 40, 40, 80, 16, 16),
      line("Cuerpo", 40, 120, 120, 12, 12),
    ]);
    expect(paragraphs).toHaveLength(2);
  });

  it("keeps interleaved two-column lines as two separate paragraphs", () => {
    const lines = [
      line("A1", 40, 80, 100),
      line("B1", 280, 80, 100),
      line("A2", 40, 98, 100),
      line("B2", 280, 98, 100),
      line("A3", 40, 116, 100),
      line("B3", 280, 116, 100),
    ];
    expect(clusterLinesIntoColumns(lines)).toHaveLength(2);
    const paragraphs = groupLinesIntoParagraphs(lines);
    expect(paragraphs).toHaveLength(2);
    const texts = paragraphs.map((p) => p.text).sort();
    expect(texts).toEqual(["A1 A2 A3", "B1 B2 B3"]);
  });
});

describe("clusterPdfTextItemsIntoBlocks", () => {
  it("produces three column fields and one flat multiline paragraph", () => {
    const blocks = clusterPdfTextItemsIntoBlocks([
      item("A1", 40, 80, 30),
      item("B1", 250, 80, 30),
      item("C1", 460, 80, 30),
      item("Párrafo", 40, 200, 80),
      item("continúa", 40, 216, 70),
    ]);
    expect(blocks.map((b) => b.text)).toEqual(["A1", "B1", "C1", "Párrafo continúa"]);
  });
});

describe("flattenExtractedText", () => {
  it("strips all newlines", () => {
    expect(flattenExtractedText("uno\ndos\n\ntres")).toBe("uno dos tres");
  });
});

describe("buildCoverSvg", () => {
  it("emits opaque rects for each text cover", () => {
    const svg = buildCoverSvg(800, 600, [{ x: 10, y: 20, w: 100, h: 30, fill: "#fafafa" }]);
    expect(svg).toContain('width="800"');
    expect(svg).toContain('fill="#fafafa"');
    expect(svg).toContain('x="10" y="20" width="100" height="30"');
  });
});
