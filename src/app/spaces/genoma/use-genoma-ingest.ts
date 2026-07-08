"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Genome } from "@/lib/genoma/model/trait";
import type { LogoIntakeAnalyzeResult } from "@/lib/genoma/logo-intake/types";
import type { MaterialPromptPayload } from "@/lib/genoma/ingest/material-prompt";
import { resolveMaterialPrompt } from "@/lib/genoma/ingest/material-prompt";
import type { GenomaIngestStreamEvent } from "@/lib/genoma/ingest/types";
import {
  idleIngestFeedback,
  reduceIngestFeedback,
  shouldClearCompleteMicro,
  type GenomaIngestFeedbackState,
} from "@/lib/genoma/ingest/feedback-state";
import { streamCombinedMaterialDrop, streamGenomaIngest } from "./genoma-ingest-client";

export function useGenomaIngest(options: {
  genome: Genome;
  onGenomeChange: (genome: Genome) => void;
  projectId?: string;
  onLogoIntakeResult?: (result: LogoIntakeAnalyzeResult) => void;
  onLogoIntakeError?: (message: string) => void;
}): {
  feedback: GenomaIngestFeedbackState;
  ingestFiles: (files: FileList | File[]) => Promise<void>;
  ingestUrl: (url: string) => Promise<void>;
  retryLastFiles: () => Promise<void>;
  promptQueue: MaterialPromptPayload[];
  activePrompt: MaterialPromptPayload | null;
  resolveActivePrompt: (optionId: string) => void;
} {
  const [feedback, setFeedback] = useState<GenomaIngestFeedbackState>(() => idleIngestFeedback(options.genome));
  const [promptQueue, setPromptQueue] = useState<MaterialPromptPayload[]>([]);
  const genomeRef = useRef(options.genome);
  const lastFilesRef = useRef<File[]>([]);
  const lastUrlRef = useRef<string | null>(null);
  const onGenomeChangeRef = useRef(options.onGenomeChange);
  const onLogoIntakeResultRef = useRef(options.onLogoIntakeResult);
  const onLogoIntakeErrorRef = useRef(options.onLogoIntakeError);
  genomeRef.current = options.genome;
  onGenomeChangeRef.current = options.onGenomeChange;
  onLogoIntakeResultRef.current = options.onLogoIntakeResult;
  onLogoIntakeErrorRef.current = options.onLogoIntakeError;

  useEffect(() => {
    setFeedback((prev) => reduceIngestFeedback(prev, { type: "genome_sync", genome: options.genome }));
  }, [options.genome]);

  const runStream = useCallback(
    async (input: { files?: FileList | File[]; url?: string }) => {
      if (input.files) {
        const list = Array.from(input.files);
        if (!list.length) return;
        lastFilesRef.current = list;
        lastUrlRef.current = null;
        setFeedback((prev) => reduceIngestFeedback(prev, { type: "files_dropped", count: list.length }));
      } else if (input.url) {
        lastUrlRef.current = input.url;
        setFeedback((prev) => reduceIngestFeedback(prev, { type: "files_dropped", count: 1 }));
      }
      setPromptQueue([]);
      try {
        const handleEvent = (event: GenomaIngestStreamEvent) => {
          setFeedback((prev) => reduceIngestFeedback(prev, { type: "stream_event", event }));
          if (event.type === "genome_update") onGenomeChangeRef.current(event.genome);
          if (event.type === "material_prompt") {
            setPromptQueue((q) => [...q, event.prompt]);
          }
          if (event.type === "logo_intake_done") {
            onLogoIntakeResultRef.current?.(event.result);
          }
          if (event.type === "logo_best_ready") {
            onLogoIntakeResultRef.current?.({
              locked: false,
              proposal: event.proposal,
              state: {
                projectId: options.projectId ?? "",
                status: "proposed",
                sightings: [],
                activeBatchId: event.proposal.batchId,
              },
            });
          }
          if (event.type === "logo_intake_error") {
            onLogoIntakeErrorRef.current?.(event.message);
          }
        };

        if (input.files && options.projectId) {
          const { genome } = await streamCombinedMaterialDrop({
            projectId: options.projectId,
            files: input.files,
            genome: genomeRef.current,
            onEvent: handleEvent,
          });
          onGenomeChangeRef.current(genome);
          return;
        }

        const { genome } = await streamGenomaIngest({
          files: input.files,
          url: input.url,
          genome: genomeRef.current,
          onEvent: handleEvent,
        });
        onGenomeChangeRef.current(genome);
      } catch (err) {
        const message =
          err instanceof Error && err.message.trim()
            ? err.message
            : "No pude leer tus archivos";
        setFeedback((prev) => ({
          ...prev,
          activity: prev.activity
            ? {
                ...prev.activity,
                micro: { text: message, id: Date.now() },
              }
            : prev.activity,
        }));
      }
    },
    [options.projectId],
  );

  const ingestFiles = useCallback((files: FileList | File[]) => runStream({ files }), [runStream]);
  const ingestUrl = useCallback((url: string) => runStream({ url }), [runStream]);
  const retryLastFiles = useCallback(async () => {
    if (lastFilesRef.current.length) await runStream({ files: lastFilesRef.current });
    else if (lastUrlRef.current) await runStream({ url: lastUrlRef.current });
  }, [runStream]);

  const activePrompt = promptQueue[0] ?? null;

  const resolveActivePrompt = useCallback(
    (optionId: string) => {
      if (!activePrompt) return;
      const nextGenome = resolveMaterialPrompt(genomeRef.current, activePrompt, optionId);
      onGenomeChangeRef.current(nextGenome);
      setPromptQueue((q) => q.slice(1));
    },
    [activePrompt],
  );

  return {
    feedback,
    ingestFiles,
    ingestUrl,
    retryLastFiles,
    promptQueue,
    activePrompt,
    resolveActivePrompt,
  };
}

export function useMicroFade(micro: { text: string; id: number } | null) {
  const [visible, setVisible] = useState(micro);
  useEffect(() => {
    setVisible(micro);
    if (!micro) return;
    const delay = shouldClearCompleteMicro(micro.text) ? 2000 : 2500;
    const t = window.setTimeout(() => setVisible(null), delay);
    return () => window.clearTimeout(t);
  }, [micro]);
  return visible;
}
