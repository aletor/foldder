/**
 * Hit-test consciente del alfa para capas de imagen del Designer.
 *
 * Por defecto una imagen se selecciona por su rectángulo (bounding box), así que clicar sobre la zona
 * transparente de un PNG (p. ej. un recorte con fondo quitado) la seleccionaba igual. Este módulo
 * cachea un mapa de alfa (a escala reducida) por `src` para poder responder, de forma síncrona, si un
 * píxel concreto es opaco. El decodificado es asíncrono; mientras no esté listo (o si falla por CORS)
 * el llamante debe caer al bounding box para no romper la selección.
 */

/** Borde máximo del mapa de alfa cacheado (px). Suficiente para acertar el clic; acota memoria. */
export const ALPHA_MAP_MAX_EDGE = 800;
/** Umbral de opacidad (0..255). Por debajo se considera transparente (clic atraviesa). */
export const ALPHA_HIT_THRESHOLD = 12;

export type ImageAlphaEntry =
  | { status: "pending" }
  | { status: "failed" }
  | {
      status: "ready";
      /** Tamaño natural del bitmap (para el mapeo geométrico, igual que el render). */
      natW: number;
      natH: number;
      /** Tamaño del mapa de alfa cacheado (≤ natural). */
      aw: number;
      ah: number;
      /** 1 byte por píxel (canal alfa) en resolución `aw×ah`. */
      alpha: Uint8Array;
    };

const cache = new Map<string, ImageAlphaEntry>();
const listeners = new Set<() => void>();

/** Notifica a los suscriptores que una entrada cambió (p. ej. para refrescar el hover). */
function notify(): void {
  for (const cb of listeners) cb();
}

export function subscribeImageAlpha(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/**
 * Entrada de alfa para `src`. Si no está cacheada, arranca el decodificado asíncrono y devuelve
 * `pending`. Síncrono: apto para llamarse desde el hit-test.
 */
export function getImageAlphaEntry(src: string | null | undefined): ImageAlphaEntry | null {
  const key = src?.trim();
  if (!key) return null;
  const hit = cache.get(key);
  if (hit) return hit;
  cache.set(key, { status: "pending" });
  void decodeAlpha(key);
  return cache.get(key) ?? null;
}

/** Pre-decodifica el alfa de un `src` (idempotente). Úsalo para precalentar antes de interactuar. */
export function prewarmImageAlpha(src: string | null | undefined): void {
  const key = src?.trim();
  if (!key || cache.has(key)) return;
  cache.set(key, { status: "pending" });
  void decodeAlpha(key);
}

async function decodeAlpha(src: string): Promise<void> {
  if (typeof document === "undefined") {
    cache.set(src, { status: "failed" });
    return;
  }
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.decoding = "async";
  img.onload = () => {
    const natW = img.naturalWidth || 0;
    const natH = img.naturalHeight || 0;
    if (natW < 1 || natH < 1) {
      cache.set(src, { status: "failed" });
      notify();
      return;
    }
    const scale = Math.min(1, ALPHA_MAP_MAX_EDGE / Math.max(natW, natH));
    const aw = Math.max(1, Math.round(natW * scale));
    const ah = Math.max(1, Math.round(natH * scale));
    try {
      const c = document.createElement("canvas");
      c.width = aw;
      c.height = ah;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("no 2d ctx");
      ctx.drawImage(img, 0, 0, aw, ah);
      const data = ctx.getImageData(0, 0, aw, ah).data;
      const alpha = new Uint8Array(aw * ah);
      for (let i = 3, p = 0; p < alpha.length; i += 4, p++) alpha[p] = data[i]!;
      cache.set(src, { status: "ready", natW, natH, aw, ah, alpha });
    } catch {
      // Canvas contaminado (CORS sin cabeceras) u otro fallo de lectura → bounding box.
      cache.set(src, { status: "failed" });
    }
    notify();
  };
  img.onerror = () => {
    cache.set(src, { status: "failed" });
    notify();
  };
  img.src = src;
}

/** Alfa (0..255) en coordenadas de píxel NATURAL del bitmap; 0 si cae fuera del bitmap. */
export function sampleAlphaAtNaturalPixel(
  entry: Extract<ImageAlphaEntry, { status: "ready" }>,
  ix: number,
  iy: number,
): number {
  if (ix < 0 || iy < 0 || ix >= entry.natW || iy >= entry.natH) return 0;
  const ax = Math.min(entry.aw - 1, Math.max(0, Math.floor((ix / entry.natW) * entry.aw)));
  const ay = Math.min(entry.ah - 1, Math.max(0, Math.floor((iy / entry.natH) * entry.ah)));
  return entry.alpha[ay * entry.aw + ax] ?? 0;
}

/** Solo para tests: vacía la caché. */
export function __clearImageAlphaCacheForTests(): void {
  cache.clear();
  listeners.clear();
}
