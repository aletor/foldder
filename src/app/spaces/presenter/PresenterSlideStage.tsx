"use client";

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { getPageDimensions } from "../indesign/page-formats";
import type { DesignerPageState } from "../designer/DesignerNode";
import { DesignerPageCanvasView, type PickPresenterInteraction, type PlayRevealState } from "./DesignerPageCanvasView";
import type { PlayProTimingState } from "./presenter-pro-timing";
import type { PresenterImageVideoCanvasBinding } from "./presenter-image-video-types";
import type { SlideTransitionId } from "./slide-transition-types";
import { DEFAULT_SLIDE_TRANSITION } from "./slide-transition-types";
import { usePresenterSlideViewport } from "./use-presenter-slide-viewport";

const TRANSITION_MS = 420;

/** Encaja el rectángulo lógico del slide en el área disponible sin deformar (como «contain»). Requiere un antecesor con `container-type: size` (p. ej. el contenedor del stage). */
function slideBoxStyle(logicalW: number, logicalH: number): React.CSSProperties {
  const lw = Math.max(1, logicalW);
  const lh = Math.max(1, logicalH);
  return {
    aspectRatio: `${lw} / ${lh}`,
    width: `min(100cqw, calc(100cqh * ${lw} / ${lh}))`,
    maxWidth: "100%",
    maxHeight: "100%",
  };
}

function getSlideMotion(
  t: SlideTransitionId,
  dir: 1 | -1,
): {
  incomingStart: React.CSSProperties;
  incomingEnd: React.CSSProperties;
  outgoingStart: React.CSSProperties;
  outgoingEnd: React.CSSProperties;
} {
  const inv = dir === -1;
  switch (t) {
    case "none":
      return {
        incomingStart: {},
        incomingEnd: {},
        outgoingStart: {},
        outgoingEnd: {},
      };
    case "fade":
      return {
        incomingStart: { opacity: 0 },
        incomingEnd: { opacity: 1 },
        outgoingStart: { opacity: 1 },
        outgoingEnd: { opacity: 0 },
      };
    case "slideLeft": {
      const inFrom = inv ? "-100%" : "100%";
      const outTo = inv ? "100%" : "-100%";
      return {
        incomingStart: { transform: `translateX(${inFrom})` },
        incomingEnd: { transform: "translateX(0)" },
        outgoingStart: { transform: "translateX(0)" },
        outgoingEnd: { transform: `translateX(${outTo})` },
      };
    }
    case "slideRight": {
      const inFrom = inv ? "100%" : "-100%";
      const outTo = inv ? "-100%" : "100%";
      return {
        incomingStart: { transform: `translateX(${inFrom})` },
        incomingEnd: { transform: "translateX(0)" },
        outgoingStart: { transform: "translateX(0)" },
        outgoingEnd: { transform: `translateX(${outTo})` },
      };
    }
    case "slideUp": {
      const inFrom = inv ? "-100%" : "100%";
      const outTo = inv ? "100%" : "-100%";
      return {
        incomingStart: { transform: `translateY(${inFrom})` },
        incomingEnd: { transform: "translateY(0)" },
        outgoingStart: { transform: "translateY(0)" },
        outgoingEnd: { transform: `translateY(${outTo})` },
      };
    }
    case "slideDown": {
      const inFrom = inv ? "100%" : "-100%";
      const outTo = inv ? "-100%" : "100%";
      return {
        incomingStart: { transform: `translateY(${inFrom})` },
        incomingEnd: { transform: "translateY(0)" },
        outgoingStart: { transform: "translateY(0)" },
        outgoingEnd: { transform: `translateY(${outTo})` },
      };
    }
    default:
      return {
        incomingStart: { opacity: 0 },
        incomingEnd: { opacity: 1 },
        outgoingStart: { opacity: 1 },
        outgoingEnd: { opacity: 0 },
      };
  }
}

type PendingAnim = {
  from: number;
  to: number;
  transition: SlideTransitionId;
  dir: 1 | -1;
};

type Props = {
  pages: DesignerPageState[];
  activeIdx: number;
  pendingAnim: PendingAnim | null;
  onAnimationEnd: () => void;
  /** Revelado por grupos (modo Play); no aplica durante transición entre slides (doble capa). */
  playReveal?: PlayRevealState | null;
  /** Visibilidad por tiempo (modo Pro). */
  playProTiming?: PlayProTimingState | null;
  animateEnterTargetKey?: string | null;
  /** Clic en el slide para elegir elementos (vista edición del Presenter). */
  pickInteraction?: PickPresenterInteraction | null;
  /** Vista previa de entrada en editor: no bloquear la selección en el lienzo. */
  allowPickDuringReveal?: boolean;
  /**
   * Lienzo: atenuar fuera del rectángulo real del slide + borde y etiqueta W×H (px lógicos).
   * Desactivar en presentación a pantalla completa.
   */
  showPresentationBounds?: boolean;
  /** Vídeo sobre imágenes (solo capa Presenter). Durante transición entre slides se omite. */
  presenterImageVideo?: PresenterImageVideoCanvasBinding | null;
};

type BoundsPx = { top: number; left: number; right: number; bottom: number; slideH: number };

function PresentationBoundsChrome({
  enabled,
  containerRef,
  slideRef,
  logicalW,
  logicalH,
}: {
  enabled: boolean;
  containerRef: React.RefObject<HTMLDivElement | null>;
  slideRef: React.RefObject<HTMLDivElement | null>;
  logicalW: number;
  logicalH: number;
}) {
  const [b, setB] = useState<BoundsPx | null>(null);

  const measure = useCallback(() => {
    const c = containerRef.current;
    const s = slideRef.current;
    if (!c || !s) return;
    const cr = c.getBoundingClientRect();
    const sr = s.getBoundingClientRect();
    setB({
      top: Math.max(0, sr.top - cr.top),
      left: Math.max(0, sr.left - cr.left),
      right: Math.max(0, cr.right - sr.right),
      bottom: Math.max(0, cr.bottom - sr.bottom),
      slideH: sr.height,
    });
  }, [containerRef, slideRef]);

  useLayoutEffect(() => {
    if (!enabled) {
      setB(null);
      return;
    }
    measure();
    const c = containerRef.current;
    const s = slideRef.current;
    const ro = new ResizeObserver(() => measure());
    if (c) ro.observe(c);
    if (s) ro.observe(s);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [enabled, measure, logicalW, logicalH]);

  if (!enabled || !b || b.slideH <= 0) return null;

  return (
    <>
      <div
        className="pointer-events-none absolute inset-x-0 top-0 bg-zinc-900/[0.14]"
        style={{ height: b.top }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 bg-zinc-900/[0.14]"
        style={{ height: b.bottom }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute left-0 bg-zinc-900/[0.14]"
        style={{ top: b.top, width: b.left, height: b.slideH }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute right-0 bg-zinc-900/[0.14]"
        style={{ top: b.top, width: b.right, height: b.slideH }}
        aria-hidden
      />
    </>
  );
}

export function PresenterSlideStage({
  pages,
  activeIdx,
  pendingAnim,
  onAnimationEnd,
  playReveal = null,
  playProTiming = null,
  animateEnterTargetKey = null,
  pickInteraction = null,
  allowPickDuringReveal = false,
  showPresentationBounds = true,
  presenterImageVideo = null,
}: Props) {
  const [play, setPlay] = useState(false);
  const timerRef = useRef<number | null>(null);
  const boundsContainerRef = useRef<HTMLDivElement | null>(null);
  const page = pages[activeIdx];
  const pageId = page?.id ?? activeIdx;
  const {
    viewport,
    slideRef: boundsSlideRef,
    hostRef: viewportHostRef,
    onDoubleClick: onViewportDoubleClick,
    viewportEnabled,
  } = usePresenterSlideViewport(showPresentationBounds, pageId);

  useLayoutEffect(() => {
    if (!pendingAnim) {
      setPlay(false);
      return;
    }
    setPlay(false);
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setPlay(true));
    });
    return () => cancelAnimationFrame(id);
  }, [pendingAnim]);

  useEffect(() => {
    if (!pendingAnim || pendingAnim.transition === "none") return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      onAnimationEnd();
    }, TRANSITION_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [pendingAnim, onAnimationEnd]);

  const showDual =
    pendingAnim &&
    pendingAnim.transition !== "none" &&
    pages[pendingAnim.from] &&
    pages[pendingAnim.to];

  if (showDual && pendingAnim) {
    const fromPage = pages[pendingAnim.from];
    const toPage = pages[pendingAnim.to];
    const d0 = getPageDimensions(fromPage);
    const d1 = getPageDimensions(toPage);
    const motion = getSlideMotion(pendingAnim.transition, pendingAnim.dir);
    const ease = "cubic-bezier(0.22, 1, 0.36, 1)";
    const trans = `${TRANSITION_MS}ms ${ease}`;
    const commonTrans = {
      transition: `transform ${trans}, opacity ${trans}`,
      willChange: "transform, opacity" as const,
    };

    return (
      <div
        className={`absolute inset-0 flex min-h-0 min-w-0 items-center justify-center ${showPresentationBounds ? "p-2" : "p-0"}`}
        style={{ containerType: "size" }}
      >
        <div className="relative flex h-full w-full min-h-0 min-w-0 items-center justify-center overflow-hidden">
          <div
            className="absolute inset-0 z-0 flex min-h-0 min-w-0 items-center justify-center"
            style={{
              ...motion.outgoingStart,
              ...(play ? motion.outgoingEnd : {}),
              ...commonTrans,
            }}
          >
            <div className="min-h-0 min-w-0 shrink-0" style={slideBoxStyle(d0.width, d0.height)}>
              <DesignerPageCanvasView
                objects={fromPage.objects ?? []}
                pageWidth={d0.width}
                pageHeight={d0.height}
                playReveal={null}
                presenterImageVideo={null}
              />
            </div>
          </div>
          <div
            className="absolute inset-0 z-[1] flex min-h-0 min-w-0 items-center justify-center"
            style={{
              ...motion.incomingStart,
              ...(play ? motion.incomingEnd : {}),
              ...commonTrans,
            }}
          >
            <div className="min-h-0 min-w-0 shrink-0" style={slideBoxStyle(d1.width, d1.height)}>
              <DesignerPageCanvasView
                objects={toPage.objects ?? []}
                pageWidth={d1.width}
                pageHeight={d1.height}
                playReveal={null}
                presenterImageVideo={null}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!page) return null;
  const dims = getPageDimensions(page);
  const lw = Math.max(1, dims.width);
  const lh = Math.max(1, dims.height);

  return (
    <div
      ref={boundsContainerRef}
      className={`absolute inset-0 flex min-h-0 min-w-0 items-center justify-center ${showPresentationBounds ? "p-2" : "p-0"}`}
      style={{ containerType: "size" }}
    >
      <PresentationBoundsChrome
        enabled={showPresentationBounds}
        containerRef={boundsContainerRef}
        slideRef={boundsSlideRef}
        logicalW={lw}
        logicalH={lh}
      />
      <div
        ref={viewportHostRef}
        data-presenter-slide-viewport=""
        className={`relative z-10 flex h-full w-full min-h-0 min-w-0 items-center justify-center ${
          viewportEnabled ? "touch-none" : ""
        }`}
        onDoubleClick={onViewportDoubleClick}
        title={viewportEnabled ? "Doble clic en el fondo para ajustar a pantalla · Rueda para zoom" : undefined}
      >
        <div
          ref={boundsSlideRef}
          className={`relative min-h-0 min-w-0 shrink-0 overflow-hidden ${showPresentationBounds ? "rounded-[2px]" : "rounded-none"}`}
          style={{
            ...slideBoxStyle(dims.width, dims.height),
            ...(showPresentationBounds
              ? {
                  boxShadow: "inset 0 0 0 2px rgba(56, 189, 248, 0.5)",
                  transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
                  transformOrigin: "center center",
                }
              : undefined),
          }}
        >
        {showPresentationBounds && (
          <div
            className="pointer-events-none absolute top-1.5 left-1/2 z-20 -translate-x-1/2 rounded border border-black/20 bg-black/50 px-1.5 py-0.5 font-mono text-[9px] font-medium tabular-nums text-white/95 shadow-sm backdrop-blur-[2px]"
            aria-hidden
          >
            {lw} × {lh} px
          </div>
        )}
        <DesignerPageCanvasView
          objects={page.objects ?? []}
          pageWidth={dims.width}
          pageHeight={dims.height}
          playReveal={playReveal}
          playProTiming={playProTiming}
          animateEnterTargetKey={animateEnterTargetKey}
          pickInteraction={pickInteraction}
          allowPickDuringReveal={allowPickDuringReveal}
          presenterImageVideo={presenterImageVideo}
        />
        </div>
      </div>
    </div>
  );
}

export function resolveIncomingTransition(
  pages: DesignerPageState[],
  toIdx: number,
  transitionsByPageId: Record<string, SlideTransitionId>,
): SlideTransitionId {
  const p = pages[toIdx];
  if (!p) return DEFAULT_SLIDE_TRANSITION;
  return transitionsByPageId[p.id] ?? DEFAULT_SLIDE_TRANSITION;
}
