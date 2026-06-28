"use client";

import React from "react";

export type FreehandStudioStatusBarProps = {
  flushChrome: boolean;
  objectCount: number;
  selectedCount: number;
  isolationDepth: number;
};

export function FreehandStudioStatusBar({
  flushChrome,
  objectCount,
  selectedCount,
  isolationDepth,
}: FreehandStudioStatusBarProps) {
  return (
    <div
      className={`flex shrink-0 border-t border-white/[0.08] ${
        flushChrome ? "h-10 items-center bg-white/[0.04] px-3" : "flex-col gap-1.5 px-3 py-2"
      }`}
    >
      <div className="flex w-full items-center justify-between text-[9px] text-zinc-500">
        <span className={flushChrome ? "font-black uppercase tracking-[0.1em] text-white/45" : ""}>
          {objectCount} objects · {selectedCount} selected
          {isolationDepth > 0 ? ` · Isolation (depth ${isolationDepth})` : ""}
        </span>
      </div>
    </div>
  );
}
