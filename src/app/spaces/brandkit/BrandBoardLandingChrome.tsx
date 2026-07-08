"use client";

import React, { useEffect, useRef, useState } from "react";
import { ChevronRight, MoreHorizontal, X } from "lucide-react";
import { isLegacyAtmosphereEntryEnabled } from "@/lib/brandkit/brand-board-flags";
import type { BrainPrimarySectionTab } from "@/app/spaces/brain/BrainStudioChrome";
import { useBrandKit } from "./BrandKitProvider";

export type BrandBoardDepthTarget =
  | BrainPrimarySectionTab
  | "pending-review";

export type BrandBoardLandingChromeProps = {
  projectName: string;
  onClose: () => void;
  onOpenDepth: (target: BrandBoardDepthTarget) => void;
  reviewPending?: number;
  reviewConflicts?: number;
  pendingLearningsCount?: number;
};

export function BrandBoardLandingChromeBridge({
  projectName,
  onClose,
  onOpenDepth,
  pendingLearningsCount = 0,
}: Omit<BrandBoardLandingChromeProps, "reviewPending" | "reviewConflicts">) {
  const { view } = useBrandKit();
  return (
    <BrandBoardLandingChrome
      projectName={projectName}
      onClose={onClose}
      onOpenDepth={onOpenDepth}
      pendingLearningsCount={pendingLearningsCount}
      reviewPending={view.review.pending}
      reviewConflicts={view.review.conflicts}
    />
  );
}

export function BrandBoardLandingChrome({
  projectName,
  onClose,
  onOpenDepth,
  reviewPending = 0,
  reviewConflicts = 0,
  pendingLearningsCount = 0,
}: BrandBoardLandingChromeProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [menuOpen]);

  const boardReviewCount = reviewPending + reviewConflicts;
  const menuItems: Array<{ id: BrandBoardDepthTarget; label: string; hidden?: boolean }> = [
    { id: "sources", label: "Fuentes y evidencia" },
    { id: "dna", label: "ADN completo" },
    { id: "looks", label: "Looks" },
    {
      id: "review",
      label:
        pendingLearningsCount > 0
          ? `Aprendizajes (${pendingLearningsCount})`
          : "Aprendizajes",
    },
    { id: "diagnostics", label: "Diagnóstico" },
    { id: "overview", label: "Atmósfera", hidden: !isLegacyAtmosphereEntryEnabled() },
    { id: "pending-review", label: `${boardReviewCount} por revisar`, hidden: boardReviewCount <= 0 },
  ];

  return (
    <header
      className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-[#0b0f14] px-4"
      data-testid="brand-board-landing-header"
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--foldder-studio-accent,#5E8E70)]/20 text-[11px] font-black text-[var(--foldder-studio-accent,#5E8E70)]"
          aria-hidden
        >
          ◉
        </span>
        <p className="truncate text-[11px] font-black uppercase tracking-[0.12em] text-white/88">
          BrandKit · <span className="text-white/62">{projectName}</span>
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            data-testid="brand-board-more-menu"
            onClick={() => setMenuOpen((open) => !open)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-white/12 bg-white/[0.06] text-white/78 hover:bg-white/10"
            title="Más opciones"
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden />
          </button>
          {menuOpen ? (
            <div
              role="menu"
              className="absolute right-0 z-30 mt-1 min-w-[220px] rounded-[10px] border border-white/12 bg-[#121820] py-1 shadow-xl"
            >
              {menuItems
                .filter((item) => !item.hidden)
                .map((item, index) => {
                  const showSeparator = item.id === "pending-review" && index > 0;
                  return (
                    <React.Fragment key={item.id}>
                      {showSeparator ? <div className="my-1 border-t border-white/10" aria-hidden /> : null}
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMenuOpen(false);
                          onOpenDepth(item.id);
                        }}
                        className="flex w-full items-center justify-between px-3 py-2.5 text-left text-[12px] font-semibold text-white/86 hover:bg-white/[0.06]"
                      >
                        {item.label}
                        <ChevronRight className="h-3.5 w-3.5 text-white/35" aria-hidden />
                      </button>
                    </React.Fragment>
                  );
                })}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar BrandKit"
          className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-white/12 bg-white/[0.06] text-white/78 hover:bg-white/10"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </header>
  );
}
