"use client";

import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

export type MosaicDetailState = {
  title: string;
  content: React.ReactNode;
} | null;

type BrandKitMosaicCellContextValue = {
  setActionSlot: (id: string, node: React.ReactNode | null) => void;
};

const BrandKitMosaicCellContext = createContext<BrandKitMosaicCellContextValue | null>(null);

function MosaicActionBar({ actionMap }: { actionMap: Record<string, React.ReactNode> }) {
  const entries = Object.entries(actionMap);
  if (!entries.length) return null;

  return (
    <div className="brandKit-mosaic-cell__action-bar" role="toolbar" aria-label="Acciones de celda">
      <div className="brandKit-mosaic-action-bar__inner">
        {entries.map(([id, node]) => (
          <React.Fragment key={id}>{node}</React.Fragment>
        ))}
      </div>
    </div>
  );
}

export function BrandKitMosaicCellProvider({ children }: { children: React.ReactNode }) {
  const [actionMap, setActionMap] = useState<Record<string, React.ReactNode>>({});

  const setActionSlot = useCallback((id: string, node: React.ReactNode | null) => {
    setActionMap((prev) => {
      const hasNode = Object.prototype.hasOwnProperty.call(prev, id);
      if (node === null) {
        if (!hasNode) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      }
      if (hasNode && prev[id] === node) return prev;
      return { ...prev, [id]: node };
    });
  }, []);

  const value = useMemo(() => ({ setActionSlot }), [setActionSlot]);

  return (
    <BrandKitMosaicCellContext.Provider value={value}>
      {children}
      <MosaicActionBar actionMap={actionMap} />
    </BrandKitMosaicCellContext.Provider>
  );
}

export function useBrandKitMosaicCellOptional() {
  return useContext(BrandKitMosaicCellContext);
}

type BrandKitMosaicBoardContextValue = {
  openDetailSheet: (payload: MosaicDetailState) => void;
  closeDetailSheet: () => void;
  detailOpen: boolean;
  detailContent: MosaicDetailState;
};

const BrandKitMosaicBoardContext = createContext<BrandKitMosaicBoardContextValue | null>(null);

export function BrandKitMosaicBoardProvider({ children }: { children: React.ReactNode }) {
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailContent, setDetailContent] = useState<MosaicDetailState>(null);

  const openDetailSheet = useCallback((payload: MosaicDetailState) => {
    if (!payload) return;
    setDetailContent(payload);
    setDetailOpen(true);
  }, []);

  const closeDetailSheet = useCallback(() => setDetailOpen(false), []);

  const value = useMemo(
    () => ({
      openDetailSheet,
      closeDetailSheet,
      detailOpen,
      detailContent,
    }),
    [closeDetailSheet, detailContent, detailOpen, openDetailSheet],
  );

  return <BrandKitMosaicBoardContext.Provider value={value}>{children}</BrandKitMosaicBoardContext.Provider>;
}

export function useBrandKitMosaicBoard() {
  return useContext(BrandKitMosaicBoardContext);
}
