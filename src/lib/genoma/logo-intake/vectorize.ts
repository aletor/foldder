import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import sharp from "sharp";

export async function vectorizeLogo(png: Buffer): Promise<string> {
  if (process.env.GENOMA_LOGO_INTAKE_VECTORIZER === "vectorizer_ai") {
    const { vectorizeRasterBuffer } = await import("@/lib/brandkit/vectorizer-ai-client");
    const svg = await vectorizeRasterBuffer({
      buffer: png,
      filename: "logo.png",
      contentType: "image/png",
      mode: "production",
      audit: { reason: "logo_intake_v1" },
    });
    return svg.toString("utf8");
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "logo-intake-vtr-"));
  const inPath = path.join(tmpDir, "in.png");
  const outPath = path.join(tmpDir, "out.svg");
  try {
    await sharp(png).png().toFile(inPath);
    execFileSync(
      "vtracer",
      [
        "--input",
        inPath,
        "--output",
        outPath,
        "--colormode",
        "color",
        "--hierarchical",
        "stacked",
        "--mode",
        "spline",
        "--filter_speckle",
        "4",
      ],
      { stdio: "pipe" },
    );
    return fs.readFileSync(outPath, "utf8");
  } catch {
    return pngToEmbeddedSvg(png);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function pngToEmbeddedSvg(png: Buffer): Promise<string> {
  const meta = await sharp(png).metadata();
  const w = meta.width ?? 1;
  const h = meta.height ?? 1;
  const b64 = png.toString("base64");
  return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><image href="data:image/png;base64,${b64}" width="${w}" height="${h}"/></svg>`;
}
