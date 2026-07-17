/** Graphics state compartido para walks de paths/imágenes (pdf.js setGState). */

export type PdfGState = {
  fillAlpha: number;
  strokeAlpha: number;
  blendMode: string;
  softMask: boolean;
  /** Subtipo PDF del SMask activo, si se conoce. */
  softMaskSubtype: SoftMaskSubtype | null;
};

export type SoftMaskSubtype = "Alpha" | "Luminosity";

export function createPdfGState(): PdfGState {
  return { fillAlpha: 1, strokeAlpha: 1, blendMode: "normal", softMask: false, softMaskSubtype: null };
}

/** Mapea nombres PDF / pdf.js de blend a CSS mix-blend-mode. */
export function mapPdfBlendMode(raw: unknown): string {
  if (typeof raw !== "string" || !raw.trim()) return "normal";
  const key = raw.trim();
  const table: Record<string, string> = {
    Normal: "normal",
    Compatible: "normal",
    Multiply: "multiply",
    Screen: "screen",
    Overlay: "overlay",
    Darken: "darken",
    Lighten: "lighten",
    ColorDodge: "color-dodge",
    ColorBurn: "color-burn",
    HardLight: "hard-light",
    SoftLight: "soft-light",
    Difference: "difference",
    Exclusion: "exclusion",
    Hue: "hue",
    Saturation: "saturation",
    Color: "color",
    Luminosity: "luminosity",
  };
  if (table[key]) return table[key]!;
  const lower = key.toLowerCase().replace(/\s+/g, "-");
  if (
    [
      "normal",
      "multiply",
      "screen",
      "overlay",
      "darken",
      "lighten",
      "color-dodge",
      "color-burn",
      "hard-light",
      "soft-light",
      "difference",
      "exclusion",
      "hue",
      "saturation",
      "color",
      "luminosity",
    ].includes(lower)
  ) {
    return lower;
  }
  return "normal";
}

function isSMaskOff(value: unknown): boolean {
  if (value == null || value === false) return true;
  if (typeof value === "string" && /^none$/i.test(value.trim())) return true;
  if (typeof value === "object" && value !== null && "type" in value) {
    const t = String((value as { type?: unknown }).type ?? "");
    if (/^none$/i.test(t)) return true;
  }
  return false;
}

export function parseSoftMaskSubtype(value: unknown): SoftMaskSubtype | null {
  if (isSMaskOff(value)) return null;
  if (typeof value === "string") {
    if (/alpha/i.test(value)) return "Alpha";
    if (/lumin/i.test(value)) return "Luminosity";
    return "Luminosity";
  }
  if (value && typeof value === "object") {
    const t = String((value as { type?: unknown; subtype?: unknown }).type ?? (value as { subtype?: unknown }).subtype ?? "");
    if (/alpha/i.test(t)) return "Alpha";
    if (/lumin/i.test(t)) return "Luminosity";
    // pdf.js a menudo pasa un objeto truthy sin subtype claro → Luminosity (más común en diseño).
    return "Luminosity";
  }
  return "Luminosity";
}

/** pdf.js setGState: args[0] = [["ca", 0.5], ["BM", "Multiply"], ["SMask", …], ...] */
export function applyPdfGState(args: unknown[], state: PdfGState): void {
  const entries = Array.isArray(args[0]) ? (args[0] as unknown[]) : args;
  for (const entry of entries) {
    if (!Array.isArray(entry) || entry.length < 2) continue;
    const key = entry[0];
    const value = entry[1];
    if (key === "ca" && typeof value === "number" && Number.isFinite(value)) {
      state.fillAlpha = Math.min(1, Math.max(0, value));
    }
    if (key === "CA" && typeof value === "number" && Number.isFinite(value)) {
      state.strokeAlpha = Math.min(1, Math.max(0, value));
    }
    if (key === "BM") {
      state.blendMode = mapPdfBlendMode(value);
    }
    if (key === "SMask") {
      const off = isSMaskOff(value);
      state.softMask = !off;
      state.softMaskSubtype = off ? null : parseSoftMaskSubtype(value);
    }
  }
}
