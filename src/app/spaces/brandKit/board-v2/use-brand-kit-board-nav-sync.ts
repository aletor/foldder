"use client";

import { useEffect } from "react";
import type { SlotId } from "@/lib/brandkit/brand-kit-types";
import { BRAND_KIT_SLOT_IDS } from "@/lib/brandkit/brand-kit-types";
import { useBrandKitMosaicBoard } from "./brand-kit-mosaic-context";

export function useBrandKitBoardNavSync(enabled: boolean) {
  const board = useBrandKitMosaicBoard();

  useEffect(() => {
    if (!enabled || !board) return;

    const root = document.querySelector(".brandKit-studio-split__main");
    if (!root) return;

    const elements = BRAND_KIT_SLOT_IDS.map((slotId) => ({
      slotId,
      el: document.querySelector(`[data-brandkit-slot="${slotId}"]`),
    })).filter((entry): entry is { slotId: SlotId; el: Element } => Boolean(entry.el));

    if (!elements.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        let best: { slotId: SlotId; ratio: number } | null = null;
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const match = elements.find((item) => item.el === entry.target);
          if (!match) continue;
          if (!best || entry.intersectionRatio > best.ratio) {
            best = { slotId: match.slotId, ratio: entry.intersectionRatio };
          }
        }
        if (best && best.ratio >= 0.35) {
          board.setSelectedNavId(best.slotId);
        }
      },
      { root, threshold: [0.35, 0.5, 0.65] },
    );

    for (const { el } of elements) observer.observe(el);
    return () => observer.disconnect();
  }, [board, enabled]);
}
