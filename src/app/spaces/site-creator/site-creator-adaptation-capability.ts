/**
 * 6B.2 — capacidad explícita del control Adaptación (puro).
 */
import type { SiteCreatorSelectionIndex } from "./site-creator-selection-types";
import type { ResponsiveTargetRef, SiteBlueprintV1 } from "./site-creator-types";
import { isSiteSectionNode } from "./site-creator-types";
import type { SectionVisualAnalysis } from "./site-creator-responsive-visual";
import { analyzeSectionVisualPresentation } from "./site-creator-responsive-visual";
import { collectSemanticCoverageLayerIds } from "./site-blueprint-ownership";
import {
  bandToEditable,
  controllerDisplayName,
  resolveEffectiveResponsiveMode,
  resolveResponsiveOverride,
  type ResponsiveBandLike,
} from "./site-creator-responsive-overrides";

export type AdaptationCapability =
  | {
      status: "hidden";
      reason: "original-view" | "invalid-target" | "insufficient-content";
    }
  | {
      status: "readonly";
      reason: "controlled-by-ancestor" | "sync-blocked";
      ownerLabel?: string;
    }
  | {
      status: "editable";
      foregroundUnitCount: number;
      supportedModes: Array<"preserve" | "stack">;
    }
  | {
      status: "reset-only";
      reason: "stale-override";
    };

export type ResolvedAdaptationContainer = {
  sectionAnalysis?: SectionVisualAnalysis | null;
  reorganizableUnitCount?: number;
};

/**
 * Unidades directas reordenables:
 * - Cada cluster (surface / preserve / solo) = 1 unidad.
 * - Hijos de layoutGroup / designerGroup.
 * Fondos, clips, máscaras y decoración no cuentan.
 */
export function countReorganizableDirectUnits(args: {
  target: ResponsiveTargetRef;
  blueprint: SiteBlueprintV1;
  index: SiteCreatorSelectionIndex;
  sectionAnalysis?: SectionVisualAnalysis | null;
}): number {
  const { target, blueprint, index } = args;

  if (target.kind === "blueprintNode") {
    const node = blueprint.nodes[target.nodeId];
    if (!node) return 0;

    if (isSiteSectionNode(node)) {
      const analysis =
        args.sectionAnalysis ??
        analyzeSectionVisualPresentation({
          blueprint,
          sectionId: node.id,
          index,
        });
      if (!analysis) return 0;
      return analysis.clusters.length;
    }

    if (node.kind === "layoutGroup") {
      let count = 0;
      for (const childId of node.childIds) {
        const child = blueprint.nodes[childId];
        if (!child) continue;
        const layers = collectSemanticCoverageLayerIds(blueprint, childId);
        if (layers.some((id) => index.byId[id]?.visible)) count += 1;
      }
      for (const layerId of node.layerIds) {
        const e = index.byId[layerId];
        if (!e?.visible) continue;
        if (e.type === "clippingContainer" || e.type === "adjustmentLayer") continue;
        count += 1;
      }
      return count;
    }
    return 0;
  }

  return index.entries.filter(
    (e) =>
      e.visible &&
      e.parentLayerId === target.layerId &&
      e.type !== "clippingContainer" &&
      e.type !== "adjustmentLayer",
  ).length;
}

export function resolveAdaptationCapability(args: {
  target: ResponsiveTargetRef | null;
  band: ResponsiveBandLike;
  blueprint: SiteBlueprintV1;
  index: SiteCreatorSelectionIndex | null;
  resolvedContainer?: ResolvedAdaptationContainer | null;
  syncBlocked?: boolean;
}): AdaptationCapability {
  if (args.band === "wide" || !bandToEditable(args.band)) {
    return { status: "hidden", reason: "original-view" };
  }
  if (!args.target || !args.index) {
    return { status: "hidden", reason: "invalid-target" };
  }

  const editableBand = bandToEditable(args.band)!;
  const hasOverride =
    resolveResponsiveOverride(args.blueprint, args.target, editableBand) != null;

  if (args.target.kind === "blueprintNode" && !args.blueprint.nodes[args.target.nodeId]) {
    return hasOverride
      ? { status: "reset-only", reason: "stale-override" }
      : { status: "hidden", reason: "invalid-target" };
  }
  if (args.target.kind === "designerGroup" && !args.index.byId[args.target.layerId]) {
    return hasOverride
      ? { status: "reset-only", reason: "stale-override" }
      : { status: "hidden", reason: "invalid-target" };
  }

  const effective = resolveEffectiveResponsiveMode({
    blueprint: args.blueprint,
    target: args.target,
    band: args.band,
    index: args.index,
  });

  if (effective.source === "ancestor" && effective.controller) {
    return {
      status: "readonly",
      reason: "controlled-by-ancestor",
      ownerLabel: controllerDisplayName(args.blueprint, effective.controller, args.index),
    };
  }

  if (args.syncBlocked) {
    return { status: "readonly", reason: "sync-blocked" };
  }

  const foregroundUnitCount =
    args.resolvedContainer?.reorganizableUnitCount ??
    countReorganizableDirectUnits({
      target: args.target,
      blueprint: args.blueprint,
      index: args.index,
      sectionAnalysis: args.resolvedContainer?.sectionAnalysis,
    });

  if (foregroundUnitCount < 2) {
    if (hasOverride) {
      return { status: "reset-only", reason: "stale-override" };
    }
    return { status: "hidden", reason: "insufficient-content" };
  }

  return {
    status: "editable",
    foregroundUnitCount,
    supportedModes: ["preserve", "stack"],
  };
}

/** Alias legacy. */
export const countReorganizableForegroundUnits = countReorganizableDirectUnits;
