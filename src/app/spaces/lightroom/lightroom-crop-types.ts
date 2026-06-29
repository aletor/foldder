/** Recorte no destructivo (normalizado 0…1 en espacio imagen). */

export type CropAspectRatio = "free" | "original" | "1:1" | "16:9" | "3:2" | "4:3";

export type LightroomCropSettings = {
  enabled: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
  angle: number;
  aspectRatio: CropAspectRatio;
};

export const EMPTY_CROP_SETTINGS: LightroomCropSettings = {
  enabled: false,
  x: 0.05,
  y: 0.05,
  w: 0.9,
  h: 0.9,
  angle: 0,
  aspectRatio: "free",
};

export function normalizeCropSettings(raw?: Partial<LightroomCropSettings> | null): LightroomCropSettings {
  const base = EMPTY_CROP_SETTINGS;
  if (!raw) return { ...base };
  return {
    enabled: raw.enabled ?? base.enabled,
    x: clamp01(raw.x ?? base.x),
    y: clamp01(raw.y ?? base.y),
    w: clamp(raw.w ?? base.w, 0.05, 1),
    h: clamp(raw.h ?? base.h, 0.05, 1),
    angle: clamp(raw.angle ?? base.angle, -45, 45),
    aspectRatio: raw.aspectRatio ?? base.aspectRatio,
  };
}

export function aspectRatioValue(ratio: CropAspectRatio, imageW: number, imageH: number): number | null {
  if (ratio === "free" || ratio === "original") {
    return ratio === "original" && imageW > 0 && imageH > 0 ? imageW / imageH : null;
  }
  const map: Record<Exclude<CropAspectRatio, "free" | "original">, number> = {
    "1:1": 1,
    "16:9": 16 / 9,
    "3:2": 3 / 2,
    "4:3": 4 / 3,
  };
  return map[ratio as keyof typeof map] ?? null;
}

/** Aplica recorte a un data URL (export). */
export async function applyCropToDataUrl(dataUrl: string, crop: LightroomCropSettings): Promise<string> {
  if (!crop.enabled) return dataUrl;
  const img = await loadImage(dataUrl);
  const sx = Math.round(crop.x * img.naturalWidth);
  const sy = Math.round(crop.y * img.naturalHeight);
  const sw = Math.max(1, Math.round(crop.w * img.naturalWidth));
  const sh = Math.max(1, Math.round(crop.h * img.naturalHeight));

  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;

  if (Math.abs(crop.angle) > 0.01) {
    ctx.translate(sw / 2, sh / 2);
    ctx.rotate((crop.angle * Math.PI) / 180);
    ctx.drawImage(img, sx, sy, sw, sh, -sw / 2, -sh / 2, sw, sh);
  } else {
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  }
  return canvas.toDataURL("image/png");
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("No se pudo cargar imagen para recorte"));
    img.src = src;
  });
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
