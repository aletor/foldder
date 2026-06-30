import { derivePopulateForm } from "./populate-designer-form";
import type { PopulateDesignerTemplateConfig } from "./populate-designer-template";
import type { PopulateTemplateBinding } from "./populate-types";
import type { Dataset } from "@/app/spaces/dataset/dataset-types";
import type {
  PopulateShareTemplateDefaults,
  PopulateShareTemplateEntry,
} from "@/lib/populate-share-types";

/** Resolución congelada al compartir (thumb + hero inicial). */
export const POPULATE_SHARE_PREVIEW_MAX_SIDE = 720;
/** Preview en vivo en el formulario público. */
export const POPULATE_PUBLIC_LIVE_PREVIEW_MAX_SIDE = 480;

export function defaultPickedRowsForPopulateForm(
  binding: PopulateTemplateBinding,
  template: PopulateDesignerTemplateConfig,
  dataset: Dataset,
  listId: string,
): Record<string, string> {
  const form = derivePopulateForm({
    binding,
    dynamicFields: template.dynamicFields,
    dataset,
    listId,
    slideCount: template.pages.length,
  });
  const pickedRows: Record<string, string> = {};
  for (const entity of form.entities) {
    const cardId = entity.options[0]?.cardId;
    if (cardId && entity.pickId) pickedRows[entity.pickId] = cardId;
  }
  return pickedRows;
}

export function buildPopulateShareDefaults(args: {
  binding: PopulateTemplateBinding;
  template: PopulateDesignerTemplateConfig;
  dataset: Dataset;
  listId: string;
  studioPreview?: PopulateShareTemplateDefaults | null;
  useStudioPreview?: boolean;
}): PopulateShareTemplateDefaults {
  if (args.useStudioPreview && args.studioPreview) {
    return {
      pickedRows: args.studioPreview.pickedRows,
      pickedPoses: args.studioPreview.pickedPoses,
      manualValues: args.studioPreview.manualValues,
    };
  }

  return {
    pickedRows: defaultPickedRowsForPopulateForm(
      args.binding,
      args.template,
      args.dataset,
      args.listId,
    ),
    pickedPoses: args.binding.entityPoseColumnFieldId ?? {},
    manualValues: {},
  };
}

/** Hidrata defaults en enlaces legacy sin bloque `defaults`. */
export function resolvePopulateShareDefaults(
  entry: PopulateShareTemplateEntry,
): PopulateShareTemplateDefaults {
  if (entry.defaults) return entry.defaults;

  const pickedRows: Record<string, string> = {};
  for (const entity of entry.formModel.entities ?? []) {
    const cardId = entity.options[0]?.cardId;
    if (cardId && entity.pickId) pickedRows[entity.pickId] = cardId;
  }
  return {
    pickedRows,
    pickedPoses: entry.binding.entityPoseColumnFieldId ?? {},
    manualValues: {},
  };
}
