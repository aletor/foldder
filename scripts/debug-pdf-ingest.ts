import fs from "node:fs";
import { parseBrainDocument } from "../src/lib/brain-parser-utils";
import {
  countPdfImageObjects,
  extractVisualImagesFromPdfBuffer,
} from "../src/lib/brain/pdf-visual-extract";
import { hexColorsFromCss } from "../src/lib/genoma/crawl/parsers";
import { triageGenomaFilename } from "../src/lib/genoma/ingest/triage";
import { isExplicitPdfLogoAsset } from "../src/lib/genoma/genoma-logo-policy";

async function main() {
  const path = process.argv[2];
  if (!path) {
    console.error("Usage: npx tsx scripts/debug-pdf-ingest.ts <pdf-path>");
    process.exit(1);
  }

  const buf = fs.readFileSync(path);
  const name = path.split("/").pop() ?? "document.pdf";

  console.log("=== PDF ingest diagnostic ===");
  console.log("file:", name);
  console.log("size:", buf.length);
  console.log("triage:", triageGenomaFilename(name, "application/pdf"));
  console.log("raw /Subtype /Image count:", countPdfImageObjects(buf));

  let text = "";
  try {
    text = await parseBrainDocument(buf, name, "application/pdf");
    console.log("text chars:", text.trim().length);
    console.log("text preview:", JSON.stringify(text.trim().slice(0, 800)));
  } catch (error) {
    console.log("text parse FAILED:", error);
  }

  const colors = hexColorsFromCss(text, name);
  console.log("hex colors in text:", colors.length);
  for (const color of colors.slice(0, 8)) console.log("  ", color.hex);

  const images = await extractVisualImagesFromPdfBuffer(buf, name).catch((error) => {
    console.log("image extract FAILED:", error);
    return [];
  });
  console.log("extracted gallery images:", images.length);
  for (const img of images) {
    console.log(
      `  - ${img.name} | ${img.mime} | ${img.width}x${img.height} | logo-name=${isExplicitPdfLogoAsset(img.name)}`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
