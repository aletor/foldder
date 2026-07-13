import { parseColorToHex } from "./crawl/color-utils";
import { deriveBrandThemeFromDoc } from "./brand-theme-color";
import { brandKitDocumentToGenome } from "./projection/brand-kit-document-to-genome";
import { buildBookView } from "./projection/book-view";
import type { BrandKitDocument, PaletteValue, SlotState } from "./brand-kit-types";

function normalizePaletteHex(hex: string): string | null {
  const parsed = parseColorToHex(hex);
  if (parsed) return parsed;

  const raw = hex.trim();
  if (/^[0-9A-Fa-f]{6}$/.test(raw)) return `#${raw.toUpperCase()}`;
  if (/^[0-9A-Fa-f]{8}$/.test(raw)) return `#${raw.slice(0, 6).toUpperCase()}`;
  if (/^#[0-9A-Fa-f]{8}$/i.test(raw)) return `#${raw.slice(1, 7).toUpperCase()}`;
  return null;
}

function pushUniqueHex(out: string[], seen: Set<string>, hex: string | null | undefined) {
  if (!hex || seen.has(hex)) return;
  seen.add(hex);
  out.push(hex);
}

function colorsFromPaletteValue(palette: PaletteValue | undefined, out: string[], seen: Set<string>, limit: number) {
  if (!palette?.colors?.length) return;
  for (const color of palette.colors) {
    const strict = normalizePaletteHex(color.hex);
    if (strict) {
      pushUniqueHex(out, seen, strict);
    } else {
      const raw = color.hex?.trim();
      if (raw) {
        const loose = (raw.startsWith("#") ? raw : `#${raw}`).toUpperCase();
        pushUniqueHex(out, seen, normalizePaletteHex(loose));
      }
    }
    if (out.length >= limit) return;
  }
}

function resolvePaletteSlot(slot: SlotState<unknown> | undefined): PaletteValue | undefined {
  if (!slot) return undefined;

  const direct = slot.value as PaletteValue | undefined;
  if (direct?.colors?.length) return direct;

  if (slot.candidates.length > 0) {
    const best = [...slot.candidates].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
    const candidate = best?.value as PaletteValue | undefined;
    if (candidate?.colors?.length) return candidate;
  }

  return undefined;
}

function colorsFromCompiled(doc: BrandKitDocument, out: string[], seen: Set<string>, limit: number) {
  const colors = doc.compiled?.paletteTokens?.colors;
  if (!Array.isArray(colors)) return;
  for (const entry of colors) {
    const raw =
      entry && typeof entry === "object" && "hex" in entry && typeof entry.hex === "string"
        ? entry.hex
        : null;
    pushUniqueHex(out, seen, raw ? normalizePaletteHex(raw) : null);
    if (out.length >= limit) return;
  }
}

function colorsFromBrandTheme(doc: BrandKitDocument, out: string[], seen: Set<string>, limit: number) {
  const theme = deriveBrandThemeFromDoc(doc);
  if (!theme.ready) return;
  for (const key of [
    "--brand-primary",
    "--brand-accent",
    "--brand-secondary",
    "--brand-neutral",
    "--brand-surface-page",
    "--brand-ink",
  ]) {
    pushUniqueHex(out, seen, normalizePaletteHex(theme.vars[key] ?? ""));
    if (out.length >= limit) return;
  }
}

function colorsFromGenomeProjection(doc: BrandKitDocument, out: string[], seen: Set<string>, limit: number) {
  const paletteSlot = doc.slots.palette;
  const locked = Boolean(paletteSlot?.locked);
  const genome = brandKitDocumentToGenome(doc);
  const view = buildBookView(genome);

  for (const entry of view.palette) {
    if (locked && entry.slot.state !== "crowned") continue;
    const hex = entry.slot.value?.hex;
    pushUniqueHex(out, seen, hex ? normalizePaletteHex(hex) : null);
    if (out.length >= limit) return;
  }

  if (locked) return;

  for (const entry of view.palette) {
    const hex = entry.slot.value?.hex;
    pushUniqueHex(out, seen, hex ? normalizePaletteHex(hex) : null);
    if (out.length >= limit) return;
  }
}

/** Colores de paleta del BrandKit para el Designer (hasta 12, sin defaults de demo). */
export function extractDesignerPaletteColors(doc: BrandKitDocument | undefined): string[] {
  if (!doc) return [];

  const out: string[] = [];
  const seen = new Set<string>();
  const limit = 12;

  colorsFromPaletteValue(resolvePaletteSlot(doc.slots.palette), out, seen, limit);
  if (out.length > 0) return out.slice(0, limit);

  colorsFromCompiled(doc, out, seen, limit);
  if (out.length > 0) return out.slice(0, limit);

  colorsFromGenomeProjection(doc, out, seen, limit);
  if (out.length > 0) return out.slice(0, limit);

  colorsFromBrandTheme(doc, out, seen, limit);
  return out.slice(0, limit);
}
