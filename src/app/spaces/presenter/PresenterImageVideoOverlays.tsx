"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { v4 as uuidv4 } from "uuid";
import type { PresenterImageTarget } from "./presenter-image-video-collect";
import {
  DEFAULT_PRESENTER_VIDEO_REL,
  FOLDDER_OPEN_GEMINI_VIDEO_WITH_IMAGE_EVENT,
  type FoldderOpenGeminiVideoDetail,
  type PresenterImageVideoPlacement,
  type PresenterImageVideoRel,
} from "./presenter-image-video-types";

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function clampRel(r: PresenterImageVideoRel): PresenterImageVideoRel {
  const minS = 0.06;
  let { x, y, w, h } = r;
  w = Math.max(minS, Math.min(1, w));
  h = Math.max(minS, Math.min(1, h));
  x = clamp01(x);
  y = clamp01(y);
  if (x + w > 1) x = 1 - w;
  if (y + h > 1) y = 1 - h;
  if (x < 0) x = 0;
  if (y < 0) y = 0;
  return { x, y, w, h };
}

type PickMods = { ctrlKey: boolean; metaKey: boolean };

type Props = {
  pageId: string;
  targets: PresenterImageTarget[];
  placements: PresenterImageVideoPlacement[];
  uiMode: "edit" | "playback";
  uploadingKey: string | null;
  onUploadBusy: (key: string | null) => void;
  onUpsert: (p: PresenterImageVideoPlacement) => void;
  onPatch: (id: string, patch: Partial<Pick<PresenterImageVideoPlacement, "rel">>) => void;
  onRemove: (id: string) => void;
  /** Clic sobre el vídeo (sin arrastrar) delega la misma selección que el objeto imagen bajo el overlay. */
  onPickPresenterTarget?: (pickKey: string, mods: PickMods) => void;
};

type DragKind = "move" | "resize-se" | "resize-nw";

/** Por debajo de esto se considera «clic» para seleccionar animación; por encima, arrastre del vídeo. */
const VIDEO_DRAG_THRESHOLD_PX = 5;

export function PresenterImageVideoOverlays({
  pageId,
  targets,
  placements,
  uiMode,
  uploadingKey,
  onUploadBusy,
  onUpsert,
  onPatch,
  onRemove,
  onPickPresenterTarget,
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
    setGeminiModal({ imageUrl: imageUrl.trim() });
  }, []);

  const submitGeminiIntent = useCallback(async () => {
    if (!geminiModal?.imageUrl) return;
    const raw = intentText.trim();
    if (!raw) {
      window.alert("Describe qué quieres que ocurra en el vídeo.");
      return;
    }
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
    } finally {
      setIntentLoading(false);
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent(FOLDDER_OPEN_GEMINI_VIDEO_WITH_IMAGE_EVENT, {
          detail: { imageUrl: geminiModal.imageUrl, videoPrompt } satisfies FoldderOpenGeminiVideoDetail,
        }),
      );
    }
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
    ) => {
      const { nx: startNx, ny: startNy } = normFromClient(startClientX, startClientY, root);
      const onMove = (ev: PointerEvent) => {
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
          const brx = clamp01(nx);
          const bry = clamp01(ny);
          onPatch(placementId, {
            rel: clampRel({
              x: startRel.x,
              y: startRel.y,
              w: brx - startRel.x,
              h: bry - startRel.y,
            }),
          });
          return;
        }
        if (kind === "resize-nw") {
          const tlx = clamp01(nx);
          const tly = clamp01(ny);
          const brx = startRel.x + startRel.w;
          const bry = startRel.y + startRel.h;
          onPatch(placementId, {
            rel: clampRel({
              x: tlx,
              y: tly,
              w: brx - tlx,
              h: bry - tly,
            }),
          });
        }
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [normFromClient, onPatch],
  );

  const showEditor = uiMode === "edit";

  const onVideoBodyPointerDown = useCallback(
    (e: React.PointerEvent, t: PresenterImageTarget, pl: PresenterImageVideoPlacement) => {
      if (!showEditor) return;
      e.stopPropagation();
      const sx = e.clientX;
      const sy = e.clientY;
      let dragStarted = false;
      const pid = e.pointerId;
      const mods: PickMods = { ctrlKey: e.ctrlKey, metaKey: e.metaKey };
      const threshold2 = VIDEO_DRAG_THRESHOLD_PX * VIDEO_DRAG_THRESHOLD_PX;

      const onMove = (ev: PointerEvent) => {
        if (ev.pointerId !== pid) return;
        const dx = ev.clientX - sx;
        const dy = ev.clientY - sy;
        if (!dragStarted && dx * dx + dy * dy > threshold2) {
          dragStarted = true;
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp);
          window.removeEventListener("pointercancel", onUp);
          const root = document.getElementById(`pvid-root-${t.id}`) as HTMLDivElement | null;
          if (root) {
            bindDrag(root, "move", pl.id, { ...pl.rel }, ev.clientX, ev.clientY);
          }
        }
      };

      const onUp = (ev: PointerEvent) => {
        if (ev.pointerId !== pid) return;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        if (!dragStarted && onPickPresenterTarget) {
          onPickPresenterTarget(t.pickKey, mods);
        }
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [bindDrag, onPickPresenterTarget, showEditor],
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
            className="fixed inset-0 z-[100030] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="presenter-gemini-intent-title"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget && !intentLoading) setGeminiModal(null);
            }}
          >
            <div
              className="w-full max-w-md rounded-xl border border-white/15 bg-[#141820] p-4 shadow-2xl shadow-black/50"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <h2 id="presenter-gemini-intent-title" className="mb-1 text-sm font-semibold text-white">
                Generar video con esta imagen
              </h2>
              <p className="mb-3 text-[11px] leading-snug text-zinc-400">
                ¿Qué quieres que ocurra en el vídeo? (Se generará un prompt y se abrirá el Video Generator en modo
                studio con la imagen y el prompt conectados.)
              </p>
              <textarea
                value={intentText}
                onChange={(e) => setIntentText(e.target.value)}
                disabled={intentLoading}
                rows={4}
                placeholder="Ej.: cámara lenta acercándose, gente moviéndose al fondo, luz dorada de atardecer…"
                className="mb-3 w-full resize-y rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-[12px] text-zinc-100 placeholder:text-zinc-600 focus:border-sky-500/50 focus:outline-none disabled:opacity-50"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  disabled={intentLoading}
                  onClick={() => {
                    if (!intentLoading) setGeminiModal(null);
                  }}
                  className="rounded-lg border border-white/15 px-3 py-1.5 text-[11px] font-medium text-zinc-300 hover:bg-white/5 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={intentLoading}
                  onClick={() => void submitGeminiIntent()}
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
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

        return (
          <g key={`pvid-${t.id}`} transform={t.transform}>
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
                className="relative h-full w-full"
                style={{ margin: 0, pointerEvents: "none" }}
              >
                {!pl?.videoUrl && showEditor && (
                  <>
                    {/*
                      El lienzo SVG recibe la selección para animaciones: todo el foreignObject es pointer-events:none
                      salvo la caja de botones (pointer-events:auto). Clic fuera de los botones atraviesa al objeto imagen.
                    */}
                    <div className="pointer-events-none absolute inset-0 flex items-end justify-center pb-1">
                      <div className="pointer-events-auto flex max-w-[min(100%,15rem)] flex-col gap-1 rounded-lg border border-white/10 bg-black/35 p-1 shadow-lg backdrop-blur-md">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={(e) => {
                            e.stopPropagation();
                            startUpload(t.id);
                          }}
                          onPointerDownCapture={(e) => e.stopPropagation()}
                          className="rounded-md border border-white/25 bg-white/15 px-2 py-1 text-[9px] font-semibold text-white transition-colors hover:bg-white/25 disabled:opacity-50"
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
                          className="rounded-md border border-emerald-400/35 bg-emerald-500/20 px-2 py-1 text-[9px] font-semibold text-emerald-50 transition-colors hover:bg-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Generar video con esta imagen
                        </button>
                      </div>
                    </div>
                  </>
                )}
                {pl?.videoUrl && (
                  <>
                    <div
                      className="pointer-events-auto absolute flex items-center justify-center overflow-hidden rounded-[1px] bg-black"
                      style={{
                        left: `${pl.rel.x * 100}%`,
                        top: `${pl.rel.y * 100}%`,
                        width: `${pl.rel.w * 100}%`,
                        height: `${pl.rel.h * 100}%`,
                      }}
                      onPointerDown={(e) => onVideoBodyPointerDown(e, t, pl)}
                    >
                      <video
                        src={pl.videoUrl}
                        className="max-h-full max-w-full object-contain"
                        muted
                        playsInline
                        loop
                        autoPlay
                        controls={false}
                      />
                    </div>
                    {showEditor && (
                      <>
                        <div
                          className="pointer-events-auto absolute z-10 h-3 w-3 cursor-nwse-resize rounded-sm border border-sky-400 bg-white/90 shadow"
                          style={{
                            left: `calc(${(pl.rel.x + pl.rel.w) * 100}% - 6px)`,
                            top: `calc(${(pl.rel.y + pl.rel.h) * 100}% - 6px)`,
                          }}
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            const root = document.getElementById(`pvid-root-${t.id}`) as HTMLDivElement | null;
                            if (!root) return;
                            bindDrag(root, "resize-se", pl.id, { ...pl.rel }, e.clientX, e.clientY);
                          }}
                        />
                        <div
                          className="pointer-events-auto absolute z-10 h-3 w-3 cursor-nwse-resize rounded-sm border border-sky-400 bg-white/90 shadow"
                          style={{
                            left: `calc(${pl.rel.x * 100}% - 6px)`,
                            top: `calc(${pl.rel.y * 100}% - 6px)`,
                          }}
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            const root = document.getElementById(`pvid-root-${t.id}`) as HTMLDivElement | null;
                            if (!root) return;
                            bindDrag(root, "resize-nw", pl.id, { ...pl.rel }, e.clientX, e.clientY);
                          }}
                        />
                        <button
                          type="button"
                          className="pointer-events-auto absolute right-1 top-1 z-20 rounded border border-rose-400/50 bg-rose-500/25 px-1.5 py-0.5 text-[8px] font-bold text-rose-100 backdrop-blur-sm hover:bg-rose-500/40"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemove(pl.id);
                          }}
                        >
                          Quitar
                        </button>
                      </>
                    )}
                  </>
                )}
              </div>
            </foreignObject>
          </g>
        );
      })}
    </>
  );
}
