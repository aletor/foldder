import type { DesignerDynamicField } from "@/app/spaces/loop/loop-designer-fields";
import type { Dataset } from "@/app/spaces/dataset/dataset-types";
import { datasetListRowLabel } from "@/app/spaces/loop/loop-row-label";
import type { PopulateDesignerTemplateConfig } from "./populate-designer-template";
import { derivePopulateForm } from "./populate-designer-form";
import type { PopulateTemplateBinding } from "./populate-types";
import type { PopulateSharePayload, PopulateShareTemplateEntry } from "@/lib/populate-share-types";
import { bindingForTemplate } from "./populate-designer-binding";
import type { PopulateShareTemplateDefaults } from "@/lib/populate-share-types";
import { buildPopulateShareDefaults } from "./populate-share-defaults";

export type PopulateShareTemplatePreview = {
  defaults: PopulateShareTemplateDefaults;
  previewThumbUrl?: string;
  previewHeroUrl?: string;
};

function rowsSnapshotForList(dataset: Dataset, listId: string) {
  const list = dataset.lists.find((l) => l.id === listId);
  const schema = list?.schema ?? [];
  return (list?.cards ?? []).map((card, rowIndex) => ({
    cardId: card.id,
    label: datasetListRowLabel(dataset, listId, schema, rowIndex),
    values: card.values,
  }));
}

function templateEntry(args: {
  template: PopulateDesignerTemplateConfig;
  binding: PopulateTemplateBinding;
  dataset: Dataset;
  listId: string;
  sharePreview?: PopulateShareTemplatePreview;
}): PopulateShareTemplateEntry {
  const formModel = derivePopulateForm({
    binding: args.binding,
    dynamicFields: args.template.dynamicFields,
    dataset: args.dataset,
    listId: args.listId,
    slideCount: args.template.pages.length,
  });
  return {
    templateNodeId: args.template.templateNodeId,
    templateLabel: args.template.templateLabel,
    binding: args.binding,
    formModel,
    pages: args.template.pages,
    slideCount: args.template.pages.length,
    ...(args.sharePreview
      ? {
          defaults: args.sharePreview.defaults,
          previewThumbUrl: args.sharePreview.previewThumbUrl,
          previewHeroUrl: args.sharePreview.previewHeroUrl,
        }
      : {}),
  };
}

export function buildPopulateSharePayload(args: {
  title: string;
  dataset: Dataset;
  listId: string;
  templates: PopulateDesignerTemplateConfig[];
  bindings: PopulateTemplateBinding[];
  /** Por templateNodeId — defaults congelados y URLs de preview al compartir. */
  sharePreviewsByTemplateId?: Record<string, PopulateShareTemplatePreview>;
  /** Defaults del Studio para la plantilla activa (si no hay entrada en sharePreviewsByTemplateId). */
  studioPreview?: PopulateShareTemplateDefaults | null;
  studioPreviewTemplateNodeId?: string;
}): PopulateSharePayload {
  const entries = args.templates
    .map((template) => {
      const binding = bindingForTemplate(args.bindings, template.templateNodeId);
      if (!binding) return null;
      const frozen = args.sharePreviewsByTemplateId?.[template.templateNodeId];
      const sharePreview =
        frozen ??
        ({
          defaults: buildPopulateShareDefaults({
            binding,
            template,
            dataset: args.dataset,
            listId: args.listId,
            studioPreview: args.studioPreview,
            useStudioPreview: args.studioPreviewTemplateNodeId === template.templateNodeId,
          }),
        } satisfies PopulateShareTemplatePreview);
      return templateEntry({
        template,
        binding,
        dataset: args.dataset,
        listId: args.listId,
        sharePreview,
      });
    })
    .filter((e): e is PopulateShareTemplateEntry => e != null);

  const first = entries[0];
  return {
    title: args.title.trim() || "Populate",
    listId: args.listId,
    rowsSnapshot: rowsSnapshotForList(args.dataset, args.listId),
    templates: entries,
    ...(first
      ? {
          binding: first.binding,
          formModel: first.formModel,
          pages: first.pages,
          slideCount: first.slideCount,
        }
      : {}),
  };
}

/** @deprecated Usar buildPopulateSharePayload con `templates` + `bindings`. */
export function buildPopulateSharePayloadSingle(args: {
  title: string;
  binding: PopulateTemplateBinding;
  dynamicFields: DesignerDynamicField[];
  dataset: Dataset;
  listId: string;
  pages: import("@/app/spaces/designer/DesignerNode").DesignerPageState[];
  slideCount: number;
}): PopulateSharePayload {
  const template: PopulateDesignerTemplateConfig = {
    templateNodeId: args.binding.templateNodeId,
    templateType: "designer",
    templateLabel: args.binding.templateLabel,
    pages: args.pages,
    dynamicFields: args.dynamicFields,
  };
  return buildPopulateSharePayload({
    title: args.title,
    dataset: args.dataset,
    listId: args.listId,
    templates: [template],
    bindings: [args.binding],
  });
}
