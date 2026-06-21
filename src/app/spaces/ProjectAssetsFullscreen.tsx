"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Download,
  FileQuestion,
  Focus,
  Maximize2,
  MoreHorizontal,
  Pencil,
  X,
} from "lucide-react";
import type { LibraryAsset } from "./foldder-library-registry";
import type { FoldderLibraryView } from "./foldder-library-registry";
import { tryExtractKnowledgeFilesKeyFromUrl } from "@/lib/s3-media-hydrate";
import type { GuionistaTextAsset } from "./guionista-types";
import { FoldderStudioHeader } from "./FoldderStudioHeader";
import {
  FoldderLibraryAssetCell,
  FoldderLibraryAssetGrid,
  FoldderLibraryEmptyState,
  FoldderLibraryOrphanedCollapsible,
  FoldderLibrarySectionKicker,
  FoldderLibraryStudioSection,
  FoldderLibraryStudioTabBar,
  FoldderLibraryTextList,
  FoldderLibraryTextListItem,
  type FoldderLibraryTab,
} from "./foldder/FoldderLibraryStudioChrome";

type Props = {
  open: boolean;
  onClose: () => void;
  libraryView: FoldderLibraryView;
  liveNodeIds: Set<string>;
  onRenameAsset: (assetId: string, name: string) => void;
  onFocusNode: (nodeId: string) => void;
  onExportAsset: (asset: LibraryAsset, downloadUrl?: string) => void;
  onOpenGuionistaTextAsset?: (assetId: string) => void;
};

type PreviewState = {
  asset: LibraryAsset;
  url: string;
  list: LibraryAsset[];
};

function resolveUrl(url: string | undefined, refreshedUrls: Record<string, string>): string | undefined {
  const trimmed = url?.trim();
  if (!trimmed) return undefined;
  const key = tryExtractKnowledgeFilesKeyFromUrl(trimmed);
  if (key && refreshedUrls[key]) return refreshedUrls[key];
  return trimmed;
}

function assetPreviewUrl(asset: LibraryAsset, refreshedUrls: Record<string, string>): string | undefined {
  return resolveUrl(asset.url, refreshedUrls) ?? resolveUrl(asset.thumbnailUrl, refreshedUrls);
}

function isPreviewableAsset(asset: LibraryAsset, refreshedUrls: Record<string, string>): boolean {
  const url = assetPreviewUrl(asset, refreshedUrls);
  return Boolean(url && (asset.kind === "image" || asset.kind === "video"));
}

function formatAssetDate(iso?: string): string {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat("es", { day: "numeric", month: "short" }).format(new Date(iso));
  } catch {
    return "";
  }
}

function AssetTileMenu({
  open,
  onClose,
  anchorRef,
  children,
}: {
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  children: React.ReactNode;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (anchorRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, onClose, anchorRef]);

  if (!open) return null;
  return (
    <div
      ref={menuRef}
      className="absolute bottom-full right-0 z-20 mb-1 min-w-[9.5rem] border border-white/12 bg-[#0b0f14] py-1"
      role="menu"
    >
      {children}
    </div>
  );
}

function AssetTileMenuButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] font-medium text-white/75 transition hover:bg-white/[0.06] hover:text-white"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function FoldderLibraryMediaLightbox({
  preview,
  refreshedUrls,
  liveNodeIds,
  onClose,
  onNavigate,
  onFocusNode,
  onExportAsset,
  showExportAction,
}: {
  preview: PreviewState;
  refreshedUrls: Record<string, string>;
  liveNodeIds: Set<string>;
  onClose: () => void;
  onNavigate: (delta: number) => void;
  onFocusNode: (nodeId: string) => void;
  onExportAsset: (asset: LibraryAsset, downloadUrl?: string) => void;
  showExportAction: boolean;
}) {
  const { asset, url } = preview;
  const isVideo = asset.kind === "video";
  const isImage = asset.kind === "image";
  const nodeLive = Boolean(asset.sourceNodeId && liveNodeIds.has(asset.sourceNodeId));
  const canExport = showExportAction && Boolean(url || asset.url || asset.thumbnailUrl);
  const hasNav = preview.list.length > 1;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") onNavigate(-1);
      if (e.key === "ArrowRight") onNavigate(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onNavigate]);

  return (
    <div
      className="fixed inset-0 z-[100095] flex flex-col bg-[#0b0f14]"
      data-foldder-library-lightbox
      role="dialog"
      aria-modal="true"
      aria-label={asset.displayName}
    >
      <div className="flex h-10 shrink-0 items-stretch border-b border-white/10 bg-black/40">
        <div className="flex min-w-0 flex-1 items-center px-4">
          <p className="truncate text-[12px] font-semibold text-white">{asset.displayName}</p>
          <span className="ml-3 hidden truncate text-[10px] text-white/40 sm:inline">
            {asset.sourceLabel}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-10 w-10 shrink-0 items-center justify-center border-l border-white/15 text-white/70 transition hover:bg-white/[0.08] hover:text-white"
          aria-label="Cerrar vista"
        >
          <X size={16} aria-hidden />
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center p-4">
        {hasNav ? (
          <button
            type="button"
            className="absolute left-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center border border-white/15 bg-black/50 text-white/80 transition hover:bg-black/70 hover:text-white sm:left-4"
            onClick={() => onNavigate(-1)}
            aria-label="Anterior"
          >
            <ChevronLeft size={20} aria-hidden />
          </button>
        ) : null}
        {isVideo ? (
          <video src={url} className="max-h-full max-w-full object-contain" controls playsInline autoPlay />
        ) : isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={asset.displayName} className="max-h-full max-w-full object-contain" />
        ) : (
          <p className="text-[12px] text-white/45">Vista previa no disponible.</p>
        )}
        {hasNav ? (
          <button
            type="button"
            className="absolute right-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center border border-white/15 bg-black/50 text-white/80 transition hover:bg-black/70 hover:text-white sm:right-4"
            onClick={() => onNavigate(1)}
            aria-label="Siguiente"
          >
            <ChevronRight size={20} aria-hidden />
          </button>
        ) : null}
      </div>

      <div className="flex h-10 shrink-0 divide-x divide-white/10 border-t border-white/10 bg-black/40 text-[10px] font-semibold">
        {nodeLive ? (
          <button
            type="button"
            className="flex flex-1 items-center justify-center gap-1.5 text-white/75 transition hover:bg-white/[0.06] hover:text-white"
            onClick={() => {
              onClose();
              onFocusNode(asset.sourceNodeId!);
            }}
          >
            <Focus size={13} aria-hidden />
            Ir al nodo
          </button>
        ) : null}
        {canExport ? (
          <button
            type="button"
            className="flex flex-1 items-center justify-center gap-1.5 text-[var(--foldder-studio-accent,#965b92)] transition hover:bg-white/[0.06]"
            onClick={() => onExportAsset(asset, url)}
          >
            <Download size={13} aria-hidden />
            Descargar
          </button>
        ) : null}
        <button
          type="button"
          className="flex flex-1 items-center justify-center gap-1.5 text-white/75 transition hover:bg-white/[0.06] hover:text-white"
          onClick={onClose}
        >
          Cerrar
        </button>
      </div>
    </div>
  );
}

function LibraryAssetTile({
  asset,
  refreshedUrls,
  archived = false,
  delivery = false,
  liveNodeIds,
  onRenameAsset,
  onFocusNode,
  onExportAsset,
  onOpenPreview,
  previewList,
  showExportAction = true,
}: {
  asset: LibraryAsset;
  refreshedUrls: Record<string, string>;
  archived?: boolean;
  delivery?: boolean;
  liveNodeIds: Set<string>;
  onRenameAsset: (assetId: string, name: string) => void;
  onFocusNode: (nodeId: string) => void;
  onExportAsset: (asset: LibraryAsset, downloadUrl?: string) => void;
  onOpenPreview: (asset: LibraryAsset, previewUrl: string, list: LibraryAsset[]) => void;
  previewList: LibraryAsset[];
  showExportAction?: boolean;
}) {
  const menuRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const previewUrl = assetPreviewUrl(asset, refreshedUrls);
  const nodeLive = Boolean(asset.sourceNodeId && liveNodeIds.has(asset.sourceNodeId));
  const canPreview = isPreviewableAsset(asset, refreshedUrls);
  const canExport = showExportAction && Boolean(previewUrl || asset.url || asset.thumbnailUrl);
  const exportDate = formatAssetDate(asset.updatedAt);

  const openPreview = () => {
    if (canPreview && previewUrl) onOpenPreview(asset, previewUrl, previewList);
  };

  return (
    <article
      className={`foldder-library-tile group relative flex flex-col ${archived ? "" : "foldder-library-tile--active"}`}
    >
      <div className="relative aspect-[4/5] w-full overflow-hidden bg-black/35">
        <div className={archived ? "foldder-library-tile-preview foldder-library-tile-preview--archived" : "foldder-library-tile-preview"}>
          {previewUrl && asset.kind === "video" ? (
            <video src={previewUrl} className="h-full w-full object-cover" muted playsInline preload="metadata" />
          ) : previewUrl && asset.kind === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-white/25">
              <FileQuestion className="h-8 w-8" strokeWidth={1.5} />
            </div>
          )}
        </div>

        <span
          className={
            delivery
              ? "foldder-library-tile-badge foldder-library-tile-badge--delivery"
              : archived
                ? "foldder-library-tile-badge foldder-library-tile-badge--archived"
                : "foldder-library-tile-badge foldder-library-tile-badge--active"
          }
        >
          {delivery ? "Entrega" : archived ? "Archivado" : "Activo"}
        </span>

        {canPreview ? (
          <div className="foldder-library-tile-overlay">
            <button
              type="button"
              className="foldder-library-tile-overlay-btn"
              title="Pantalla completa"
              onClick={openPreview}
            >
              <Maximize2 size={16} aria-hidden />
            </button>
            <div className="relative">
              <button
                ref={menuRef}
                type="button"
                className="foldder-library-tile-overlay-btn"
                title="Más acciones"
                onClick={() => setMenuOpen((v) => !v)}
              >
                <MoreHorizontal size={16} aria-hidden />
              </button>
              <AssetTileMenu open={menuOpen} onClose={() => setMenuOpen(false)} anchorRef={menuRef}>
                <AssetTileMenuButton
                  onClick={() => {
                    setMenuOpen(false);
                    openPreview();
                  }}
                >
                  <Maximize2 size={12} aria-hidden />
                  Pantalla completa
                </AssetTileMenuButton>
                <AssetTileMenuButton
                  onClick={() => {
                    setMenuOpen(false);
                    const next = window.prompt("Renombrar", asset.displayName);
                    if (next?.trim()) onRenameAsset(asset.id, next.trim());
                  }}
                >
                  <Pencil size={12} aria-hidden />
                  Renombrar
                </AssetTileMenuButton>
                {nodeLive ? (
                  <AssetTileMenuButton
                    onClick={() => {
                      setMenuOpen(false);
                      onFocusNode(asset.sourceNodeId!);
                    }}
                  >
                    <Focus size={12} aria-hidden />
                    Ir al nodo
                  </AssetTileMenuButton>
                ) : null}
                {canExport ? (
                  <AssetTileMenuButton
                    onClick={() => {
                      setMenuOpen(false);
                      onExportAsset(asset, previewUrl);
                    }}
                  >
                    <Download size={12} aria-hidden />
                    Exportar
                  </AssetTileMenuButton>
                ) : null}
              </AssetTileMenu>
            </div>
          </div>
        ) : (
          <div className="foldder-library-tile-overlay foldder-library-tile-overlay--always">
            <div className="relative">
              <button
                ref={menuRef}
                type="button"
                className="foldder-library-tile-overlay-btn"
                onClick={() => setMenuOpen((v) => !v)}
              >
                <MoreHorizontal size={16} aria-hidden />
              </button>
              <AssetTileMenu open={menuOpen} onClose={() => setMenuOpen(false)} anchorRef={menuRef}>
                <AssetTileMenuButton
                  onClick={() => {
                    setMenuOpen(false);
                    const next = window.prompt("Renombrar", asset.displayName);
                    if (next?.trim()) onRenameAsset(asset.id, next.trim());
                  }}
                >
                  <Pencil size={12} aria-hidden />
                  Renombrar
                </AssetTileMenuButton>
                {canExport ? (
                  <AssetTileMenuButton
                    onClick={() => {
                      setMenuOpen(false);
                      onExportAsset(asset, previewUrl);
                    }}
                  >
                    <Download size={12} aria-hidden />
                    Exportar
                  </AssetTileMenuButton>
                ) : null}
              </AssetTileMenu>
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-white/8 px-2.5 py-2">
        <p className="truncate text-[11px] font-semibold text-white/88" title={asset.displayName}>
          {asset.displayName}
        </p>
        <p className="mt-0.5 truncate text-[9px] text-white/38" title={asset.sourceLabel}>
          {asset.sourceLabel ?? asset.sourceNodeType ?? "Foldder"}
          {delivery && exportDate ? ` · ${exportDate}` : ""}
        </p>
      </div>
    </article>
  );
}

function GuionistaTextRow({
  item,
  onOpen,
}: {
  item: GuionistaTextAsset;
  onOpen?: (assetId: string) => void;
}) {
  return (
    <button
      type="button"
      onDoubleClick={() => onOpen?.(item.id)}
      className="flex w-full items-center gap-3 px-3 py-3 text-left"
      title="Doble clic para abrir en Guionista"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-white/10 bg-white/[0.04] text-[var(--foldder-studio-accent,#965b92)]">
        <BookOpen className="h-4 w-4" strokeWidth={1.6} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[11px] font-semibold text-white/85">{item.title}</span>
        <span className="mt-0.5 block truncate text-[10px] text-white/38">{item.preview}</span>
      </span>
      <span className="hidden shrink-0 text-[9px] text-white/28 sm:inline">Guionista</span>
    </button>
  );
}

function MediaBucketPanel({
  emptyHint,
  active,
  orphaned,
  refreshedUrls,
  liveNodeIds,
  onRenameAsset,
  onFocusNode,
  onExportAsset,
  onOpenPreview,
  previewList,
}: {
  emptyHint: string;
  active: LibraryAsset[];
  orphaned: LibraryAsset[];
  refreshedUrls: Record<string, string>;
  liveNodeIds: Set<string>;
  onRenameAsset: (assetId: string, name: string) => void;
  onFocusNode: (nodeId: string) => void;
  onExportAsset: (asset: LibraryAsset, downloadUrl?: string) => void;
  onOpenPreview: (asset: LibraryAsset, previewUrl: string, list: LibraryAsset[]) => void;
  previewList: LibraryAsset[];
}) {
  const total = active.length + orphaned.length;
  if (total === 0) {
    return <FoldderLibraryEmptyState hint="Los assets aparecerán aquí cuando entren al proyecto.">{emptyHint}</FoldderLibraryEmptyState>;
  }

  return (
    <>
      {active.length > 0 ? (
        <FoldderLibraryAssetGrid>
          {active.map((asset) => (
              <FoldderLibraryAssetCell key={asset.id}>
                <LibraryAssetTile
                  asset={asset}
                  refreshedUrls={refreshedUrls}
                  liveNodeIds={liveNodeIds}
                  onRenameAsset={onRenameAsset}
                  onFocusNode={onFocusNode}
                  onExportAsset={onExportAsset}
                  onOpenPreview={onOpenPreview}
                  previewList={previewList}
                />
              </FoldderLibraryAssetCell>
            ))}
        </FoldderLibraryAssetGrid>
      ) : null}
      <FoldderLibraryOrphanedCollapsible count={orphaned.length}>
        <FoldderLibraryAssetGrid>
          {orphaned.map((asset) => (
            <FoldderLibraryAssetCell key={asset.id}>
              <LibraryAssetTile
                asset={asset}
                refreshedUrls={refreshedUrls}
                archived
                liveNodeIds={liveNodeIds}
                onRenameAsset={onRenameAsset}
                onFocusNode={onFocusNode}
                onExportAsset={onExportAsset}
                onOpenPreview={onOpenPreview}
                previewList={previewList}
              />
            </FoldderLibraryAssetCell>
          ))}
        </FoldderLibraryAssetGrid>
      </FoldderLibraryOrphanedCollapsible>
    </>
  );
}

const LIBRARY_TABS: Array<{ id: FoldderLibraryTab; label: string }> = [
  { id: "imported", label: "Importados" },
  { id: "generated", label: "Generados" },
  { id: "exported", label: "Exportados" },
];

export function ProjectAssetsFullscreen({
  open,
  onClose,
  libraryView,
  liveNodeIds,
  onRenameAsset,
  onFocusNode,
  onExportAsset,
  onOpenGuionistaTextAsset,
}: Props) {
  const [activeTab, setActiveTab] = useState<FoldderLibraryTab>("imported");
  const [refreshedUrls, setRefreshedUrls] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<PreviewState | null>(null);

  const importedCount = libraryView.imported.active.length + libraryView.imported.orphaned.length;
  const generatedMediaCount = libraryView.generated.active.length + libraryView.generated.orphaned.length;
  const generatedCount = generatedMediaCount + libraryView.generated.texts.length;
  const exportedCount = libraryView.exported.length;
  const onCanvasCount =
    libraryView.imported.active.length +
    libraryView.generated.active.length;

  const tabsWithCounts = useMemo(
    () =>
      LIBRARY_TABS.map((tab) => ({
        ...tab,
        count:
          tab.id === "imported"
            ? importedCount
            : tab.id === "generated"
              ? generatedCount
              : tab.id === "exported"
                ? exportedCount
                : undefined,
      })),
    [importedCount, generatedCount, exportedCount],
  );

  const tabPreviewLists = useMemo(() => {
    const imported = [...libraryView.imported.active, ...libraryView.imported.orphaned];
    const generated = [...libraryView.generated.active, ...libraryView.generated.orphaned];
    return {
      imported,
      generated,
      exported: libraryView.exported,
    };
  }, [libraryView]);

  const currentPreviewList = useMemo(() => {
    const list = tabPreviewLists[activeTab === "exported" ? "exported" : activeTab];
    return list.filter((asset) => isPreviewableAsset(asset, refreshedUrls));
  }, [activeTab, tabPreviewLists, refreshedUrls]);

  const handleOpenPreview = (asset: LibraryAsset, previewUrl: string, list: LibraryAsset[]) => {
    const navigable = list.filter((item) => isPreviewableAsset(item, refreshedUrls));
    setPreview({ asset, url: previewUrl, list: navigable.length > 0 ? navigable : [asset] });
  };

  const handleNavigatePreview = (delta: number) => {
    setPreview((current) => {
      if (!current || current.list.length <= 1) return current;
      const idx = current.list.findIndex((item) => item.id === current.asset.id);
      const nextIdx = (idx + delta + current.list.length) % current.list.length;
      const nextAsset = current.list[nextIdx]!;
      const url = assetPreviewUrl(nextAsset, refreshedUrls);
      if (!url) return current;
      return { asset: nextAsset, url, list: current.list };
    });
  };

  const headerSubtitle = `${onCanvasCount} en lienzo · ${exportedCount} exportado${exportedCount === 1 ? "" : "s"}`;

  const allAssets = useMemo(
    () => [
      ...libraryView.imported.active,
      ...libraryView.imported.orphaned,
      ...libraryView.generated.active,
      ...libraryView.generated.orphaned,
      ...libraryView.exported,
    ],
    [libraryView],
  );

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const keys = new Set<string>();
    for (const asset of allAssets) {
      for (const url of [asset.url, asset.thumbnailUrl]) {
        const key = tryExtractKnowledgeFilesKeyFromUrl(url?.trim() ?? "");
        if (key) keys.add(key);
      }
    }
    if (keys.size === 0) return;

    (async () => {
      try {
        const res = await fetch("/api/spaces/s3-presign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keys: Array.from(keys) }),
        });
        if (!res.ok) return;
        const payload = (await res.json()) as { urls?: Record<string, string> };
        if (!payload.urls || cancelled) return;
        setRefreshedUrls((prev) => ({ ...prev, ...payload.urls! }));
      } catch {
        /* keep stale urls */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, allAssets]);

  useEffect(() => {
    if (!open) return;
    document.body.classList.add("nb-studio-open");
    return () => document.body.classList.remove("nb-studio-open");
  }, [open]);

  useEffect(() => {
    if (!open) {
      setPreview(null);
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (preview) {
        setPreview(null);
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, preview]);

  if (!open) return null;

  const shell = (
    <div
      className="fixed inset-0 z-[100090] flex flex-col bg-[#0b0f14] text-white"
      data-foldder-studio-panel
      data-foldder-studio-flush
      data-foldder-library-studio
      role="dialog"
      aria-modal="true"
      aria-label="Foldder studio"
      style={{ ["--foldder-studio-accent" as string]: "#965b92" }}
    >
      <FoldderStudioHeader
        nodeType="projectAssets"
        nodeLabel="Foldder"
        subtitle={headerSubtitle}
        iconSrc="/logo_bl.svg"
        iconBackground="#965b92"
        onClose={onClose}
      />
      <FoldderLibraryStudioTabBar activeTab={activeTab} onTabChange={setActiveTab} tabs={tabsWithCounts} />

      <main
        className="custom-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-3 py-4 sm:px-5"
        data-foldder-library-studio-main
      >
        <div className="mx-auto max-w-[1400px]">
          {activeTab === "imported" ? (
            <MediaBucketPanel
              emptyHint="Aún no hay importados en este proyecto."
              active={libraryView.imported.active}
              orphaned={libraryView.imported.orphaned}
              refreshedUrls={refreshedUrls}
              liveNodeIds={liveNodeIds}
              onRenameAsset={onRenameAsset}
              onFocusNode={onFocusNode}
              onExportAsset={onExportAsset}
              onOpenPreview={handleOpenPreview}
              previewList={tabPreviewLists.imported}
            />
          ) : null}

          {activeTab === "generated" ? (
            <>
              {generatedMediaCount > 0 && libraryView.generated.texts.length > 0 ? (
                <FoldderLibrarySectionKicker label="Media" count={generatedMediaCount} />
              ) : null}
              <MediaBucketPanel
                emptyHint="Aún no hay media generada."
                active={libraryView.generated.active}
                orphaned={libraryView.generated.orphaned}
                refreshedUrls={refreshedUrls}
                liveNodeIds={liveNodeIds}
                onRenameAsset={onRenameAsset}
                onFocusNode={onFocusNode}
                onExportAsset={onExportAsset}
                onOpenPreview={handleOpenPreview}
                previewList={tabPreviewLists.generated}
              />
              {libraryView.generated.texts.length > 0 ? (
                <>
                  <FoldderLibrarySectionKicker label="Textos" count={libraryView.generated.texts.length} />
                  <FoldderLibraryTextList>
                    {libraryView.generated.texts.map((item) => (
                      <FoldderLibraryTextListItem key={item.id}>
                        <GuionistaTextRow item={item} onOpen={onOpenGuionistaTextAsset} />
                      </FoldderLibraryTextListItem>
                    ))}
                  </FoldderLibraryTextList>
                </>
              ) : null}
            </>
          ) : null}

          {activeTab === "exported" ? (
            <FoldderLibraryStudioSection>
              {libraryView.exported.length === 0 ? (
                <FoldderLibraryEmptyState hint="Usa Exportar en Importados o Generados para descargar y guardar entregas aquí.">
                  No hay exportados todavía
                </FoldderLibraryEmptyState>
              ) : (
                <FoldderLibraryAssetGrid>
                  {libraryView.exported.map((asset) => (
                    <FoldderLibraryAssetCell key={asset.id}>
                      <LibraryAssetTile
                        asset={asset}
                        refreshedUrls={refreshedUrls}
                        delivery
                        liveNodeIds={liveNodeIds}
                        onRenameAsset={onRenameAsset}
                        onFocusNode={onFocusNode}
                        onExportAsset={onExportAsset}
                        onOpenPreview={handleOpenPreview}
                        previewList={tabPreviewLists.exported}
                        showExportAction={false}
                      />
                    </FoldderLibraryAssetCell>
                  ))}
                </FoldderLibraryAssetGrid>
              )}
            </FoldderLibraryStudioSection>
          ) : null}
        </div>
      </main>

      {preview ? (
        <FoldderLibraryMediaLightbox
          preview={preview}
          refreshedUrls={refreshedUrls}
          liveNodeIds={liveNodeIds}
          onClose={() => setPreview(null)}
          onNavigate={handleNavigatePreview}
          onFocusNode={onFocusNode}
          onExportAsset={onExportAsset}
          showExportAction={activeTab !== "exported"}
        />
      ) : null}
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(shell, document.body);
}
