import type { Metadata } from "libraw-wasm";
import type { DecodedRawPreview } from "./lightroom-types";
import {
  buildLibRawDecodeSettings,
  isNativeImageFileName,
  isRawFileName,
  normalizeFileExtension,
  type LibRawDecodeMode,
} from "./lightroom-decode-settings";
import { linearFloatToPreviewDataUrl } from "./lightroom-base-curve";
import {
  blobToDataUrl,
  decodeNativeImageFile,
  imageDataToLinearFloat,
  imageDataToPngDataUrl,
  librawRgbToLinearFloat,
  normalizeLinearScenePeak,
  type LibrawLinearScale,
} from "./lightroom-canvas";
import { getLinearSource, storeLinearSource, type LinearSourceBuffer } from "./lightroom-linear-cache";

export type DecodeFileResult = DecodedRawPreview & {
  sourceKey: string;
};

function sourceKeyFromFile(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function storeLinearFromRgba(
  sourceKey: string,
  rgba: Float32Array,
  width: number,
  height: number,
  extra?: Pick<LinearSourceBuffer, "isRaw" | "camMul">,
): void {
  storeLinearSource({ sourceKey, width, height, rgba, ...extra });
}

function librawWhiteBlack(meta: Metadata | undefined): LibrawLinearScale | undefined {
  const color = meta?.color_data;
  if (!color) return undefined;
  /** Preferir fnorm/maximum del pipeline LibRaw; evitar restar color.black en píxeles ya procesados. */
  const white = color.fmaximum > 0 ? color.fmaximum : color.data_maximum ?? color.maximum;
  if (!white || white <= 0) return undefined;
  return { whiteLevel: white };
}

function librawCamMul(meta: Metadata | undefined): [number, number, number, number] | undefined {
  const mul = meta?.color_data?.cam_mul;
  if (!mul || mul.length < 3) return undefined;
  return [mul[0] ?? 1, mul[1] ?? 1, mul[2] ?? 1, mul[3] ?? mul[1] ?? 1];
}

/**
 * Decodifica un archivo local: RAW vía LibRaw-WASM (lineal 16-bit), JPEG/PNG vía decodificador nativo.
 * Guarda buffer lineal en caché de sesión; dataUrl es solo miniatura display.
 */
export async function decodeLocalPhotoFile(
  file: File,
  mode: LibRawDecodeMode = "preview",
): Promise<DecodeFileResult> {
  const sourceKey = sourceKeyFromFile(file);
  const name = file.name;

  if (isNativeImageFileName(name)) {
    const imageData = await decodeNativeImageFile(file);
    const rgba = imageDataToLinearFloat(imageData);
    storeLinearFromRgba(sourceKey, rgba, imageData.width, imageData.height, { isRaw: false });
    const dataUrl = imageDataToPngDataUrl(imageData);
    return {
      sourceKey,
      dataUrl,
      width: imageData.width,
      height: imageData.height,
      cameraMake: "",
      cameraModel: "Imagen estándar",
      iso: 0,
      bits: 8,
      nativeDecode: true,
    };
  }

  if (!isRawFileName(name)) {
    throw new Error(
      `Formato no soportado (.${normalizeFileExtension(name) || "?"}). Usa CR3, ARW, DNG, NEF, RAF… o JPEG/PNG.`,
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const LibRaw = (await import("libraw-wasm")).default;
  const raw = new LibRaw();
  try {
    await raw.open(bytes, buildLibRawDecodeSettings({ mode }));
    const meta = await raw.metadata(true);
    const image = await raw.imageData();
    if (!image) throw new Error("LibRaw no devolvió imagen decodificada");
    const wbScale = librawWhiteBlack(meta);
    const { data: rgba, width, height } = librawRgbToLinearFloat(image, wbScale);
    normalizeLinearScenePeak(rgba, 1.0);
    storeLinearFromRgba(sourceKey, rgba, width, height, {
      isRaw: true,
      camMul: librawCamMul(meta),
    });
    /** Miniatura de tarjeta: solo sRGB, sin curva de perfil (el revelado va en WebGL). */
    const dataUrl = linearFloatToPreviewDataUrl(rgba, width, height, false);
    return {
      sourceKey,
      dataUrl,
      width,
      height,
      cameraMake: meta?.camera_make?.trim() ?? "",
      cameraModel: meta?.camera_model?.trim() ?? "",
      iso: meta?.iso_speed ?? 0,
      bits: image.bits,
      nativeDecode: false,
    };
  } finally {
    raw.dispose();
  }
}

/** Re-decodifica a resolución completa con AMaZE para exportación. */
export async function decodeLocalPhotoFileForExport(file: File): Promise<LinearSourceBuffer> {
  await decodeLocalPhotoFile(file, "export");
  const sourceKey = sourceKeyFromFile(file);
  const cached = getLinearSource(sourceKey);
  if (!cached) throw new Error("No se encontró buffer lineal tras decodificar");
  return cached;
}

/** Lee un File como data URL sin decodificar RAW (p. ej. thumbnail embebido futuro). */
export async function readFileAsDataUrl(file: File): Promise<string> {
  if (isRawFileName(file.name)) {
    const decoded = await decodeLocalPhotoFile(file);
    return decoded.dataUrl;
  }
  return blobToDataUrl(file);
}
