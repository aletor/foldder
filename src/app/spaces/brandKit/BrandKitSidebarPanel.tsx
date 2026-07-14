"use client";

import React, { useMemo, useState } from "react";
import type { BrandKitDocument } from "@/lib/brandkit/brand-kit-types";
import { brandKitLocaleEs } from "@/lib/brandkit/brand-kit-locale.es";
import type { BrandKitCrawlProgressState } from "./BrandKitCrawlProgress";
import { BrandKitFoldderButton } from "./board-v2/BrandKitFoldderButton";
import { BrandKitSidebarEntry } from "./BrandKitSidebarEntry";
import { BrandKitSidebarStepper } from "./BrandKitSidebarStepper";
import {
  BrandKitSidebarConflictBanner,
  BrandKitSidebarReview,
} from "./BrandKitSidebarReview";
import { BrandKitSidebarOverview } from "./BrandKitSidebarOverview";
import { BrandKitSidebarSources } from "./BrandKitSidebarSources";
import { resolveBrandKitSidebarPhase } from "@/lib/brandkit/studio/sidebar-phase";
import {
  BRAND_KIT_STYLE_GUIDE_EXPORT_MODE_LABELS,
  type BrandKitStyleGuideExportMode,
} from "@/lib/brandkit/projection/style-guide-export-types";
import { ChevronDown } from "lucide-react";

export type BrandKitSidebarPanelProps = {
  doc: BrandKitDocument;
  completenessPercent: number;
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
  onExportStyleGuidePdf?: (exportMode: BrandKitStyleGuideExportMode) => void;
  styleGuideDownloadPhase?: "idle" | "vectorizing" | "downloading";
  styleGuideDownloadError?: string | null;
  onSetAuthoritativeSource?: (sourceRef: string, authoritative: boolean) => void;
  onStartReview?: () => void;
  reviewMode?: boolean;
  presentationMode?: boolean;
  onPresentationModeChange?: (enabled: boolean) => void;
  onBrandNameChange?: (name: string) => void;
  sidebarOpen?: boolean;
};

export function BrandKitSidebarPanel({
  doc,
  isAnalyzing = false,
  crawlProgress = null,
  crawlError = null,
  canExport = false,
  exportBlockedReason = null,
  onAnalyze,
  onRetryLastJob,
  canRetryLastJob = false,
  onIngestFiles,
  onExportTokens,
  onExportCompiled,
  onExportStyleGuidePdf,
  styleGuideDownloadPhase = "idle",
  styleGuideDownloadError = null,
  onSetAuthoritativeSource,
  onStartReview,
  reviewMode = false,
  presentationMode = false,
  onPresentationModeChange,
  onBrandNameChange,
  sidebarOpen = true,
}: BrandKitSidebarPanelProps) {
  const [exportMode, setExportMode] = useState<BrandKitStyleGuideExportMode>("operativo");
  const [exportOpen, setExportOpen] = useState(false);

  const phase = useMemo(
    () => resolveBrandKitSidebarPhase(doc, { isAnalyzing }),
    [doc, isAnalyzing],
  );
  const hasSources = doc.sources.length > 0;
  const showExportFooter = phase === "ready" || (exportOpen && phase === "review");
  const showExportCollapsedToggle = phase === "review" && !exportOpen;

  return (
    <aside
      id="brandKit-studio-sidebar"
      className={`brandKit-studio-split__sidebar brandKit-sidebar-phase--${phase}`}
      aria-label="Entrada de material"
      aria-hidden={!sidebarOpen}
    >
      <div className="brandKit-studio-split__sidebar-scroll">
        <BrandKitSidebarOverview
          doc={doc}
          isAnalyzing={isAnalyzing}
          presentationMode={presentationMode}
          onPresentationModeChange={onPresentationModeChange}
          onBrandNameChange={onBrandNameChange}
          onStartReview={onStartReview}
          reviewMode={reviewMode}
        />

        {phase === "ingesting" && crawlProgress ? (
          <BrandKitSidebarStepper progress={crawlProgress} />
        ) : null}

        {phase !== "ingesting" ? (
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

        {phase !== "ingesting" && hasSources ? (
          <BrandKitSidebarSources doc={doc} onSetAuthoritativeSource={onSetAuthoritativeSource} />
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

        {showExportCollapsedToggle ? (
          <button
            type="button"
            className="brandKit-sidebar-export-toggle"
            onClick={() => setExportOpen(true)}
          >
            <span>{brandKitLocaleEs.sidebarExportCollapsed}</span>
            <ChevronDown size={14} aria-hidden />
          </button>
        ) : null}
      </div>

      {showExportFooter ? (
        <div className="brandKit-studio-split__sidebar-footer brandKit-sidebar-export-card">
          {phase === "review" ? (
            <button
              type="button"
              className="brandKit-sidebar-export-toggle brandKit-sidebar-export-toggle--footer"
              onClick={() => setExportOpen(false)}
            >
              {brandKitLocaleEs.hideAddSource}
            </button>
          ) : null}
          <div className="brandKit-sidebar-export-card__body">
            <fieldset className="brandKit-split-export__modes">
              <legend className="brandKit-split-export__legend">{brandKitLocaleEs.exportStyleGuide}</legend>
              {(Object.keys(BRAND_KIT_STYLE_GUIDE_EXPORT_MODE_LABELS) as BrandKitStyleGuideExportMode[]).map((mode) => (
                <label key={mode} className="brandKit-split-export__mode">
                  <input
                    type="radio"
                    name="brandKit-studio-export-mode"
                    checked={exportMode === mode}
                    onChange={() => setExportMode(mode)}
                  />
                  {BRAND_KIT_STYLE_GUIDE_EXPORT_MODE_LABELS[mode].toLowerCase()}
                </label>
              ))}
            </fieldset>
            <div className="brandKit-split-export">
              <BrandKitFoldderButton
                variant="muted"
                disabled={!canExport || !onExportStyleGuidePdf || styleGuideDownloadPhase !== "idle"}
                onClick={() => onExportStyleGuidePdf?.(exportMode)}
                title={
                  canExport
                    ? brandKitLocaleEs.downloadStyleGuidePdf
                    : (exportBlockedReason ?? brandKitLocaleEs.downloadStyleGuidePdf)
                }
              >
                {styleGuideDownloadPhase === "vectorizing"
                  ? brandKitLocaleEs.vectorizingLogo
                  : styleGuideDownloadPhase === "downloading"
                    ? brandKitLocaleEs.downloadingPdf
                    : brandKitLocaleEs.downloadStyleGuidePdf.toLowerCase()}
              </BrandKitFoldderButton>
              <button
                type="button"
                className="brandKit-split-export__link"
                disabled={!canExport}
                onClick={onExportTokens}
              >
                {brandKitLocaleEs.tokens.toLowerCase()}
              </button>
              <span className="brandKit-split-export__sep">·</span>
              <button
                type="button"
                className="brandKit-split-export__link"
                disabled={!canExport}
                onClick={onExportCompiled}
              >
                {brandKitLocaleEs.compiled.toLowerCase()}
              </button>
            </div>
            {!canExport && exportBlockedReason ? (
              <p className="brandKit-split-export__hint">{exportBlockedReason}</p>
            ) : null}
            {styleGuideDownloadError ? (
              <p className="brandKit-split-export__hint brandKit-split-export__hint--error">{styleGuideDownloadError}</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </aside>
  );
}
