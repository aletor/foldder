/**
 * Populate — materialización CONGELADA de un Designer por fila (modo `node-clone`).
 *
 * Por cada fila del listado, clona el documento de la plantilla, lo fija a esa fila, resuelve sus
 * enlaces al Dataset (texto/imagen/propiedades) y ELIMINA los enlaces: el nodo resultante es
 * autónomo, desacoplado del Dataset y editable a mano (igual que las imágenes congeladas de Image
 * Creation). La identidad estable de cada slide (`slideKey`) se re-estampa desde la plantilla para
 * que las columnas del Dataset no se desalineen al reordenar/insertar slides.
 */

import type { Edge, Node } from "@xyflow/react";
import type { DesignerPageState } from "@/app/spaces/designer/DesignerNode";
import type { Dataset } from "@/app/spaces/dataset/dataset-types";
import type { FreehandObject } from "@/app/spaces/FreehandStudio";
import { duplicateDesignerPageState, resolveSlideKey } from "@/app/spaces/designer/designer-studio-pure";
import { applyDatasetRowToDesignerPage } from "@/app/spaces/designer/designer-dataset-page";
import {
  designerSlotKey,
  isPendingDesignerBinding,
} from "@/app/spaces/designer/designer-dataset-binding";

/** Referencia a una columna del Dataset (la que Populate asigna a un hueco dinámico). */
export interface DesignerSlotColumnRef {
  listId: string;
  listKey: string;
  fieldId: string;
  fieldKey: string;
}

/** Mapa hueco→columna (clave = `designerSlotKey`), construido en la UI de Populate. */
export type DesignerSlotColumnMap = Record<string, DesignerSlotColumnRef>;

/**
 * Rellena el binding PENDIENTE de un objeto (y de sus hijos anidados dentro de `booleanGroup` y
 * `clippingContainer` — el "pegar dentro") con la columna que Populate le asignó (si la hay),
 * dejándolo resoluble. Sin asignación, se devuelve igual (quedará estático tras el strip).
 */
function resolvePendingBindingForObject(
  obj: FreehandObject,
  slotMap: DesignerSlotColumnMap,
): FreehandObject {
  let next = obj;
  const binding = next._designerDatasetBinding;
  if (binding && isPendingDesignerBinding(binding)) {
    const key = designerSlotKey(binding);
    const col = key ? slotMap[key] : undefined;
    if (col) {
      next = {
        ...next,
        _designerDatasetBinding: {
          ...binding,
          listId: col.listId,
          listKey: col.listKey,
          fieldId: col.fieldId,
          fieldKey: col.fieldKey,
        },
      } as FreehandObject;
    }
  }
  if (next.type === "booleanGroup") {
    next = { ...next, children: next.children.map((c) => resolvePendingBindingForObject(c, slotMap)) };
  } else if (next.type === "clippingContainer") {
    next = {
      ...next,
      mask: resolvePendingBindingForObject(next.mask as unknown as FreehandObject, slotMap) as unknown as typeof next.mask,
      content: next.content.map((c) => resolvePendingBindingForObject(c, slotMap)),
    };
  }
  return next;
}

/** Quita los enlaces a Dataset de un objeto (y de sus hijos), dejándolo congelado. */
export function stripDatasetBindingsFromObject(obj: FreehandObject): FreehandObject {
  let next = obj;
  if (next._designerDatasetBinding || next._designerDatasetPropertyBindings) {
    const copy = { ...next };
    delete copy._designerDatasetBinding;
    delete copy._designerDatasetPropertyBindings;
    next = copy;
  }
  if (next.type === "booleanGroup") {
    next = { ...next, children: next.children.map(stripDatasetBindingsFromObject) };
  } else if (next.type === "clippingContainer") {
    next = {
      ...next,
      mask: stripDatasetBindingsFromObject(next.mask as FreehandObject) as typeof next.mask,
      content: next.content.map(stripDatasetBindingsFromObject),
    };
  }
  return next;
}

/**
 * Congela las páginas de la plantilla para una fila concreta:
 * clona (ids nuevos) → rellena huecos PENDIENTES con el mapeo de Populate → resuelve enlaces de esa
 * fila → elimina enlaces → re-estampa `slideKey`.
 *
 * `slotColumnMap` (opcional) viene de la UI de mapeo de Populate (Modo 2). Los huecos sin columna
 * asignada se quedan estáticos (con su texto/imagen de diseño).
 */
export function freezeDesignerPagesForRow(
  templatePages: DesignerPageState[],
  dataset: Dataset,
  rowIndex: number,
  slotColumnMap?: DesignerSlotColumnMap,
): DesignerPageState[] {
  return templatePages.map((tpl) => {
    const slideKey = resolveSlideKey(tpl);
    const slideName = tpl.slideName;
    const dup = duplicateDesignerPageState(tpl);
    const mapped =
      slotColumnMap && Object.keys(slotColumnMap).length > 0
        ? {
            ...dup,
            objects: (dup.objects ?? []).map((o) => resolvePendingBindingForObject(o, slotColumnMap)),
          }
        : dup;
    const resolved = applyDatasetRowToDesignerPage(mapped, dataset, rowIndex);
    const objects = (resolved.objects ?? []).map(stripDatasetBindingsFromObject);
    const frozen: DesignerPageState = {
      ...resolved,
      objects,
      slideKey,
      slideName,
      datasetRowIndex: rowIndex,
    };
    // Las instancias Populate no participan del modo bucle intra-nodo.
    delete frozen.datasetLoopListId;
    delete frozen.datasetLoopCardId;
    return frozen;
  });
}

export interface DesignerMaterializedRow {
  rowIndex: number;
  cardId?: string;
  /** Páginas ya congeladas para esta fila. */
  pages: DesignerPageState[];
}

const DESIGNER_ROW_GAP_Y = 720;
const DESIGNER_ROW_X = 360;

function designerRowNodeId(populateId: string, rowIndex: number): string {
  return `pop_${populateId}_r${rowIndex}_designer`;
}

/** Construye un nodo Designer autónomo (congelado) para una fila. */
export function buildDesignerRowNode(
  populateId: string,
  row: DesignerMaterializedRow,
  originY: number,
): Node {
  return {
    id: designerRowNodeId(populateId, row.rowIndex),
    type: "designer",
    position: { x: DESIGNER_ROW_X, y: originY },
    data: {
      label: `Fila ${row.rowIndex + 1}`,
      pages: row.pages,
      activePageIndex: 0,
      autoImageOptimization: false,
      _populateRowCardId: row.cardId,
    },
  };
}

/** Construye el subgrafo de N instancias Designer congeladas, apiladas verticalmente. */
export function buildDesignerGeneratedSubgraph(
  populateId: string,
  rows: DesignerMaterializedRow[],
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = rows.map((row, index) =>
    buildDesignerRowNode(populateId, row, 80 + index * DESIGNER_ROW_GAP_Y),
  );
  return { nodes, edges: [] };
}
