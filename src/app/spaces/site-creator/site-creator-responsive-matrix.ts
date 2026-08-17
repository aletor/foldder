/**
 * 6B hotfix — transformación afín uniforme compartida (preserve conservador).
 */
import type { BezierPoint, FreehandObject, PathObject, RectObject } from "../FreehandStudio";
import type { DesignerPageState } from "../designer/DesignerNode";
import type { PageRect } from "./site-creator-coordinate-space";
import type { SiteCreatorSelectionIndex } from "./site-creator-selection-types";
import { getObjectFontSize } from "./site-creator-responsive-visual";

type Point2 = { x: number; y: number };

export type Matrix2D = {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
};

export type ResolvedLayerInstance = {
  sourceLayerId: string;
  matrix: Matrix2D;
  clipRect?: PageRect;
  regionId?: string;
};

export type ResolvedResponsiveScene = {
  width: number;
  height: number;
  instances: ResolvedLayerInstance[];
};

export function identityMatrix(): Matrix2D {
  return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
}

export function uniformScaleMatrix(scale: number, offsetX = 0, offsetY = 0): Matrix2D {
  return { a: scale, b: 0, c: 0, d: scale, e: offsetX, f: offsetY };
}

export function transformPoint(m: Matrix2D, x: number, y: number): { x: number; y: number } {
  return {
    x: m.a * x + m.c * y + m.e,
    y: m.b * x + m.d * y + m.f,
  };
}

export function transformRect(m: Matrix2D, rect: PageRect): PageRect {
  const p1 = transformPoint(m, rect.x, rect.y);
  const p2 = transformPoint(m, rect.x + rect.width, rect.y + rect.height);
  const x = Math.min(p1.x, p2.x);
  const y = Math.min(p1.y, p2.y);
  return {
    x,
    y,
    width: Math.max(1, Math.abs(p2.x - p1.x)),
    height: Math.max(1, Math.abs(p2.y - p1.y)),
  };
}

function scalePointUniform(p: Point2, scale: number, offsetX: number, offsetY: number): void {
  p.x = p.x * scale + offsetX;
  p.y = p.y * scale + offsetY;
}

/** Escala solo vértices (cuando x/y/w/h ya se aplicaron aparte). */
export function scalePathPointsUniform(
  points: BezierPoint[] | undefined,
  scale: number,
  offsetX = 0,
  offsetY = 0,
): void {
  for (const pt of points ?? []) {
    for (const key of ["anchor", "handleIn", "handleOut"] as const) {
      scalePointUniform(pt[key], scale, offsetX, offsetY);
    }
    if (typeof pt.cornerRadius === "number") {
      pt.cornerRadius = Math.max(0, pt.cornerRadius * scale);
    }
  }
}

/** Escala trazos con puntos Bézier en coords absolutas (rect redondeado como path). */
export function scalePathObjectUniform(
  obj: PathObject,
  scale: number,
  offsetX = 0,
  offsetY = 0,
): void {
  scalePathPointsUniform(obj.points, scale, offsetX, offsetY);
  if (obj.svgPathMatrix) {
    const m = obj.svgPathMatrix;
    obj.svgPathMatrix = {
      a: m.a * scale,
      b: m.b * scale,
      c: m.c * scale,
      d: m.d * scale,
      e: m.e * scale + offsetX,
      f: m.f * scale + offsetY,
    };
  }
  obj.x = obj.x * scale + offsetX;
  obj.y = obj.y * scale + offsetY;
  obj.width = Math.max(1, obj.width * scale);
  obj.height = Math.max(1, obj.height * scale);
}

/** Transforma puntos de path respecto a un origen (layout preserve por región). */
export function transformPathObjectRelative(
  obj: PathObject,
  origin: PageRect,
  target: { x: number; y: number; scaleX: number; scaleY: number },
): void {
  const uniform = Math.min(target.scaleX, target.scaleY);
  const mapPoint = (p: Point2) => {
    p.x = target.x + (p.x - origin.x) * target.scaleX;
    p.y = target.y + (p.y - origin.y) * target.scaleY;
  };
  for (const pt of obj.points ?? []) {
    for (const key of ["anchor", "handleIn", "handleOut"] as const) {
      mapPoint(pt[key]);
    }
    if (typeof pt.cornerRadius === "number") {
      pt.cornerRadius = Math.max(0, pt.cornerRadius * uniform);
    }
  }
  if (obj.svgPathMatrix) {
    const m = obj.svgPathMatrix;
    obj.svgPathMatrix = {
      a: m.a * target.scaleX,
      b: m.b * target.scaleX,
      c: m.c * target.scaleY,
      d: m.d * target.scaleY,
      e: target.x + (m.e - origin.x) * target.scaleX,
      f: target.y + (m.f - origin.y) * target.scaleY,
    };
  }
}

function scaleRectCornerFields(rect: RectObject, scale: number): void {
  const legacyRadius = (rect as { cornerRadius?: unknown }).cornerRadius;
  if (typeof legacyRadius === "number") {
    (rect as unknown as { cornerRadius: number }).cornerRadius = legacyRadius * scale;
  } else if (rect.cornerRadius && typeof rect.cornerRadius === "object") {
    const c = rect.cornerRadius;
    rect.cornerRadius = {
      topLeft: (c.topLeft ?? 0) * scale,
      topRight: (c.topRight ?? 0) * scale,
      bottomRight: (c.bottomRight ?? 0) * scale,
      bottomLeft: (c.bottomLeft ?? 0) * scale,
    };
  }
  if (typeof rect.rx === "number") rect.rx *= scale;
}

function scaleStyleFields(obj: FreehandObject, scale: number): void {
  if (obj.type === "rect") {
    scaleRectCornerFields(obj as RectObject, scale);
  }
  if ("strokeWidth" in obj && typeof (obj as { strokeWidth?: number }).strokeWidth === "number") {
    (obj as { strokeWidth: number }).strokeWidth *= scale;
  }
  if ("strokeDashoffset" in obj && typeof (obj as { strokeDashoffset?: number }).strokeDashoffset === "number") {
    (obj as { strokeDashoffset: number }).strokeDashoffset *= scale;
  }
  if (obj.type === "text" || obj.type === "textOnPath") {
    const current = getObjectFontSize(obj);
    (obj as { fontSize?: number }).fontSize = Math.max(1, current * scale);
  }
}

/** Escala uniforme recursiva en coords locales del árbol Designer. */
export function applyUniformScaleToObjectTree(
  obj: FreehandObject,
  scale: number,
  offsetX = 0,
  offsetY = 0,
): void {
  if (obj.type === "path") {
    scalePathObjectUniform(obj as PathObject, scale, offsetX, offsetY);
    scaleStyleFields(obj, scale);
    return;
  }

  obj.x = obj.x * scale + offsetX;
  obj.y = obj.y * scale + offsetY;
  obj.width = Math.max(1, obj.width * scale);
  obj.height = Math.max(1, obj.height * scale);
  scaleStyleFields(obj, scale);

  if (obj.type === "groupContainer" || obj.type === "booleanGroup") {
    for (const ch of (obj as { children?: FreehandObject[] }).children ?? []) {
      applyUniformScaleToObjectTree(ch, scale);
    }
    return;
  }
  if (obj.type === "clippingContainer") {
    const c = obj as { mask?: FreehandObject; content?: FreehandObject[] };
    if (c.mask) applyUniformScaleToObjectTree(c.mask, scale);
    for (const ch of c.content ?? []) applyUniformScaleToObjectTree(ch, scale);
  }
}

export function collectVisibleLayerIdsFromPage(page: DesignerPageState): string[] {
  const out: string[] = [];
  const walk = (objs: FreehandObject[] | undefined) => {
    for (const o of objs ?? []) {
      if (o.visible === false) continue;
      out.push(o.id);
      if (o.type === "groupContainer" || o.type === "booleanGroup") {
        walk((o as { children?: FreehandObject[] }).children);
      } else if (o.type === "clippingContainer") {
        const c = o as { mask?: FreehandObject; content?: FreehandObject[] };
        if (c.mask && c.mask.visible !== false) out.push(c.mask.id);
        walk(c.content);
      }
    }
  };
  walk(page.objects ?? []);
  return out;
}

export function buildResolvedSceneFromIndex(args: {
  index: SiteCreatorSelectionIndex;
  matrix: Matrix2D;
  width: number;
  height: number;
  layerIds?: string[];
  regionId?: string;
}): ResolvedResponsiveScene {
  const ids =
    args.layerIds ??
    args.index.entries.filter((e) => e.visible).map((e) => e.layerId);
  return {
    width: args.width,
    height: args.height,
    instances: ids.map((sourceLayerId) => ({
      sourceLayerId,
      matrix: args.matrix,
      regionId: args.regionId,
    })),
  };
}

export function assertResolvedLayerConservation(
  sourceIds: string[],
  scene: ResolvedResponsiveScene,
): void {
  const expected = [...sourceIds].sort();
  const resolved = scene.instances.map((i) => i.sourceLayerId).sort();
  if (JSON.stringify(resolved) !== JSON.stringify(expected)) {
    throw new Error(
      `Layer conservation failed: expected ${expected.length} ids, got ${resolved.length}`,
    );
  }
}

/** Escala proporcional de página completa desde origen (0,0). */
export function preservePageWithUniformMatrix(args: {
  displayPage: DesignerPageState;
  sourceWidth: number;
  sourceHeight: number;
  viewportWidth: number;
  targetY?: number;
}): { scale: number; layoutHeight: number; matrix: Matrix2D } {
  const scale = args.viewportWidth / Math.max(1, args.sourceWidth);
  const matrix = uniformScaleMatrix(scale, 0, args.targetY ?? 0);

  const offsetY = args.targetY ?? 0;
  for (const obj of args.displayPage.objects ?? []) {
    if (obj.visible === false) continue;
    applyUniformScaleToObjectTree(obj, scale, 0, offsetY);
  }

  const layoutHeight = args.sourceHeight * scale + (args.targetY ?? 0);
  args.displayPage.customWidth = args.viewportWidth;
  args.displayPage.customHeight = layoutHeight;
  return { scale, layoutHeight, matrix };
}

/** Compara AABB esperado vs resuelto con tolerancia. */
export function expectAabbProportional(args: {
  source: PageRect;
  resolved: PageRect;
  scale: number;
  offsetY?: number;
  tolerance?: number;
}): void {
  const tol = args.tolerance ?? 0.5;
  const oy = args.offsetY ?? 0;
  const expected = {
    x: args.source.x * args.scale,
    y: args.source.y * args.scale + oy,
    width: args.source.width * args.scale,
    height: args.source.height * args.scale,
  };
  for (const key of ["x", "y", "width", "height"] as const) {
    if (Math.abs(expected[key] - args.resolved[key]) > tol) {
      throw new Error(
        `AABB mismatch on ${key}: expected ${expected[key]}, got ${args.resolved[key]} (scale=${args.scale})`,
      );
    }
  }
}
