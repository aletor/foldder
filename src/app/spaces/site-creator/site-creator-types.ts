import type { DesignerPageState } from "../designer/DesignerNode";
import { isValidDesignerSourceSnapshotV1 } from "./designer-source-snapshot";

export const SITE_BLUEPRINT_SCHEMA_VERSION = 1 as const;
export const SITE_CREATOR_SCHEMA_VERSION = 1 as const;
export const DESIGNER_SOURCE_SNAPSHOT_SCHEMA_VERSION = 1 as const;

export type SiteBlueprintNodeKind = "section" | "component" | "layoutGroup";
export type SiteSectionType = "hero" | "generic";
export type SiteComponentType = "button";

export interface SiteBlueprintNodeBase {
  id: string;
  kind: SiteBlueprintNodeKind;
  label: string;
  parentId: string | null;
  childIds: string[];
  /** Capas Designer poseídas directamente por este nodo semántico. */
  layerIds: string[];
}

export interface SiteBlueprintSectionNode extends SiteBlueprintNodeBase {
  kind: "section";
  sectionType: SiteSectionType;
  parentId: null;
  sourceRange: { top: number; bottom: number };
}

export interface SiteBlueprintLayoutGroupNode extends SiteBlueprintNodeBase {
  kind: "layoutGroup";
}

export interface SiteBlueprintComponentNode extends SiteBlueprintNodeBase {
  kind: "component";
  componentType: SiteComponentType;
  config: {
    labelLayerId?: string;
    accessibleLabel: string;
    action: null;
  };
}

export type SiteBlueprintNode =
  | SiteBlueprintSectionNode
  | SiteBlueprintComponentNode
  | SiteBlueprintLayoutGroupNode;

export interface SiteBlueprintV1 {
  schemaVersion: typeof SITE_BLUEPRINT_SCHEMA_VERSION;
  rootChildIds: string[];
  nodes: Record<string, SiteBlueprintNode>;
  /** Excepciones responsive por contenedor (6B.2). Ausente = todo Automático. */
  responsive?: SiteResponsiveV1;
}

export type ResponsiveEditableBand = "tablet" | "mobile";
export type ResponsiveOverrideMode = "preserve" | "stack";

export type ResponsiveTargetRef =
  | { kind: "blueprintNode"; nodeId: string }
  | { kind: "designerGroup"; layerId: string };

export type ResponsiveContainerRuleV1 = {
  target: ResponsiveTargetRef;
  byBand: Partial<Record<ResponsiveEditableBand, ResponsiveOverrideMode>>;
};

export type SiteResponsiveV1 = {
  version: 1;
  rules: ResponsiveContainerRuleV1[];
};

export interface DesignerSourceSnapshotV1 {
  schemaVersion: typeof DESIGNER_SOURCE_SNAPSHOT_SCHEMA_VERSION;
  designerNodeId: string;
  sourcePageId: string;
  sourceSlideKey?: string;
  capturedAt: string;
  contentHash: string;
  layerCount: number;
  page: DesignerPageState;
}

export interface SiteCreatorStudioState {
  lastOpenedAt?: string;
}

export interface SiteCreatorNodeData {
  label?: string;
  schemaVersion: typeof SITE_CREATOR_SCHEMA_VERSION;
  blueprint: SiteBlueprintV1;
  sourceSnapshot?: DesignerSourceSnapshotV1;
  studioState?: SiteCreatorStudioState;
}

export function createEmptySiteBlueprintV1(): SiteBlueprintV1 {
  return {
    schemaVersion: SITE_BLUEPRINT_SCHEMA_VERSION,
    rootChildIds: [],
    nodes: {},
  };
}

export function createDefaultSiteCreatorNodeData(): SiteCreatorNodeData {
  return {
    label: "Site Creator",
    schemaVersion: SITE_CREATOR_SCHEMA_VERSION,
    blueprint: createEmptySiteBlueprintV1(),
    studioState: {},
  };
}

export function isValidSiteBlueprintV1(value: unknown): value is SiteBlueprintV1 {
  if (!value || typeof value !== "object") return false;
  const blueprint = value as SiteBlueprintV1;
  return (
    blueprint.schemaVersion === SITE_BLUEPRINT_SCHEMA_VERSION &&
    Array.isArray(blueprint.rootChildIds) &&
    blueprint.nodes !== null &&
    typeof blueprint.nodes === "object"
  );
}

export function parseSiteCreatorNodeData(data: unknown): SiteCreatorNodeData {
  const raw = (data ?? {}) as Partial<SiteCreatorNodeData>;
  const blueprint = isValidSiteBlueprintV1(raw.blueprint)
    ? raw.blueprint
    : createEmptySiteBlueprintV1();
  const sourceSnapshot = isValidDesignerSourceSnapshotV1(raw.sourceSnapshot)
    ? raw.sourceSnapshot
    : undefined;
  return {
    label: typeof raw.label === "string" ? raw.label : "Site Creator",
    schemaVersion: SITE_CREATOR_SCHEMA_VERSION,
    blueprint,
    sourceSnapshot,
    studioState: raw.studioState && typeof raw.studioState === "object" ? raw.studioState : {},
  };
}

export function isSiteSectionNode(node: SiteBlueprintNode): node is SiteBlueprintSectionNode {
  return node.kind === "section";
}

export function isSiteComponentNode(node: SiteBlueprintNode): node is SiteBlueprintComponentNode {
  return node.kind === "component";
}

export function isSiteButtonNode(node: SiteBlueprintNode): node is SiteBlueprintComponentNode {
  return node.kind === "component" && node.componentType === "button";
}
