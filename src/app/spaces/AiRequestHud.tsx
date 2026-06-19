"use client";

import {
  getAiRequestOverlaySnapshot,
  subscribeAiRequestOverlay,
} from "@/lib/ai-request-overlay";
import {
  getAiHudGenerationProgressSnapshot,
  subscribeAiHudGenerationProgress,
} from "@/lib/ai-hud-generation-progress";
import { useSyncExternalStore } from "react";

export function AiRequestHud() {
  const label = useSyncExternalStore(
    subscribeAiRequestOverlay,
    getAiRequestOverlaySnapshot,
    () => null
  );
  const genPct = useSyncExternalStore(
    subscribeAiHudGenerationProgress,
    getAiHudGenerationProgressSnapshot,
    () => null
  );

  /**
   * `genPct` viene del store global (`aiHudNanoBananaJob*`), no solo del nodo montado.
   * La etiqueta del fetch puede faltar un instante; mostramos el HUD si hay % o etiqueta.
   */
  if (!label && genPct == null) return null;

  const pctRounded = genPct != null ? Math.min(100, Math.max(0, Math.round(genPct))) : null;
  const determinate = pctRounded != null;
  const titleLabel = label ?? "Image Creation";

  return (
    <div
      className="pointer-events-none w-[min(92vw,320px)] text-right font-sans text-[11px] font-semibold leading-tight text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.95),0_0_12px_rgba(0,0,0,0.65)]"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="mb-0.5">Petición IA [{titleLabel}]</div>
      <div className="flex items-center justify-end gap-2">
        <div
          className="foldder-ai-request-hud__track mt-0 min-w-0 flex-1"
          role="progressbar"
          aria-label="Petición en curso"
          aria-valuenow={determinate ? pctRounded : undefined}
          aria-valuemin={determinate ? 0 : undefined}
          aria-valuemax={determinate ? 100 : undefined}
          aria-valuetext={determinate ? `${pctRounded}%` : "Procesando"}
        >
          {determinate ? (
            <div
              className="foldder-ai-request-hud__fill foldder-ai-request-hud__fill--determinate"
              style={{ width: `${pctRounded}%` }}
              aria-hidden
            />
          ) : (
            <div className="foldder-ai-request-hud__fill" aria-hidden />
          )}
        </div>
        {determinate ? (
          <span
            className="pointer-events-none shrink-0 rounded-md border border-white/25 bg-black/70 px-2 py-1 font-mono text-[11px] font-medium tabular-nums text-violet-100 shadow-md backdrop-blur-md [text-shadow:none]"
            aria-hidden
          >
            {pctRounded}%
          </span>
        ) : null}
      </div>
    </div>
  );
}
