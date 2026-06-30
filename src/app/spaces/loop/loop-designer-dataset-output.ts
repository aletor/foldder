/**
 * Loop — escribir los slides rasterizados de un Designer congelado de vuelta al Dataset.
 *
 * Modelo: M columnas (una por slide) × N filas. Cada fila recibe sus propios slides. Las columnas
 * se identifican por `slideKey` (estable) + `loopGroupId` (el grupo de este Loop-Designer),
 * NO por orden ni por nombre: reordenar/insertar slides no desalinea las columnas.
 *
 * No destructivo: las columnas cuya slide de origen desapareció se marcan `orphaned` (con su
 * historial intacto); el borrado lo decide el usuario. La idempotencia y el versionado por celda
 * reutilizan `writeImageCellValue`/`isImageCellEmpty`.
 */

import { makeFieldDef, emptyValueForType } from "@/app/spaces/dataset/dataset-logic";
import { normalizeDataset } from "@/app/spaces/dataset/dataset-migrate";
import { isImageCellEmpty, writeImageCellValue } from "@/app/spaces/dataset/dataset-image-history";
import type { Card, Dataset, FieldDef, FieldValue } from "@/app/spaces/dataset/dataset-types";
import { slugDatasetColumnKey } from "./loop-dataset-output";

export interface DesignerSlideRaster {
  /** Identidad estable de la slide de origen. */
  slideKey: string;
  /** Nombre legible de la slide (heredado por la columna). */
  slideName?: string;
  /** URL final del raster (idealmente ya subido a S3). */
  url: string;
  s3Key?: string;
  w?: number;
  h?: number;
}

export interface DesignerRowSlides {
  rowIndex: number;
  /** Id de la card destino (identidad estable de la fila). */
  cardId?: string;
  slides: DesignerSlideRaster[];
}

export interface DesignerDatasetOutputSettings {
  enabled: boolean;
  /** Id estable del grupo de columnas (un grupo por Loop-Designer). */
  groupId: string;
  /** Prefijo/etiqueta común de las columnas del grupo (p. ej. "Cromo"). */
  groupLabel: string;
  /** Por defecto solo celdas vacías (idempotente); overwrite_all fuerza todas. */
  fillMode: "empty_only" | "overwrite_all";
}

export interface ApplyDesignerDatasetOutputResult {
  dataset: Dataset;
  writtenCount: number;
  skippedCount: number;
  createdColumns: number;
  orphanedColumns: number;
  columns: Array<{ slideKey: string; fieldId: string; fieldLabel: string }>;
}

function fieldLoopGroupId(f: FieldDef): string | undefined {
  return f.loopGroupId ?? (f as FieldDef & { populateGroupId?: string }).populateGroupId;
}

function fieldLoopSlideKey(f: FieldDef): string | undefined {
  return f.loopSlideKey ?? (f as FieldDef & { populateSlideKey?: string }).populateSlideKey;
}

function columnLabel(groupLabel: string, slideName: string | undefined, fallbackIndex: number): string {
  const group = groupLabel.trim() || "Designer";
  const slide = slideName?.trim() || `Slide ${fallbackIndex + 1}`;
  return `${group} · ${slide}`;
}

/**
 * Aplica los slides rasterizados de todas las filas al Dataset, creando/actualizando una columna
 * imagen por slide bajo `settings.groupId`, y marcando huérfanas las columnas sin slide de origen.
 */
export function applyDesignerSlidesToDataset(args: {
  dataset: Dataset;
  listId: string;
  rows: DesignerRowSlides[];
  settings: DesignerDatasetOutputSettings;
}): ApplyDesignerDatasetOutputResult {
  const { dataset, listId, rows, settings } = args;
  const normalized = normalizeDataset(dataset);
  const listIdx = normalized.lists.findIndex((l) => l.id === listId);
  if (listIdx < 0) throw new Error("Listado del Dataset no encontrado.");
  const list = normalized.lists[listIdx]!;

  let schema: FieldDef[] = [...list.schema];
  let cards: Card[] = list.cards.map((c) => ({ ...c, values: { ...c.values } }));
  const takenKeys = new Set(schema.map((f) => f.key));

  // Slides canónicos: unión por primera aparición (todas las filas comparten plantilla).
  const canonical: Array<{ slideKey: string; slideName?: string }> = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const slide of row.slides) {
      if (seen.has(slide.slideKey)) continue;
      seen.add(slide.slideKey);
      canonical.push({ slideKey: slide.slideKey, slideName: slide.slideName });
    }
  }

  // Asegurar una columna por slide (re-match por groupId + slideKey).
  const fieldBySlide = new Map<string, string>();
  const columns: Array<{ slideKey: string; fieldId: string; fieldLabel: string }> = [];
  let createdColumns = 0;

  canonical.forEach((slide, index) => {
    const label = columnLabel(settings.groupLabel, slide.slideName, index);
    const existingIdx = schema.findIndex(
      (f) => fieldLoopGroupId(f) === settings.groupId && fieldLoopSlideKey(f) === slide.slideKey,
    );
    if (existingIdx >= 0) {
      const prev = schema[existingIdx]!;
      // Reactivar (deja de ser huérfana) y re-sincronizar el label con el nombre actual.
      schema[existingIdx] = { ...prev, label, orphaned: false };
      fieldBySlide.set(slide.slideKey, prev.id);
      columns.push({ slideKey: slide.slideKey, fieldId: prev.id, fieldLabel: label });
      return;
    }
    const base = makeFieldDef(
      { label, type: "image", key: slugDatasetColumnKey(`${settings.groupLabel}_${slide.slideName ?? slide.slideKey}`) },
      takenKeys,
    );
    takenKeys.add(base.key);
    const field: FieldDef = {
      ...base,
      loopGroupId: settings.groupId,
      loopSlideKey: slide.slideKey,
      orphaned: false,
    };
    schema = [...schema, field];
    cards = cards.map((c) => ({ ...c, values: { ...c.values, [field.id]: emptyValueForType("image") } }));
    fieldBySlide.set(slide.slideKey, field.id);
    columns.push({ slideKey: slide.slideKey, fieldId: field.id, fieldLabel: label });
    createdColumns += 1;
  });

  // Marcar huérfanas las columnas del grupo cuya slide ya no existe (no destruir).
  let orphanedColumns = 0;
  schema = schema.map((f) => {
    if (fieldLoopGroupId(f) === settings.groupId && fieldLoopSlideKey(f) && !seen.has(fieldLoopSlideKey(f)!)) {
      if (!f.orphaned) orphanedColumns += 1;
      return { ...f, orphaned: true };
    }
    return f;
  });

  // Escribir celdas por fila × slide.
  let writtenCount = 0;
  let skippedCount = 0;
  for (const row of rows) {
    const cardIdx = row.cardId
      ? cards.findIndex((c) => c.id === row.cardId)
      : row.rowIndex;
    const card = cards[cardIdx];
    if (!card) continue;
    for (const slide of row.slides) {
      const url = slide.url?.trim();
      if (!url) continue;
      const fieldId = fieldBySlide.get(slide.slideKey);
      if (!fieldId) continue;
      const current = card.values[fieldId];
      if (settings.fillMode === "empty_only" && !isImageCellEmpty(current)) {
        skippedCount += 1;
        continue;
      }
      const value: FieldValue = writeImageCellValue({
        current,
        url,
        assetId: slide.s3Key ?? undefined,
        s3Key: slide.s3Key,
        source: "loop",
      });
      card.values = { ...card.values, [fieldId]: value };
      writtenCount += 1;
    }
  }

  const nextList = { ...list, schema, cards };
  const nextLists = [...normalized.lists];
  nextLists[listIdx] = nextList;
  const nextDataset: Dataset = {
    ...normalized,
    lists: nextLists,
    updatedAt: new Date().toISOString(),
    version: normalized.version + 1,
  };

  return {
    dataset: nextDataset,
    writtenCount,
    skippedCount,
    createdColumns,
    orphanedColumns,
    columns,
  };
}

/** Genera un id de grupo estable para un Loop-Designer (una vez por nodo). */
export function makeLoopDesignerGroupId(loopNodeId: string): string {
  return `pdg_${loopNodeId}`;
}
