"use client";

import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

type BrandKitEvidencePopoverContextValue = {
  openId: string | null;
  open: (id: string) => void;
  close: () => void;
};

const BrandKitEvidencePopoverContext = createContext<BrandKitEvidencePopoverContextValue | null>(null);

export function BrandKitEvidencePopoverProvider({ children }: { children: React.ReactNode }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = useCallback((id: string) => setOpenId(id), []);
  const close = useCallback(() => setOpenId(null), []);
  const value = useMemo(() => ({ openId, open, close }), [openId, open, close]);
  return (
    <BrandKitEvidencePopoverContext.Provider value={value}>{children}</BrandKitEvidencePopoverContext.Provider>
  );
}

export function useBrandKitEvidencePopover() {
  const ctx = useContext(BrandKitEvidencePopoverContext);
  if (!ctx) {
    throw new Error("useBrandKitEvidencePopover must be used within BrandKitEvidencePopoverProvider");
  }
  return ctx;
}
