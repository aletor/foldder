import type { DesignerDynamicField } from "@/app/spaces/loop/loop-designer-fields";
import type { FieldDef } from "@/app/spaces/dataset/dataset-types";

/** slotLabel normalizado → identidad de entidad (p. ej. "jugador"). Legacy sin slotId. */
export function normalizePopulateEntityId(slotLabel: string | undefined | null): string {
  const t = (slotLabel ?? "").trim().toLowerCase();
  return t || "campo";
}

export function entityIdForDynamicField(field: DesignerDynamicField): string {
  return normalizePopulateEntityId(field.slotLabel ?? field.label ?? field.slotId);
}

export interface PopulateEntityFacet {
  slotKey: string;
  kind: "text" | "image";
  label: string;
  field: DesignerDynamicField;
}

/** Una entidad del Dataset = un desplegable en el formulario (texto + foto del mismo registro). */
export interface PopulateEntityGroup {
  entityId: string;
  label: string;
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
        label: field.slotLabel?.trim() || field.label || entityId,
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

/** Primera columna del schema que encaja con el tipo de faceta. */
export function defaultColumnForFacetKind(
  schema: FieldDef[],
  kind: "text" | "image",
  excludeIds: Set<string> = new Set(),
): FieldDef | undefined {
  return schema.find((f) => !excludeIds.has(f.id) && f.type === (kind === "image" ? "image" : "text"));
}

/** Columnas imagen del schema (poses alternativas en la misma fila). */
export function imageColumnsInSchema(schema: FieldDef[]): FieldDef[] {
  return schema.filter((f) => f.type === "image");
}

export function entityPickLabel(group: PopulateEntityGroup): string {
  const kinds = group.facets.map((f) => f.kind);
  const hasText = kinds.includes("text");
  const hasImage = kinds.includes("image");
  if (hasText && hasImage) return group.label;
  if (hasImage) return `${group.label} · imagen`;
  return group.label;
}
