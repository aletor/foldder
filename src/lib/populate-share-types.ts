import type { DesignerPageState } from "@/app/spaces/designer/DesignerNode";
import type { PopulateFormModel } from "@/app/spaces/populate/populate-designer-form";
import type { PopulateTemplateBinding } from "@/app/spaces/populate/populate-types";

export type PopulateShareOptions = {
  enabled: boolean;
  autoDisableAt: string | null;
};

export const DEFAULT_POPULATE_SHARE_OPTIONS: PopulateShareOptions = {
  enabled: true,
  autoDisableAt: null,
};

export type PopulateShareTemplateDefaults = {
  pickedRows: Record<string, string>;
  pickedPoses: Record<string, string>;
  manualValues: Record<string, string>;
};

export type PopulateShareTemplateEntry = {
  templateNodeId: string;
  templateLabel: string;
  binding: PopulateTemplateBinding;
  formModel: PopulateFormModel;
  pages: DesignerPageState[];
  slideCount: number;
  /** Selecciones del Studio al publicar — hidratan el formulario público. */
  defaults?: PopulateShareTemplateDefaults;
  /** Miniatura congelada (defaults) para pantalla A e instant load. */
  previewThumbUrl?: string;
  /** Hero inicial en pantalla B (~720px); opcional si coincide con thumb. */
  previewHeroUrl?: string;
};

export type PopulateSharePayload = {
  title: string;
  listId: string;
  /** Instantánea de filas + valores para resolver en el formulario público sin Dataset vivo. */
  rowsSnapshot: Array<{
    cardId: string;
    label: string;
    values: Record<string, import("@/app/spaces/dataset/dataset-types").FieldValue>;
  }>;
  /** 1..8 plantillas conectadas al nodo Populate. */
  templates: PopulateShareTemplateEntry[];
  /** @deprecated Compat enlaces v1 — usar `templates`. */
  binding?: PopulateTemplateBinding;
  formModel?: PopulateFormModel;
  pages?: DesignerPageState[];
  slideCount?: number;
};

export type PopulateShareRecord = {
  id: string;
  token: string;
  shareKey: string;
  populateNodeId: string;
  ownerEmail: string;
  /** Proyecto-temporada (projectScopeId al publicar). */
  projectId?: string;
  /** Agrupación de partido — estable, filtra galería pública. */
  matchId?: string;
  /** Etiqueta humana: "Partido 1 - Lakers vs Bulls". */
  matchLabel?: string;
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
  const { ownerEmail: _o, ...rest } = row;
  return normalizePopulateShareRecord(rest as PopulateShareRecord);
}

/** Rellena match/project en enlaces legacy. */
export function normalizePopulateShareRecord(row: PopulateShareRecord): PopulateShareRecord {
  return {
    ...row,
    projectId: row.projectId?.trim() || "",
    matchId: row.matchId?.trim() || `legacy_${row.token.slice(0, 12)}`,
    matchLabel: row.matchLabel?.trim() || row.name?.trim() || row.payload.title?.trim() || "Partido",
  };
}

/** Normaliza payload legacy (un solo template) al formato multi-plantilla. */
export function normalizePopulateShareTemplates(
  payload: PopulateSharePayload,
): PopulateShareTemplateEntry[] {
  if (Array.isArray(payload.templates) && payload.templates.length > 0) {
    return payload.templates;
  }
  if (payload.binding && payload.formModel && payload.pages) {
    return [
      {
        templateNodeId: payload.binding.templateNodeId,
        templateLabel: payload.binding.templateLabel,
        binding: payload.binding,
        formModel: payload.formModel,
        pages: payload.pages,
        slideCount: payload.slideCount ?? payload.pages.length,
      },
    ];
  }
  return [];
}
