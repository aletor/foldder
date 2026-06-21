import type { DesignerPageState } from "@/app/spaces/designer/DesignerNode";
import type { PresenterImageVideoPlacement } from "@/app/spaces/presenter/presenter-image-video-types";
import type { SlideTransitionId } from "@/app/spaces/presenter/slide-transition-types";

/** Opciones al crear un enlace (referencia estilo Pitch). */
export type PresenterShareOptions = {
  allowDuplication: boolean;
  collectEngagementAnalytics: boolean;
  visitorConsentAnalytics: boolean;
  requirePasscode: boolean;
  passcodePlain: string;
  requireVisitorEmail: boolean;
  allowPdfDownload: boolean;
  autoDisableLink: boolean;
  /** ISO 8601 si autoDisableLink */
  autoDisableAt: string | null;
};

export const DEFAULT_PRESENTER_SHARE_OPTIONS: PresenterShareOptions = {
  allowDuplication: false,
  collectEngagementAnalytics: true,
  visitorConsentAnalytics: false,
  requirePasscode: false,
  passcodePlain: "",
  requireVisitorEmail: false,
  allowPdfDownload: false,
  autoDisableLink: false,
  autoDisableAt: null,
};

export type PresenterSharePayload = {
  pages: DesignerPageState[];
  transitionsByPageId: Record<string, SlideTransitionId>;
  /** Vídeos superpuestos en imágenes (persistidos en el nodo Presenter). */
  imageVideoPlacements?: PresenterImageVideoPlacement[];
};

export type PresenterShareRecord = {
  id: string;
  /** Segmento de URL público (opaco). */
  token: string;
  deckKey: string;
  deckTitle: string;
  name: string;
  slug: string;
  options: PresenterShareOptions;
  payload: PresenterSharePayload;
  createdAt: string;
  /** Visitas (incremento al abrir /p/[token]). */
  visits: number;
};

export type PublicPresenterShareOptions = Omit<PresenterShareOptions, "passcodePlain">;

export type PublicPresenterShareRecord = Omit<PresenterShareRecord, "options"> & {
  options: PublicPresenterShareOptions;
};

export function toPublicPresenterShareRecord(row: PresenterShareRecord): PublicPresenterShareRecord {
  const { passcodePlain: _passcodePlain, ...safeOptions } = row.options;
  return {
    ...row,
    options: safeOptions,
  };
}
