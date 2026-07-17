/**
 * Sanitización de strings extraídos de PDF para XML/SVG/Freehand.
 * PDF a veces incluye NUL (\u0000) y controles que rompen sharp/libvips.
 */

/** XML 1.0: prohibidos NUL y casi todos los controles (salvo TAB/LF/CR). */
export function stripInvalidXmlChars(s: string): string {
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uFFFE\uFFFF]/g, "");
}

/** Texto editable: sin controles + espacios colapsados. */
export function sanitizePdfExtractedText(text: string): string {
  return stripInvalidXmlChars(text)
    .replace(/\r\n?/g, "\n")
    .replace(/\s*\n+\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Path SVG `d`: solo comandos/números seguros. */
export function sanitizeSvgPathD(d: string): string {
  return stripInvalidXmlChars(d).replace(/[^\sMmLlHhVvCcSsQqTtAaZz0-9eE.,+\-]/g, " ").replace(/\s+/g, " ").trim();
}

export function mapPdfScanErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const m = raw.toLowerCase();
  if (/corrupt header|xml parse|pcdata invalid|char value 0/i.test(raw)) {
    return "El PDF tiene datos vectoriales incompatibles con el QA visual. Reintenta; si persiste, usa Textos editables.";
  }
  if (/password|encrypted/i.test(m)) {
    return "Este PDF está protegido con contraseña y no se puede abrir.";
  }
  if (/too large|demasiado grande|413/i.test(m)) {
    return "El PDF supera el tamaño máximo permitido.";
  }
  if (/no se pudo rasterizar|no pages|empty/i.test(m)) {
    return "No se pudo leer ninguna página del PDF.";
  }
  if (/s3|nosuchkey|accessdenied/i.test(m)) {
    return "No se encontró el archivo subido. Vuelve a soltar el PDF.";
  }
  if (raw.trim()) return raw.trim().slice(0, 280);
  return "Error al escanear el PDF.";
}
