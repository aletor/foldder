"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BrandKitDocument, SlotId } from "@/lib/brandkit/brand-kit-types";
import { brandKitBoardActionItems } from "@/lib/brandkit/brand-kit-board-status";
import { buildBrandKitReviewQueue } from "@/lib/brandkit/brand-kit-review-queue";
import { scrollToBrandKitBoardSlot } from "./brand-kit-board-scroll";

export type BrandKitReviewModeStats = {
  decided: number;
  skipped: number;
};

export function useBrandKitReviewMode(
  doc: BrandKitDocument,
  active: boolean,
  onComplete: (stats: BrandKitReviewModeStats) => void,
) {
  const [skipped, setSkipped] = useState<Set<SlotId>>(() => new Set());
  const [index, setIndex] = useState(0);
  const decidedRef = useRef(0);
  const prevPendingRef = useRef<SlotId[]>([]);
  const wasActiveRef = useRef(false);
  const completedRef = useRef(false);

  const queue = useMemo(() => buildBrandKitReviewQueue(doc, skipped), [doc, skipped]);
  const safeIndex = queue.length ? Math.min(index, queue.length - 1) : 0;
  const current = queue[safeIndex] ?? null;

  const reset = useCallback(() => {
    setSkipped(new Set());
    setIndex(0);
    decidedRef.current = 0;
    prevPendingRef.current = [];
  }, []);

  useEffect(() => {
    if (active && !wasActiveRef.current) {
      reset();
      completedRef.current = false;
    }
    if (!active) completedRef.current = false;
    wasActiveRef.current = active;
  }, [active, reset]);

  useEffect(() => {
    if (!active || !current) return;
    scrollToBrandKitBoardSlot(current.slotId);
  }, [active, current?.slotId]);

  useEffect(() => {
    if (!active) return;

    const pending = brandKitBoardActionItems(doc).map((item) => item.slotId);
    const resolvedIds = prevPendingRef.current.filter(
      (slotId) => !pending.includes(slotId) && !skipped.has(slotId),
    );
    if (resolvedIds.length > 0) {
      decidedRef.current += resolvedIds.length;
    }
    prevPendingRef.current = pending;

    if (queue.length === 0 && !completedRef.current) {
      completedRef.current = true;
      onComplete({ decided: decidedRef.current, skipped: skipped.size });
    }
  }, [active, doc, queue.length, onComplete, skipped]);

  const skip = useCallback(() => {
    if (!current) return;
    setSkipped((prev) => {
      const next = new Set(prev);
      next.add(current.slotId);
      return next;
    });
    setIndex((value) => value + 1);
  }, [current]);

  const exit = useCallback(() => {
    onComplete({ decided: decidedRef.current, skipped: skipped.size });
  }, [onComplete, skipped.size]);

  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        exit();
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        skip();
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setIndex((value) => Math.max(0, value - 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, exit, skip]);

  return {
    queue,
    current,
    index: safeIndex,
    skip,
    exit,
  };
}
