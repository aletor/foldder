/**
 * Fondo de página detectado del Designer conectado.
 * Solo afecta a Site Creator: el archivo de Designer no se modifica.
 */
import type { ClippingContainerObject, FreehandObject } from "../FreehandStudio";
import type { DesignerPageState } from "../designer/DesignerNode";
import { migrateFill, type FillAppearance } from "../freehand/fill";
import { getPageDimensions } from "../indesign/page-formats";
import { cloneBlueprint } from "./site-blueprint-validate";
import { reframeClippingImage } from "./site-creator-clipping-resize";
import { imageFrameHasPhoto, isDesignerImageFrame } from "./site-creator-display-labels";
import type { SiteBlueprintV1, SitePageBackgroundV1 } from "./site-creator-types";

const FULL_BLEED_SPAN = 0.92;
const FULL_BLEED_EDGE = 0.04;

export type DetectedPageBackground =
  | { kind: "color"; sourceLayerId: string; css: string }
  | { kind: "gradient"; sourceLayerId: string; css: string }
  | {
      kind: "image";
      sourceLayerId: string;
      imageLayerId: string;
      focal: { x: number; y: number };
      zoom: number;
    };

function isFullPageBleed(
  rect: { x: number; y: number; width: number; height: number },
  pageWidth: number,
  pageHeight: number,
): boolean {
  const width = Math.max(1, pageWidth);
  const height = Math.max(1, pageHeight);
  return (
    rect.x <= width * FULL_BLEED_EDGE &&
    rect.y <= height * FULL_BLEED_EDGE &&
    rect.x + rect.width >= width * (1 - FULL_BLEED_EDGE) &&
    rect.y + rect.height >= height * (1 - FULL_BLEED_EDGE) &&
    rect.width >= width * FULL_BLEED_SPAN &&
    rect.height >= height * FULL_BLEED_SPAN
  );
}

function fillToCss(fill: FillAppearance): string | null {
  if (fill.type === "solid") {
    if (!fill.color || fill.color === "none" || fill.color === "transparent") return null;
    return fill.color;
  }
  const stopList = fill.stops
    .map((stop) => {
      const alpha =
        Number.isFinite(stop.opacity) && stop.opacity < 1
          ? `${stop.color}${Math.round(Math.max(0, Math.min(1, stop.opacity)) * 255)
              .toString(16)
              .padStart(2, "0")}`
          : stop.color;
      const pos = Number.isFinite(stop.position) ? ` ${stop.position}%` : "";
      return `${alpha}${pos}`;
    })
    .join(", ");
  if (!stopList) return null;
  if (fill.type === "gradient-linear") {
    const angle = Math.round((Math.atan2(fill.y2 - fill.y1, fill.x2 - fill.x1) * 180) / Math.PI);
    return `linear-gradient(${angle}deg, ${stopList})`;
  }
  const cx = Math.round(fill.cx * 1000) / 10;
  const cy = Math.round(fill.cy * 1000) / 10;
  return `radial-gradient(circle at ${cx}% ${cy}%, ${stopList})`;
}

function colorOrGradientCss(object: FreehandObject): { kind: "color" | "gradient"; css: string } | null {
  if (object.type !== "rect") return null;
  if (isDesignerImageFrame(object) && imageFrameHasPhoto(object)) return null;
  const css = fillToCss(migrateFill(object.fill));
  if (!css) return null;
  const fill = migrateFill(object.fill);
  return { kind: fill.type === "solid" ? "color" : "gradient", css };
}

function imageLayerIdOf(object: FreehandObject): string | null {
  if (object.type === "image") {
    const src = typeof object.src === "string" ? object.src.trim() : "";
    return src && src !== "data:," && src !== "data:" ? object.id : null;
  }
  if (isDesignerImageFrame(object) && imageFrameHasPhoto(object)) return object.id;
  if (object.type === "clippingContainer") {
    const image = (object as ClippingContainerObject).content?.find(
      (child) => child.type === "image" && typeof child.src === "string" && child.src.trim(),
    );
    return image?.id ?? null;
  }
  return null;
}

function collectBackgroundCandidates(objects: FreehandObject[] | undefined): FreehandObject[] {
  const out: FreehandObject[] = [];
  const visit = (list: FreehandObject[] | undefined) => {
    for (const object of list ?? []) {
      if (object.visible === false) continue;
      if (object.type === "groupContainer") {
        visit((object as { children?: FreehandObject[] }).children);
        continue;
      }
      out.push(object);
    }
  };
  visit(objects);
  return out;
}

export function detectDesignerPageBackground(
  page: Pick<DesignerPageState, "objects" | "customWidth" | "customHeight" | "format">,
): DetectedPageBackground | null {
  const dims = getPageDimensions(page as DesignerPageState);
  for (const object of collectBackgroundCandidates(page.objects)) {
    if (!isFullPageBleed(object, dims.width, dims.height)) continue;
    const imageLayerId = imageLayerIdOf(object);
    if (imageLayerId) {
      return {
        kind: "image",
        sourceLayerId: object.id,
        imageLayerId,
        focal: { x: 0.5, y: 0.5 },
        zoom: 1,
      };
    }
    const paint = colorOrGradientCss(object);
    if (!paint) continue;
    return {
      kind: paint.kind,
      sourceLayerId: object.id,
      css: paint.css,
    };
  }
  return null;
}

export function resolveDesignerPageBackground(
  page: Pick<DesignerPageState, "objects" | "customWidth" | "customHeight" | "format">,
  blueprint?: Pick<SiteBlueprintV1, "pageBackground"> | null,
): DetectedPageBackground | null {
  const detected = detectDesignerPageBackground(page);
  if (!detected) return null;
  const stored = blueprint?.pageBackground;
  if (
    detected.kind === "image" &&
    stored?.sourceLayerId === detected.sourceLayerId
  ) {
    return {
      ...detected,
      focal: stored.focal ?? detected.focal,
      zoom: typeof stored.zoom === "number" && Number.isFinite(stored.zoom) ? stored.zoom : detected.zoom,
    };
  }
  return detected;
}

export function isDesignerPageBackgroundLayer(
  page: Pick<DesignerPageState, "objects" | "customWidth" | "customHeight" | "format">,
  layerId: string,
  blueprint?: Pick<SiteBlueprintV1, "pageBackground"> | null,
): boolean {
  const resolved = resolveDesignerPageBackground(page, blueprint);
  if (!resolved) return false;
  return resolved.sourceLayerId === layerId || (resolved.kind === "image" && resolved.imageLayerId === layerId);
}

export function resolvePageBackgroundCss(
  page: Pick<DesignerPageState, "objects" | "customWidth" | "customHeight" | "format">,
  blueprint?: Pick<SiteBlueprintV1, "pageBackground"> | null,
  imageHref?: string | null,
): string | null {
  const resolved = resolveDesignerPageBackground(page, blueprint);
  if (!resolved) return null;
  if (resolved.kind === "color" || resolved.kind === "gradient") return resolved.css;
  if (!imageHref) return null;
  const href = imageHref.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const size = resolved.zoom <= 1.001 ? "cover" : `${Math.round(resolved.zoom * 1000) / 10}% auto`;
  return `#000 url("${href}") ${resolved.focal.x * 100}% ${resolved.focal.y * 100}% / ${size} no-repeat`;
}

export function parsePageBackground(raw: unknown): SitePageBackgroundV1 | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const rec = raw as { sourceLayerId?: unknown; focal?: { x?: unknown; y?: unknown }; zoom?: unknown };
  if (typeof rec.sourceLayerId !== "string" || !rec.sourceLayerId.trim()) return undefined;
  const next: SitePageBackgroundV1 = { sourceLayerId: rec.sourceLayerId.trim() };
  const fx = rec.focal?.x;
  const fy = rec.focal?.y;
  if (typeof fx === "number" && Number.isFinite(fx) && typeof fy === "number" && Number.isFinite(fy)) {
    next.focal = { x: Math.min(1, Math.max(0, fx)), y: Math.min(1, Math.max(0, fy)) };
  }
  if (typeof rec.zoom === "number" && Number.isFinite(rec.zoom)) {
    next.zoom = rec.zoom;
  }
  return next;
}

export function reconcilePageBackground(
  blueprint: SiteBlueprintV1,
  page: Pick<DesignerPageState, "objects" | "customWidth" | "customHeight" | "format">,
): SiteBlueprintV1 {
  const detected = detectDesignerPageBackground(page);
  const current = blueprint.pageBackground;
  if (!detected) {
    if (!current) return blueprint;
    const next = cloneBlueprint(blueprint);
    delete next.pageBackground;
    return next;
  }
  if (current?.sourceLayerId === detected.sourceLayerId) return blueprint;
  const next = cloneBlueprint(blueprint);
  next.pageBackground = { sourceLayerId: detected.sourceLayerId };
  return next;
}

export function patchPageBackgroundCrop(args: {
  blueprint: SiteBlueprintV1;
  sourceLayerId: string;
  focal: { x: number; y: number };
  zoom: number;
}): { blueprint: SiteBlueprintV1; changed: boolean } {
  const current = args.blueprint.pageBackground;
  if (!current || current.sourceLayerId !== args.sourceLayerId) {
    return { blueprint: args.blueprint, changed: false };
  }
  const focal = {
    x: Math.min(1, Math.max(0, args.focal.x)),
    y: Math.min(1, Math.max(0, args.focal.y)),
  };
  if (
    current.focal?.x === focal.x &&
    current.focal?.y === focal.y &&
    current.zoom === args.zoom
  ) {
    return { blueprint: args.blueprint, changed: false };
  }
  const next = cloneBlueprint(args.blueprint);
  next.pageBackground = {
    sourceLayerId: args.sourceLayerId,
    focal,
    zoom: args.zoom,
  };
  return { blueprint: next, changed: true };
}

function findObjectById(objects: FreehandObject[] | undefined, id: string): FreehandObject | null {
  for (const object of objects ?? []) {
    if (object.id === id) return object;
    if (object.type === "groupContainer" || object.type === "booleanGroup") {
      const nested = findObjectById((object as { children?: FreehandObject[] }).children, id);
      if (nested) return nested;
    } else if (object.type === "clippingContainer") {
      const clip = object as ClippingContainerObject;
      if (clip.mask?.id === id) return clip.mask;
      const nested = findObjectById(clip.content, id);
      if (nested) return nested;
    }
  }
  return null;
}

function convertToPageClip(
  source: FreehandObject,
  imageLayerId: string,
  target: { x: number; y: number; width: number; height: number },
): { clip: ClippingContainerObject; imageId: string } {
  const frameContent = source.imageFrameContent;
  const frameImage =
    frameContent?.src
      ? ({
          ...structuredClone(source),
          type: "image",
          src: frameContent.src,
          s3Key: frameContent.s3Key,
          s3KeyHr: frameContent.s3KeyHr,
          s3KeyOpt: frameContent.s3KeyOpt,
          isImageFrame: false,
          imageFrameContent: undefined,
          rotation: 0,
          x: 0,
          y: 0,
          width: Math.max(1, frameContent.originalWidth),
          height: Math.max(1, frameContent.originalHeight),
        } as unknown as FreehandObject)
      : null;
  const originalImage =
    source.type === "image"
      ? source
      : source.type === "clippingContainer"
        ? (source as ClippingContainerObject).content.find(
            (child) => child.id === imageLayerId && child.type === "image",
          )
        : frameImage;
  if (!originalImage) {
    throw new Error(`La capa ${source.id} no contiene una imagen de fondo.`);
  }
  const imageId =
    source.type === "image" || frameImage ? `${source.id}__page_bg_image` : originalImage.id;
  const content = structuredClone(originalImage) as FreehandObject;
  content.id = imageId;
  content.x = 0;
  content.y = 0;
  const mask = {
    ...structuredClone(source.type === "clippingContainer" ? (source as ClippingContainerObject).mask : source),
    id: `${source.id}__page_bg_mask`,
    type: "rect" as const,
    x: 0,
    y: 0,
    width: Math.max(1, target.width),
    height: Math.max(1, target.height),
    rotation: 0,
  };
  const clip = source as ClippingContainerObject;
  Object.assign(clip, {
    type: "clippingContainer",
    x: target.x,
    y: target.y,
    width: Math.max(1, target.width),
    height: Math.max(1, target.height),
    rotation: 0,
    visible: true,
    mask,
    content: [content],
  });
  return { clip, imageId };
}

export function applyDesignerPageBackgroundToDisplay(args: {
  displayPage: DesignerPageState;
  sourcePage: Pick<DesignerPageState, "objects" | "customWidth" | "customHeight" | "format">;
  blueprint: SiteBlueprintV1;
  layoutWidth: number;
  layoutHeight: number;
  /** Publicar: oculta también la imagen (el CSS de body la pinta). Preview: la deja como máscara. */
  forPublish?: boolean;
}): DetectedPageBackground | null {
  const resolved = resolveDesignerPageBackground(args.sourcePage, args.blueprint);
  if (!resolved) return null;
  const source = findObjectById(args.displayPage.objects, resolved.sourceLayerId);
  if (!source) return resolved;
  if (resolved.kind !== "image" || args.forPublish) {
    source.visible = false;
    return resolved;
  }
  const converted = convertToPageClip(source, resolved.imageLayerId, {
    x: 0,
    y: 0,
    width: Math.max(1, args.layoutWidth),
    height: Math.max(1, args.layoutHeight),
  });
  reframeClippingImage(converted.clip, converted.imageId, {
    focal: resolved.focal,
    zoom: resolved.zoom,
  });
  return resolved;
}
