/**
 * Márgenes horizontales de página por dispositivo (monitor / tablet / móvil).
 * Se siembran desde el gutter del Original. Activarlos no vuelve a estrechar
 * un diseño que ya los tiene; desactivarlos expande a sangre.
 */
import type { DesignerPageState } from "../designer/DesignerNode";
import type { ClippingContainerObject, FreehandObject, PathObject } from "../FreehandStudio";
import { getPageDimensions } from "../indesign/page-formats";
import type { PageRect } from "./site-creator-coordinate-space";
import { reframeClippingImage } from "./site-creator-clipping-resize";
import {
  imageFrameTuneForSiteCreator,
  reframeDesignerImageFrameForSiteCreator,
} from "./site-creator-image-frame";
import { clampNumber } from "./site-creator-responsive-math";
import { transformPathObjectRelative } from "./site-creator-responsive-matrix";
import {
  reflowAreaTextHeightsInTree,
  scaleTextTypographyFields,
} from "./site-creator-responsive-typography";
import { scaleStyleFields } from "./site-creator-responsive-matrix";
import type {
  ResponsiveEditableBand,
  SiteBlueprintV1,
  SitePageInsetBandV1,
  SitePageInsetsV1,
} from "./site-creator-types";

export const PAGE_INSET_ACCENT = "#c4a882";
export const PAGE_INSET_MIN_INNER_PX = 80;
export const PAGE_INSET_MIN_INNER_RATIO = 0.2;
export const PAGE_INSET_SNAP_PX = 8;
const FULL_BLEED_SPAN = 0.92;
const FULL_BLEED_EDGE = 0.04;
const DETECT_NOISE_PX = 8;

export type ResolvedPageInsets = SitePageInsetBandV1 & {
  enabled: boolean;
  scaleX: number;
  innerWidth: number;
};

export function pageInsetMinInner(layoutWidth: number): number {
  const width = Math.max(1, layoutWidth);
  return Math.max(PAGE_INSET_MIN_INNER_PX, Math.round(width * PAGE_INSET_MIN_INNER_RATIO));
}

export function clampPageInsets(
  left: number,
  right: number,
  layoutWidth: number,
  linked: boolean,
  enabled = true,
): SitePageInsetBandV1 {
  const width = Math.max(1, layoutWidth);
  const minInner = Math.min(width, pageInsetMinInner(width));
  const maxTotal = Math.max(0, width - minInner);

  if (linked) {
    const raw = Number.isFinite(left) ? left : Number.isFinite(right) ? right : 0;
    const each = Math.max(0, Math.min(maxTotal / 2, raw));
    return {
      left: Math.round(each),
      right: Math.round(each),
      linked: true,
      enabled,
    };
  }

  let nextLeft = Math.max(0, Number.isFinite(left) ? left : 0);
  let nextRight = Math.max(0, Number.isFinite(right) ? right : 0);
  if (nextLeft + nextRight > maxTotal) {
    const total = nextLeft + nextRight;
    nextLeft = (nextLeft / total) * maxTotal;
    nextRight = maxTotal - nextLeft;
  }
  return {
    left: Math.round(nextLeft),
    right: Math.round(nextRight),
    linked: false,
    enabled,
  };
}

export function defaultPageInsets(): SitePageInsetBandV1 {
  return { left: 0, right: 0, linked: true, enabled: true };
}

export function pageInsetsAreActive(insets: Pick<SitePageInsetBandV1, "left" | "right">): boolean {
  return insets.left > 0 || insets.right > 0;
}

export function pageInsetsMatch(
  a: Pick<SitePageInsetBandV1, "left" | "right">,
  b: Pick<SitePageInsetBandV1, "left" | "right">,
  epsilon = 1.5,
): boolean {
  return Math.abs(a.left - b.left) <= epsilon && Math.abs(a.right - b.right) <= epsilon;
}

export function isFullBleedRect(
  rect: Pick<PageRect, "x" | "width">,
  layoutWidth: number,
): boolean {
  const width = Math.max(1, layoutWidth);
  return (
    rect.x <= width * FULL_BLEED_EDGE &&
    rect.x + rect.width >= width * (1 - FULL_BLEED_EDGE) &&
    rect.width >= width * FULL_BLEED_SPAN
  );
}

export function detectPageContentInsets(
  page: Pick<DesignerPageState, "objects" | "customWidth" | "format">,
  layoutWidth?: number,
): SitePageInsetBandV1 {
  const width = Math.max(
    1,
    layoutWidth ?? getPageDimensions(page as DesignerPageState).width,
  );
  let minX = width;
  let maxRight = 0;
  let found = false;
  for (const object of page.objects ?? []) {
    if (object.visible === false || object.width <= 0) continue;
    if (isFullBleedRect(object, width)) continue;
    found = true;
    minX = Math.min(minX, object.x);
    maxRight = Math.max(maxRight, object.x + object.width);
  }
  if (!found) return defaultPageInsets();
  const left = Math.max(0, Math.round(minX));
  const right = Math.max(0, Math.round(width - maxRight));
  if (left + right < DETECT_NOISE_PX || (left + right) / width < 0.01) {
    return defaultPageInsets();
  }
  const linked =
    Math.abs(left - right) <= Math.max(DETECT_NOISE_PX, Math.round(Math.max(left, right) * 0.08));
  if (left > width * 0.28 || right > width * 0.28) {
    return defaultPageInsets();
  }
  return { left, right, linked, enabled: true };
}

export function scalePageInsets(
  source: SitePageInsetBandV1,
  fromWidth: number,
  toWidth: number,
): SitePageInsetBandV1 {
  const scale = Math.max(1, toWidth) / Math.max(1, fromWidth);
  return clampPageInsets(
    source.left * scale,
    source.right * scale,
    toWidth,
    source.linked !== false,
    source.enabled !== false,
  );
}

export function resolvePageInsetsForBand(
  pageInsets: SitePageInsetsV1 | undefined,
  band: ResponsiveEditableBand,
  layoutWidth: number,
  seed?: SitePageInsetBandV1 | null,
): ResolvedPageInsets {
  const raw = pageInsets?.[band];
  const base = raw
    ? {
        left: raw.left ?? 0,
        right: raw.right ?? 0,
        linked: raw.linked !== false,
        enabled: raw.enabled !== false,
      }
    : seed
      ? {
          left: seed.left,
          right: seed.right,
          linked: seed.linked !== false,
          enabled: seed.enabled !== false,
        }
      : defaultPageInsets();
  const clamped = clampPageInsets(
    base.left,
    base.right,
    layoutWidth,
    base.linked,
    base.enabled,
  );
  const innerWidth = Math.max(1, layoutWidth - clamped.left - clamped.right);
  return {
    ...clamped,
    enabled: clamped.enabled !== false,
    innerWidth,
    scaleX: innerWidth / Math.max(1, layoutWidth),
  };
}

export function pageInsetApplyTarget(
  insets: Pick<SitePageInsetBandV1, "left" | "right" | "enabled">,
): Pick<SitePageInsetBandV1, "left" | "right"> {
  if (insets.enabled === false) return { left: 0, right: 0 };
  return { left: insets.left, right: insets.right };
}

export function snapPageInsetsToDesign(
  next: SitePageInsetBandV1,
  design: SitePageInsetBandV1 | null | undefined,
  layoutWidth: number,
): { insets: SitePageInsetBandV1; snapped: boolean } {
  if (!design || !pageInsetsAreActive(design)) {
    return { insets: next, snapped: false };
  }
  const enabled = next.enabled !== false;
  if (next.linked) {
    if (Math.abs(next.left - design.left) <= PAGE_INSET_SNAP_PX) {
      return {
        insets: clampPageInsets(design.left, design.right, layoutWidth, true, enabled),
        snapped: true,
      };
    }
    return { insets: next, snapped: false };
  }
  const left =
    Math.abs(next.left - design.left) <= PAGE_INSET_SNAP_PX ? design.left : next.left;
  const right =
    Math.abs(next.right - design.right) <= PAGE_INSET_SNAP_PX ? design.right : next.right;
  const snapped = left !== next.left || right !== next.right;
  return {
    insets: clampPageInsets(left, right, layoutWidth, false, enabled),
    snapped,
  };
}

export function parseSitePageInsets(raw: unknown): SitePageInsetsV1 | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const source = raw as Partial<Record<string, unknown>>;
  const next: SitePageInsetsV1 = {};
  for (const band of ["monitor", "tablet", "mobile"] as const) {
    const parsed = parseInsetBand(source[band]);
    if (parsed) next[band] = parsed;
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

function parseInsetBand(raw: unknown): SitePageInsetBandV1 | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const value = raw as {
    left?: unknown;
    right?: unknown;
    linked?: unknown;
    enabled?: unknown;
  };
  const left = typeof value.left === "number" && Number.isFinite(value.left) ? Math.max(0, value.left) : 0;
  const right = typeof value.right === "number" && Number.isFinite(value.right) ? Math.max(0, value.right) : 0;
  const linked = value.linked !== false;
  const enabled = value.enabled !== false;
  if (
    left === 0 &&
    right === 0 &&
    linked &&
    enabled &&
    value.left == null &&
    value.right == null &&
    value.enabled == null
  ) {
    return undefined;
  }
  return { left, right, linked, enabled };
}

export function setPageInsets(
  blueprint: SiteBlueprintV1,
  band: ResponsiveEditableBand,
  next: SitePageInsetBandV1,
  layoutWidth: number,
): SiteBlueprintV1 {
  const clamped = clampPageInsets(
    next.left,
    next.right,
    layoutWidth,
    next.linked,
    next.enabled !== false,
  );
  return {
    ...blueprint,
    pageInsets: {
      ...blueprint.pageInsets,
      [band]: clamped,
    },
  };
}

export function copyPageInsetsFromMonitor(
  blueprint: SiteBlueprintV1,
  targetBand: Exclude<ResponsiveEditableBand, "monitor">,
  monitorWidth: number,
  targetWidth: number,
  monitorSeed?: SitePageInsetBandV1 | null,
): SiteBlueprintV1 {
  const source = resolvePageInsetsForBand(
    blueprint.pageInsets,
    "monitor",
    monitorWidth,
    monitorSeed,
  );
  const scale = Math.max(1, targetWidth) / Math.max(1, monitorWidth);
  return setPageInsets(
    blueprint,
    targetBand,
    {
      left: source.left * scale,
      right: source.right * scale,
      linked: source.linked,
      enabled: true,
    },
    targetWidth,
  );
}

export function bandHasPageInsets(
  blueprint: SiteBlueprintV1,
  band: ResponsiveEditableBand,
  seed?: SitePageInsetBandV1 | null,
  layoutWidth?: number,
): boolean {
  const raw = blueprint.pageInsets?.[band];
  if (raw) return pageInsetsAreActive(raw);
  if (seed && layoutWidth) {
    return pageInsetsAreActive(scalePageInsets(seed, layoutWidth, layoutWidth));
  }
  return Boolean(seed && pageInsetsAreActive(seed));
}

export function remapPageInsetRect(
  rect: PageRect,
  fromLeft: number,
  toLeft: number,
  scaleX: number,
): PageRect {
  return {
    x: toLeft + (rect.x - fromLeft) * scaleX,
    y: rect.y,
    width: Math.max(1, rect.width * scaleX),
    height: rect.height,
  };
}

export function remapLayoutRectForPageInsets(
  rect: PageRect,
  from: Pick<SitePageInsetBandV1, "left" | "right">,
  to: Pick<SitePageInsetBandV1, "left" | "right">,
  layoutWidth: number,
  scaleX: number,
): PageRect {
  if (isFullBleedRect(rect, layoutWidth)) {
    if (to.left <= 0 && to.right <= 0) return { ...rect };
    return {
      x: to.left,
      y: rect.y,
      width: Math.max(1, layoutWidth - to.left - to.right),
      height: rect.height,
    };
  }
  return remapPageInsetRect(rect, from.left, to.left, scaleX);
}

export function applyPageInsetsToObjects(
  objects: FreehandObject[],
  fromLeft: number,
  toLeft: number,
  scaleX: number,
): void {
  if (Math.abs(scaleX - 1) < 1e-6 && Math.abs(toLeft - fromLeft) < 1e-6) return;
  for (const object of objects) {
    remapObjectX(object, fromLeft, toLeft, scaleX, true);
  }
}

function remapObjectX(
  object: FreehandObject,
  fromLeft: number,
  toLeft: number,
  scaleX: number,
  world: boolean,
): void {
  const frameTune = imageFrameTuneForSiteCreator(object);
  const clipTunes =
    object.type === "clippingContainer"
      ? captureClipImageTunes(object as ClippingContainerObject)
      : [];

  const origin: PageRect = {
    x: object.x,
    y: object.y,
    width: object.width,
    height: object.height,
  };
  const nextX = world ? toLeft + (object.x - fromLeft) * scaleX : object.x * scaleX;
  const nextWidth = Math.max(1, object.width * scaleX);
  if (object.type === "path") {
    transformPathObjectRelative(object as PathObject, origin, {
      x: nextX,
      y: object.y,
      scaleX,
      scaleY: 1,
    });
  }
  object.x = nextX;
  object.width = nextWidth;

  if (
    (object.type === "text" || object.type === "textOnPath") &&
    Math.abs(scaleX - 1) > 1e-6
  ) {
    scaleTextTypographyFields(object, scaleX);
    reflowAreaTextHeightsInTree(object);
  } else if (object.type === "rect" && Math.abs(scaleX - 1) > 1e-6) {
    scaleStyleFields(object, scaleX);
  }

  if (object.type === "groupContainer" || object.type === "booleanGroup") {
    for (const child of (object as { children?: FreehandObject[] }).children ?? []) {
      remapObjectX(child, fromLeft, toLeft, scaleX, false);
    }
  } else if (object.type === "clippingContainer") {
    const clip = object as ClippingContainerObject;
    if (clip.mask) remapObjectX(clip.mask, fromLeft, toLeft, scaleX, false);
    for (const child of clip.content ?? []) {
      if (child.type === "image") continue;
      remapObjectX(child, fromLeft, toLeft, scaleX, false);
    }
    for (const { imageId, tune } of clipTunes) {
      reframeClippingImage(clip, imageId, tune);
    }
  }

  if (frameTune) {
    reframeDesignerImageFrameForSiteCreator(object, frameTune);
  }
}

function captureClipImageTunes(
  clip: ClippingContainerObject,
): Array<{ imageId: string; tune: { focal: { x: number; y: number }; zoom: number } }> {
  const mask = clip.mask;
  if (!mask) return [];
  const tunes: Array<{
    imageId: string;
    tune: { focal: { x: number; y: number }; zoom: number };
  }> = [];
  for (const child of clip.content ?? []) {
    if (child.type !== "image") continue;
    const width = Math.max(1, child.width);
    const height = Math.max(1, child.height);
    tunes.push({
      imageId: child.id,
      tune: {
        focal: {
          x: clampNumber(0, (mask.x + mask.width / 2 - child.x) / width, 1),
          y: clampNumber(0, (mask.y + mask.height / 2 - child.y) / height, 1),
        },
        zoom: 1,
      },
    });
  }
  return tunes;
}
