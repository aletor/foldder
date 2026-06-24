import type { FreehandObject } from "../FreehandStudio";
import { getListFieldImageAtRow, getListFieldTextAtRow } from "@/app/spaces/dataset/dataset-logic";
import type { Dataset } from "@/app/spaces/dataset/dataset-types";
import { applyDesignerDatasetPropertyBindings } from "./designer-dataset-property";
import { computeFittingLayout } from "../indesign/image-frame-layout";
import { patchStoryContentPlain } from "../indesign/text-threading";
import type { DesignerPageState } from "./DesignerNode";

/**
 * Fila del Dataset asociada a una página. Es una propiedad EXPLÍCITA de la página,
 * independiente de su posición en el rail (insertar/borrar páginas no la altera).
 */
export function resolveDesignerPageDatasetRowIndex(page: DesignerPageState | undefined): number {
  if (typeof page?.datasetRowIndex === "number" && page.datasetRowIndex >= 0) {
    return page.datasetRowIndex;
  }
  return 0;
}

/** Número de filas del listado más largo del Dataset (cota superior para iterar). */
export function datasetMaxRowCount(dataset: Dataset | null | undefined): number {
  if (!dataset) return 0;
  return dataset.lists.reduce((max, list) => Math.max(max, list.cards.length), 0);
}

/** Nº de filas de un listado concreto del Dataset. */
export function datasetListRowCount(dataset: Dataset | null | undefined, listId: string): number {
  if (!dataset) return 0;
  return dataset.lists.find((list) => list.id === listId)?.cards.length ?? 0;
}

/**
 * Siguiente fila no usada para una nueva página: máximo índice existente + 1,
 * acotado a la última fila disponible del Dataset (si lo hay).
 */
export function nextDatasetRowIndex(
  pages: DesignerPageState[],
  dataset: Dataset | null | undefined,
): number {
  const maxUsed = pages.reduce(
    (max, page) => Math.max(max, resolveDesignerPageDatasetRowIndex(page)),
    -1,
  );
  const next = maxUsed + 1;
  const rowCount = datasetMaxRowCount(dataset);
  if (rowCount <= 0) return Math.max(0, next);
  return Math.min(next, rowCount - 1);
}

function applyDatasetBindingToObject(
  obj: FreehandObject,
  dataset: Dataset,
  rowIndex: number,
): FreehandObject {
  const binding = obj._designerDatasetBinding;
  if (!binding) return obj;

  const list = dataset.lists.find((row) => row.id === binding.listId);
  const field = list?.schema.find((row) => row.id === binding.fieldId);
  if (!list || !field) return obj;

  if (field.type === "text" && (obj.type === "text" || obj.type === "textOnPath")) {
    const text = getListFieldTextAtRow(dataset, binding.listId, binding.fieldId, rowIndex) ?? "";
    return {
      ...obj,
      text,
      ...(obj.type === "text" && obj.isTextFrame
        ? { _designerRichSpans: undefined, _designerOverflow: false }
        : {}),
    } as FreehandObject;
  }

  if (field.type === "image") {
    const imageValue = getListFieldImageAtRow(dataset, binding.listId, binding.fieldId, rowIndex);
    const src = imageValue?.url.trim() ?? "";
    if (!src) return obj;

    const iw = Math.max(1, imageValue?.w ?? 100);
    const ih = Math.max(1, imageValue?.h ?? 100);

    if (obj.type === "image") {
      return {
        ...obj,
        src,
        intrinsicRatio: iw / ih,
      } as FreehandObject;
    }

    if (obj.type === "rect" && obj.isImageFrame) {
      const layout = computeFittingLayout(obj.width, obj.height, iw, ih, "fill-proportional");
      return {
        ...obj,
        imageFrameContent: {
          src,
          originalWidth: iw,
          originalHeight: ih,
          ...layout,
          fittingMode: "fill-proportional",
        },
        imageFrameAutoFit: true,
      } as FreehandObject;
    }
  }

  return obj;
}

/** Aplica la fila `rowIndex` del Dataset a un único objeto (bindings de campo + de propiedad). */
export function applyDatasetRowToDesignerObject(
  obj: FreehandObject,
  dataset: Dataset,
  rowIndex: number,
): FreehandObject {
  let next = applyDatasetBindingToObject(obj, dataset, rowIndex);
  next = applyDesignerDatasetPropertyBindings(next, dataset, rowIndex);
  return next;
}

/** Aplica la fila `rowIndex` del Dataset a todos los objetos enlazados de una página. */
export function applyDatasetRowToDesignerPage(
  page: DesignerPageState,
  dataset: Dataset,
  rowIndex: number,
): DesignerPageState {
  let stories = page.stories ?? [];
  let objectsChanged = false;
  const objects = (page.objects ?? []).map((obj) => {
    const next = applyDatasetRowToDesignerObject(obj, dataset, rowIndex);
    if (next !== obj) {
      objectsChanged = true;
      if (
        next.type === "text" &&
        next.isTextFrame &&
        typeof next.storyId === "string" &&
        next.storyId
      ) {
        stories = patchStoryContentPlain(stories, next.storyId, next.text ?? "");
      }
    }
    return next;
  });

  if (!objectsChanged && rowIndex === page.datasetRowIndex) {
    return page;
  }

  return {
    ...page,
    datasetRowIndex: rowIndex,
    objects: objectsChanged ? objects : page.objects ?? [],
    stories,
  };
}

/** ¿La página tiene algún objeto enlazado al Dataset (campo o propiedad)? */
export function designerPageHasDatasetBindings(page: DesignerPageState): boolean {
  return (page.objects ?? []).some(
    (o) =>
      !!o._designerDatasetBinding ||
      (!!o._designerDatasetPropertyBindings &&
        Object.keys(o._designerDatasetPropertyBindings).length > 0),
  );
}

/**
 * Propiedades que un binding de Dataset puede modificar en un objeto. Sirve para construir
 * parches mínimos hacia el lienzo vivo (solo se tocan estas claves).
 */
export function datasetBoundKeysForObject(obj: FreehandObject): string[] {
  const keys = new Set<string>();
  const binding = obj._designerDatasetBinding;
  if (binding) {
    if (obj.type === "text" || obj.type === "textOnPath") {
      keys.add("text");
      if (obj.type === "text" && obj.isTextFrame) {
        keys.add("_designerRichSpans");
        keys.add("_designerOverflow");
      }
    } else if (obj.type === "image") {
      keys.add("src");
      keys.add("intrinsicRatio");
    } else if (obj.type === "rect" && obj.isImageFrame) {
      keys.add("imageFrameContent");
      keys.add("imageFrameAutoFit");
    }
  }
  const propBindings = obj._designerDatasetPropertyBindings;
  if (propBindings) {
    for (const key of Object.keys(propBindings)) {
      if (key === "cornerRadius") {
        keys.add("cornerRadius");
        keys.add("cornersLinked");
        keys.add("rx");
      } else {
        keys.add(key);
      }
    }
  }
  return Array.from(keys);
}

/**
 * Re-aplica los bindings de Dataset a todas las páginas con enlaces (sincronización de datos).
 * Devuelve el mismo array si nada cambia (evita renders innecesarios).
 */
export function applyDatasetToAllPages(
  pages: DesignerPageState[],
  dataset: Dataset,
): DesignerPageState[] {
  let changed = false;
  const next = pages.map((page) => {
    if (!designerPageHasDatasetBindings(page)) return page;
    const row = resolveDesignerPageDatasetRowIndex(page);
    const applied = applyDatasetRowToDesignerPage(page, dataset, row);
    if (applied !== page) changed = true;
    return applied;
  });
  return changed ? next : pages;
}

/** Id del listado en modo bucle (el primero que aparezca; el deck comparte uno solo). */
export function collectDatasetLoopListId(pages: DesignerPageState[]): string | null {
  for (const page of pages) {
    if (page.datasetLoopListId) return page.datasetLoopListId;
  }
  return null;
}

/** Quita los marcadores de bucle de todas las páginas (salir de modo bucle). */
export function stripDatasetLoopMarkers(pages: DesignerPageState[]): DesignerPageState[] {
  let changed = false;
  const next = pages.map((page) => {
    if (page.datasetLoopListId == null && page.datasetLoopCardId == null) return page;
    changed = true;
    const { datasetLoopListId: _l, datasetLoopCardId: _c, ...rest } = page;
    return rest;
  });
  return changed ? next : pages;
}

/**
 * Reconcilia un deck en modo bucle con las filas (Cards) del listado: alta de filas nuevas,
 * baja de filas borradas y reordenado, mapeando por `datasetLoopCardId` (id estable de fila).
 * Cada página resultante recibe su `datasetRowIndex` posicional y se le re-aplican los datos.
 *
 * - `clonePage` debe clonar una página con ids nuevos (página + objetos + stories).
 * - Si el listado ya no existe o no tiene filas, sale de modo bucle conservando el deck.
 */
export function reconcileDatasetLoopPages(
  pages: DesignerPageState[],
  dataset: Dataset,
  loopListId: string,
  templateIndex: number,
  clonePage: (page: DesignerPageState) => DesignerPageState,
): DesignerPageState[] {
  const list = dataset.lists.find((row) => row.id === loopListId);
  if (!list || list.cards.length === 0) {
    return stripDatasetLoopMarkers(pages);
  }

  const loopPages = pages.filter((page) => page.datasetLoopListId === loopListId);
  const byCard = new Map<string, DesignerPageState>();
  for (const page of loopPages) {
    if (page.datasetLoopCardId && !byCard.has(page.datasetLoopCardId)) {
      byCard.set(page.datasetLoopCardId, page);
    }
  }

  const templateCandidate = pages[templateIndex];
  const template =
    templateCandidate && templateCandidate.datasetLoopListId === loopListId
      ? templateCandidate
      : loopPages[0] ?? templateCandidate ?? pages[0];
  if (!template) return pages;

  let changed = pages.length !== list.cards.length;
  const result: DesignerPageState[] = [];
  for (let i = 0; i < list.cards.length; i++) {
    const card = list.cards[i]!;
    const existing = byCard.get(card.id);
    let page = existing ?? clonePage(template);
    if (page.datasetRowIndex !== i) page = { ...page, datasetRowIndex: i };
    page = applyDatasetRowToDesignerPage(page, dataset, i);
    if (page.datasetLoopListId !== loopListId || page.datasetLoopCardId !== card.id) {
      page = { ...page, datasetLoopListId: loopListId, datasetLoopCardId: card.id };
    }
    result.push(page);
    if (page !== pages[i]) changed = true;
  }
  return changed ? result : pages;
}
