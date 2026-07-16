"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { BrandKitDocument, SlotId } from "@/lib/brandkit/brand-kit-types";
import { brandKitLocaleEs } from "@/lib/brandkit/brand-kit-locale.es";
import type { BrandKitStudioMode } from "@/lib/brandkit/studio/brand-kit-studio-mode";
import { isPresentationMode } from "@/lib/brandkit/studio/brand-kit-studio-mode";
import type { BrandKitCrawlProgressState } from "./BrandKitCrawlProgress";
import { BrandKitFoldderButton } from "./board-v2/BrandKitFoldderButton";
import { BrandKitSidebarEntry } from "./BrandKitSidebarEntry";
import { BrandKitSidebarStepper } from "./BrandKitSidebarStepper";
import { BrandKitSidebarConflictBanner, BrandKitSidebarReview } from "./BrandKitSidebarReview";
import { BrandKitSidebarHeader } from "./BrandKitSidebarHeader";
import { BrandKitSidebarNav } from "./BrandKitSidebarNav";
import { BrandKitSidebarSources } from "./BrandKitSidebarSources";
import { BrandKitSidebarExportFooter } from "./BrandKitSidebarExportFooter";
import { resolveBrandKitSidebarPhase } from "@/lib/brandkit/studio/sidebar-phase";
import { studioSidebarShowsTechnicalExport } from "@/lib/brandkit/studio/brand-kit-studio-export";
import { useBrandKitMosaicBoard } from "./board-v2/brand-kit-mosaic-context";
import { PanelLeft } from "lucide-react";

export type BrandKitSidebarPanelProps = {
  doc: BrandKitDocument;
  completenessPercent: number;
  kitTitle?: string;
  isAnalyzing?: boolean;
  crawlProgress?: BrandKitCrawlProgressState | null;
  crawlError?: string | null;
  canExport?: boolean;
  exportBlockedReason?: string | null;
  onAnalyze: (url: string, enableLlm?: boolean) => void;
  onRetryLastJob?: () => void;
  canRetryLastJob?: boolean;
  onIngestFiles?: (files: File[], enableLlm?: boolean) => void;
  onExportTokens?: () => void;
  onExportCompiled?: () => void;
  onSetAuthoritativeSource?: (sourceRef: string, authoritative: boolean) => void;
  onReanalyzeSource?: (sourceRef: string) => void;
  onStartReview?: () => void;
  reviewMode?: boolean;
  studioMode?: BrandKitStudioMode;
  onBrandNameChange?: (name: string) => void;
  sidebarOpen?: boolean;
  onSidebarToggle?: () => void;
  activeSlotId?: SlotId;
};

export function BrandKitSidebarPanel({
  doc,
  isAnalyzing = false,
  crawlProgress = null,
  crawlError = null,
  canExport = false,
  exportBlockedReason = null,
  kitTitle,
  onAnalyze,
  onRetryLastJob,
  canRetryLastJob = false,
  onIngestFiles,
  onExportTokens,
  onExportCompiled,
  onSetAuthoritativeSource,
  onReanalyzeSource,
  onStartReview,
  reviewMode = false,
  studioMode = "presentation",
  onBrandNameChange,
  sidebarOpen = true,
  onSidebarToggle,
  activeSlotId,
}: BrandKitSidebarPanelProps) {
  const [entryExpanded, setEntryExpanded] = useState(false);
  const [isNarrowViewport, setIsNarrowViewport] = useState(false);
  const mosaicBoard = useBrandKitMosaicBoard();
  const presentationMode = isPresentationMode(studioMode);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1100px)");
    const apply = () => setIsNarrowViewport(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const phase = useMemo(
    () => resolveBrandKitSidebarPhase(doc, { isAnalyzing }),
    [doc, isAnalyzing],
  );
  const hasSources = doc.sources.length > 0;
  const showNav = phase === "ready" || phase === "review";
  const forceRail = (presentationMode && showNav) || isNarrowViewport;
  const collapsed = forceRail || !sidebarOpen;
  const showExportFooter =
    studioSidebarShowsTechnicalExport(studioMode) && !collapsed && (phase === "ready" || phase === "review");

  return (
    <aside
      id="brandKit-studio-sidebar"
      className={`brandKit-studio-split__sidebar brandKit-sidebar-phase--${phase}${collapsed ? " is-collapsed-rail" : ""}${presentationMode ? " brandKit-sidebar--presentation-rail" : ""}`}
      aria-label="Panel lateral BrandKit"
    >
      <div className="brandKit-studio-split__sidebar-scroll">
        {!presentationMode ? (
          <BrandKitSidebarHeader
            doc={doc}
            isAnalyzing={isAnalyzing}
            canExport={canExport}
            kitTitle={kitTitle}
            onBrandNameChange={onBrandNameChange}
            onCollapse={sidebarOpen ? onSidebarToggle : undefined}
            collapsed={collapsed}
          />
        ) : null}

        {collapsed ? (
          <>
            {showNav ? (
              <BrandKitSidebarNav
                doc={doc}
                activeSlotId={activeSlotId}
                selectedId={mosaicBoard?.selectedNavId ?? undefined}
                studioMode={studioMode}
                compact
              />
            ) : null}
            {!presentationMode && hasSources ? <BrandKitSidebarSources doc={doc} compact /> : null}
          </>
        ) : (
          <>
            {phase === "ingesting" && crawlProgress ? <BrandKitSidebarStepper progress={crawlProgress} /> : null}

            {showNav ? (
              <BrandKitSidebarNav
                doc={doc}
                activeSlotId={activeSlotId}
                selectedId={mosaicBoard?.selectedNavId ?? undefined}
                studioMode={studioMode}
              />
            ) : null}

            {phase !== "ingesting" && (phase === "empty" || entryExpanded || !hasSources) ? (
              <BrandKitSidebarEntry
                phase={phase}
                isAnalyzing={isAnalyzing}
                hasSources={hasSources}
                onAnalyze={onAnalyze}
                onIngestFiles={(files, enableLlm) => onIngestFiles?.(files, enableLlm)}
              />
            ) : null}

            {phase === "review" ? (
              <>
                <BrandKitSidebarConflictBanner doc={doc} onStartReview={onStartReview} reviewMode={reviewMode} />
                <BrandKitSidebarReview doc={doc} onStartReview={onStartReview} reviewMode={reviewMode} />
              </>
            ) : null}

            {hasSources ? (
              <BrandKitSidebarSources
                doc={doc}
                onSetAuthoritativeSource={onSetAuthoritativeSource}
                onReanalyzeSource={onReanalyzeSource}
                onAddSource={() => setEntryExpanded(true)}
              />
            ) : null}

            {crawlError ? (
              <div className="brandKit-studio-split__error-wrap">
                <p className="brandKit-studio-split__error">{crawlError}</p>
                {canRetryLastJob && onRetryLastJob ? (
                  <BrandKitFoldderButton variant="muted" onClick={onRetryLastJob}>
                    {brandKitLocaleEs.retryAnalysis}
                  </BrandKitFoldderButton>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </div>

      {showExportFooter ? (
        <div className="brandKit-studio-split__sidebar-footer">
          <BrandKitSidebarExportFooter
            canExport={canExport}
            exportBlockedReason={exportBlockedReason}
            onExportTokens={onExportTokens}
            onExportCompiled={onExportCompiled}
          />
        </div>
      ) : null}

      {!presentationMode && collapsed && onSidebarToggle && !isNarrowViewport ? (
        <button
          type="button"
          className="brandKit-sidebar-rail-expand"
          onClick={onSidebarToggle}
          aria-label={brandKitLocaleEs.sidebarShow}
        >
          <PanelLeft size={16} aria-hidden />
        </button>
      ) : null}
    </aside>
  );
}
