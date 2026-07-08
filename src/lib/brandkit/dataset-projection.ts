/**
 * Proyección central BrandKit → Dataset (A2).
 * Valores operativos + metadata sidecar (`status`, `sourceId`, `elementKey`) por fila.
 */

import type { BrainVisualStyleSlotKey, ProjectAssetsMetadata } from "@/app/spaces/project-assets-metadata";
import { normalizeProjectAssets } from "@/app/spaces/project-assets-metadata";
import { bootstrapSidecarFromAssets } from "./board-projection";
import {
  resolveBrandKitDatasetColors,
  resolveBrandKitDatasetContext,
  resolveBrandKitDatasetGallery,
  resolveBrandKitDatasetLogos,
  resolveBrandKitDatasetMessage,
  resolveBrandKitDatasetTone,
  resolveBrandKitDatasetVisualSlotUrl,
} from "./dataset-value-resolvers";
import { messageKeyElementKey, referenceItemElementKey } from "./element-registry";
import { getMeta } from "./interpretation";
import type { BrandKitBoardMeta, ElementKey, InterpretationStatus, RefCategory } from "./types";
import { BRANDKIT_REF_CATEGORIES } from "./types";

export const BRANDKIT_DATASET_MAX_MESSAGES = 5;
export const BRANDKIT_DATASET_MAX_GALLERY = 5;

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

export type BrandKitDatasetRowMeta = {
  elementKey: ElementKey;
  status: InterpretationStatus;
  sourceId?: string;
};

export type BrandKitDatasetConstantProjection = {
  fieldId: BrandKitDatasetFieldId;
  constantId: string;
  text?: string;
  color?: string;
  imageUrl?: string;
  meta: BrandKitDatasetRowMeta;
};

export type BrandKitDatasetMessageRowProjection = {
  rowId: string;
  message: string;
  meta: BrandKitDatasetRowMeta;
};

export type BrandKitDatasetGalleryRowProjection = {
  rowId: string;
  category: RefCategory;
  imageUrl: string;
  meta: BrandKitDatasetRowMeta;
};

export type BrandKitDatasetProjection = {
  brainNodeId: string;
  constants: BrandKitDatasetConstantProjection[];
  lists: {
    messages: BrandKitDatasetMessageRowProjection[];
    gallery: BrandKitDatasetGalleryRowProjection[];
  };
  rowMetaSidecar: BrandKitDatasetProjectionSidecar;
};

export type BrandKitDatasetProjectionSidecar = {
  constants: Record<string, BrandKitDatasetRowMeta>;
  lists: {
    messages: Record<string, BrandKitDatasetRowMeta>;
    gallery: Record<string, BrandKitDatasetRowMeta>;
  };
};

export function brandKitDatasetConstantId(brainNodeId: string, fieldId: BrandKitDatasetFieldId): string {
  return `bk:${brainNodeId}:${fieldId}`;
}

const VISUAL_SLOT_FIELD: Record<BrainVisualStyleSlotKey, BrandKitDatasetFieldId> = {
  environment: BRANDKIT_DATASET_FIELD_IDS.imageEnvironment,
  textures: BRANDKIT_DATASET_FIELD_IDS.imageTextures,
  people: BRANDKIT_DATASET_FIELD_IDS.imagePeople,
  objects: BRANDKIT_DATASET_FIELD_IDS.imageObjects,
  protagonist: BRANDKIT_DATASET_FIELD_IDS.imageProtagonist,
};

function rowMetaFromElement(boardMeta: BrandKitBoardMeta, elementKey: ElementKey): BrandKitDatasetRowMeta {
  const meta = getMeta(boardMeta, elementKey);
  const sourceId = meta.evidence.find((e) => e.sourceId)?.sourceId;
  return {
    elementKey,
    status: meta.status,
    ...(sourceId ? { sourceId } : {}),
  };
}

function collectMessageRows(
  assets: ProjectAssetsMetadata,
  boardMeta: BrandKitBoardMeta,
): BrandKitDatasetMessageRowProjection[] {
  const out: BrandKitDatasetMessageRowProjection[] = [];
  const seen = new Set<string>();
  const push = (raw: string, elementKey: ElementKey) => {
    const message = resolveBrandKitDatasetMessage(raw);
    if (!message || seen.has(message.toLowerCase())) return;
    seen.add(message.toLowerCase());
    out.push({
      rowId: `bkmsg_${out.length}`,
      message,
      meta: rowMetaFromElement(boardMeta, elementKey),
    });
  };

  for (const phrase of assets.strategy.approvedPhrases) {
    push(phrase, `messages.key.approved:${phrase.slice(0, 24)}`);
  }
  for (const blueprint of assets.strategy.messageBlueprints.slice(0, BRANDKIT_DATASET_MAX_MESSAGES)) {
    push(blueprint.claim, messageKeyElementKey(blueprint.id));
  }
  for (const funnel of assets.strategy.funnelMessages) {
    if (out.length >= BRANDKIT_DATASET_MAX_MESSAGES) break;
    push(funnel.text, `messages.key.funnel:${funnel.id ?? funnel.text.slice(0, 24)}`);
  }

  return out.slice(0, BRANDKIT_DATASET_MAX_MESSAGES);
}

function galleryElementKey(entry: { id?: string; category: RefCategory; imageUrl: string }): ElementKey {
  const id = entry.id?.trim() || entry.imageUrl.slice(-24);
  return referenceItemElementKey(entry.category, id);
}

/** Proyección completa assets + sidecar → constants + listas con metadata por fila. */
export function buildBrandKitDatasetProjection(
  rawAssets: unknown,
  boardMetaInput?: BrandKitBoardMeta,
  brainNodeId = "brain",
): BrandKitDatasetProjection {
  const assets = normalizeProjectAssets(rawAssets);
  const boardMeta = boardMetaInput ?? bootstrapSidecarFromAssets(assets);

  const colors = resolveBrandKitDatasetColors(assets);
  const logos = resolveBrandKitDatasetLogos(assets);
  const context = resolveBrandKitDatasetContext(assets);
  const tone = resolveBrandKitDatasetTone(assets);

  const constants: BrandKitDatasetConstantProjection[] = [
    {
      fieldId: BRANDKIT_DATASET_FIELD_IDS.context,
      constantId: brandKitDatasetConstantId(brainNodeId, BRANDKIT_DATASET_FIELD_IDS.context),
      text: context,
      meta: rowMetaFromElement(boardMeta, "messages.tagline"),
    },
    {
      fieldId: BRANDKIT_DATASET_FIELD_IDS.tone,
      constantId: brandKitDatasetConstantId(brainNodeId, BRANDKIT_DATASET_FIELD_IDS.tone),
      text: tone,
      meta: rowMetaFromElement(boardMeta, "tone"),
    },
    {
      fieldId: BRANDKIT_DATASET_FIELD_IDS.colorPrimary,
      constantId: brandKitDatasetConstantId(brainNodeId, BRANDKIT_DATASET_FIELD_IDS.colorPrimary),
      color: colors.primary,
      meta: rowMetaFromElement(boardMeta, "palette.colorPrimary"),
    },
    {
      fieldId: BRANDKIT_DATASET_FIELD_IDS.colorSecondary,
      constantId: brandKitDatasetConstantId(brainNodeId, BRANDKIT_DATASET_FIELD_IDS.colorSecondary),
      color: colors.secondary,
      meta: rowMetaFromElement(boardMeta, "palette.colorSecondary"),
    },
    {
      fieldId: BRANDKIT_DATASET_FIELD_IDS.colorAccent,
      constantId: brandKitDatasetConstantId(brainNodeId, BRANDKIT_DATASET_FIELD_IDS.colorAccent),
      color: colors.accent,
      meta: rowMetaFromElement(boardMeta, "palette.colorAccent"),
    },
    {
      fieldId: BRANDKIT_DATASET_FIELD_IDS.logoPositive,
      constantId: brandKitDatasetConstantId(brainNodeId, BRANDKIT_DATASET_FIELD_IDS.logoPositive),
      imageUrl: logos.positive,
      meta: rowMetaFromElement(boardMeta, "logo.primary"),
    },
    {
      fieldId: BRANDKIT_DATASET_FIELD_IDS.logoNegative,
      constantId: brandKitDatasetConstantId(brainNodeId, BRANDKIT_DATASET_FIELD_IDS.logoNegative),
      imageUrl: logos.negative,
      meta: rowMetaFromElement(boardMeta, "logo.alt"),
    },
  ];

  for (const slotKey of BRANDKIT_REF_CATEGORIES) {
    const fieldId = VISUAL_SLOT_FIELD[slotKey];
    const slot = assets.strategy.visualStyle[slotKey];
    const elementKey = slot?.key
      ? referenceItemElementKey(slotKey, slot.key)
      : (`references.${slotKey}.slot` as ElementKey);
    constants.push({
      fieldId,
      constantId: brandKitDatasetConstantId(brainNodeId, fieldId),
      imageUrl: resolveBrandKitDatasetVisualSlotUrl(assets, slotKey),
      meta: rowMetaFromElement(boardMeta, elementKey),
    });
  }

  const messages = collectMessageRows(assets, boardMeta);
  const gallery = resolveBrandKitDatasetGallery(assets, BRANDKIT_DATASET_MAX_GALLERY).map((entry, index) => ({
    rowId: entry.id || `bkgal_${index}`,
    category: entry.category as RefCategory,
    imageUrl: entry.imageUrl,
    meta: rowMetaFromElement(boardMeta, galleryElementKey(entry)),
  }));

  const rowMetaSidecar: BrandKitDatasetProjectionSidecar = {
    constants: Object.fromEntries(constants.map((c) => [c.constantId, c.meta])),
    lists: {
      messages: Object.fromEntries(messages.map((m) => [m.rowId, m.meta])),
      gallery: Object.fromEntries(gallery.map((g) => [g.rowId, g.meta])),
    },
  };

  return { brainNodeId, constants, lists: { messages, gallery }, rowMetaSidecar };
}

export function attachBrandKitDatasetProjectionSidecar(
  assets: ProjectAssetsMetadata,
  projection: BrandKitDatasetProjection,
): ProjectAssetsMetadata {
  const prevMeta = assets.brainMeta;
  return {
    ...assets,
    brainMeta: {
      brainVersion: prevMeta?.brainVersion ?? 1,
      analysisStatus: prevMeta?.analysisStatus ?? "idle",
      staleReasons: prevMeta?.staleReasons ?? [],
      ...prevMeta,
      brandKitDatasetRowMeta: projection.rowMetaSidecar,
    },
  };
}
