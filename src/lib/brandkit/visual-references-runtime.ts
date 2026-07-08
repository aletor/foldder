/**
 * A1 — Referencias visuales para nodos generativos (imageCreation, cine, photoRoom, nanoBanana).
 */

import type { ProjectAssetsMetadata } from "@/app/spaces/project-assets-metadata";
import { normalizeProjectAssets } from "@/app/spaces/project-assets-metadata";
import { bootstrapSidecarFromAssets } from "./board-projection";
import { referenceItemElementKey, referenceRuleElementKey } from "./element-registry";
import { getMeta } from "./interpretation";
import type { BrandKitBoardMeta, InterpretationStatus, RefCategory } from "./types";
import { BRANDKIT_REF_CATEGORIES } from "./types";

export const RUNTIME_ADDITIVE_KEYS = ["visualReferences"] as const;

export type VisualReferenceCategoryRuntime = {
  category: RefCategory;
  rule: string;
  ruleStatus: InterpretationStatus;
  provisional: boolean;
  imageUrls: string[];
};

export type VisualReferencesRuntime = Record<RefCategory, VisualReferenceCategoryRuntime>;

const GENERATIVE_NODE_PATTERNS = [
  "imagecreation",
  "imagegenerator",
  "image",
  "cine",
  "geminivideo",
  "photoroom",
  "photo",
  "nanobanana",
] as const;

export function isGenerativeVisualNodeType(targetNodeType: string): boolean {
  const node = targetNodeType.toLowerCase();
  return GENERATIVE_NODE_PATTERNS.some((p) => node.includes(p));
}

function pickUrlsForStatus(
  assets: ProjectAssetsMetadata,
  category: RefCategory,
  boardMeta: BrandKitBoardMeta,
  status: InterpretationStatus,
  max: number,
): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  const slot = assets.strategy.visualStyle[category];
  if (slot?.imageUrl?.trim()) {
    const key = referenceItemElementKey(category, slot.key);
    if (getMeta(boardMeta, key).status === status) {
      seen.add(slot.imageUrl.trim());
      urls.push(slot.imageUrl.trim());
    }
  }
  for (const entry of assets.strategy.brandPublicGallery ?? []) {
    if (entry.category !== category || !entry.imageUrl?.trim()) continue;
    const key = referenceItemElementKey(category, entry.id || entry.imageUrl.slice(-24));
    if (getMeta(boardMeta, key).status !== status) continue;
    const url = entry.imageUrl.trim();
    if (seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
    if (urls.length >= max) break;
  }
  return urls.slice(0, max);
}

function buildCategoryRuntime(
  assets: ProjectAssetsMetadata,
  category: RefCategory,
  boardMeta: BrandKitBoardMeta,
): VisualReferenceCategoryRuntime {
  const ruleKey = referenceRuleElementKey(category);
  const ruleMeta = getMeta(boardMeta, ruleKey);
  const rule = assets.strategy.visualStyle[category]?.description?.trim() ?? "";

  let validatedUrls = pickUrlsForStatus(assets, category, boardMeta, "validated", 3);
  let provisional = false;
  if (!validatedUrls.length) {
    validatedUrls = pickUrlsForStatus(assets, category, boardMeta, "proposed", 3);
    provisional = validatedUrls.length > 0;
  }

  return {
    category,
    rule: ruleMeta.status === "validated" || ruleMeta.status === "proposed" ? rule : "",
    ruleStatus: ruleMeta.status,
    provisional,
    imageUrls: validatedUrls,
  };
}

export function buildVisualReferencesRuntime(
  rawAssets: unknown,
  boardMetaInput?: BrandKitBoardMeta,
): VisualReferencesRuntime | undefined {
  const assets = normalizeProjectAssets(rawAssets);
  const boardMeta = boardMetaInput ?? bootstrapSidecarFromAssets(assets);
  if (!Object.keys(boardMeta.interpretation ?? {}).length) return undefined;

  const out = {} as VisualReferencesRuntime;
  let hasSignal = false;
  for (const category of BRANDKIT_REF_CATEGORIES) {
    const entry = buildCategoryRuntime(assets, category, boardMeta);
    if (entry.rule || entry.imageUrls.length) hasSignal = true;
    out[category] = entry;
  }
  return hasSignal ? out : undefined;
}
