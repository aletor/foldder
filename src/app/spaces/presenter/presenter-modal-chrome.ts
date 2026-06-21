import type React from "react";

export const PRESENTER_MODAL_ACCENT = "#f5b91b";

export const presenterModalOverlayClass =
  "fixed inset-0 z-[100030] flex items-center justify-center p-4";

export const presenterModalBackdropClass = "absolute inset-0 bg-black/60 backdrop-blur-sm";

export const presenterModalPanelClass =
  "relative z-[1] flex w-full max-w-md max-h-[min(92vh,880px)] flex-col overflow-hidden rounded-none border border-white/[0.08] bg-[#0b0f14] shadow-[0_24px_70px_rgba(0,0,0,0.55)]";

export const presenterModalHeaderClass =
  "flex h-10 shrink-0 items-stretch border-b border-white/[0.08] bg-white/[0.04]";

export const presenterModalFooterClass =
  "flex shrink-0 items-stretch border-t border-white/[0.08] bg-[#0a0c0f]";

export const PRESENTER_MODAL_BTN_PRIMARY =
  "flex h-10 shrink-0 items-center justify-center gap-1.5 bg-[#f5b91b] px-4 text-[10px] font-black uppercase tracking-[0.08em] text-black transition hover:brightness-105 disabled:opacity-45";

export const PRESENTER_MODAL_BTN_SECONDARY =
  "flex h-10 shrink-0 items-center justify-center gap-1 border border-white/10 bg-white/[0.04] px-3 text-[10px] font-black uppercase tracking-[0.08em] text-zinc-300 transition hover:bg-white/[0.08] disabled:opacity-45";

export function presenterModalPanelProps(): {
  "data-foldder-studio-flush": string;
  style: React.CSSProperties;
  className: string;
} {
  return {
    "data-foldder-studio-flush": "",
    style: { ["--foldder-studio-accent" as string]: PRESENTER_MODAL_ACCENT },
    className: presenterModalPanelClass,
  };
}
