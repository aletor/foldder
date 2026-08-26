/**
 * Fase 6C — ajustes contextuales por vista (puro, sin UI).
 * Original (wide) nunca persiste ni aplica estas excepciones.
 */
import type { SiteCreatorSelectionIndex } from "./site-creator-selection-types";
import type { SiteCreatorSelectionUnit } from "./site-creator-display-labels";
import { cloneBlueprint } from "./site-blueprint-validate";
import { collectSemanticCoverageLayerIds } from "./site-blueprint-ownership";
import {
  isSiteSectionNode,
  type ResponsiveAlignX,
  type ResponsiveContainerTuneRuleV1,
  type ResponsiveContainerTuneV1,
  type ResponsiveEditableBand,
  type ResponsiveItemRef,
  type ResponsiveItemRuleV1,
  type ResponsiveItemTuneV1,
  type ResponsiveMediaFit,
  type ResponsiveMediaRuleV1,
  type ResponsiveMediaTuneV1,
  type ResponsiveTargetRef,
  type ResponsiveWidthMode,
  type SiteBlueprintV1,
  type SiteResponsiveV1,
} from "./site-creator-types";
import type { ResponsiveVisualCluster } from "./site-creator-responsive-visual";
import { sameResponsiveTarget, targetKey } from "./site-creator-responsive-overrides";

export function sameItemRef(a: ResponsiveItemRef, b: ResponsiveItemRef): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "blueprintNode" && b.kind === "blueprintNode") return a.nodeId === b.nodeId;
  if (a.kind === "layer" && b.kind === "layer") return a.layerId === b.layerId;
  return false;
}

function sectionIdForTarget(
  blueprint: SiteBlueprintV1,
  target: ResponsiveTargetRef,
): string | null {
  if (target.kind !== "blueprintNode") return null;
  const node = blueprint.nodes[target.nodeId];
  return node && isSiteSectionNode(node) ? node.id : null;
}

function resetSectionContainerTune(
  tune: ResponsiveContainerTuneV1 | undefined,
): ResponsiveContainerTuneV1 {
  const height =
    tune?.heightMode === "viewport"
      ? { heightMode: "viewport" as const }
      : tune?.heightMode === "custom" && typeof tune.customHeight === "number"
        ? { heightMode: "custom" as const, customHeight: tune.customHeight }
        : {};
  return { padding: 0, gap: 0, minHeight: 0, ...height };
}

function sectionTuneHasResettableCustomization(
  tune: ResponsiveContainerTuneV1 | undefined,
): boolean {
  if (!tune) return false;
  if (typeof tune.padding === "number" && tune.padding !== 0) return true;
  if (typeof tune.gap === "number" && tune.gap !== 0) return true;
  if (typeof tune.minHeight === "number" && tune.minHeight !== 0) return true;
  if (tune.contentAlignX || tune.contentAlignY) return true;
  if (tune.contentWidthMode && tune.contentWidthMode !== "container") return true;
  if (tune.fitOrigin) return true;
  if (typeof tune.maxContentWidth === "number") return true;
  if (tune.autoHeight === false) return true;
  return false;
}

function sectionTuneMatchesResetBaseline(
  tune: ResponsiveContainerTuneV1 | undefined,
): boolean {
  return Boolean(
    tune &&
      tune.padding === 0 &&
      tune.gap === 0 &&
      tune.minHeight === 0 &&
      !sectionTuneHasResettableCustomization(tune),
  );
}

export function itemRefKey(target: ResponsiveItemRef): string {
  return target.kind === "blueprintNode" ? `node:${target.nodeId}` : `layer:${target.layerId}`;
}

export function resolveItemRef(
  unit: SiteCreatorSelectionUnit,
  blueprint: SiteBlueprintV1,
): ResponsiveItemRef | null {
  if (unit.kind === "blueprintNode") {
    const node = blueprint.nodes[unit.nodeId];
    if (!node) return null;
    if (isSiteSectionNode(node)) return null;
    if (node.kind === "layoutGroup") return null;
    return { kind: "blueprintNode", nodeId: node.id };
  }
  return { kind: "layer", layerId: unit.layerId };
}

export function itemRefForCluster(cluster: ResponsiveVisualCluster): ResponsiveItemRef | null {
  if (cluster.kind === "solo") {
    if (cluster.unit.nodeId) return { kind: "blueprintNode", nodeId: cluster.unit.nodeId };
    const layerId = cluster.unit.layerIds[0];
    return layerId ? { kind: "layer", layerId } : null;
  }
  const layerId = cluster.allLayerIds[0];
  return layerId ? { kind: "layer", layerId } : null;
}

export function coverageLayerIdsForItem(
  blueprint: SiteBlueprintV1,
  target: ResponsiveItemRef,
  index: SiteCreatorSelectionIndex | null,
): string[] {
  if (target.kind === "blueprintNode") {
    return collectSemanticCoverageLayerIds(blueprint, target.nodeId);
  }
  if (!index) return [target.layerId];
  const entry = index.byId[target.layerId];
  if (!entry) return [target.layerId];
  if (entry.containerKind === "groupContainer") {
    const ids = [target.layerId];
    for (const child of index.entries) {
      if (child.ancestorIds.includes(target.layerId)) ids.push(child.layerId);
    }
    return ids;
  }
  return [target.layerId];
}

function isEmptyItemTune(tune: ResponsiveItemTuneV1 | undefined): boolean {
  if (!tune) return true;
  if (tune.hidden === true) return false;
  if (tune.alignX) return false;
  if (tune.alignY) return false;
  if (tune.widthMode && tune.widthMode !== "content") return false;
  if (typeof tune.order === "number") return false;
  if (tune.offset && (tune.offset.x !== 0 || tune.offset.y !== 0)) return false;
  if (tune.size && (tune.size.width != null || tune.size.height != null)) return false;
  return true;
}

function isEmptyContainerTune(tune: ResponsiveContainerTuneV1 | undefined): boolean {
  if (!tune) return true;
  if (typeof tune.padding === "number") return false;
  if (typeof tune.gap === "number") return false;
  if (tune.contentAlignX) return false;
  if (tune.contentAlignY) return false;
  if (tune.contentWidthMode && tune.contentWidthMode !== "container") return false;
  if (tune.fitOrigin) return false;
  if (typeof tune.maxContentWidth === "number") return false;
  if (typeof tune.minHeight === "number") return false;
  if (tune.autoHeight === false) return false;
  if (tune.heightMode === "viewport" || tune.heightMode === "custom") return false;
  if (typeof tune.customHeight === "number") return false;
  return true;
}

function isEmptyMediaTune(tune: ResponsiveMediaTuneV1 | undefined): boolean {
  if (!tune) return true;
  if (tune.fit) return false;
  if (tune.focal && (tune.focal.x !== 0.5 || tune.focal.y !== 0.5)) return false;
  return true;
}

function cleanItemTune(tune: ResponsiveItemTuneV1): ResponsiveItemTuneV1 | null {
  const next: ResponsiveItemTuneV1 = {};
  if (tune.hidden === true) next.hidden = true;
  if (tune.alignX === "start" || tune.alignX === "center" || tune.alignX === "end") {
    next.alignX = tune.alignX;
  }
  if (tune.alignY === "start" || tune.alignY === "center" || tune.alignY === "end") {
    next.alignY = tune.alignY;
  }
  if (tune.widthMode === "container" || tune.widthMode === "full") {
    next.widthMode = tune.widthMode;
  }
  if (typeof tune.order === "number" && Number.isFinite(tune.order)) {
    next.order = Math.round(tune.order);
  }
  if (tune.offset) {
    const x = Number.isFinite(tune.offset.x) ? tune.offset.x : 0;
    const y = Number.isFinite(tune.offset.y) ? tune.offset.y : 0;
    if (x !== 0 || y !== 0) next.offset = { x, y };
  }
  if (tune.size) {
    const width =
      typeof tune.size.width === "number" && Number.isFinite(tune.size.width)
        ? Math.max(1, tune.size.width)
        : undefined;
    const height =
      typeof tune.size.height === "number" && Number.isFinite(tune.size.height)
        ? Math.max(1, tune.size.height)
        : undefined;
    if (width != null || height != null) next.size = { width, height };
  }
  return isEmptyItemTune(next) ? null : next;
}

function cleanContainerTune(tune: ResponsiveContainerTuneV1): ResponsiveContainerTuneV1 | null {
  const next: ResponsiveContainerTuneV1 = {};
  if (typeof tune.padding === "number" && Number.isFinite(tune.padding)) {
    next.padding = Math.max(0, Math.round(tune.padding));
  }
  if (typeof tune.gap === "number" && Number.isFinite(tune.gap)) {
    next.gap = Math.max(0, Math.round(tune.gap));
  }
  if (tune.contentAlignX === "start" || tune.contentAlignX === "center" || tune.contentAlignX === "end") {
    next.contentAlignX = tune.contentAlignX;
  }
  if (tune.contentAlignY === "start" || tune.contentAlignY === "center" || tune.contentAlignY === "end") {
    next.contentAlignY = tune.contentAlignY;
  }
  if (tune.contentWidthMode === "content" || tune.contentWidthMode === "full" || tune.contentWidthMode === "scale") {
    next.contentWidthMode = tune.contentWidthMode;
  }
  if (tune.fitOrigin === "start" || tune.fitOrigin === "end") {
    next.fitOrigin = tune.fitOrigin;
  }
  if (typeof tune.maxContentWidth === "number" && Number.isFinite(tune.maxContentWidth)) {
    next.maxContentWidth = Math.max(80, Math.round(tune.maxContentWidth));
  }
  if (typeof tune.minHeight === "number" && Number.isFinite(tune.minHeight)) {
    next.minHeight = Math.max(0, Math.round(tune.minHeight));
  }
  if (tune.autoHeight === false) next.autoHeight = false;
  if (tune.heightMode === "viewport") {
    next.heightMode = "viewport";
  } else if (tune.heightMode === "custom") {
    next.heightMode = "custom";
    if (typeof tune.customHeight === "number" && Number.isFinite(tune.customHeight)) {
      next.customHeight = Math.max(1, Math.round(tune.customHeight));
    }
  }
  return isEmptyContainerTune(next) ? null : next;
}

function cleanMediaTune(tune: ResponsiveMediaTuneV1): ResponsiveMediaTuneV1 | null {
  const next: ResponsiveMediaTuneV1 = {};
  if (tune.fit === "cover" || tune.fit === "contain" || tune.fit === "preserve") {
    next.fit = tune.fit;
  }
  if (tune.focal) {
    const x = Number.isFinite(tune.focal.x) ? Math.min(1, Math.max(0, tune.focal.x)) : 0.5;
    const y = Number.isFinite(tune.focal.y) ? Math.min(1, Math.max(0, tune.focal.y)) : 0.5;
    if (x !== 0.5 || y !== 0.5) next.focal = { x, y };
  }
  return isEmptyMediaTune(next) ? null : next;
}

export function compactSiteResponsive(doc: SiteResponsiveV1): SiteResponsiveV1 | undefined {
  const rules: SiteResponsiveV1["rules"] = [];
  for (const rule of [...doc.rules].sort((a, b) => targetKey(a.target).localeCompare(targetKey(b.target)))) {
    const byBand: (typeof rule)["byBand"] = {};
    if (rule.byBand.tablet === "preserve" || rule.byBand.tablet === "stack") {
      byBand.tablet = rule.byBand.tablet;
    }
    if (rule.byBand.mobile === "preserve" || rule.byBand.mobile === "stack") {
      byBand.mobile = rule.byBand.mobile;
    }
    if (Object.keys(byBand).length === 0) continue;
    rules.push({ target: rule.target, byBand });
  }

  const items: ResponsiveItemRuleV1[] = [];
  for (const rule of [...(doc.items ?? [])].sort((a, b) =>
    itemRefKey(a.target).localeCompare(itemRefKey(b.target)),
  )) {
    const byBand: ResponsiveItemRuleV1["byBand"] = {};
    const tablet = rule.byBand.tablet ? cleanItemTune(rule.byBand.tablet) : null;
    const mobile = rule.byBand.mobile ? cleanItemTune(rule.byBand.mobile) : null;
    if (tablet) byBand.tablet = tablet;
    if (mobile) byBand.mobile = mobile;
    if (Object.keys(byBand).length === 0) continue;
    items.push({ target: rule.target, byBand });
  }

  const containerTunes: ResponsiveContainerTuneRuleV1[] = [];
  for (const rule of [...(doc.containerTunes ?? [])].sort((a, b) =>
    targetKey(a.target).localeCompare(targetKey(b.target)),
  )) {
    const byBand: ResponsiveContainerTuneRuleV1["byBand"] = {};
    const tablet = rule.byBand.tablet ? cleanContainerTune(rule.byBand.tablet) : null;
    const mobile = rule.byBand.mobile ? cleanContainerTune(rule.byBand.mobile) : null;
    if (tablet) byBand.tablet = tablet;
    if (mobile) byBand.mobile = mobile;
    if (Object.keys(byBand).length === 0) continue;
    containerTunes.push({ target: rule.target, byBand });
  }

  const media: ResponsiveMediaRuleV1[] = [];
  for (const rule of [...(doc.media ?? [])].sort((a, b) => a.layerId.localeCompare(b.layerId))) {
    const byBand: ResponsiveMediaRuleV1["byBand"] = {};
    const tablet = rule.byBand.tablet ? cleanMediaTune(rule.byBand.tablet) : null;
    const mobile = rule.byBand.mobile ? cleanMediaTune(rule.byBand.mobile) : null;
    if (tablet) byBand.tablet = tablet;
    if (mobile) byBand.mobile = mobile;
    if (Object.keys(byBand).length === 0) continue;
    media.push({ layerId: rule.layerId, byBand });
  }

  if (rules.length === 0 && items.length === 0 && containerTunes.length === 0 && media.length === 0) {
    return undefined;
  }
  return {
    version: 1,
    rules,
    ...(items.length ? { items } : {}),
    ...(containerTunes.length ? { containerTunes } : {}),
    ...(media.length ? { media } : {}),
  };
}

function writeResponsive(blueprint: SiteBlueprintV1, doc: SiteResponsiveV1 | undefined): SiteBlueprintV1 {
  const next = cloneBlueprint(blueprint);
  if (doc) next.responsive = doc;
  else delete next.responsive;
  return next;
}

export function resolveItemTune(
  blueprint: SiteBlueprintV1,
  target: ResponsiveItemRef,
  band: ResponsiveEditableBand,
): ResponsiveItemTuneV1 | null {
  const rule = blueprint.responsive?.items?.find((r) => sameItemRef(r.target, target));
  const tune = rule?.byBand[band];
  return tune && !isEmptyItemTune(tune) ? tune : null;
}

export function isHiddenItemTune(
  blueprint: SiteBlueprintV1,
  target: ResponsiveItemRef,
  band: ResponsiveEditableBand,
): boolean {
  return resolveItemTune(blueprint, target, band)?.hidden === true;
}

/** True si alguna regla de ítem oculta esta capa (nodo semántico o capa). */
export function isLayerHiddenInBand(args: {
  blueprint: SiteBlueprintV1;
  layerId: string;
  band: ResponsiveEditableBand;
  nodeId?: string | null;
}): boolean {
  if (isHiddenItemTune(args.blueprint, { kind: "layer", layerId: args.layerId }, args.band)) {
    return true;
  }
  if (args.nodeId && isHiddenItemTune(args.blueprint, { kind: "blueprintNode", nodeId: args.nodeId }, args.band)) {
    return true;
  }
  for (const rule of args.blueprint.responsive?.items ?? []) {
    const tune = rule.byBand[args.band];
    if (!tune?.hidden) continue;
    const ids = coverageLayerIdsForItem(args.blueprint, rule.target, null);
    if (ids.includes(args.layerId)) return true;
  }
  return false;
}

export function resolveContainerTune(
  blueprint: SiteBlueprintV1,
  target: ResponsiveTargetRef,
  band: ResponsiveEditableBand,
): ResponsiveContainerTuneV1 | null {
  const rule = blueprint.responsive?.containerTunes?.find((r) => sameResponsiveTarget(r.target, target));
  const tune = rule?.byBand[band];
  return tune && !isEmptyContainerTune(tune) ? tune : null;
}

export function resolveMediaTune(
  blueprint: SiteBlueprintV1,
  layerId: string,
  band: ResponsiveEditableBand,
): ResponsiveMediaTuneV1 | null {
  const rule = blueprint.responsive?.media?.find((r) => r.layerId === layerId);
  const tune = rule?.byBand[band];
  return tune && !isEmptyMediaTune(tune) ? tune : null;
}

export function patchItemTune(args: {
  blueprint: SiteBlueprintV1;
  target: ResponsiveItemRef;
  band: ResponsiveEditableBand;
  patch: Partial<ResponsiveItemTuneV1> | null;
}): { blueprint: SiteBlueprintV1; changed: boolean } {
  const current = resolveItemTune(args.blueprint, args.target, args.band);
  const merged: ResponsiveItemTuneV1 | null =
    args.patch == null ? null : { ...(current ?? {}), ...args.patch };
  const cleaned = merged ? cleanItemTune(merged) : null;
  const same = JSON.stringify(current ?? null) === JSON.stringify(cleaned);
  if (same) return { blueprint: args.blueprint, changed: false };

  const next = cloneBlueprint(args.blueprint);
  const items = [...(next.responsive?.items ?? [])];
  const idx = items.findIndex((r) => sameItemRef(r.target, args.target));
  const rule: ResponsiveItemRuleV1 =
    idx >= 0
      ? { target: items[idx]!.target, byBand: { ...items[idx]!.byBand } }
      : { target: args.target, byBand: {} };
  if (cleaned) rule.byBand[args.band] = cleaned;
  else delete rule.byBand[args.band];
  if (idx >= 0) items[idx] = rule;
  else items.push(rule);

  const compact = compactSiteResponsive({
    version: 1,
    rules: next.responsive?.rules ?? [],
    items,
    containerTunes: next.responsive?.containerTunes,
    media: next.responsive?.media,
  });
  return { blueprint: writeResponsive(next, compact), changed: true };
}

export function patchContainerTune(args: {
  blueprint: SiteBlueprintV1;
  target: ResponsiveTargetRef;
  band: ResponsiveEditableBand;
  patch: Partial<ResponsiveContainerTuneV1> | null;
}): { blueprint: SiteBlueprintV1; changed: boolean } {
  const current = resolveContainerTune(args.blueprint, args.target, args.band);
  const merged: ResponsiveContainerTuneV1 | null =
    args.patch == null ? null : { ...(current ?? {}), ...args.patch };
  const cleaned = merged ? cleanContainerTune(merged) : null;
  const same = JSON.stringify(current ?? null) === JSON.stringify(cleaned);
  if (same) return { blueprint: args.blueprint, changed: false };

  const next = cloneBlueprint(args.blueprint);
  const containerTunes = [...(next.responsive?.containerTunes ?? [])];
  const idx = containerTunes.findIndex((r) => sameResponsiveTarget(r.target, args.target));
  const rule: ResponsiveContainerTuneRuleV1 =
    idx >= 0
      ? { target: containerTunes[idx]!.target, byBand: { ...containerTunes[idx]!.byBand } }
      : { target: args.target, byBand: {} };
  if (cleaned) rule.byBand[args.band] = cleaned;
  else delete rule.byBand[args.band];
  if (idx >= 0) containerTunes[idx] = rule;
  else containerTunes.push(rule);

  const compact = compactSiteResponsive({
    version: 1,
    rules: next.responsive?.rules ?? [],
    items: next.responsive?.items,
    containerTunes,
    media: next.responsive?.media,
  });
  return { blueprint: writeResponsive(next, compact), changed: true };
}

export function patchMediaTune(args: {
  blueprint: SiteBlueprintV1;
  layerId: string;
  band: ResponsiveEditableBand;
  patch: Partial<ResponsiveMediaTuneV1> | null;
}): { blueprint: SiteBlueprintV1; changed: boolean } {
  const current = resolveMediaTune(args.blueprint, args.layerId, args.band);
  const merged: ResponsiveMediaTuneV1 | null =
    args.patch == null ? null : { ...(current ?? {}), ...args.patch };
  const cleaned = merged ? cleanMediaTune(merged) : null;
  const same = JSON.stringify(current ?? null) === JSON.stringify(cleaned);
  if (same) return { blueprint: args.blueprint, changed: false };

  const next = cloneBlueprint(args.blueprint);
  const media = [...(next.responsive?.media ?? [])];
  const idx = media.findIndex((r) => r.layerId === args.layerId);
  const rule: ResponsiveMediaRuleV1 =
    idx >= 0
      ? { layerId: media[idx]!.layerId, byBand: { ...media[idx]!.byBand } }
      : { layerId: args.layerId, byBand: {} };
  if (cleaned) rule.byBand[args.band] = cleaned;
  else delete rule.byBand[args.band];
  if (idx >= 0) media[idx] = rule;
  else media.push(rule);

  const compact = compactSiteResponsive({
    version: 1,
    rules: next.responsive?.rules ?? [],
    items: next.responsive?.items,
    containerTunes: next.responsive?.containerTunes,
    media,
  });
  return { blueprint: writeResponsive(next, compact), changed: true };
}

export function reorderSiblingItems(args: {
  blueprint: SiteBlueprintV1;
  target: ResponsiveItemRef;
  siblings: ResponsiveItemRef[];
  band: ResponsiveEditableBand;
  delta: -1 | 1;
}): { blueprint: SiteBlueprintV1; changed: boolean } {
  const rows = args.siblings.map((ref, i) => ({
    ref,
    order: resolveItemTune(args.blueprint, ref, args.band)?.order ?? i,
    index: i,
  }));
  rows.sort((a, b) => a.order - b.order || a.index - b.index);
  const at = rows.findIndex((r) => sameItemRef(r.ref, args.target));
  if (at < 0) return { blueprint: args.blueprint, changed: false };
  const nextAt = at + args.delta;
  if (nextAt < 0 || nextAt >= rows.length) return { blueprint: args.blueprint, changed: false };
  const swap = rows[at]!;
  rows[at] = rows[nextAt]!;
  rows[nextAt] = swap;
  let blueprint = args.blueprint;
  let changed = false;
  rows.forEach((row, i) => {
    const result = patchItemTune({
      blueprint,
      target: row.ref,
      band: args.band,
      patch: { order: i },
    });
    if (result.changed) {
      blueprint = result.blueprint;
      changed = true;
    }
  });
  return { blueprint, changed };
}

export function resetItemToAuto(args: {
  blueprint: SiteBlueprintV1;
  target: ResponsiveItemRef;
  band: ResponsiveEditableBand;
}): { blueprint: SiteBlueprintV1; changed: boolean } {
  return patchItemTune({ ...args, patch: null });
}

export function resetContainerTuneToAuto(args: {
  blueprint: SiteBlueprintV1;
  target: ResponsiveTargetRef;
  band: ResponsiveEditableBand;
}): { blueprint: SiteBlueprintV1; changed: boolean } {
  return patchContainerTune({ ...args, patch: null });
}

export function resetMediaToAuto(args: {
  blueprint: SiteBlueprintV1;
  layerId: string;
  band: ResponsiveEditableBand;
}): { blueprint: SiteBlueprintV1; changed: boolean } {
  return patchMediaTune({ ...args, patch: null });
}

/** Elimina todas las personalizaciones de una vista (Tablet o Móvil). */
export function resetResponsiveBand(args: {
  blueprint: SiteBlueprintV1;
  band: ResponsiveEditableBand;
}): { blueprint: SiteBlueprintV1; changed: boolean } {
  const doc: SiteResponsiveV1 = args.blueprint.responsive ?? { version: 1, rules: [] };

  const next: SiteResponsiveV1 = {
    version: 1,
    rules: doc.rules.map((r) => {
      const byBand = { ...r.byBand };
      if (sectionIdForTarget(args.blueprint, r.target)) byBand[args.band] = "preserve";
      else delete byBand[args.band];
      return { target: r.target, byBand };
    }),
    items: doc.items?.map((r) => {
      const byBand = { ...r.byBand };
      delete byBand[args.band];
      return { target: r.target, byBand };
    }),
    containerTunes: doc.containerTunes?.map((r) => {
      const byBand = { ...r.byBand };
      if (sectionIdForTarget(args.blueprint, r.target)) {
        byBand[args.band] = resetSectionContainerTune(byBand[args.band]);
      } else {
        delete byBand[args.band];
      }
      return { target: r.target, byBand };
    }),
    media: doc.media?.map((r) => {
      const byBand = { ...r.byBand };
      delete byBand[args.band];
      return { layerId: r.layerId, byBand };
    }),
  };
  for (const node of Object.values(args.blueprint.nodes)) {
    if (!isSiteSectionNode(node)) continue;
    const target: ResponsiveTargetRef = { kind: "blueprintNode", nodeId: node.id };
    const rule = next.rules.find((candidate) => sameResponsiveTarget(candidate.target, target));
    if (rule) rule.byBand[args.band] = "preserve";
    else next.rules.push({ target, byBand: { [args.band]: "preserve" } });

    const tuneRule = next.containerTunes?.find((candidate) =>
      sameResponsiveTarget(candidate.target, target),
    );
    if (tuneRule) {
      tuneRule.byBand[args.band] = resetSectionContainerTune(tuneRule.byBand[args.band]);
    } else {
      next.containerTunes = [
        ...(next.containerTunes ?? []),
        { target, byBand: { [args.band]: resetSectionContainerTune(undefined) } },
      ];
    }
  }
  const compact = compactSiteResponsive(next);
  if (JSON.stringify(compact ?? null) === JSON.stringify(compactSiteResponsive(doc) ?? null)) {
    return { blueprint: args.blueprint, changed: false };
  }
  return { blueprint: writeResponsive(args.blueprint, compact), changed: true };
}

export function bandHasCustomizations(
  blueprint: SiteBlueprintV1,
  band: ResponsiveEditableBand,
): boolean {
  const doc = blueprint.responsive;
  for (const node of Object.values(blueprint.nodes)) {
    if (!isSiteSectionNode(node)) continue;
    const target: ResponsiveTargetRef = { kind: "blueprintNode", nodeId: node.id };
    const mode = doc?.rules.find((r) => sameResponsiveTarget(r.target, target))?.byBand[band];
    if (mode !== "preserve") return true;
    const tune = doc?.containerTunes?.find((r) =>
      sameResponsiveTarget(r.target, target),
    )?.byBand[band];
    if (!sectionTuneMatchesResetBaseline(tune)) return true;
  }
  if (!doc) return false;
  if (
    doc.rules.some((r) => {
      const mode = r.byBand[band];
      if (!mode) return false;
      return !sectionIdForTarget(blueprint, r.target);
    })
  ) {
    return true;
  }
  if (doc.items?.some((r) => r.byBand[band])) return true;
  if (
    doc.containerTunes?.some((r) => {
      const tune = r.byBand[band];
      if (!tune) return false;
      return !sectionIdForTarget(blueprint, r.target);
    })
  ) {
    return true;
  }
  if (doc.media?.some((r) => r.byBand[band])) return true;
  return false;
}

export function unitHasCustomization(args: {
  blueprint: SiteBlueprintV1;
  unit: SiteCreatorSelectionUnit;
  band: ResponsiveEditableBand;
  index: SiteCreatorSelectionIndex | null;
}): boolean {
  const { blueprint, unit, band, index } = args;
  if (unit.kind === "blueprintNode") {
    const node = blueprint.nodes[unit.nodeId];
    if (node && (isSiteSectionNode(node) || node.kind === "layoutGroup")) {
      const target: ResponsiveTargetRef = { kind: "blueprintNode", nodeId: node.id };
      if (isSiteSectionNode(node)) {
        const mode = blueprint.responsive?.rules.find((r) =>
          sameResponsiveTarget(r.target, target),
        )?.byBand[band];
        if (mode !== "preserve") return true;
        const tune = resolveContainerTune(blueprint, target, band);
        if (!sectionTuneMatchesResetBaseline(tune ?? undefined)) return true;
      }
      if (
        blueprint.responsive?.rules.some((r) => {
          if (!sameResponsiveTarget(r.target, target)) return false;
          const mode = r.byBand[band];
          return Boolean(mode && !isSiteSectionNode(node));
        })
      ) {
        return true;
      }
      const containerTune = resolveContainerTune(blueprint, target, band);
      if (
        containerTune &&
        !isSiteSectionNode(node)
      ) {
        return true;
      }
    }
    const item: ResponsiveItemRef = { kind: "blueprintNode", nodeId: unit.nodeId };
    if (resolveItemTune(blueprint, item, band)) return true;
    if (node) {
      for (const layerId of node.layerIds) {
        if (resolveMediaTune(blueprint, layerId, band)) return true;
      }
    }
    return false;
  }
  if (resolveItemTune(blueprint, { kind: "layer", layerId: unit.layerId }, band)) return true;
  if (resolveMediaTune(blueprint, unit.layerId, band)) return true;
  const entry = index?.byId[unit.layerId];
  if (entry?.containerKind === "groupContainer") {
    const target: ResponsiveTargetRef = { kind: "designerGroup", layerId: unit.layerId };
    if (blueprint.responsive?.rules.some((r) => sameResponsiveTarget(r.target, target) && r.byBand[band])) {
      return true;
    }
    if (resolveContainerTune(blueprint, target, band)) return true;
  }
  return false;
}

export function unitCustomizationDotState(args: {
  blueprint: SiteBlueprintV1;
  unit: SiteCreatorSelectionUnit;
  currentBand: "wide" | "tablet" | "mobile";
  index: SiteCreatorSelectionIndex | null;
}): "current" | "other" | null {
  if (args.currentBand === "wide") {
    const tablet = unitHasCustomization({ ...args, band: "tablet" });
    const mobile = unitHasCustomization({ ...args, band: "mobile" });
    if (tablet || mobile) return "other";
    return null;
  }
  const current = unitHasCustomization({ ...args, band: args.currentBand });
  const otherBand: ResponsiveEditableBand = args.currentBand === "tablet" ? "mobile" : "tablet";
  const other = unitHasCustomization({ ...args, band: otherBand });
  if (current) return "current";
  if (other) return "other";
  return null;
}

export function unitCustomizationTooltip(args: {
  blueprint: SiteBlueprintV1;
  unit: SiteCreatorSelectionUnit;
  index: SiteCreatorSelectionIndex | null;
}): string | null {
  const tablet = unitHasCustomization({ ...args, band: "tablet" });
  const mobile = unitHasCustomization({ ...args, band: "mobile" });
  if (!tablet && !mobile) return null;
  const lines = [
    `Tablet: ${tablet ? "Personalizado" : "Automática"}`,
    `Móvil: ${mobile ? "Personalizado" : "Automática"}`,
  ];
  return lines.join("\n");
}

export function alignXLabel(align: ResponsiveAlignX): string {
  if (align === "start") return "Izquierda";
  if (align === "end") return "Derecha";
  return "Centro horizontal";
}

export function widthModeLabel(mode: ResponsiveWidthMode): string {
  if (mode === "container") return "Contenedor";
  if (mode === "full") return "Completo";
  return "Contenido";
}

export function mediaFitLabel(fit: ResponsiveMediaFit): string {
  if (fit === "contain") return "Encajar";
  if (fit === "preserve") return "Mantener proporción";
  return "Cubrir";
}

export function alignYLabel(align: "start" | "center" | "end"): string {
  if (align === "start") return "Arriba";
  if (align === "end") return "Abajo";
  return "Centro vertical";
}

export function clearContainerTuneField(args: {
  blueprint: SiteBlueprintV1;
  target: ResponsiveTargetRef;
  band: ResponsiveEditableBand;
  field: keyof ResponsiveContainerTuneV1;
}): { blueprint: SiteBlueprintV1; changed: boolean } {
  const current = resolveContainerTune(args.blueprint, args.target, args.band);
  if (!current || current[args.field] == null) {
    return { blueprint: args.blueprint, changed: false };
  }
  return patchContainerTune({
    blueprint: args.blueprint,
    target: args.target,
    band: args.band,
    patch: { [args.field]: undefined } as Partial<ResponsiveContainerTuneV1>,
  });
}

export function contentBoxX(args: {
  align: "start" | "center" | "end";
  contentLeft: number;
  contentWidth: number;
  boxWidth: number;
}): number {
  const w = Math.min(args.boxWidth, args.contentWidth);
  if (args.align === "start") return args.contentLeft;
  if (args.align === "end") return args.contentLeft + args.contentWidth - w;
  return args.contentLeft + (args.contentWidth - w) / 2;
}

export function contentBoxY(args: {
  align: "start" | "center" | "end";
  contentTop: number;
  contentHeight: number;
  boxHeight: number;
}): number {
  const h = Math.min(args.boxHeight, args.contentHeight);
  if (args.align === "start") return args.contentTop;
  if (args.align === "end") return args.contentTop + args.contentHeight - h;
  return args.contentTop + (args.contentHeight - h) / 2;
}
