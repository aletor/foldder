import type { Dataset } from "@/app/spaces/dataset/dataset-types";
import type { DesignerDynamicField } from "@/app/spaces/loop/loop-designer-fields";
import type { DesignerTemplateConfig } from "@/app/spaces/loop/loop-designer-template";
import {
  entityPickLabel,
  groupPendingFieldsIntoEntities,
  imageColumnsInSchema,
  normalizePopulateEntityId,
  resolveSchemaColumnForFacet,
  slotKeyForDynamicField,
} from "./populate-entity-groups";
import type {
  PopulateFieldSource,
  PopulateRowPick,
  PopulateTemplateBinding,
} from "./populate-types";

function newPickId(): string {
  return `pick_${Math.random().toString(36).slice(2, 10)}`;
}

function defaultLabelColumn(dataset: Dataset, listId: string): { fieldId: string; fieldKey: string } {
  const list = dataset.lists.find((l) => l.id === listId);
  const text = list?.schema.find((f) => f.type === "text");
  if (text) return { fieldId: text.id, fieldKey: text.key };
  const first = list?.schema[0];
  return { fieldId: first?.id ?? "", fieldKey: first?.key ?? "" };
}

function findPickForEntity(picks: PopulateRowPick[], entityId: string): PopulateRowPick | undefined {
  return picks.find((p) => p.entityId === entityId || normalizePopulateEntityId(p.label) === entityId);
}

/** Crea o actualiza el binding: una selección (pick) por entidad, facets comparten fila. */
export function syncPopulateTemplateBinding(args: {
  prev: PopulateTemplateBinding | undefined;
  template: DesignerTemplateConfig;
  dataset: Dataset;
  listId: string;
}): PopulateTemplateBinding {
  const { template, dataset, listId } = args;
  const entities = groupPendingFieldsIntoEntities(template.dynamicFields);
  const list = dataset.lists.find((l) => l.id === listId);
  const schema = list?.schema ?? [];
  const labelCol = defaultLabelColumn(dataset, listId);
  const imageCols = imageColumnsInSchema(schema);

  const sources: Record<string, PopulateFieldSource> = { ...(args.prev?.sources ?? {}) };
  const slotColumns: PopulateTemplateBinding["slotColumns"] = {
    ...(args.prev?.slotColumns ?? {}),
  };
  const entityPoseColumnFieldId: Record<string, string> = {
    ...(args.prev?.entityPoseColumnFieldId ?? {}),
  };
  let picks: PopulateRowPick[] = [...(args.prev?.picks ?? [])];

  for (const entity of entities) {
    let pick = findPickForEntity(picks, entity.entityId);
    if (!pick) {
      pick = {
        id: newPickId(),
        entityId: entity.entityId,
        label: entityPickLabel(entity),
      };
      picks = [...picks, pick];
    } else if (!pick.entityId) {
      pick = { ...pick, entityId: entity.entityId };
      picks = picks.map((p) => (p.id === pick!.id ? pick! : p));
    }

    const usedColumnIds = new Set<string>();
    for (const facet of entity.facets) {
      const slotKey = slotKeyForDynamicField(facet.field);
      const prevCol = slotColumns[slotKey];
      const autoCol =
        prevCol?.fieldId
          ? schema.find((f) => f.id === prevCol.fieldId)
          : resolveSchemaColumnForFacet(schema, facet, usedColumnIds);

      if (autoCol) usedColumnIds.add(autoCol.id);

      if (autoCol && list) {
        slotColumns[slotKey] = {
          listId,
          listKey: list.key,
          fieldId: autoCol.id,
          fieldKey: autoCol.key,
        };
      }

      const prevSrc = sources[slotKey];
      if (prevSrc?.kind === "manual") {
        sources[slotKey] = prevSrc;
        continue;
      }

      sources[slotKey] = {
        kind: "dataset",
        pickId: pick.id,
        columnFieldId: autoCol?.id ?? prevSrc?.columnFieldId ?? "",
        columnFieldKey: autoCol?.key ?? prevSrc?.columnFieldKey,
      };
    }

    const imageFacets = entity.facets.filter((f) => f.kind === "image");
    /** Pose compartida solo en modo legacy (un facet imagen, sin carpeta, ≤2 huecos). */
    if (
      imageFacets.length === 1 &&
      imageCols.length > 1 &&
      !entity.folderLabel &&
      entity.facets.length <= 2
    ) {
      const current =
        entityPoseColumnFieldId[entity.entityId] ??
        slotColumns[imageFacets[0]!.slotKey]?.fieldId ??
        imageCols[0]?.id;
      if (current) {
        entityPoseColumnFieldId[entity.entityId] = current;
        for (const facet of imageFacets) {
          const col = schema.find((f) => f.id === current);
          if (col && list) {
            slotColumns[facet.slotKey] = {
              listId,
              listKey: list.key,
              fieldId: col.id,
              fieldKey: col.key,
            };
            const src = sources[facet.slotKey];
            if (src?.kind === "dataset") {
              sources[facet.slotKey] = {
                ...src,
                columnFieldId: col.id,
                columnFieldKey: col.key,
              };
            }
          }
        }
      }
    } else if (entity.folderLabel) {
      delete entityPoseColumnFieldId[entity.entityId];
    }
  }

  const activeEntityIds = new Set(entities.map((e) => e.entityId));
  picks = picks.filter((p) => !p.entityId || activeEntityIds.has(p.entityId));

  const activeSlotKeys = new Set(
    entities.flatMap((e) => e.facets.map((f) => slotKeyForDynamicField(f.field))),
  );
  for (const key of Object.keys(sources)) {
    if (!activeSlotKeys.has(key)) delete sources[key];
  }
  for (const key of Object.keys(slotColumns)) {
    if (!activeSlotKeys.has(key)) delete slotColumns[key];
  }
  for (const eid of Object.keys(entityPoseColumnFieldId)) {
    if (!activeEntityIds.has(eid)) delete entityPoseColumnFieldId[eid];
  }

  return {
    templateNodeId: template.templateNodeId,
    templateLabel: template.templateLabel,
    labelColumnFieldId: args.prev?.labelColumnFieldId || labelCol.fieldId,
    labelColumnFieldKey: args.prev?.labelColumnFieldKey || labelCol.fieldKey,
    picks,
    sources,
    slotColumns,
    entityPoseColumnFieldId:
      Object.keys(entityPoseColumnFieldId).length > 0 ? entityPoseColumnFieldId : undefined,
    pagesSnapshot: template.pages,
  };
}

export function bindingForTemplate(
  bindings: PopulateTemplateBinding[],
  templateNodeId: string,
): PopulateTemplateBinding | undefined {
  return bindings.find((b) => b.templateNodeId === templateNodeId);
}

export function patchPopulateBinding(
  bindings: PopulateTemplateBinding[],
  templateNodeId: string,
  patch: Partial<PopulateTemplateBinding>,
): PopulateTemplateBinding[] {
  return bindings.map((b) =>
    b.templateNodeId === templateNodeId ? { ...b, ...patch } : b,
  );
}

export function listPendingFieldsForBinding(
  dynamicFields: DesignerDynamicField[],
): DesignerDynamicField[] {
  return dynamicFields.filter((f) => f.status === "pending");
}

export function setEntityManualMode(
  binding: PopulateTemplateBinding,
  entityId: string,
  manual: boolean,
  entities: ReturnType<typeof groupPendingFieldsIntoEntities>,
): PopulateTemplateBinding {
  const entity = entities.find((e) => e.entityId === entityId);
  if (!entity) return binding;
  const nextSources = { ...binding.sources };
  for (const facet of entity.facets) {
    if (manual) {
      nextSources[facet.slotKey] = { kind: "manual" };
    } else {
      const pick = binding.picks.find((p) => p.entityId === entityId);
      const col = binding.slotColumns[facet.slotKey];
      nextSources[facet.slotKey] = {
        kind: "dataset",
        pickId: pick?.id ?? binding.picks[0]?.id ?? "",
        columnFieldId: col?.fieldId ?? "",
        columnFieldKey: col?.fieldKey,
      };
    }
  }
  return { ...binding, sources: nextSources };
}

export function patchEntityPoseColumn(
  binding: PopulateTemplateBinding,
  entityId: string,
  fieldId: string,
  listId: string,
  listKey: string,
  fieldKey: string,
  entities: ReturnType<typeof groupPendingFieldsIntoEntities>,
): PopulateTemplateBinding {
  const entity = entities.find((e) => e.entityId === entityId);
  if (!entity) return binding;
  const nextSlotColumns = { ...binding.slotColumns };
  const nextSources = { ...binding.sources };
  for (const facet of entity.facets.filter((f) => f.kind === "image")) {
    nextSlotColumns[facet.slotKey] = { listId, listKey, fieldId, fieldKey };
    const src = nextSources[facet.slotKey];
    if (src?.kind === "dataset") {
      nextSources[facet.slotKey] = { ...src, columnFieldId: fieldId, columnFieldKey: fieldKey };
    }
  }
  return {
    ...binding,
    slotColumns: nextSlotColumns,
    sources: nextSources,
    entityPoseColumnFieldId: {
      ...(binding.entityPoseColumnFieldId ?? {}),
      [entityId]: fieldId,
    },
  };
}

export { groupPendingFieldsIntoEntities };
