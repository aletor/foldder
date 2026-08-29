export type ExportFormat = "png" | "svg" | "jpg" | "pdf";
export type ExportScalePreset = 1 | 2 | 3;
export type ExportDestination = "download" | "foldder";
export type ExportPageScope = "current" | "all";

export type ProfessionalExportOptions = {
  format: ExportFormat;
  scale: number;
  background: "transparent" | string;
  filename: string;
  merged: boolean;
  /** Si se define y tiene longitud > 0, exporta cada artboard indicado (vista completa). */
  batchArtboardIds?: string[] | null;
  /** Solo PDF: recomprime imágenes raster como JPEG (~72) para archivo más pequeño. */
  optimizeImages?: boolean;
  /**
   * Solo PDF: capa de texto invisible alineada con los trazados para copiar/pegar en el visor de PDF.
   * Por defecto true en el modal.
   */
  pdfSelectableText?: boolean;
  /** Solo PDF Designer: convierte `https://…` del texto en enlaces. */
  pdfMakeUrlsClickable?: boolean;
  /** Solo PDF Designer: recuadro de depuración alrededor de cada enlace. */
  pdfOutlineLinkRects?: boolean;
  /** Destino del archivo generado. Por defecto `download`. */
  destination?: ExportDestination;
  /** Designer: página visible o todas las del documento. Por defecto `current`. */
  pageScope?: ExportPageScope;
};

export function showDesignerPageScope(pageCount: number, exportScope: "selection" | "full"): boolean {
  return exportScope === "full" && pageCount > 1;
}

export function exportCtaLabel(args: {
  format: ExportFormat;
  destination: ExportDestination;
  pageScope: ExportPageScope;
  pageCount: number;
}): string {
  const fmt = args.format.toUpperCase();
  const allPages = args.pageScope === "all" && args.pageCount > 1;
  const multiImages = allPages && args.format !== "pdf";
  const n = multiImages ? args.pageCount : 1;
  const formatLabel = multiImages ? `${n} ${fmt}` : fmt;
  if (args.destination === "foldder") {
    return `Guardar ${formatLabel} en Foldder`;
  }
  return `Exportar ${formatLabel}`;
}

export function pageScopeHint(args: {
  format: ExportFormat;
  pageScope: ExportPageScope;
  pageCount: number;
}): string {
  if (args.pageScope === "current") {
    return "Solo la página que estás viendo.";
  }
  if (args.format === "pdf") {
    return `Un único PDF con ${args.pageCount} páginas.`;
  }
  return `${args.pageCount} archivos, uno por página.`;
}

export function exportPageFilename(args: {
  base: string;
  ext: string;
  pageIndex: number;
  pageCount: number;
  slideName?: string;
}): string {
  const cleanBase =
    (args.base || "export").replace(/\.(png|svg|jpg|jpeg|pdf)$/i, "").replace(/[^a-z0-9-_]+/gi, "_").slice(0, 80) ||
    "export";
  const ext = args.ext.replace(/^\./, "");
  if (args.pageCount <= 1) return `${cleanBase}.${ext}`;
  const pad = Math.max(2, String(args.pageCount).length);
  const n = String(args.pageIndex + 1).padStart(pad, "0");
  const slug = (args.slideName || "")
    .trim()
    .replace(/[^a-z0-9-_]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return slug ? `${cleanBase}-${n}-${slug}.${ext}` : `${cleanBase}-${n}.${ext}`;
}
