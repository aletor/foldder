import type { CreativeInputDescriptor } from "@/app/spaces/loop/loop-types";
import type { LoopFormModel } from "@/app/spaces/loop/loop-form";
import type { DesignerFormField, DesignerFormRow } from "@/app/spaces/loop/loop-designer-form";
import type { DesignerPageState } from "@/app/spaces/designer/DesignerNode";

/**
 * Variante Designer del enlace público: en lugar de generar 1 imagen por IA (server-side), el
 * cliente rasteriza la plantilla con los valores del formulario y devuelve tantas imágenes como
 * slides. No consume wallet (es render de plantilla, no generación). Lleva las páginas de la
 * plantilla (con huecos sin resolver) y los campos del formulario con sus opciones materializadas.
 */
export type LoopShareDesignerPayload = {
  pages: DesignerPageState[];
  formFields: DesignerFormField[];
  /** Filas del listado con etiquetas legibles (y valores para autorelleno en el público). */
  rows?: DesignerFormRow[];
  slideCount: number;
};

export type LoopShareTemplateModel = {
  modelKey: string;
  aspectRatio: string;
  resolution?: string;
  thinking?: boolean;
  provider?: "gemini" | "openai";
};

export type LoopShareOptions = {
  /** Si false, el enlace deja de aceptar generaciones. */
  enabled: boolean;
  autoDisableAt: string | null;
};

export const DEFAULT_LOOP_SHARE_OPTIONS: LoopShareOptions = {
  enabled: true,
  autoDisableAt: null,
};

/** Instantánea del formulario y plantilla en el momento de compartir. */
export type LoopSharePayload = {
  title: string;
  promptTemplate: string;
  formModel: LoopFormModel;
  templateModel: LoopShareTemplateModel;
  fixedRefUrls: Record<string, string>;
  imageInputs: CreativeInputDescriptor[];
  /** Presente solo en enlaces de plantilla Designer (rasterizado en cliente, N imágenes). */
  designer?: LoopShareDesignerPayload;
};

export type LoopShareRecord = {
  id: string;
  /** Segmento de URL público (opaco). */
  token: string;
  /** Clave de agrupación (loopNodeId). */
  shareKey: string;
  loopNodeId: string;
  /** Email del creador; se usa para facturar generaciones públicas. */
  ownerEmail: string;
  name: string;
  slug: string;
  options: LoopShareOptions;
  payload: LoopSharePayload;
  createdAt: string;
  updatedAt: string;
  visits: number;
  generations: number;
};

export type PublicLoopShareRecord = Omit<LoopShareRecord, "ownerEmail">;

export function toPublicLoopShareRecord(row: LoopShareRecord): PublicLoopShareRecord {
  const { ownerEmail: _ownerEmail, ...rest } = row;
  return rest;
}
