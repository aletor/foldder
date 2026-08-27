import type { ClippingContainerObject } from "../FreehandStudio";
import { cloneBlueprint } from "./site-blueprint-validate";
import {
  collectSemanticCoverageLayerIds,
  findLayerSemanticOwner,
} from "./site-blueprint-ownership";
import { unionPageRects, type PageRect } from "./site-creator-coordinate-space";
import { sourceWorldVisualBounds } from "./site-creator-layer-world-bounds";
import {
  imageFrameHasPhoto,
  isDesignerImageFrame,
} from "./site-creator-display-labels";
import type { SiteCreatorSelectionIndex } from "./site-creator-selection-types";
import type {
  ResponsiveBackgroundPlacementV1,
  ResponsiveBackgroundRuleV1,
  ResponsiveMediaBand,
  ResponsiveTargetRef,
  SiteBlueprintV1,
} from "./site-creator-types";

function sameTarget(a: ResponsiveTargetRef, b: ResponsiveTargetRef): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "blueprintNode" && b.kind === "blueprintNode") {
    return a.nodeId === b.nodeId;
  }
  return (
    a.kind === "designerGroup" &&
    b.kind === "designerGroup" &&
    a.layerId === b.layerId
  );
}

function directClipImageId(
  entry: SiteCreatorSelectionIndex["entries"][number] | undefined,
): string | null {
  if (!entry || entry.type !== "clippingContainer") return null;
  const clip = entry.object as ClippingContainerObject;
  return clip.content.find((child) => child.type === "image")?.id ?? null;
}

export type ExplicitBackgroundCandidate = {
  sourceLayerId: string;
  imageLayerId: string;
  target: ResponsiveTargetRef;
  surfaceLayerId?: string;
};

function compareZOrderPath(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    if (a[index] !== b[index]) return a[index]! - b[index]!;
  }
  return a.length - b.length;
}

function surfaceForTarget(args: {
  blueprint: SiteBlueprintV1;
  index: SiteCreatorSelectionIndex;
  sourceLayerId: string;
  target: ResponsiveTargetRef;
}): string | undefined {
  const source = args.index.byId[args.sourceLayerId];
  if (!source) return undefined;
  let layerIds: string[];
  let bounds: PageRect | null;
  if (args.target.kind === "designerGroup") {
    const designerGroupId = args.target.layerId;
    const group = args.index.byId[designerGroupId];
    if (!group) return undefined;
    layerIds = args.index.entries
      .filter((entry) => entry.parentLayerId === designerGroupId)
      .map((entry) => entry.layerId);
    bounds = { x: 0, y: 0, width: group.object.width, height: group.object.height };
  } else {
    layerIds = collectSemanticCoverageLayerIds(
      args.blueprint,
      args.target.nodeId,
    );
    bounds =
      unionPageRects(
        layerIds
          .map((id) => sourceWorldVisualBounds(id, args.index))
          .filter((rect): rect is PageRect => Boolean(rect)),
      ) ?? null;
  }
  if (!bounds) return undefined;
  const toleranceX = Math.max(4, bounds.width * 0.03);
  const toleranceY = Math.max(4, bounds.height * 0.03);
  const candidates = layerIds
    .filter((id) => id !== args.sourceLayerId)
    .map((id) => args.index.byId[id])
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .filter((entry) => entry.visible && (entry.type === "rect" || entry.type === "ellipse"))
    .filter((entry) => {
      const owner = findLayerSemanticOwner(args.blueprint, entry.layerId, args.index);
      if (owner?.kind === "component") return false;
      const rect =
        args.target.kind === "designerGroup"
          ? entry.visualBounds
          : sourceWorldVisualBounds(entry.layerId, args.index) ?? entry.visualBounds;
      return (
        rect.x <= bounds.x + toleranceX &&
        rect.y <= bounds.y + toleranceY &&
        rect.x + rect.width >= bounds.x + bounds.width - toleranceX &&
        rect.y + rect.height >= bounds.y + bounds.height - toleranceY &&
        compareZOrderPath(entry.zOrderPath, source.zOrderPath) < 0
      );
    })
    .sort((a, b) => compareZOrderPath(a.zOrderPath, b.zOrderPath));
  return candidates[0]?.layerId;
}

export function inferExplicitBackgroundCandidate(args: {
  blueprint: SiteBlueprintV1;
  index: SiteCreatorSelectionIndex;
  layerId: string;
}): ExplicitBackgroundCandidate | null {
  const entry = args.index.byId[args.layerId];
  if (!entry) return null;
  const containingClip =
    entry.type === "image"
      ? [...entry.ancestorIds]
          .reverse()
          .map((id) => args.index.byId[id])
          .find((ancestor) => ancestor?.type === "clippingContainer")
      : null;
  const sourceEntry = containingClip ?? entry;
  const imageLayerId =
    entry.type === "image"
      ? entry.layerId
      : directClipImageId(entry) ??
        (isDesignerImageFrame(entry.object) &&
        imageFrameHasPhoto(entry.object)
          ? entry.layerId
          : null);
  if (!imageLayerId) return null;

  const designerParent = [...sourceEntry.ancestorIds]
    .reverse()
    .map((id) => args.index.byId[id])
    .find((ancestor) => ancestor?.type === "groupContainer");
  let target: ResponsiveTargetRef | null = null;
  if (designerParent) {
    target = { kind: "designerGroup", layerId: designerParent.layerId };
  } else {
    const owner = findLayerSemanticOwner(
      args.blueprint,
      sourceEntry.layerId,
      args.index,
    );
    if (owner && (owner.kind === "section" || owner.kind === "layoutGroup")) {
      target = { kind: "blueprintNode", nodeId: owner.id };
    }
  }
  if (!target) return null;
  const surfaceLayerId = surfaceForTarget({
    blueprint: args.blueprint,
    index: args.index,
    sourceLayerId: sourceEntry.layerId,
    target,
  });
  return {
    sourceLayerId: sourceEntry.layerId,
    imageLayerId,
    target,
    ...(surfaceLayerId ? { surfaceLayerId } : {}),
  };
}

export function resolveExplicitBackground(
  blueprint: SiteBlueprintV1,
  sourceLayerId: string,
  band: ResponsiveMediaBand,
): ResponsiveBackgroundPlacementV1 | null {
  return (
    blueprint.responsive?.backgrounds?.find(
      (rule) => rule.sourceLayerId === sourceLayerId,
    )?.byBand[band] ?? null
  );
}

export function isLayerExplicitBackground(
  blueprint: SiteBlueprintV1,
  layerId: string,
  band: ResponsiveMediaBand,
): boolean {
  if (resolveExplicitBackground(blueprint, layerId, band)) return true;
  return Boolean(
    blueprint.responsive?.backgrounds?.some((rule) => {
      const placement = rule.byBand[band];
      return placement?.surfaceLayerId === layerId;
    }),
  );
}

export function isLayerExplicitBackgroundSurface(
  blueprint: SiteBlueprintV1,
  layerId: string,
  band: ResponsiveMediaBand,
): boolean {
  return Boolean(
    blueprint.responsive?.backgrounds?.some(
      (rule) => rule.byBand[band]?.surfaceLayerId === layerId,
    ),
  );
}

export function explicitBackgroundForDisplayClip(
  blueprint: SiteBlueprintV1,
  clipLayerId: string,
  band: ResponsiveMediaBand,
): { sourceLayerId: string; placement: ResponsiveBackgroundPlacementV1 } | null {
  const placement = resolveExplicitBackground(blueprint, clipLayerId, band);
  return placement ? { sourceLayerId: clipLayerId, placement } : null;
}

function writeBackgroundRule(args: {
  blueprint: SiteBlueprintV1;
  sourceLayerId: string;
  band: ResponsiveMediaBand;
  placement: ResponsiveBackgroundPlacementV1 | null;
}): { blueprint: SiteBlueprintV1; changed: boolean } {
  const current = resolveExplicitBackground(
    args.blueprint,
    args.sourceLayerId,
    args.band,
  );
  if (JSON.stringify(current) === JSON.stringify(args.placement)) {
    return { blueprint: args.blueprint, changed: false };
  }

  const next = cloneBlueprint(args.blueprint);
  const responsive = next.responsive ?? { version: 1 as const, rules: [] };
  const backgrounds = [...(responsive.backgrounds ?? [])];
  const index = backgrounds.findIndex(
    (rule) => rule.sourceLayerId === args.sourceLayerId,
  );
  const rule: ResponsiveBackgroundRuleV1 =
    index >= 0
      ? {
          sourceLayerId: backgrounds[index]!.sourceLayerId,
          byBand: { ...backgrounds[index]!.byBand },
        }
      : { sourceLayerId: args.sourceLayerId, byBand: {} };
  if (args.placement) rule.byBand[args.band] = args.placement;
  else delete rule.byBand[args.band];
  if (Object.keys(rule.byBand).length > 0) {
    if (index >= 0) backgrounds[index] = rule;
    else backgrounds.push(rule);
  } else if (index >= 0) {
    backgrounds.splice(index, 1);
  }
  responsive.backgrounds = backgrounds.length ? backgrounds : undefined;
  next.responsive = responsive;
  return { blueprint: next, changed: true };
}

export function assignExplicitBackground(args: {
  blueprint: SiteBlueprintV1;
  candidate: ExplicitBackgroundCandidate;
  band: ResponsiveMediaBand;
}): { blueprint: SiteBlueprintV1; changed: boolean } {
  return writeBackgroundRule({
    blueprint: args.blueprint,
    sourceLayerId: args.candidate.sourceLayerId,
    band: args.band,
    placement: {
      target: args.candidate.target,
      imageLayerId: args.candidate.imageLayerId,
      ...(args.candidate.surfaceLayerId
        ? { surfaceLayerId: args.candidate.surfaceLayerId }
        : {}),
      focal: { x: 0.5, y: 0.5 },
      zoom: 1,
    },
  });
}

export function patchExplicitBackgroundCrop(args: {
  blueprint: SiteBlueprintV1;
  sourceLayerId: string;
  band: ResponsiveMediaBand;
  focal: { x: number; y: number };
  zoom: number;
}): { blueprint: SiteBlueprintV1; changed: boolean } {
  const current = resolveExplicitBackground(
    args.blueprint,
    args.sourceLayerId,
    args.band,
  );
  if (!current) return { blueprint: args.blueprint, changed: false };
  return writeBackgroundRule({
    blueprint: args.blueprint,
    sourceLayerId: args.sourceLayerId,
    band: args.band,
    placement: {
      ...current,
      focal: {
        x: Math.min(1, Math.max(0, args.focal.x)),
        y: Math.min(1, Math.max(0, args.focal.y)),
      },
      zoom: Math.min(4, Math.max(1, args.zoom)),
    },
  });
}

export function restoreExplicitBackground(args: {
  blueprint: SiteBlueprintV1;
  sourceLayerId: string;
  band: ResponsiveMediaBand;
}): { blueprint: SiteBlueprintV1; changed: boolean } {
  return writeBackgroundRule({ ...args, placement: null });
}

export function targetMatchesExplicitBackground(
  placement: ResponsiveBackgroundPlacementV1,
  target: ResponsiveTargetRef,
): boolean {
  return sameTarget(placement.target, target);
}
