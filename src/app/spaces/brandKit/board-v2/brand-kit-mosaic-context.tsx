"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import type { BrandKitDocument, SlotAction, SlotId } from "@/lib/brandkit/brand-kit-types";
import { buildFallbackSlotDetailPayload } from "./brand-kit-slot-detail-payload";
import type {
  BrandKitBoardSelectionId,
  BrandKitInspectorTab,
  BrandKitStudioMode,
} from "@/lib/brandkit/studio/brand-kit-studio-mode";
import { mapDetailTabToInspectorTab } from "@/lib/brandkit/studio/brand-kit-inspector";

export type MosaicDetailTab = {
  id: string;
  label: string;
  count?: number;
  content: React.ReactNode;
};

export type MosaicInspectorSections = {
  content?: React.ReactNode;
  evidence?: React.ReactNode;
  history?: React.ReactNode;
};

export type MosaicDetailPayload = {
  slotId?: SlotId;
  slotNumber?: string;
  blockLabel: string;
  brandName?: string;
  statusLabel?: string;
  sourceLabel?: string;
  summary?: React.ReactNode;
  tabs: MosaicDetailTab[];
  sections?: MosaicInspectorSections;
  footer?: React.ReactNode;
  initialTabId?: string;
};

/** @deprecated Usar MosaicDetailPayload */
export type MosaicDetailState = MosaicDetailPayload | null;

export type MosaicSurfaceOverride = {
  background: string;
  color: string;
};

export const MOSAIC_CELL_ACTION_PRIMARY = "cell-primary";
export const MOSAIC_CELL_ACTION_SECONDARY = "cell-secondary";
export const MOSAIC_CELL_ACTION_SECONDARY_EXTRA = "cell-secondary-extra";
export const MOSAIC_CELL_ACTION_MENU = "cell-menu";

type BrandKitMosaicCellContextValue = {
  setActionSlot: (id: string, node: React.ReactNode | null) => void;
  setSurfaceOverride: (override: MosaicSurfaceOverride | null) => void;
};

const BrandKitMosaicCellContext = createContext<BrandKitMosaicCellContextValue | null>(null);
const MosaicCellActionMapContext = createContext<Record<string, React.ReactNode>>({});

function MosaicChapterToolbar({ actionMap }: { actionMap: Record<string, React.ReactNode> }) {
  const primary = actionMap[MOSAIC_CELL_ACTION_PRIMARY];
  const secondary = actionMap[MOSAIC_CELL_ACTION_SECONDARY];
  const secondaryExtra = actionMap[MOSAIC_CELL_ACTION_SECONDARY_EXTRA];
  const menu = actionMap[MOSAIC_CELL_ACTION_MENU];
  const legacy = Object.entries(actionMap).filter(
    ([id]) =>
      id !== MOSAIC_CELL_ACTION_PRIMARY &&
      id !== MOSAIC_CELL_ACTION_SECONDARY &&
      id !== MOSAIC_CELL_ACTION_SECONDARY_EXTRA &&
      id !== MOSAIC_CELL_ACTION_MENU,
  );

  if (!primary && !secondary && !secondaryExtra && !menu && !legacy.length) return null;

  return (
    <div className="brandKit-mosaic-cell__chapter-toolbar" role="toolbar" aria-label="Acciones de celda">
      <div className="brandKit-mosaic-cell__action-bar">
        <div className="brandKit-mosaic-action-bar__inner">
          {primary}
          {secondary}
          {secondaryExtra}
          {legacy.map(([id, node]) => (
            <React.Fragment key={id}>{node}</React.Fragment>
          ))}
          {menu}
        </div>
      </div>
    </div>
  );
}

export function BrandKitMosaicCellProvider({
  children,
  chapterToolbar = false,
  onSurfaceOverrideChange,
}: {
  children: React.ReactNode;
  chapterToolbar?: boolean;
  onSurfaceOverrideChange?: (override: MosaicSurfaceOverride | null) => void;
}) {
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

  const setSurfaceOverride = useCallback(
    (override: MosaicSurfaceOverride | null) => {
      onSurfaceOverrideChange?.(override);
    },
    [onSurfaceOverrideChange],
  );

  const value = useMemo(
    () => ({ setActionSlot, setSurfaceOverride }),
    [setActionSlot, setSurfaceOverride],
  );

  return (
    <BrandKitMosaicCellContext.Provider value={value}>
      <MosaicCellActionMapContext.Provider value={actionMap}>
        {children}
        {chapterToolbar ? null : <MosaicChapterToolbar actionMap={actionMap} />}
      </MosaicCellActionMapContext.Provider>
    </BrandKitMosaicCellContext.Provider>
  );
}

export function MosaicCellChapterToolbar() {
  const actionMap = useContext(MosaicCellActionMapContext);
  return <MosaicChapterToolbar actionMap={actionMap} />;
}

export function useBrandKitMosaicCellOptional() {
  return useContext(BrandKitMosaicCellContext);
}

type BrandKitMosaicBoardContextValue = {
  studioMode: BrandKitStudioMode;
  doc?: BrandKitDocument;
  onSlotAction?: (slotId: SlotId, action: SlotAction) => void;
  selectedNavId: BrandKitBoardSelectionId | null;
  selectedSlotId: BrandKitBoardSelectionId | null;
  inspectorTab: BrandKitInspectorTab;
  setInspectorTab: (tab: BrandKitInspectorTab) => void;
  inspectorEditing: boolean;
  setInspectorEditing: (editing: boolean) => void;
  inspectSlot: (
    slotId: SlotId,
    tab?: BrandKitInspectorTab,
    options?: { startEditing?: boolean },
  ) => void;
  selectAndInspectSlot: (
    id: BrandKitBoardSelectionId,
    tab?: BrandKitInspectorTab,
    options?: { startEditing?: boolean },
  ) => void;
  navigateToSlot: (id: BrandKitBoardSelectionId) => void;
  selectSlot: (id: BrandKitBoardSelectionId) => void;
  openInspector: (
    payload: MosaicDetailPayload,
    tab?: BrandKitInspectorTab,
    options?: { startEditing?: boolean },
  ) => void;
  closeInspector: () => void;
  readerOpen: boolean;
  readerSlotId: BrandKitBoardSelectionId | null;
  openReader: (id: BrandKitBoardSelectionId) => void;
  closeReader: () => void;
  /** @deprecated Usar openInspector — solo disponible en modo Edición */
  openDetailSheet: (payload: MosaicDetailPayload) => void;
  closeDetailSheet: () => void;
  detailOpen: boolean;
  detailContent: MosaicDetailPayload | null;
  setSelectedNavId: (id: BrandKitBoardSelectionId | null) => void;
  registerSlotDetail: (slotId: SlotId, payload: MosaicDetailPayload | null) => void;
  getSlotDetail: (slotId: SlotId) => MosaicDetailPayload | undefined;
};

const BrandKitMosaicBoardContext = createContext<BrandKitMosaicBoardContextValue | null>(null);

export function BrandKitMosaicBoardProvider({
  children,
  studioMode,
  doc,
  onSlotAction,
}: {
  children: React.ReactNode;
  studioMode: BrandKitStudioMode;
  doc?: BrandKitDocument;
  onSlotAction?: (slotId: SlotId, action: SlotAction) => void;
}) {
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [detailContent, setDetailContent] = useState<MosaicDetailPayload | null>(null);
  const [inspectorTab, setInspectorTabState] = useState<BrandKitInspectorTab>("synthesis");
  const [inspectorEditing, setInspectorEditingState] = useState(false);
  const [selectedNavId, setSelectedNavIdState] = useState<BrandKitBoardSelectionId | null>(null);
  const [selectedSlotId, setSelectedSlotId] = useState<BrandKitBoardSelectionId | null>(null);
  const [readerOpen, setReaderOpen] = useState(false);
  const [readerSlotId, setReaderSlotId] = useState<BrandKitBoardSelectionId | null>(null);
  const slotDetailsRef = useRef<Partial<Record<SlotId, MosaicDetailPayload>>>({});

  const setSelectedNavId = useCallback((id: BrandKitBoardSelectionId | null) => {
    setSelectedNavIdState((prev) => (prev === id ? prev : id));
  }, []);

  const registerSlotDetail = useCallback((slotId: SlotId, payload: MosaicDetailPayload | null) => {
    if (!payload) {
      delete slotDetailsRef.current[slotId];
      return;
    }
    slotDetailsRef.current[slotId] = payload;
  }, []);

  const getSlotDetail = useCallback((slotId: SlotId) => slotDetailsRef.current[slotId], []);

  const closeInspector = useCallback(() => {
    setInspectorOpen(false);
    setInspectorEditingState(false);
  }, []);

  const closeReader = useCallback(() => {
    setReaderOpen(false);
    setReaderSlotId(null);
  }, []);

  const setInspectorTab = useCallback((tab: BrandKitInspectorTab) => {
    setInspectorTabState(tab);
    if (tab !== "synthesis" && tab !== "attributes") setInspectorEditingState(false);
  }, []);

  const setInspectorEditing = useCallback((editing: boolean) => {
    setInspectorEditingState(editing);
    if (editing) setInspectorTabState("attributes");
  }, []);

  const openInspector = useCallback(
    (
      payload: MosaicDetailPayload,
      tab: BrandKitInspectorTab = "synthesis",
      options?: { startEditing?: boolean },
    ) => {
      if (studioMode !== "edit" || !payload) return;
      setDetailContent(payload);
      setInspectorTabState(tab);
      setInspectorEditingState(Boolean(options?.startEditing) && (tab === "attributes" || tab === "synthesis"));
      setInspectorOpen(true);
      if (payload.slotId) {
        setSelectedNavId(payload.slotId);
        setSelectedSlotId(payload.slotId);
      }
    },
    [setSelectedNavId, studioMode],
  );

  const inspectSlot = useCallback(
    (slotId: SlotId, tab?: BrandKitInspectorTab, options?: { startEditing?: boolean }) => {
      if (studioMode !== "edit") return;
      const payload = slotDetailsRef.current[slotId] ?? (doc ? buildFallbackSlotDetailPayload(doc, slotId) : null);
      if (!payload) return;
      openInspector(payload, tab ?? mapDetailTabToInspectorTab(payload.initialTabId) ?? "synthesis", options);
    },
    [doc, openInspector, studioMode],
  );

  const selectAndInspectSlot = useCallback(
    (id: BrandKitBoardSelectionId, tab?: BrandKitInspectorTab, options?: { startEditing?: boolean }) => {
      if (studioMode !== "edit" || id === "applications") return;
      setSelectedSlotId(id);
      setSelectedNavId(id);
      inspectSlot(id as SlotId, tab, options);
    },
    [inspectSlot, setSelectedNavId, studioMode],
  );

  const openDetailSheet = useCallback(
    (payload: MosaicDetailPayload) => {
      openInspector(payload, mapDetailTabToInspectorTab(payload.initialTabId));
    },
    [openInspector],
  );

  const closeDetailSheet = useCallback(() => {
    closeInspector();
  }, [closeInspector]);

  const navigateToSlot = useCallback((id: BrandKitBoardSelectionId) => {
    setSelectedNavId(id);
  }, [setSelectedNavId]);

  const selectSlot = useCallback(
    (id: BrandKitBoardSelectionId) => {
      if (studioMode !== "edit") return;
      setSelectedSlotId(id);
      setSelectedNavId(id);
    },
    [studioMode],
  );

  const openReader = useCallback(
    (id: BrandKitBoardSelectionId) => {
      if (studioMode !== "presentation") return;
      setReaderSlotId(id);
      setReaderOpen(true);
      setSelectedNavId(id);
    },
    [studioMode],
  );

  useEffect(() => {
    if (studioMode === "presentation") {
      setInspectorOpen(false);
      setInspectorEditingState(false);
      setSelectedSlotId(null);
    } else {
      closeReader();
    }
  }, [studioMode, closeReader]);

  const value = useMemo(
    () => ({
      studioMode,
      doc,
      onSlotAction,
      selectedNavId,
      selectedSlotId,
      inspectorTab,
      setInspectorTab,
      inspectorEditing,
      setInspectorEditing,
      inspectSlot,
      selectAndInspectSlot,
      navigateToSlot,
      selectSlot,
      openInspector,
      closeInspector,
      readerOpen,
      readerSlotId,
      openReader,
      closeReader,
      openDetailSheet,
      closeDetailSheet,
      detailOpen: inspectorOpen && studioMode === "edit",
      detailContent,
      setSelectedNavId,
      registerSlotDetail,
      getSlotDetail,
    }),
    [
      studioMode,
      doc,
      onSlotAction,
      selectedNavId,
      selectedSlotId,
      inspectorTab,
      setInspectorTab,
      inspectorEditing,
      setInspectorEditing,
      inspectSlot,
      selectAndInspectSlot,
      navigateToSlot,
      selectSlot,
      openInspector,
      closeInspector,
      readerOpen,
      readerSlotId,
      openReader,
      closeReader,
      openDetailSheet,
      closeDetailSheet,
      inspectorOpen,
      detailContent,
      setSelectedNavId,
      registerSlotDetail,
      getSlotDetail,
    ],
  );

  return <BrandKitMosaicBoardContext.Provider value={value}>{children}</BrandKitMosaicBoardContext.Provider>;
}

export function useBrandKitMosaicBoard() {
  return useContext(BrandKitMosaicBoardContext);
}
