"use client";

import React from "react";
import { brandKitLocaleEs } from "@/lib/brandkit/brand-kit-locale.es";
import type { BrandKitCrawlProgressState } from "./BrandKitCrawlProgress";
import { BrandKitFoldderButton } from "./board-v2/BrandKitFoldderButton";
import { BrandKitBoardEmpty } from "./BrandKitBoardEmpty";
import { BrandKitSidebarEntry } from "./BrandKitSidebarEntry";
import { BrandKitSidebarStepper } from "./BrandKitSidebarStepper";

type BrandKitStudioOnboardingProps = {
  isAnalyzing: boolean;
  crawlProgress?: BrandKitCrawlProgressState | null;
  crawlError?: string | null;
  onAnalyze: (url: string, enableLlm?: boolean) => void;
  onIngestFiles: (files: File[], enableLlm?: boolean) => void;
  onRetryLastJob?: () => void;
  canRetryLastJob?: boolean;
};

export function BrandKitStudioOnboarding({
  isAnalyzing,
  crawlProgress = null,
  crawlError = null,
  onAnalyze,
  onIngestFiles,
  onRetryLastJob,
  canRetryLastJob = false,
}: BrandKitStudioOnboardingProps) {
  return (
    <main
      className="brandKit-studio-onboarding"
      aria-label={isAnalyzing ? brandKitLocaleEs.sidebarIngestTitle : "Libro de marca vacío"}
    >
      <div className="brandKit-studio-onboarding__inner">
        <BrandKitBoardEmpty variant="onboarding" />

        {isAnalyzing && crawlProgress ? (
          <div className="brandKit-studio-onboarding__progress">
            <BrandKitSidebarStepper progress={crawlProgress} />
          </div>
        ) : (
          <div className="brandKit-studio-onboarding__entry">
            <BrandKitSidebarEntry
              phase="empty"
              isAnalyzing={isAnalyzing}
              hasSources={false}
              onAnalyze={onAnalyze}
              onIngestFiles={onIngestFiles}
              variant="onboarding"
            />
          </div>
        )}

        {crawlError ? (
          <div className="brandKit-studio-onboarding__error brandKit-studio-split__error-wrap">
            <p className="brandKit-studio-split__error">{crawlError}</p>
            {canRetryLastJob && onRetryLastJob ? (
              <BrandKitFoldderButton variant="muted" onClick={onRetryLastJob}>
                {brandKitLocaleEs.retryAnalysis}
              </BrandKitFoldderButton>
            ) : null}
          </div>
        ) : null}
      </div>
    </main>
  );
}
