"use client";

import { useBrandKitMosaicBoard } from "./brand-kit-mosaic-context";

export function useBrandKitPresentationReadOnly(): boolean {
  const board = useBrandKitMosaicBoard();
  return board?.studioMode === "presentation";
}
