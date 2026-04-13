"use client";

import { jsPDF } from "jspdf";
import type { Story, TextFrame } from "./text-model";
import { layoutPageStories } from "./text-layout";
import { INDESIGN_PAD } from "./page-formats";
import { jspdfOptionsForPagePx } from "./indesign-export-pdf";

type PageVector = {
  width: number;
  height: number;
  stories: Story[];
  textFrames: TextFrame[];
};

/**
 * PDF con texto seleccionable (jsPDF). Fuentes estándar; para tipografías custom habría que embeber TTF.
 */
export function exportIndesignPagesPdfVector(
  pages: PageVector[],
  fileName = "layout-export.pdf",
): void {
  if (pages.length === 0) return;

  const first = pages[0]!;
  const doc = new jsPDF(jspdfOptionsForPagePx(first.width, first.height));

  const frameMap = (tf: TextFrame[]) => new Map(tf.map((f) => [f.id, f]));
  const storyMap = (st: Story[]) => new Map(st.map((s) => [s.id, s]));

  for (let pi = 0; pi < pages.length; pi++) {
    const page = pages[pi]!;
    if (pi > 0) doc.addPage([page.width, page.height], page.width >= page.height ? "l" : "p");

    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, page.width, page.height, "F");

    const layouts = layoutPageStories(page.stories, page.textFrames);
    const fMap = frameMap(page.textFrames);
    const sMap = storyMap(page.stories);

    for (const lay of layouts) {
      const fr = fMap.get(lay.frameId);
      const st = sMap.get(lay.storyId);
      if (!fr || !st) continue;

      doc.setFont("helvetica", st.typography.fontStyle === "italic" ? "italic" : "normal");
      if (st.typography.fontWeight === "bold" || st.typography.fontWeight === "700") {
        doc.setFont("helvetica", "bold");
      }

      const rgb = hexToRgb(st.typography.color);
      if (rgb) doc.setTextColor(rgb.r, rgb.g, rgb.b);
      else doc.setTextColor(17, 24, 39);

      for (const line of lay.lines) {
        const x = fr.x - INDESIGN_PAD + line.x;
        const y = fr.y - INDESIGN_PAD + line.y + line.fontSize;
        doc.setFontSize(Math.max(6, line.fontSize * 0.75));
        try {
          doc.text(line.text, x, y, { baseline: "top", maxWidth: fr.width - fr.padding * 2 });
        } catch {
          doc.text(line.text.replace(/[^\x00-\xff]/g, "?"), x, y, { baseline: "top" });
        }
      }
    }
  }

  doc.save(fileName);
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m?.[1]) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
