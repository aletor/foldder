import type React from "react";
import { DATASET_STUDIO_ACCENT } from "./DatasetStudioChrome";

export const datasetModalOverlayClass =
  "fixed inset-0 z-[100091] flex items-center justify-center bg-black/60 p-4";

export const datasetModalPanelClass =
  "relative flex w-full max-w-lg max-h-[min(92vh,880px)] flex-col overflow-hidden border border-white/10 bg-[#0b0f14] shadow-[0_24px_70px_rgba(0,0,0,0.55)]";

export const datasetModalHeaderClass =
  "flex shrink-0 flex-col border-b border-white/10 bg-white/[0.04] px-4 py-3";

export const datasetModalFooterClass =
  "flex shrink-0 items-stretch border-t border-white/10 bg-black/30";

export const DATASET_MODAL_BTN_PRIMARY =
  "flex h-10 shrink-0 items-center justify-center gap-1.5 bg-[var(--foldder-studio-accent,#14b8a6)] px-4 text-[10px] font-black uppercase tracking-[0.08em] text-slate-950 transition hover:brightness-110 disabled:opacity-45";

export const DATASET_MODAL_BTN_SECONDARY =
  "flex h-10 shrink-0 items-center justify-center gap-1 border border-white/10 bg-white/[0.04] px-3 text-[10px] font-black uppercase tracking-[0.08em] text-white/72 transition hover:bg-white/[0.08] disabled:opacity-45";

export const DATASET_MODAL_BTN_GHOST =
  "flex h-10 w-full items-center justify-center text-[10px] font-black uppercase tracking-[0.08em] text-white/45 transition hover:text-white/75";

export function datasetModalPanelProps(maxWidthClass = "max-w-lg"): {
  "data-foldder-studio-flush": string;
  "data-foldder-dataset-studio": string;
  style: React.CSSProperties;
  className: string;
} {
  return {
    "data-foldder-studio-flush": "",
    "data-foldder-dataset-studio": "",
    style: { ["--foldder-studio-accent" as string]: DATASET_STUDIO_ACCENT },
    className: `${datasetModalPanelClass.replace("max-w-lg", maxWidthClass)}`,
  };
}
