/**
 * Schema del bloque «Marca · BrandKit» dentro de un Dataset conectado a projectBrain.
 */

import type { BrainVisualStyleSlotKey } from "@/app/spaces/project-assets-metadata";
import type { FieldDef } from "@/app/spaces/dataset/dataset-types";
import { brandKitConstantId } from "./brandkit-logic";

export const BRANDKIT_DATASET_MAX_MESSAGES = 5;
export const BRANDKIT_DATASET_MAX_GALLERY = 5;
export const BRANDKIT_DATASET_SHEET_ID = "__brandkit__";
export const BRANDKIT_MESSAGES_LIST_NAME = "Marca · Mensajes";
export const BRANDKIT_GALLERY_LIST_NAME = "Marca · Imágenes ejemplo";

export const BRANDKIT_DATASET_FIELD_IDS = {
  context: "context",
  tone: "tone",
  colorPrimary: "color_primary",
  colorSecondary: "color_secondary",
  colorAccent: "color_accent",
  logoPositive: "logo_positive",
  logoNegative: "logo_negative",
  imageEnvironment: "image_environment",
  imageTextures: "image_textures",
  imagePeople: "image_people",
  imageObjects: "image_objects",
  imageProtagonist: "image_protagonist",
} as const;

export type BrandKitDatasetFieldId =
  (typeof BRANDKIT_DATASET_FIELD_IDS)[keyof typeof BRANDKIT_DATASET_FIELD_IDS];

export const BRANDKIT_VISUAL_SLOT_KEYS: BrainVisualStyleSlotKey[] = [
  "environment",
  "textures",
  "people",
  "objects",
  "protagonist",
];

export const BRANDKIT_GALLERY_CATEGORIES = [
  "environment",
  "textures",
  "people",
  "objects",
  "protagonist",
] as const;

export type BrandKitGalleryCategory = (typeof BRANDKIT_GALLERY_CATEGORIES)[number];

export interface BrandKitDatasetLink {
  brainNodeId: string;
  messagesListId: string;
  galleryListId: string;
}

export function brandKitDatasetConstantId(brainNodeId: string, fieldId: BrandKitDatasetFieldId): string {
  return brandKitConstantId(brainNodeId, fieldId);
}

export function isBrandKitDatasetConstantId(constantId: string, brainNodeId?: string): boolean {
  if (!constantId.startsWith("bk:")) return false;
  if (!brainNodeId) return true;
  return constantId.startsWith(`bk:${brainNodeId}:`);
}

export function brandKitDatasetConstantDefs(brainNodeId: string): FieldDef[] {
  const F = BRANDKIT_DATASET_FIELD_IDS;
  const id = (fieldId: BrandKitDatasetFieldId) => brandKitDatasetConstantId(brainNodeId, fieldId);
  return [
    { id: id(F.context), key: id(F.context), label: "Contexto de marca", type: "text", required: false },
    { id: id(F.tone), key: id(F.tone), label: "Tono y rasgos", type: "text", required: false },
    {
      id: id(F.colorPrimary),
      key: id(F.colorPrimary),
      label: "Color primario",
      type: "color",
      required: false,
    },
    {
      id: id(F.colorSecondary),
      key: id(F.colorSecondary),
      label: "Color secundario",
      type: "color",
      required: false,
    },
    { id: id(F.colorAccent), key: id(F.colorAccent), label: "Color acento", type: "color", required: false },
    { id: id(F.logoPositive), key: id(F.logoPositive), label: "Logo positivo", type: "image", required: false },
    { id: id(F.logoNegative), key: id(F.logoNegative), label: "Logo negativo", type: "image", required: false },
    {
      id: id(F.imageEnvironment),
      key: id(F.imageEnvironment),
      label: "Entorno",
      type: "image",
      required: false,
    },
    {
      id: id(F.imageTextures),
      key: id(F.imageTextures),
      label: "Texturas",
      type: "image",
      required: false,
    },
    { id: id(F.imagePeople), key: id(F.imagePeople), label: "Personas", type: "image", required: false },
    { id: id(F.imageObjects), key: id(F.imageObjects), label: "Objetos", type: "image", required: false },
    {
      id: id(F.imageProtagonist),
      key: id(F.imageProtagonist),
      label: "Protagonista",
      type: "image",
      required: false,
    },
  ];
}

export function brandKitMessagesListSchema(): FieldDef[] {
  return [{ id: "message", key: "message", label: "Mensaje", type: "text", required: false }];
}

export function brandKitGalleryListSchema(): FieldDef[] {
  return [
    {
      id: "category",
      key: "category",
      label: "Categoría",
      type: "select",
      required: false,
      options: [...BRANDKIT_GALLERY_CATEGORIES],
    },
    { id: "image", key: "image", label: "Imagen", type: "image", required: false },
  ];
}

export function brandKitMessagesListKey(brainNodeId: string): string {
  return `bk_${brainNodeId.replace(/[^a-zA-Z0-9_-]/g, "_")}_messages`;
}

export function brandKitGalleryListKey(brainNodeId: string): string {
  return `bk_${brainNodeId.replace(/[^a-zA-Z0-9_-]/g, "_")}_gallery`;
}
