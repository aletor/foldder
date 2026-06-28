/**
 * BrandKit — "objeto inteligente" de marca, editable en un único punto y referenciable
 * en vivo desde cualquier Designer (logo, colores, handle). Internamente es un bloque de
 * `Constants` del Dataset con 4 campos fijos (v1), de modo que reutiliza por completo la
 * resolución de bindings que ya existe (constantes → propiedad/contenido del Designer).
 */

import type { Constants, FieldDef } from "@/app/spaces/dataset/dataset-types";

/** Ids estables de los 4 campos del BrandKit v1. NO cambiar: son la identidad del binding. */
export const BRANDKIT_FIELD_IDS = {
  logo: "logo",
  primaryColor: "primaryColor",
  secondaryColor: "secondaryColor",
  socialHandle: "socialHandle",
} as const;

export type BrandKitFieldId = (typeof BRANDKIT_FIELD_IDS)[keyof typeof BRANDKIT_FIELD_IDS];

/** Schema fijo del BrandKit v1 (exactamente estos 4 campos, nada más). */
export const BRANDKIT_SCHEMA: FieldDef[] = [
  { id: BRANDKIT_FIELD_IDS.logo, key: "logo", label: "Logo", type: "image", required: false },
  { id: BRANDKIT_FIELD_IDS.primaryColor, key: "primaryColor", label: "Color primario", type: "color", required: false },
  { id: BRANDKIT_FIELD_IDS.secondaryColor, key: "secondaryColor", label: "Color secundario", type: "color", required: false },
  { id: BRANDKIT_FIELD_IDS.socialHandle, key: "socialHandle", label: "Handle", type: "text", required: false },
];

export interface BrandKitNodeData {
  label?: string;
  /** Activos de marca, modelados como Constants para reutilizar la resolución del Dataset. */
  brand?: Constants;
  /** Versión de contenido: se incrementa en cada edición (señal barata de cambio). */
  version?: number;
  _foldderStudioTouched?: boolean;
}
