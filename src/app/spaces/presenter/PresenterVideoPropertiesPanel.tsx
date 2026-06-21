"use client";

import React, { useCallback, useState } from "react";
import type { ContentAlignment, ImageFittingMode } from "../indesign/image-frame-model";
import { ImageFrameFittingGlyph } from "../freehand/ImageFrameFittingGlyph";
import type { PresenterImageTarget } from "./presenter-image-video-collect";
import {
  DEFAULT_PRESENTER_VIDEO_REL,
  type PresenterImageVideoPlacement,
} from "./presenter-image-video-types";
import { loadVideoDimensions, relFrameToContent } from "./presenter-video-frame-layout";
import { PresenterScrubNumberInput } from "./PresenterScrubNumberInput";

function Toggle({
  on,
  onChange,
  disabled,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
        on ? "bg-violet-600" : "bg-zinc-600"
      } ${disabled ? "opacity-40" : ""}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
          on ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </button>
  );
}

function formatTime(sec: number): string {
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, "0")}`;
}

const IMG_FIT_OPTIONS: { value: ImageFittingMode; label: string }[] = [
  { value: "fit-proportional", label: "Ajustar contenido proporcionalmente" },
  { value: "fill-proportional", label: "Rellenar caja proporcionalmente" },
  { value: "fit-stretch", label: "Ajustar contenido a la caja" },
  { value: "center-content", label: "Centrar contenido (sin escalar)" },
  { value: "fill-stretch", label: "Rellenar sin proporción" },
  { value: "frame-to-content", label: "Ajustar caja al contenido" },
];

const ALIGN_GRID: { value: ContentAlignment; row: number; col: number }[] = [
  { value: "top-left", row: 0, col: 0 },
  { value: "top-center", row: 0, col: 1 },
  { value: "top-right", row: 0, col: 2 },
  { value: "middle-left", row: 1, col: 0 },
  { value: "center", row: 1, col: 1 },
  { value: "middle-right", row: 1, col: 2 },
  { value: "bottom-left", row: 2, col: 0 },
  { value: "bottom-center", row: 2, col: 1 },
  { value: "bottom-right", row: 2, col: 2 },
];

type PatchKey =
  | "autoplay"
  | "loop"
  | "mute"
  | "posterTimeSec"
  | "rel"
  | "videoFittingMode"
  | "videoContentAlignment";

type Props = {
  placement: PresenterImageVideoPlacement | null;
  /** Imagen del lienzo donde está anclado el vídeo (para «caja al contenido» y proporción del marco). */
  imageTarget: PresenterImageTarget | null;
  onPatch: (id: string, patch: Partial<Pick<PresenterImageVideoPlacement, PatchKey>>) => void;
};

export function PresenterVideoPropertiesPanel({ placement, imageTarget, onPatch }: Props) {
  const [fittingBusy, setFittingBusy] = useState(false);

  const applyFitting = useCallback(
    async (mode: ImageFittingMode) => {
      if (!placement?.videoUrl) return;
      const id = placement.id;
      const full = { ...DEFAULT_PRESENTER_VIDEO_REL };

      if (mode === "frame-to-content") {
        if (!imageTarget || imageTarget.width <= 0 || imageTarget.height <= 0) {
          onPatch(id, { videoFittingMode: mode });
          return;
        }
        setFittingBusy(true);
        try {
          const { width: vw, height: vh } = await loadVideoDimensions(placement.videoUrl);
          const rel = relFrameToContent(vw, vh, imageTarget.width, imageTarget.height);
          onPatch(id, { videoFittingMode: mode, rel });
        } catch {
          onPatch(id, { videoFittingMode: mode });
        } finally {
          setFittingBusy(false);
        }
        return;
      }

      if (
        mode === "fill-proportional" ||
        mode === "fit-proportional" ||
        mode === "fit-stretch" ||
        mode === "fill-stretch" ||
        mode === "center-content"
      ) {
        onPatch(id, { videoFittingMode: mode, rel: { ...full } });
        return;
      }

      onPatch(id, { videoFittingMode: mode });
    },
    [placement, imageTarget, onPatch],
  );

  if (!placement?.videoUrl) {
    return (
      <aside className="flex w-[min(100%,280px)] shrink-0 flex-col border-l border-white/[0.08] bg-[#0a0c0f] shadow-none md:w-[280px]">
        <div className="border-b border-white/[0.08] px-2 py-1.5">
          <h2 className="text-[11px] font-bold tracking-tight text-white">Propiedades</h2>
        </div>
        <p className="px-2.5 py-4 text-center text-[10px] leading-snug text-zinc-500">
          Selecciona una imagen en el lienzo y usa <span className="font-semibold text-zinc-400">Colocar video</span>{" "}
          en el overlay del canvas. Luego podrás ajustar reproducción y miniatura aquí.
        </p>
      </aside>
    );
  }

  const autoplay = placement.autoplay !== false;
  const loop = Boolean(placement.loop);
  const mute = Boolean(placement.mute);
  const posterTimeSec =
    typeof placement.posterTimeSec === "number" && !Number.isNaN(placement.posterTimeSec)
      ? Math.max(0, placement.posterTimeSec)
      : 0;
  const fitting = placement.videoFittingMode ?? "fill-proportional";
  const alignment = placement.videoContentAlignment ?? "center";

  return (
    <aside className="flex w-[min(100%,280px)] shrink-0 flex-col border-l border-white/[0.08] bg-[#0a0c0f] shadow-none md:w-[280px]">
      <div className="border-b border-white/[0.08] px-2 py-1.5">
        <h2 className="text-[11px] font-bold tracking-tight text-white">Propiedades</h2>
        <p className="mt-0.5 truncate text-[9px] text-zinc-500">Vídeo en imagen</p>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-2.5 py-3">
        <section className="rounded-md border border-amber-500/25 bg-amber-500/[0.07] px-2 py-2">
          <h3 className="text-[10px] font-bold uppercase tracking-wide text-amber-200/90">Marco de vídeo</h3>
          <p className="mt-1 text-[9px] leading-snug text-amber-100/70">
            Mismo criterio que el marco de imagen en Designer: ajuste, alineación del recorte y esquinas en el lienzo.
          </p>
          <div className="mt-2 space-y-1">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Ajuste (fitting)</span>
            <div className="grid grid-cols-3 gap-1.5">
              {IMG_FIT_OPTIONS.map((o) => {
                const active = fitting === o.value;
                return (
                  <button
                    key={`${o.value}-${o.label}`}
                    type="button"
                    title={o.label}
                    aria-label={o.label}
                    aria-pressed={active}
                    disabled={fittingBusy}
                    onClick={() => void applyFitting(o.value)}
                    className={`flex h-8 items-center justify-center rounded-[6px] border transition ${
                      active
                        ? "border-violet-400/50 bg-violet-500/25 text-violet-200"
                        : "border-white/[0.08] bg-white/[0.04] text-zinc-400 hover:bg-white/[0.08] hover:text-zinc-200"
                    } ${fittingBusy ? "opacity-50" : ""}`}
                  >
                    <ImageFrameFittingGlyph mode={o.value} />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-3 space-y-1">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Alinear recorte</span>
            <div
              className="grid w-[72px] grid-cols-3 gap-1 rounded-md border border-white/[0.08] bg-black/20 p-1"
              role="group"
              aria-label="Alineación del vídeo en el encuadre"
            >
              {ALIGN_GRID.map((cell) => {
                const active = alignment === cell.value;
                return (
                  <button
                    key={cell.value}
                    type="button"
                    title={cell.value.replace(/-/g, " ")}
                    aria-label={cell.value}
                    aria-pressed={active}
                    className={`flex h-5 items-center justify-center rounded-sm border transition ${
                      active
                        ? "border-amber-400/70 bg-amber-500/35 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.4)]"
                        : "border-transparent bg-white/[0.06] hover:bg-white/10"
                    }`}
                    onClick={() => onPatch(placement.id, { videoContentAlignment: cell.value })}
                  >
                    <span className="block h-1.5 w-1.5 rounded-full bg-zinc-200" />
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wide text-zinc-400">Playback</h3>
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-zinc-300">Autoplay</span>
              <Toggle on={autoplay} onChange={(v) => onPatch(placement.id, { autoplay: v })} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-zinc-300">Loop</span>
              <Toggle on={loop} onChange={(v) => onPatch(placement.id, { loop: v })} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-zinc-300">Mute</span>
              <Toggle on={mute} onChange={(v) => onPatch(placement.id, { mute: v })} />
            </div>
          </div>
        </section>

        <div className="border-t border-white/[0.06]" />

        <section>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">Thumbnail</h3>
            <span className="text-[10px] tabular-nums text-zinc-500">{formatTime(posterTimeSec)}</span>
          </div>
          <p className="mb-2 text-[9px] leading-snug text-zinc-500">
            Fotograma mostrado con el vídeo en pausa (sin autoplay) antes de reproducir.
          </p>
          <label className="block text-[9px] font-semibold uppercase tracking-wide text-zinc-500">
            Segundo del fotograma
          </label>
          <PresenterScrubNumberInput
            className="mt-1"
            value={posterTimeSec}
            min={0}
            step={0.01}
            roundFn={(n) => Math.round(Math.max(0, n) * 100) / 100}
            title="Segundos del fotograma · Arrastra horizontalmente · Mayús = ×10"
            onKeyboardCommit={(n) => {
              const v = Number.isFinite(n) ? Math.max(0, n) : 0;
              onPatch(placement.id, { posterTimeSec: v });
            }}
            onScrubLive={(n) => {
              const v = Number.isFinite(n) ? Math.max(0, n) : 0;
              onPatch(placement.id, { posterTimeSec: v });
            }}
            onScrubEnd={() => {}}
          />
        </section>
      </div>
    </aside>
  );
}
