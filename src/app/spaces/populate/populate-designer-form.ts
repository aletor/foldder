import type { Dataset } from "@/app/spaces/dataset/dataset-types";
import {
  fieldValueAsText,
  getListFieldImageAtRow,
  getListFieldTextAtRow,
} from "@/app/spaces/dataset/dataset-logic";
import { datasetListRowLabel } from "@/app/spaces/loop/loop-row-label";
import type { DesignerSlotValueMap } from "@/app/spaces/loop/loop-designer-form";
import type { DesignerDynamicField } from "@/app/spaces/loop/loop-designer-fields";
import {
  datasetPickFacetCount,
  groupPendingFieldsIntoEntities,
  imageColumnsInSchema,
  populateEntityUsesLegacyPosePicker,
  populateImagePoseOverrideFieldId,
  slotKeyForDynamicField,
} from "./populate-entity-groups";
import type { PopulateTemplateBinding } from "./populate-types";

export interface PopulatePickOption {
  cardId: string;
  label: string;
}

export interface PopulateFormEntityFacet {
  slotKey: string;
  kind: "text" | "image";
  label: string;
  sourceKind: "dataset" | "manual";
}

/** Un desplegable del formulario = una entidad (mismo registro para texto + imagen). */
export interface PopulateFormEntity {
  pickId: string;
  entityId: string;
  label: string;
  options: PopulatePickOption[];
  facets: PopulateFormEntityFacet[];
  /** Segundo desplegable cuando hay varias columnas imagen (poses en la misma fila). */
  poseFieldId?: string;
  poseOptions: Array<{ fieldId: string; label: string }>;
}

export interface PopulateFormField {
  slotKey: string;
  kind: "text" | "image";
  label: string;
  sourceKind: "dataset" | "manual";
  pickId?: string;
  entityId?: string;
}

/** @deprecated Usar entities — mantener picks para compat. */
export interface PopulateFormPick {
  id: string;
  label: string;
  options: PopulatePickOption[];
}

export interface PopulateFormModel {
  entities: PopulateFormEntity[];
  picks: PopulateFormPick[];
  fields: PopulateFormField[];
  slideCount: number;
  empty: boolean;
}

export function derivePopulateForm(args: {
  binding: PopulateTemplateBinding;
  dynamicFields: DesignerDynamicField[];
  dataset: Dataset;
  listId: string;
  slideCount: number;
}): PopulateFormModel {
  const { binding, dynamicFields, dataset, listId, slideCount } = args;
  const list = dataset.lists.find((l) => l.id === listId);
  const schema = list?.schema ?? [];
  const entityGroups = groupPendingFieldsIntoEntities(dynamicFields);
  const imageCols = imageColumnsInSchema(schema);

  const pickOptions: PopulatePickOption[] = (list?.cards ?? []).map((card, rowIndex) => ({
    cardId: card.id,
    label: datasetListRowLabel(dataset, listId, schema, rowIndex),
  }));

  const entities: PopulateFormEntity[] = entityGroups.map((group) => {
    const pick = binding.picks.find((p) => p.entityId === group.entityId) ?? binding.picks[0];
    const poseFieldId = binding.entityPoseColumnFieldId?.[group.entityId];
    const hasImage = group.facets.some((f) => f.kind === "image");
    const poseOptions =
      hasImage && imageCols.length > 1 && populateEntityUsesLegacyPosePicker(group, imageCols.length)
        ? imageCols.map((c) => ({ fieldId: c.id, label: c.label }))
        : [];

    return {
      pickId: pick?.id ?? "",
      entityId: group.entityId,
      label: pick?.label ?? group.label,
      options: pickOptions,
      facets: group.facets.map((facet) => {
        const src = binding.sources[facet.slotKey];
        return {
          slotKey: facet.slotKey,
          kind: facet.kind,
          label: facet.label,
          sourceKind: src?.kind === "manual" ? "manual" : "dataset",
        };
      }),
      poseFieldId,
      poseOptions,
    };
  });

  const picks: PopulateFormPick[] = entities.map((e) => ({
    id: e.pickId,
    label: e.label,
    options: e.options,
  }));

  const fields: PopulateFormField[] = entityGroups.flatMap((group) =>
    group.facets.map((facet) => {
      const slotKey = slotKeyForDynamicField(facet.field);
      const src = binding.sources[slotKey];
      return {
        slotKey,
        kind: facet.kind,
        label: facet.label,
        sourceKind: src?.kind === "manual" ? "manual" : "dataset",
        pickId: src?.kind === "dataset" ? src.pickId : undefined,
        entityId: group.entityId,
      };
    }),
  );

  return {
    entities,
    picks,
    fields,
    slideCount,
    empty: fields.length === 0,
  };
}

/** Normaliza formModel para UI pública (compat enlaces legacy sin `entities`). */
export function resolvePublicPopulateEntities(formModel: PopulateFormModel): PopulateFormEntity[] {
  if (formModel.entities.length > 0) return formModel.entities;
  return formModel.picks.map((p) => ({
    pickId: p.id,
    entityId: p.id,
    label: p.label,
    options: p.options,
    facets: formModel.fields
      .filter((f) => f.pickId === p.id)
      .map((f) => ({
        slotKey: f.slotKey,
        kind: f.kind,
        label: f.label,
        sourceKind: f.sourceKind,
      })),
    poseOptions: [] as Array<{ fieldId: string; label: string }>,
    poseFieldId: undefined,
  }));
}

function cardIndex(dataset: Dataset, listId: string, cardId: string): number {
  const list = dataset.lists.find((l) => l.id === listId);
  return list?.cards.findIndex((c) => c.id === cardId) ?? -1;
}

function resolveSlotFromRow(args: {
  slotKey: string;
  binding: PopulateTemplateBinding;
  rowIndex: number;
  listId: string;
  dataset: Dataset;
  poseFieldId?: string;
}): DesignerSlotValueMap[string] | undefined {
  const { slotKey, binding, rowIndex, listId, dataset, poseFieldId } = args;
  const col = binding.slotColumns[slotKey];
  const source = binding.sources[slotKey];
  let fieldId =
    col?.fieldId || (source?.kind === "dataset" ? source.columnFieldId : undefined);
  const colListId = col?.listId || listId;

  const facetKind = slotKey.endsWith("::image") ? "image" : slotKey.includes("image") ? "image" : "text";
  if (facetKind === "image" && poseFieldId) {
    fieldId = poseFieldId;
  }
  if (!fieldId) return undefined;

  const image = getListFieldImageAtRow(dataset, colListId, fieldId, rowIndex);
  if (image?.url) {
    return { kind: "image", url: image.url, w: image.w, h: image.h };
  }
  const text = getListFieldTextAtRow(dataset, colListId, fieldId, rowIndex);
  if (text?.trim()) {
    return { kind: "text", text: text.trim() };
  }
  const fallback = fieldValueAsText(
    dataset.lists.find((l) => l.id === colListId)?.cards[rowIndex]?.values[fieldId],
  );
  if (fallback.trim()) return { kind: "text", text: fallback.trim() };
  return undefined;
}

export function resolvePopulateSlotValues(args: {
  binding: PopulateTemplateBinding;
  dataset: Dataset;
  listId: string;
  pickedRows: Record<string, string>;
  manualValues: Record<string, string>;
  /** entityId → fieldId de columna imagen (pose) */
  pickedPoses?: Record<string, string>;
}): DesignerSlotValueMap {
  const { binding, dataset, listId, pickedRows, manualValues, pickedPoses } = args;
  const out: DesignerSlotValueMap = {};

  for (const [slotKey, src] of Object.entries(binding.sources)) {
    if (src.kind === "manual") {
      const raw = manualValues[slotKey]?.trim();
      if (!raw) continue;
      if (raw.startsWith("http") || raw.startsWith("/") || raw.startsWith("data:image")) {
        out[slotKey] = { kind: "image", url: raw };
      } else {
        out[slotKey] = { kind: "text", text: raw };
      }
      continue;
    }

    const pickCardId = pickedRows[src.pickId];
    if (!pickCardId) continue;
    const rowIndex = cardIndex(dataset, listId, pickCardId);
    if (rowIndex < 0) continue;

    const pick = binding.picks.find((p) => p.id === src.pickId);
    const entityId = pick?.entityId;
    const poseFieldId = populateImagePoseOverrideFieldId({
      slotKey,
      entityId,
      pickedPoses,
      entityPoseColumnFieldId: binding.entityPoseColumnFieldId,
      pickFacetCount: datasetPickFacetCount(binding, src.pickId),
    });

    const resolved = resolveSlotFromRow({
      slotKey,
      binding,
      rowIndex,
      listId,
      dataset,
      poseFieldId,
    });
    if (resolved) out[slotKey] = resolved;
  }

  return out;
}

export function resolvePopulateSlotValuesFromSnapshot(args: {
  binding: PopulateTemplateBinding;
  listId: string;
  rowsSnapshot: Array<{ cardId: string; values: Record<string, import("@/app/spaces/dataset/dataset-types").FieldValue> }>;
  pickedRows: Record<string, string>;
  manualValues: Record<string, string>;
  pickedPoses?: Record<string, string>;
}): DesignerSlotValueMap {
  const { binding, rowsSnapshot, pickedRows, manualValues, pickedPoses } = args;
  const out: DesignerSlotValueMap = {};
  const rowByCard = new Map(rowsSnapshot.map((r) => [r.cardId, r]));

  for (const [slotKey, src] of Object.entries(binding.sources)) {
    if (src.kind === "manual") {
      const raw = manualValues[slotKey]?.trim();
      if (!raw) continue;
      if (raw.startsWith("http") || raw.startsWith("/") || raw.startsWith("data:image")) {
        out[slotKey] = { kind: "image", url: raw };
      } else {
        out[slotKey] = { kind: "text", text: raw };
      }
      continue;
    }

    const cardId = pickedRows[src.pickId];
    if (!cardId) continue;
    const row = rowByCard.get(cardId);
    if (!row) continue;

    const pick = binding.picks.find((p) => p.id === src.pickId);
    const entityId = pick?.entityId;
    let fieldId = binding.slotColumns[slotKey]?.fieldId || src.columnFieldId;
    const poseOverride = populateImagePoseOverrideFieldId({
      slotKey,
      entityId,
      pickedPoses,
      entityPoseColumnFieldId: binding.entityPoseColumnFieldId,
      pickFacetCount: datasetPickFacetCount(binding, src.pickId),
    });
    if (poseOverride) {
      fieldId = poseOverride;
    }
    if (!fieldId) continue;

    const val = row.values[fieldId];
    if (!val) continue;
    if (val.type === "image" && val.url) {
      out[slotKey] = { kind: "image", url: val.url, w: val.w, h: val.h };
    } else if (val.type === "text" || val.type === "number") {
      const text = val.type === "text" ? val.value : String(val.value);
      if (text.trim()) out[slotKey] = { kind: "text", text: text.trim() };
    } else {
      const text = fieldValueAsText(val);
      if (text.trim()) out[slotKey] = { kind: "text", text: text.trim() };
    }
  }

  return out;
}
