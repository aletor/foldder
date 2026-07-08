/**
 * Paleta híbrida — cuantización sobre render + roles validados por visión.
 */

import {
  extractPdfRenderPalettePageRecurrence,
  rankPdfPaletteColors,
  type PdfPaletteColor,
  type PdfPaletteRole,
} from "@/lib/brain/pdf-brand-extract";
import type { EvidenceSignalKind } from "../model/evidence";
import type { GenomaPdfVisionResult } from "./pdf-vision-types";
import { isVisionPaletteBrandEntry } from "./pdf-vision-types";

export type PdfPaletteSource = "vision" | "render" | "operators";

export type PdfPaletteExtractResult = {
  palette: import("@/lib/brain/pdf-brand-extract").PdfPaletteColor[];
  signalKind: Extract<EvidenceSignalKind, "render-quantized" | "operator-color">;
  paletteSource: PdfPaletteSource;
  visionMatchCount?: number;
};

function parseHexChannels(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function hexDistance(a: string, b: string): number {
  const [ar, ag, ab] = parseHexChannels(a);
  const [br, bg, bb] = parseHexChannels(b);
  return Math.sqrt((ar - br) ** 2 + (ag - bg) ** 2 + (ab - bb) ** 2);
}

const RENDER_MATCH_MAX_DISTANCE = 72;

/** El hex más cercano presente en el render cuantizado (nunca inventa color). */
export function nearestRenderHex(
  approxHex: string,
  renderColors: Map<string, number>,
): { hex: string; frequency: number; distance: number } | null {
  let best: { hex: string; frequency: number; distance: number } | null = null;
  for (const [hex, frequency] of renderColors.entries()) {
    const distance = hexDistance(approxHex, hex);
    if (distance > RENDER_MATCH_MAX_DISTANCE) continue;
    if (!best || distance < best.distance || (distance === best.distance && frequency > best.frequency)) {
      best = { hex, frequency, distance };
    }
  }
  return best;
}

export function rankPaletteWithVision(
  renderColors: Map<string, number>,
  vision: GenomaPdfVisionResult | null | undefined,
  options?: { detailPrefix?: string; matchPool?: Map<string, number> },
): { palette: PdfPaletteColor[]; visionMatchCount: number; usedVisionRoles: boolean } {
  const detailPrefix = options?.detailPrefix ?? "render cuantizado";
  const pool = options?.matchPool ?? renderColors;
  const brandEntries = vision?.palette.filter(isVisionPaletteBrandEntry) ?? [];

  if (brandEntries.length === 0) {
    return {
      palette: rankPdfPaletteColors(renderColors, { detailPrefix }),
      visionMatchCount: 0,
      usedVisionRoles: false,
    };
  }

  const roles: PdfPaletteColor[] = [];
  const used = new Set<string>();
  let visionMatchCount = 0;

  for (const entry of brandEntries) {
    const match = nearestRenderHex(entry.approxHex, pool);
    if (match) visionMatchCount += 1;
    const hex = match?.hex ?? entry.approxHex;
    if (used.has(hex.toLowerCase())) continue;
    used.add(hex.toLowerCase());
    roles.push({
      hex,
      role: entry.role,
      frequency: match?.frequency ?? 1,
      confidence: match ? Math.min(0.95, 0.6 + match.frequency / 120) : 0.72,
      detail: match
        ? `${detailPrefix} ${entry.role}${entry.wherePresent ? ` · ${entry.wherePresent}` : ""}`
        : `${detailPrefix} ${entry.role} · visión`,
    });
  }

  if (roles.length === 0) {
    return {
      palette: rankPdfPaletteColors(renderColors, { detailPrefix }),
      visionMatchCount: 0,
      usedVisionRoles: false,
    };
  }

  const roleOrder: PdfPaletteRole[] = ["primario", "secundario", "acento", "fondo", "soporte"];
  roles.sort((a, b) => roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role));

  return {
    palette: roles.slice(0, 5),
    visionMatchCount,
    usedVisionRoles: true,
  };
}

export async function extractPdfPaletteForGenomeWithVision(
  buffer: Buffer,
  maxPages: number,
  vision?: GenomaPdfVisionResult | null,
): Promise<PdfPaletteExtractResult> {
  const renderColors = await extractPdfRenderPalettePageRecurrence(buffer, maxPages);

  if (vision?.palette?.length) {
    const { palette, visionMatchCount, usedVisionRoles } = rankPaletteWithVision(renderColors, vision, {
      detailPrefix: "render inter-página + visión",
    });
    if (palette.length > 0) {
      return {
        palette,
        signalKind: "render-quantized",
        paletteSource: usedVisionRoles ? "vision" : "render",
        visionMatchCount,
      };
    }
  }

  const renderPalette = rankPdfPaletteColors(renderColors, { detailPrefix: "render inter-página cuantizado" });
  return {
    palette: renderPalette,
    signalKind: "render-quantized",
    paletteSource: "render",
  };
}

/** Comprueba que un hex devuelto existe en el render (tolerancia cuantización). */
export function hexExistsInRender(renderColors: Map<string, number>, hex: string): boolean {
  if (renderColors.has(hex.toLowerCase())) return true;
  return nearestRenderHex(hex, renderColors) !== null;
}
