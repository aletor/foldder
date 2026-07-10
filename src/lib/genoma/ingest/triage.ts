import { triageImageKind } from "../genoma-brand-board-image-detect";

export type GenomaIngestFileKind =
  | "logo_image"
  | "gallery_image"
  | "brand_board_image"
  | "brand_document"
  | "presentation"
  | "unknown";

export type GenomaIngestTriageItem = {
  name: string;
  mime: string;
  kind: GenomaIngestFileKind;
  action: string;
};

const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "webp", "svg", "gif", "ico"]);
const DOC_EXT = new Set(["pdf", "docx", "doc", "txt", "md", "rtf", "html", "htm"]);
const DECK_EXT = new Set(["pptx", "ppt", "key"]);

export function triageGenomaFilename(name: string, mime: string): GenomaIngestTriageItem {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";

  if (IMAGE_EXT.has(ext) || mime.startsWith("image/")) {
    const kind = triageImageKind(name);
    const action =
      kind === "brand_board_image"
        ? "Brand board — logo, paleta y tipografía"
        : kind === "logo_image"
          ? "Candidato de logo"
          : "Imagen de galería";
    return { name, mime, kind, action };
  }

  if (ext === "pdf" || mime === "application/pdf") {
    return { name, mime, kind: "brand_document", action: "Manual PDF — extraer imágenes y texto" };
  }

  if (DECK_EXT.has(ext)) {
    return { name, mime, kind: "brand_document", action: "Presentación — análisis document probe" };
  }

  if (DOC_EXT.has(ext) || mime.startsWith("text/")) {
    return { name, mime, kind: "brand_document", action: "Documento de marca — extraer texto" };
  }

  return { name, mime, kind: "unknown", action: "Archivo no clasificado — omitir" };
}
