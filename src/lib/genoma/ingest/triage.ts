export type GenomaIngestFileKind =
  | "logo_image"
  | "gallery_image"
  | "brand_document"
  | "presentation"
  | "unknown";

export type GenomaIngestTriageItem = {
  name: string;
  mime: string;
  kind: GenomaIngestFileKind;
  action: string;
};

const LOGO_NAME_RE = /logo|marca|brand|icon|favicon/i;
const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "webp", "svg", "gif", "ico"]);
const DOC_EXT = new Set(["pdf", "docx", "doc", "txt", "md", "rtf", "html", "htm"]);
const DECK_EXT = new Set(["pptx", "ppt", "key"]);

export function triageGenomaFilename(name: string, mime: string): GenomaIngestTriageItem {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const lower = name.toLowerCase();

  if (IMAGE_EXT.has(ext) || mime.startsWith("image/")) {
    const kind: GenomaIngestFileKind = LOGO_NAME_RE.test(lower) ? "logo_image" : "gallery_image";
    return {
      name,
      mime,
      kind,
      action: kind === "logo_image" ? "Candidato de logo" : "Imagen de galería",
    };
  }

  if (ext === "pdf" || mime === "application/pdf") {
    return { name, mime, kind: "brand_document", action: "Manual PDF — extraer imágenes y texto" };
  }

  if (DECK_EXT.has(ext)) {
    return { name, mime, kind: "presentation", action: "Presentación — solo metadatos por ahora" };
  }

  if (DOC_EXT.has(ext) || mime.startsWith("text/")) {
    return { name, mime, kind: "brand_document", action: "Documento de marca — extraer texto" };
  }

  return { name, mime, kind: "unknown", action: "Archivo no clasificado — omitir" };
}
