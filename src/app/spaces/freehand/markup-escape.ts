export function escapeXmlAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

export function escapeXmlText(s: string): string {
  const cleaned = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
  return cleaned.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
