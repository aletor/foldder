"use client";

import React, { useMemo, useRef, useState } from "react";
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

export function DesignerPageCanvasView({
  objects,
  pageWidth,
  pageHeight,
  background = "#fafafa",
  playReveal = null,
  animateEnterTargetKey = null,
  pickInteraction = null,
  allowPickDuringReveal = false,
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
}) {
  const pw = Math.max(1, pageWidth);
  const ph = Math.max(1, pageHeight);
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

  return (
    <svg
      ref={svgRef}
      className={`block h-full w-full ${allowPick ? "touch-manipulation" : ""}`}
      viewBox={`0 0 ${pw} ${ph}`}
      preserveAspectRatio="xMidYMid meet"
      style={allowPick ? { cursor: "default" } : undefined}
    >
      <defs>
        {flattenObjectsForGradientDefs(objects).map((o) => {
          const f = migrateFill(o.fill);
          return f.type === "solid" ? null : renderFillDef(f, gradientDefId(o.id));
        })}
        {clipObjects.map((co) => renderClipDef(co))}
        <clipPath id="presenter-page-clip" clipPathUnits="userSpaceOnUse">
          <rect x={0} y={0} width={pw} height={ph} />
        </clipPath>
      </defs>
      <rect
        width={pw}
        height={ph}
        fill={background}
        style={allowPick && pickInteraction?.onMarqueeSelect ? { cursor: "crosshair" } : undefined}
        onPointerDownCapture={
          allowPick && pickInteraction
            ? (e) => {
                if (!pickInteraction.onMarqueeSelect) {
                  pickInteraction.onPick(null, { ctrlKey: e.ctrlKey, metaKey: e.metaKey });
                  return;
                }
                const svg = svgRef.current;
                if (!svg) return;
                const pt = clientToSvgPoint(svg, e.clientX, e.clientY);
                if (!pt) return;
                e.preventDefault();
                marqueeSessionRef.current = {
                  startSvg: pt,
                  startClientX: e.clientX,
                  startClientY: e.clientY,
                  mods: { ctrlKey: e.ctrlKey, metaKey: e.metaKey },
                  pointerId: e.pointerId,
                };
                setMarqueeBox({ x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y });
                try {
                  (e.currentTarget as SVGRectElement).setPointerCapture(e.pointerId);
                } catch {
                  /* noop */
                }
              }
            : undefined
        }
        onPointerMove={
          allowPick && pickInteraction?.onMarqueeSelect
            ? (e) => {
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
              }
            : undefined
        }
        onPointerUp={
          allowPick && pickInteraction?.onMarqueeSelect
            ? (e) => {
                const sess = marqueeSessionRef.current;
                if (!sess || e.pointerId !== sess.pointerId) return;
                const svg = svgRef.current;
                const endPt = svg ? clientToSvgPoint(svg, e.clientX, e.clientY) : null;
                try {
                  (e.currentTarget as SVGRectElement).releasePointerCapture(e.pointerId);
                } catch {
                  /* noop */
                }
                marqueeSessionRef.current = null;
                setMarqueeBox(null);
                const dx = e.clientX - sess.startClientX;
                const dy = e.clientY - sess.startClientY;
                if (dx * dx + dy * dy < MARQUEE_DRAG_THRESHOLD_PX * MARQUEE_DRAG_THRESHOLD_PX) {
                  pickInteraction.onPick(null, sess.mods);
                  return;
                }
                const ex = endPt?.x ?? sess.startSvg.x;
                const ey = endPt?.y ?? sess.startSvg.y;
                const norm = normalizeMarquee(sess.startSvg.x, sess.startSvg.y, ex, ey);
                const keys: string[] = [];
                for (const { key, bounds } of marqueePickTargets) {
                  if (aabbIntersect(norm, bounds)) keys.push(key);
                }
                pickInteraction.onMarqueeSelect?.(keys, sess.mods);
              }
            : undefined
        }
        onPointerCancel={
          allowPick && pickInteraction?.onMarqueeSelect
            ? (e) => {
                const sess = marqueeSessionRef.current;
                if (!sess || e.pointerId !== sess.pointerId) return;
                try {
                  (e.currentTarget as SVGRectElement).releasePointerCapture(e.pointerId);
                } catch {
                  /* noop */
                }
                marqueeSessionRef.current = null;
                setMarqueeBox(null);
              }
            : undefined
        }
      />
      <g clipPath="url(#presenter-page-clip)" style={{ pointerEvents: "none" }}>
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
          const isHi = Boolean(allowPick && pickInteraction?.highlightKeys.includes(tKey));
          const isGroupTarget = tKey.startsWith("group:");
          const pickHi = isHi
            ? isGroupTarget
              ? "presenter-pick-highlight-group"
              : "presenter-pick-highlight"
            : "";
          const cls = [animClass, pickHi].filter(Boolean).join(" ") || undefined;
          const onPickCap = allowPick && pickInteraction
            ? (e: React.PointerEvent) => {
                e.stopPropagation();
                pickInteraction.onPick(tKey, { ctrlKey: e.ctrlKey, metaKey: e.metaKey });
              }
            : undefined;
          const pickStyle: React.CSSProperties | undefined = allowPick
            ? { cursor: "pointer", pointerEvents: "auto" }
            : { pointerEvents: "auto" };
          return (
            <g
              key={obj.id}
              data-fh-obj={obj.id}
              className={cls}
              style={pickStyle}
              onPointerDownCapture={onPickCap}
            >
              {renderObj(obj, objects, new Set(), PRESENTER_RENDER_OPTS)}
            </g>
          );
        })}
        {Array.from(clippedGroups.entries()).map(([clipId, members]) => {
          const mask = clipObjects.find((c) => c.id === clipId);
          if (!mask) return null;
          if (!shouldPaintObject(mask, playReveal)) return null;
          if (!members.every((m) => shouldPaintObject(m, playReveal))) return null;
          const clipAnim = clipGroupAnimationClass(mask, playReveal, animateEnterTargetKey);
          const clipTKey = revealTargetKey(mask);
          const clipIsGroup = clipTKey.startsWith("group:");
          const pickHiClip =
            allowPick && pickInteraction?.highlightKeys.includes(clipTKey)
              ? clipIsGroup
                ? "presenter-pick-highlight-group"
                : "presenter-pick-highlight"
              : "";
          const clipCls = [clipAnim, pickHiClip].filter(Boolean).join(" ") || undefined;
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
            <g
              key={`cg-${clipId}`}
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
          );
        })}
        {selectionOverlayRects.map((r) => {
          const pad = 3;
          const x = r.x - pad;
          const y = r.y - pad;
          const w = r.width + pad * 2;
          const h = r.height + pad * 2;
          const isGroupMarco = r.key.startsWith("group:");
          return (
            <g key={`sel-${r.key}`} pointerEvents="none" className="presenter-selection-marco">
              <rect
                x={x}
                y={y}
                width={w}
                height={h}
                fill={isGroupMarco ? "rgba(245, 158, 11, 0.06)" : "none"}
                stroke={isGroupMarco ? "rgb(251 191 36)" : "rgb(139 92 246)"}
                strokeWidth={isGroupMarco ? 3 : 2.5}
                strokeDasharray={isGroupMarco ? undefined : "6 4"}
                vectorEffect="nonScalingStroke"
                rx={2}
              />
            </g>
          );
        })}
      </g>
      {normalizedMarqueeRect && normalizedMarqueeRect.width > 0 && normalizedMarqueeRect.height > 0 && (
        <rect
          x={normalizedMarqueeRect.x}
          y={normalizedMarqueeRect.y}
          width={normalizedMarqueeRect.width}
          height={normalizedMarqueeRect.height}
          fill="rgba(139, 92, 246, 0.12)"
          stroke="rgb(139 92 246)"
          strokeWidth={1}
          strokeDasharray="4 3"
          vectorEffect="nonScalingStroke"
          pointerEvents="none"
          className="presenter-marquee-rect"
        />
      )}
    </svg>
  );
}
