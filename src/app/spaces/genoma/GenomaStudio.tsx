"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FoldderStudioHeader } from "../FoldderStudioHeader";
import type { GalleryValue, GenomaDocument, SlotAction, SlotId } from "@/lib/genoma/genoma-types";
import { externalGalleryMediaUrls } from "@/lib/genoma/genoma-gallery-media";
import { applySlotAction } from "@/lib/genoma/genoma-slot-actions";
import { enrichGenomaDocument } from "@/lib/genoma/genoma-enrich";
import { validateGenomaContentQuality } from "@/lib/genoma/genoma-content-quality";
import { genomaLocaleEs } from "@/lib/genoma/genoma-locale.es";
import { genomaExportBlockedReason } from "@/lib/genoma/genoma-board-status";
import {
  computeGenomaCompleteness,
  extractBrandTitle,
  isGenomaEmpty,
} from "@/lib/genoma/genoma-defaults";
import {
  applyGenomaCompile,
  applyGenomaStreamEvent,
  applySourceAuthoritative,
  hydrateGenomaGalleryMedia,
  prepareDocForAdditiveSource,
  streamGenomaCrawl,
  streamGenomaGallery,
  streamGenomaIngest,
  type GenomaGalleryGenerateProgress,
} from "./genoma-api";
import {
  createInitialCrawlProgress,
  GenomaCrawlProgress,
  reduceCrawlProgress,
  type GenomaCrawlProgressState,
} from "./GenomaCrawlProgress";
import { GenomaBoardV2 } from "./board-v2/GenomaBoardV2";
import { GenomaBoardEmpty } from "./GenomaBoardEmpty";
import { GenomaSidebarPanel } from "./GenomaSidebarPanel";
import { GenomaStudioToastStack } from "./GenomaStudioToast";
import { buildStudioIngestFeedback } from "@/lib/genoma/studio/studio-ingest-feedback";
import type { GenomaStyleGuideExportMode } from "@/lib/genoma/projection/style-guide-export-types";
import { downloadGenomaDocumentStyleGuidePdf } from "@/lib/genoma/projection/genoma-style-guide-download.client";
import {
  buildAnalysisCompleteToast,
  buildAuthoritativeToast,
  buildLogoUploadToast,
  buildSlotActionToast,
  createGenomaToast,
  type GenomaToast,
} from "@/lib/genoma/genoma-studio-feedback";
import { GENOMA_GALLERY_GENERATE_IMAGE_COUNT } from "@/lib/genoma/genoma-gallery-cost";
import "./genoma.css";
import "./genoma-board-theme.css";
import "./genoma-split-layout.css";
import "./genoma-media.css";

const GENOMA_STUDIO_ACCENT = "#FFBD1B";

type GenomaStudioProps = {
  nodeId: string;
  nodeLabel?: string;
  genoma: GenomaDocument;
  onGenomaChange: (next: GenomaDocument) => void;
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

export function GenomaStudio({ nodeId, nodeLabel, genoma, onGenomaChange, onClose }: GenomaStudioProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGeneratingGallery, setIsGeneratingGallery] = useState(false);
  const [crawlError, setCrawlError] = useState<string | null>(null);
  const [gallerySuccess, setGallerySuccess] = useState<string | null>(null);
  const [galleryProgress, setGalleryProgress] = useState<GenomaGalleryGenerateProgress | null>(null);
  const [focusGeneratedTab, setFocusGeneratedTab] = useState(0);
  const [crawlProgress, setCrawlProgress] = useState<GenomaCrawlProgressState | null>(null);
  const [toasts, setToasts] = useState<GenomaToast[]>([]);
  const compileTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const genomaRef = useRef(genoma);
  const galleryHydrateKeyRef = useRef("");
  const lastCrawlJobRef = useRef<{ url: string; enableLlm: boolean } | null>(null);
  const [lastCrawlJob, setLastCrawlJob] = useState<{ url: string; enableLlm: boolean } | null>(null);
  const [styleGuideDownloadPhase, setStyleGuideDownloadPhase] = useState<"idle" | "vectorizing" | "downloading">("idle");
  const [styleGuideDownloadError, setStyleGuideDownloadError] = useState<string | null>(null);
  genomaRef.current = genoma;

  const pushToast = useCallback((toast: GenomaToast) => {
    setToasts((prev) => [...prev.slice(-3), toast]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const persistGenoma = useCallback(
    (next: GenomaDocument) => {
      onGenomaChange(next);
    },
    [onGenomaChange],
  );

  const handleAction = useCallback(
    (slotId: SlotId, action: SlotAction) => {
      persistGenoma(applySlotAction(genomaRef.current, slotId, action));
      const toast = buildSlotActionToast(slotId, action);
      if (toast) pushToast(toast);
    },
    [persistGenoma, pushToast],
  );

  const handleBrandNameChange = useCallback(
    (name: string) => {
      persistGenoma({
        ...genoma,
        brandName: {
          value: name,
          provenance: { type: "user_input", detail: "tú" },
        },
      });
    },
    [genoma, persistGenoma],
  );

  useEffect(() => {
    if (isGenomaEmpty(genoma)) return;
    if (compileTimer.current) clearTimeout(compileTimer.current);
    compileTimer.current = setTimeout(() => {
      const snapshot = genomaRef.current;
      void applyGenomaCompile(snapshot).then((compiled) => {
        const latest = genomaRef.current;
        const next = {
          ...latest,
          compiled: compiled.compiled,
          compiledHash: compiled.compiledHash,
          updatedAt: new Date().toISOString(),
        };
        if (next.compiledHash !== latest.compiledHash) {
          persistGenoma(next);
        }
      });
    }, 2000);
    return () => {
      if (compileTimer.current) clearTimeout(compileTimer.current);
    };
  }, [genoma, persistGenoma]);

  useEffect(() => {
    const gallery = genoma.slots.gallery?.value as GalleryValue | undefined;
    const external = externalGalleryMediaUrls(gallery);
    const signature = external.slice().sort().join("|");
    if (!signature || galleryHydrateKeyRef.current === signature) return;

    let cancelled = false;
    galleryHydrateKeyRef.current = signature;
    void hydrateGenomaGalleryMedia(genomaRef.current).then((next) => {
      if (cancelled) return;
      if (next !== genomaRef.current) persistGenoma(next);
    });

    return () => {
      cancelled = true;
    };
  }, [genoma.slots.gallery?.value, persistGenoma]);

  const handleSetAuthoritativeSource = useCallback(
    (sourceRef: string, authoritative: boolean) => {
      const next = applySourceAuthoritative(genomaRef.current, sourceRef, authoritative);
      persistGenoma(next);
      pushToast(buildAuthoritativeToast(next, authoritative));
    },
    [persistGenoma, pushToast],
  );

  const handleLogoUpload = useCallback(
    async (file: File) => {
      setCrawlError(null);
      let working = genomaRef.current;
      const result = await streamGenomaIngest([file], (event) => {
        if (event.type === "slot_update" || event.type === "source_added" || event.type === "brand_name") {
          working = applyGenomaStreamEvent(working, event, { respectLocks: true });
        }
      }, { enableLlm: false });
      if (!result.ok) {
        setCrawlError(result.message);
        return;
      }
      persistGenoma(enrichGenomaDocument(working));
      pushToast(buildLogoUploadToast());
    },
    [persistGenoma, pushToast],
  );

  const runStreamJob = useCallback(
    async (
      runner: (onEvent: (event: import("@/lib/genoma/crawl/types").GenomaStreamEvent) => void) => Promise<
        { ok: true } | { ok: false; message: string } | { ok: true; url: string }
      >,
    ) => {
      setIsAnalyzing(true);
      setCrawlError(null);
      setCrawlProgress(createInitialCrawlProgress());
      const before = genomaRef.current;
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
        working = applyGenomaStreamEvent(working, event, { respectLocks: true });
        persistGenoma(working);
      });

      setIsAnalyzing(false);
      if (result.ok) {
        const polished = enrichGenomaDocument(validateGenomaContentQuality(working));
        persistGenoma(polished);
        pushToast(buildAnalysisCompleteToast(before, polished));
        setTimeout(() => setCrawlProgress(null), 2800);
      } else {
        const message = "message" in result ? result.message : "Error";
        setCrawlError(message);
        pushToast(createGenomaToast("error", message));
        setCrawlProgress(null);
      }
    },
    [persistGenoma, pushToast],
  );

  const handleAnalyze = useCallback(
    async (url: string, enableLlm = true) => {
      lastCrawlJobRef.current = { url, enableLlm };
      setLastCrawlJob({ url, enableLlm });
      await runStreamJob((onEvent) => streamGenomaCrawl(url, onEvent, { enableLlm }));
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
      await runStreamJob((onEvent) => streamGenomaIngest(files, onEvent, { enableLlm }));
    },
    [runStreamJob],
  );

  const handleGenerateGallery = useCallback(async () => {
    setIsGeneratingGallery(true);
    setCrawlError(null);
    setGallerySuccess(null);
    setGalleryProgress(null);
    const snapshot = genomaRef.current;
    const gallery = snapshot.slots.gallery?.value as import("@/lib/genoma/genoma-types").GalleryValue | undefined;
    const version = gallery?.stylePromptVersion ?? 0;
    const priorGenerated = gallery?.generated?.length ?? 0;
    let workingGallery = gallery;

    const result = await streamGenomaGallery(snapshot, version, (event) => {
      if (event.type === "tone") {
        setGalleryProgress({
          index: 0,
          total: GENOMA_GALLERY_GENERATE_IMAGE_COUNT,
          categoryLabel: "",
          message: genomaLocaleEs.generatingGallery,
          toneExplanation: event.explanation,
          completedItems: [],
        });
        if (workingGallery) {
          workingGallery = { ...workingGallery, styleToneExplanation: event.explanation };
          persistGenoma(
            applySlotAction(genomaRef.current, "gallery", { action: "set", value: workingGallery }),
          );
        }
      }
      if (event.type === "progress") {
        setGalleryProgress((prev) => ({
          index: event.index,
          total: event.total,
          categoryLabel: event.categoryLabel,
          message: event.message,
          toneExplanation: prev?.toneExplanation,
          completedItems: prev?.completedItems ?? [],
        }));
      }
      if (event.type === "image_done" && workingGallery) {
        const nextItems = [...(workingGallery.generated ?? []), event.item];
        workingGallery = { ...workingGallery, generated: nextItems };
        setGalleryProgress((prev) =>
          prev
            ? {
                ...prev,
                index: event.index,
                completedItems: nextItems.slice(-event.index),
              }
            : null,
        );
        persistGenoma(applySlotAction(genomaRef.current, "gallery", { action: "set", value: workingGallery }));
      }
    });

    setIsGeneratingGallery(false);
    setGalleryProgress(null);
    if (!result.ok) {
      setCrawlError(result.message);
      return;
    }
    const added = result.addedCount ?? result.gallery.generated.length - priorGenerated;
    persistGenoma(applySlotAction(genomaRef.current, "gallery", { action: "set", value: result.gallery }));
    setFocusGeneratedTab((value) => value + 1);
    setGallerySuccess(added > 0 ? genomaLocaleEs.galleryGeneratedCount(added) : genomaLocaleEs.galleryGeneratedSuccess);
    window.setTimeout(() => setGallerySuccess(null), 8000);
  }, [persistGenoma]);

  const handleRecalibrateGallery = useCallback(() => {
    const gallery = genoma.slots.gallery?.value as import("@/lib/genoma/genoma-types").GalleryValue | undefined;
    if (!gallery) return;
    handleAction("gallery", {
      action: "set",
      value: { ...gallery, stylePromptVersion: (gallery.stylePromptVersion ?? 0) + 1 },
    });
  }, [genoma, handleAction]);

  const handleExportTokens = useCallback(() => {
    void applyGenomaCompile(genoma).then((compiledDoc) => {
      if (!compiledDoc.compiled) return;
      downloadJson(`${extractBrandTitle(genoma, "genoma")}-tokens.json`, compiledDoc.compiled.paletteTokens);
    });
  }, [genoma]);

  const handleExportCompiled = useCallback(() => {
    void applyGenomaCompile(genoma).then((compiledDoc) => {
      if (!compiledDoc.compiled) return;
      downloadJson(`${extractBrandTitle(genoma, "genoma")}-compiled.json`, compiledDoc.compiled);
    });
  }, [genoma]);

  const handleExportStyleGuidePdf = useCallback(
    async (exportMode: GenomaStyleGuideExportMode) => {
      setStyleGuideDownloadError(null);
      setStyleGuideDownloadPhase("downloading");
      const result = await downloadGenomaDocumentStyleGuidePdf(genomaRef.current, {
        exportMode,
        projectName: extractBrandTitle(genomaRef.current, nodeLabel?.trim() || "Genoma"),
        onPhase: (phase) => setStyleGuideDownloadPhase(phase),
      });
      setStyleGuideDownloadPhase("idle");
      if (!result.ok) {
        setStyleGuideDownloadError(result.message);
        pushToast(createGenomaToast("error", result.message));
        return;
      }
      if (result.usedHtmlFallback) {
        pushToast(createGenomaToast("neutral", "Chromium no disponible — descargado como HTML."));
      }
    },
    [nodeLabel, pushToast],
  );

  const ingestFeedback = useMemo(
    () => buildStudioIngestFeedback(genoma, { isAnalyzing, crawlProgress }),
    [genoma, isAnalyzing, crawlProgress],
  );

  const title = extractBrandTitle(genoma, nodeLabel?.trim() || "Genoma");
  const subtitle = crawlProgress?.message ?? (isAnalyzing ? "Analizando…" : undefined);
  const completeness = computeGenomaCompleteness(genoma);
  const canExport = completeness.percent >= 40 && Boolean(genoma.compiled);
  const exportBlockedReason = genomaExportBlockedReason(genoma, completeness.percent);
  const showBoard = !isGenomaEmpty(genoma) || isAnalyzing;

  return (
    <div
      className="genoma-studio-root fixed inset-0 z-[100090] flex flex-col bg-[#0b0f14]"
      data-foldder-studio-panel
      data-foldder-studio-canvas
      data-foldder-genoma-studio
      role="dialog"
      aria-modal="true"
      aria-label="Genoma studio"
      style={{ ["--foldder-studio-accent" as string]: GENOMA_STUDIO_ACCENT }}
    >
      <GenomaStudioToastStack toasts={toasts} onDismiss={dismissToast} />
      <FoldderStudioHeader
        nodeType="genoma"
        nodeLabel={title}
        subtitle={subtitle ?? "Brand intelligence studio"}
        onClose={onClose}
      />

      <div
        className="genoma-studio genoma-studio--v2 genoma-studio--split min-h-0 flex-1"
        style={{ ["--genoma-v2-accent" as string]: GENOMA_STUDIO_ACCENT }}
      >
        <GenomaSidebarPanel
          doc={genoma}
          completenessPercent={completeness.percent}
          isAnalyzing={isAnalyzing}
          crawlProgress={crawlProgress}
          crawlError={crawlError}
          canExport={canExport}
          exportBlockedReason={exportBlockedReason}
          onAnalyze={(url, enableLlm) => void handleAnalyze(url, enableLlm)}
          onRetryLastJob={handleRetryLastJob}
          canRetryLastJob={Boolean(lastCrawlJob) && Boolean(crawlError)}
          onIngestFiles={(files, enableLlm) => void handleIngestFiles(files, enableLlm)}
          onExportTokens={handleExportTokens}
          onExportCompiled={handleExportCompiled}
          onExportStyleGuidePdf={(mode) => void handleExportStyleGuidePdf(mode)}
          styleGuideDownloadPhase={styleGuideDownloadPhase}
          styleGuideDownloadError={styleGuideDownloadError}
          ingestFeedback={ingestFeedback}
          onSetAuthoritativeSource={handleSetAuthoritativeSource}
        />

        <main className="genoma-studio-split__main genoma-studio__board-shell">
          {showBoard ? (
            <GenomaBoardV2
              doc={genoma}
              onAction={handleAction}
              onLogoUpload={handleLogoUpload}
              isAnalyzing={isAnalyzing}
              isGeneratingGallery={isGeneratingGallery}
              focusGeneratedTab={focusGeneratedTab}
              gallerySuccessMessage={gallerySuccess}
              galleryProgress={galleryProgress}
              onGenerateGallery={() => void handleGenerateGallery()}
              onRecalibrateGallery={handleRecalibrateGallery}
              onBrandNameChange={handleBrandNameChange}
              onExportTokens={handleExportTokens}
              onExportCompiled={handleExportCompiled}
              canExport={canExport}
              hideExportActions
              activeSlotId={crawlProgress?.activeSlot}
            />
          ) : (
            <GenomaBoardEmpty />
          )}
        </main>
      </div>
    </div>
  );
}
