import { DEFAULT_DOCUMENT_FONT_WEIGHT } from "./google-fonts";
import { registerUserFontBuffer } from "./text-outline";

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }

export const DESIGNER_CUSTOM_FONTS_STORAGE_KEY = "foldder.shared.custom-fonts.v1";

function normalizeDesignerCustomFontFamilyName(fileName: string): string {
  const lastSegment = fileName.split(/[\\/]/).pop() || fileName;
  const withoutExt = lastSegment.replace(/\.(ttf|otf|woff2?|ttc)$/i, "");
  const cleaned = withoutExt
    .replace(/[_-]+/g, " ")
    .replace(/["'`]/g, "")
    .replace(/[^\p{L}\p{N} .-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned || !/[\p{L}\p{N}]/u.test(cleaned)) return "Fuente importada";
  return cleaned.slice(0, 80);
}

export function isMeaningfulDesignerFontFamilyName(name: string): boolean {
  const n = name.trim();
  return n.length > 0 && /[\p{L}\p{N}]/u.test(n) && !/^[,./\\|:;_-]+$/.test(n);
}

export function cssFontFamilyStackForDesignerFamily(family: string): string {
  const escaped = family.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"${escaped}", system-ui, sans-serif`;
}

export function designerFontFileMime(file: File): string {
  if (file.type) return file.type;
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".ttf")) return "font/ttf";
  if (lower.endsWith(".otf")) return "font/otf";
  if (lower.endsWith(".woff")) return "font/woff";
  if (lower.endsWith(".woff2")) return "font/woff2";
  return "application/octet-stream";
}

export type DesignerCustomFontStyle = {
  family: string;
  style: string;
  weight: number;
  dataUrl?: string;
};
type DesignerCustomFontEntry = DesignerCustomFontStyle | string;

const DESIGNER_IMPORTED_FONT_STYLE_DEFS: Array<{ label: string; weight: number; aliases: string[] }> = [
  { label: "ExtraLight", weight: 200, aliases: ["extra light", "extralight", "ultra light", "ultralight"] },
  { label: "SemiBold", weight: 600, aliases: ["semi bold", "semibold", "demi bold", "demibold"] },
  { label: "ExtraBold", weight: 800, aliases: ["extra bold", "extrabold", "ultra bold", "ultrabold"] },
  { label: "Hairline", weight: 100, aliases: ["hairline"] },
  { label: "Thin", weight: 100, aliases: ["thin"] },
  { label: "Light", weight: 300, aliases: ["light"] },
  { label: "Book", weight: 400, aliases: ["book"] },
  { label: "Regular", weight: 400, aliases: ["regular", "roman", "normal"] },
  { label: "Medium", weight: 500, aliases: ["medium"] },
  { label: "Bold", weight: 700, aliases: ["bold"] },
  { label: "Black", weight: 900, aliases: ["black", "heavy"] },
];
export const DESIGNER_SYSTEM_FONT_FAMILY_VALUE_PREFIX = "__system-family:";

export function designerSystemFontFamilyLabel(label: string): string {
  return label.split("·")[0]?.trim() || label.trim();
}

export function designerSystemFontStyleLabel(label: string): string {
  return label.split("·").slice(1).join("·").trim() || label.trim();
}

export function parseDesignerImportedFontFileName(fileName: string, fallbackWeight: number): DesignerCustomFontStyle {
  const clean = normalizeDesignerCustomFontFamilyName(fileName);
  const lower = clean.toLowerCase();
  for (const def of DESIGNER_IMPORTED_FONT_STYLE_DEFS) {
    for (const alias of def.aliases) {
      if (lower === alias) return { family: clean, style: def.label, weight: def.weight };
      if (!lower.endsWith(` ${alias}`)) continue;
      const family = clean.slice(0, clean.length - alias.length).trim();
      return {
        family: isMeaningfulDesignerFontFamilyName(family) ? family : clean,
        style: def.label,
        weight: def.weight,
      };
    }
  }
  const weight = clamp(Math.round(fallbackWeight || DEFAULT_DOCUMENT_FONT_WEIGHT), 100, 900);
  const style = DESIGNER_IMPORTED_FONT_STYLE_DEFS.find((d) => d.weight === weight)?.label ?? `${weight}`;
  return { family: clean, style, weight };
}

function normalizeDesignerCustomFontEntry(entry: DesignerCustomFontEntry): DesignerCustomFontStyle | null {
  if (typeof entry === "string") return parseDesignerImportedFontFileName(entry, DEFAULT_DOCUMENT_FONT_WEIGHT);
  if (!entry || !isMeaningfulDesignerFontFamilyName(entry.family)) return null;
  return {
    family: entry.family.trim(),
    style: entry.style?.trim() || DESIGNER_IMPORTED_FONT_STYLE_DEFS.find((d) => d.weight === entry.weight)?.label || `${entry.weight || 400}`,
    weight: clamp(Math.round(entry.weight || DEFAULT_DOCUMENT_FONT_WEIGHT), 100, 900),
    ...(typeof entry.dataUrl === "string" && entry.dataUrl.startsWith("data:")
      ? { dataUrl: entry.dataUrl }
      : {}),
  };
}

function sortDesignerCustomFonts(fonts: DesignerCustomFontStyle[]): DesignerCustomFontStyle[] {
  return fonts.slice().sort(
    (a, b) =>
      a.family.localeCompare(b.family, "es", { sensitivity: "base" }) ||
      a.weight - b.weight ||
      a.style.localeCompare(b.style, "es", { sensitivity: "base" }),
  );
}

export function mergeDesignerCustomFonts(fonts: DesignerCustomFontEntry[]): DesignerCustomFontStyle[] {
  const map = new Map<string, DesignerCustomFontStyle>();
  for (const entry of fonts) {
    const normalized = normalizeDesignerCustomFontEntry(entry);
    if (!normalized) continue;
    map.set(`${normalized.family.toLowerCase()}|${normalized.style.toLowerCase()}`, normalized);
  }
  return sortDesignerCustomFonts(Array.from(map.values()));
}

export function readStoredDesignerCustomFonts(): DesignerCustomFontStyle[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(DESIGNER_CUSTOM_FONTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return mergeDesignerCustomFonts(parsed);
  } catch {
    return [];
  }
}

export function persistDesignerCustomFonts(fonts: DesignerCustomFontStyle[]): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (fonts.length === 0) {
      window.localStorage.removeItem(DESIGNER_CUSTOM_FONTS_STORAGE_KEY);
      return true;
    }
    window.localStorage.setItem(DESIGNER_CUSTOM_FONTS_STORAGE_KEY, JSON.stringify(sortDesignerCustomFonts(fonts)));
    return true;
  } catch {
    /* localStorage quota can be tight with font files; keep the current session loaded. */
    return false;
  }
}

async function designerFontDataUrlToArrayBuffer(dataUrl: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(dataUrl);
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

export async function loadDesignerCustomFontFace(font: DesignerCustomFontStyle): Promise<void> {
  if (typeof document === "undefined" || typeof FontFace === "undefined" || !font.dataUrl) return;
  const face = new FontFace(font.family, `url("${font.dataUrl}")`, {
    weight: String(font.weight),
    style: "normal",
  });
  await face.load();
  document.fonts.add(face);
  const buf = await designerFontDataUrlToArrayBuffer(font.dataUrl);
  if (buf) registerUserFontBuffer(font.family, font.weight, buf);
}
