/**
 * Árbol de publicación: cada grupo Designer / layoutGroup es un contenedor
 * con coordenadas locales. Las hojas siguen siendo capas pintables.
 */
import type { FreehandObject } from "@/app/spaces/FreehandStudio";
import { unionPageRects, type PageRect } from "./site-creator-coordinate-space";
import {
  collectDesignerGroupIdClusters,
  designerGroupIdMirrorNodeId,
} from "./site-creator-designer-group-id";
import {
  designerGroupMirrorNodeId,
  isDesignerGroupMirrorNode,
  mirrorContainerLayerIdFromNode,
} from "./site-creator-designer-group-bootstrap";
import { collectSemanticCoverageLayerIds } from "./site-blueprint-ownership";
import type { SiteCreatorSelectionIndex } from "./site-creator-selection-types";
import type {
  LayoutGroupWidthMode,
  SiteBlueprintLayoutGroupNode,
  SiteBlueprintV1,
} from "./site-creator-types";

export type PublishBand = "wide" | "tablet" | "mobile";

export type PublishBox = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  visible: boolean;
};

export type PublishTreeGroup = {
  kind: "group";
  id: string;
  z: number;
  widthMode: LayoutGroupWidthMode;
  world: Record<PublishBand, PublishBox | null>;
  children: PublishTreeNode[];
  clipOverflow?: boolean;
};

export type PublishTreeRow = {
  kind: "row";
  id: string;
  z: number;
  role: "full" | "rest";
  world: Record<PublishBand, PublishBox | null>;
  children: PublishTreeNode[];
};

export type PublishTreeLayer = {
  kind: "layer";
  id: string;
  z: number;
  world: Record<PublishBand, PublishBox | null>;
};

export type PublishTreeNode = PublishTreeGroup | PublishTreeRow | PublishTreeLayer;

export type PublishForest = {
  children: PublishTreeNode[];
  usesFlow: boolean;
};

type RawNode = {
  kind: "group" | "layer" | "row";
  id: string;
  z: number;
  widthMode?: LayoutGroupWidthMode;
  role?: "full" | "rest";
  box: PublishBox;
  children?: RawNode[];
  clipOverflow?: boolean;
};

const BANDS: PublishBand[] = ["wide", "tablet", "mobile"];

export function boxFromObject(obj: FreehandObject): PublishBox {
  return {
    x: obj.x,
    y: obj.y,
    width: Math.max(0, obj.width),
    height: Math.max(0, obj.height),
    rotation: obj.rotation || 0,
    opacity: obj.opacity == null ? 1 : obj.opacity,
    visible: obj.visible !== false,
  };
}

export function collectObjectMap(objects: FreehandObject[] | undefined): Map<string, FreehandObject> {
  const map = new Map<string, FreehandObject>();
  const visit = (list: FreehandObject[] | undefined) => {
    for (const obj of list ?? []) {
      map.set(obj.id, obj);
      if (obj.type === "groupContainer" || obj.type === "booleanGroup") {
        visit((obj as { children?: FreehandObject[] }).children);
      } else if (obj.type === "clippingContainer") {
        const clip = obj as { mask?: FreehandObject; content?: FreehandObject[] };
        if (clip.mask) visit([clip.mask]);
        visit(clip.content);
      }
    }
  };
  visit(objects);
  return map;
}

export function toLocalBox(world: PublishBox, parent: PageRect): PublishBox {
  return {
    ...world,
    x: world.x - parent.x,
    y: world.y - parent.y,
  };
}

function boxToRect(box: PublishBox): PageRect {
  return { x: box.x, y: box.y, width: box.width, height: box.height };
}

function rectsYOverlap(a: PageRect, b: PageRect): boolean {
  return a.y < b.y + b.height && b.y < a.y + a.height;
}

function unionBoxes(boxes: PublishBox[]): PublishBox | null {
  const rect = unionPageRects(boxes.map(boxToRect));
  if (!rect) return null;
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    rotation: 0,
    opacity: 1,
    visible: true,
  };
}

function emptyBands(): Record<PublishBand, PublishBox | null> {
  return { wide: null, tablet: null, mobile: null };
}

function withBand(
  world: Record<PublishBand, PublishBox | null>,
  band: PublishBand,
  box: PublishBox | null,
): Record<PublishBand, PublishBox | null> {
  return { ...world, [band]: box };
}

export function layoutGroupWidthMode(
  blueprint: SiteBlueprintV1,
  nodeId: string | null | undefined,
): LayoutGroupWidthMode {
  if (!nodeId) return "content";
  const node = blueprint.nodes[nodeId];
  if (node?.kind === "layoutGroup" && (node.widthMode === "full" || node.widthMode === "scale")) {
    return "full";
  }
  return "content";
}

function widthModeForContainerLayer(
  blueprint: SiteBlueprintV1,
  containerLayerId: string,
  index: SiteCreatorSelectionIndex,
): LayoutGroupWidthMode {
  const stable = designerGroupMirrorNodeId(containerLayerId);
  if (layoutGroupWidthMode(blueprint, stable) === "full") return "full";
  for (const node of Object.values(blueprint.nodes)) {
    if (node.kind !== "layoutGroup") continue;
    if (!isDesignerGroupMirrorNode(node, index)) continue;
    if (mirrorContainerLayerIdFromNode(node as SiteBlueprintLayoutGroupNode) === containerLayerId) {
      return layoutGroupWidthMode(blueprint, node.id);
    }
  }
  return "content";
}

function isPaintable(obj: FreehandObject): boolean {
  if (obj.visible === false) return false;
  if (obj.type === "adjustmentLayer") return false;
  if (obj.type === "groupContainer" || obj.type === "booleanGroup" || obj.type === "clippingContainer") {
    return false;
  }
  return true;
}

function visitDesignerList(
  objects: FreehandObject[] | undefined,
  zBase: number,
  blueprint: SiteBlueprintV1,
  index: SiteCreatorSelectionIndex,
): RawNode[] {
  const raw: RawNode[] = [];
  (objects ?? []).forEach((obj, i) => {
    const z = zBase + i + 1;
    if (obj.visible === false) return;
    if (obj.type === "groupContainer") {
      const children = visitDesignerList(
        (obj as { children?: FreehandObject[] }).children,
        z * 100,
        blueprint,
        index,
      );
      const childUnion = unionBoxes(children.map((c) => c.box));
      const box = childUnion ?? boxFromObject(obj);
      const parentRect = { x: box.x, y: box.y, width: box.width, height: box.height };
      raw.push({
        kind: "group",
        id: obj.id,
        z,
        widthMode: widthModeForContainerLayer(blueprint, obj.id, index),
        box: {
          ...box,
          rotation: obj.rotation || 0,
          opacity: obj.opacity == null ? 1 : obj.opacity,
          visible: true,
        },
        children: promoteFlow(children, parentRect),
      });
      return;
    }
    if (obj.type === "booleanGroup") {
      raw.push(
        ...visitDesignerList((obj as { children?: FreehandObject[] }).children, z * 100, blueprint, index),
      );
      return;
    }
    if (obj.type === "clippingContainer") {
      const clip = obj as { content?: FreehandObject[] };
      const children = visitDesignerList(clip.content, z * 100, blueprint, index).map((child) =>
        offsetRawNode(child, obj.x, obj.y),
      );
      raw.push({
        kind: "group",
        id: obj.id,
        z,
        box: boxFromObject(obj),
        children,
        clipOverflow: true,
      });
      return;
    }
    if (!isPaintable(obj)) return;
    raw.push({ kind: "layer", id: obj.id, z, box: boxFromObject(obj) });
  });
  return wrapSiblingUnits(raw, blueprint, index);
}

function offsetRawNode(node: RawNode, dx: number, dy: number): RawNode {
  return {
    ...node,
    box: { ...node.box, x: node.box.x + dx, y: node.box.y + dy },
    children: node.children?.map((child) => offsetRawNode(child, dx, dy)),
  };
}

function wrapSiblingUnits(
  nodes: RawNode[],
  blueprint: SiteBlueprintV1,
  index: SiteCreatorSelectionIndex,
): RawNode[] {
  const wrappedIds = wrapGroupIdClusters(nodes, blueprint, index);
  return wrapManualLayoutGroups(wrappedIds, blueprint, index);
}

function wrapGroupIdClusters(
  nodes: RawNode[],
  blueprint: SiteBlueprintV1,
  index: SiteCreatorSelectionIndex,
): RawNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const used = new Set<string>();
  const clusters = collectDesignerGroupIdClusters(index);
  const out: RawNode[] = [];
  const clusterByMember = new Map<string, (typeof clusters)[number]>();
  for (const cluster of clusters) {
    if (!cluster.memberIds.every((id) => byId.has(id) && byId.get(id)?.kind === "layer")) continue;
    for (const id of cluster.memberIds) clusterByMember.set(id, cluster);
  }

  for (const node of nodes) {
    if (used.has(node.id)) continue;
    const cluster = clusterByMember.get(node.id);
    if (!cluster) {
      out.push(node);
      used.add(node.id);
      continue;
    }
    const members = cluster.memberIds
      .map((id) => byId.get(id))
      .filter((n): n is RawNode => Boolean(n));
    if (members.length < 2) {
      out.push(node);
      used.add(node.id);
      continue;
    }
    members.forEach((m) => used.add(m.id));
    const union = unionBoxes(members.map((m) => m.box));
    if (!union) continue;
    const mirrorId = designerGroupIdMirrorNodeId(cluster.designerGroupId);
    out.push({
      kind: "group",
      id: mirrorId,
      z: Math.min(...members.map((m) => m.z)),
      widthMode: layoutGroupWidthMode(blueprint, mirrorId),
      box: union,
      children: members.sort((a, b) => a.z - b.z),
    });
  }
  return out;
}

function wrapManualLayoutGroups(
  nodes: RawNode[],
  blueprint: SiteBlueprintV1,
  index: SiteCreatorSelectionIndex,
): RawNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const used = new Set<string>();
  const groups = Object.values(blueprint.nodes).filter((node): node is SiteBlueprintLayoutGroupNode => {
    if (node.kind !== "layoutGroup") return false;
    if (isDesignerGroupMirrorNode(node, index)) return false;
    if (node.id.startsWith("scgrp_dg_gid_")) return false;
    return true;
  });

  const out: RawNode[] = [];
  for (const node of nodes) {
    if (used.has(node.id)) continue;
    const owner = groups.find((group) => {
      const ids = new Set([
        ...group.layerIds,
        ...group.childIds.flatMap((childId) => collectSemanticCoverageLayerIds(blueprint, childId)),
        ...group.childIds,
      ]);
      return ids.has(node.id);
    });
    if (!owner) {
      out.push(node);
      used.add(node.id);
      continue;
    }
    if (used.has(owner.id)) continue;
    const memberIds = [
      ...owner.layerIds,
      ...owner.childIds,
      ...owner.childIds.flatMap((childId) => collectSemanticCoverageLayerIds(blueprint, childId)),
    ];
    const members = unique(memberIds)
      .map((id) => byId.get(id))
      .filter((n): n is RawNode => Boolean(n));
    if (members.length === 0) {
      out.push(node);
      used.add(node.id);
      continue;
    }
    members.forEach((m) => used.add(m.id));
    used.add(owner.id);
    const union = unionBoxes(members.map((m) => m.box));
    if (!union) continue;
    out.push({
      kind: "group",
      id: owner.id,
      z: Math.min(...members.map((m) => m.z)),
      widthMode: layoutGroupWidthMode(blueprint, owner.id),
      box: union,
      children: members.sort((a, b) => a.z - b.z),
    });
  }
  return out;
}

function unique(ids: string[]): string[] {
  return [...new Set(ids)];
}

function isBackgroundLayer(node: RawNode, parent: PageRect): boolean {
  if (node.kind !== "layer") return false;
  if (!(parent.width > 0 && parent.height > 0)) return false;
  const coversW = node.box.width >= parent.width * 0.7;
  const coversH = node.box.height >= parent.height * 0.7;
  return coversW && coversH;
}

function clusterRows(nodes: RawNode[]): RawNode[][] {
  const sorted = [...nodes].sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x || a.z - b.z);
  const rows: RawNode[][] = [];
  for (const node of sorted) {
    const last = rows[rows.length - 1];
    if (last && last.some((item) => rectsYOverlap(boxToRect(item.box), boxToRect(node.box)))) {
      last.push(node);
    } else {
      rows.push([node]);
    }
  }
  return rows;
}

function promoteFlow(nodes: RawNode[], parent: PageRect): RawNode[] {
  if (!nodes.some((n) => n.kind === "group")) return nodes;
  const backgrounds = nodes.filter((n) => isBackgroundLayer(n, parent));
  const foreground = nodes.filter((n) => !isBackgroundLayer(n, parent));
  if (foreground.length === 0) return nodes;
  const rows = clusterRows(foreground);
  const flowed: RawNode[] = [...backgrounds];
  rows.forEach((row, rowIndex) => {
    const fulls = row.filter((n) => n.kind === "group" && n.widthMode === "full");
    const rest = row.filter((n) => !(n.kind === "group" && n.widthMode === "full"));
    if (fulls.length === 0 && row.length < 2) {
      flowed.push(...row);
      return;
    }
    fulls.forEach((full, fullIndex) => {
      flowed.push({
        kind: "row",
        id: `row_full_${rowIndex}_${fullIndex}_${full.id}`,
        z: full.z,
        role: "full",
        box: full.box,
        children: [full],
      });
    });
    if (rest.length === 0) return;
    const union = unionBoxes(rest.map((n) => n.box));
    if (!union) {
      flowed.push(...rest);
      return;
    }
    flowed.push({
      kind: "row",
      id: `row_rest_${rowIndex}_${rest.map((n) => n.id).join("_")}`,
      z: Math.min(...rest.map((n) => n.z)),
      role: "rest",
      box: union,
      children: [...rest].sort((a, b) => a.box.x - b.box.x || a.z - b.z),
    });
  });
  return flowed;
}

function rawToTree(node: RawNode, band: PublishBand): PublishTreeNode {
  if (node.kind === "layer") {
    return {
      kind: "layer",
      id: node.id,
      z: node.z,
      world: withBand(emptyBands(), band, node.box),
    };
  }
  const children = (node.children ?? []).map((child) => rawToTree(child, band));
  if (node.kind === "row") {
    return {
      kind: "row",
      id: node.id,
      z: node.z,
      role: node.role ?? "rest",
      world: withBand(emptyBands(), band, node.box),
      children,
    };
  }
  return {
    kind: "group",
    id: node.id,
    z: node.z,
    widthMode: node.widthMode ?? "content",
    world: withBand(emptyBands(), band, node.box),
    children,
    clipOverflow: node.clipOverflow,
  };
}

function fillBandBoxes(
  nodes: PublishTreeNode[],
  band: PublishBand,
  map: Map<string, FreehandObject>,
  clipOrigin: { x: number; y: number } | null = null,
): void {
  for (const node of nodes) {
    if (node.kind === "layer") {
      const obj = map.get(node.id);
      if (!obj) {
        node.world[band] = null;
        continue;
      }
      const box = boxFromObject(obj);
      node.world[band] = clipOrigin
        ? { ...box, x: box.x + clipOrigin.x, y: box.y + clipOrigin.y }
        : box;
      continue;
    }
    const host = map.get(node.id);
    fillBandBoxes(
      node.children,
      band,
      map,
      host?.type === "clippingContainer"
        ? { x: (clipOrigin?.x ?? 0) + host.x, y: (clipOrigin?.y ?? 0) + host.y }
        : clipOrigin,
    );
    const childBoxes = node.children
      .map((child) => child.world[band])
      .filter((box): box is PublishBox => Boolean(box));
    const union = unionBoxes(childBoxes);
    if (node.kind === "group") {
      const obj = map.get(node.id);
      node.world[band] = obj ? boxFromObject(obj) : union;
    } else {
      node.world[band] = union;
    }
  }
}

function pageRectOfObjects(objects: FreehandObject[] | undefined, fallback: PageRect): PageRect {
  const boxes: PageRect[] = [];
  const visit = (list: FreehandObject[] | undefined) => {
    for (const obj of list ?? []) {
      if (obj.visible === false) continue;
      boxes.push({ x: obj.x, y: obj.y, width: obj.width, height: obj.height });
      if (obj.type === "groupContainer" || obj.type === "booleanGroup") {
        visit((obj as { children?: FreehandObject[] }).children);
      }
    }
  };
  visit(objects);
  return unionPageRects(boxes) ?? fallback;
}

export function buildPublishForest(args: {
  objectsByBand: Record<PublishBand, FreehandObject[]>;
  blueprint: SiteBlueprintV1;
  index: SiteCreatorSelectionIndex;
  pageRect: PageRect;
}): PublishForest {
  const wideObjects = args.objectsByBand.wide ?? [];
  const parent = pageRectOfObjects(wideObjects, args.pageRect);
  const raw = promoteFlow(visitDesignerList(wideObjects, 0, args.blueprint, args.index), parent);
  const children = raw.map((node) => rawToTree(node, "wide"));
  for (const band of BANDS) {
    if (band === "wide") continue;
    fillBandBoxes(children, band, collectObjectMap(args.objectsByBand[band]));
  }
  return {
    children,
    usesFlow: publishForestUsesFlow(children),
  };
}

export function worldBoxForBand(node: PublishTreeNode, band: PublishBand): PublishBox | null {
  return node.world[band] ?? node.world.wide;
}

export function walkPublishTree(nodes: PublishTreeNode[], visit: (node: PublishTreeNode) => void): void {
  for (const node of nodes) {
    visit(node);
    if (node.kind !== "layer") walkPublishTree(node.children, visit);
  }
}

export function publishForestUsesFlow(nodes: PublishTreeNode[]): boolean {
  let flow = false;
  walkPublishTree(nodes, (node) => {
    if (node.kind === "row") flow = true;
    if (node.kind === "group" && node.widthMode === "full") flow = true;
  });
  return flow;
}

export function collectPublishLayerIds(nodes: PublishTreeNode[]): string[] {
  const ids: string[] = [];
  walkPublishTree(nodes, (node) => {
    if (node.kind === "layer") ids.push(node.id);
  });
  return ids;
}
