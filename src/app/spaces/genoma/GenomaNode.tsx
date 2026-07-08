"use client";

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NodeResizer, useReactFlow, type NodeProps } from "@xyflow/react";
import { buildBookView } from "@/lib/genoma/projection/book-view";
import { syncGenomeExports, type GenomaBrandProjection, type GenomaDatasetProjection } from "@/lib/genoma/projection/exports";
import type { GenomaStyleGuideExportMode } from "@/lib/genoma/projection/style-guide-export-types";
import { downloadGenomaStyleGuidePdf, StyleGuideExportBlockedError } from "./style-guide-download.client";
import {
  emptyGenome,
  getTrait,
  normalizeGenome,
  uncrown,
  upsertTrait,
  type Genome,
} from "@/lib/genoma/model/trait";
import type { TraitId } from "@/lib/genoma/model/trait-ids";
import type { ImageDnaValue } from "@/lib/genoma/model/trait-values";
import type { TypographyValue } from "@/lib/genoma/model/trait-values";
import { typographyValueWithUpload } from "@/lib/genoma/specimen/typography-specimen";
import { dragEventHasFiles } from "@/lib/genoma/ui/drag-files";
import { axesSignature } from "@/lib/genoma/ingest/paid-operations";
import type { LogoValue } from "@/lib/genoma/model/trait-values";
import { isIntakeGenomeCandidateId } from "@/lib/genoma/logo-intake/genome-bridge";
import type { BrandLogoState, LogoIntakeAnalyzeResult, LogoProposal } from "@/lib/genoma/logo-intake/types";
import {
  applyCrownWithOptionalVectorizePending,
  applyVectorizePendingToCandidate,
  applyVectorizeResultToGenome,
  buildLogoVectorizeJob,
  findCrownedLogoVectorizeJob,
  type LogoVectorizeJob,
} from "@/lib/genoma/projection/logo-vectorize-action";
import { generateVisualTerritoryImage, vectorizeGenomaLogo } from "./genoma-ingest-client";
import {
  FoldderNodeContentDock,
  FoldderNodeContentDockActions,
  FoldderNodeContentDockMain,
  FoldderNodeContentMeta,
  FoldderNodeContentMetaRow,
  FoldderStudioModeCenterButton,
} from "../foldder-node-ui";
import { resolveFoldderNodeStudioBackground } from "../studio-node/foldder-studio-node-backgrounds";
import { StudioCanvasNodeShell, type StudioCanvasNodeHandleSpec } from "../studio-node/studio-canvas-node";
import { StudioNodePortal, useStudioNodeController } from "../studio-node/studio-node-architecture";
import { getNodeGridFrameForType } from "../canvas-grid-layout";
import { GenomaFace } from "./GenomaFace";
import { GenomaNodeIdentityPreview } from "./GenomaNodeIdentityPreview";
import type { LogoIntakePanelHandle } from "./LogoIntakePanel";
import { useGenomaIngest } from "./use-genoma-ingest";

export type GenomaNodeData = {
  label?: string;
  genome?: Genome;
  brandKit?: GenomaBrandProjection | null;
  genomaDataset?: GenomaDatasetProjection | null;
};

const GENOMA_HANDLES: StudioCanvasNodeHandleSpec[] = [
  {
    side: "right",
    top: "42%",
    style: { transform: "translateY(-50%)" },
    type: "source",
    id: "brand",
    dataType: "brain",
    label: "Marca",
  },
  {
    side: "right",
    top: "58%",
    style: { transform: "translateY(-50%)" },
    type: "source",
    id: "dataset",
    dataType: "dataset",
    label: "Dataset",
  },
];

const GENOMA_EMPTY_BG = resolveFoldderNodeStudioBackground("genoma");
const GENOMA_ACCENT = "#FFBD1B";
const GENOMA_SHELL = "#1A1B1E";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const GenomaNode = memo(({ id, data, selected }: NodeProps<any>) => {
  const nodeData = data as GenomaNodeData;
  const { setNodes } = useReactFlow();
  const [cardDragging, setCardDragging] = useState(false);
  const cardDragDepthRef = useRef(0);
  const genome = useMemo(() => normalizeGenome(nodeData.genome ?? emptyGenome()), [nodeData.genome]);
  const view = useMemo(() => buildBookView(genome), [genome]);
  const headerTitle = nodeData.label?.trim() || "Genoma";

  const patchGenome = useCallback(
    (updater: (g: Genome) => Genome) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== id) return n;
          const current = normalizeGenome((n.data as GenomaNodeData).genome);
          const genome = normalizeGenome(updater(current));
          const exports = syncGenomeExports(id, genome);
          return {
            ...n,
            data: {
              ...n.data,
              genome,
              brandKit: exports.brandKit,
              genomaDataset: exports.datasetProjection,
            },
          };
        }),
      );
    },
    [id, setNodes],
  );

  const { isStudioOpen, openStudio, closeStudio } = useStudioNodeController({
    nodeId: id,
    nodeType: "genoma",
  });
  const logoIntakeRef = useRef<LogoIntakePanelHandle>(null);
  const [logoIntakePreview, setLogoIntakePreview] = useState<LogoProposal | null>(null);
  const [vectorizeEnabled, setVectorizeEnabled] = useState(true);
  const [intakeUnlockOpen, setIntakeUnlockOpen] = useState(false);
  const pendingCrownRef = useRef<{ traitId: TraitId; candidateId: string } | null>(null);

  useEffect(() => {
    const trait = getTrait(genome, "logo.primary");
    if (trait?.crownedIds.some(isIntakeGenomeCandidateId)) {
      setLogoIntakePreview(null);
    }
  }, [genome]);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/spaces/genoma/logo/capabilities")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { vectorizeEnabled?: boolean } | null) => {
        if (!cancelled && data) setVectorizeEnabled(data.vectorizeEnabled !== false);
      })
      .catch(() => {
        if (!cancelled) setVectorizeEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleVectorizeError = useCallback((err: unknown) => {
    if (err instanceof StyleGuideExportBlockedError) {
      const cta =
        err.cta === "pay_wallet"
          ? "Recarga el wallet y vectoriza el logo antes de exportar."
          : err.cta === "wait_vectorize"
            ? "Espera a que termine la vectorización del logo."
            : "Reintenta la vectorización del logo.";
      window.alert(`${err.code}: ${err.message}\n\n${cta}`);
      return;
    }
    const message = err instanceof Error ? err.message : "No se pudo vectorizar el logo";
    window.alert(message);
  }, []);

  const executeLogoVectorize = useCallback(
    async (g: Genome, job: LogoVectorizeJob): Promise<Genome> => {
      const pending = applyVectorizePendingToCandidate(g, job);
      patchGenome(() => pending);
      const result = await vectorizeGenomaLogo({
        logoUrl: job.logoUrl,
        logoSignature: job.logoSignature,
        vectorSource: job.vectorSource,
      });
      const next = applyVectorizeResultToGenome(pending, job, result);
      patchGenome(() => next);
      if (!result.vectorUrl) {
        const walletBlocked =
          result.code === "insufficient_balance" ||
          result.reason?.includes("insufficient_balance");
        const duplicateOp = result.code === "duplicate_wallet_operation";
        throw new StyleGuideExportBlockedError({
          code: walletBlocked ? "VECTORIZE_REQUIRED" : "VECTORIZE_FAILED",
          message: duplicateOp
            ? "La vectorización ya se había iniciado. Vuelve a pulsar vectorizar."
            : (result.reason ??
              (walletBlocked
                ? "Saldo insuficiente para vectorizar el logo."
                : "La vectorización del logo falló.")),
          cta: walletBlocked ? "pay_wallet" : "retry_vectorize",
        });
      }
      return next;
    },
    [patchGenome],
  );

  const decrownIntakeLogo = useCallback((g: Genome): Genome => {
    const trait = getTrait(g, "logo.primary");
    if (!trait?.crownId || !isIntakeGenomeCandidateId(trait.crownId)) return g;
    return upsertTrait(g, uncrown(trait, trait.crownId));
  }, []);

  const executeIntakeUnlock = useCallback(async () => {
    const res = await fetch("/api/genoma/logo-intake/unlock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: id }),
    });
    const data = (await res.json()) as { state?: BrandLogoState; error?: string };
    if (!res.ok) throw new Error(data.error ?? "unlock_failed");
    patchGenome((g) => decrownIntakeLogo(g));
    if (data.state) logoIntakeRef.current?.syncBrandLogoState(data.state);
    setIntakeUnlockOpen(false);
  }, [decrownIntakeLogo, id, patchGenome]);

  const onCrown = useCallback(
    (traitId: TraitId, candidateId: string) => {
      const trait = genome.traits[traitId];
      const crownedId = trait?.crownId;
      if (
        traitId === "logo.primary" &&
        crownedId &&
        isIntakeGenomeCandidateId(crownedId) &&
        crownedId !== candidateId
      ) {
        pendingCrownRef.current = { traitId, candidateId };
        setIntakeUnlockOpen(true);
        return;
      }

      let job: LogoVectorizeJob | null = null;
      let nextGenome: Genome | null = null;
      patchGenome((g) => {
        const out = applyCrownWithOptionalVectorizePending(g, traitId, candidateId);
        job = out.job;
        nextGenome = out.genome;
        return out.genome;
      });
      if (job && nextGenome) {
        void executeLogoVectorize(nextGenome, job).catch(handleVectorizeError);
      }
    },
    [genome.traits, patchGenome, executeLogoVectorize, handleVectorizeError],
  );

  const onVectorizeLogo = useCallback(
    async (candidateId: string) => {
      try {
        const job = buildLogoVectorizeJob(genome, candidateId);
        if (!job) return;
        await executeLogoVectorize(genome, job);
      } catch (err) {
        handleVectorizeError(err);
      }
    },
    [genome, executeLogoVectorize, handleVectorizeError],
  );

  const onGenomeChange = useCallback((g: Genome) => patchGenome(() => g), [patchGenome]);
  const {
    feedback,
    ingestFiles,
    ingestUrl,
    retryLastFiles,
    activePrompt,
    resolveActivePrompt,
  } = useGenomaIngest({
    genome,
    onGenomeChange,
    projectId: id,
    onLogoIntakeResult: (result: LogoIntakeAnalyzeResult) => {
      logoIntakeRef.current?.applyAnalyzeResult(result);
      if (!result.locked) setLogoIntakePreview(result.proposal);
    },
    onLogoIntakeError: (message) => logoIntakeRef.current?.reportIntakeError(message),
  });

  const isEmpty = view.completenessPercent === 0 && view.sourcesCount === 0;
  const ingestActive = Boolean(feedback.activity?.active && feedback.activity.phase !== "done");
  const showEmptyCard = isEmpty && !ingestActive && !logoIntakePreview;

  const onDrop = useCallback(
    (files: FileList) => {
      if (!isStudioOpen) openStudio();
      void ingestFiles(files);
    },
    [ingestFiles, isStudioOpen, openStudio],
  );

  const onAddSource = useCallback(
    (url: string) => {
      void ingestUrl(url);
    },
    [ingestUrl],
  );

  const onConfirmVisual = useCallback(
    async (traitId: TraitId, candidateId: string, axes: ImageDnaValue["axes"]) => {
      try {
        const trait = genome.traits[traitId];
        const candidate = trait?.candidates.find((c) => c.id === candidateId);
        const sameAxes = candidate && axesSignature((candidate.value as ImageDnaValue).axes) === axesSignature(axes);
        const cached = sameAxes ? candidate?.derived?.generatedImageUrl : undefined;

        const imageUrl = await generateVisualTerritoryImage(axes, {
          cachedImageUrl: cached,
          referenceImageUrl: (candidate?.value as ImageDnaValue | undefined)?.referenceImageUrl,
        });
        patchGenome((g) => {
          const trait = g.traits[traitId];
          if (!trait) return g;
          const candidates = trait.candidates.map((c) =>
            c.id === candidateId
              ? {
                  ...c,
                  value: { ...(c.value as ImageDnaValue), axes },
                  derived: {
                    ...c.derived,
                    generatedImageUrl: imageUrl,
                    generatedAt: new Date().toISOString(),
                  },
                }
              : c,
          );
          return upsertTrait(g, { ...trait, candidates });
        });
        onCrown(traitId, candidateId);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "No pude generar la imagen de referencia";
        window.alert(message);
      }
    },
    [genome, onCrown, patchGenome],
  );

  const onDownload = useCallback(
    (exportMode: GenomaStyleGuideExportMode = "operativo", hooks?: { onPhase?: (phase: "vectorizing" | "downloading") => void }) =>
      (async () => {
        try {
          let g = genome;
          const job = findCrownedLogoVectorizeJob(g);
          if (job) {
            hooks?.onPhase?.("vectorizing");
            g = await executeLogoVectorize(g, job);
          }
          hooks?.onPhase?.("downloading");
          await downloadGenomaStyleGuidePdf(g, {
            projectName: headerTitle,
            exportMode,
            htmlFallbackOnChromiumUnavailable: process.env.NODE_ENV === "development",
          });
        } catch (err) {
          if (err instanceof StyleGuideExportBlockedError) {
            handleVectorizeError(err);
            return;
          }
          console.warn("[genoma-style-guide] PDF falló", err);
          const message = err instanceof Error ? err.message : "No se pudo exportar el libro de estilo";
          window.alert(message);
        }
      })(),
    [genome, headerTitle, executeLogoVectorize, handleVectorizeError],
  );

  const onUploadSpecimenFont = useCallback(
    (traitId: TraitId, candidateId: string, file: File) => {
      if (!/\.woff2$/i.test(file.name)) {
        window.alert("Sube un archivo .woff2");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = typeof reader.result === "string" ? reader.result : null;
        if (!dataUrl) return;
        patchGenome((g) => {
          const trait = g.traits[traitId];
          if (!trait) return g;
          const candidates = trait.candidates.map((c) =>
            c.id === candidateId
              ? {
                  ...c,
                  value: typographyValueWithUpload(c.value as TypographyValue, dataUrl, file.name),
                }
              : c,
          );
          return upsertTrait(g, { ...trait, candidates });
        });
      };
      reader.readAsDataURL(file);
    },
    [patchGenome],
  );

  const resetCardDrag = useCallback(() => {
    cardDragDepthRef.current = 0;
    setCardDragging(false);
  }, []);

  const handleCardDragEnter = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!dragEventHasFiles(event)) return;
    event.preventDefault();
    event.stopPropagation();
    cardDragDepthRef.current += 1;
    if (cardDragDepthRef.current === 1) setCardDragging(true);
  }, []);

  const handleCardDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!dragEventHasFiles(event)) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget.contains(event.relatedTarget as Node)) return;
    cardDragDepthRef.current = Math.max(0, cardDragDepthRef.current - 1);
    if (cardDragDepthRef.current === 0) setCardDragging(false);
  }, []);

  const handleCardDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!dragEventHasFiles(event)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
    setCardDragging(true);
  }, []);

  const handleCardDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      resetCardDrag();
      if (!event.dataTransfer.files?.length) return;
      openStudio();
      void ingestFiles(event.dataTransfer.files);
    },
    [ingestFiles, openStudio, resetCardDrag],
  );

  const baseFrame = getNodeGridFrameForType("genoma");

  return (
    <>
      <StudioCanvasNodeShell
        nodeId={id}
        nodeType="genoma"
        selected={selected}
        label={nodeData.label}
        defaultLabel="Genoma"
        title="GENOMA"
        minWidth={baseFrame?.width ?? 276}
        className={`genoma-node foldder-frameless-label-dark${showEmptyCard ? " genoma-node--empty" : " genoma-node--has-content"}${cardDragging ? " genoma-node--dragging" : ""}`}
        handles={GENOMA_HANDLES}
        variant="frameless"
        material="media"
        style={
          {
            minWidth: baseFrame?.width ?? 276,
            minHeight: baseFrame?.height ?? 184,
            "--foldder-node-card-bg": GENOMA_ACCENT,
            "--foldder-frameless-glass-bg": GENOMA_SHELL,
            "--foldder-frameless-accent": GENOMA_ACCENT,
            "--foldder-node-header-tint-color": GENOMA_ACCENT,
            "--foldder-node-output-color": GENOMA_ACCENT,
          } as React.CSSProperties
        }
      >
        <NodeResizer minWidth={220} minHeight={160} maxWidth={960} maxHeight={1200} isVisible={selected} />
        <div
          className={`node-content foldder-frameless-main genoma-node-main relative flex min-h-0 flex-1 flex-col${!showEmptyCard ? " foldder-node-content-main--with-dock" : ""}`}
        >
          <div
            className={`genoma-node-dropzone nodrag nopan relative flex min-h-[120px] flex-1 cursor-pointer flex-col items-center justify-center overflow-hidden${cardDragging ? " genoma-node-dropzone--active" : ""}`}
            onDoubleClick={() => openStudio()}
            onDragEnter={handleCardDragEnter}
            onDragOver={handleCardDragOver}
            onDragLeave={handleCardDragLeave}
            onDrop={handleCardDrop}
            title="Doble clic para abrir · suelta archivos para ingerir"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={GENOMA_EMPTY_BG}
              alt=""
              className="genoma-node-bg absolute inset-0 h-full w-full object-cover opacity-80"
              draggable={false}
            />
            <div className="relative z-[1] flex flex-col items-center px-4 text-center text-white">
              {feedback.activity?.active && feedback.activity.cardPhase ? (
                <div className="absolute right-3 top-3 flex items-center gap-2 rounded-full bg-black/45 px-2.5 py-1 text-[10px] lowercase tracking-wide text-white/90">
                  <span className="inline-block h-2.5 w-2.5 rounded-full border border-white/40 border-t-white motion-safe:animate-spin" />
                  {feedback.activity.cardPhase}
                </div>
              ) : null}
              {showEmptyCard ? (
                <>
                  <p className="text-lg font-semibold">Libro vacío</p>
                  <p className="mt-1 max-w-[220px] text-sm text-white/75">Suelta material de marca para construir el genoma.</p>
                  <div className="mt-4">
                    <FoldderStudioModeCenterButton label="Empezar" title="Abrir Genoma" onClick={() => openStudio()} />
                  </div>
                </>
              ) : ingestActive && isEmpty ? (
                <>
                  {logoIntakePreview?.best ? (
                    <GenomaNodeIdentityPreview view={view} logoProposal={logoIntakePreview} />
                  ) : (
                    <p className="text-sm text-white/80 lowercase tracking-wide">
                      {feedback.activity?.cardPhase ?? "leyendo…"}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <GenomaNodeIdentityPreview view={view} logoProposal={logoIntakePreview} />
                  <p className="text-5xl font-bold leading-none">{view.completenessPercent}%</p>
                  <p className="mt-2 text-sm text-white/75">del libro resuelto</p>
                  {view.typography.primary.value && (
                    <p className="mt-3 text-base text-[#FFBD1B]">{view.typography.primary.value.family}</p>
                  )}
                </>
              )}
            </div>
            {cardDragging ? (
              <div className="genoma-node-dropzone__overlay" aria-hidden>
                <p className="genoma-node-dropzone__overlay-title">Suelta para ingerir</p>
                <p className="genoma-node-dropzone__overlay-copy">pdf o imágenes de marca</p>
              </div>
            ) : null}
          </div>

          {!showEmptyCard ? (
            <FoldderNodeContentDock allowNodeDrag>
              <FoldderNodeContentDockMain>
                <p className="foldder-node-content-dock-text">{headerTitle}</p>
                <p className="foldder-node-content-dock-text foldder-node-content-dock-text--placeholder">
                  Libro {view.completenessPercent}% · {view.sourcesCount}{" "}
                  {view.sourcesCount === 1 ? "fuente" : "fuentes"}
                </p>
                <FoldderNodeContentMeta>
                  <FoldderNodeContentMetaRow label="Libro" value={`${view.completenessPercent}%`} />
                  <FoldderNodeContentMetaRow label="Fuentes" value={String(view.sourcesCount)} />
                  <FoldderNodeContentMetaRow label="Salida" value="marca · dataset" />
                </FoldderNodeContentMeta>
              </FoldderNodeContentDockMain>
              <FoldderNodeContentDockActions>
                <button type="button" className="foldder-node-content-dock-action" onClick={() => openStudio()}>
                  Abrir
                </button>
              </FoldderNodeContentDockActions>
            </FoldderNodeContentDock>
          ) : null}
        </div>
      </StudioCanvasNodeShell>

      {isStudioOpen ? (
        <StudioNodePortal>
          <GenomaFace
            projectId={id}
            view={view}
            genome={genome}
            onGenomeChange={onGenomeChange}
            onCrown={onCrown}
            onVectorizeLogo={onVectorizeLogo}
            onAddSource={onAddSource}
            onDrop={onDrop}
            onConfirmVisual={onConfirmVisual}
            ingestFeedback={feedback}
            onIngestRetry={() => void retryLastFiles()}
            onDownload={onDownload}
            activePrompt={activePrompt}
            onResolvePrompt={resolveActivePrompt}
            onUploadSpecimenFont={onUploadSpecimenFont}
            logoIntakeRef={logoIntakeRef}
            onIntakeLogoUnlock={() => executeIntakeUnlock()}
            vectorizeEnabled={vectorizeEnabled}
          />
          {intakeUnlockOpen ? (
            <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-8" role="dialog" aria-modal="true">
              <div className="max-w-md border border-white/15 bg-[#1A1B1E] p-8 text-white">
                <p className="text-lg">¿re-detectar logo?</p>
                <p className="mt-2 text-sm text-white/60">
                  se desbloqueará el logo validado, se quitará la corona del intake y podrás elegir otro candidato.
                </p>
                <div className="mt-8 flex gap-3">
                  <button
                    type="button"
                    className="border border-white/20 px-5 py-2.5 text-sm lowercase"
                    onClick={() => {
                      setIntakeUnlockOpen(false);
                      pendingCrownRef.current = null;
                    }}
                  >
                    cancelar
                  </button>
                  <button
                    type="button"
                    className="border border-[#FFBD1B] px-5 py-2.5 text-sm lowercase text-[#FFBD1B]"
                    onClick={() => {
                      const pending = pendingCrownRef.current;
                      void executeIntakeUnlock()
                        .then(() => {
                          pendingCrownRef.current = null;
                          if (!pending) return;
                          let job: LogoVectorizeJob | null = null;
                          let nextGenome: Genome | null = null;
                          patchGenome((g) => {
                            const out = applyCrownWithOptionalVectorizePending(
                              g,
                              pending.traitId,
                              pending.candidateId,
                            );
                            job = out.job;
                            nextGenome = out.genome;
                            return out.genome;
                          });
                          if (job && nextGenome) {
                            void executeLogoVectorize(nextGenome, job).catch(handleVectorizeError);
                          }
                        })
                        .catch((err) => {
                          window.alert(err instanceof Error ? err.message : "No se pudo desbloquear");
                        });
                    }}
                  >
                    confirmar
                  </button>
                </div>
              </div>
            </div>
          ) : null}
          <button
            type="button"
            aria-label="cerrar genoma"
            onClick={() => closeStudio()}
            className="fixed right-8 top-8 z-[60] border border-white/25 bg-black/50 px-5 py-2.5 text-sm lowercase text-white transition hover:border-white hover:bg-black/70"
          >
            cerrar
          </button>
        </StudioNodePortal>
      ) : null}
    </>
  );
});

GenomaNode.displayName = "GenomaNode";
