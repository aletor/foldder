import type { CreativeInputDescriptor } from "@/app/spaces/populate/populate-types";
import type { PopulateFormModel } from "@/app/spaces/populate/populate-form";

export type PopulateShareTemplateModel = {
  modelKey: string;
  aspectRatio: string;
  resolution?: string;
  thinking?: boolean;
  provider?: "gemini" | "openai";
};

export type PopulateShareOptions = {
  /** Si false, el enlace deja de aceptar generaciones. */
  enabled: boolean;
  autoDisableAt: string | null;
};

export const DEFAULT_POPULATE_SHARE_OPTIONS: PopulateShareOptions = {
  enabled: true,
  autoDisableAt: null,
};

/** Instantánea del formulario y plantilla en el momento de compartir. */
export type PopulateSharePayload = {
  title: string;
  promptTemplate: string;
  formModel: PopulateFormModel;
  templateModel: PopulateShareTemplateModel;
  fixedRefUrls: Record<string, string>;
  imageInputs: CreativeInputDescriptor[];
};

export type PopulateShareRecord = {
  id: string;
  /** Segmento de URL público (opaco). */
  token: string;
  /** Clave de agrupación (populateNodeId). */
  shareKey: string;
  populateNodeId: string;
  /** Email del creador; se usa para facturar generaciones públicas. */
  ownerEmail: string;
  name: string;
  slug: string;
  options: PopulateShareOptions;
  payload: PopulateSharePayload;
  createdAt: string;
  updatedAt: string;
  visits: number;
  generations: number;
};

export type PublicPopulateShareRecord = Omit<PopulateShareRecord, "ownerEmail">;

export function toPublicPopulateShareRecord(row: PopulateShareRecord): PublicPopulateShareRecord {
  const { ownerEmail: _ownerEmail, ...rest } = row;
  return rest;
}
