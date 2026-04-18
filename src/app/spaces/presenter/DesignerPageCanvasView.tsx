"use client";

import React, { Fragment, useId, useMemo, useRef, useState } from "react";
import type { FreehandObject } from "../FreehandStudio";
import {
  flattenObjectsForGradientDefs,
  renderClipDef,
  renderObj,
  type RenderObjOpts,
} from "../FreehandStudio";
import { gradientDefId, migrateFill, renderFillDef } from "../freehand/fill";
import type { PresenterGroupEnterId, PresenterRevealStep } from "./presenter-group-animations";
import { getEnterForObject, isObjectRevealed, revealTargetKey } from "./presenter-group-animations";
import { boundsForGroupId, boundsForObjectId } from "./presenter-group-bounds";
import { collectPresenterImageTargets, type PresenterImageTarget } from "./presenter-image-video-collect";
import { PresenterImageVideoOverlays } from "./PresenterImageVideoOverlays";
import type { PresenterImageVideoCanvasBinding } from "./presenter-image-video-types";

const PRESENTER_RENDER_OPTS: RenderObjOpts = {
  canvasZenMode: true,
  designerMode: true,
  textEditingId: null,
  imageFrameOptimizeShowFrameId: null,
};

export type PlayRevealState = {
  revealCount: number;
  steps: PresenterRevealStep[];
};

function shouldPaintObject(o: FreehandObject, playReveal: PlayRevealState | null | undefined): boolean {
  if (!playReveal?.steps?.length) return true;
  return isObjectRevealed(o, playReveal.revealCount, playReveal.steps);
}

function enterAnimationClass(enter: PresenterGroupEnterId, shouldRun: boolean): string {
  if (!shouldRun) return "";
  switch (enter) {
    case "none":
    case "instant":
      return "";
    case "fadeIn":
      return "presenter-g-fade";
    case "slideUp":
      return "presenter-g-slide-up";
    case "slideDown":
      return "presenter-g-slide-down";
    case "slideLeft":
      return "presenter-g-slide-left";
    case "slideRight":
      return "presenter-g-slide-right";
    case "grow":
      return "presenter-g-grow";
    case "shrink":
      return "presenter-g-shrink";
    default:
      return "presenter-g-fade";
  }
}

function clipGroupAnimationClass(
  mask: FreehandObject,
  playReveal: PlayRevealState | null | undefined,
  animateEnterTargetKey: string | null | undefined,
): string {
  if (!playReveal?.steps?.length || !animateEnterTargetKey) return "";
  if (revealTargetKey(mask) !== animateEnterTargetKey) return "";
  const enter = getEnterForObject(mask, playReveal.steps);
  return enterAnimationClass(enter, true);
}

export type PickPointerModifiers = { ctrlKey: boolean; metaKey: boolean };

export type PickPresenterInteraction = {
  highlightKeys: string[];
  onPick: (key: string | null, mods: PickPointerModifiers) => void;
  /** Selección por rectángulo (arrastre en el fondo del lienzo). */
  onMarqueeSelect?: (keys: string[], mods: PickPointerModifiers) => void;
};

/** @deprecated usar PickPresenterInteraction */
export type PickGroupInteraction = PickPresenterInteraction;

function boundsForPresenterKey(
  objects: FreehandObject[],
  key: string,
): { x: number; y: number; width: number; height: number } | null {
  if (key.startsWith("group:")) {
    return boundsForGroupId(objects, key.slice(6));
  }
  if (key.startsWith("object:")) {
    return boundsForObjectId(objects, key.slice(7));
  }
  return null;
}

function clientToSvgPoint(svg: SVGSVGElement, clientX: number, clientY: number): { x: number; y: number } | null {
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  const p = pt.matrixTransform(ctm.inverse());
  return { x: p.x, y: p.y };
}

function aabbIntersect(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  const ax2 = a.x + a.width;
  const ay2 = a.y + a.height;
  const bx2 = b.x + b.width;
  const by2 = b.y + b.height;
  return a.x < bx2 && ax2 > b.x && a.y < by2 && ay2 > b.y;
}

function pointInAabb(
  px: number,
  py: number,
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return px >= b.x && px <= b.x + b.width && py >= b.y && py <= b.y + b.height;
}

function normalizeMarquee(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): { x: number; y: number; width: number; height: number } {
  const minX = Math.min(x0, x1);
  const minY = Math.min(y0, y1);
  return { x: minX, y: minY, width: Math.abs(x1 - x0), height: Math.abs(y1 - y0) };
}

/** Marco solo en esquinas (misma apariencia para objeto suelto o grupo). */
function SelectionCornerFrame({
  x,
  y,
  width: w,
  height: h,
  pad = 3,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  pad?: number;
}) {
  const px = x - pad;
  const py = y - pad;
  const pw = w + pad * 2;
  const ph = h + pad * 2;
  const len = Math.min(14, Math.max(6, Math.min(pw, ph) * 0.14));
  const L = len;
  const stroke = "rgb(59 130 246)";
  /** Grosor en pantalla (nonScalingStroke); más visible que el trazo fino anterior. */
  const sw = 3;
  return (
    <g pointerEvents="none" className="presenter-selection-corners">
      <path
        d={`M ${px + L} ${py} L ${px} ${py} L ${px} ${py + L}`}
        fill="none"
        stroke={stroke}
        strokeWidth={sw}
        vectorEffect="nonScalingStroke"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
      <path
        d={`M ${px + pw - L} ${py} L ${px + pw} ${py} L ${px + pw} ${py + L}`}
        fill="none"
        stroke={stroke}
        strokeWidth={sw}
        vectorEffect="nonScalingStroke"
        strokeLinecap="square"
      />
      <path
        d={`M ${px} ${py + ph - L} L ${px} ${py + ph} L ${px + L} ${py + ph}`}
        fill="none"
        stroke={stroke}
        strokeWidth={sw}
        vectorEffect="nonScalingStroke"
        strokeLinecap="square"
      />
      <path
        d={`M ${px + pw} ${py + ph - L} L ${px + pw} ${py + ph} L ${px + pw - L} ${py + ph}`}
        fill="none"
        stroke={stroke}
        strokeWidth={sw}
        vectorEffect="nonScalingStroke"
        strokeLinecap="square"
      />
    </g>
  );
}

/** Umbral en px de pantalla: por debajo se considera clic (limpiar selección), no marco. */
const MARQUEE_DRAG_THRESHOLD_PX = 4;

function buildMarqueePickEntries(
  objects: FreehandObject[],
  clipObjects: FreehandObject[],
  clippedGroups: Map<string, FreehandObject[]>,
  playReveal: PlayRevealState | null | undefined,
): { key: string; bounds: { x: number; y: number; width: number; height: number } }[] {
  const seen = new Set<string>();
  const out: { key: string; bounds: { x: number; y: number; width: number; height: number } }[] = [];

  for (const obj of objects) {
    if (obj.isClipMask || obj.clipMaskId) continue;
    if (!shouldPaintObject(obj, playReveal)) continue;
    const k = revealTargetKey(obj);
    if (seen.has(k)) continue;
    const b = boundsForPresenterKey(objects, k);
    if (!b || b.width <= 0 || b.height <= 0) continue;
    seen.add(k);
    out.push({ key: k, bounds: b });
  }

  for (const [clipId, members] of clippedGroups) {
    const mask = clipObjects.find((c) => c.id === clipId);
    if (!mask || !shouldPaintObject(mask, playReveal)) continue;
    if (!members.every((m) => shouldPaintObject(m, playReveal))) continue;
    const k = revealTargetKey(mask);
    if (seen.has(k)) continue;
    const b = boundsForPresenterKey(objects, k);
    if (!b || b.width <= 0 || b.height <= 0) continue;
    seen.add(k);
    out.push({ key: k, bounds: b });
  }

  return out;
}

/** Vídeo anclado a una imagen: clip de página + pointer-events para el `foreignObject`. */
function PresenterVideoOverlaySlice({
  pageClipUrl,
  binding,
  target,
  onPickPresenterTarget,
}: {
  pageClipUrl: string;
  binding: PresenterImageVideoCanvasBinding;
  target: PresenterImageTarget;
  onPickPresenterTarget?: (pickKey: string, mods: PickPointerModifiers) => void;
}) {
  return (
    <g clipPath={pageClipUrl} style={{ pointerEvents: "auto" }}>
      <PresenterImageVideoOverlays
        pageId={binding.pageId}
        targets={[target]}
        placements={binding.placements}
        uiMode={binding.uiMode}
        uploadingKey={binding.uploadingKey}
        onUploadBusy={binding.onUploadBusy}
        onUpsert={binding.onUpsert}
        onPatch={binding.onPatch}
        onRemove={binding.onRemove}
        onPickPresenterTarget={onPickPresenterTarget}
      />
    </g>
  );
}

export function DesignerPageCanvasView({
  objects,
  pageWidth,
  pageHeight,
  background = "#fafafa",
  playReveal = null,
  animateEnterTargetKey = null,
  pickInteraction = null,
  allowPickDuringReveal = false,
  presenterImageVideo = null,
}: {
  objects: FreehandObject[];
  pageWidth: number;
  pageHeight: number;
  background?: string;
  playReveal?: PlayRevealState | null;
  /** Paso que acaba de revelarse (animación de entrada una vez). */
  animateEnterTargetKey?: string | null;
  pickInteraction?: PickPresenterInteraction | null;
  /** Si es true, se puede seguir eligiendo elementos en el lienzo aunque haya `playReveal` (vista previa en editor). */
  allowPickDuringReveal?: boolean;
  /** Vídeos anclados a imágenes (solo nodo Presenter). */
  presenterImageVideo?: PresenterImageVideoCanvasBinding | null;
}) {
  const pw = Math.max(1, pageWidth);
  const ph = Math.max(1, pageHeight);
  /** Cada instancia del lienzo necesita un clipPath único: si no, `url(#…)` resuelve al primer SVG de la página (miniaturas + stage). */
  const pageClipPathId = `presenter-page-clip-${useId().replace(/:/g, "")}`;
  const svgRef = useRef<SVGSVGElement | null>(null);
  const marqueeSessionRef = useRef<{
    startSvg: { x: number; y: number };
    startClientX: number;
    startClientY: number;
    mods: PickPointerModifiers;
    pointerId: number;
  } | null>(null);
  const [marqueeBox, setMarqueeBox] = useState<{
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  } | null>(null);

  const clipObjects = useMemo(() => objects.filter((o) => o.isClipMask), [objects]);
  const allowPick =
    Boolean(pickInteraction) &&
    (!(playReveal?.steps && playReveal.steps.length > 0) || allowPickDuringReveal);

  const selectionOverlayRects = useMemo(() => {
    if (!allowPick || !pickInteraction?.highlightKeys?.length) return [];
    const keys = [...new Set(pickInteraction.highlightKeys)];
    const out: { key: string; x: number; y: number; width: number; height: number }[] = [];
    for (const k of keys) {
      const b = boundsForPresenterKey(objects, k);
      if (b && b.width > 0 && b.height > 0) {
        out.push({ key: k, ...b });
      }
    }
    return out;
  }, [allowPick, pickInteraction?.highlightKeys, objects]);

  const clippedGroups = useMemo(() => {
    const map = new Map<string, FreehandObject[]>();
    for (const o of objects) {
      if (o.clipMaskId) {
        const arr = map.get(o.clipMaskId) || [];
        arr.push(o);
        map.set(o.clipMaskId, arr);
      }
    }
    return map;
  }, [objects]);

  const marqueePickTargets = useMemo(
    () => buildMarqueePickEntries(objects, clipObjects, clippedGroups, playReveal),
    [objects, clipObjects, clippedGroups, playReveal],
  );

  const normalizedMarqueeRect = useMemo(() => {
    if (!marqueeBox) return null;
    return normalizeMarquee(marqueeBox.x0, marqueeBox.y0, marqueeBox.x1, marqueeBox.y1);
  }, [marqueeBox]);

  const presenterImageTargets = useMemo(
    () => (presenterImageVideo ? collectPresenterImageTargets(objects) : []),
    [objects, presenterImageVideo],
  );

  const presenterImageTargetById = useMemo(() => {
    const m = new Map<string, PresenterImageTarget>();
    for (const t of presenterImageTargets) {
      m.set(t.id, t);
    }
    return m;
  }, [presenterImageTargets]);

  const pageClipUrl = `url(#${pageClipPathId})`;

  const marqueeHandlers =
    allowPick && pickInteraction?.onMarqueeSelect
      ? {
          onPointerDownCapture: (e: React.PointerEvent<SVGSVGElement>) => {
            const pi = pickInteraction;
            if (!pi?.onMarqueeSelect) return;
            const svg = svgRef.current;
            if (!svg) return;
            const pt = clientToSvgPoint(svg, e.clientX, e.clientY);
            if (!pt) return;
            const hitObjectLayer = marqueePickTargets.some(({ bounds }) => pointInAabb(pt.x, pt.y, bounds));
            if (hitObjectLayer) return;
            e.preventDefault();
            e.stopPropagation();
            marqueeSessionRef.current = {
              startSvg: pt,
              startClientX: e.clientX,
              startClientY: e.clientY,
              mods: { ctrlKey: e.ctrlKey, metaKey: e.metaKey },
              pointerId: e.pointerId,
            };
            setMarqueeBox({ x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y });
            try {
              svg.setPointerCapture(e.pointerId);
            } catch {
              /* noop */
            }
          },
          onPointerMove: (e: React.PointerEvent<SVGSVGElement>) => {
            const sess = marqueeSessionRef.current;
            if (!sess || e.pointerId !== sess.pointerId) return;
            const svg = svgRef.current;
            if (!svg) return;
            const pt = clientToSvgPoint(svg, e.clientX, e.clientY);
            if (!pt) return;
            setMarqueeBox({
              x0: sess.startSvg.x,
              y0: sess.startSvg.y,
              x1: pt.x,
              y1: pt.y,
            });
          },
          onPointerUp: (e: React.PointerEvent<SVGSVGElement>) => {
            const sess = marqueeSessionRef.current;
            if (!sess || e.pointerId !== sess.pointerId) return;
            const svg = svgRef.current;
            const endPt = svg ? clientToSvgPoint(svg, e.clientX, e.clientY) : null;
            try {
              svg?.releasePointerCapture(e.pointerId);
            } catch {
              /* noop */
            }
            marqueeSessionRef.current = null;
            setMarqueeBox(null);
            const pi = pickInteraction;
            if (!pi?.onMarqueeSelect) return;
            const dx = e.clientX - sess.startClientX;
            const dy = e.clientY - sess.startClientY;
            if (dx * dx + dy * dy < MARQUEE_DRAG_THRESHOLD_PX * MARQUEE_DRAG_THRESHOLD_PX) {
              pi.onPick(null, sess.mods);
              return;
            }
            const ex = endPt?.x ?? sess.startSvg.x;
            const ey = endPt?.y ?? sess.startSvg.y;
            const norm = normalizeMarquee(sess.startSvg.x, sess.startSvg.y, ex, ey);
            const keys: string[] = [];
            for (const { key, bounds } of marqueePickTargets) {
              if (aabbIntersect(norm, bounds)) keys.push(key);
            }
            pi.onMarqueeSelect(keys, sess.mods);
          },
          onPointerCancel: (e: React.PointerEvent<SVGSVGElement>) => {
            const sess = marqueeSessionRef.current;
            if (!sess || e.pointerId !== sess.pointerId) return;
            try {
              svgRef.current?.releasePointerCapture(e.pointerId);
            } catch {
              /* noop */
            }
            marqueeSessionRef.current = null;
            setMarqueeBox(null);
          },
        }
      : {};

  return (
    <svg
      ref={svgRef}
      className={`block h-full w-full ${allowPick ? "touch-manipulation" : ""}`}
      viewBox={`0 0 ${pw} ${ph}`}
      preserveAspectRatio="xMidYMid meet"
      style={
        allowPick
          ? {
              cursor: pickInteraction?.onMarqueeSelect ? "crosshair" : "default",
            }
          : undefined
      }
      {...marqueeHandlers}
    >
      <defs>
        {flattenObjectsForGradientDefs(objects).map((o) => {
          const f = migrateFill(o.fill);
          return f.type === "solid" ? null : renderFillDef(f, gradientDefId(o.id));
        })}
        {clipObjects.map((co) => renderClipDef(co))}
        <clipPath id={pageClipPathId} clipPathUnits="userSpaceOnUse">
          <rect x={0} y={0} width={pw} height={ph} />
        </clipPath>
      </defs>
      <rect
        width={pw}
        height={ph}
        fill={background}
        onPointerDownCapture={
          allowPick && pickInteraction && !pickInteraction.onMarqueeSelect
            ? (e) => {
                pickInteraction.onPick(null, { ctrlKey: e.ctrlKey, metaKey: e.metaKey });
              }
            : undefined
        }
      />
      {objects.map((obj) => {
        if (obj.isClipMask) return null;
        if (obj.clipMaskId) return null;
        if (!shouldPaintObject(obj, playReveal)) return null;
        const tKey = revealTargetKey(obj);
        const runAnim = Boolean(
          playReveal?.steps?.length && animateEnterTargetKey && tKey === animateEnterTargetKey,
        );
        const enter = getEnterForObject(obj, playReveal?.steps ?? []);
        const animClass = enterAnimationClass(enter, runAnim);
        const cls = animClass || undefined;
        const onPickCap = allowPick && pickInteraction
          ? (e: React.PointerEvent) => {
              e.stopPropagation();
              pickInteraction.onPick(tKey, { ctrlKey: e.ctrlKey, metaKey: e.metaKey });
            }
          : undefined;
        const pickStyle: React.CSSProperties | undefined = allowPick
          ? { cursor: "pointer", pointerEvents: "auto" }
          : { pointerEvents: "auto" };
        const vt = presenterImageVideo ? presenterImageTargetById.get(obj.id) : undefined;
        return (
          <Fragment key={obj.id}>
            <g clipPath={pageClipUrl} style={{ pointerEvents: "none" }}>
              <g
                data-fh-obj={obj.id}
                className={cls}
                style={pickStyle}
                onPointerDownCapture={onPickCap}
              >
                {renderObj(obj, objects, new Set(), PRESENTER_RENDER_OPTS)}
              </g>
            </g>
            {presenterImageVideo && vt && (
              <PresenterVideoOverlaySlice
                pageClipUrl={pageClipUrl}
                binding={presenterImageVideo}
                target={vt}
                onPickPresenterTarget={
                  allowPick && pickInteraction
                    ? (pickKey, mods) => {
                        pickInteraction.onPick(pickKey, mods);
                      }
                    : undefined
                }
              />
            )}
          </Fragment>
        );
      })}
      {Array.from(clippedGroups.entries()).map(([clipId, members]) => {
        const mask = clipObjects.find((c) => c.id === clipId);
        if (!mask) return null;
        if (!shouldPaintObject(mask, playReveal)) return null;
        if (!members.every((m) => shouldPaintObject(m, playReveal))) return null;
        const clipAnim = clipGroupAnimationClass(mask, playReveal, animateEnterTargetKey);
        const clipTKey = revealTargetKey(mask);
        const clipCls = clipAnim || undefined;
        const onPickClip =
          allowPick && pickInteraction
            ? (e: React.PointerEvent) => {
                e.stopPropagation();
                pickInteraction.onPick(clipTKey, { ctrlKey: e.ctrlKey, metaKey: e.metaKey });
              }
            : undefined;
        const pickStyleClip: React.CSSProperties | undefined = allowPick
          ? { cursor: "pointer", pointerEvents: "auto" }
          : { pointerEvents: "auto" };
        return (
          <Fragment key={`cg-${clipId}`}>
            <g clipPath={pageClipUrl} style={{ pointerEvents: "none" }}>
              <g
                data-fh-clip-root={clipId}
                clipPath={`url(#clip-${clipId})`}
                className={clipCls}
                style={pickStyleClip}
                onPointerDownCapture={onPickClip}
              >
                {members.map((m) => (
                  <g key={m.id} data-fh-obj={m.id}>
                    {renderObj(m, objects, new Set(), PRESENTER_RENDER_OPTS)}
                  </g>
                ))}
              </g>
            </g>
            {presenterImageVideo &&
              members.map((m) => {
                const mvt = presenterImageTargetById.get(m.id);
                if (!mvt) return null;
                return (
                  <PresenterVideoOverlaySlice
                    key={`pvid-after-${m.id}`}
                    pageClipUrl={pageClipUrl}
                    binding={presenterImageVideo}
                    target={mvt}
                    onPickPresenterTarget={
                      allowPick && pickInteraction
                        ? (pickKey, mods) => {
                            pickInteraction.onPick(pickKey, mods);
                          }
                        : undefined
                    }
                  />
                );
              })}
          </Fragment>
        );
      })}
      <g clipPath={pageClipUrl} style={{ pointerEvents: "none" }}>
        {selectionOverlayRects.map((r) => (
          <SelectionCornerFrame key={`sel-${r.key}`} x={r.x} y={r.y} width={r.width} height={r.height} pad={3} />
        ))}
      </g>
      {normalizedMarqueeRect && normalizedMarqueeRect.width > 0 && normalizedMarqueeRect.height > 0 && (
        <rect
          x={normalizedMarqueeRect.x}
          y={normalizedMarqueeRect.y}
          width={normalizedMarqueeRect.width}
          height={normalizedMarqueeRect.height}
          fill="rgba(59, 130, 246, 0.06)"
          stroke="rgba(59, 130, 246, 0.55)"
          strokeWidth={2.75}
          strokeDasharray="3 2"
          vectorEffect="nonScalingStroke"
          pointerEvents="none"
          className="presenter-marquee-rect"
        />
      )}
    </svg>
  );
}
