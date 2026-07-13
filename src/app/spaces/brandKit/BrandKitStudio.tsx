"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FoldderStudioHeader } from "../FoldderStudioHeader";
import type { GalleryValue, BrandKitDocument, SlotAction, SlotId } from "@/lib/brandkit/brand-kit-types";
import { externalGalleryMediaUrls } from "@/lib/brandkit/brand-kit-gallery-media";
import { applySlotAction } from "@/lib/brandkit/brand-kit-slot-actions";
import { enrichBrandKitDocument } from "@/lib/brandkit/brand-kit-enrich";
import { validateBrandKitContentQuality } from "@/lib/brandkit/brand-kit-content-quality";
import { brandKitLocaleEs } from "@/lib/brandkit/brand-kit-locale.es";
import { brandKitExportBlockedReason } from "@/lib/brandkit/brand-kit-board-status";
import {
  computeBrandKitCompleteness,
  extractBrandTitle,
  isBrandKitEmpty,
} from "@/lib/brandkit/brand-kit-defaults";
import {
  analyzeBrandKitGalleryBriefs,
  applyBrandKitCompile,
  applyBrandKitStreamEvent,
  applySourceAuthoritative,
  hydrateBrandKitGalleryMedia,
  prepareDocForAdditiveSource,
  streamBrandKitCrawl,
  streamBrandKitGallery,
  streamBrandKitIngest,
  type BrandKitGalleryGenerateProgress,
} from "./brand-kit-api";
import {
  createInitialCrawlProgress,
  BrandKitCrawlProgress,
  reduceCrawlProgress,
  type BrandKitCrawlProgressState,
} from "./BrandKitCrawlProgress";
import { BrandKitBoardV2 } from "./board-v2/BrandKitBoardV2";
import { BrandKitBoardEmpty } from "./BrandKitBoardEmpty";
import { BrandKitSidebarPanel } from "./BrandKitSidebarPanel";
import { BrandKitStudioToastStack } from "./BrandKitStudioToast";
import type { BrandKitStyleGuideExportMode } from "@/lib/brandkit/projection/style-guide-export-types";
import { downloadBrandKitDocumentStyleGuidePdf } from "@/lib/brandkit/projection/brand-kit-style-guide-download.client";
import {
  buildAnalysisCompleteToast,
  buildAuthoritativeToast,
  buildLogoUploadToast,
  buildSlotActionToast,
  createBrandKitToast,
  type BrandKitToast,
} from "@/lib/brandkit/brand-kit-studio-feedback";
import { BRAND_KIT_GALLERY_CATEGORY_IMAGE_COUNT } from "@/lib/brandkit/brand-kit-gallery-cost";
import type { GalleryGenerateCategory } from "@/lib/brandkit/brand-kit-gallery-plan";
import {
  computeGalleryBriefSourceKey,
  galleryBriefsAreFresh,
  GALLERY_BRIEF_MIN_INCLUDED_IMAGES,
} from "@/lib/brandkit/brand-kit-gallery-brief";
import { galleryIncludedCount } from "@/lib/brandkit/brand-kit-gallery-filter";
import "./brand-kit.css";
import "./brand-kit-board-theme.css";
import "./board-v2/brand-kit-board-motion.css";
import "./brand-kit-split-layout.css";
import "./brand-kit-media.css";

const BRAND_KIT_STUDIO_ACCENT = "#FFBD1B";

type BrandKitStudioProps = {
  nodeId: string;
  nodeLabel?: string;
  brandKit: BrandKitDocument;
  onBrandKitChange: (next: BrandKitDocument) => void;
  onClose: () => void;
};

function downloadJson(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function BrandKitStudio({ nodeId, nodeLabel, brandKit, onBrandKitChange, onClose }: BrandKitStudioProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [generatingGalleryCategory, setGeneratingGalleryCategory] = useState<GalleryGenerateCategory | null>(null);
  const [isAnalyzingGalleryBriefs, setIsAnalyzingGalleryBriefs] = useState(false);
  const [crawlError, setCrawlError] = useState<string | null>(null);
  const [gallerySuccess, setGallerySuccess] = useState<string | null>(null);
  const [galleryProgress, setGalleryProgress] = useState<BrandKitGalleryGenerateProgress | null>(null);
  const [focusGeneratedTab, setFocusGeneratedTab] = useState(0);
  const [crawlProgress, setCrawlProgress] = useState<BrandKitCrawlProgressState | null>(null);
  const [toasts, setToasts] = useState<BrandKitToast[]>([]);
  const compileTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const brandKitRef = useRef(brandKit);
  const galleryHydrateKeyRef = useRef("");
  const galleryBriefAttemptKeyRef = useRef<string | null>(null);
  const lastCrawlJobRef = useRef<{ url: string; enableLlm: boolean } | null>(null);
  const [lastCrawlJob, setLastCrawlJob] = useState<{ url: string; enableLlm: boolean } | null>(null);
  const [styleGuideDownloadPhase, setStyleGuideDownloadPhase] = useState<"idle" | "vectorizing" | "downloading">("idle");
  const [styleGuideDownloadError, setStyleGuideDownloadError] = useState<string | null>(null);
  const [presentationMode, setPresentationMode] = useState(false);
  const [reviewMode, setReviewMode] = useState(false);

  useEffect(() => {
    if (presentationMode) setReviewMode(false);
  }, [presentationMode]);

  useEffect(() => {
    brandKitRef.current = brandKit;
  }, [brandKit]);

  const pushToast = useCallback((toast: BrandKitToast) => {
    setToasts((prev) => [...prev.slice(-3), toast]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const persistBrandKit = useCallback(
    (next: BrandKitDocument) => {
      brandKitRef.current = next;
      onBrandKitChange(next);
    },
    [onBrandKitChange],
  );

  const handleReviewComplete = useCallback(
    (stats: { decided: number; skipped: number }) => {
      if (stats.decided > 0) {
        pushToast(createBrandKitToast("success", brandKitLocaleEs.reviewCompleteToast(stats.decided)));
      }
    },
    [pushToast],
  );

  const handleAction = useCallback(
    (slotId: SlotId, action: SlotAction) => {
      persistBrandKit(applySlotAction(brandKitRef.current, slotId, action));
      const toast = buildSlotActionToast(slotId, action);
      if (toast) pushToast(toast);
    },
    [persistBrandKit, pushToast],
  );

  const handleBrandNameChange = useCallback(
    (name: string) => {
      persistBrandKit({
        ...brandKitRef.current,
        brandName: {
          value: name,
          provenance: { type: "user_input", detail: "tú" },
        },
      });
    },
    [persistBrandKit],
  );

  useEffect(() => {
    if (isBrandKitEmpty(brandKit)) return;
    if (compileTimer.current) clearTimeout(compileTimer.current);
    compileTimer.current = setTimeout(() => {
      const snapshot = brandKitRef.current;
      void applyBrandKitCompile(snapshot).then((compiled) => {
        const latest = brandKitRef.current;
        const next = {
          ...latest,
          compiled: compiled.compiled,
          compiledHash: compiled.compiledHash,
          updatedAt: new Date().toISOString(),
        };
        if (next.compiledHash !== latest.compiledHash) {
          persistBrandKit(next);
        }
      });
    }, 2000);
    return () => {
      if (compileTimer.current) clearTimeout(compileTimer.current);
    };
  }, [brandKit, persistBrandKit]);

  useEffect(() => {
    const gallery = brandKit.slots.gallery?.value as GalleryValue | undefined;
    const external = externalGalleryMediaUrls(gallery);
    const signature = external.slice().sort().join("|");
    if (!signature || galleryHydrateKeyRef.current === signature) return;

    let cancelled = false;
    galleryHydrateKeyRef.current = signature;
    void hydrateBrandKitGalleryMedia(brandKitRef.current).then((next) => {
      if (cancelled) return;
      if (next !== brandKitRef.current) persistBrandKit(next);
    });

    return () => {
      cancelled = true;
    };
  }, [brandKit.slots.gallery?.value, persistBrandKit]);

  const handleSetAuthoritativeSource = useCallback(
    (sourceRef: string, authoritative: boolean) => {
      const next = applySourceAuthoritative(brandKitRef.current, sourceRef, authoritative);
      persistBrandKit(next);
      pushToast(buildAuthoritativeToast(next, authoritative));
    },
    [persistBrandKit, pushToast],
  );

  const handleLogoUpload = useCallback(
    async (file: File) => {
      setCrawlError(null);
      let working = prepareDocForAdditiveSource(brandKitRef.current);
      const result = await streamBrandKitIngest([file], (event) => {
        if (event.type === "slot_update" || event.type === "source_added" || event.type === "brand_name") {
          working = applyBrandKitStreamEvent(working, event, { respectLocks: true });
          persistBrandKit(working);
        }
      }, { enableLlm: false });
      if (!result.ok) {
        setCrawlError(result.message);
        return;
      }
      const polished = enrichBrandKitDocument(validateBrandKitContentQuality(working));
      persistBrandKit(polished);
      pushToast(buildLogoUploadToast());
    },
    [persistBrandKit, pushToast],
  );

  const runStreamJob = useCallback(
    async (
      runner: (onEvent: (event: import("@/lib/brandkit/crawl/types").BrandKitStreamEvent) => void) => Promise<
        { ok: true } | { ok: false; message: string } | { ok: true; url: string }
      >,
    ) => {
      setIsAnalyzing(true);
      setCrawlError(null);
      setCrawlProgress(createInitialCrawlProgress());
      const before = brandKitRef.current;
      let working = prepareDocForAdditiveSource(before);

      const result = await runner((event) => {
        setCrawlProgress((prev) => reduceCrawlProgress(prev ?? createInitialCrawlProgress(), event));
        if (
          event.type === "progress" ||
          event.type === "page_fetched" ||
          event.type === "llm_status" ||
          event.type === "llm_progress" ||
          event.type === "phase_complete" ||
          event.type === "triage_plan"
        ) {
          return;
        }
        working = applyBrandKitStreamEvent(working, event, { respectLocks: true });
        persistBrandKit(working);
      });

      setIsAnalyzing(false);
      if (result.ok) {
        const polished = enrichBrandKitDocument(validateBrandKitContentQuality(working));
        persistBrandKit(polished);
        pushToast(buildAnalysisCompleteToast(before, polished));
        setTimeout(() => setCrawlProgress(null), 2800);
      } else {
        const message = "message" in result ? result.message : "Error";
        setCrawlError(message);
        pushToast(createBrandKitToast("error", message));
        setCrawlProgress(null);
      }
    },
    [persistBrandKit, pushToast],
  );

  const handleAnalyze = useCallback(
    async (url: string, enableLlm = true) => {
      lastCrawlJobRef.current = { url, enableLlm };
      setLastCrawlJob({ url, enableLlm });
      await runStreamJob((onEvent) => streamBrandKitCrawl(url, onEvent, { enableLlm }));
    },
    [runStreamJob],
  );

  const handleRetryLastJob = useCallback(() => {
    const job = lastCrawlJobRef.current ?? lastCrawlJob;
    if (!job) return;
    void handleAnalyze(job.url, job.enableLlm);
  }, [handleAnalyze]);

  const handleIngestFiles = useCallback(
    async (files: File[], enableLlm = true) => {
      const list = Array.from(files).slice(0, 12);
      if (!list.length) return;
      await runStreamJob((onEvent) => streamBrandKitIngest(list, onEvent, { enableLlm }));
    },
    [runStreamJob],
  );

  const handleGenerateGalleryCategory = useCallback(async (category: GalleryGenerateCategory) => {
    setGeneratingGalleryCategory(category);
    setCrawlError(null);
    setGallerySuccess(null);
    setGalleryProgress(null);
    const snapshot = brandKitRef.current;
    const gallery = snapshot.slots.gallery?.value as GalleryValue | undefined;
    const version = gallery?.stylePromptVersion ?? 0;
    const priorCount = gallery?.generated?.length ?? 0;
    let workingGallery = gallery;

    const result = await streamBrandKitGallery(
      snapshot,
      version,
      (event) => {
        if (event.type === "tone") {
          setGalleryProgress({
            index: 0,
            total: BRAND_KIT_GALLERY_CATEGORY_IMAGE_COUNT,
            category,
            categoryLabel: "",
            message: brandKitLocaleEs.generatingGallery,
            toneExplanation: event.explanation,
            completedItems: [],
          });
          if (workingGallery) {
            workingGallery = { ...workingGallery, styleToneExplanation: event.explanation };
            persistBrandKit(
              applySlotAction(brandKitRef.current, "gallery", { action: "set", value: workingGallery }),
            );
          }
        }
        if (event.type === "progress") {
          setGalleryProgress((prev) => ({
            index: event.index,
            total: event.total,
            category,
            categoryLabel: event.categoryLabel,
            message: event.message,
            toneExplanation: prev?.toneExplanation,
            completedItems: prev?.completedItems ?? [],
          }));
        }
        if (event.type === "image_done" && workingGallery) {
          const withoutCategory = (workingGallery.generated ?? []).filter(
            (entry) => (entry.category ?? "general") !== category,
          );
          const nextItems = [...withoutCategory, event.item];
          workingGallery = { ...workingGallery, generated: nextItems };
          setGalleryProgress((prev) =>
            prev
              ? {
                  ...prev,
                  index: event.index,
                  completedItems: nextItems.filter((entry) => (entry.category ?? "general") === category),
                }
              : null,
          );
          persistBrandKit(applySlotAction(brandKitRef.current, "gallery", { action: "set", value: workingGallery }));
        }
      },
      { category },
    );

    setGeneratingGalleryCategory(null);
    setGalleryProgress(null);
    if (!result.ok) {
      setCrawlError(result.message);
      return;
    }
    const added = result.addedCount ?? Math.max(0, result.gallery.generated.length - priorCount);
    persistBrandKit(applySlotAction(brandKitRef.current, "gallery", { action: "set", value: result.gallery }));
    setFocusGeneratedTab((value) => value + 1);
    setGallerySuccess(
      added > 0 ? brandKitLocaleEs.galleryGeneratedCount(added) : brandKitLocaleEs.galleryGeneratedSuccess,
    );
    window.setTimeout(() => setGallerySuccess(null), 8000);
  }, [persistBrandKit]);

  const handleAnalyzeGalleryBriefs = useCallback(async () => {
    setIsAnalyzingGalleryBriefs(true);
    setCrawlError(null);
    const snapshot = brandKitRef.current;
    const result = await analyzeBrandKitGalleryBriefs(snapshot);
    setIsAnalyzingGalleryBriefs(false);
    if (!result.ok) {
      galleryBriefAttemptKeyRef.current = null;
      setCrawlError(result.message);
      return;
    }
    persistBrandKit(applySlotAction(brandKitRef.current, "gallery", { action: "set", value: result.gallery }));
    galleryBriefAttemptKeyRef.current = computeGalleryBriefSourceKey({
      ...brandKitRef.current,
      slots: {
        ...brandKitRef.current.slots,
        gallery: {
          ...brandKitRef.current.slots.gallery,
          value: result.gallery,
        },
      },
    });
  }, [persistBrandKit]);

  const galleryBriefSourceKey = useMemo(() => computeGalleryBriefSourceKey(brandKit), [brandKit]);

  useEffect(() => {
    galleryBriefAttemptKeyRef.current = null;
  }, [galleryBriefSourceKey]);

  useEffect(() => {
    const gallery = brandKit.slots.gallery?.value as GalleryValue | undefined;
    const visualWorld = brandKit.slots.visualWorld?.value as import("@/lib/brandkit/brand-kit-types").VisualWorldValue | undefined;
    if (!gallery || !visualWorld?.summary?.trim()) return;
    if (galleryIncludedCount(gallery) < GALLERY_BRIEF_MIN_INCLUDED_IMAGES) return;
    if (!gallery.categoryBriefs?.length) return;
    if (galleryBriefsAreFresh(gallery, galleryBriefSourceKey)) return;
    if (isAnalyzingGalleryBriefs || generatingGalleryCategory || isAnalyzing) return;
    if (galleryBriefAttemptKeyRef.current === galleryBriefSourceKey) return;

    galleryBriefAttemptKeyRef.current = galleryBriefSourceKey;
    void handleAnalyzeGalleryBriefs();
  }, [
    brandKit,
    galleryBriefSourceKey,
    generatingGalleryCategory,
    handleAnalyzeGalleryBriefs,
    isAnalyzing,
    isAnalyzingGalleryBriefs,
  ]);

  const handleExportTokens = useCallback(() => {
    void applyBrandKitCompile(brandKit).then((compiledDoc) => {
      if (!compiledDoc.compiled) return;
      downloadJson(`${extractBrandTitle(brandKit, "brandKit")}-tokens.json`, compiledDoc.compiled.paletteTokens);
    });
  }, [brandKit]);

  const handleExportCompiled = useCallback(() => {
    void applyBrandKitCompile(brandKit).then((compiledDoc) => {
      if (!compiledDoc.compiled) return;
      downloadJson(`${extractBrandTitle(brandKit, "brandKit")}-compiled.json`, compiledDoc.compiled);
    });
  }, [brandKit]);

  const handleExportStyleGuidePdf = useCallback(
    async (exportMode: BrandKitStyleGuideExportMode) => {
      setStyleGuideDownloadError(null);
      setStyleGuideDownloadPhase("downloading");
      const result = await downloadBrandKitDocumentStyleGuidePdf(brandKitRef.current, {
        exportMode,
        projectName: extractBrandTitle(brandKitRef.current, nodeLabel?.trim() || "BrandKit"),
        onPhase: (phase) => setStyleGuideDownloadPhase(phase),
      });
      setStyleGuideDownloadPhase("idle");
      if (!result.ok) {
        setStyleGuideDownloadError(result.message);
        pushToast(createBrandKitToast("error", result.message));
        return;
      }
      if (result.usedHtmlFallback) {
        pushToast(createBrandKitToast("neutral", "Chromium no disponible — descargado como HTML."));
      }
    },
    [nodeLabel, pushToast],
  );

  const title = extractBrandTitle(brandKit, nodeLabel?.trim() || "BrandKit");
  const subtitle = crawlProgress?.message ?? (isAnalyzing ? "Analizando…" : undefined);
  const completeness = computeBrandKitCompleteness(brandKit);
  const canExport = completeness.percent >= 40 && Boolean(brandKit.compiled);
  const exportBlockedReason = brandKitExportBlockedReason(brandKit, completeness.percent);
  const showBoard = !isBrandKitEmpty(brandKit) || isAnalyzing;

  return (
    <div
      className="brandKit-studio-root fixed inset-0 z-[100090] flex flex-col bg-[#0b0f14]"
      data-foldder-studio-panel
      data-foldder-studio-canvas
      data-foldder-brandkit-studio
      role="dialog"
      aria-modal="true"
      aria-label="BrandKit studio"
      style={{ ["--foldder-studio-accent" as string]: BRAND_KIT_STUDIO_ACCENT }}
    >
      <BrandKitStudioToastStack toasts={toasts} onDismiss={dismissToast} />
      <FoldderStudioHeader
        nodeType="brandKit"
        nodeLabel={title}
        subtitle={subtitle ?? "Brand intelligence studio"}
        onClose={onClose}
      />

      <div
        className="brandKit-studio brandKit-studio--v2 brandKit-studio--split min-h-0 flex-1"
        style={{ ["--brandKit-v2-accent" as string]: BRAND_KIT_STUDIO_ACCENT }}
      >
        <BrandKitSidebarPanel
          doc={brandKit}
          completenessPercent={completeness.percent}
          isAnalyzing={isAnalyzing}
          crawlProgress={crawlProgress}
          crawlError={crawlError}
          canExport={canExport}
          exportBlockedReason={exportBlockedReason}
          onAnalyze={(url, enableLlm) => void handleAnalyze(url, enableLlm)}
          onRetryLastJob={handleRetryLastJob}
          canRetryLastJob={Boolean(lastCrawlJob) && Boolean(crawlError)}
          onIngestFiles={(files) => void handleIngestFiles(files)}
          onExportTokens={handleExportTokens}
          onExportCompiled={handleExportCompiled}
          onExportStyleGuidePdf={(mode) => void handleExportStyleGuidePdf(mode)}
          styleGuideDownloadPhase={styleGuideDownloadPhase}
          styleGuideDownloadError={styleGuideDownloadError}
          onSetAuthoritativeSource={handleSetAuthoritativeSource}
          onStartReview={() => setReviewMode(true)}
          reviewMode={reviewMode}
          presentationMode={presentationMode}
          onPresentationModeChange={setPresentationMode}
          onBrandNameChange={handleBrandNameChange}
        />

        <main className="brandKit-studio-split__main brandKit-studio__board-shell">
          {showBoard ? (
            <BrandKitBoardV2
              doc={brandKit}
              onAction={handleAction}
              onLogoUpload={handleLogoUpload}
              isAnalyzing={isAnalyzing}
              generatingGalleryCategory={generatingGalleryCategory}
              focusGeneratedTab={focusGeneratedTab}
              gallerySuccessMessage={gallerySuccess}
              galleryProgress={galleryProgress}
              onGenerateGalleryCategory={(category) => void handleGenerateGalleryCategory(category)}
              onAnalyzeGalleryBriefs={() => {
                galleryBriefAttemptKeyRef.current = null;
                void handleAnalyzeGalleryBriefs();
              }}
              isAnalyzingGalleryBriefs={isAnalyzingGalleryBriefs}
              onExportTokens={handleExportTokens}
              onExportCompiled={handleExportCompiled}
              canExport={canExport}
              hideExportActions
              activeSlotId={crawlProgress?.activeSlot}
              presentationMode={presentationMode}
              reviewMode={reviewMode}
              onReviewModeChange={setReviewMode}
              onReviewComplete={handleReviewComplete}
            />
          ) : (
            <BrandKitBoardEmpty />
          )}
        </main>
      </div>
    </div>
  );
}
