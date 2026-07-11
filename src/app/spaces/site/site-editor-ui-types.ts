/** Estado UI del editor Site — no forma parte del modelo SiteProject. */

import type { SiteInspectorTab } from "@/lib/site/site-types";

/** Panel overlay lateral o modal (solo uno abierto a la vez). */
export type SiteOverlayPanel = "structure" | "theme" | "sources" | "settings";

/** @deprecated Usar SiteOverlayPanel + inspectorOpen en shell. */
export type SiteActivePanel = SiteOverlayPanel | "inspector" | null;

export type SitePreviewZoom = "fit" | "100" | "75" | "50";

export type SiteEditorChromeMode = "editor" | "clean";

/** Quick control abierto desde la barra contextual inferior. */
export type SiteQuickControl =
  | null
  | "type"
  | "alignment"
  | "width"
  | "motion"
  | "replace"
  | "ratio"
  | "fit"
  | "duotone"
  | "label"
  | "variant"
  | "target"
  | "view"
  | "density"
  | "source"
  | "split"
  | "order"
  | "more";

/** Contexto al abrir el inspector avanzado desde la barra contextual. */
export type SiteAdvancedInspectorContext =
  | { mode: "full" }
  | { mode: "focused"; tab: SiteInspectorTab; part?: "source" | "body" | "layout" | "motion" };
