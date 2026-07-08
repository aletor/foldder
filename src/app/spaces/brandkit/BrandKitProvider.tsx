"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef } from "react";
import type { ProjectAssetsMetadata } from "@/app/spaces/project-assets-metadata";
import { normalizeBrainMeta } from "@/lib/brain/brain-meta";
import { buildBrandBoardView } from "@/lib/brandkit/board-projection";
import {
  applyLogoPrimaryValidationEffects,
  formatConflictCandidate,
  readElementValue,
  rejectLogoCandidateOnAssets,
  resolveElementConflictOnAssets,
  selectLogoCandidateOnAssets,
  validateElementOnBoardMeta,
} from "@/lib/brandkit/brandkit-board-actions";
import { applyVoiceExamplesSynthesisOnAssets } from "@/lib/brandkit/synthesize-voice-examples";
import { listLogoCandidates } from "@/lib/brandkit/logo-candidates";
import { reduceBrandKitEvent } from "@/lib/brandkit/brandkit-event-reducer";
import {
  buildPipelineTransitionEvents,
  createPipelineRunId,
  derivePipelinePhase,
  type BrandKitPipelinePhase,
} from "@/lib/brandkit/brandkit-pipeline-bridge";
import type { BrandKitEvent } from "@/lib/brandkit/run-event-adapter";
import { normalizeBrandKitBoardMeta } from "@/lib/brandkit/interpretation";
import type { BrandBoardView, ElementKey, SectionId } from "@/lib/brandkit/types";

export type BrandKitPipelineState = {
  busy: boolean;
  detail: string;
  queued: number;
};

export type BrandKitContextValue = {
  assets: ProjectAssetsMetadata;
  view: BrandBoardView;
  pipelinePhase: BrandKitPipelinePhase;
  pipelineDetail: string;
  activeRunId: string | null;
  dispatchEvent: (event: BrandKitEvent) => void;
  validateElement: (key: ElementKey) => void;
  synthesizeVoiceExamples: () => Promise<void>;
  selectLogoCandidate: (url: string, options?: { elementKey?: ElementKey; phash?: string }) => void;
  rejectLogoCandidate: (url: string, elementKey: ElementKey, phash?: string) => void;
  clearPendingLogoPicker: () => void;
  logoCandidates: ReturnType<typeof listLogoCandidates>;
  resolveElementConflict: (key: ElementKey, chosenValue: unknown) => void;
  readElementValue: (key: ElementKey) => unknown;
  formatConflictCandidate: (value: unknown) => string;
  isSectionRunning: (section: SectionId) => boolean;
  isSectionError: (section: SectionId) => boolean;
};

const BrandKitContext = createContext<BrandKitContextValue | null>(null);

export function useBrandKit(): BrandKitContextValue {
  const ctx = useContext(BrandKitContext);
  if (!ctx) throw new Error("useBrandKit debe usarse dentro de BrandKitProvider");
  return ctx;
}

export function useBrandKitOptional(): BrandKitContextValue | null {
  return useContext(BrandKitContext);
}

type BrandKitProviderProps = {
  assets: ProjectAssetsMetadata;
  pipeline: BrandKitPipelineState;
  onAssetsPatch: (updater: (assets: ProjectAssetsMetadata) => ProjectAssetsMetadata) => void;
  onLogoCrowned?: (payload: { undo: () => void }) => void;
  children: React.ReactNode;
};

export function BrandKitProvider({ assets, pipeline, onAssetsPatch, onLogoCrowned, children }: BrandKitProviderProps) {
  const runIdRef = useRef<string | null>(null);
  const previousPhaseRef = useRef<BrandKitPipelinePhase>("idle");

  const boardMeta = useMemo(
    () => normalizeBrandKitBoardMeta(assets.brainMeta?.boardMeta),
    [assets.brainMeta?.boardMeta],
  );

  const view = useMemo(() => buildBrandBoardView(assets, boardMeta), [assets, boardMeta]);

  const pipelinePhase = useMemo(
    () => derivePipelinePhase(pipeline),
    [pipeline.busy, pipeline.detail, pipeline.queued],
  );

  const dispatchEvent = useCallback(
    (event: BrandKitEvent) => {
      onAssetsPatch((current) => {
        const prevMeta = normalizeBrandKitBoardMeta(current.brainMeta?.boardMeta);
        const nextMeta = reduceBrandKitEvent(prevMeta, event);
        return {
          ...current,
          brainMeta: normalizeBrainMeta({
            ...current.brainMeta,
            boardMeta: nextMeta,
          }),
        };
      });
    },
    [onAssetsPatch],
  );

  const dispatchEventRef = useRef(dispatchEvent);
  dispatchEventRef.current = dispatchEvent;
  const lastPipelineProgressRef = useRef<string | null>(null);

  const boardMetaRef = useRef(boardMeta);
  boardMetaRef.current = boardMeta;

  useEffect(() => {
    const previousPhase = previousPhaseRef.current;
    const nextPhase = pipelinePhase;

    if (nextPhase !== "idle" && nextPhase !== "done" && !runIdRef.current) {
      runIdRef.current = createPipelineRunId();
    }

    const runId = runIdRef.current ?? createPipelineRunId();
    if (!runIdRef.current) runIdRef.current = runId;

    const events = buildPipelineTransitionEvents({
      previousPhase,
      nextPhase,
      runId,
      detail: pipeline.detail,
      boardMeta: boardMetaRef.current,
    });

    const progressKey =
      nextPhase === "analyzing" && previousPhase === "analyzing"
        ? `${nextPhase}:${pipeline.detail}`
        : null;
    const shouldSkipProgress =
      progressKey !== null && progressKey === lastPipelineProgressRef.current;
    const eventsToApply = shouldSkipProgress ? events.filter((event) => event.type !== "section.updated") : events;

    if (progressKey && eventsToApply.some((event) => event.type === "section.updated")) {
      lastPipelineProgressRef.current = progressKey;
    }
    if (nextPhase === "idle" || nextPhase === "done") {
      lastPipelineProgressRef.current = null;
    }

    for (const event of eventsToApply) {
      dispatchEventRef.current(event);
    }

    if ((nextPhase === "idle" || nextPhase === "done") && !pipeline.busy && pipeline.queued === 0) {
      runIdRef.current = null;
    }

    previousPhaseRef.current = nextPhase;
  }, [pipelinePhase, pipeline.detail, pipeline.busy, pipeline.queued]);

  const logoCandidates = useMemo(() => listLogoCandidates(assets, boardMeta), [assets, boardMeta]);

  const validateElement = useCallback(
    (key: ElementKey) => {
      onAssetsPatch((current) => {
        const withMeta = {
          ...current,
          brainMeta: normalizeBrainMeta({
            ...current.brainMeta,
            boardMeta: validateElementOnBoardMeta(current.brainMeta?.boardMeta, key),
          }),
        };
        if (key === "logo.primary") {
          void applyLogoPrimaryValidationEffects(withMeta).then((vectorized) => {
            if (vectorized.brand.logoPrimaryVector !== withMeta.brand.logoPrimaryVector) {
              onAssetsPatch(() => vectorized);
            }
          });
        }
        return withMeta;
      });
    },
    [onAssetsPatch],
  );

  const selectLogoCandidate = useCallback(
    (url: string, options?: { elementKey?: ElementKey; phash?: string }) => {
      onAssetsPatch((current) => {
        const undoSnapshot = current;
        const next = selectLogoCandidateOnAssets(current, url, options);
        onLogoCrowned?.({
          undo: () => {
            onAssetsPatch(() => undoSnapshot);
          },
        });
        void applyLogoPrimaryValidationEffects(next).then((vectorized) => {
          if (vectorized.brand.logoPrimaryVector !== next.brand.logoPrimaryVector) {
            onAssetsPatch(() => vectorized);
          }
        });
        return next;
      });
    },
    [onAssetsPatch, onLogoCrowned],
  );

  const clearPendingLogoPicker = useCallback(() => {
    onAssetsPatch((current) => {
      if (!current.brainMeta?.pendingLogoPicker) return current;
      const { pendingLogoPicker: _omit, ...restMeta } = current.brainMeta ?? {
        brainVersion: 1,
        analysisStatus: "idle" as const,
        staleReasons: [],
      };
      return {
        ...current,
        brainMeta: normalizeBrainMeta(restMeta),
      };
    });
  }, [onAssetsPatch]);

  const rejectLogoCandidate = useCallback(
    (url: string, elementKey: ElementKey, phash?: string) => {
      onAssetsPatch((current) => {
        const rejected = rejectLogoCandidateOnAssets(current, url, elementKey, phash);
        return {
          ...rejected.assets,
          brainMeta: normalizeBrainMeta({
            ...rejected.assets.brainMeta,
            boardMeta: rejected.boardMeta,
          }),
        };
      });
    },
    [onAssetsPatch],
  );

  const resolveElementConflict = useCallback(
    (key: ElementKey, chosenValue: unknown) => {
      onAssetsPatch((current) => {
        const resolved = resolveElementConflictOnAssets(current, key, chosenValue);
        return {
          ...resolved.assets,
          brainMeta: normalizeBrainMeta({
            ...current.brainMeta,
            boardMeta: resolved.boardMeta,
          }),
        };
      });
    },
    [onAssetsPatch],
  );

  const isSectionRunning = useCallback(
    (section: SectionId) => boardMeta.board.sectionState[section] === "running",
    [boardMeta.board.sectionState],
  );

  const isSectionError = useCallback(
    (section: SectionId) => boardMeta.board.sectionState[section] === "error",
    [boardMeta.board.sectionState],
  );

  const synthesizeVoiceExamples = useCallback(async () => {
    const response = await fetch("/api/spaces/brain/brand/synthesize-voice-examples", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assets }),
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(payload?.error ?? "voice_synthesis_failed");
    }
    const payload = (await response.json()) as {
      examples: ProjectAssetsMetadata["strategy"]["voiceExamples"];
      generatedAt?: string;
    };
    onAssetsPatch((current) =>
      applyVoiceExamplesSynthesisOnAssets(current, payload.examples, payload.generatedAt),
    );
  }, [assets, onAssetsPatch]);

  const value = useMemo(
    (): BrandKitContextValue => ({
      assets,
      view,
      pipelinePhase,
      pipelineDetail: pipeline.detail,
      activeRunId: runIdRef.current,
      dispatchEvent,
      validateElement,
      synthesizeVoiceExamples,
      selectLogoCandidate,
      rejectLogoCandidate,
      clearPendingLogoPicker,
      logoCandidates,
      resolveElementConflict,
      readElementValue: (key) => readElementValue(assets, key),
      formatConflictCandidate,
      isSectionRunning,
      isSectionError,
    }),
    [
      assets,
      view,
      pipelinePhase,
      pipeline.detail,
      dispatchEvent,
      validateElement,
      synthesizeVoiceExamples,
      selectLogoCandidate,
      rejectLogoCandidate,
      clearPendingLogoPicker,
      logoCandidates,
      resolveElementConflict,
      isSectionRunning,
      isSectionError,
    ],
  );

  return <BrandKitContext.Provider value={value}>{children}</BrandKitContext.Provider>;
}
