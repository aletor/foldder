/**
 * A3 — Detección y migración del puente legacy (4 constantes) → proyección Dataset v2.
 */

import { normalizeDataset } from "@/app/spaces/dataset/dataset-logic";
import type { Dataset, FieldValue } from "@/app/spaces/dataset/dataset-types";
import type { ProjectAssetsMetadata } from "@/app/spaces/project-assets-metadata";
import {
  BRANDKIT_DATASET_FIELD_IDS,
  brandKitDatasetConstantId,
  type BrandKitDatasetFieldId,
  type BrandKitDatasetLink,
} from "@/app/spaces/brandkit/brandkit-dataset-schema";
import { syncBrandKitAssetsToDataset } from "@/app/spaces/brandkit/brandkit-dataset-sync";
import { brandKitConstantId } from "@/app/spaces/brandkit/brandkit-logic";
import { BRANDKIT_FIELD_IDS } from "@/app/spaces/brandkit/brandkit-types";

export const LEGACY_BRANDKIT_FIELD_SUFFIXES = [
  BRANDKIT_FIELD_IDS.logo,
  BRANDKIT_FIELD_IDS.primaryColor,
  BRANDKIT_FIELD_IDS.secondaryColor,
  BRANDKIT_FIELD_IDS.accentColor,
  BRANDKIT_FIELD_IDS.socialHandle,
  "accentColor",
] as const;

const LEGACY_SUFFIX_SET = new Set<string>(LEGACY_BRANDKIT_FIELD_SUFFIXES);

const LEGACY_TO_MODERN_FIELD: Partial<Record<string, BrandKitDatasetFieldId>> = {
  logo: BRANDKIT_DATASET_FIELD_IDS.logoPositive,
  primaryColor: BRANDKIT_DATASET_FIELD_IDS.colorPrimary,
  secondaryColor: BRANDKIT_DATASET_FIELD_IDS.colorSecondary,
  accentColor: BRANDKIT_DATASET_FIELD_IDS.colorAccent,
};

export type ParsedBrandKitConstantId = {
  brainNodeId: string;
  fieldSuffix: string;
};

export function parseBrandKitConstantId(constantId: string): ParsedBrandKitConstantId | null {
  if (!constantId.startsWith("bk:")) return null;
  const parts = constantId.split(":");
  if (parts.length < 3) return null;
  return { brainNodeId: parts[1], fieldSuffix: parts.slice(2).join(":") };
}

export function isLegacyBrandKitConstantId(constantId: string): boolean {
  const parsed = parseBrandKitConstantId(constantId);
  return parsed ? LEGACY_SUFFIX_SET.has(parsed.fieldSuffix) : false;
}

export function isModernBrandKitConstantId(constantId: string): boolean {
  const parsed = parseBrandKitConstantId(constantId);
  if (!parsed) return false;
  return Object.values(BRANDKIT_DATASET_FIELD_IDS).includes(parsed.fieldSuffix as BrandKitDatasetFieldId);
}

export function inferBrainNodeIdFromLegacyConstants(dataset: Dataset): string | null {
  for (const field of dataset.constants.fields) {
    if (!isLegacyBrandKitConstantId(field.id)) continue;
    const parsed = parseBrandKitConstantId(field.id);
    if (parsed?.brainNodeId) return parsed.brainNodeId;
  }
  return null;
}

export function detectLegacyBrandKitConstants(dataset: Dataset, brainNodeId?: string): string[] {
  return normalizeDataset(dataset).constants.fields
    .filter((field) => {
      if (!isLegacyBrandKitConstantId(field.id)) return false;
      if (!brainNodeId) return true;
      return field.id.startsWith(`bk:${brainNodeId}:`);
    })
    .map((field) => field.id);
}

export function datasetHasModernBrandKitBlock(dataset: Dataset, brainNodeId: string): boolean {
  const contextId = brandKitDatasetConstantId(brainNodeId, BRANDKIT_DATASET_FIELD_IDS.context);
  return normalizeDataset(dataset).constants.fields.some((field) => field.id === contextId);
}

export function detectLegacyBrandKitMigrationTarget(
  dataset: Dataset,
  link?: BrandKitDatasetLink | null,
): { needsMigration: boolean; brainNodeId: string | null; legacyCount: number } {
  const brainNodeId = link?.brainNodeId ?? inferBrainNodeIdFromLegacyConstants(dataset);
  if (!brainNodeId) return { needsMigration: false, brainNodeId: null, legacyCount: 0 };
  const legacyCount = detectLegacyBrandKitConstants(dataset, brainNodeId).length;
  return { needsMigration: legacyCount > 0, brainNodeId, legacyCount };
}

export function remapLegacyDesignerBindingFieldId(fieldId: string): string {
  return LEGACY_TO_MODERN_FIELD[fieldId] ?? fieldId;
}

function isEmptyFieldValue(value: FieldValue | undefined): boolean {
  if (!value) return true;
  if (value.type === "color" || value.type === "text" || value.type === "select" || value.type === "url") {
    return !value.value.trim();
  }
  if (value.type === "image" || value.type === "video") {
    return !(value.url?.trim() || value.assetId?.trim());
  }
  return false;
}

function textValue(value: string): FieldValue {
  return { type: "text", value };
}

export function migrateLegacyBrandKitDataset(
  dataset: Dataset,
  brainNodeId: string,
  rawAssets: unknown,
): {
  dataset: Dataset;
  link: BrandKitDatasetLink;
  assets: ProjectAssetsMetadata;
  removedLegacyIds: string[];
} {
  const normalized = normalizeDataset(dataset);
  const legacyIds = detectLegacyBrandKitConstants(normalized, brainNodeId);
  const legacyValues: Record<string, FieldValue> = {};
  for (const id of legacyIds) {
    const value = normalized.constants.values[id];
    if (value) legacyValues[id] = value;
  }

  const synced = syncBrandKitAssetsToDataset(normalized, brainNodeId, rawAssets);
  const values = { ...synced.dataset.constants.values };

  for (const [legacySuffix, modernFieldId] of Object.entries(LEGACY_TO_MODERN_FIELD)) {
    if (!modernFieldId) continue;
    const legacyId = brandKitConstantId(brainNodeId, legacySuffix);
    const modernId = brandKitDatasetConstantId(brainNodeId, modernFieldId);
    const legacyValue = legacyValues[legacyId];
    if (!legacyValue || !isEmptyFieldValue(values[modernId])) continue;
    values[modernId] = legacyValue;
  }

  const handleLegacy = legacyValues[brandKitConstantId(brainNodeId, BRANDKIT_FIELD_IDS.socialHandle)];
  if (handleLegacy?.type === "text" && handleLegacy.value.trim()) {
    const toneId = brandKitDatasetConstantId(brainNodeId, BRANDKIT_DATASET_FIELD_IDS.tone);
    const toneValue = values[toneId];
    const toneText = toneValue?.type === "text" ? toneValue.value : "";
    const handleLine = `Handle: ${handleLegacy.value.trim()}`;
    if (!toneText.includes(handleLegacy.value.trim())) {
      values[toneId] = textValue(toneText ? `${toneText}\n${handleLine}` : handleLine);
    }
  }

  const removedLegacyIds = detectLegacyBrandKitConstants(
    { ...synced.dataset, constants: { ...synced.dataset.constants, values } },
    brainNodeId,
  );
  const removedSet = new Set(removedLegacyIds);
  const fields = synced.dataset.constants.fields.filter((field) => !removedSet.has(field.id));
  const cleanedValues = { ...values };
  for (const id of removedSet) delete cleanedValues[id];

  return {
    dataset: normalizeDataset({
      ...synced.dataset,
      constants: { fields, values: cleanedValues },
    }),
    link: synced.link,
    assets: synced.assets,
    removedLegacyIds,
  };
}

export function shouldUseLegacyBrainBrandMerge(input: {
  brainNodeId: string | null;
  connectedDataset: Dataset | null;
  brandKitLink?: BrandKitDatasetLink | null;
}): boolean {
  if (!input.brainNodeId || !input.connectedDataset) return Boolean(input.brainNodeId);
  const linkBrainId = input.brandKitLink?.brainNodeId;
  if (linkBrainId === input.brainNodeId && datasetHasModernBrandKitBlock(input.connectedDataset, linkBrainId)) {
    return false;
  }
  return true;
}

export function filterBrandKitConstantsForPicker(
  fields: Array<{ id: string; type: string }>,
  preferModernForBrainNodeId?: string | null,
): Array<{ id: string; type: string }> {
  if (!preferModernForBrainNodeId) {
    return fields.filter((field) => !isLegacyBrandKitConstantId(field.id));
  }
  const modernContextId = brandKitDatasetConstantId(
    preferModernForBrainNodeId,
    BRANDKIT_DATASET_FIELD_IDS.context,
  );
  const hasModern = fields.some((field) => field.id === modernContextId);
  if (!hasModern) return fields;
  return fields.filter((field) => {
    if (!isLegacyBrandKitConstantId(field.id)) return true;
    const parsed = parseBrandKitConstantId(field.id);
    return parsed?.brainNodeId !== preferModernForBrainNodeId;
  });
}
