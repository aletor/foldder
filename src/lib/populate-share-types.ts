import type { CreativeInputDescriptor } from "@/app/spaces/populate/populate-types";
import type { PopulateFormModel } from "@/app/spaces/populate/populate-form";
import type { DesignerFormField } from "@/app/spaces/populate/populate-designer-form";
import type { DesignerPageState } from "@/app/spaces/designer/DesignerNode";

/**
 * Variante Designer del enlace público: en lugar de generar 1 imagen por IA (server-side), el
 * cliente rasteriza la plantilla con los valores del formulario y devuelve tantas imágenes como
 * slides. No consume wallet (es render de plantilla, no generación). Lleva las páginas de la
 * plantilla (con huecos sin resolver) y los campos del formulario con sus opciones materializadas.
 */
export type PopulateShareDesignerPayload = {
  pages: DesignerPageState[];
  formFields: DesignerFormField[];
  slideCount: number;
};

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
  /** Presente solo en enlaces de plantilla Designer (rasterizado en cliente, N imágenes). */
  designer?: PopulateShareDesignerPayload;
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
