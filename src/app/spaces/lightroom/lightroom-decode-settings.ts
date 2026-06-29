import type { LibRawSettings } from "libraw-wasm";

export type LibRawDecodeMode = "preview" | "export";

/**
 * Ajustes LibRaw para pipeline lineal HDR (Fase 2 addendum).
 *
 * Preview: demosaico rápido (AHD) + media resolución opcional.
 * Export: AMaZE (userQual 11) a resolución completa.
 */
export function buildLibRawDecodeSettings(
  overrides?: Partial<LibRawSettings> & { mode?: LibRawDecodeMode },
): LibRawSettings {
  const { mode = "preview", ...rest } = overrides ?? {};
  const isExport = mode === "export";
  return {
    /** Balance de blancos de cámara (-w). */
    useCameraWb: true,
    /** Matriz de color de cámara desactivada: la aplica el perfil DCP en GPU. */
    useCameraMatrix: 0,
    /** Preview: AHD (3). Export: AMaZE (11). */
    userQual: isExport ? 11 : 3,
    /** 0 = RGB lineal de cámara (sin gamma sRGB). */
    outputColor: 0,
    outputBps: 16,
    /** Recuperación de altas luces en demosaico (0=clip, 1=unclip, 2–9=blend progresivo). */
    highlight: 5,
    bright: 1,
    /** Sin auto-bright: conserva headroom HDR lineal. */
    noAutoBright: true,
    expCorrec: false,
    halfSize: !isExport,
    ...rest,
  };
}

/** Extensiones que requieren LibRaw (no las decodifica el navegador nativamente). */
export const RAW_FILE_EXTENSIONS = new Set([
  "cr2",
  "cr3",
  "crw",
  "nef",
  "nrw",
  "arw",
  "srf",
  "sr2",
  "raf",
  "orf",
  "rw2",
  "pef",
  "ptx",
  "dng",
  "rwl",
  "3fr",
  "fff",
  "mef",
  "mos",
  "kdc",
  "dcr",
  "bay",
  "srw",
]);

export function normalizeFileExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  if (dot < 0) return "";
  return fileName.slice(dot + 1).toLowerCase();
}

export function isRawFileName(fileName: string): boolean {
  return RAW_FILE_EXTENSIONS.has(normalizeFileExtension(fileName));
}

export function isNativeImageFileName(fileName: string): boolean {
  const ext = normalizeFileExtension(fileName);
  return ext === "jpg" || ext === "jpeg" || ext === "png" || ext === "webp" || ext === "gif";
}
