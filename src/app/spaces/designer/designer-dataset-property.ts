import type { FreehandObject, RectangleCornerRadius } from "../FreehandStudio";
import {
  fieldValueAsText,
  getConstantFieldValue,
  getListFieldValueAtRow,
} from "@/app/spaces/dataset/dataset-logic";
import type {
  Dataset,
  DesignerDatasetPropertyBinding,
  FieldDef,
  FieldType,
} from "@/app/spaces/dataset/dataset-types";
import { normalizeHexColor } from "../freehand/extract-document-colors";

export function brandKitConstantId(nodeId: string, fieldId: string): string {
  return `bk:${nodeId}:${fieldId}`;
}
import { solidFill } from "../freehand/fill";

/** Propiedades del Designer enlazables a campos del Dataset. */
export const DESIGNER_DATASET_BINDABLE_PROPERTIES = [
  "x",
  "y",
  "width",
  "height",
  "rotation",
  "opacity",
  "fill",
  "stroke",
  "cornerRadius",
  "fontSize",
  "fontWeight",
] as const;

export type DesignerDatasetBindableProperty = (typeof DESIGNER_DATASET_BINDABLE_PROPERTIES)[number];

const PROPERTY_FIELD_TYPES: Record<DesignerDatasetBindableProperty, FieldType[]> = {
  x: ["number"],
  y: ["number"],
  width: ["number"],
  height: ["number"],
  rotation: ["number"],
  opacity: ["number"],
  fill: ["color"],
  stroke: ["color"],
  cornerRadius: ["number"],
  fontSize: ["number"],
  fontWeight: ["number"],
};

export function datasetFieldTypesForProperty(
  propertyKey: string,
): FieldType[] | null {
  if (!(propertyKey in PROPERTY_FIELD_TYPES)) return null;
  return PROPERTY_FIELD_TYPES[propertyKey as DesignerDatasetBindableProperty];
}

export function filterDatasetFieldsForProperty(
  fields: FieldDef[],
  propertyKey: string,
): FieldDef[] {
  const allowed = datasetFieldTypesForProperty(propertyKey);
  if (!allowed) return [];
  return fields.filter((field) => allowed.includes(field.type));
}

export function getDesignerDatasetPropertyBinding(
  obj: FreehandObject,
  propertyKey: string,
): DesignerDatasetPropertyBinding | undefined {
  return obj._designerDatasetPropertyBindings?.[propertyKey];
}

export function setDesignerDatasetPropertyBinding(
  obj: FreehandObject,
  propertyKey: string,
  binding: DesignerDatasetPropertyBinding,
): FreehandObject {
  return {
    ...obj,
    _designerDatasetPropertyBindings: {
      ...(obj._designerDatasetPropertyBindings ?? {}),
      [propertyKey]: binding,
    },
  };
}

export function stripDatasetPropertyBindings(
  obj: FreehandObject,
  propertyKeys: string[],
): FreehandObject {
  const bindings = obj._designerDatasetPropertyBindings;
  if (!bindings) return obj;
  const next = { ...bindings };
  let changed = false;
  for (const key of propertyKeys) {
    if (next[key]) {
      delete next[key];
      changed = true;
    }
  }
  if (!changed) return obj;
  if (Object.keys(next).length === 0) {
    const { _designerDatasetPropertyBindings: _removed, ...rest } = obj as FreehandObject & {
      _designerDatasetPropertyBindings?: Record<string, DesignerDatasetPropertyBinding>;
    };
    return rest as FreehandObject;
  }
  return { ...obj, _designerDatasetPropertyBindings: next };
}

export function dragGestureDatasetPropertyKeys(
  dragType: string,
): string[] {
  switch (dragType) {
    case "move":
      return ["x", "y"];
    case "resize":
    case "textBoxResize":
      return ["x", "y", "width", "height"];
    case "rotate":
      return ["rotation"];
    case "cornerRadius":
      return ["cornerRadius"];
    default:
      return [];
  }
}

export function manualEditDatasetPropertyKeys(key: string): string[] {
  if (key === "rx" || key === "cornerRadius") return ["cornerRadius"];
  if (
    key === "x" ||
    key === "y" ||
    key === "width" ||
    key === "height" ||
    key === "rotation" ||
    key === "opacity" ||
    key === "fill" ||
    key === "stroke" ||
    key === "fontSize" ||
    key === "fontWeight"
  ) {
    return [key];
  }
  return [];
}

function parseDatasetNumber(value: unknown, propertyKey: string): number | null {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  if (propertyKey === "opacity" && value > 1) return Math.max(0, Math.min(1, value / 100));
  return value;
}

function resolveBindingRawValue(
  binding: DesignerDatasetPropertyBinding,
  dataset: Dataset,
  rowIndex: number,
): string | number | null {
  // BrandKit (source "node") y constantes del Dataset se resuelven igual: por constante.
  // El nodo BrandKit aporta sus campos como constantes namespaced `bk:<nodeId>:<fieldId>`.
  if (binding.source === "node" || binding.source === "constant") {
    const constantId =
      binding.source === "node"
        ? brandKitConstantId(binding.nodeId ?? "", binding.fieldId)
        : binding.fieldId;
    const value = getConstantFieldValue(dataset, constantId);
    if (!value) return null;
    if (value.type === "number") return value.value;
    if (value.type === "color" || value.type === "text" || value.type === "select" || value.type === "url") {
      return value.value;
    }
    return fieldValueAsText(value) || null;
  }
  if (!binding.listId) return null;
  const value = getListFieldValueAtRow(dataset, binding.listId, binding.fieldId, rowIndex);
  if (!value) return null;
  if (value.type === "number") return value.value;
  if (value.type === "color" || value.type === "text" || value.type === "select" || value.type === "url") {
    return value.value;
  }
  return fieldValueAsText(value) || null;
}

export function resolveDesignerDatasetPropertyValue(
  binding: DesignerDatasetPropertyBinding,
  dataset: Dataset,
  rowIndex: number,
  propertyKey: string,
): number | string | null {
  const raw = resolveBindingRawValue(binding, dataset, rowIndex);
  if (raw == null) return null;
  if (propertyKey === "fill" || propertyKey === "stroke") {
    const hex = normalizeHexColor(String(raw));
    return hex ?? String(raw);
  }
  if (typeof raw === "number") return parseDatasetNumber(raw, propertyKey);
  const parsed = Number(raw);
  if (!Number.isNaN(parsed) && String(raw).trim() !== "") {
    return parseDatasetNumber(parsed, propertyKey);
  }
  return null;
}

export function buildDesignerDatasetPropertyPatch(
  obj: FreehandObject,
  propertyKey: string,
  binding: DesignerDatasetPropertyBinding,
  dataset: Dataset,
  rowIndex: number,
): Partial<FreehandObject> | null {
  const resolved = resolveDesignerDatasetPropertyValue(binding, dataset, rowIndex, propertyKey);
  if (resolved == null) return null;

  switch (propertyKey) {
    case "x":
    case "y":
    case "width":
    case "height":
    case "rotation":
      return { [propertyKey]: resolved as number };
    case "opacity":
      return { opacity: Math.max(0, Math.min(1, resolved as number)) };
    case "fill": {
      const hex = normalizeHexColor(String(resolved));
      if (!hex) return null;
      return { fill: solidFill(hex) };
    }
    case "stroke":
      return { stroke: String(resolved) };
    case "cornerRadius": {
      if (obj.type !== "rect") return null;
      const radius = Math.max(0, resolved as number);
      const maxR = Math.min(obj.width, obj.height) / 2;
      const r = Math.min(radius, maxR);
      const corners: RectangleCornerRadius = {
        topLeft: r,
        topRight: r,
        bottomRight: r,
        bottomLeft: r,
      };
      return {
        cornerRadius: corners,
        cornersLinked: true,
        rx: r,
      };
    }
    case "fontSize": {
      if (obj.type !== "text" && obj.type !== "textOnPath") return null;
      return { fontSize: Math.max(4, Math.min(400, resolved as number)) };
    }
    case "fontWeight": {
      if (obj.type !== "text" && obj.type !== "textOnPath") return null;
      return { fontWeight: Math.max(100, Math.min(900, Math.round(resolved as number))) };
    }
    default:
      return null;
  }
}

/** Aplica todos los enlaces de propiedades de un objeto según la fila del Dataset. */
export function applyDesignerDatasetPropertyBindings(
  obj: FreehandObject,
  dataset: Dataset,
  rowIndex: number,
): FreehandObject {
  const bindings = obj._designerDatasetPropertyBindings;
  if (!bindings || Object.keys(bindings).length === 0) return obj;

  let next = obj;
  for (const [propertyKey, binding] of Object.entries(bindings)) {
    const patch = buildDesignerDatasetPropertyPatch(next, propertyKey, binding, dataset, rowIndex);
    if (patch) next = { ...next, ...patch } as FreehandObject;
  }
  return next;
}
