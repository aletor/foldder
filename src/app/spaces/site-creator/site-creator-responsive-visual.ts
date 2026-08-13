/**
 * Fase 6B.1 — análisis visual previo al layout responsive.
 * Agrupa capas en unidades de presentación; no escribe Blueprint ni Designer.
 */
import type { FreehandObject } from "../FreehandStudio";
import { collectSemanticCoverageLayerIds } from "./site-blueprint-ownership";
import {
  pageRectFullyContains,
  unionPageRects,
  type PageRect,
} from "./site-creator-coordinate-space";
import type { SiteCreatorSelectionIndex } from "./site-creator-selection-types";
import type { SiteBlueprintV1 } from "./site-creator-types";
import { isSiteButtonNode, isSiteSectionNode } from "./site-creator-types";

export type ResponsiveVisualRole =
  | "background"
  | "surface"
  | "content"
  | "decoration"
  | "atomic";

export type ResponsivePresentationUnit = {
  id: string;
  kind: "button" | "designerGroup" | "layoutGroup" | "layer";
  layerIds: string[];
  bounds: PageRect;
  /** z-order del elemento representativo (más pequeño = más atrás). */
  zOrder: number[];
  nodeId?: string;
  role: Exclude<ResponsiveVisualRole, "background" | "surface">;
};

export type ResponsiveVisualCluster =
  | {
      kind: "surface";
      id: string;
      surfaceLayerId: string;
      surfaceBounds: PageRect;
      members: ResponsivePresentationUnit[];
      bounds: PageRect;
      allLayerIds: string[];
    }
  | {
      kind: "preserve";
      id: string;
      reason: string;
      units: ResponsivePresentationUnit[];
      bounds: PageRect;
      allLayerIds: string[];
    }
  | {
      kind: "solo";
      id: string;
      unit: ResponsivePresentationUnit;
      bounds: PageRect;
      allLayerIds: string[];
    };

export type ContainerBackgroundClassification = {
  backgroundLayerIds: string[];
  /** layerId → razón de clasificación (debug/tests). */
  reasons: Record<string, string>;
};

export type SectionVisualAnalysis = {
  sectionId: string;
  containerBounds: PageRect;
  background: ContainerBackgroundClassification;
  units: ResponsivePresentationUnit[];
  clusters: ResponsiveVisualCluster[];
  fallbackReasons: string[];
};

const TECHNICAL_TYPES = new Set(["clippingContainer", "adjustmentLayer"]);

function area(r: PageRect): number {
  return Math.max(0, r.width) * Math.max(0, r.height);
}

function centerOf(r: PageRect): { x: number; y: number } {
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}

function pointInRect(p: { x: number; y: number }, r: PageRect): boolean {
  return p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
}

function intersectionArea(a: PageRect, b: PageRect): number {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.width, b.x + b.width);
  const y1 = Math.min(a.y + a.height, b.y + b.height);
  if (x1 <= x0 || y1 <= y0) return 0;
  return (x1 - x0) * (y1 - y0);
}

/** Compara z-order: negativo si `a` está detrás de `b`. */
export function compareZOrderPath(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    if (a[i] !== b[i]) return a[i]! - b[i]!;
  }
  return a.length - b.length;
}

function minZ(ids: string[], index: SiteCreatorSelectionIndex): number[] {
  let best: number[] | null = null;
  for (const id of ids) {
    const z = index.byId[id]?.zOrderPath;
    if (!z) continue;
    if (!best || compareZOrderPath(z, best) < 0) best = z;
  }
  return best ?? [0];
}

function boundsOfIds(ids: string[], index: SiteCreatorSelectionIndex): PageRect | null {
  const rects = ids
    .map((id) => index.byId[id]?.visualBounds)
    .filter((r): r is PageRect => Boolean(r));
  return unionPageRects(rects);
}

function isShapeType(type: string): boolean {
  return type === "rect" || type === "ellipse" || type === "path";
}

function isBackgroundCandidateType(type: string): boolean {
  return type === "image" || isShapeType(type);
}

function unique(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * Detecta capas de fondo de un contenedor (Hero/Section).
 *
 * Una imagen o forma puede ser fondo cuando:
 * - Está detrás de la mayoría del contenido (z-order).
 * - Cubre una parte sustancial del contenedor.
 * - Su posición indica cobertura del contenedor.
 * - No pertenece a un Button.
 * - No es una imagen pequeña de contenido.
 */
export function classifyContainerBackground(args: {
  containerBounds: PageRect;
  layerIds: string[];
  index: SiteCreatorSelectionIndex;
  buttonLayerIds: Set<string>;
}): ContainerBackgroundClassification {
  const { containerBounds, index, buttonLayerIds } = args;
  const containerA = area(containerBounds);
  const reasons: Record<string, string> = {};
  if (containerA <= 0) return { backgroundLayerIds: [], reasons };

  const contentIds = args.layerIds.filter((id) => {
    const e = index.byId[id];
    if (!e?.visible) return false;
    if (buttonLayerIds.has(id)) return false;
    if (TECHNICAL_TYPES.has(e.type)) return false;
    return true;
  });

  type Candidate = { id: string; score: number; reason: string };
  const candidates: Candidate[] = [];

  for (const id of contentIds) {
    const entry = index.byId[id];
    if (!entry || !isBackgroundCandidateType(entry.type)) continue;
    const b = entry.visualBounds;
    const cover = area(b) / containerA;
    const widthRatio = b.width / Math.max(1, containerBounds.width);
    const heightRatio = b.height / Math.max(1, containerBounds.height);
    const containsCenter = pointInRect(centerOf(containerBounds), b);
    const overlapsContainer = intersectionArea(b, containerBounds) / containerA;

    // Imagen pequeña de contenido: baja cobertura y no full-bleed
    if (entry.type === "image" && cover < 0.25 && widthRatio < 0.7) {
      reasons[id] = "rejected:small-content-image";
      continue;
    }

    const substantial =
      cover >= 0.55 || (widthRatio >= 0.8 && heightRatio >= 0.4) || overlapsContainer >= 0.7;
    if (!substantial) {
      reasons[id] = "rejected:insufficient-coverage";
      continue;
    }

    if (!containsCenter && overlapsContainer < 0.5) {
      reasons[id] = "rejected:position-not-covering";
      continue;
    }

    // Detrás de la mayoría del resto del contenido
    const others = contentIds.filter((oid) => oid !== id);
    if (others.length > 0) {
      let behindCount = 0;
      for (const oid of others) {
        const oz = index.byId[oid]?.zOrderPath;
        if (!oz) continue;
        if (compareZOrderPath(entry.zOrderPath, oz) < 0) behindCount += 1;
      }
      if (behindCount < others.length * 0.5) {
        reasons[id] = "rejected:not-behind-majority";
        continue;
      }
    }

    const zLeaf = entry.zOrderPath[entry.zOrderPath.length - 1] ?? 0;
    const score = cover * 12 + overlapsContainer * 4 - zLeaf * 0.02;
    const reason = `background:cover=${cover.toFixed(2)};behind-majority;type=${entry.type}`;
    candidates.push({ id, score, reason });
  }

  candidates.sort((a, b) => b.score - a.score);
  const backgroundLayerIds: string[] = [];
  if (candidates[0]) {
    backgroundLayerIds.push(candidates[0].id);
    reasons[candidates[0].id] = candidates[0].reason;
    // Segundos fondos casi full-bleed detrás del primero
    for (const c of candidates.slice(1)) {
      const e = index.byId[c.id];
      if (!e) continue;
      const cover = area(e.visualBounds) / containerA;
      if (cover < 0.85) continue;
      if (compareZOrderPath(e.zOrderPath, index.byId[candidates[0].id]!.zOrderPath) >= 0) continue;
      backgroundLayerIds.push(c.id);
      reasons[c.id] = `${c.reason};secondary`;
    }
  }

  return { backgroundLayerIds, reasons };
}

function expandDesignerGroupLayers(
  rootId: string,
  index: SiteCreatorSelectionIndex,
): string[] {
  const root = index.byId[rootId];
  if (!root) return [rootId];
  if (root.containerKind !== "groupContainer" && root.containerKind !== "booleanGroup") {
    return [rootId];
  }
  const out = [rootId];
  for (const e of index.entries) {
    if (e.ancestorIds.includes(rootId)) out.push(e.layerId);
  }
  return unique(out);
}

/**
 * Construye unidades de presentación a partir del árbol semántico + geometría.
 * Wrappers técnicos transparentes; Button = atómico.
 */
export function buildSectionPresentationUnits(args: {
  blueprint: SiteBlueprintV1;
  sectionId: string;
  index: SiteCreatorSelectionIndex;
  excludeLayerIds: Set<string>;
}): ResponsivePresentationUnit[] {
  const { blueprint, sectionId, index, excludeLayerIds } = args;
  const section = blueprint.nodes[sectionId];
  if (!section || !isSiteSectionNode(section)) return [];

  const coverage = collectSemanticCoverageLayerIds(blueprint, sectionId);
  const used = new Set<string>(excludeLayerIds);
  const units: ResponsivePresentationUnit[] = [];

  for (const childId of section.childIds) {
    const child = blueprint.nodes[childId];
    if (!child) continue;
    if (isSiteButtonNode(child)) {
      const layerIds = collectSemanticCoverageLayerIds(blueprint, childId).filter(
        (id) => !excludeLayerIds.has(id),
      );
      const bounds = boundsOfIds(layerIds, index);
      if (!bounds || layerIds.length === 0) continue;
      layerIds.forEach((id) => used.add(id));
      units.push({
        id: `button:${childId}`,
        kind: "button",
        nodeId: childId,
        layerIds,
        bounds,
        zOrder: minZ(layerIds, index),
        role: "atomic",
      });
      continue;
    }
    if (child.kind === "layoutGroup") {
      const layerIds = collectSemanticCoverageLayerIds(blueprint, childId).filter(
        (id) => !excludeLayerIds.has(id),
      );
      const bounds = boundsOfIds(layerIds, index);
      if (!bounds || layerIds.length === 0) continue;
      layerIds.forEach((id) => used.add(id));
      units.push({
        id: `layoutGroup:${childId}`,
        kind: "layoutGroup",
        nodeId: childId,
        layerIds,
        bounds,
        zOrder: minZ(layerIds, index),
        role: "content",
      });
    }
  }

  // Grupos visuales Designer (groupContainer) presentes en cobertura
  for (const id of coverage) {
    if (used.has(id) || excludeLayerIds.has(id)) continue;
    const entry = index.byId[id];
    if (!entry?.visible) continue;
    if (entry.containerKind !== "groupContainer" && entry.containerKind !== "booleanGroup") continue;
    // Solo raíces de grupo respecto a la cobertura (padre no en coverage o ya usado)
    const parent = entry.parentLayerId;
    if (parent && coverage.includes(parent) && !excludeLayerIds.has(parent) && !used.has(parent)) {
      continue;
    }
    const layerIds = expandDesignerGroupLayers(id, index).filter((lid) => !excludeLayerIds.has(lid));
    const bounds = boundsOfIds(layerIds, index);
    if (!bounds) continue;
    layerIds.forEach((lid) => used.add(lid));
    units.push({
      id: `designerGroup:${id}`,
      kind: "designerGroup",
      layerIds,
      bounds,
      zOrder: entry.zOrderPath,
      role: "content",
    });
  }

  for (const id of coverage) {
    if (used.has(id) || excludeLayerIds.has(id)) continue;
    const entry = index.byId[id];
    if (!entry?.visible) continue;
    if (TECHNICAL_TYPES.has(entry.type)) continue;
    // Hojas bajo grupo ya capturado
    if (entry.ancestorIds.some((a) => used.has(a))) continue;
    used.add(id);
    const small = area(entry.visualBounds) < area(boundsOfIds(coverage, index) ?? entry.visualBounds) * 0.02;
    units.push({
      id: `layer:${id}`,
      kind: "layer",
      layerIds: [id],
      bounds: entry.visualBounds,
      zOrder: entry.zOrderPath,
      role: small && isShapeType(entry.type) ? "decoration" : "content",
    });
  }

  units.sort((a, b) => a.bounds.y - b.bounds.y || a.bounds.x - b.bounds.x);
  return units;
}

/**
 * Unidades de presentación para capas raíz sin dueño semántico (Contenido sin organizar).
 * No escribe Blueprint ni crea Groups.
 */
export function buildUnorganizedPresentationUnits(args: {
  layerIds: string[];
  index: SiteCreatorSelectionIndex;
}): ResponsivePresentationUnit[] {
  const { index } = args;
  const units: ResponsivePresentationUnit[] = [];
  const used = new Set<string>();

  for (const id of args.layerIds) {
    if (used.has(id)) continue;
    const entry = index.byId[id];
    if (!entry?.visible) continue;
    if (TECHNICAL_TYPES.has(entry.type)) continue;

    if (entry.containerKind === "groupContainer" || entry.containerKind === "booleanGroup") {
      const layerIds = expandDesignerGroupLayers(id, index);
      const bounds = boundsOfIds(layerIds, index);
      if (!bounds) continue;
      layerIds.forEach((lid) => used.add(lid));
      units.push({
        id: `designerGroup:${id}`,
        kind: "designerGroup",
        layerIds,
        bounds,
        zOrder: entry.zOrderPath,
        role: "content",
      });
      continue;
    }

    used.add(id);
    units.push({
      id: `layer:${id}`,
      kind: "layer",
      layerIds: [id],
      bounds: entry.visualBounds,
      zOrder: entry.zOrderPath,
      role: "content",
    });
  }

  units.sort((a, b) => a.bounds.y - b.bounds.y || a.bounds.x - b.bounds.x);
  return units;
}

function unitContainedBySurface(
  unit: ResponsivePresentationUnit,
  surface: PageRect,
): boolean {
  const c = centerOf(unit.bounds);
  if (pointInRect(c, surface)) return true;
  const inter = intersectionArea(unit.bounds, surface);
  const ua = area(unit.bounds);
  if (ua <= 0) return false;
  return inter / ua >= 0.45;
}

/** Relación fuerte superficie↔contenido (permite cluster con un solo miembro). */
export function strongSurfaceContentRelation(args: {
  surfaceBounds: PageRect;
  contentBounds: PageRect;
  surfaceZ: number[];
  contentZ: number[];
}): boolean {
  const { surfaceBounds: s, contentBounds: c } = args;
  if (compareZOrderPath(args.surfaceZ, args.contentZ) >= 0) return false;
  const contentCenter = centerOf(c);
  if (!pointInRect(contentCenter, s)) return false;
  const inter = intersectionArea(s, c);
  const ca = area(c);
  if (ca <= 0 || inter / ca < 0.35) return false;
  // Superficie considerablemente mayor
  if (area(s) < ca * 1.8) return false;
  return true;
}

function isSurfaceCandidateLayer(
  unit: ResponsivePresentationUnit,
  index: SiteCreatorSelectionIndex,
): boolean {
  if (unit.kind !== "layer" || unit.layerIds.length !== 1) return false;
  const entry = index.byId[unit.layerIds[0]!];
  if (!entry) return false;
  return isShapeType(entry.type);
}

/**
 * Agrupa unidades en clusters de superficie / preserve / solo.
 * Una forma detrás de 2+ unidades contenidas → superficie.
 * Composición superpuesta ambigua → preserve (no apilar).
 */
export function buildResponsiveVisualClusters(args: {
  units: ResponsivePresentationUnit[];
  index: SiteCreatorSelectionIndex;
}): { clusters: ResponsiveVisualCluster[]; fallbackReasons: string[] } {
  const { units, index } = args;
  const fallbackReasons: string[] = [];
  const claimed = new Set<string>();
  const clusters: ResponsiveVisualCluster[] = [];
  let seq = 0;

  const surfaceCandidates = units
    .filter((u) => isSurfaceCandidateLayer(u, index))
    .sort((a, b) => area(b.bounds) - area(a.bounds));

  for (const surfaceUnit of surfaceCandidates) {
    if (claimed.has(surfaceUnit.id)) continue;
    const surfaceId = surfaceUnit.layerIds[0]!;
    const surfaceBounds = surfaceUnit.bounds;
    const members: ResponsivePresentationUnit[] = [];

    for (const unit of units) {
      if (unit.id === surfaceUnit.id) continue;
      if (claimed.has(unit.id)) continue;
      if (!unitContainedBySurface(unit, surfaceBounds)) continue;
      if (compareZOrderPath(surfaceUnit.zOrder, unit.zOrder) >= 0) continue;
      members.push(unit);
    }

    if (members.length < 2) {
      // 6B.2 cierre: superficie + un único contenido con relación fuerte
      if (members.length === 1) {
        const only = members[0]!;
        if (
          !strongSurfaceContentRelation({
            surfaceBounds,
            contentBounds: only.bounds,
            surfaceZ: surfaceUnit.zOrder,
            contentZ: only.zOrder,
          })
        ) {
          continue;
        }
      } else {
        continue;
      }
    }

    claimed.add(surfaceUnit.id);
    members.forEach((m) => claimed.add(m.id));
    const allLayerIds = unique([
      surfaceId,
      ...members.flatMap((m) => m.layerIds),
    ]);
    const bounds = unionPageRects([surfaceBounds, ...members.map((m) => m.bounds)])!;
    clusters.push({
      kind: "surface",
      id: `surface:${seq++}`,
      surfaceLayerId: surfaceId,
      surfaceBounds,
      members,
      bounds,
      allLayerIds,
    });
  }

  // Preserve: unidades no reclamadas que se solapan de forma ambigua
  const remaining = units.filter((u) => !claimed.has(u.id));
  const preserveGroups: ResponsivePresentationUnit[][] = [];
  const preserveClaimed = new Set<string>();

  for (let i = 0; i < remaining.length; i += 1) {
    const a = remaining[i]!;
    if (preserveClaimed.has(a.id)) continue;
    const group = [a];
    for (let j = i + 1; j < remaining.length; j += 1) {
      const b = remaining[j]!;
      if (preserveClaimed.has(b.id)) continue;
      const smaller = Math.min(area(a.bounds), area(b.bounds));
      if (smaller <= 0) continue;
      const overlap = intersectionArea(a.bounds, b.bounds) / smaller;
      // Solape significativo sin relación superficie clara
      if (overlap >= 0.3) {
        group.push(b);
      }
    }
    if (group.length >= 2) {
      // ¿Hay una forma dominante que debería haber sido superficie? Si no, preserve.
      const hasClearSurface = group.some(
        (u) =>
          isSurfaceCandidateLayer(u, index) &&
          group.filter((o) => o.id !== u.id && unitContainedBySurface(o, u.bounds)).length >= 2,
      );
      if (!hasClearSurface) {
        group.forEach((g) => preserveClaimed.add(g.id));
        preserveGroups.push(group);
        const reason = `ambiguous-overlap:${group.map((g) => g.id).join("+")}`;
        fallbackReasons.push(reason);
      }
    }
  }

  for (const group of preserveGroups) {
    group.forEach((g) => claimed.add(g.id));
    const bounds = unionPageRects(group.map((g) => g.bounds))!;
    const reason =
      fallbackReasons.find((r) => group.every((g) => r.includes(g.id))) ??
      "ambiguous-overlap";
    clusters.push({
      kind: "preserve",
      id: `preserve:${seq++}`,
      reason,
      units: group,
      bounds,
      allLayerIds: unique(group.flatMap((g) => g.layerIds)),
    });
  }

  for (const unit of units) {
    if (claimed.has(unit.id)) continue;
    // Decoración sola: intentar adjuntar al cluster más cercano por distancia
    if (unit.role === "decoration" && clusters.length > 0) {
      let bestIndex = -1;
      let bestDist = Infinity;
      const c = centerOf(unit.bounds);
      clusters.forEach((cl, idx) => {
        const cc = centerOf(cl.bounds);
        const dist = Math.hypot(cc.x - c.x, cc.y - c.y);
        if (dist < bestDist) {
          bestDist = dist;
          bestIndex = idx;
        }
      });
      if (bestIndex >= 0 && bestDist < Math.max(unit.bounds.width, unit.bounds.height) * 4) {
        const cl = clusters[bestIndex]!;
        if (cl.kind === "surface") {
          cl.members.push(unit);
          cl.allLayerIds = unique([...cl.allLayerIds, ...unit.layerIds]);
          cl.bounds = unionPageRects([cl.bounds, unit.bounds])!;
          claimed.add(unit.id);
          continue;
        }
        if (cl.kind === "preserve") {
          cl.units.push(unit);
          cl.allLayerIds = unique([...cl.allLayerIds, ...unit.layerIds]);
          cl.bounds = unionPageRects([cl.bounds, unit.bounds])!;
          claimed.add(unit.id);
          continue;
        }
      }
    }

    claimed.add(unit.id);
    clusters.push({
      kind: "solo",
      id: `solo:${seq++}`,
      unit,
      bounds: unit.bounds,
      allLayerIds: [...unit.layerIds],
    });
  }

  clusters.sort((a, b) => a.bounds.y - b.bounds.y || a.bounds.x - b.bounds.x);
  return { clusters, fallbackReasons };
}

export function analyzeSectionVisualPresentation(args: {
  blueprint: SiteBlueprintV1;
  sectionId: string;
  index: SiteCreatorSelectionIndex;
}): SectionVisualAnalysis | null {
  const layerIds = collectSemanticCoverageLayerIds(args.blueprint, args.sectionId);
  const containerBounds = boundsOfIds(layerIds, args.index);
  if (!containerBounds || layerIds.length === 0) return null;

  const buttonLayerIds = new Set<string>();
  const section = args.blueprint.nodes[args.sectionId];
  if (section) {
    for (const childId of section.childIds) {
      const child = args.blueprint.nodes[childId];
      if (child && isSiteButtonNode(child)) {
        for (const id of collectSemanticCoverageLayerIds(args.blueprint, childId)) {
          buttonLayerIds.add(id);
        }
      }
    }
  }

  const background = classifyContainerBackground({
    containerBounds,
    layerIds,
    index: args.index,
    buttonLayerIds,
  });
  const exclude = new Set(background.backgroundLayerIds);
  const units = buildSectionPresentationUnits({
    blueprint: args.blueprint,
    sectionId: args.sectionId,
    index: args.index,
    excludeLayerIds: exclude,
  });
  const { clusters, fallbackReasons } = buildResponsiveVisualClusters({
    units,
    index: args.index,
  });

  return {
    sectionId: args.sectionId,
    containerBounds,
    background,
    units,
    clusters,
    fallbackReasons,
  };
}

export function clusterContainsLayer(cluster: ResponsiveVisualCluster, layerId: string): boolean {
  return cluster.allLayerIds.includes(layerId);
}

export function rectsOverlapHorizontally(a: PageRect, b: PageRect): boolean {
  return !(a.x + a.width <= b.x || b.x + b.width <= a.x);
}

/** True si `inner` está visualmente dentro de `outer` (con tolerancia). */
export function roughlyContained(outer: PageRect, inner: PageRect, pad = 2): boolean {
  return pageRectFullyContains(
    {
      x: outer.x - pad,
      y: outer.y - pad,
      width: outer.width + pad * 2,
      height: outer.height + pad * 2,
    },
    inner,
  );
}

export function getObjectFontSize(obj: FreehandObject): number {
  if (obj.type === "text" || obj.type === "textOnPath") {
    const n = (obj as { fontSize?: number }).fontSize;
    return typeof n === "number" && n > 0 ? n : 16;
  }
  return 16;
}
