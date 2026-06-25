import type { PopulateFormModel } from "./populate-form";
import type { CreativeInputDescriptor } from "./populate-types";
import type { PopulateSharePayload, PopulateShareTemplateModel } from "@/lib/populate-share-types";

/** Construye la instantánea del formulario para un enlace público. */
export function buildPopulateSharePayload(args: {
  title: string;
  promptTemplate: string;
  formModel: PopulateFormModel;
  templateModel: PopulateShareTemplateModel;
  fixedRefUrls: Record<string, string>;
  imageInputs: CreativeInputDescriptor[];
}): PopulateSharePayload {
  return {
    title: args.title.trim() || "Populate",
    promptTemplate: args.promptTemplate,
    formModel: args.formModel,
    templateModel: args.templateModel,
    fixedRefUrls: args.fixedRefUrls,
    imageInputs: args.imageInputs,
  };
}
