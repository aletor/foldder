import type { PdfPaletteRole } from "@/lib/brain/pdf-brand-extract";

/** Etiqueta legible para la cara — sin jerga de operadores PDF. */
export function paletteRoleDisplayName(role: PdfPaletteRole): string {
  return role;
}
