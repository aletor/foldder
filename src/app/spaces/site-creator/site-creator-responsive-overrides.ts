/**
 * Fase 6B.2 — overrides responsive por contenedor (puro, sin UI).
 * `auto` = ausencia de override; no se persiste.
 */
import type { SiteCreatorSelectionIndex } from "./site-creator-selection-types";
import type { SiteBlueprintV1 } from "./site-creator-types";
import {
  isSiteButtonNode,
  isSiteSectionNode,
  type ResponsiveContainerRuleV1,
  type ResponsiveEditableBand,
  type ResponsiveOverrideMode,
  type ResponsiveTargetRef,
  type SiteResponsiveV1,
} from "./site-creator-types";
import { cloneBlueprint } from "./site-blueprint-validate";
import type { SiteCreatorSelectionUnit } from "./site-creator-display-labels";
import { looksTechnicalName } from "./site-creator-display-labels";

/** Alineado con site-creator-responsive (evita import circular). */
export type ResponsiveBandLike = "wide" | "tablet" | "mobile";

export type EffectiveResponsiveMode = {
  mode: "auto" | "preserve" | "stack";
  source: "default" | "explicit" | "ancestor";
  controller?: ResponsiveTargetRef;
};

export function bandToEditable(
  band: ResponsiveBandLike,
): ResponsiveEditableBand | null {
  if (band === "tablet") return "tablet";
  if (band === "mobile") return "mobile";
  return null;
}

export function editableBandLabel(band: ResponsiveEditableBand): string {
  return band === "tablet" ? "TABLET" : "MÓVIL";
}

export function modeMicrobarLabel(mode: "auto" | "preserve" | "stack"): string {
  if (mode === "preserve") return "Composición";
  if (mode === "stack") return "Apilar";
  return "Automática";
}

export function modeOptionLabel(mode: "auto" | "preserve" | "stack"): string {
  if (mode === "preserve") return "Mantener composición";
  if (mode === "stack") return "Apilar";
  return "Automática";
}

export function modeOptionHint(mode: "auto" | "preserve" | "stack"): string {
  if (mode === "preserve") return "Escala el diseño sin reorganizarlo.";
  if (mode === "stack") return "Ordena el contenido verticalmente.";
  return "Foldder decide la mejor distribución.";
}

export function sameResponsiveTarget(a: ResponsiveTargetRef, b: ResponsiveTargetRef): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "blueprintNode" && b.kind === "blueprintNode") return a.nodeId === b.nodeId;
  if (a.kind === "designerGroup" && b.kind === "designerGroup") return a.layerId === b.layerId;
  return false;
}

export function targetKey(target: ResponsiveTargetRef): string {
  return target.kind === "blueprintNode"
    ? `node:${target.nodeId}`
    : `group:${target.layerId}`;
}

export function resolveResponsiveTarget(
  unit: SiteCreatorSelectionUnit,
  blueprint: SiteBlueprintV1,
  index: SiteCreatorSelectionIndex | null,
): ResponsiveTargetRef | null {
  if (unit.kind === "blueprintNode") {
    const node = blueprint.nodes[unit.nodeId];
    if (!node) return null;
    if (isSiteButtonNode(node)) return null;
    if (isSiteSectionNode(node)) return { kind: "blueprintNode", nodeId: node.id };
    if (node.kind === "layoutGroup") return { kind: "blueprintNode", nodeId: node.id };
    return null;
  }
  if (!index) return null;
  const entry = index.byId[unit.layerId];
  if (!entry) return null;
  if (entry.containerKind !== "groupContainer") return null;
  if (looksTechnicalName(entry.name, entry.type)) return null;
  if (!entry.name.trim() || entry.name === entry.layerId) return null;
  // Grupo humano visible en árbol
  return { kind: "designerGroup", layerId: unit.layerId };
}

export function isAdaptationEligibleUnit(
  unit: SiteCreatorSelectionUnit,
  blueprint: SiteBlueprintV1,
  index: SiteCreatorSelectionIndex | null,
  band: ResponsiveBandLike,
): boolean {
  if (band === "wide") return false;
  return resolveResponsiveTarget(unit, blueprint, index) != null;
}

function findRule(
  responsive: SiteResponsiveV1 | undefined,
  target: ResponsiveTargetRef,
): ResponsiveContainerRuleV1 | undefined {
  return responsive?.rules.find((r) => sameResponsiveTarget(r.target, target));
}

export function resolveResponsiveOverride(
  blueprint: SiteBlueprintV1,
  target: ResponsiveTargetRef,
  band: ResponsiveEditableBand,
): ResponsiveOverrideMode | null {
  const rule = findRule(blueprint.responsive, target);
  const mode = rule?.byBand[band];
  return mode === "preserve" || mode === "stack" ? mode : null;
}

function sortRules(rules: ResponsiveContainerRuleV1[]): ResponsiveContainerRuleV1[] {
  return [...rules].sort((a, b) => targetKey(a.target).localeCompare(targetKey(b.target)));
}

function normalizeResponsive(
  rules: ResponsiveContainerRuleV1[],
  extras?: Pick<
    SiteResponsiveV1,
    "items" | "containerTunes" | "media" | "backgrounds"
  >,
): SiteResponsiveV1 | undefined {
  const cleaned: ResponsiveContainerRuleV1[] = [];
  for (const rule of sortRules(rules)) {
    const byBand: ResponsiveContainerRuleV1["byBand"] = {};
    if (rule.byBand.tablet === "preserve" || rule.byBand.tablet === "stack") {
      byBand.tablet = rule.byBand.tablet;
    }
    if (rule.byBand.mobile === "preserve" || rule.byBand.mobile === "stack") {
      byBand.mobile = rule.byBand.mobile;
    }
    if (Object.keys(byBand).length === 0) continue;
    cleaned.push({ target: rule.target, byBand });
  }
  const items = extras?.items && extras.items.length > 0 ? extras.items : undefined;
  const containerTunes =
    extras?.containerTunes && extras.containerTunes.length > 0 ? extras.containerTunes : undefined;
  const media = extras?.media && extras.media.length > 0 ? extras.media : undefined;
  const backgrounds =
    extras?.backgrounds && extras.backgrounds.length > 0
      ? extras.backgrounds
      : undefined;
  if (
    cleaned.length === 0 &&
    !items &&
    !containerTunes &&
    !media &&
    !backgrounds
  ) {
    return undefined;
  }
  return {
    version: 1,
    rules: cleaned,
    ...(items ? { items } : {}),
    ...(containerTunes ? { containerTunes } : {}),
    ...(media ? { media } : {}),
    ...(backgrounds ? { backgrounds } : {}),
  };
}

/**
 * Escribe o elimina un override. `mode: "auto"` elimina la banda.
 * No-op si el valor efectivo no cambia.
 */
export function setResponsiveOverride(args: {
  blueprint: SiteBlueprintV1;
  target: ResponsiveTargetRef;
  band: ResponsiveEditableBand;
  mode: "auto" | "preserve" | "stack";
}): { blueprint: SiteBlueprintV1; changed: boolean } {
  const current = resolveResponsiveOverride(args.blueprint, args.target, args.band);
  const nextMode = args.mode === "auto" ? null : args.mode;
  if ((current ?? null) === (nextMode ?? null)) {
    return { blueprint: args.blueprint, changed: false };
  }

  const next = cloneBlueprint(args.blueprint);
  const rules = [...(next.responsive?.rules ?? [])];
  const idx = rules.findIndex((r) => sameResponsiveTarget(r.target, args.target));
  let rule: ResponsiveContainerRuleV1 =
    idx >= 0
      ? { target: rules[idx]!.target, byBand: { ...rules[idx]!.byBand } }
      : { target: args.target, byBand: {} };

  if (nextMode == null) {
    delete rule.byBand[args.band];
  } else {
    rule.byBand[args.band] = nextMode;
  }

  if (idx >= 0) rules[idx] = rule;
  else rules.push(rule);

  const responsive = normalizeResponsive(rules, next.responsive);
  if (responsive) next.responsive = responsive;
  else delete next.responsive;

  return { blueprint: next, changed: true };
}

function ancestorTargets(
  blueprint: SiteBlueprintV1,
  target: ResponsiveTargetRef,
  index: SiteCreatorSelectionIndex | null,
): ResponsiveTargetRef[] {
  const out: ResponsiveTargetRef[] = [];
  if (target.kind === "blueprintNode") {
    let walk: string | null = blueprint.nodes[target.nodeId]?.parentId ?? null;
    while (walk) {
      const node = blueprint.nodes[walk];
      if (!node) break;
      if (isSiteSectionNode(node) || node.kind === "layoutGroup") {
        out.push({ kind: "blueprintNode", nodeId: walk });
      }
      walk = node.parentId;
    }
    return out;
  }
  // designerGroup: ancestors are blueprint owners + parent groups
  if (!index) return out;
  const entry = index.byId[target.layerId];
  if (!entry) return out;
  for (const ancestorId of [...entry.ancestorIds].reverse()) {
    const a = index.byId[ancestorId];
    if (
      a?.containerKind === "groupContainer" &&
      a.name.trim() &&
      a.name !== a.layerId &&
      !looksTechnicalName(a.name, a.type)
    ) {
      out.push({ kind: "designerGroup", layerId: ancestorId });
    }
  }
  // Semantic owner chain
  // (owner lookup is via blueprint layerIds — walk sections/groups that own this layer)
  for (const node of Object.values(blueprint.nodes)) {
    if (isSiteButtonNode(node)) continue;
    if (!isSiteSectionNode(node) && node.kind !== "layoutGroup") continue;
    if (node.layerIds.includes(target.layerId)) {
      out.push({ kind: "blueprintNode", nodeId: node.id });
      let walk: string | null = node.parentId;
      while (walk) {
        const p = blueprint.nodes[walk];
        if (!p) break;
        if (isSiteSectionNode(p) || p.kind === "layoutGroup") {
          out.push({ kind: "blueprintNode", nodeId: walk });
        }
        walk = p.parentId;
      }
      break;
    }
  }
  return out;
}

export function resolveEffectiveResponsiveMode(args: {
  blueprint: SiteBlueprintV1;
  target: ResponsiveTargetRef;
  band: ResponsiveBandLike;
  index?: SiteCreatorSelectionIndex | null;
}): EffectiveResponsiveMode {
  const editable = bandToEditable(args.band);
  if (!editable) {
    return { mode: "auto", source: "default" };
  }

  // Ancestros preserve controlan
  for (const ancestor of ancestorTargets(args.blueprint, args.target, args.index ?? null)) {
    const mode = resolveResponsiveOverride(args.blueprint, ancestor, editable);
    if (mode === "preserve") {
      return { mode: "preserve", source: "ancestor", controller: ancestor };
    }
  }

  const explicit = resolveResponsiveOverride(args.blueprint, args.target, editable);
  if (explicit) {
    return { mode: explicit, source: "explicit", controller: args.target };
  }
  return { mode: "auto", source: "default" };
}

export function controllerDisplayName(
  blueprint: SiteBlueprintV1,
  controller: ResponsiveTargetRef,
  index?: SiteCreatorSelectionIndex | null,
): string {
  if (controller.kind === "blueprintNode") {
    const node = blueprint.nodes[controller.nodeId];
    if (!node) return "contenedor";
    if (isSiteSectionNode(node) && node.sectionType === "hero") return "Hero";
    if (isSiteSectionNode(node)) return "Sección";
    if (node.kind === "layoutGroup") return node.label?.trim() || "Grupo";
    return node.label?.trim() || "contenedor";
  }
  const name = index?.byId[controller.layerId]?.name?.trim();
  return name || "Grupo";
}

export function treeOverrideDotState(args: {
  blueprint: SiteBlueprintV1;
  target: ResponsiveTargetRef;
  currentBand: ResponsiveBandLike;
}): "current" | "other" | null {
  const rule = findRule(args.blueprint.responsive, args.target);
  if (!rule) return null;
  const editable = bandToEditable(args.currentBand);
  const hasTablet = rule.byBand.tablet === "preserve" || rule.byBand.tablet === "stack";
  const hasMobile = rule.byBand.mobile === "preserve" || rule.byBand.mobile === "stack";
  if (!hasTablet && !hasMobile) return null;
  if (editable && rule.byBand[editable]) return "current";
  return "other";
}

export function treeOverrideTooltip(args: {
  blueprint: SiteBlueprintV1;
  target: ResponsiveTargetRef;
}): string | null {
  const rule = findRule(args.blueprint.responsive, args.target);
  if (!rule) return null;
  const lines: string[] = [];
  if (rule.byBand.tablet) {
    lines.push(`Tablet: ${modeOptionLabel(rule.byBand.tablet)}`);
  } else {
    lines.push("Tablet: Automática");
  }
  if (rule.byBand.mobile) {
    lines.push(`Móvil: ${modeOptionLabel(rule.byBand.mobile)}`);
  } else {
    lines.push("Móvil: Automática");
  }
  return lines.join("\n");
}

/** Targets con regla pero nodo/capa ausente → rotas (no borrar). */
export function listBrokenResponsiveTargets(
  blueprint: SiteBlueprintV1,
  index: SiteCreatorSelectionIndex | null,
): ResponsiveTargetRef[] {
  const broken: ResponsiveTargetRef[] = [];
  for (const rule of blueprint.responsive?.rules ?? []) {
    if (rule.target.kind === "blueprintNode") {
      if (!blueprint.nodes[rule.target.nodeId]) broken.push(rule.target);
    } else if (!index?.byId[rule.target.layerId]) {
      broken.push(rule.target);
    }
  }
  return broken;
}

export function isResponsiveTargetBroken(
  blueprint: SiteBlueprintV1,
  target: ResponsiveTargetRef,
  index: SiteCreatorSelectionIndex | null,
): boolean {
  if (target.kind === "blueprintNode") return !blueprint.nodes[target.nodeId];
  return !index?.byId[target.layerId];
}
