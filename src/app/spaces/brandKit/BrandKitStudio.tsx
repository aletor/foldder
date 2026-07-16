"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BrandKitStudioHeader } from "./BrandKitStudioHeader";
import type { BrandKitStudioMode } from "@/lib/brandkit/studio/brand-kit-studio-mode";
import { isPresentationMode } from "@/lib/brandkit/studio/brand-kit-studio-mode";
import type { GalleryValue, BrandKitDocument, SlotAction, SlotId, BrandKitStationeryContact } from "@/lib/brandkit/brand-kit-types";
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
import { saveBrandKitToInspiration } from "../inspiration/save-brandkit";
import { useProjectAssetsCanvas } from "../project-assets-canvas-context";
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
  reduceCrawlProgress,
  type BrandKitCrawlProgressState,
} from "./BrandKitCrawlProgress";
import { BrandKitBoardV2 } from "./board-v2/BrandKitBoardV2";
import { BrandKitMosaicBoardProvider } from "./board-v2/brand-kit-mosaic-context";
import { BrandKitSidebarPanel } from "./BrandKitSidebarPanel";
import { BrandKitStudioOnboarding } from "./BrandKitStudioOnboarding";
import { BrandKitStudioWorkspace } from "./BrandKitStudioWorkspace";
import { BrandKitStudioToastStack } from "./BrandKitStudioToast";
import type { BrandKitStyleGuideExportMode } from "@/lib/brandkit/projection/style-guide-export-types";
import { evaluateFinalStyleGuideExport } from "@/lib/brandkit/brand-kit-presentation-export";
import { shouldPreflightStyleGuideExport } from "@/lib/brandkit/studio/brand-kit-studio-export";
import {
  isBrandKitStudioOnboardingLayout,
  shouldUnlockBrandKitStudioShell,
} from "@/lib/brandkit/studio/brand-kit-studio-shell";
import { downloadBrandKitDocumentStyleGuidePdf } from "@/lib/brandkit/projection/brand-kit-style-guide-download.client";
import {
  buildAnalysisCompleteToast,
  buildAuthoritativeToast,
  buildLogoUploadToast,
  buildSlotActionToast,
  createBrandKitToast,
  type BrandKitToast,
} from "@/lib/brandkit/brand-kit-studio-feedback";
import { BRAND_KIT_GALLERY_CATEGORY_IMAGE_COUNT, BRAND_KIT_GALLERY_GENERATE_IMAGE_COUNT as BRAND_KIT_GALLERY_IMAGE_COUNT } from "@/lib/brandkit/brand-kit-gallery-cost";
import type { GalleryGenerateCategory, GalleryGenerateScope } from "@/lib/brandkit/brand-kit-gallery-plan";
import { mergeSingleGallerySlot } from "@/lib/brandkit/brand-kit-gallery-plan";
import { resolveBrandKitSidebarPhase } from "@/lib/brandkit/studio/sidebar-phase";
import "./brand-kit.css";
import "./brand-kit-board-theme.css";
import "./board-v2/brand-kit-board-motion.css";
import "./brand-kit-split-layout.css";
import "./brand-kit-sidebar-redesign.css";
import "./brand-kit-studio-header.css";
import "./brand-kit-studio-inspector.css";
import "./brand-kit-studio-layout.css";
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
  const projectAssetsCtx = useProjectAssetsCanvas();
  const projectId = projectAssetsCtx?.projectScopeId ?? null;
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [generatingGallery, setGeneratingGallery] = useState<GalleryGenerateScope | null>(null);
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
  const lastCrawlJobRef = useRef<{ url: string; enableLlm: boolean } | null>(null);
  const [lastCrawlJob, setLastCrawlJob] = useState<{ url: string; enableLlm: boolean } | null>(null);
  const [styleGuideDownloadPhase, setStyleGuideDownloadPhase] = useState<"idle" | "vectorizing" | "downloading">("idle");
  const [styleGuideDownloadError, setStyleGuideDownloadError] = useState<string | null>(null);
  const [studioMode, setStudioMode] = useState<BrandKitStudioMode>("presentation");
  const [reviewMode, setReviewMode] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [shellUnlocked, setShellUnlocked] = useState(() => brandKit.sources.length > 0);
  const [saveToLibraryBusy, setSaveToLibraryBusy] = useState(false);
  const presentationMode = isPresentationMode(studioMode);
  const prevSidebarPhaseRef = useRef<ReturnType<typeof resolveBrandKitSidebarPhase> | null>(null);

  const sidebarPhase = useMemo(
    () => resolveBrandKitSidebarPhase(brandKit, { isAnalyzing }),
    [brandKit, isAnalyzing],
  );

  const onboardingLayout = isBrandKitStudioOnboardingLayout({
    sourceCount: brandKit.sources.length,
    isAnalyzing,
    shellUnlocked,
  });

  useEffect(() => {
    if (
      shouldUnlockBrandKitStudioShell({
        sourceCount: brandKit.sources.length,
        isAnalyzing,
      })
    ) {
      setShellUnlocked(true);
    }
  }, [brandKit.sources.length, isAnalyzing]);

  useEffect(() => {
    const prev = prevSidebarPhaseRef.current;
    prevSidebarPhaseRef.current = sidebarPhase;
    if (onboardingLayout) return;
    if (sidebarPhase === "ready" && prev !== "ready") {
      setSidebarOpen(studioMode === "edit");
    }
  }, [sidebarPhase, studioMode, onboardingLayout]);

  useEffect(() => {
    if (onboardingLayout) {
      setReviewMode(false);
      setSidebarOpen(false);
      return;
    }
    if (presentationMode) {
      setReviewMode(false);
      setSidebarOpen(false);
    }
  }, [presentationMode, onboardingLayout]);

  useEffect(() => {
    if (onboardingLayout || presentationMode) return;
    const mq = window.matchMedia("(max-width: 1100px)");
    const apply = () => {
      if (mq.matches) setSidebarOpen(false);
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [presentationMode, onboardingLayout]);

  useEffect(() => {
    if (!shellUnlocked || onboardingLayout) return;
    if (studioMode === "edit" && (sidebarPhase === "ready" || sidebarPhase === "review")) {
      setSidebarOpen(true);
    }
  }, [shellUnlocked, onboardingLayout, studioMode, sidebarPhase]);

  const handleStudioModeChange = useCallback((mode: BrandKitStudioMode) => {
    setStudioMode(mode);
    if (mode === "presentation") {
      setReviewMode(false);
      setSidebarOpen(false);
    } else if (sidebarPhase === "ready" || sidebarPhase === "review") {
      setSidebarOpen(true);
    }
  }, [sidebarPhase]);

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

  const runGalleryGenerate = useCallback(async (scope: GalleryGenerateScope) => {
    setGeneratingGallery(scope);
    setCrawlError(null);
    setGallerySuccess(null);
    setGalleryProgress(null);
    const snapshot = brandKitRef.current;
    const gallery = snapshot.slots.gallery?.value as GalleryValue | undefined;
    const version = gallery?.stylePromptVersion ?? 0;
    const priorCount = gallery?.generated?.length ?? 0;
    let workingGallery = gallery;
    const category = scope.scope === "all" ? undefined : scope.category;
    const variantIndex = scope.scope === "slot" ? scope.variantIndex : undefined;
    const progressCategory = scope.scope === "all" ? null : scope.category;

    const result = await streamBrandKitGallery(
      snapshot,
      version,
      (event) => {
        if (event.type === "tone") {
          setGalleryProgress({
            index: 0,
            total: variantIndex != null ? 1 : category ? BRAND_KIT_GALLERY_CATEGORY_IMAGE_COUNT : BRAND_KIT_GALLERY_IMAGE_COUNT,
            category: progressCategory,
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
            category: (event.category as GalleryGenerateCategory | undefined) ?? progressCategory ?? null,
            categoryLabel: event.categoryLabel,
            message: event.message,
            toneExplanation: prev?.toneExplanation,
            completedItems: prev?.completedItems ?? [],
          }));
        }
        if (event.type === "image_done" && workingGallery) {
          const item = event.item;
          const itemCategory = (item.category ?? category) as GalleryGenerateCategory | undefined;
          let nextGenerated = workingGallery.generated ?? [];
          if (itemCategory) {
            if (scope.scope === "slot" && variantIndex != null) {
              nextGenerated = mergeSingleGallerySlot(nextGenerated, itemCategory, variantIndex, item);
            } else if (scope.scope === "category") {
              const withoutCategory = nextGenerated.filter(
                (entry) => (entry.category ?? "general") !== itemCategory,
              );
              nextGenerated = [...withoutCategory, item];
            } else {
              const slotIndex = item.variantIndex ?? 0;
              nextGenerated = mergeSingleGallerySlot(nextGenerated, itemCategory, slotIndex, item);
            }
          }
          workingGallery = { ...workingGallery, generated: nextGenerated };
          setGalleryProgress((prev) =>
            prev
              ? {
                  ...prev,
                  index: event.index,
                  completedItems: itemCategory
                    ? nextGenerated.filter((entry) => (entry.category ?? "general") === itemCategory)
                    : nextGenerated,
                }
              : null,
          );
          persistBrandKit(applySlotAction(brandKitRef.current, "gallery", { action: "set", value: workingGallery }));
        }
      },
      { category, variantIndex },
    );

    setGeneratingGallery(null);
    setGalleryProgress(null);
    if (!result.ok) {
      setCrawlError(result.message);
      return;
    }
    const added = result.addedCount ?? Math.max(0, result.gallery.generated.length - priorCount);
    persistBrandKit(applySlotAction(brandKitRef.current, "gallery", { action: "set", value: result.gallery }));
    const issueCount = Object.keys(result.gallery.slotIssues ?? {}).length;
    if (issueCount > 0 && added === 0) {
      const firstIssue = Object.values(result.gallery.slotIssues ?? {})[0];
      setCrawlError(firstIssue?.error ?? brandKitLocaleEs.galleryImageStateError);
    } else if (issueCount > 0) {
      setCrawlError(brandKitLocaleEs.galleryPartialError(issueCount));
    }
    setFocusGeneratedTab((value) => value + 1);
    setGallerySuccess(
      added > 0 ? brandKitLocaleEs.galleryGeneratedCount(added) : brandKitLocaleEs.galleryGeneratedSuccess,
    );
    window.setTimeout(() => setGallerySuccess(null), 8000);
  }, [persistBrandKit]);

  const handleGenerateGalleryCategory = useCallback(
    (category: GalleryGenerateCategory) => void runGalleryGenerate({ scope: "category", category }),
    [runGalleryGenerate],
  );

  const handleGenerateGallerySlot = useCallback(
    (category: GalleryGenerateCategory, variantIndex: number) =>
      void runGalleryGenerate({ scope: "slot", category, variantIndex }),
    [runGalleryGenerate],
  );

  const handleGenerateAllGallery = useCallback(
    () => void runGalleryGenerate({ scope: "all" }),
    [runGalleryGenerate],
  );

  const handleAnalyzeGalleryBriefs = useCallback(async () => {
    setIsAnalyzingGalleryBriefs(true);
    setCrawlError(null);
    const snapshot = brandKitRef.current;
    const result = await analyzeBrandKitGalleryBriefs(snapshot);
    setIsAnalyzingGalleryBriefs(false);
    if (!result.ok) {
      setCrawlError(result.message);
      return;
    }
    persistBrandKit(applySlotAction(brandKitRef.current, "gallery", { action: "set", value: result.gallery }));
  }, [persistBrandKit]);

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
      if (shouldPreflightStyleGuideExport(exportMode)) {
        const preflight = evaluateFinalStyleGuideExport(brandKitRef.current);
        if (preflight.shouldWarn && !window.confirm(preflight.message)) {
          return;
        }
      }

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

  const handleStationeryContactChange = useCallback(
    (contact: BrandKitStationeryContact) => {
      persistBrandKit({
        ...brandKitRef.current,
        stationeryContact: contact,
        updatedAt: new Date().toISOString(),
      });
    },
    [persistBrandKit],
  );

  const title = extractBrandTitle(brandKit, nodeLabel?.trim() || "BrandKit");
  const showBoard = !onboardingLayout && (!isBrandKitEmpty(brandKit) || isAnalyzing);
  const completeness = computeBrandKitCompleteness(brandKit);
  const canExport = !onboardingLayout && completeness.percent >= 40 && Boolean(brandKit.compiled);
  const exportBlockedReason = brandKitExportBlockedReason(brandKit, completeness.percent);
  const canSaveToLibrary = !onboardingLayout && !isBrandKitEmpty(brandKit) && !isAnalyzing;
  const saveToLibraryBlockedReason = !canSaveToLibrary
    ? brandKitLocaleEs.saveToMisBrandKitsEmpty
    : null;

  const handleSaveToMisBrandKits = useCallback(async () => {
    if (!canSaveToLibrary || saveToLibraryBusy) return;
    setSaveToLibraryBusy(true);
    try {
      await saveBrandKitToInspiration({
        brandKit: brandKitRef.current,
        title,
        projectId,
      });
      setToasts((prev) => [
        ...prev,
        createBrandKitToast(
          "success",
          brandKitLocaleEs.saveToMisBrandKitsDone,
          brandKitLocaleEs.saveToMisBrandKitsHint,
        ),
      ]);
    } catch (error) {
      setToasts((prev) => [
        ...prev,
        createBrandKitToast(
          "error",
          brandKitLocaleEs.saveToMisBrandKitsError,
          error instanceof Error ? error.message : undefined,
        ),
      ]);
    } finally {
      setSaveToLibraryBusy(false);
    }
  }, [canSaveToLibrary, projectId, saveToLibraryBusy, title]);
  const headerMeta = onboardingLayout
    ? isAnalyzing
      ? "Analizando…"
      : undefined
    : isAnalyzing
      ? "Analizando…"
      : `${completeness.percent}% ADN · ${canExport ? brandKitLocaleEs.exportReadyLabel : brandKitLocaleEs.exportPendingLabel}`;
  const exportBusy = styleGuideDownloadPhase !== "idle";
  const exportBusyLabel =
    styleGuideDownloadPhase === "vectorizing"
      ? brandKitLocaleEs.vectorizingLogo
      : brandKitLocaleEs.downloadingPdf;

  return (
    <div
      className="brandKit-studio-root fixed inset-0 z-[100090] flex flex-col bg-[#0b0f14]"
      data-foldder-studio-panel
      data-foldder-studio-canvas
      data-foldder-brandkit-studio
      data-brandkit-onboarding={onboardingLayout ? "true" : "false"}
      role="dialog"
      aria-modal="true"
      aria-label="BrandKit studio"
      style={{ ["--foldder-studio-accent" as string]: BRAND_KIT_STUDIO_ACCENT }}
    >
      <BrandKitStudioToastStack toasts={toasts} onDismiss={dismissToast} />
      <BrandKitStudioHeader
        title={title}
        meta={crawlProgress?.message ?? headerMeta}
        studioMode={studioMode}
        onStudioModeChange={handleStudioModeChange}
        canExport={canExport}
        exportBlockedReason={exportBlockedReason ?? undefined}
        exportBusy={exportBusy}
        exportBusyLabel={exportBusyLabel}
        onExportPdf={!onboardingLayout && showBoard ? (mode) => void handleExportStyleGuidePdf(mode) : undefined}
        onExportTokens={!onboardingLayout && showBoard ? handleExportTokens : undefined}
        onExportCompiled={!onboardingLayout && showBoard ? handleExportCompiled : undefined}
        canSaveToLibrary={canSaveToLibrary}
        saveToLibraryBusy={saveToLibraryBusy}
        saveToLibraryBlockedReason={saveToLibraryBlockedReason}
        onSaveToMisBrandKits={
          !onboardingLayout && showBoard ? () => void handleSaveToMisBrandKits() : undefined
        }
        onClose={onClose}
      />

      <div
        className={`brandKit-studio brandKit-studio--v2 brandKit-studio--split min-h-0 flex-1 brandKit-studio--mode-${studioMode}${onboardingLayout ? " brandKit-studio--onboarding" : ""}${!onboardingLayout && !sidebarOpen ? " brandKit-studio--split-sidebar-collapsed" : ""}`}
        style={{ ["--brandKit-v2-accent" as string]: BRAND_KIT_STUDIO_ACCENT }}
      >
        <BrandKitMosaicBoardProvider studioMode={studioMode} doc={brandKit} onSlotAction={handleAction}>
          <BrandKitStudioWorkspace
            onboarding={onboardingLayout}
            sidebar={
              <BrandKitSidebarPanel
                doc={brandKit}
                completenessPercent={completeness.percent}
                kitTitle={title}
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
                onSetAuthoritativeSource={handleSetAuthoritativeSource}
                onReanalyzeSource={(ref) => {
                  const source = brandKit.sources.find((entry) => entry.ref === ref);
                  if (source?.kind === "url") void handleAnalyze(source.ref, true);
                }}
                onStartReview={() => {
                  if (studioMode === "edit") setReviewMode(true);
                }}
                reviewMode={reviewMode}
                studioMode={studioMode}
                onBrandNameChange={handleBrandNameChange}
                sidebarOpen={sidebarOpen}
                onSidebarToggle={() => setSidebarOpen((open) => !open)}
                activeSlotId={crawlProgress?.activeSlot}
              />
            }
          >
            {onboardingLayout ? (
              <BrandKitStudioOnboarding
                isAnalyzing={isAnalyzing}
                crawlProgress={crawlProgress}
                crawlError={crawlError}
                onAnalyze={(url, enableLlm) => void handleAnalyze(url, enableLlm)}
                onIngestFiles={(files) => void handleIngestFiles(files)}
                onRetryLastJob={handleRetryLastJob}
                canRetryLastJob={Boolean(lastCrawlJob) && Boolean(crawlError)}
              />
            ) : (
              <main className="brandKit-studio-split__main brandKit-studio__board-shell">
                {showBoard ? (
                  <BrandKitBoardV2
                    doc={brandKit}
                    onAction={handleAction}
                    onLogoUpload={handleLogoUpload}
                    isAnalyzing={isAnalyzing}
                    generatingGallery={generatingGallery}
                    focusGeneratedTab={focusGeneratedTab}
                    gallerySuccessMessage={gallerySuccess}
                    galleryProgress={galleryProgress}
                    onGenerateGalleryCategory={(category) => void handleGenerateGalleryCategory(category)}
                    onGenerateGallerySlot={handleGenerateGallerySlot}
                    onGenerateAllGallery={handleGenerateAllGallery}
                    onAnalyzeGalleryBriefs={() => void handleAnalyzeGalleryBriefs()}
                    isAnalyzingGalleryBriefs={isAnalyzingGalleryBriefs}
                    onExportTokens={handleExportTokens}
                    onExportCompiled={handleExportCompiled}
                    canExport={canExport}
                    hideExportActions
                    activeSlotId={crawlProgress?.activeSlot}
                    presentationMode={presentationMode}
                    reviewMode={reviewMode && !presentationMode}
                    onReviewModeChange={setReviewMode}
                    onReviewComplete={handleReviewComplete}
                    onStationeryContactChange={handleStationeryContactChange}
                    onRequestEditMode={() => handleStudioModeChange("edit")}
                  />
                ) : null}
              </main>
            )}
          </BrandKitStudioWorkspace>
        </BrandKitMosaicBoardProvider>
      </div>
    </div>
  );
}
