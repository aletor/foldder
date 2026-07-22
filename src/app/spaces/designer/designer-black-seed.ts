/** Seed negra para Image Creation cuando el marco de imagen está vacío. */

export function designerBlackSeedDataUrl(width = 512, height = 512): string {
  const w = Math.max(1, Math.min(1024, Math.round(width) || 512));
  const h = Math.max(1, Math.min(1024, Math.round(height) || 512));
  if (typeof document === "undefined") {
    // 1×1 negro PNG
    return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPj/HwADBwIAMCbHYQAAAABJRU5ErkJggg==";
  }
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPj/HwADBwIAMCbHYQAAAABJRU5ErkJggg==";
  }
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, w, h);
  return canvas.toDataURL("image/png");
}
