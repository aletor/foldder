"use client";

import React, { useMemo, useState } from "react";
import type { GenomaDocument } from "@/lib/genoma/genoma-types";
import { genomaLocaleEs } from "@/lib/genoma/genoma-locale.es";
import type { GenomaCrawlProgressState } from "./GenomaCrawlProgress";
import { GenomaFoldderButton } from "./board-v2/GenomaFoldderButton";
import { GenomaSidebarEntry } from "./GenomaSidebarEntry";
import { GenomaSidebarStepper } from "./GenomaSidebarStepper";
import {
  GenomaSidebarConflictBanner,
  GenomaSidebarReady,
  GenomaSidebarReview,
} from "./GenomaSidebarReview";
import { GenomaSidebarSources } from "./GenomaSidebarSources";
import { resolveGenomaSidebarPhase } from "@/lib/genoma/studio/sidebar-phase";
import {
  GENOMA_STYLE_GUIDE_EXPORT_MODE_LABELS,
  type GenomaStyleGuideExportMode,
} from "@/lib/genoma/projection/style-guide-export-types";
import { ChevronDown } from "lucide-react";

export type GenomaSidebarPanelProps = {
  doc: GenomaDocument;
  completenessPercent: number;
  isAnalyzing?: boolean;
  crawlProgress?: GenomaCrawlProgressState | null;
  crawlError?: string | null;
  canExport?: boolean;
  exportBlockedReason?: string | null;
  onAnalyze: (url: string, enableLlm?: boolean) => void;
  onRetryLastJob?: () => void;
  canRetryLastJob?: boolean;
  onIngestFiles?: (files: File[], enableLlm?: boolean) => void;
  onExportTokens?: () => void;
  onExportCompiled?: () => void;
  onExportStyleGuidePdf?: (exportMode: GenomaStyleGuideExportMode) => void;
  styleGuideDownloadPhase?: "idle" | "vectorizing" | "downloading";
  styleGuideDownloadError?: string | null;
  onSetAuthoritativeSource?: (sourceRef: string, authoritative: boolean) => void;
};

export function GenomaSidebarPanel({
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
}: GenomaSidebarPanelProps) {
  const [exportMode, setExportMode] = useState<GenomaStyleGuideExportMode>("operativo");
  const [exportOpen, setExportOpen] = useState(false);

  const phase = useMemo(
    () => resolveGenomaSidebarPhase(doc, { isAnalyzing }),
    [doc, isAnalyzing],
  );
  const hasSources = doc.sources.length > 0;
  const showExportFooter = phase === "ready" || (exportOpen && phase === "review");
  const showExportCollapsedToggle = phase === "review" && !exportOpen;

  return (
    <aside className={`genoma-studio-split__sidebar genoma-sidebar-phase--${phase}`} aria-label="Entrada de material">
      <div className="genoma-studio-split__sidebar-scroll">
        {phase === "ingesting" && crawlProgress ? (
          <GenomaSidebarStepper progress={crawlProgress} />
        ) : null}

        {phase !== "ingesting" ? (
          <GenomaSidebarEntry
            phase={phase}
            isAnalyzing={isAnalyzing}
            hasSources={hasSources}
            onAnalyze={onAnalyze}
            onIngestFiles={(files, enableLlm) => onIngestFiles?.(files, enableLlm)}
          />
        ) : null}

        {phase === "review" ? (
          <>
            <GenomaSidebarConflictBanner doc={doc} />
            <GenomaSidebarReview doc={doc} />
          </>
        ) : null}

        {phase === "ready" ? <GenomaSidebarReady doc={doc} /> : null}

        {phase !== "ingesting" && hasSources ? (
          <GenomaSidebarSources doc={doc} onSetAuthoritativeSource={onSetAuthoritativeSource} />
        ) : null}

        {crawlError ? (
          <div className="genoma-studio-split__error-wrap">
            <p className="genoma-studio-split__error">{crawlError}</p>
            {canRetryLastJob && onRetryLastJob ? (
              <GenomaFoldderButton variant="muted" onClick={onRetryLastJob}>
                {genomaLocaleEs.retryAnalysis}
              </GenomaFoldderButton>
            ) : null}
          </div>
        ) : null}

        {showExportCollapsedToggle ? (
          <button
            type="button"
            className="genoma-sidebar-export-toggle"
            onClick={() => setExportOpen(true)}
          >
            <span>{genomaLocaleEs.sidebarExportCollapsed}</span>
            <ChevronDown size={14} aria-hidden />
          </button>
        ) : null}
      </div>

      {showExportFooter ? (
        <div className="genoma-studio-split__sidebar-footer">
          {phase === "review" ? (
            <button
              type="button"
              className="genoma-sidebar-export-toggle genoma-sidebar-export-toggle--footer"
              onClick={() => setExportOpen(false)}
            >
              {genomaLocaleEs.hideAddSource}
            </button>
          ) : null}
          <fieldset className="genoma-split-export__modes">
            <legend className="genoma-split-export__legend">{genomaLocaleEs.exportStyleGuide}</legend>
            {(Object.keys(GENOMA_STYLE_GUIDE_EXPORT_MODE_LABELS) as GenomaStyleGuideExportMode[]).map((mode) => (
              <label key={mode} className="genoma-split-export__mode">
                <input
                  type="radio"
                  name="genoma-studio-export-mode"
                  checked={exportMode === mode}
                  onChange={() => setExportMode(mode)}
                />
                {GENOMA_STYLE_GUIDE_EXPORT_MODE_LABELS[mode].toLowerCase()}
              </label>
            ))}
          </fieldset>
          <div className="genoma-split-export">
            <GenomaFoldderButton
              variant="muted"
              disabled={!canExport || !onExportStyleGuidePdf || styleGuideDownloadPhase !== "idle"}
              onClick={() => onExportStyleGuidePdf?.(exportMode)}
              title={
                canExport
                  ? genomaLocaleEs.downloadStyleGuidePdf
                  : (exportBlockedReason ?? genomaLocaleEs.downloadStyleGuidePdf)
              }
            >
              {styleGuideDownloadPhase === "vectorizing"
                ? genomaLocaleEs.vectorizingLogo
                : styleGuideDownloadPhase === "downloading"
                  ? genomaLocaleEs.downloadingPdf
                  : genomaLocaleEs.downloadStyleGuidePdf.toLowerCase()}
            </GenomaFoldderButton>
            <button
              type="button"
              className="genoma-split-export__link"
              disabled={!canExport}
              onClick={onExportTokens}
            >
              {genomaLocaleEs.tokens.toLowerCase()}
            </button>
            <span className="genoma-split-export__sep">·</span>
            <button
              type="button"
              className="genoma-split-export__link"
              disabled={!canExport}
              onClick={onExportCompiled}
            >
              {genomaLocaleEs.compiled.toLowerCase()}
            </button>
          </div>
          {!canExport && exportBlockedReason ? (
            <p className="genoma-split-export__hint">{exportBlockedReason}</p>
          ) : null}
          {styleGuideDownloadError ? (
            <p className="genoma-split-export__hint genoma-split-export__hint--error">{styleGuideDownloadError}</p>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}
