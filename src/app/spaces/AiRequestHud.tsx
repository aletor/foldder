"use client";

import {
  getAiRequestOverlaySnapshot,
  subscribeAiRequestOverlay,
} from "@/lib/ai-request-overlay";
import { useSyncExternalStore } from "react";

export function AiRequestHud() {
  const label = useSyncExternalStore(
    subscribeAiRequestOverlay,
    getAiRequestOverlaySnapshot,
    () => null
  );

  if (!label) return null;

  return (
    <div
      className="pointer-events-none max-w-[min(90vw,240px)] text-right font-sans text-[11px] font-semibold leading-tight text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.95),0_0_12px_rgba(0,0,0,0.65)]"
      aria-live="polite"
    >
      Petición IA [{label}]
    </div>
  );
}
