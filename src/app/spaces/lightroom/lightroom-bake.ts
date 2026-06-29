import { applyCropToDataUrl, type LightroomCropSettings } from "./lightroom-crop-types";
import { isRawFileName } from "./lightroom-decode-settings";
import { getLinearSource } from "./lightroom-linear-cache";
import type { LightroomDevelopDocument } from "./lightroom-mask-types";
import { decodeLocalPhotoFileForExport } from "./lightroom-raw-decoder";
import { LightroomDevelopEngine } from "./lightroom-webgl-engine";

export type RenderDevelopedOptions = {
  sourceKey?: string | null;
  sourceDataUrl?: string | null;
  fullResolution?: boolean;
  /** RAW: rechaza fallback PNG 8-bit. */
  linearOnly?: boolean;
};

/** Render puntual a data URL (misma pipeline que el visor). */
export async function renderDevelopedDataUrl(
  developDoc: LightroomDevelopDocument,
  options: RenderDevelopedOptions,
): Promise<string> {
  const { sourceKey, sourceDataUrl, fullResolution = false, linearOnly = false } = options;
  const canvas = document.createElement("canvas");
  const engine = new LightroomDevelopEngine();
  try {
    engine.init(canvas);
    if (sourceKey && getLinearSource(sourceKey)) {
      engine.setSourceFromLinearCache(sourceKey, fullResolution);
    } else if (linearOnly) {
      throw new Error("Buffer lineal RAW no disponible. Re-vincula el archivo en esta sesión.");
    } else if (sourceDataUrl) {
      await engine.setSourceFromDataUrl(sourceDataUrl, fullResolution);
    } else {
      throw new Error("No hay fuente lineal ni data URL para exportar");
    }
    if (!engine.isReady) {
      throw new Error("Motor WebGL no inicializado");
    }
    const alphas = await engine.buildLayerAlphas(developDoc);
    engine.renderPipeline(canvas, developDoc, alphas);
    return engine.toDataUrl(canvas);
  } finally {
    engine.dispose();
  }
}

export type BakeDevelopedOptions = {
  developDoc: LightroomDevelopDocument;
  sourceKey?: string | null;
  sourceDataUrl?: string | null;
  file?: File | null;
  isRaw?: boolean;
  /** true = AMaZE resolución completa; false = misma resolución que el visor (WYSIWYG). */
  fullQuality?: boolean;
  crop?: LightroomCropSettings;
};

/** Revelado + recorte opcional (export / descarga). */
export async function bakeDevelopedImage(options: BakeDevelopedOptions): Promise<string> {
  const { developDoc, sourceKey, sourceDataUrl, file, isRaw, fullQuality = false, crop } = options;

  if (fullQuality && file && isRawFileName(file.name)) {
    await decodeLocalPhotoFileForExport(file);
  }

  const baked = await renderDevelopedDataUrl(developDoc, {
    sourceKey,
    sourceDataUrl,
    fullResolution: fullQuality,
    linearOnly: isRaw,
  });

  if (crop?.enabled) {
    return applyCropToDataUrl(baked, crop);
  }
  return baked;
}

export function downloadDataUrl(dataUrl: string, fileName: string): void {
  const base = fileName.replace(/\.[^.]+$/i, "").trim() || "lightroom-export";
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = `${base}-revelado.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
