import type { DesignerPageState } from "../designer/DesignerNode";
import { createSiteMultiCardCardId } from "./site-blueprint-ids";
import { isValidDesignerSourceSnapshotV1 } from "./designer-source-snapshot";

export const SITE_BLUEPRINT_SCHEMA_VERSION = 1 as const;
export const SITE_CREATOR_SCHEMA_VERSION = 1 as const;
export const DESIGNER_SOURCE_SNAPSHOT_SCHEMA_VERSION = 1 as const;

export type SiteBlueprintNodeKind = "section" | "component" | "layoutGroup" | "multicard";
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

export type SiteSectionHeightMode = "content" | "viewport" | "custom";

export interface SiteBlueprintSectionNode extends SiteBlueprintNodeBase {
  kind: "section";
  sectionType: SiteSectionType;
  parentId: null;
  sourceRange: { top: number; bottom: number };
  /**
   * Alto de la sección. Ausente / `content` = alto del diseño.
   * `viewport` = al menos el alto de la página / ventana (`100dvh` al publicar).
   * `custom` = alto fijo en píxeles (`customHeight`).
   */
  heightMode?: SiteSectionHeightMode;
  /** Solo con `heightMode: "custom"` (vista Original). */
  customHeight?: number;
  /** Sección creada al adaptar un grupo de raíz al ancho de página. */
  promotedFromGroupId?: string;
}

export type LayoutGroupWidthMode = "content" | "full" | "scale";
export type LayoutGroupFitOrigin = "start" | "end";

export type SiteMultiCardLayoutMode = "grid" | "scrollH" | "scrollV";
export type SiteMultiCardNavVisibility = "auto" | "hidden";
export type SiteMultiCardNavStyle = "arrows" | "dots";

export const MULTICARD_COUNT_MIN = 1;
export const MULTICARD_COUNT_MAX = 24;
export const MULTICARD_DEFAULT_COUNT = 3;
export const MULTICARD_DEFAULT_GAP = 24;

/** Sustitución de imagen por card. El estilo/encuadre sigue el molde. */
export type SiteMultiCardMediaRefV1 = {
  src?: string;
  s3Key?: string;
};

export type SiteMultiCardSlotOverrideV1 = {
  text?: string;
  mediaRef?: SiteMultiCardMediaRefV1;
};

export type SiteMultiCardInstanceV1 = {
  id: string;
  overrides: Record<string, SiteMultiCardSlotOverrideV1>;
};

export type SiteMultiCardNavV1 = {
  visibility: SiteMultiCardNavVisibility;
  style: SiteMultiCardNavStyle;
};

export interface SiteBlueprintMultiCardNode extends SiteBlueprintNodeBase {
  kind: "multicard";
  /** N en Original. Debe coincidir con `cards.length`. */
  count: number;
  layoutMode: SiteMultiCardLayoutMode;
  /** Separación entre cards en unidades de página (Original). */
  gap: number;
  nav?: SiteMultiCardNavV1;
  /** Alto visible en scrollV (unidades de página). */
  visibleHeight?: number;
  cards: SiteMultiCardInstanceV1[];
}

export interface SiteBlueprintLayoutGroupNode extends SiteBlueprintNodeBase {
  kind: "layoutGroup";
  /**
   * Ancho del grupo en la vista Original.
   * Tablet y móvil guardan el ajuste en `responsive.containerTunes` por banda.
   */
  widthMode?: LayoutGroupWidthMode;
  /** Ancla del escalado proporcional: `start` crece a la derecha, `end` a la izquierda. */
  fitOrigin?: LayoutGroupFitOrigin;
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
  | SiteBlueprintLayoutGroupNode
  | SiteBlueprintMultiCardNode;

export interface SiteBlueprintV1 {
  schemaVersion: typeof SITE_BLUEPRINT_SCHEMA_VERSION;
  rootChildIds: string[];
  nodes: Record<string, SiteBlueprintNode>;
  /** Excepciones responsive por contenedor (6B.2). Ausente = todo Automático. */
  responsive?: SiteResponsiveV1;
  /**
   * Espejos automáticos del Designer que el usuario desagrupó en Site Creator.
   * Persiste aunque Designer siga teniendo groupContainer / groupId.
   */
  dismissedDesignerMirrors?: SiteDismissedDesignerMirrorsV1;
  /**
   * Recorrido entre secciones (rail vertical del lienzo).
   * La transición vive en el tramo, no en la sección destino.
   */
  scrollFlow?: SiteBlueprintScrollFlowV1;
  /**
   * Capas y nodos que no se pueden elegir desde el lienzo.
   * Siguen seleccionables en el árbol de la izquierda.
   */
  canvasLocks?: SiteBlueprintCanvasLocksV1;
}

export type SiteBlueprintCanvasLocksV1 = {
  layerIds?: string[];
  nodeIds?: string[];
};

/** Cómo llega el scroll de un bloque al siguiente. Ausente = natural. */
export type SiteSectionScrollKind = "natural" | "smooth" | "snap";

export type SiteSectionScrollBand = "wide" | "monitor" | "tablet" | "mobile";

export type SiteBlueprintScrollFlowBandV1 = {
  /** Llegada a la primera sección (carga de página). */
  entry?: SiteSectionScrollKind;
  /** Tramos `fromId>toId`. */
  hops?: Record<string, SiteSectionScrollKind>;
};

export type SiteBlueprintScrollFlowV1 = SiteBlueprintScrollFlowBandV1 & {
  /** Tablet y móvil son independientes; ausente = recorrido natural en esa banda. */
  byBand?: Partial<Record<ResponsiveEditableBand, SiteBlueprintScrollFlowBandV1>>;
};

/** Agrupaciones Designer ignoradas en Site Creator (solo semántica local). */
export type SiteDismissedDesignerMirrorsV1 = {
  containerLayerIds: string[];
  groupIds: string[];
};

export type ResponsiveEditableBand = "monitor" | "tablet" | "mobile";

export const RESPONSIVE_EDITABLE_BANDS: readonly ResponsiveEditableBand[] = [
  "monitor",
  "tablet",
  "mobile",
];

export function isResponsiveEditableBand(band: string): band is ResponsiveEditableBand {
  return band === "monitor" || band === "tablet" || band === "mobile";
}

/** El encuadre de medios también puede personalizarse en la vista Original. */
export type ResponsiveMediaBand = SiteSectionScrollBand;
/** La visibilidad puede decidirse de forma independiente en cada vista. */
export type ResponsiveVisibilityBand = ResponsiveMediaBand;
export type ResponsiveOverrideMode = "preserve" | "stack" | "auto";
export type ResponsiveAlignX = "start" | "center" | "end";
export type ResponsiveAlignY = "start" | "center" | "end";
export type ResponsiveWidthMode = "content" | "container" | "full";
export type ResponsiveMediaFit = "cover" | "contain" | "preserve";

export type ResponsiveTargetRef =
  | { kind: "blueprintNode"; nodeId: string }
  | { kind: "designerGroup"; layerId: string };

export type ResponsiveItemRef =
  | { kind: "blueprintNode"; nodeId: string }
  | { kind: "layer"; layerId: string };

export type ResponsiveContainerRuleV1 = {
  target: ResponsiveTargetRef;
  byBand: Partial<Record<ResponsiveEditableBand, ResponsiveOverrideMode>>;
};

/** Ajustes 6C de un elemento (hijo) en una vista. Ausente = automático. */
export type ResponsiveItemTuneV1 = {
  hidden?: boolean;
  alignX?: ResponsiveAlignX;
  alignY?: ResponsiveAlignY;
  widthMode?: ResponsiveWidthMode;
  order?: number;
  offset?: { x: number; y: number };
  size?: { width?: number; height?: number };
};

export type ResponsiveItemRuleV1 = {
  target: ResponsiveItemRef;
  byBand: Partial<Record<ResponsiveVisibilityBand, ResponsiveItemTuneV1>>;
};

/** Ajustes 6C de un contenedor (Hero / Sección / Grupo). */
export type ResponsiveContainerTuneV1 = {
  padding?: number;
  gap?: number;
  contentAlignX?: ResponsiveAlignX;
  contentAlignY?: ResponsiveAlignY;
  contentWidthMode?: ResponsiveWidthMode | "scale";
  fitOrigin?: LayoutGroupFitOrigin;
  maxContentWidth?: number;
  minHeight?: number;
  autoHeight?: boolean;
  /** Alto de sección en esta banda. Ausente = alto del diseño. */
  heightMode?: SiteSectionHeightMode;
  /** Solo con `heightMode: "custom"`. */
  customHeight?: number;
  /** MultiCard: modo de repetición en esta banda. Ausente = hereda Original. */
  repeatMode?: SiteMultiCardLayoutMode;
  /** MultiCard: gap entre cards en esta banda. Distinto de `gap` (stack). */
  cardGap?: number;
  navVisibility?: SiteMultiCardNavVisibility;
  navStyle?: SiteMultiCardNavStyle;
  visibleHeight?: number;
};

export type ResponsiveContainerTuneRuleV1 = {
  target: ResponsiveTargetRef;
  byBand: Partial<Record<ResponsiveEditableBand, ResponsiveContainerTuneV1>>;
};

export type ResponsiveMediaTuneV1 = {
  fit?: ResponsiveMediaFit;
  focal?: { x: number; y: number };
  /**
   * Escala del contenido recortado respecto al encuadre de origen.
   * 1 = tamaño actual al entrar; puede ser < 1 hasta el cover de la máscara.
   */
  zoom?: number;
};

export type ResponsiveMediaRuleV1 = {
  layerId: string;
  byBand: Partial<Record<ResponsiveMediaBand, ResponsiveMediaTuneV1>>;
};

/** Fondo explícito y reversible de un contenedor en una vista concreta. */
export type ResponsiveBackgroundPlacementV1 = {
  target: ResponsiveTargetRef;
  /** Imagen real que se encuadra; puede vivir dentro de una clippingContainer. */
  imageLayerId: string;
  /** Forma decorativa inferior reutilizada como máscara y color de respaldo. */
  surfaceLayerId?: string;
  focal?: { x: number; y: number };
  zoom?: number;
};

export type ResponsiveBackgroundRuleV1 = {
  /** Imagen o clippingContainer que deja de participar en el flujo. */
  sourceLayerId: string;
  byBand: Partial<Record<ResponsiveMediaBand, ResponsiveBackgroundPlacementV1>>;
};

export type SiteResponsiveV1 = {
  version: 1;
  rules: ResponsiveContainerRuleV1[];
  items?: ResponsiveItemRuleV1[];
  containerTunes?: ResponsiveContainerTuneRuleV1[];
  media?: ResponsiveMediaRuleV1[];
  backgrounds?: ResponsiveBackgroundRuleV1[];
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

/** Metadatos de la carpeta pública. El HTML no vive en el nodo. */
export interface SiteCreatorPublishStateV1 {
  siteId: string;
  publishedAt: string;
  publicPath: string;
  fileCount: number;
}

export interface SiteCreatorNodeData {
  label?: string;
  schemaVersion: typeof SITE_CREATOR_SCHEMA_VERSION;
  blueprint: SiteBlueprintV1;
  sourceSnapshot?: DesignerSourceSnapshotV1;
  studioState?: SiteCreatorStudioState;
  publish?: SiteCreatorPublishStateV1 | null;
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

export function parseSiteCreatorPublishState(value: unknown): SiteCreatorPublishStateV1 | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Partial<SiteCreatorPublishStateV1>;
  if (typeof raw.siteId !== "string" || !/^[a-f0-9]{32}$/.test(raw.siteId)) return undefined;
  if (typeof raw.publishedAt !== "string" || !raw.publishedAt.trim()) return undefined;
  if (typeof raw.publicPath !== "string" || !raw.publicPath.startsWith("/s/")) return undefined;
  return {
    siteId: raw.siteId,
    publishedAt: raw.publishedAt,
    publicPath: raw.publicPath,
    fileCount: typeof raw.fileCount === "number" && Number.isFinite(raw.fileCount) ? raw.fileCount : 0,
  };
}

export function parseSiteCreatorNodeData(data: unknown): SiteCreatorNodeData {
  const raw = (data ?? {}) as Partial<SiteCreatorNodeData>;
  const blueprint = isValidSiteBlueprintV1(raw.blueprint)
    ? sanitizeSiteBlueprintV1(raw.blueprint)
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
    publish: parseSiteCreatorPublishState(raw.publish) ?? null,
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

export function isSiteMultiCardNode(node: SiteBlueprintNode): node is SiteBlueprintMultiCardNode {
  return node.kind === "multicard";
}

/** Sección, grupo o MultiCard (no botón). */
export function isSiteStructuralContainerNode(
  node: SiteBlueprintNode | null | undefined,
): node is SiteBlueprintSectionNode | SiteBlueprintLayoutGroupNode | SiteBlueprintMultiCardNode {
  if (!node) return false;
  return node.kind === "section" || node.kind === "layoutGroup" || node.kind === "multicard";
}

export function sanitizeSiteBlueprintV1(blueprint: SiteBlueprintV1): SiteBlueprintV1 {
  let changed = false;
  const nodes: Record<string, SiteBlueprintNode> = {};
  for (const [id, node] of Object.entries(blueprint.nodes ?? {})) {
    if (node && (node as { kind?: string }).kind === "multicard") {
      nodes[id] = parseMultiCardNode(node);
      changed = true;
    } else {
      nodes[id] = node;
    }
  }
  if (!changed) return blueprint;
  return { ...blueprint, nodes };
}

export function parseMultiCardNode(raw: unknown): SiteBlueprintMultiCardNode {
  const node = (raw ?? {}) as Partial<SiteBlueprintMultiCardNode> & {
    id?: string;
    label?: string;
    parentId?: string | null;
    childIds?: string[];
    layerIds?: string[];
  };
  const cards = parseMultiCardCards(node.cards);
  return {
    id: typeof node.id === "string" && node.id.trim() ? node.id : "scmc_unknown",
    kind: "multicard",
    label: typeof node.label === "string" && node.label.trim() ? node.label : "MultiCard",
    parentId: typeof node.parentId === "string" ? node.parentId : null,
    childIds: Array.isArray(node.childIds) ? node.childIds.filter((id) => typeof id === "string") : [],
    layerIds: Array.isArray(node.layerIds) ? node.layerIds.filter((id) => typeof id === "string") : [],
    count: cards.length,
    layoutMode: parseMultiCardLayoutMode(node.layoutMode),
    gap: parseMultiCardGap(node.gap),
    ...(parseMultiCardNav(node.nav) ? { nav: parseMultiCardNav(node.nav)! } : {}),
    ...(typeof node.visibleHeight === "number" &&
    Number.isFinite(node.visibleHeight) &&
    node.visibleHeight > 0
      ? { visibleHeight: node.visibleHeight }
      : {}),
    cards,
  };
}

export function cloneMultiCardNode(node: SiteBlueprintMultiCardNode): SiteBlueprintMultiCardNode {
  return parseMultiCardNode({
    ...node,
    childIds: [...node.childIds],
    layerIds: [...node.layerIds],
    cards: node.cards.map((card) => ({
      id: card.id,
      overrides: { ...card.overrides },
    })),
  });
}

function parseMultiCardLayoutMode(value: unknown): SiteMultiCardLayoutMode {
  return value === "scrollH" || value === "scrollV" || value === "grid" ? value : "grid";
}

function parseMultiCardGap(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  return MULTICARD_DEFAULT_GAP;
}

function parseMultiCardNav(value: unknown): SiteMultiCardNavV1 | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as { visibility?: unknown; style?: unknown };
  const visibility = raw.visibility === "hidden" || raw.visibility === "auto" ? raw.visibility : "auto";
  const style = raw.style === "dots" || raw.style === "arrows" ? raw.style : "arrows";
  return { visibility, style };
}

function parseMultiCardCards(raw: unknown): SiteMultiCardInstanceV1[] {
  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set<string>();
  const cards: SiteMultiCardInstanceV1[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const id = (item as { id?: unknown }).id;
    if (typeof id !== "string" || !id.startsWith("scmcc_") || seen.has(id)) continue;
    seen.add(id);
    cards.push({
      id,
      overrides: parseMultiCardOverrides((item as { overrides?: unknown }).overrides),
    });
    if (cards.length >= MULTICARD_COUNT_MAX) break;
  }
  if (cards.length === 0) {
    return [{ id: createSiteMultiCardCardId(), overrides: {} }];
  }
  return cards;
}

function parseMultiCardOverrides(raw: unknown): Record<string, SiteMultiCardSlotOverrideV1> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, SiteMultiCardSlotOverrideV1> = {};
  for (const [layerId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!layerId.trim() || !value || typeof value !== "object" || Array.isArray(value)) continue;
    const item = value as { text?: unknown; mediaRef?: unknown };
    const slot: SiteMultiCardSlotOverrideV1 = {};
    if (typeof item.text === "string") slot.text = item.text;
    if (item.mediaRef && typeof item.mediaRef === "object" && !Array.isArray(item.mediaRef)) {
      const media = item.mediaRef as { src?: unknown; s3Key?: unknown };
      const mediaRef: SiteMultiCardMediaRefV1 = {};
      if (typeof media.src === "string" && media.src.trim()) mediaRef.src = media.src;
      if (typeof media.s3Key === "string" && media.s3Key.trim()) mediaRef.s3Key = media.s3Key;
      if (mediaRef.src || mediaRef.s3Key) slot.mediaRef = mediaRef;
    }
    if (slot.text != null || slot.mediaRef) out[layerId] = slot;
  }
  return out;
}
