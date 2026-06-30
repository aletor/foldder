import type { LoopFormModel } from "./loop-form";
import type { CreativeInputDescriptor } from "./loop-types";
import type { LoopSharePayload, LoopShareTemplateModel } from "@/lib/loop-share-types";

/** Construye la instantánea del formulario para un enlace público. */
export function buildLoopSharePayload(args: {
  title: string;
  promptTemplate: string;
  formModel: LoopFormModel;
  templateModel: LoopShareTemplateModel;
  fixedRefUrls: Record<string, string>;
  imageInputs: CreativeInputDescriptor[];
}): LoopSharePayload {
  return {
    title: args.title.trim() || "Loop",
    promptTemplate: args.promptTemplate,
    formModel: args.formModel,
    templateModel: args.templateModel,
    fixedRefUrls: args.fixedRefUrls,
    imageInputs: args.imageInputs,
  };
}
