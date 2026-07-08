"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Link2,
  Loader2,
  Upload,
} from "lucide-react";
import type { BrandSummaryResult } from "@/lib/brain/brain-brand-summary";
import { filterLegacyLanguageTraits } from "@/lib/brain/brain-brand-summary";
import { isRawArtifact, filterProjectableToneTraits } from "@/lib/brandkit/raw-artifact";
import { buildRawArtifactOptions } from "@/lib/brandkit/voice-projection";
import { useBrandKit } from "./BrandKitProvider";
import { paletteRoleLabelEs, refCategoryLabelEs } from "@/lib/brandkit/brand-board-labels";
import { renderStyleGuideV2, styleGuideFilename } from "@/lib/brandkit/style-guide-render";
import type { StyleGuideExportMode } from "@/lib/brandkit/style-guide-export-types";
import { evaluateStyleGuidePrintGate } from "@/lib/brandkit/style-guide-print-gate";
import { VOICE_EXAMPLES_ELEMENT_KEY } from "@/lib/brandkit/synthesize-voice-examples";
import { STYLE_GUIDE_EXPORT_MODE_LABELS } from "@/lib/brandkit/style-guide-export-types";
import type { BrandBoardView, ElementKey, InterpretationMeta, RefCategory, SectionId } from "@/lib/brandkit/types";
import { BRANDKIT_REF_CATEGORIES } from "@/lib/brandkit/types";
import { getBrainVersion } from "@/lib/brain/brain-meta";
import { stableKnowledgeFileUrlFromMaybeUrl } from "@/lib/s3-media-hydrate";
import { countDistinctLogoClusters } from "@/lib/brandkit/logo-candidates";

function resolveBoardImageUrl(raw: string | null | undefined): string | null {
  return stableKnowledgeFileUrlFromMaybeUrl(raw);
}

function proposedTooltip(meta: InterpretationMeta): string | undefined {
  if (meta.status === "proposed") return "Propuesto · toca para revisar";
  if (meta.status === "conflict") {
    const n = meta.conflict?.candidates?.length ?? 0;
    return n > 0 ? `${n} fuentes discrepan` : "Conflicto";
  }
  return undefined;
}

function BrandBoardProposedDot({ meta }: { meta: InterpretationMeta }) {
  if (meta.status !== "proposed") return null;
  return (
    <span
      className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[var(--foldder-studio-accent,#5E8E70)] shadow-[0_0_0_2px_rgba(0,0,0,0.35)]"
      title={proposedTooltip(meta)}
      aria-hidden
    />
  );
}

function BrandBoardConflictBadge({
  meta,
  onClick,
}: {
  meta: InterpretationMeta;
  onClick?: () => void;
}) {
  if (meta.status !== "conflict") return null;
  const count = meta.conflict?.candidates?.length ?? 0;
  return (
    <button
      type="button"
      onClick={onClick}
      title={proposedTooltip(meta)}
      className="absolute right-2 top-2 inline-flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full border border-amber-400/50 bg-amber-500/20 px-1 text-[9px] font-black text-amber-100"
    >
      {count || "!"}
    </button>
  );
}

function BrandBoardElementReview({
  elementKey,
  meta,
  open,
  onToggle,
}: {
  elementKey: ElementKey;
  meta: InterpretationMeta;
  open: boolean;
  onToggle: () => void;
}) {
  const { validateElement, resolveElementConflict, readElementValue, formatConflictCandidate } = useBrandKit();

  if (meta.status === "proposed") {
    return (
      <button
        type="button"
        title={proposedTooltip(meta)}
        onClick={() => validateElement(elementKey)}
        className="absolute inset-0 z-[1] cursor-pointer rounded-[inherit] bg-transparent"
        aria-label="Validar propuesta"
      />
    );
  }

  if (meta.status === "conflict") {
    return (
      <>
        <BrandBoardConflictBadge meta={meta} onClick={onToggle} />
        {open ? (
          <div className="absolute inset-x-2 top-8 z-20 rounded-[10px] border border-amber-400/35 bg-[#121820] p-2 shadow-xl">
            <p className="mb-2 text-[9px] font-black uppercase tracking-wide text-amber-100">Resolver conflicto</p>
            <div className="grid gap-1 sm:grid-cols-2">
              {meta.conflict?.candidates?.map((candidate, index) => (
                <button
                  key={`${elementKey}-candidate-${index}`}
                  type="button"
                  onClick={() => resolveElementConflict(elementKey, candidate.value)}
                  className="rounded-[8px] border border-white/10 bg-white/[0.04] px-2 py-1.5 text-left text-[10px] text-white/82 hover:bg-white/[0.08]"
                >
                  {formatConflictCandidate(candidate.value)}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => resolveElementConflict(elementKey, readElementValue(elementKey))}
              className="mt-2 text-[9px] font-bold text-white/45 underline underline-offset-2"
            >
              Conservar valor actual
            </button>
          </div>
        ) : null}
      </>
    );
  }

  return null;
}

function BrandBoardSection({
  section,
  children,
  className,
}: {
  section: SectionId;
  children: React.ReactNode;
  className?: string;
}) {
  const { isSectionRunning } = useBrandKit();
  const running = isSectionRunning(section);
  return (
    <section className={`relative ${className ?? ""}`} data-brand-board-section={section} aria-busy={running}>
      <div className={running ? "brand-board-section-shimmer rounded-[18px]" : undefined}>{children}</div>
    </section>
  );
}

function LogoTile({
  url,
  meta,
  elementKey,
  variant,
  autoOpenPicker,
}: {
  url: string | null;
  meta: InterpretationMeta;
  elementKey: ElementKey;
  variant: "light" | "dark";
  autoOpenPicker?: boolean;
}) {
  const [conflictOpen, setConflictOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const { logoCandidates, selectLogoCandidate, rejectLogoCandidate, clearPendingLogoPicker } = useBrandKit();
  const src = resolveBoardImageUrl(url);
  const ghost = meta.status === "ghost" || !src;
  const distinctClusters = countDistinctLogoClusters(logoCandidates);
  const showPicker = elementKey === "logo.primary" && distinctClusters >= 2;

  useEffect(() => {
    if (!autoOpenPicker || !showPicker || pickerOpen) return;
    setPickerOpen(true);
    clearPendingLogoPicker();
  }, [autoOpenPicker, showPicker, pickerOpen, clearPendingLogoPicker]);
  return (
    <div
      className={`relative flex min-h-[132px] flex-1 flex-col overflow-hidden rounded-[18px] border border-white/10 ${
        variant === "light" ? "bg-[#f4f4f5]" : "bg-[#111827]"
      } ${ghost ? "opacity-30" : ""}`}
    >
      {showPicker ? (
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="absolute right-2 top-2 z-[2] rounded-full border border-white/15 bg-black/40 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-white/75 hover:bg-black/55"
        >
          ···
        </button>
      ) : null}
      {pickerOpen ? (
        <div className="absolute inset-0 z-30 flex flex-col bg-[#0f1419]/95 p-3 backdrop-blur-sm">
          <p className="mb-1 text-[11px] font-black text-white/90">¿Cuál es el logo de tu marca?</p>
          <p className="mb-2 text-[9px] text-white/45">Toca uno para validarlo como logo principal.</p>
          <div className="custom-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto">
            {logoCandidates.map((candidate) => (
              <div key={candidate.id} className="flex items-center gap-2 rounded-[10px] border border-white/10 bg-white/[0.04] p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={resolveBoardImageUrl(candidate.url) ?? candidate.url} alt="" className="h-10 w-16 object-contain" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[10px] font-semibold text-white/82">{candidate.label}</p>
                  <p className="truncate text-[9px] text-white/45">{candidate.contextLine}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    selectLogoCandidate(candidate.url, {
                      elementKey: candidate.elementKey,
                      phash: candidate.phash,
                    });
                    setPickerOpen(false);
                  }}
                  className="shrink-0 px-2 py-1 text-[9px] font-black uppercase text-emerald-200"
                >
                  Elegir
                </button>
                {candidate.elementKey !== "logo.primary" ? (
                  <button
                    type="button"
                    onClick={() => rejectLogoCandidate(candidate.url, candidate.elementKey, candidate.phash)}
                    className="shrink-0 px-2 py-1 text-[9px] font-black uppercase text-rose-300/80"
                  >
                    No es mi marca
                  </button>
                ) : null}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              setPickerOpen(false);
              clearPendingLogoPicker();
            }}
            className="mt-2 text-[9px] font-bold text-white/45 underline underline-offset-2"
          >
            Cerrar
          </button>
        </div>
      ) : null}
      <BrandBoardProposedDot meta={meta} />
      <BrandBoardElementReview
        elementKey={elementKey}
        meta={meta}
        open={conflictOpen}
        onToggle={() => setConflictOpen((v) => !v)}
      />
      <div className="flex flex-1 items-center justify-center p-4">
        {src && !ghost ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" className="max-h-24 max-w-full object-contain" />
        ) : (
          <p className="text-center text-[11px] font-semibold text-zinc-500 dark:text-white/55">
            {variant === "light" ? "Aquí aparecerá tu logo" : "Versión en negativo"}
          </p>
        )}
      </div>
    </div>
  );
}

function TypographySpecimen(props: BrandBoardView["typography"]) {
  const [conflictOpen, setConflictOpen] = useState(false);
  const ghost = props.metaPrimary.status === "ghost" && !props.primaryFamily;
  return (
    <div
      className={`relative min-h-[132px] rounded-[18px] border border-white/10 bg-white/[0.04] p-4 ${
        ghost ? "opacity-30" : ""
      }`}
    >
      <BrandBoardProposedDot meta={props.metaPrimary} />
      <BrandBoardElementReview
        elementKey="typography.primary"
        meta={props.metaPrimary}
        open={conflictOpen}
        onToggle={() => setConflictOpen((v) => !v)}
      />
      <p className="text-4xl font-black tracking-tight text-white">Aa</p>
      <p className="mt-2 text-[13px] font-semibold text-white/82">
        {props.primaryFamily ?? "Tipografía de marca"}
      </p>
      {props.secondaryFamily ? <p className="mt-1 text-[11px] text-white/48">{props.secondaryFamily}</p> : null}
      {props.weights.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {props.weights.map((weight) => (
            <span
              key={weight}
              className="rounded-full border border-white/12 bg-white/[0.06] px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-white/62"
            >
              {weight}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SwatchTile({
  hex,
  role,
  meta,
  elementKey,
}: {
  hex: string;
  role: string;
  meta: InterpretationMeta;
  elementKey: ElementKey;
}) {
  const [conflictOpen, setConflictOpen] = useState(false);
  if (meta.status === "ghost") {
    return (
      <div className="aspect-[4/5] min-w-[72px] flex-1 rounded-[18px] border border-dashed border-white/15 bg-white/[0.03] opacity-30" />
    );
  }
  return (
    <div className="group relative min-w-[72px] flex-1">
      <div className="relative">
        <div
          className="aspect-[4/5] w-full rounded-[18px] border border-white/18 shadow-[0_12px_40px_rgba(0,0,0,0.25)]"
          style={{ backgroundColor: hex }}
        />
        <BrandBoardProposedDot meta={meta} />
        <BrandBoardElementReview
          elementKey={elementKey}
          meta={meta}
          open={conflictOpen}
          onToggle={() => setConflictOpen((v) => !v)}
        />
      </div>
      <p className="mt-2 font-mono text-[10px] text-white/0 transition group-hover:text-white/55">{hex}</p>
      <p className="text-[9px] font-black uppercase tracking-[0.1em] text-white/0 transition group-hover:text-white/72">
        {paletteRoleLabelEs(role)}
      </p>
    </div>
  );
}

function ReferenceCarousel({
  category,
  section,
  onRecategorize,
}: {
  category: RefCategory;
  section: BrandBoardView["references"][RefCategory];
  onRecategorize?: (from: RefCategory, to: RefCategory, imageUrl: string) => void;
}) {
  const [index, setIndex] = useState(0);
  const [conflictOpen, setConflictOpen] = useState(false);
  const items = section.items;
  const item = items[index] ?? items[0];
  const ruleMeta = section.ruleMeta;
  const ghost = ruleMeta.status === "ghost" && !section.rule.trim() && !item;
  const headline = section.rule.trim() || refCategoryLabelEs(category);
  const src = item ? resolveBoardImageUrl(item.assetUrl) : null;
  const ruleKey = `references.${category}.rule` as ElementKey;

  return (
    <article
      className={`relative min-w-[160px] flex-1 rounded-[16px] border border-white/10 bg-white/[0.03] p-2.5 ${
        ghost ? "opacity-30" : ""
      }`}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const from = event.dataTransfer.getData("application/x-brand-board-ref") as RefCategory;
        const imageUrl = event.dataTransfer.getData("application/x-brand-board-ref-url");
        if (from && imageUrl && from !== category) onRecategorize?.(from, category, imageUrl);
      }}
    >
      <p className="text-[9px] font-black uppercase tracking-[0.12em] text-white/42">{refCategoryLabelEs(category)}</p>
      <div className="relative mt-1 min-h-[40px]">
        <BrandBoardProposedDot meta={ruleMeta} />
        <BrandBoardElementReview
          elementKey={ruleKey}
          meta={ruleMeta}
          open={conflictOpen}
          onToggle={() => setConflictOpen((v) => !v)}
        />
        <p className="line-clamp-2 text-[11px] font-semibold leading-snug text-white/86">
          {ghost ? `Referencias de ${refCategoryLabelEs(category).toLowerCase()}` : headline}
        </p>
      </div>
      <div className="relative mt-2 overflow-hidden rounded-[12px] border border-white/10 bg-black/30">
        {src && !ghost ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt=""
            draggable
            onDragStart={(event) => {
              event.dataTransfer.setData("application/x-brand-board-ref", category);
              event.dataTransfer.setData("application/x-brand-board-ref-url", item!.assetUrl);
            }}
            className="aspect-[4/3] w-full object-cover"
          />
        ) : (
          <div className="flex aspect-[4/3] items-center justify-center text-[10px] text-white/35">
            {ghost ? `Referencias de ${refCategoryLabelEs(category).toLowerCase()}` : "Sin imagen"}
          </div>
        )}
        {items.length > 1 ? (
          <div className="absolute inset-x-0 bottom-1 flex items-center justify-between px-1">
            <button
              type="button"
              aria-label="Anterior"
              onClick={() => setIndex((i) => (i - 1 + items.length) % items.length)}
              className="rounded-full bg-black/50 p-1 text-white/80"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="text-[8px] tabular-nums text-white/55">
              {index + 1}/{items.length}
            </span>
            <button
              type="button"
              aria-label="Siguiente"
              onClick={() => setIndex((i) => (i + 1) % items.length)}
              className="rounded-full bg-black/50 p-1 text-white/80"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function StyleGuideExportModal({
  open,
  onClose,
  completenessPercent,
  projectName,
  needsSaveBeforeExport,
  onRequestSave,
}: {
  open: boolean;
  onClose: () => void;
  completenessPercent: number;
  projectName?: string;
  needsSaveBeforeExport?: boolean;
  onRequestSave?: () => Promise<boolean>;
}) {
  const { assets, validateElement, synthesizeVoiceExamples } = useBrandKit();
  const [exportMode, setExportMode] = useState<StyleGuideExportMode>("operativo");
  const [exporting, setExporting] = useState(false);
  const [synthesizing, setSynthesizing] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const printGate = useMemo(() => evaluateStyleGuidePrintGate(assets, exportMode), [assets, exportMode]);
  const exportBlocked = exportMode === "cliente" && !printGate.allowed;

  if (!open) return null;

  const handleSynthesizeVoice = async () => {
    setExportError(null);
    setSynthesizing(true);
    try {
      await synthesizeVoiceExamples();
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "No se pudieron sintetizar ejemplos de voz");
    } finally {
      setSynthesizing(false);
    }
  };

  const handleExport = async () => {
    setExportError(null);
    if (exportBlocked) {
      setExportError(printGate.blockers[0]?.message ?? "Export cliente bloqueado");
      return;
    }
    if (needsSaveBeforeExport) {
      if (!onRequestSave) {
        setExportError("Guarda el proyecto antes de generar el PDF.");
        return;
      }
      const saved = await onRequestSave();
      if (!saved) return;
    }
    setExporting(true);
    try {
      const doc = renderStyleGuideV2(assets, {
        exportMode,
        projectName,
        brainVersion: getBrainVersion(assets.brainMeta),
      });
      const { downloadStyleGuidePdf } = await import("@/lib/brandkit/style-guide-download.client");
      await downloadStyleGuidePdf(doc, styleGuideFilename(projectName, doc.generatedAt), {
        assets,
        exportMode,
        projectName,
      });
      onClose();
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "No se pudo generar el PDF");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100110] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <button type="button" className="absolute inset-0 bg-black/60" aria-label="Cerrar" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm rounded-[14px] border border-white/12 bg-[#121820] p-4 shadow-2xl">
        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/45">Libro de estilo</p>
        <p className="mt-1 text-2xl font-black text-white">{completenessPercent}%</p>
        <fieldset className="mt-4 space-y-2">
          <legend className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/45">Modo de export</legend>
          {(["operativo", "cliente"] as const).map((mode) => (
            <label key={mode} className="flex cursor-pointer items-center gap-2 text-[11px] text-white/72">
              <input
                type="radio"
                name="style-guide-export-mode"
                value={mode}
                checked={exportMode === mode}
                onChange={() => setExportMode(mode)}
                disabled={exporting}
                data-testid={`brand-board-style-guide-mode-${mode}`}
                className="h-3.5 w-3.5 accent-[var(--foldder-studio-accent,#5E8E70)]"
              />
              {STYLE_GUIDE_EXPORT_MODE_LABELS[mode]}
            </label>
          ))}
        </fieldset>
        <div className="mt-3 space-y-2">
          <button
            type="button"
            disabled={exporting || synthesizing}
            onClick={() => void handleSynthesizeVoice()}
            data-testid="brand-board-style-guide-synthesize-voice"
            className="flex w-full items-center justify-center rounded-[10px] border border-white/12 px-3 py-2 text-[11px] font-semibold text-white/80 disabled:opacity-60"
          >
            {synthesizing ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
            Sintetizar ejemplos de voz
          </button>
          {exportBlocked ? (
            <button
              type="button"
              disabled={exporting || synthesizing}
              onClick={() => validateElement(VOICE_EXAMPLES_ELEMENT_KEY)}
              data-testid="brand-board-style-guide-validate-voice"
              className="flex w-full items-center justify-center rounded-[10px] border border-amber-300/25 bg-amber-400/10 px-3 py-2 text-[11px] font-semibold text-amber-100 disabled:opacity-60"
            >
              Validar ejemplos de voz
            </button>
          ) : null}
        </div>
        {exportBlocked ? (
          <p className="mt-2 text-[10px] text-amber-200" data-testid="brand-board-style-guide-print-gate">
            {printGate.blockers[0]?.message}
          </p>
        ) : null}
        <button
          type="button"
          disabled={exporting || synthesizing || exportBlocked}
          onClick={() => void handleExport()}
          data-testid="brand-board-style-guide-download"
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-[10px] bg-[var(--foldder-studio-accent,#5E8E70)] px-3 py-2.5 text-[12px] font-bold text-white disabled:opacity-70"
        >
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Download className="h-4 w-4" aria-hidden />}
          {needsSaveBeforeExport ? "Guardar y generar" : "Generar PDF"}
        </button>
        {exportError ? <p className="mt-2 text-[10px] text-rose-200">{exportError}</p> : null}
      </div>
    </div>
  );
}

export type BrandBoardPanelProps = {
  projectName: string;
  brandSummary?: BrandSummaryResult;
  needsSaveBeforeExport?: boolean;
  onRequestSave?: () => Promise<boolean>;
  onOpenSources?: () => void;
  ingestLocked?: boolean;
  boardDragActive?: boolean;
  onBoardDragEnter?: () => void;
  onBoardDragLeave?: () => void;
  onDropFiles?: (event: React.DragEvent<HTMLElement>) => void;
  onPickFiles?: () => void;
  onAddUrl?: (url: string) => void;
  onRecategorizeReference?: (from: RefCategory, to: RefCategory, imageUrl: string) => void;
};

export function BrandBoardPanel({
  projectName,
  brandSummary,
  needsSaveBeforeExport,
  onRequestSave,
  onOpenSources,
  ingestLocked = false,
  boardDragActive = false,
  onBoardDragEnter,
  onBoardDragLeave,
  onDropFiles,
  onPickFiles,
  onAddUrl,
  onRecategorizeReference,
}: BrandBoardPanelProps) {
  const { view, assets, pipelinePhase } = useBrandKit();
  const [exportOpen, setExportOpen] = useState(false);
  const [urlDraft, setUrlDraft] = useState("");
  const [taglineConflictOpen, setTaglineConflictOpen] = useState(false);
  const [localDragDepth, setLocalDragDepth] = useState(0);
  const dragDepthRef = useRef(0);

  const handlePanelDragEnter = useCallback(
    (event: React.DragEvent<HTMLElement>) => {
      event.preventDefault();
      dragDepthRef.current += 1;
      if (dragDepthRef.current === 1) {
        setLocalDragDepth(1);
        onBoardDragEnter?.();
      }
    },
    [onBoardDragEnter],
  );

  const handlePanelDragLeave = useCallback(
    (event: React.DragEvent<HTMLElement>) => {
      event.preventDefault();
      if (event.currentTarget.contains(event.relatedTarget as Node)) return;
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) {
        setLocalDragDepth(0);
        onBoardDragLeave?.();
      }
    },
    [onBoardDragLeave],
  );

  const handlePanelDrop = useCallback(
    (event: React.DragEvent<HTMLElement>) => {
      event.preventDefault();
      dragDepthRef.current = 0;
      setLocalDragDepth(0);
      onBoardDragLeave?.();
      onDropFiles?.(event);
    },
    [onBoardDragLeave, onDropFiles],
  );

  const dragActive = boardDragActive || localDragDepth > 0;

  const voiceMessage = useMemo(() => {
    if (view.voice.tagline?.trim()) return view.voice.tagline.trim();
    const artifactOptions = buildRawArtifactOptions(assets);
    const identity = brandSummary?.identityNarrative.value?.trim();
    if (
      identity &&
      !isRawArtifact(identity, artifactOptions) &&
      !identity.includes("«") &&
      !identity.toLowerCase().includes("conocimiento")
    ) {
      return identity;
    }
    return null;
  }, [view.voice.tagline, brandSummary?.identityNarrative.value, assets]);

  const toneChips = useMemo(() => {
    const artifactOptions = buildRawArtifactOptions(assets);
    const fromBoard = view.voice.toneChips.slice(0, 5).map((chip) => chip.text);
    if (fromBoard.length) return fromBoard;
    const traits = filterProjectableToneTraits(filterLegacyLanguageTraits(assets.strategy.languageTraits), artifactOptions);
    if (traits.length) return traits.slice(0, 5);
    const toneValue = brandSummary?.tone.value?.trim();
    if (toneValue && !isRawArtifact(toneValue, artifactOptions) && !toneValue.includes("«")) {
      return toneValue
        .split("·")
        .map((part) => part.trim())
        .filter(Boolean)
        .slice(0, 5);
    }
    return [];
  }, [view.voice.toneChips, assets, brandSummary?.tone.value]);

  const taglineGhost = view.voice.taglineMeta.status === "ghost" && !voiceMessage;
  const paletteGhost = view.palette.length === 0 || view.palette.every((swatch) => swatch.meta.status === "ghost");

  const handleRecategorize = useCallback(
    (from: RefCategory, to: RefCategory, imageUrl: string) => {
      onRecategorizeReference?.(from, to, imageUrl);
    },
    [onRecategorizeReference],
  );

  return (
    <div
      className="brand-board-landing-grid mx-auto flex h-full min-h-0 w-full max-w-[1400px] flex-1 gap-5 p-4 lg:p-5"
      data-testid="brand-board-panel"
      onDragEnter={handlePanelDragEnter}
      onDragLeave={handlePanelDragLeave}
      onDragOver={(event) => event.preventDefault()}
      onDrop={handlePanelDrop}
    >
      <aside className="flex min-h-0 w-full min-w-[280px] max-w-[360px] shrink-0 flex-col gap-4 lg:w-[30%]">
        <div
          className={`brand-board-dropzone relative flex min-h-[180px] flex-[0_0_33%] flex-col items-center justify-center rounded-[16px] border border-dashed px-4 py-6 text-center transition ${
            dragActive || pipelinePhase !== "idle"
              ? "brand-board-dropzone--active border-[var(--foldder-studio-accent,#5E8E70)] bg-[var(--foldder-studio-accent,#5E8E70)]/10"
              : "border-white/18 bg-white/[0.02]"
          } ${view.sourcesCount === 0 ? "brand-board-dropzone--empty" : ""}`}
          data-testid="brand-board-dropzone"
        >
          <button
            type="button"
            disabled={ingestLocked}
            onClick={() => onPickFiles?.()}
            className={`flex flex-col items-center ${
              ingestLocked ? "cursor-not-allowed opacity-70" : "cursor-pointer hover:opacity-90"
            }`}
          >
            <Upload className="mb-2 h-5 w-5 text-white/35" aria-hidden />
            <span className="text-[12px] font-semibold text-white/72">
              Arrastra o haz clic para subir documentos, imágenes o logos
            </span>
          </button>
          <div className="mt-3 flex w-full max-w-[220px] items-center gap-2 rounded-[10px] border border-white/12 bg-black/25 px-2 py-1.5">
            <Link2 className="h-3.5 w-3.5 shrink-0 text-white/35" aria-hidden />
            <input
              type="url"
              value={urlDraft}
              disabled={ingestLocked}
              placeholder="o pega una URL"
              className="min-w-0 flex-1 bg-transparent text-[11px] text-white/78 outline-none placeholder:text-white/30"
              onChange={(event) => setUrlDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && urlDraft.trim()) {
                  event.preventDefault();
                  onAddUrl?.(urlDraft.trim());
                  setUrlDraft("");
                }
              }}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenSources}
          className="inline-flex items-center justify-between rounded-[12px] border border-white/12 bg-white/[0.04] px-3 py-2.5 text-left hover:bg-white/[0.07]"
        >
          <span className="text-[11px] font-bold text-white/78">
            {view.sourcesCount} fuente{view.sourcesCount === 1 ? "" : "s"}
          </span>
          <ChevronRight className="h-4 w-4 text-white/35" aria-hidden />
        </button>

        <div className="flex-1" aria-hidden />

        <button
          type="button"
          data-testid="brand-board-completeness"
          onClick={() => setExportOpen(true)}
          className="w-full rounded-[14px] border border-[var(--foldder-studio-accent,#5E8E70)]/45 bg-[var(--foldder-studio-accent,#5E8E70)]/12 px-3 py-3 text-left hover:bg-[var(--foldder-studio-accent,#5E8E70)]/18"
        >
          <span className="text-[11px] font-bold text-white/88">
            {needsSaveBeforeExport ? "Guardar y generar" : "Descargar Libro de estilo"} · {view.completenessPercent}%
          </span>
        </button>
      </aside>

      <div className="min-h-0 min-w-0 flex-1 space-y-5 overflow-y-auto lg:w-[70%]">
        <BrandBoardSection section="logo">
          <p className="mb-2 text-[9px] font-black uppercase tracking-[0.14em] text-white/38">Identidad</p>
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_minmax(160px,0.7fr)]">
            <LogoTile
              url={view.logo.primary.url}
              meta={view.logo.primary.meta}
              elementKey="logo.primary"
              variant="light"
              autoOpenPicker={Boolean(assets.brainMeta?.pendingLogoPicker)}
            />
            <LogoTile
              url={view.logo.alt.url}
              meta={view.logo.alt.meta}
              elementKey="logo.alt"
              variant="dark"
            />
            <BrandBoardSection section="typography" className="contents">
              <TypographySpecimen {...view.typography} />
            </BrandBoardSection>
          </div>
        </BrandBoardSection>

        <BrandBoardSection section="palette">
          <p className="mb-2 text-[9px] font-black uppercase tracking-[0.14em] text-white/38">Paleta</p>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {paletteGhost
              ? Array.from({ length: 5 }).map((_, index) => (
                  <div
                    key={`ghost-swatch-${index}`}
                    className="aspect-[4/5] min-w-[72px] flex-1 rounded-[18px] border border-dashed border-white/15 bg-white/[0.03] opacity-30"
                  />
                ))
              : view.palette.map((swatch) => (
                  <SwatchTile
                    key={swatch.id}
                    hex={swatch.hex}
                    role={swatch.id}
                    meta={swatch.meta}
                    elementKey={`palette.${swatch.id}` as ElementKey}
                  />
                ))}
          </div>
        </BrandBoardSection>

        <BrandBoardSection section="messages">
          <p className="mb-2 text-[9px] font-black uppercase tracking-[0.14em] text-white/38">Voz</p>
          <div
            className={`relative rounded-[18px] border border-white/10 bg-white/[0.03] p-4 ${
              taglineGhost ? "opacity-30" : ""
            }`}
          >
            <BrandBoardProposedDot meta={view.voice.taglineMeta} />
            <BrandBoardElementReview
              elementKey="messages.tagline"
              meta={view.voice.taglineMeta}
              open={taglineConflictOpen}
              onToggle={() => setTaglineConflictOpen((v) => !v)}
            />
            <p className="text-xl font-semibold leading-snug text-white sm:text-2xl">
              {taglineGhost ? "Aquí aparecerá tu mensaje de marca" : voiceMessage}
            </p>
            <BrandBoardSection section="tone" className="mt-4">
              <div className="flex flex-wrap gap-2">
                {toneChips.map((chip) => (
                  <span
                    key={chip}
                    className="rounded-full border border-white/12 bg-white/[0.06] px-3 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-white/78"
                  >
                    {chip}
                  </span>
                ))}
              </div>
            </BrandBoardSection>
          </div>
        </BrandBoardSection>

        <section>
          <p className="mb-2 text-[9px] font-black uppercase tracking-[0.14em] text-white/38">Referencias</p>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {BRANDKIT_REF_CATEGORIES.map((category) => (
              <BrandBoardSection key={category} section={`references.${category}`} className="contents">
                <ReferenceCarousel
                  category={category}
                  section={view.references[category]}
                  onRecategorize={handleRecategorize}
                />
              </BrandBoardSection>
            ))}
          </div>
        </section>
      </div>

      <StyleGuideExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        completenessPercent={view.completenessPercent}
        projectName={projectName}
        needsSaveBeforeExport={needsSaveBeforeExport}
        onRequestSave={onRequestSave}
      />
    </div>
  );
}
