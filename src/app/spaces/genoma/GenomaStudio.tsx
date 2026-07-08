"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { FoldderStudioHeader } from "../FoldderStudioHeader";
import type { GenomaDocument, SlotAction, SlotId } from "@/lib/genoma/genoma-types";
import { applySlotAction } from "@/lib/genoma/genoma-slot-actions";
import { enrichGenomaDocument } from "@/lib/genoma/genoma-enrich";
import { validateGenomaContentQuality } from "@/lib/genoma/genoma-content-quality";
import { genomaLocaleEs } from "@/lib/genoma/genoma-locale.es";
import {
  computeGenomaCompleteness,
  createDemoGenomaFixture,
  createEmptyGenoma,
  extractBrandTitle,
  isGenomaEmpty,
} from "@/lib/genoma/genoma-defaults";
import {
  applyGenomaCompile,
  applyGenomaStreamEvent,
  resetSlotsForCrawl,
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
import { GenomaEntryScreen } from "./GenomaEntryScreen";
import { GENOMA_GALLERY_GENERATE_IMAGE_COUNT } from "@/lib/genoma/genoma-gallery-cost";
import "./genoma.css";
import "./genoma-board-theme.css";

const GENOMA_STUDIO_ACCENT = "#e8e6e1";

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
  const compileTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persistGenoma = useCallback(
    (next: GenomaDocument) => {
      onGenomaChange(next);
    },
    [onGenomaChange],
  );

  const handleAction = useCallback(
    (slotId: SlotId, action: SlotAction) => {
      persistGenoma(applySlotAction(genoma, slotId, action));
    },
    [genoma, persistGenoma],
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
      void applyGenomaCompile(genoma).then((next) => {
        if (next.compiledHash !== genoma.compiledHash) {
          persistGenoma(next);
        }
      });
    }, 2000);
    return () => {
      if (compileTimer.current) clearTimeout(compileTimer.current);
    };
  }, [genoma, persistGenoma]);

  const handleLoadDemo = useCallback(() => {
    setCrawlError(null);
    persistGenoma(createDemoGenomaFixture());
  }, [persistGenoma]);

  const handleReset = useCallback(() => {
    setCrawlError(null);
    setCrawlProgress(null);
    persistGenoma(createEmptyGenoma());
  }, [persistGenoma]);

  const runStreamJob = useCallback(
    async (
      runner: (onEvent: (event: import("@/lib/genoma/crawl/types").GenomaStreamEvent) => void) => Promise<
        { ok: true } | { ok: false; message: string } | { ok: true; url: string }
      >,
      respectLocks = false,
    ) => {
      setIsAnalyzing(true);
      setCrawlError(null);
      setCrawlProgress(createInitialCrawlProgress());
      let working = resetSlotsForCrawl(genoma);
      persistGenoma(working);

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
        working = applyGenomaStreamEvent(working, event, { respectLocks });
        persistGenoma(working);
      });

      setIsAnalyzing(false);
      if (result.ok) {
        const polished = enrichGenomaDocument(validateGenomaContentQuality(working));
        persistGenoma(polished);
        setTimeout(() => setCrawlProgress(null), 1200);
      } else {
        setCrawlError("message" in result ? result.message : "Error");
        setCrawlProgress(null);
      }
    },
    [genoma, persistGenoma],
  );

  const handleAnalyze = useCallback(
    async (url: string, enableLlm = true) => {
      await runStreamJob((onEvent) => streamGenomaCrawl(url, onEvent, { enableLlm }));
    },
    [runStreamJob],
  );

  const handleIngestFiles = useCallback(
    async (files: File[], enableLlm = true) => {
      await runStreamJob((onEvent) => streamGenomaIngest(files, onEvent, { enableLlm }), true);
    },
    [runStreamJob],
  );

  const handleGenerateGallery = useCallback(async () => {
    setIsGeneratingGallery(true);
    setCrawlError(null);
    setGallerySuccess(null);
    setGalleryProgress(null);
    const gallery = genoma.slots.gallery?.value as import("@/lib/genoma/genoma-types").GalleryValue | undefined;
    const version = gallery?.stylePromptVersion ?? 0;
    const priorGenerated = gallery?.generated?.length ?? 0;
    let workingGallery = gallery;

    const result = await streamGenomaGallery(genoma, version, (event) => {
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
            applySlotAction(genoma, "gallery", { action: "set", value: workingGallery }),
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
        persistGenoma(applySlotAction(genoma, "gallery", { action: "set", value: workingGallery }));
      }
    });

    setIsGeneratingGallery(false);
    setGalleryProgress(null);
    if (!result.ok) {
      setCrawlError(result.message);
      return;
    }
    const added = result.addedCount ?? result.gallery.generated.length - priorGenerated;
    persistGenoma(applySlotAction(genoma, "gallery", { action: "set", value: result.gallery }));
    setFocusGeneratedTab((value) => value + 1);
    setGallerySuccess(added > 0 ? genomaLocaleEs.galleryGeneratedCount(added) : genomaLocaleEs.galleryGeneratedSuccess);
    window.setTimeout(() => setGallerySuccess(null), 8000);
  }, [genoma, persistGenoma]);

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

  const title = extractBrandTitle(genoma, nodeLabel?.trim() || "Genoma");
  const showEntry = isGenomaEmpty(genoma) && !isAnalyzing;
  const subtitle = crawlProgress?.message ?? (isAnalyzing ? "Analizando…" : undefined);
  const completeness = computeGenomaCompleteness(genoma).percent;
  const canExport = completeness >= 40 && Boolean(genoma.compiled);

  return (
    <div className="genoma-studio fixed inset-0 z-[100090] flex flex-col genoma-studio--v2">
      <FoldderStudioHeader
        nodeType="genoma"
        nodeLabel={title}
        subtitle={subtitle}
        onClose={onClose}
        iconBackground={GENOMA_STUDIO_ACCENT}
      />

      <div className={`min-h-0 flex-1 overflow-auto${showEntry ? "" : " genoma-studio__board-shell"}`}>
        {showEntry ? (
          <GenomaEntryScreen
            onLoadDemo={handleLoadDemo}
            onReset={handleReset}
            onAnalyze={(url, enableLlm) => void handleAnalyze(url, enableLlm)}
            onIngestFiles={(files, enableLlm) => void handleIngestFiles(files, enableLlm)}
            isAnalyzing={isAnalyzing}
            crawlProgress={crawlProgress}
          />
        ) : (
          <>
            {crawlProgress ? <GenomaCrawlProgress progress={crawlProgress} /> : null}
            {crawlError ? (
              <div className="genoma-v2-banner genoma-v2-banner--error mx-6 mt-4 px-4 py-3 text-sm">{crawlError}</div>
            ) : null}
            <GenomaBoardV2
              doc={genoma}
              onAction={handleAction}
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
            />
          </>
        )}
      </div>
    </div>
  );
}
