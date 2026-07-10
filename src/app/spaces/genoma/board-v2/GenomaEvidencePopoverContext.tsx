"use client";

import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

type GenomaEvidencePopoverContextValue = {
  openId: string | null;
  open: (id: string) => void;
  close: () => void;
};

const GenomaEvidencePopoverContext = createContext<GenomaEvidencePopoverContextValue | null>(null);

export function GenomaEvidencePopoverProvider({ children }: { children: React.ReactNode }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = useCallback((id: string) => setOpenId(id), []);
  const close = useCallback(() => setOpenId(null), []);
  const value = useMemo(() => ({ openId, open, close }), [openId, open, close]);
  return (
    <GenomaEvidencePopoverContext.Provider value={value}>{children}</GenomaEvidencePopoverContext.Provider>
  );
}

export function useGenomaEvidencePopover() {
  const ctx = useContext(GenomaEvidencePopoverContext);
  if (!ctx) {
    throw new Error("useGenomaEvidencePopover must be used within GenomaEvidencePopoverProvider");
  }
  return ctx;
}
