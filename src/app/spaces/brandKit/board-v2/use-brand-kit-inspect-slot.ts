"use client";

import React from "react";
import type { BrandKitDocument } from "@/lib/brandkit/brand-kit-types";
import type { SlotId } from "@/lib/brandkit/brand-kit-types";
import type { BrandKitInspectorTab } from "@/lib/brandkit/studio/brand-kit-studio-mode";
import { useBrandKitMosaicBoard } from "./brand-kit-mosaic-context";
import { buildFallbackSlotDetailPayload } from "./brand-kit-slot-detail-payload";

export function useInspectSlot(doc: BrandKitDocument) {
  const board = useBrandKitMosaicBoard();

  return React.useCallback(
    (slotId: SlotId, tab?: BrandKitInspectorTab) => {
      if (!board || board.studioMode !== "edit") return;
      const payload = board.getSlotDetail(slotId) ?? buildFallbackSlotDetailPayload(doc, slotId);
      if (!payload) return;
      board.openInspector(payload, tab ?? board.inspectorTab);
    },
    [board, doc],
  );
}

export function useSelectAndInspectSlot(doc: BrandKitDocument) {
  const board = useBrandKitMosaicBoard();
  const inspectSlot = useInspectSlot(doc);

  return React.useCallback(
    (slotId: SlotId, tab?: BrandKitInspectorTab) => {
      if (!board || board.studioMode !== "edit") return;
      board.selectSlot(slotId);
      inspectSlot(slotId, tab);
    },
    [board, inspectSlot],
  );
}
