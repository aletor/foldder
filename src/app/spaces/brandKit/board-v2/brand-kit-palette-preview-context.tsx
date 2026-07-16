"use client";

import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { PaletteValue } from "@/lib/brandkit/brand-kit-types";

type BrandKitPalettePreviewContextValue = {
  previewPalette: PaletteValue | null;
  setPreviewPalette: (palette: PaletteValue | null) => void;
};

const BrandKitPalettePreviewContext = createContext<BrandKitPalettePreviewContextValue | null>(null);

export function BrandKitPalettePreviewProvider({ children }: { children: React.ReactNode }) {
  const [previewPalette, setPreviewPaletteState] = useState<PaletteValue | null>(null);
  const setPreviewPalette = useCallback((palette: PaletteValue | null) => {
    setPreviewPaletteState(palette);
  }, []);

  const value = useMemo(
    () => ({ previewPalette, setPreviewPalette }),
    [previewPalette, setPreviewPalette],
  );

  return (
    <BrandKitPalettePreviewContext.Provider value={value}>{children}</BrandKitPalettePreviewContext.Provider>
  );
}

export function useBrandKitPalettePreview() {
  return useContext(BrandKitPalettePreviewContext);
}
