/**
 * PDFs mínimos hechos a mano para corpus de fidelidad (sin deps externas).
 * Solo geometría / texto Type1 — suficientes para QA determinista.
 */

function pdfEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function buildPdf(contentStream: string, mediaBox: [number, number, number, number] = [0, 0, 300, 200]): Buffer {
  const [x0, y0, x1, y1] = mediaBox;
  const stream = contentStream.trim() + "\n";
  const objects: string[] = [];
  objects.push("1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n");
  objects.push("2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n");
  objects.push(
    `3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [${x0} ${y0} ${x1} ${y1}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>endobj\n`,
  );
  objects.push(`4 0 obj<< /Length ${stream.length} >>stream\n${stream}endstream\nendobj\n`);
  objects.push("5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n");

  let body = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(body, "utf8"));
    body += obj;
  }
  const xrefStart = Buffer.byteLength(body, "utf8");
  let xref = `xref\n0 ${objects.length + 1}\n`;
  xref += "0000000000 65535 f \n";
  for (let i = 1; i <= objects.length; i += 1) {
    xref += `${String(offsets[i]!).padStart(10, "0")} 00000 n \n`;
  }
  body += xref;
  body += `trailer<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(body, "utf8");
}

/** Página con un rectángulo azul relleno. */
export function makeSolidRectPdf(): Buffer {
  // PDF y-up: rect en (40,40) tamaño 120×80
  return buildPdf(`
1 0 0 1 0 0 cm
0.1 0.3 0.85 rg
40 40 120 80 re
f
`);
}

/** Fondo de color a página completa + rectángulo encima (no debe descartarse el fondo). */
export function makeFullPageBackgroundPdf(): Buffer {
  return buildPdf(`
0.05 0.25 0.55 rg
0 0 300 200 re
f
0.95 0.75 0.15 rg
50 50 100 60 re
f
`);
}

/** Página con dos paths (rect + triángulo). */
export function makeTwoShapesPdf(): Buffer {
  return buildPdf(`
0.85 0.2 0.15 rg
30 30 80 60 re
f
0.15 0.65 0.35 rg
160 40 m
220 40 l
190 100 l
h
f
`);
}

/** Página con texto Helvetica. */
export function makeTextLinePdf(text = "Foldder QA"): Buffer {
  return buildPdf(`
BT
/F1 18 Tf
40 120 Td
(${pdfEscape(text)}) Tj
ET
`);
}

export type PdfScanCorpusFixtureId = "solid-rect" | "two-shapes" | "text-line" | "full-page-bg";

export function getPdfScanCorpusFixture(id: PdfScanCorpusFixtureId): Buffer {
  switch (id) {
    case "solid-rect":
      return makeSolidRectPdf();
    case "two-shapes":
      return makeTwoShapesPdf();
    case "text-line":
      return makeTextLinePdf();
    case "full-page-bg":
      return makeFullPageBackgroundPdf();
    default: {
      const _exhaustive: never = id;
      return _exhaustive;
    }
  }
}

export const PDF_SCAN_CORPUS_FIXTURE_IDS: PdfScanCorpusFixtureId[] = [
  "solid-rect",
  "two-shapes",
  "text-line",
  "full-page-bg",
];
