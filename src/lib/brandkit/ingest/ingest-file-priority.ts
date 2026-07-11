const PDF_EXT = /\.pdf$/i;
const IMAGE_EXT = /\.(png|jpe?g|webp|avif)$/i;
const SVG_EXT = /\.svg$/i;

export function isPdfFile(file: Pick<File, "type" | "name">): boolean {
  return file.type === "application/pdf" || PDF_EXT.test(file.name);
}

export function isSvgFile(file: Pick<File, "type" | "name">): boolean {
  return file.type === "image/svg+xml" || SVG_EXT.test(file.name);
}

export function isRasterImageFile(file: Pick<File, "type" | "name">): boolean {
  return (file.type.startsWith("image/") && !isSvgFile(file)) || IMAGE_EXT.test(file.name);
}

/** SVG primero, luego raster, luego PDF — alinea detección vectorial antes del deck raster. */
export function ingestFilePriority(file: Pick<File, "type" | "name">): number {
  if (isSvgFile(file)) return 0;
  if (isRasterImageFile(file)) return 1;
  if (isPdfFile(file)) return 2;
  return 3;
}

export function sortIngestFiles<T extends Pick<File, "type" | "name">>(files: Iterable<T>): T[] {
  return [...files].sort((a, b) => ingestFilePriority(a) - ingestFilePriority(b));
}
