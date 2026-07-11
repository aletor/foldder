import { describe, expect, it } from "vitest";
import {
  ingestFilePriority,
  isPdfFile,
  isRasterImageFile,
  isSvgFile,
  sortIngestFiles,
} from "./ingest-file-priority";

function mockFile(type: string, name: string): File {
  return { type, name } as File;
}

describe("ingest-file-priority", () => {
  it("prioriza SVG, luego raster, luego PDF", () => {
    const svg = mockFile("image/svg+xml", "logo.svg");
    const png = mockFile("image/png", "photo.png");
    const pdf = mockFile("application/pdf", "deck.pdf");

    expect(ingestFilePriority(svg)).toBeLessThan(ingestFilePriority(png));
    expect(ingestFilePriority(png)).toBeLessThan(ingestFilePriority(pdf));
    expect(sortIngestFiles([pdf, png, svg]).map((f) => f.name)).toEqual(["logo.svg", "photo.png", "deck.pdf"]);
  });

  it("detecta tipos por extensión cuando falta mime", () => {
    expect(isSvgFile(mockFile("", "marca.svg"))).toBe(true);
    expect(isRasterImageFile(mockFile("", "hero.jpg"))).toBe(true);
    expect(isPdfFile(mockFile("", "informe.pdf"))).toBe(true);
  });
});
