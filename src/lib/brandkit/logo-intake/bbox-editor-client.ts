/**
 * Recorte de contenido sobre un canvas (trim tipo sharp) para bbox en coords de página.
 */
import type { BBoxPage } from "@/lib/brandkit/logo-intake/bbox";
import { bboxPageToPixel, normalizeBBoxPage, pixelRectToBBoxPage } from "@/lib/brandkit/logo-intake/bbox-ui";

function sampleBorderColor(data: Uint8ClampedArray, width: number, height: number): [number, number, number] {
  const points = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
  ];
  let r = 0;
  let g = 0;
  let b = 0;
  for (const [x, y] of points) {
    const i = (y * width + x) * 4;
    r += data[i] ?? 0;
    g += data[i + 1] ?? 0;
    b += data[i + 2] ?? 0;
  }
  return [r / 4, g / 4, b / 4];
}

function trimCropCanvas(canvas: HTMLCanvasElement, threshold = 18): { left: number; top: number; width: number; height: number } | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const { width, height } = canvas;
  const image = ctx.getImageData(0, 0, width, height);
  const [br, bg, bb] = sampleBorderColor(image.data, width, height);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const dr = Math.abs((image.data[i] ?? 0) - br);
      const dg = Math.abs((image.data[i + 1] ?? 0) - bg);
      const db = Math.abs((image.data[i + 2] ?? 0) - bb);
      if (dr + dg + db > threshold) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (maxX < minX || maxY < minY) return null;
  const outW = maxX - minX + 1;
  const outH = maxY - minY + 1;
  if (outW >= width && outH >= height) return null;
  return { left: minX, top: minY, width: outW, height: outH };
}

export function trimBBoxOnPage(input: {
  pageCanvas: HTMLCanvasElement;
  pageWidth: number;
  pageHeight: number;
  bboxPage: BBoxPage;
}): BBoxPage | null {
  const px = bboxPageToPixel(input.bboxPage, input.pageWidth, input.pageHeight);
  const crop = document.createElement("canvas");
  crop.width = px.width;
  crop.height = px.height;
  const ctx = crop.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(input.pageCanvas, px.left, px.top, px.width, px.height, 0, 0, px.width, px.height);
  const trimmed = trimCropCanvas(crop);
  if (!trimmed) return null;
  return pixelRectToBBoxPage(
    px.left + trimmed.left,
    px.top + trimmed.top,
    trimmed.width,
    trimmed.height,
    input.pageWidth,
    input.pageHeight,
  );
}

export function extractPreviewDataUrl(
  pageCanvas: HTMLCanvasElement,
  bboxPage: BBoxPage,
  pageWidth: number,
  pageHeight: number,
): string {
  const px = bboxPageToPixel(normalizeBBoxPage(bboxPage), pageWidth, pageHeight);
  const out = document.createElement("canvas");
  out.width = px.width;
  out.height = px.height;
  const ctx = out.getContext("2d");
  if (!ctx) return "";
  ctx.drawImage(pageCanvas, px.left, px.top, px.width, px.height, 0, 0, px.width, px.height);
  return out.toDataURL("image/png");
}

export async function loadPageCanvas(imageBase64: string, mime: string, width: number, height: number): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_unavailable");
  const img = new Image();
  img.decoding = "async";
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("page_image_load_failed"));
    img.src = `data:${mime};base64,${imageBase64}`;
  });
  ctx.drawImage(img, 0, 0, width, height);
  return canvas;
}
