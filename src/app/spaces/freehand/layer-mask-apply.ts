import type { LayerMaskData } from "./layer-mask-types";

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("No se pudo cargar la imagen"));
    img.src = src;
  });
}

/** Hornea la máscara de capa en el alfa del bitmap (estilo Photoshop «Aplicar máscara»). */
export async function bakeLayerMaskIntoRasterDataUrl(
  rasterSrc: string,
  mask: LayerMaskData,
): Promise<string> {
  const [img, maskImg] = await Promise.all([loadHtmlImage(rasterSrc), loadHtmlImage(mask.src)]);
  const w = Math.max(1, img.naturalWidth);
  const h = Math.max(1, img.naturalHeight);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D no disponible");
  ctx.drawImage(img, 0, 0, w, h);
  const imgData = ctx.getImageData(0, 0, w, h);

  const mCanvas = document.createElement("canvas");
  mCanvas.width = w;
  mCanvas.height = h;
  const mCtx = mCanvas.getContext("2d");
  if (!mCtx) throw new Error("Canvas 2D no disponible");
  mCtx.drawImage(maskImg, 0, 0, w, h);
  const mData = mCtx.getImageData(0, 0, w, h).data;

  for (let i = 0; i < imgData.data.length; i += 4) {
    const lum01 =
      (0.299 * mData[i]! + 0.587 * mData[i + 1]! + 0.114 * mData[i + 2]!) / 255;
    const m = mask.inverted ? 1 - lum01 : lum01;
    imgData.data[i + 3] = Math.round(imgData.data[i + 3]! * m);
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL("image/png");
}
