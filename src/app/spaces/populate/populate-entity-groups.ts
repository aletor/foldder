import type { DesignerDynamicField } from "@/app/spaces/loop/loop-designer-fields";
import type { FieldDef } from "@/app/spaces/dataset/dataset-types";
import { normalizeDesignerFolderEntityId } from "@/app/spaces/designer/designer-dataset-binding";
import type { PopulateTemplateBinding } from "./populate-types";

/** slotLabel normalizado → identidad de entidad legacy (sin carpeta). */
export function normalizePopulateEntityId(slotLabel: string | undefined | null): string {
  const t = (slotLabel ?? "").trim().toLowerCase();
  return t || "campo";
}

export function entityIdForDynamicField(field: DesignerDynamicField): string {
  if (field.folderEntityId) return field.folderEntityId;
  return normalizePopulateEntityId(field.slotLabel ?? field.label ?? field.slotId);
}

export function entityLabelForDynamicField(field: DesignerDynamicField): string {
  if (field.folderLabel?.trim()) return field.folderLabel.trim();
  return field.slotLabel?.trim() || field.label || entityIdForDynamicField(field);
}

export interface PopulateEntityFacet {
  slotKey: string;
  kind: "text" | "image";
  label: string;
  field: DesignerDynamicField;
}

/** Una entidad del Dataset = un desplegable en el formulario (todos los campos de la misma carpeta). */
export interface PopulateEntityGroup {
  entityId: string;
  label: string;
  /** Nombre de la carpeta contenedora en Designer (si aplica). */
  folderLabel?: string;
  facets: PopulateEntityFacet[];
}

export function slotKeyForDynamicField(field: DesignerDynamicField): string {
  return field.key;
}

export function groupPendingFieldsIntoEntities(
  fields: DesignerDynamicField[],
): PopulateEntityGroup[] {
  const pending = fields.filter((f) => f.status === "pending");
  const byEntity = new Map<string, PopulateEntityGroup>();

  for (const field of pending) {
    const entityId = entityIdForDynamicField(field);
    const slotKey = slotKeyForDynamicField(field);
    let group = byEntity.get(entityId);
    if (!group) {
      group = {
        entityId,
        label: entityLabelForDynamicField(field),
        folderLabel: field.folderLabel?.trim() || undefined,
        facets: [],
      };
      byEntity.set(entityId, group);
    }
    if (group.facets.some((f) => f.slotKey === slotKey)) continue;
    group.facets.push({
      slotKey,
      kind: field.kind,
      label: field.label,
      field,
    });
  }

  return Array.from(byEntity.values());
}

function normalizeSchemaToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

/** Columnas que un hueco de texto en Populate puede consumir (texto + número como string). */
export function schemaColumnMatchesTextFacet(field: FieldDef): boolean {
  return field.type === "text" || field.type === "number";
}

export function textLikeColumnsInSchema(schema: FieldDef[]): FieldDef[] {
  return schema.filter(schemaColumnMatchesTextFacet);
}

/**
 * Autorrellena mapeo hueco → columna si el nombre del hueco coincide con key o label del schema.
 */
export function findSchemaColumnForSlotLabel(
  schema: FieldDef[],
  slotLabel: string | undefined,
  kind: "text" | "image",
  excludeIds: Set<string> = new Set(),
): FieldDef | undefined {
  const want = normalizeSchemaToken(slotLabel ?? "");
  if (!want) return undefined;
  return schema.find((f) => {
    if (excludeIds.has(f.id)) return false;
    if (kind === "image") {
      if (f.type !== "image") return false;
    } else if (!schemaColumnMatchesTextFacet(f)) {
      return false;
    }
    return (
      normalizeSchemaToken(f.key) === want || normalizeSchemaToken(f.label) === want
    );
  });
}

/** Primera columna del schema que encaja con el tipo de faceta (fallback sin coincidencia de nombre). */
export function defaultColumnForFacetKind(
  schema: FieldDef[],
  kind: "text" | "image",
  excludeIds: Set<string> = new Set(),
): FieldDef | undefined {
  return schema.find((f) => {
    if (excludeIds.has(f.id)) return false;
    if (kind === "image") return f.type === "image";
    return schemaColumnMatchesTextFacet(f);
  });
}

/** Columna para una faceta: nombre del hueco → schema; si no hay match, primera libre del tipo. */
export function resolveSchemaColumnForFacet(
  schema: FieldDef[],
  facet: Pick<PopulateEntityFacet, "kind" | "label" | "field">,
  excludeIds: Set<string>,
): FieldDef | undefined {
  const byName = findSchemaColumnForSlotLabel(
    schema,
    facet.field.slotLabel ?? facet.label,
    facet.kind,
    excludeIds,
  );
  if (byName) return byName;
  return defaultColumnForFacetKind(schema, facet.kind, excludeIds);
}

/** Columnas imagen del schema (poses alternativas en la misma fila). */
export function imageColumnsInSchema(schema: FieldDef[]): FieldDef[] {
  return schema.filter((f) => f.type === "image");
}

export function entityPickLabel(group: PopulateEntityGroup): string {
  if (group.folderLabel) return group.folderLabel;
  const kinds = group.facets.map((f) => f.kind);
  const hasText = kinds.includes("text");
  const hasImage = kinds.includes("image");
  if (hasText && hasImage) return group.label;
  if (hasImage) return `${group.label} · imagen`;
  return group.label;
}

/** Etiqueta legible del hueco: `Jugador1.nombre` si hay carpeta, si no el nombre del slot. */
export function facetQualifiedLabel(
  group: PopulateEntityGroup,
  facet: PopulateEntityFacet,
): string {
  const slot = (facet.field.slotLabel ?? facet.label).trim() || "campo";
  if (group.folderLabel?.trim()) {
    return `${group.folderLabel.trim()}.${slot}`;
  }
  return slot;
}

/** Huecos dentro de carpeta (`folder::…`) usan mapeo por columna; no el selector legacy de pose. */
export function populateSlotKeyIsFolderScoped(slotKey: string): boolean {
  return slotKey.startsWith("folder::");
}

export function datasetPickFacetCount(
  binding: Pick<PopulateTemplateBinding, "sources">,
  pickId: string,
): number {
  return Object.values(binding.sources).filter(
    (s) => s.kind === "dataset" && s.pickId === pickId,
  ).length;
}

export function populateEntityUsesLegacyPosePicker(
  entity: PopulateEntityGroup,
  imageColCount: number,
): boolean {
  const imageFacets = entity.facets.filter((f) => f.kind === "image");
  return !entity.folderLabel && imageFacets.length === 1 && imageColCount > 1;
}

export function populateImagePoseOverrideFieldId(args: {
  slotKey: string;
  entityId?: string;
  pickedPoses?: Record<string, string>;
  entityPoseColumnFieldId?: Record<string, string>;
  /** Facets del mismo pick (fila). >2 = carpeta con varios huecos; no usar pose legacy. */
  pickFacetCount?: number;
}): string | undefined {
  if (!args.slotKey.endsWith("::image")) return undefined;
  if (populateSlotKeyIsFolderScoped(args.slotKey)) return undefined;
  if (args.pickFacetCount !== undefined && args.pickFacetCount > 2) return undefined;
  if (!args.entityId) return undefined;
  return args.pickedPoses?.[args.entityId] ?? args.entityPoseColumnFieldId?.[args.entityId];
}

export { normalizeDesignerFolderEntityId };
