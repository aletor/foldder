import { resolveImageGridLayout } from "@/lib/shared/image-grid";
import {
  STUDIO_MAX_GRID_CELLS,
  STUDIO_MAX_REFS_PER_CARD,
  studioGridCellId,
  type StudioCard,
  type StudioPaletteColor,
} from "./studio-types";

export type StudioGridCell = {
  cardId: string;
  cardIndex1: number;
  cellId: string;
  color: StudioPaletteColor;
  description: string;
  src: string;
};

export function flattenStudioReferenceCells(cards: StudioCard[]): StudioGridCell[] {
  const cells: StudioGridCell[] = [];
  cards.forEach((card, cardIndex) => {
    const refs = card.references.filter(Boolean).slice(0, STUDIO_MAX_REFS_PER_CARD);
    refs.forEach((src, refIndex) => {
      if (cells.length >= STUDIO_MAX_GRID_CELLS) return;
      cells.push({
        cardId: card.id,
        cardIndex1: cardIndex + 1,
        cellId: studioGridCellId(cardIndex + 1, refIndex),
        color: card.assignedColor,
        description: card.description,
        src,
      });
    });
  });
  return cells;
}

export function gridCellsForCard(cells: StudioGridCell[], cardId: string): string[] {
  return cells.filter((cell) => cell.cardId === cardId).map((cell) => cell.cellId);
}

export function describeStudioGridForPrompt(cells: StudioGridCell[]): string {
  if (cells.length === 0) return "";
  const byCard = new Map<string, StudioGridCell[]>();
  for (const cell of cells) {
    const list = byCard.get(cell.cardId) ?? [];
    list.push(cell);
    byCard.set(cell.cardId, list);
  }
  const lines = ["REFERENCE GRID CELLS:"];
  for (const group of byCard.values()) {
    const first = group[0]!;
    const ids = group.map((cell) => cell.cellId).join(", ");
    const zone = first.color.name;
    lines.push(
      `- Card #${first.cardIndex1} (zone ${zone}): cells ${ids}. Use these images together for that card.`,
    );
  }
  return lines.join("\n");
}

const CELL_W = 400;
const CELL_H = 320;
const HEADER_H = 36;

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load grid reference."));
    img.src = src;
  });
}

/**
 * One mosaic image. One labeled cell per reference photo (not per card).
 * Headers stay painted so Gemini can bind cells the same way it bound "celda AZUL".
 */
export async function buildStudioReferenceGrid(cells: StudioGridCell[]): Promise<string | null> {
  const usable = cells.slice(0, STUDIO_MAX_GRID_CELLS);
  if (usable.length === 0) return null;
  if (typeof document === "undefined") return null;

  const layout = resolveImageGridLayout(usable.length);
  const canvas = document.createElement("canvas");
  canvas.width = layout.columns * CELL_W;
  canvas.height = layout.rows * CELL_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#f4f4f5";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < usable.length; i++) {
    const cell = usable[i]!;
    const col = i % layout.columns;
    const row = Math.floor(i / layout.columns);
    const x = col * CELL_W;
    const y = row * CELL_H;
    ctx.fillStyle = cell.color.hex;
    ctx.fillRect(x, y, CELL_W, HEADER_H);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 13px system-ui, sans-serif";
    const header = `#${cell.cellId} · ${cell.color.name.toUpperCase()}`;
    ctx.fillText(header, x + 10, y + HEADER_H / 2 + 5);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x, y + HEADER_H, CELL_W, CELL_H - HEADER_H);
    try {
      const img = await loadImg(cell.src);
      const iw = img.width;
      const ih = img.height;
      const scale = Math.min((CELL_W - 8) / iw, (CELL_H - HEADER_H - 8) / ih);
      const dw = iw * scale;
      const dh = ih * scale;
      ctx.drawImage(img, x + (CELL_W - dw) / 2, y + HEADER_H + (CELL_H - HEADER_H - dh) / 2, dw, dh);
    } catch {
      /* skip broken src */
    }
    ctx.strokeStyle = "#e4e4e7";
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, CELL_W - 1, CELL_H - 1);
  }

  return canvas.toDataURL("image/png");
}
