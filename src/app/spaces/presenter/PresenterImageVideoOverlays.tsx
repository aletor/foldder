"use client";

import React, { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Play } from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import type { PresenterImageTarget } from "./presenter-image-video-collect";
import {
  DEFAULT_PRESENTER_VIDEO_REL,
  FOLDDER_OPEN_GEMINI_VIDEO_WITH_IMAGE_EVENT,
  type FoldderOpenGeminiVideoDetail,
  type PresenterImageVideoPlacement,
  type PresenterImageVideoRel,
} from "./presenter-image-video-types";
import {
  clampRel,
  contentAlignmentToObjectPosition,
  presenterFittingModeToObjectFitClass,
} from "./presenter-video-frame-layout";
import type { FreehandObject } from "../FreehandStudio";
import { renderPresenterVideoClipShapeWorld } from "../FreehandStudio";
import {
  PRESENTER_MODAL_BTN_PRIMARY,
  PRESENTER_MODAL_BTN_SECONDARY,
  presenterModalBackdropClass,
  presenterModalOverlayClass,
  presenterModalPanelProps,
} from "./presenter-modal-chrome";

type DragKind = "move" | "resize-se" | "resize-sw" | "resize-ne" | "resize-nw";

/** Mejor seguimiento del puntero al salir del `foreignObject` (listeners en fase captura). */
const POINTER_CAPTURE_OPTS = { capture: true } as const;

function formatVideoClock(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Barra de tiempo anclada al marco de la imagen (no al rectángulo del vídeo escalado). */
function PresenterVideoScrubBar({
  videoRef,
  videoUrl,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  videoUrl: string;
}) {
  const [currentSec, setCurrentSec] = useState(0);
  const [durationSec, setDurationSec] = useState(0);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const sync = () => {
      setCurrentSec(el.currentTime);
      if (Number.isFinite(el.duration) && el.duration > 0) setDurationSec(el.duration);
    };
    el.addEventListener("timeupdate", sync);
    el.addEventListener("loadedmetadata", sync);
    el.addEventListener("durationchange", sync);
    sync();
    return () => {
      el.removeEventListener("timeupdate", sync);
      el.removeEventListener("loadedmetadata", sync);
      el.removeEventListener("durationchange", sync);
    };
  }, [videoRef, videoUrl]);

  if (durationSec <= 0) return null;

  return (
    <div
      className="pointer-events-auto absolute bottom-0 left-0 right-0 z-[35] px-1.5 pb-1 pt-1"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-1.5 rounded-sm bg-black/40 px-1 py-0.5 backdrop-blur-[2px]">
        <span className="shrink-0 text-[8px] tabular-nums text-white/75">{formatVideoClock(currentSec)}</span>
        <input
          type="range"
          aria-label="Posición en el vídeo"
          className="presenter-video-scrub h-1 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-white/15 accent-sky-400 [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow"
          min={0}
          max={durationSec}
          step={0.05}
          value={Math.min(currentSec, durationSec)}
          onChange={(e) => {
            const v = Number(e.target.value);
            const el = videoRef.current;
            if (!el || !Number.isFinite(v)) return;
            el.currentTime = v;
            setCurrentSec(v);
          }}
        />
        <span className="shrink-0 text-[8px] tabular-nums text-white/50">{formatVideoClock(durationSec)}</span>
      </div>
    </div>
  );
}

/** Solo el elemento video; play/pausa van en el marco de la imagen (`PresenterPlacedVideoBlock`). */
function PresenterEmbeddedVideo({
  pl,
  videoRef,
}: {
  pl: PresenterImageVideoPlacement;
  videoRef: React.RefObject<HTMLVideoElement | null>;
}) {
  const ref = videoRef;
  const autoplay = pl.autoplay !== false;
  const loop = Boolean(pl.loop);
  const mute = Boolean(pl.mute);
  const posterSec =
    typeof pl.posterTimeSec === "number" && !Number.isNaN(pl.posterTimeSec)
      ? Math.max(0, pl.posterTimeSec)
      : 0;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.muted = mute;
    el.loop = loop;
    const apply = () => {
      if (autoplay) {
        void el.play().catch(() => {});
      } else {
        el.pause();
        try {
          el.currentTime = posterSec;
        } catch {
          /* noop */
        }
      }
    };
    el.addEventListener("loadeddata", apply);
    if (el.readyState >= 2) apply();
    return () => el.removeEventListener("loadeddata", apply);
  }, [pl.videoUrl, autoplay, loop, mute, posterSec]);

  const fitClass = presenterFittingModeToObjectFitClass(pl.videoFittingMode);
  const objectPosition = contentAlignmentToObjectPosition(pl.videoContentAlignment);

  return (
    <div key={`${pl.id}-${pl.videoUrl}`} className="relative h-full w-full">
      <video
        ref={ref}
        src={pl.videoUrl}
        className={`block h-full w-full ${fitClass}`}
        style={{ objectPosition }}
        playsInline
        controls={false}
        muted={mute}
        loop={loop}
        autoPlay={autoplay}
      />
    </div>
  );
}

/** Clip del vídeo + barra de tiempo en el marco de la imagen (no dentro del rect reframe). */
function PresenterPlacedVideoBlock({
  t,
  pl,
  showTransformChrome,
  onVideoBodyPointerDown,
  bindDrag,
  onRemove,
}: {
  t: PresenterImageTarget;
  pl: PresenterImageVideoPlacement;
  /** Handles, marco ámbar y arrastre de encuadre (objeto ancla seleccionado en Presenter). */
  showTransformChrome: boolean;
  onVideoBodyPointerDown: (
    e: React.PointerEvent,
    target: PresenterImageTarget,
    placement: PresenterImageVideoPlacement,
  ) => void;
  bindDrag: (
    root: HTMLDivElement,
    kind: DragKind,
    placementId: string,
    startRel: PresenterImageVideoRel,
    startClientX: number,
    startClientY: number,
    pointerId: number,
    captureTarget?: HTMLElement | null,
  ) => void;
  onRemove: (id: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [videoPaused, setVideoPaused] = useState(true);
  const autoplayOff = pl.autoplay === false;

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const sync = () => setVideoPaused(el.paused);
    el.addEventListener("play", sync);
    el.addEventListener("pause", sync);
    sync();
    return () => {
      el.removeEventListener("play", sync);
      el.removeEventListener("pause", sync);
    };
  }, [pl.videoUrl]);

  return (
    <>
      <div className="pointer-events-none absolute inset-0 z-[1] overflow-hidden">
        <div
          className={`touch-none absolute overflow-hidden rounded-[1px] bg-black ${
            showTransformChrome ? "pointer-events-auto" : "pointer-events-none"
          }`}
          style={{
            left: `${pl.rel.x * 100}%`,
            top: `${pl.rel.y * 100}%`,
            width: `${pl.rel.w * 100}%`,
            height: `${pl.rel.h * 100}%`,
            touchAction: "none",
          }}
          title="Arrastra para mover el encuadre del vídeo"
          onPointerDown={(e) => {
            if (!showTransformChrome) return;
            onVideoBodyPointerDown(e, t, pl);
          }}
        >
          <PresenterEmbeddedVideo pl={pl} videoRef={videoRef} />
        </div>
      </div>
      {/* Centrado en el marco de la imagen (no en el rect del vídeo reescalado). */}
      <div className="pointer-events-none absolute inset-0 z-[30] flex items-center justify-center">
        {videoPaused ? (
          <button
            type="button"
            className="pointer-events-auto flex cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-0"
            aria-label="Reproducir vídeo"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              void videoRef.current?.play().catch(() => {});
            }}
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/95 text-zinc-900 shadow-lg ring-2 ring-white/40">
              <Play className="ml-0.5 h-7 w-7 fill-current" strokeWidth={0} aria-hidden />
            </span>
          </button>
        ) : autoplayOff ? (
          <button
            type="button"
            className="pointer-events-auto h-12 w-12 shrink-0 cursor-pointer rounded-full border-0 bg-transparent p-0 opacity-0"
            aria-label="Pausar vídeo"
            title="Pausar"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              videoRef.current?.pause();
            }}
          />
        ) : null}
      </div>
      {pl.autoplay === false && (
        <PresenterVideoScrubBar videoRef={videoRef} videoUrl={pl.videoUrl} />
      )}
      {showTransformChrome && (
        <div className="pointer-events-none absolute inset-0 z-[200]">
          <div
            className="pointer-events-none absolute inset-x-0 top-0 border-b border-amber-400/35 bg-gradient-to-b from-amber-500/25 to-transparent px-2 pb-3 pt-1 text-center"
            aria-hidden
          >
            <span className="text-[9px] font-semibold uppercase tracking-wide text-amber-100/95">
              Encuadre del vídeo
            </span>
            <span className="mt-0.5 block text-[8px] leading-tight text-amber-200/80">
              Arrastra el vídeo o las esquinas · Propiedades alinear como en Designer
            </span>
          </div>
          <div
            className="pointer-events-none absolute z-0 border-2 border-dashed border-amber-400/95 shadow-[0_0_0_1px_rgba(0,0,0,0.35)]"
            style={{
              left: `${pl.rel.x * 100}%`,
              top: `${pl.rel.y * 100}%`,
              width: `${pl.rel.w * 100}%`,
              height: `${pl.rel.h * 100}%`,
              boxShadow: "inset 0 0 0 1px rgba(251,191,36,0.25)",
            }}
            aria-hidden
          />
          <div
            title="Redimensionar encuadre"
            className="pointer-events-auto touch-none absolute z-10 h-3.5 w-3.5 cursor-nwse-resize rounded-sm border-2 border-amber-400 bg-white shadow-md ring-1 ring-amber-500/40"
            style={{
              left: `calc(${pl.rel.x * 100}% - 7px)`,
              top: `calc(${pl.rel.y * 100}% - 7px)`,
              touchAction: "none",
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
              const root = document.getElementById(`pvid-root-${t.id}`) as HTMLDivElement | null;
              if (!root) return;
              bindDrag(
                root,
                "resize-nw",
                pl.id,
                { ...pl.rel },
                e.clientX,
                e.clientY,
                e.pointerId,
                e.currentTarget instanceof HTMLElement ? e.currentTarget : null,
              );
            }}
          />
          <div
            title="Redimensionar encuadre"
            className="pointer-events-auto touch-none absolute z-10 h-3.5 w-3.5 cursor-nesw-resize rounded-sm border-2 border-amber-400 bg-white shadow-md ring-1 ring-amber-500/40"
            style={{
              left: `calc(${(pl.rel.x + pl.rel.w) * 100}% - 7px)`,
              top: `calc(${pl.rel.y * 100}% - 7px)`,
              touchAction: "none",
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
              const root = document.getElementById(`pvid-root-${t.id}`) as HTMLDivElement | null;
              if (!root) return;
              bindDrag(
                root,
                "resize-ne",
                pl.id,
                { ...pl.rel },
                e.clientX,
                e.clientY,
                e.pointerId,
                e.currentTarget instanceof HTMLElement ? e.currentTarget : null,
              );
            }}
          />
          <div
            title="Redimensionar encuadre"
            className="pointer-events-auto touch-none absolute z-10 h-3.5 w-3.5 cursor-nesw-resize rounded-sm border-2 border-amber-400 bg-white shadow-md ring-1 ring-amber-500/40"
            style={{
              left: `calc(${pl.rel.x * 100}% - 7px)`,
              top: `calc(${(pl.rel.y + pl.rel.h) * 100}% - 7px)`,
              touchAction: "none",
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
              const root = document.getElementById(`pvid-root-${t.id}`) as HTMLDivElement | null;
              if (!root) return;
              bindDrag(
                root,
                "resize-sw",
                pl.id,
                { ...pl.rel },
                e.clientX,
                e.clientY,
                e.pointerId,
                e.currentTarget instanceof HTMLElement ? e.currentTarget : null,
              );
            }}
          />
          <div
            title="Redimensionar encuadre"
            className="pointer-events-auto touch-none absolute z-10 h-3.5 w-3.5 cursor-nwse-resize rounded-sm border-2 border-amber-400 bg-white shadow-md ring-1 ring-amber-500/40"
            style={{
              left: `calc(${(pl.rel.x + pl.rel.w) * 100}% - 7px)`,
              top: `calc(${(pl.rel.y + pl.rel.h) * 100}% - 7px)`,
              touchAction: "none",
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
              const root = document.getElementById(`pvid-root-${t.id}`) as HTMLDivElement | null;
              if (!root) return;
              bindDrag(
                root,
                "resize-se",
                pl.id,
                { ...pl.rel },
                e.clientX,
                e.clientY,
                e.pointerId,
                e.currentTarget instanceof HTMLElement ? e.currentTarget : null,
              );
            }}
          />
          <button
            type="button"
            className="pointer-events-auto absolute right-1 top-9 z-10 rounded border border-rose-400/50 bg-rose-500/25 px-1.5 py-0.5 text-[8px] font-bold text-rose-100 backdrop-blur-sm hover:bg-rose-500/40"
            title="Quitar vídeo de la imagen"
            onClick={(e) => {
              e.stopPropagation();
              onRemove(pl.id);
            }}
          >
            Quitar
          </button>
        </div>
      )}
    </>
  );
}

type PickMods = { ctrlKey: boolean; metaKey: boolean };

type Props = {
  pageId: string;
  /** Objetos de la página (para recorte SVG acorde a rect/elipse/path). */
  canvasObjects: FreehandObject[];
  /**
   * Solo este ancla muestra handles de transformación; `null` = ninguno.
   * `undefined` = todos (compatibilidad si no se pasa desde el padre).
   */
  videoTransformHandlesObjectId?: string | null;
  targets: PresenterImageTarget[];
  placements: PresenterImageVideoPlacement[];
  uiMode: "edit" | "playback";
  uploadingKey: string | null;
  onUploadBusy: (key: string | null) => void;
  onUpsert: (p: PresenterImageVideoPlacement) => void;
  onPatch: (
    id: string,
    patch: Partial<
      Pick<
        PresenterImageVideoPlacement,
        | "rel"
        | "autoplay"
        | "loop"
        | "mute"
        | "posterTimeSec"
        | "videoFittingMode"
        | "videoContentAlignment"
      >
    >,
  ) => void;
  onRemove: (id: string) => void;
  /** Clic sobre el vídeo (sin arrastrar) delega la misma selección que el objeto imagen bajo el overlay. */
  onPickPresenterTarget?: (pickKey: string, mods: PickMods) => void;
  /** Solo el destino seleccionado muestra la barra «Colocar / Generar». */
  highlightPickKeys?: string[];
};

/** Por debajo de esto se considera «clic» para seleccionar animación; por encima, arrastre del vídeo. */
const VIDEO_DRAG_THRESHOLD_PX = 5;

export function PresenterImageVideoOverlays({
  pageId,
  canvasObjects,
  videoTransformHandlesObjectId,
  targets,
  placements,
  uiMode,
  uploadingKey,
  onUploadBusy,
  onUpsert,
  onPatch,
  onRemove,
  onPickPresenterTarget,
  highlightPickKeys,
}: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const pendingTargetId = useRef<string | null>(null);
  /** Montar el input en `useEffect` para igualar SSR (sin portal) y evitar error de hidratación en /spaces. */
  const [fileInputMounted, setFileInputMounted] = useState(false);
  useEffect(() => {
    setFileInputMounted(true);
  }, []);

  const [geminiModal, setGeminiModal] = useState<{ imageUrl: string } | null>(null);
  const [intentText, setIntentText] = useState("");
  const [intentLoading, setIntentLoading] = useState(false);
  const [intentError, setIntentError] = useState<string | null>(null);

  const placementFor = useCallback(
    (imageObjectId: string) => placements.find((p) => p.pageId === pageId && p.imageObjectId === imageObjectId),
    [placements, pageId],
  );

  const normFromClient = (clientX: number, clientY: number, root: HTMLDivElement) => {
    const r = root.getBoundingClientRect();
    return {
      nx: (clientX - r.left) / Math.max(1e-9, r.width),
      ny: (clientY - r.top) / Math.max(1e-9, r.height),
    };
  };

  const onPickFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      const tid = pendingTargetId.current;
      e.target.value = "";
      if (!file || !tid) return;
      if (!file.type.startsWith("video/")) {
        window.alert("Elige un archivo de vídeo.");
        return;
      }
      onUploadBusy(`${pageId}::${tid}`);
      const fd = new FormData();
      fd.append("file", file);
      try {
        const res = await fetch("/api/spaces/presenter-video-upload", { method: "POST", body: fd });
        const j = (await res.json()) as { url?: string; s3Key?: string; error?: string };
        if (!res.ok) throw new Error(j.error || "upload failed");
        if (!j.url) throw new Error("sin URL");
        onUpsert({
          id: uuidv4(),
          pageId,
          imageObjectId: tid,
          videoUrl: j.url,
          s3Key: j.s3Key,
          rel: { ...DEFAULT_PRESENTER_VIDEO_REL },
          autoplay: true,
          loop: false,
          mute: false,
          posterTimeSec: 0,
          videoFittingMode: "fill-proportional",
          videoContentAlignment: "center",
        });
      } catch (err: unknown) {
        window.alert(err instanceof Error ? err.message : "Error al subir el vídeo");
      } finally {
        onUploadBusy(null);
      }
    },
    [onUpsert, onUploadBusy, pageId],
  );

  const startUpload = useCallback((imageObjectId: string) => {
    pendingTargetId.current = imageObjectId;
    const el = fileRef.current;
    if (el && typeof el.click === "function") {
      el.click();
    }
  }, []);

  const openGeminiIntentModal = useCallback((imageUrl: string) => {
    if (!imageUrl.trim()) return;
    setIntentText("");
    setIntentError(null);
    setGeminiModal({ imageUrl: imageUrl.trim() });
  }, []);

  const submitGeminiIntent = useCallback(async () => {
    if (!geminiModal?.imageUrl) return;
    const raw = intentText.trim();
    if (!raw) {
      setIntentError("Describe qué quieres que ocurra en el vídeo.");
      return;
    }
    setIntentError(null);
    setIntentLoading(true);
    let videoPrompt = raw;
    try {
      const enhancePayload = `Video generado a partir de un primer fotograma que ya es una imagen fija (diapositiva). El usuario pide: "${raw}". Escribe UN solo prompt detallado para un modelo de vídeo con IA: acción, movimiento de cámara, iluminación, ritmo y estilo visual coherente con partir de esa imagen.`;
      const res = await fetch("/api/openai/enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: enhancePayload }),
      });
      const j = (await res.json()) as { enhanced?: string; error?: string };
      if (res.ok && typeof j.enhanced === "string" && j.enhanced.trim()) {
        videoPrompt = j.enhanced.trim();
      }
    } catch {
      /* usar texto del usuario */
    }
    if (typeof window === "undefined") {
      setIntentLoading(false);
      setIntentError("No se pudo abrir el lienzo desde este contexto.");
      return;
    }
    window.dispatchEvent(
      new CustomEvent(FOLDDER_OPEN_GEMINI_VIDEO_WITH_IMAGE_EVENT, {
        detail: { imageUrl: geminiModal.imageUrl, videoPrompt } satisfies FoldderOpenGeminiVideoDetail,
      }),
    );
    setIntentLoading(false);
    setGeminiModal(null);
    setIntentText("");
  }, [geminiModal, intentText]);

  const bindDrag = useCallback(
    (
      root: HTMLDivElement,
      kind: DragKind,
      placementId: string,
      startRel: PresenterImageVideoRel,
      startClientX: number,
      startClientY: number,
      pointerId: number,
      /** Captura el puntero para seguir recibiendo movimiento fuera del `foreignObject` / contenedor. */
      captureTarget?: HTMLElement | null,
    ) => {
      if (captureTarget?.setPointerCapture) {
        try {
          captureTarget.setPointerCapture(pointerId);
        } catch {
          /* noop: elemento no válido o puntero ya liberado */
        }
      }
      const { nx: startNx, ny: startNy } = normFromClient(startClientX, startClientY, root);
      const onMove = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        const { nx, ny } = normFromClient(ev.clientX, ev.clientY, root);
        if (kind === "move") {
          const dx = nx - startNx;
          const dy = ny - startNy;
          onPatch(placementId, {
            rel: clampRel({
              x: startRel.x + dx,
              y: startRel.y + dy,
              w: startRel.w,
              h: startRel.h,
            }),
          });
          return;
        }
        if (kind === "resize-se") {
          onPatch(placementId, {
            rel: clampRel({
              x: startRel.x,
              y: startRel.y,
              w: nx - startRel.x,
              h: ny - startRel.y,
            }),
          });
          return;
        }
        if (kind === "resize-nw") {
          const brx = startRel.x + startRel.w;
          const bry = startRel.y + startRel.h;
          onPatch(placementId, {
            rel: clampRel({
              x: nx,
              y: ny,
              w: brx - nx,
              h: bry - ny,
            }),
          });
          return;
        }
        if (kind === "resize-ne") {
          const swx = startRel.x;
          const swy = startRel.y + startRel.h;
          onPatch(placementId, {
            rel: clampRel({
              x: swx,
              y: ny,
              w: nx - swx,
              h: swy - ny,
            }),
          });
          return;
        }
        if (kind === "resize-sw") {
          const nex = startRel.x + startRel.w;
          const ney = startRel.y;
          onPatch(placementId, {
            rel: clampRel({
              x: nx,
              y: ney,
              w: nex - nx,
              h: ny - ney,
            }),
          });
        }
      };
      let finished = false;
      const cleanup = () => {
        if (finished) return;
        finished = true;
        if (captureTarget?.releasePointerCapture) {
          try {
            captureTarget.releasePointerCapture(pointerId);
          } catch {
            /* noop */
          }
        }
        window.removeEventListener("pointermove", onMove, POINTER_CAPTURE_OPTS);
        window.removeEventListener("pointerup", onUp, POINTER_CAPTURE_OPTS);
        window.removeEventListener("pointercancel", onUp, POINTER_CAPTURE_OPTS);
        captureTarget?.removeEventListener("lostpointercapture", onLostCapture);
      };
      const onUp = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        cleanup();
      };
      const onLostCapture = (ev: Event) => {
        const pe = ev as PointerEvent;
        if (pe.pointerId !== pointerId) return;
        cleanup();
      };
      window.addEventListener("pointermove", onMove, POINTER_CAPTURE_OPTS);
      window.addEventListener("pointerup", onUp, POINTER_CAPTURE_OPTS);
      window.addEventListener("pointercancel", onUp, POINTER_CAPTURE_OPTS);
      captureTarget?.addEventListener("lostpointercapture", onLostCapture);
    },
    [normFromClient, onPatch],
  );

  const showEditor = uiMode === "edit";

  const onVideoBodyPointerDown = useCallback(
    (e: React.PointerEvent, t: PresenterImageTarget, pl: PresenterImageVideoPlacement) => {
      if (!showEditor) return;
      if (
        videoTransformHandlesObjectId !== undefined &&
        videoTransformHandlesObjectId !== t.id
      ) {
        return;
      }
      e.stopPropagation();
      const sx = e.clientX;
      const sy = e.clientY;
      let dragStarted = false;
      const pid = e.pointerId;
      /** Captura en pointerdown para poder seguir el arrastre fuera del marco (foreignObject). */
      const captureTarget = e.currentTarget instanceof HTMLElement ? e.currentTarget : null;
      if (captureTarget?.setPointerCapture) {
        try {
          captureTarget.setPointerCapture(pid);
        } catch {
          /* noop */
        }
      }
      const mods: PickMods = { ctrlKey: e.ctrlKey, metaKey: e.metaKey };
      const threshold2 = VIDEO_DRAG_THRESHOLD_PX * VIDEO_DRAG_THRESHOLD_PX;

      const onMove = (ev: PointerEvent) => {
        if (ev.pointerId !== pid) return;
        const dx = ev.clientX - sx;
        const dy = ev.clientY - sy;
        if (!dragStarted && dx * dx + dy * dy > threshold2) {
          dragStarted = true;
          window.removeEventListener("pointermove", onMove, POINTER_CAPTURE_OPTS);
          window.removeEventListener("pointerup", onUp, POINTER_CAPTURE_OPTS);
          window.removeEventListener("pointercancel", onUp, POINTER_CAPTURE_OPTS);
          const root = document.getElementById(`pvid-root-${t.id}`) as HTMLDivElement | null;
          if (root) {
            bindDrag(root, "move", pl.id, { ...pl.rel }, ev.clientX, ev.clientY, pid, captureTarget);
          }
        }
      };

      const onUp = (ev: PointerEvent) => {
        if (ev.pointerId !== pid) return;
        if (captureTarget?.releasePointerCapture) {
          try {
            captureTarget.releasePointerCapture(pid);
          } catch {
            /* noop */
          }
        }
        window.removeEventListener("pointermove", onMove, POINTER_CAPTURE_OPTS);
        window.removeEventListener("pointerup", onUp, POINTER_CAPTURE_OPTS);
        window.removeEventListener("pointercancel", onUp, POINTER_CAPTURE_OPTS);
        if (!dragStarted && onPickPresenterTarget) {
          onPickPresenterTarget(t.pickKey, mods);
        }
      };

      window.addEventListener("pointermove", onMove, POINTER_CAPTURE_OPTS);
      window.addEventListener("pointerup", onUp, POINTER_CAPTURE_OPTS);
      window.addEventListener("pointercancel", onUp, POINTER_CAPTURE_OPTS);
    },
    [bindDrag, onPickPresenterTarget, showEditor, videoTransformHandlesObjectId],
  );

  const fileInputPortal =
    fileInputMounted && typeof document !== "undefined"
      ? createPortal(
          <input
            ref={fileRef}
            type="file"
            accept="video/*"
            className="hidden"
            aria-hidden
            onChange={onPickFile}
          />,
          document.body,
        )
      : null;

  const geminiIntentModalPortal =
    fileInputMounted && typeof document !== "undefined" && geminiModal
      ? createPortal(
          <div
            className={presenterModalOverlayClass}
            role="dialog"
            aria-modal="true"
            aria-labelledby="presenter-gemini-intent-title"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget && !intentLoading) setGeminiModal(null);
            }}
          >
            <button
              type="button"
              className={presenterModalBackdropClass}
              aria-label="Cerrar"
              disabled={intentLoading}
              onClick={() => {
                if (!intentLoading) setGeminiModal(null);
              }}
            />
            <div {...presenterModalPanelProps()} onMouseDown={(e) => e.stopPropagation()}>
              <div className="flex h-10 shrink-0 items-center justify-between border-b border-white/[0.08] bg-white/[0.04] px-3">
                <h2
                  id="presenter-gemini-intent-title"
                  className="text-[10px] font-black uppercase tracking-[0.12em] text-white/90"
                >
                  Generar video
                </h2>
                <button
                  type="button"
                  disabled={intentLoading}
                  onClick={() => setGeminiModal(null)}
                  className="flex h-8 w-8 items-center justify-center text-zinc-400 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-40"
                  aria-label="Cerrar"
                >
                  ×
                </button>
              </div>
              <div className="px-3 py-3">
                <p className="mb-3 text-[11px] leading-snug text-zinc-400">
                  ¿Qué quieres que ocurra en el vídeo? Se crearán en el lienzo un prompt, la imagen y el Video
                  Generator conectados y se abrirá su studio.
                </p>
                <textarea
                  value={intentText}
                  onChange={(e) => {
                    setIntentText(e.target.value);
                    if (intentError) setIntentError(null);
                  }}
                  disabled={intentLoading}
                  rows={4}
                  placeholder="Ej.: cámara lenta acercándose, gente moviéndose al fondo, luz dorada de atardecer…"
                  className="mb-2 w-full resize-y rounded-none border border-white/10 bg-black/30 px-3 py-2 text-[12px] text-zinc-100 placeholder:text-zinc-600 focus:border-[#f5b91b]/55 focus:outline-none disabled:opacity-50"
                />
                {intentError ? (
                  <p className="mb-2 text-[10px] text-rose-300" role="alert">
                    {intentError}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-stretch border-t border-white/[0.08] bg-[#0a0c0f]">
                <button
                  type="button"
                  disabled={intentLoading}
                  onClick={() => {
                    if (!intentLoading) setGeminiModal(null);
                  }}
                  className={`${PRESENTER_MODAL_BTN_SECONDARY} flex-1 border-0 border-r border-white/10`}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={intentLoading}
                  onClick={() => void submitGeminiIntent()}
                  className={`${PRESENTER_MODAL_BTN_PRIMARY} flex-[1.4]`}
                >
                  {intentLoading ? "Generando prompt…" : "Crear en el lienzo"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      {fileInputPortal}
      {geminiIntentModalPortal}
      {targets.map((t) => {
        const pl = placementFor(t.id);
        const busy = uploadingKey === `${pageId}::${t.id}`;
        const o = canvasObjects.find((x) => x.id === t.id);
        const clipShape = o ? renderPresenterVideoClipShapeWorld(o) : null;
        const clipId = `pvclip-${pageId}-${t.id}`.replace(/[^a-zA-Z0-9_-]/g, "_");
        /** Handles / arrastre / quitar: solo con el ancla seleccionado. */
        const canEditVideoTransform =
          showEditor &&
          (videoTransformHandlesObjectId === undefined || videoTransformHandlesObjectId === t.id);
        const isTargetSelected = highlightPickKeys?.includes(t.pickKey) ?? false;
        const showVideoActions = showEditor && !pl?.videoUrl && isTargetSelected;

        const inner = (
          <g transform={t.transform}>
            <foreignObject
              x={t.x}
              y={t.y}
              width={t.width}
              height={t.height}
              pointerEvents="none"
              style={{ overflow: "visible", pointerEvents: "none" }}
            >
              <div
                id={`pvid-root-${t.id}`}
                className="relative h-full w-full overflow-visible"
                style={{ margin: 0, pointerEvents: "none" }}
              >
                {showVideoActions && (
                  <>
                    {/*
                      El lienzo SVG recibe la selección para animaciones: todo el foreignObject es pointer-events:none
                      salvo la barra de acciones (pointer-events:auto). Clic fuera atraviesa al objeto imagen.
                    */}
                    <div className="pointer-events-none absolute inset-x-0 top-0 z-10">
                      <div className="pointer-events-auto flex overflow-hidden border-b border-black/40 bg-[#12141a]/95 shadow-[0_6px_20px_rgba(0,0,0,0.45)] backdrop-blur-sm">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={(e) => {
                            e.stopPropagation();
                            startUpload(t.id);
                          }}
                          onPointerDownCapture={(e) => e.stopPropagation()}
                          className="flex min-h-[28px] flex-1 items-center justify-center px-2 py-1 text-[10px] font-semibold leading-tight text-white transition-colors hover:bg-[#f5b91b]/25 disabled:opacity-50"
                        >
                          {busy ? "Procesando…" : "Colocar video"}
                        </button>
                        <button
                          type="button"
                          disabled={!t.imageUrl}
                          title={
                            t.imageUrl
                              ? "Crea en el lienzo Prompt + Carousel + Video Generator con esta imagen"
                              : "Sin URL de imagen disponible"
                          }
                          onClick={(e) => {
                            e.stopPropagation();
                            if (t.imageUrl) openGeminiIntentModal(t.imageUrl);
                          }}
                          onPointerDownCapture={(e) => e.stopPropagation()}
                          className="flex min-h-[28px] flex-1 items-center justify-center border-l border-white/12 px-2 py-1 text-[10px] font-semibold leading-tight text-[#f5b91b] transition-colors hover:bg-[#f5b91b]/15 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Generar video
                        </button>
                      </div>
                    </div>
                  </>
                )}
                {pl?.videoUrl && (
                  <PresenterPlacedVideoBlock
                    t={t}
                    pl={pl}
                    showTransformChrome={canEditVideoTransform}
                    onVideoBodyPointerDown={onVideoBodyPointerDown}
                    bindDrag={bindDrag}
                    onRemove={onRemove}
                  />
                )}
              </div>
            </foreignObject>
          </g>
        );

        return (
          <Fragment key={`pvid-${t.id}`}>
            {clipShape ? (
              <>
                <defs>
                  <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
                    {clipShape}
                  </clipPath>
                </defs>
                <g clipPath={`url(#${clipId})`}>{inner}</g>
              </>
            ) : (
              inner
            )}
          </Fragment>
        );
      })}
    </>
  );
}
