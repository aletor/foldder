export type SharedImageGridInput = {
  caption?: string;
  label?: string;
  mimeType?: string;
  src: string;
};

export type SharedImageGridLayout = {
  borderPx: number;
  cellSize: number;
  columns: number;
  discardedImageCount: number;
  height: number;
  mimeType: "image/jpeg" | "image/png";
  rows: number;
  usedImageCount: number;
  width: number;
};

export type SharedImageGridResult = {
  blob: Blob;
  dataURL: string;
  layout: SharedImageGridLayout;
};

const CELL_SIZE = 512;
const BORDER_PX = 2;
const MAX_IMAGES = 16;

/**
 * Shared replacement for Nano Banana's local buildReferenceGrid.
 * TODO: when the legacy Nano Banana node is deprecated, migrate it to this utility
 * and remove the old node-local grid builder.
 */
export async function createImageGrid(inputs: SharedImageGridInput[]): Promise<SharedImageGridResult> {
  const usable = inputs.filter((input) => input.src.trim()).slice(0, MAX_IMAGES);
  if (usable.length === 0) {
    throw new Error("createImageGrid requires at least one image.");
  }

  const images = await Promise.all(usable.map((input) => loadGridImage(input.src)));
  const hasTransparency = await hasAnyTransparency(images, usable);
  const layoutBase = resolveImageGridLayout(inputs.length);
  const mimeType: SharedImageGridLayout["mimeType"] = hasTransparency ? "image/png" : "image/jpeg";
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context is unavailable.");

  if (usable.length === 1) {
    const image = images[0]!;
    const scaled = fitInside(image.naturalWidth || image.width, image.naturalHeight || image.height, CELL_SIZE, CELL_SIZE);
    canvas.width = Math.max(1, Math.round(scaled.width));
    canvas.height = Math.max(1, Math.round(scaled.height));
    if (!hasTransparency) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  } else {
    canvas.width = layoutBase.columns * CELL_SIZE + (layoutBase.columns - 1) * BORDER_PX;
    canvas.height = layoutBase.rows * CELL_SIZE + (layoutBase.rows - 1) * BORDER_PX;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    images.forEach((image, index) => {
      const col = index % layoutBase.columns;
      const row = Math.floor(index / layoutBase.columns);
      const x = col * (CELL_SIZE + BORDER_PX);
      const y = row * (CELL_SIZE + BORDER_PX);
      ctx.fillStyle = hasTransparency ? "rgba(255,255,255,0)" : "#f4f4f5";
      ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE);
      const fitted = fitInside(
        image.naturalWidth || image.width,
        image.naturalHeight || image.height,
        CELL_SIZE,
        CELL_SIZE,
      );
      ctx.drawImage(
        image,
        x + (CELL_SIZE - fitted.width) / 2,
        y + (CELL_SIZE - fitted.height) / 2,
        fitted.width,
        fitted.height,
      );
    });
  }

  const layout: SharedImageGridLayout = {
    ...layoutBase,
    height: canvas.height,
    mimeType,
    width: canvas.width,
  };
  const quality = mimeType === "image/jpeg" ? 0.9 : undefined;
  const dataURL = canvas.toDataURL(mimeType, quality);
  const blob = await canvasToBlob(canvas, mimeType, quality);
  return { blob, dataURL, layout };
}

export function resolveImageGridLayout(inputCount: number): Omit<SharedImageGridLayout, "height" | "mimeType" | "width"> {
  const count = Math.max(1, Math.min(MAX_IMAGES, Math.floor(inputCount)));
  if (count === 1) {
    return {
      borderPx: 0,
      cellSize: CELL_SIZE,
      columns: 1,
      discardedImageCount: Math.max(0, inputCount - 1),
      rows: 1,
      usedImageCount: 1,
    };
  }
  if (count === 2) return layout(2, 1, count, inputCount);
  if (count <= 4) return layout(2, 2, count, inputCount);
  if (count <= 6) return layout(3, 2, count, inputCount);
  if (count <= 9) return layout(3, 3, count, inputCount);
  return layout(4, 4, count, inputCount);
}

export async function hashBlobSha256(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", buffer);
    return `sha256_${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  }
  let hash = 2166136261;
  const bytes = new Uint8Array(buffer);
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 16777619);
  }
  return `fnv32_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function layout(
  columns: number,
  rows: number,
  usedImageCount: number,
  inputCount: number,
): Omit<SharedImageGridLayout, "height" | "mimeType" | "width"> {
  return {
    borderPx: BORDER_PX,
    cellSize: CELL_SIZE,
    columns,
    discardedImageCount: Math.max(0, inputCount - MAX_IMAGES),
    rows,
    usedImageCount,
  };
}

function loadGridImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load reference image for grid."));
    image.src = src;
  });
}

function fitInside(width: number, height: number, maxWidth: number, maxHeight: number): { height: number; width: number } {
  const scale = Math.min(maxWidth / Math.max(1, width), maxHeight / Math.max(1, height), 1);
  return {
    height: Math.max(1, Math.round(height * scale)),
    width: Math.max(1, Math.round(width * scale)),
  };
}

async function hasAnyTransparency(images: HTMLImageElement[], inputs: SharedImageGridInput[]): Promise<boolean> {
  for (let i = 0; i < images.length; i += 1) {
    const input = inputs[i]!;
    const src = input.src || "";
    const mimeType = input.mimeType?.toLowerCase() || "";
    if (
      /^image\/(png|webp|gif|svg)/i.test(mimeType) ||
      /^data:image\/(png|webp|gif|svg)/i.test(src) ||
      /\.(png|webp|gif|svg)(\?|#|$)/i.test(src)
    ) {
      if (await imageHasTransparency(images[i]!)) return true;
    }
  }
  return false;
}

async function imageHasTransparency(image: HTMLImageElement): Promise<boolean> {
  const width = Math.max(1, Math.min(256, image.naturalWidth || image.width || 1));
  const height = Math.max(1, Math.min(256, image.naturalHeight || image.height || 1));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return false;
  try {
    ctx.drawImage(image, 0, 0, width, height);
    const data = ctx.getImageData(0, 0, width, height).data;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i]! < 255) return true;
    }
  } catch {
    return false;
  }
  return false;
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Could not create image grid blob."));
      },
      mimeType,
      quality,
    );
  });
}
