"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import type {
  BrandLogoState,
  CropMime,
  LogoCandidate,
  LogoIntakeAnalyzeResult,
  LogoProposal,
} from "@/lib/genoma/logo-intake/types";
import type { ValidateLogoIntakeResult } from "@/lib/genoma/logo-intake/service";
import type { Genome } from "@/lib/genoma/model/trait";
import type { TraitId } from "@/lib/genoma/model/trait-ids";
import { formatLogoIntakeProvenance } from "@/lib/genoma/logo-intake/genome-bridge";
import { resolveLogoDisplayUrl } from "@/lib/genoma/projection/logo-display-url";
import { LogoIntakeBboxEditor } from "./LogoIntakeBboxEditor";
import { GenomaDepthPanel } from "./GenomaDepthPanel";
import { useGenomaFaceContext } from "./genoma-face-context";
import { cx, G } from "./face-utils";
import { GenomaMediaImage } from "./GenomaMediaImage";

type Phase = "idle" | "reading" | "detecting" | "quality" | "done";

type UndoToast = { token: string; expiresAt: string };

export type LogoIntakePanelHandle = {
  applyAnalyzeResult: (result: LogoIntakeAnalyzeResult) => void;
  syncBrandLogoState: (state: BrandLogoState) => void;
  reportIntakeError: (message: string) => void;
};

function candidateImageSrc(candidate: { cropPng: string; cropMime?: CropMime }): string {
  return `data:${candidate.cropMime ?? "image/png"};base64,${candidate.cropPng}`;
}

async function readJson<T>(res: Response): Promise<T> {
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? "request_failed");
  return data;
}

export const LogoIntakePanel = forwardRef<
  LogoIntakePanelHandle,
  {
    projectId: string;
    genome?: Genome;
    onGenomeChange?: (genome: Genome) => void;
  }
>(function LogoIntakePanel({ projectId, genome, onGenomeChange }, ref) {
  const [state, setState] = useState<BrandLogoState | null>(null);
  const [proposal, setProposal] = useState<LogoProposal | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [provenanceLabel, setProvenanceLabel] = useState<string | null>(null);
  const [undoToast, setUndoToast] = useState<UndoToast | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lockedNotice, setLockedNotice] = useState<string | null>(null);
  const [intakeNotice, setIntakeNotice] = useState<string | null>(null);
  const [darkBg, setDarkBg] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [adjustCandidateId, setAdjustCandidateId] = useState<string | null>(null);
  const [hiResByCandidateId, setHiResByCandidateId] = useState<
    Record<string, { cropPng: string; cropMime: CropMime; cropWidthPx: number; cropHeightPx: number }>
  >({});
  const [hiResLoadingId, setHiResLoadingId] = useState<string | null>(null);
  const manualInputRef = useRef<HTMLInputElement>(null);
  const depthAnchorRef = useRef<HTMLButtonElement>(null);
  const [depthOpen, setDepthOpen] = useState(false);
  const faceCtx = useGenomaFaceContext();

  const genomeRef = useRef(genome);
  genomeRef.current = genome;

  const loadProposal = useCallback(async () => {
    const res = await fetch(`/api/genoma/logo-intake/proposal?projectId=${encodeURIComponent(projectId)}`);
    if (res.status === 404) {
      setProposal(null);
      setSelectedId(null);
      return;
    }
    const data = await readJson<{ proposal: LogoProposal }>(res);
    setProposal(data.proposal);
    setSelectedId(data.proposal.best?.id ?? null);
  }, [projectId]);

  const applyValidateResult = useCallback(
    async (data: ValidateLogoIntakeResult) => {
      setState(data.state);
      onGenomeChange?.(data.genome);
      setProvenanceLabel(data.provenanceLabel || null);
      setProposal(null);
      setSelectedId(null);
      setUndoToast(data.undo);
      if (data.state.status === "proposed" && data.state.activeBatchId) {
        await loadProposal();
      }
    },
    [loadProposal, onGenomeChange],
  );

  const runUndoValidate = useCallback(async () => {
    if (!undoToast) return;
    setBusy("undo");
    setError(null);
    try {
      const res = await fetch("/api/genoma/logo-intake/undo-validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, token: undoToast.token }),
      });
      const data = await readJson<ValidateLogoIntakeResult>(res);
      setUndoToast(null);
      setState(data.state);
      onGenomeChange?.(data.genome);
      setProvenanceLabel(null);
      if (data.state.status === "proposed" && data.state.activeBatchId) {
        await loadProposal();
        setSelectedId(null);
      } else {
        setProposal(null);
        setSelectedId(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "undo_failed");
      setUndoToast(null);
    } finally {
      setBusy(null);
    }
  }, [loadProposal, onGenomeChange, projectId, undoToast]);

  useEffect(() => {
    if (!undoToast) return;
    const ms = new Date(undoToast.expiresAt).getTime() - Date.now();
    const timer = window.setTimeout(() => setUndoToast(null), Math.max(0, ms));
    return () => window.clearTimeout(timer);
  }, [undoToast]);

  const loadState = useCallback(async () => {
    const res = await fetch(`/api/genoma/logo-intake/analyze?projectId=${encodeURIComponent(projectId)}`);
    const data = await readJson<{ state: BrandLogoState }>(res);
    setState(data.state);
    if (data.state.status === "proposed" && data.state.activeBatchId) {
      await loadProposal();
    } else {
      setProposal(null);
      setSelectedId(null);
    }
  }, [projectId, loadProposal]);

  const applyAnalyzeResult = useCallback((data: LogoIntakeAnalyzeResult) => {
    setState(data.state);
    setError(null);
    setLockedNotice(null);
    setIntakeNotice(null);
    setPhase("done");
    setBusy(null);
    setHiResByCandidateId({});

    if (data.locked) {
      setLockedNotice(
        data.newSightings > 0
          ? `logo ya validado — ${data.newSightings} avistamiento${data.newSightings === 1 ? "" : "s"} nuevo${data.newSightings === 1 ? "" : "s"} registrado${data.newSightings === 1 ? "" : "s"}`
          : "logo ya validado — sin avistamientos nuevos en este lote",
      );
      setProposal(null);
      setSelectedId(null);
    } else if (data.proposal) {
      setProposal(data.proposal);
      setSelectedId(data.proposal.best?.id ?? null);
      if (!data.proposal.best) {
        setIntakeNotice("no se detectaron logos en estos documentos · prueba otro archivo o sube el logo manualmente");
      } else if (data.proposal.lowQuality) {
        setIntakeNotice("candidatos de baja calidad · revisa alternativas o ajusta el área");
      }
    }
  }, []);

  const reportIntakeError = useCallback((message: string) => {
    setError(message);
    setIntakeNotice(null);
    setPhase("idle");
    setBusy(null);
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      applyAnalyzeResult,
      syncBrandLogoState: (nextState: BrandLogoState) => {
        setState(nextState);
        setProposal(null);
        setSelectedId(null);
        setLockedNotice(null);
        setIntakeNotice(null);
        setProvenanceLabel(null);
        setUndoToast(null);
        setPhase("idle");
        setHiResByCandidateId({});
      },
      reportIntakeError,
    }),
    [applyAnalyzeResult, reportIntakeError],
  );

  useEffect(() => {
    void loadState().catch((err) => setError(err instanceof Error ? err.message : "load_failed"));
  }, [loadState]);

  const selectCandidate = useCallback(
    async (candidate: LogoCandidate) => {
      setSelectedId(candidate.id);
      if (!proposal || candidate.id === proposal.best?.id) return;
      if (hiResByCandidateId[candidate.id]) return;
      setHiResLoadingId(candidate.id);
      try {
        const res = await fetch(
          `/api/genoma/logo-intake/candidate-preview?projectId=${encodeURIComponent(projectId)}&candidateId=${encodeURIComponent(candidate.id)}`,
        );
        const data = await readJson<{
          cropPng: string;
          cropMime: CropMime;
          cropWidthPx: number;
          cropHeightPx: number;
        }>(res);
        setHiResByCandidateId((prev) => ({ ...prev, [candidate.id]: data }));
      } catch {
        /* mantiene thumb */
      } finally {
        setHiResLoadingId(null);
      }
    },
    [hiResByCandidateId, projectId, proposal],
  );

  const resolveSelectedCandidate = useCallback(
    (candidate: LogoCandidate | null): LogoCandidate | null => {
      if (!candidate) return null;
      const hiRes = hiResByCandidateId[candidate.id];
      return hiRes ? { ...candidate, ...hiRes } : candidate;
    },
    [hiResByCandidateId],
  );

  const validateSelected = useCallback(
    async (kind: "accept_best" | "accept_alternative") => {
      if (!selectedId) return;
      setBusy("validate");
      setError(null);
      try {
        const res = await fetch("/api/genoma/logo-intake/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            candidateId: selectedId,
            kind,
            genome: genomeRef.current ?? {},
          }),
        });
        const data = await readJson<ValidateLogoIntakeResult>(res);
        await applyValidateResult(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "validate_failed");
      } finally {
        setBusy(null);
      }
    },
    [applyValidateResult, projectId, selectedId],
  );

  const validateManual = useCallback(
    async (file: File) => {
      setBusy("manual");
      setError(null);
      const form = new FormData();
      form.set("projectId", projectId);
      form.set("manualFile", file);
      form.set("genome", JSON.stringify(genomeRef.current ?? {}));
      try {
        const res = await fetch("/api/genoma/logo-intake/validate", { method: "POST", body: form });
        const data = await readJson<ValidateLogoIntakeResult>(res);
        await applyValidateResult(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "manual_failed");
      } finally {
        setBusy(null);
      }
    },
    [applyValidateResult, projectId],
  );

  const isValidated = state?.status === "validated" || state?.status === "manual";
  const selectedRaw = findCandidate(proposal, selectedId) ?? proposal?.best ?? null;
  const selected = resolveSelectedCandidate(selectedRaw);
  const showLowQuality = Boolean(proposal && (proposal.lowQuality || !proposal.best));
  const hasAdjustTarget = Boolean(proposal?.best || (proposal?.alternatives?.length ?? 0) > 0);
  const adjustTargetId = selectedRaw?.id ?? proposal?.best?.id ?? proposal?.alternatives[0]?.id ?? null;
  const showDepth = isValidated && Boolean(faceCtx?.genome);

  const onAdjustValidated = useCallback(
    async (result: ValidateLogoIntakeResult) => {
      setAdjustCandidateId(null);
      setError(null);
      await applyValidateResult(result);
    },
    [applyValidateResult],
  );

  return (
    <section className={cx("relative flex min-h-[70vh] w-full flex-col items-center justify-center gap-10 self-stretch bg-[#1A1B1E] px-8 py-16 text-white", G.section)}>
      <div className="genoma-depth-trigger-wrap genoma-depth-trigger-wrap--dark">
        {showDepth && faceCtx?.genome ? (
          <>
            <button
              ref={depthAnchorRef}
              type="button"
              aria-label="vectorizar, re-detectar y evidencia del logo"
              aria-expanded={depthOpen}
              onClick={() => setDepthOpen((v) => !v)}
              className="genoma-depth-trigger"
            >
              ···
            </button>
            {depthOpen ? (
              <GenomaDepthPanel
                genome={faceCtx.genome}
                view={faceCtx.view}
                traitId={"logo.primary" as TraitId}
                anchorRef={depthAnchorRef}
                onClose={() => setDepthOpen(false)}
              />
            ) : null}
          </>
        ) : null}
      </div>
      <p className={G.label}>logo</p>

      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      {lockedNotice ? <p className="text-sm text-[#FFBD1B]">{lockedNotice}</p> : null}
      {intakeNotice ? <p className="text-sm text-white/55">{intakeNotice}</p> : null}

      {isValidated && state?.asset ? (
        <ValidatedView
          projectId={projectId}
          state={state}
          genome={genome}
          provenanceLabel={
            provenanceLabel ??
            (state.origin
              ? formatLogoIntakeProvenance(state.origin)
              : null)
          }
          darkBg={darkBg}
          onToggleBg={() => setDarkBg((v) => !v)}
        />
      ) : phase !== "idle" && busy === "analyze" ? (
        <AnalyzingView phase={phase} proposal={proposal} />
      ) : proposal ? (
        <ProposalView
          proposal={proposal}
          selected={selected}
          selectedLoading={Boolean(selectedRaw && hiResLoadingId === selectedRaw.id)}
          showLowQuality={showLowQuality}
          darkBg={darkBg}
          onToggleBg={() => setDarkBg((v) => !v)}
          onSelect={(c) => void selectCandidate(c)}
          onAccept={() => void validateSelected(selectedRaw?.id === proposal.best?.id ? "accept_best" : "accept_alternative")}
          onManual={() => manualInputRef.current?.click()}
          onAdjust={() => adjustTargetId && setAdjustCandidateId(adjustTargetId)}
          showAdjust={hasAdjustTarget}
          busy={busy}
        />
      ) : (
        <LogoSectionDropHint />
      )}

      {!isValidated && proposal ? (
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            disabled={Boolean(busy) || !selected}
            onClick={() => void validateSelected(selected?.id === proposal.best?.id ? "accept_best" : "accept_alternative")}
            className={cx(G.btn, "border-[#FFBD1B] bg-[#FFBD1B] text-black hover:bg-[#e5aa18]")}
          >
            es correcto
          </button>
          {hasAdjustTarget && adjustTargetId ? (
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => setAdjustCandidateId(adjustTargetId)}
              className={cx(G.btn, "border-white/20 text-white/80 hover:border-white hover:text-white")}
            >
              ajustar área
            </button>
          ) : null}
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={() => manualInputRef.current?.click()}
            className={cx(G.btn, "border-white/20 text-white/80 hover:border-white hover:text-white")}
          >
            subir logo manualmente
          </button>
        </div>
      ) : null}

      <input
        ref={manualInputRef}
        type="file"
        accept=".png,.jpg,.jpeg,.webp,.svg"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void validateManual(file);
          e.target.value = "";
        }}
      />

      {adjustCandidateId ? (
        <LogoIntakeBboxEditor
          projectId={projectId}
          candidateId={adjustCandidateId}
          genome={genome}
          onClose={() => setAdjustCandidateId(null)}
          onValidated={onAdjustValidated}
        />
      ) : null}

      {undoToast ? (
        <div className="fixed bottom-8 left-1/2 z-[75] flex -translate-x-1/2 items-center gap-4 border border-white/20 bg-[#1A1B1E] px-5 py-3 text-sm text-white shadow-lg">
          <span>logo validado</span>
          <button
            type="button"
            disabled={busy === "undo"}
            onClick={() => void runUndoValidate()}
            className="border border-[#FFBD1B] px-3 py-1 text-[#FFBD1B] hover:bg-[#FFBD1B]/10"
          >
            deshacer
          </button>
        </div>
      ) : null}
    </section>
  );
});

function findCandidate(proposal: LogoProposal | null, id: string | null): LogoCandidate | null {
  if (!proposal || !id) return null;
  if (proposal.best?.id === id) return proposal.best;
  return proposal.alternatives.find((c) => c.id === id) ?? null;
}

function proposalPickerItems(proposal: LogoProposal): LogoCandidate[] {
  const items: LogoCandidate[] = [];
  if (proposal.best) items.push(proposal.best);
  for (const alt of proposal.alternatives) {
    if (alt.id !== proposal.best?.id) items.push(alt);
  }
  return items;
}

function LogoSectionDropHint() {
  return (
    <p className="max-w-md text-center text-sm leading-relaxed text-white/45">
      el material de marca se sube solo en el panel izquierdo
      <span className="mx-2 inline-block text-[#FFBD1B]/70" aria-hidden>
        ←
      </span>
      <span className="block text-xs text-white/30">pdf · png · jpg · webp · docx</span>
    </p>
  );
}

function AnalyzingView({ phase, proposal }: { phase: Phase; proposal: LogoProposal | null }) {
  const steps = [
    { key: "reading", label: "leyendo documentos" },
    { key: "detecting", label: "detectando logos" },
    { key: "quality", label: "evaluando calidad" },
  ] as const;
  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      {steps.map((step) => {
        const active = phase === step.key || (phase === "done" && step.key === "quality");
        const done =
          (step.key === "reading" && (phase === "detecting" || phase === "quality" || phase === "done")) ||
          (step.key === "detecting" && (phase === "quality" || phase === "done")) ||
          (step.key === "quality" && phase === "done");
        return (
          <div key={step.key} className={cx("text-sm", done ? "text-white" : active ? "text-[#FFBD1B]" : "text-white/35")}>
            {step.label}
            {proposal && step.key === "quality" && phase === "done"
              ? ` · ${Math.round(proposal.timings.totalMs / 1000)}s`
              : null}
          </div>
        );
      })}
    </div>
  );
}

function LogoPreview({
  candidate,
  darkBg,
  onToggleBg,
  large,
}: {
  candidate: LogoCandidate | { cropPng: string; cropMime?: CropMime; cropWidthPx: number; cropHeightPx: number; assetUrl?: string };
  darkBg: boolean;
  onToggleBg: () => void;
  large?: boolean;
}) {
  const src = "assetUrl" in candidate && candidate.assetUrl ? candidate.assetUrl : candidateImageSrc(candidate);
  return (
    <div className="flex w-full flex-col items-center gap-4">
      <div className={cx("grid w-full gap-px bg-white/10", large ? "grid-cols-1 md:grid-cols-2" : "grid-cols-2")}>
        <div className={cx("flex items-center justify-center bg-white p-8", large && "min-h-[220px]")}>
          <GenomaMediaImage src={src} alt="logo propuesto" className="max-h-[28vh] max-w-full object-contain" eager />
        </div>
        <div className={cx("flex items-center justify-center bg-[#0d0d0f] p-8", large && "min-h-[220px]")}>
          <GenomaMediaImage src={src} alt="" aria-hidden className="max-h-[28vh] max-w-full object-contain" eager />
        </div>
      </div>
      <button type="button" onClick={onToggleBg} className="text-xs text-white/40 hover:text-white/70">
        {darkBg ? "fondo claro" : "fondo oscuro"}
      </button>
    </div>
  );
}

function ProposalView({
  proposal,
  selected,
  selectedLoading,
  showLowQuality,
  darkBg,
  onToggleBg,
  onSelect,
  onAccept,
  onManual,
  onAdjust,
  showAdjust,
  busy,
}: {
  proposal: LogoProposal;
  selected: LogoCandidate | null;
  selectedLoading?: boolean;
  showLowQuality: boolean;
  darkBg: boolean;
  onToggleBg: () => void;
  onSelect: (c: LogoCandidate) => void;
  onAccept: () => void;
  onManual: () => void;
  onAdjust: () => void;
  showAdjust: boolean;
  busy: string | null;
}) {
  if (showLowQuality) {
    const pickerItems = proposalPickerItems(proposal);
    return (
      <div className="flex w-full max-w-3xl flex-col items-center gap-8 self-stretch">
        <p className="text-center text-lg text-white/90">
          no hemos encontrado un logo con calidad suficiente
        </p>
        {showAdjust ? (
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={onAdjust}
            className={cx(G.btn, "border-[#FFBD1B] text-[#FFBD1B]")}
          >
            ajustar área
          </button>
        ) : null}
        <button
          type="button"
          disabled={Boolean(busy)}
          onClick={onManual}
          className={cx(G.btn, "border-white/20 text-white/80 hover:border-white hover:text-white")}
        >
          subir logo manualmente
        </button>
        {pickerItems.length > 0 ? (
          <div className="w-full min-w-0 self-stretch">
            <p className={cx(G.label, "mb-4")}>candidatos</p>
            <div className="w-full overflow-x-auto overscroll-x-contain pb-2">
              <div className="flex w-max min-w-full gap-3 px-1">
                {pickerItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelect(item)}
                    className={cx(
                      "shrink-0 border p-3 transition",
                      selected?.id === item.id ? "border-[#FFBD1B]" : "border-white/15 hover:border-white/40",
                    )}
                  >
                    <GenomaMediaImage
                      src={candidateImageSrc(item)}
                      alt={item.docName}
                      className="h-16 w-24 object-contain"
                      eager
                    />
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}
        {selected ? (
          <div className="w-full opacity-70">
            <LogoPreview candidate={selected} darkBg={darkBg} onToggleBg={onToggleBg} large />
            <MetaRow candidate={selected} />
          </div>
        ) : null}
      </div>
    );
  }

  if (!selected) return null;

  const pickerItems = proposalPickerItems(proposal);
  const isBest = selected.id === proposal.best?.id;

  return (
    <div className="flex w-full max-w-4xl flex-col items-center gap-8 self-stretch">
      <p className="text-center text-sm text-white/60">
        {isBest ? "propuesta del sistema" : "alternativa seleccionada"}
        {selectedLoading ? " · cargando vista alta resolución…" : ""}
      </p>
      <LogoPreview candidate={selected} darkBg={darkBg} onToggleBg={onToggleBg} large />
      <MetaRow candidate={selected} />
      {showAdjust ? (
        <button
          type="button"
          disabled={Boolean(busy)}
          onClick={onAdjust}
          className={cx(G.btn, "border-white/20 text-white/80 hover:border-white hover:text-white")}
        >
          ajustar área
        </button>
      ) : null}
      {pickerItems.length > 1 ? (
        <div className="w-full min-w-0 self-stretch">
          <p className={cx(G.label, "mb-4")}>candidatos</p>
          <div className="w-full overflow-x-auto overscroll-x-contain pb-2">
            <div className="flex w-max min-w-full gap-3 px-1">
              {pickerItems.map((item) => {
                const isItemBest = item.id === proposal.best?.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelect(item)}
                    className={cx(
                      "relative shrink-0 border p-3 transition",
                      selected.id === item.id ? "border-[#FFBD1B]" : "border-white/15 hover:border-white/40",
                    )}
                  >
                    {isItemBest ? (
                      <span className="absolute -top-2 left-2 bg-[#FFBD1B] px-1.5 py-0.5 text-[10px] font-medium text-black">
                        mejor
                      </span>
                    ) : null}
                    <GenomaMediaImage
                      src={candidateImageSrc(item)}
                      alt={item.docName}
                      className="h-16 w-24 object-contain"
                      eager
                    />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
      <button type="button" disabled={Boolean(busy)} onClick={onAccept} className="sr-only">
        aceptar
      </button>
    </div>
  );
}

function ValidatedView({
  projectId,
  state,
  genome,
  provenanceLabel,
  darkBg,
  onToggleBg,
}: {
  projectId: string;
  state: BrandLogoState;
  genome?: Genome;
  provenanceLabel: string | null;
  darkBg: boolean;
  onToggleBg: () => void;
}) {
  const asset = state.asset!;
  const crowned = genome?.traits["logo.primary"];
  const crownedCandidate = crowned?.candidates.find((c) => c.id === crowned.crownId);
  const genomeLogoUrl =
    crownedCandidate?.value &&
    resolveLogoDisplayUrl(crownedCandidate.value as import("@/lib/genoma/model/trait-values").LogoValue, crownedCandidate.derived);

  const candidate = {
    cropPng: "",
    cropWidthPx: asset.widthPx,
    cropHeightPx: asset.heightPx,
    assetUrl:
      genomeLogoUrl ??
      `/api/genoma/logo-intake/asset?projectId=${encodeURIComponent(projectId)}&format=png`,
  };

  return (
    <div className="flex w-full max-w-4xl flex-col items-center gap-8">
      <div className="flex items-center gap-3 text-sm text-[#FFBD1B]">
        <span aria-hidden>🔒</span>
        <span>
          logo validado
          {state.validatedAt ? ` · ${new Date(state.validatedAt).toLocaleDateString("es-ES")}` : ""}
        </span>
      </div>
      <LogoPreview candidate={candidate} darkBg={darkBg} onToggleBg={onToggleBg} large />
      {provenanceLabel ? (
        <p className="text-sm text-white/50">origen: {provenanceLabel}</p>
      ) : null}
      {state.sightings.length > 0 ? (
        <p className="text-sm text-white/50">{state.sightings.length} avistamientos registrados</p>
      ) : null}
    </div>
  );
}

function MetaRow({ candidate }: { candidate: LogoCandidate }) {
  return (
    <p className="text-center text-sm text-white/50">
      {candidate.docName} · pág. {candidate.page} · calidad {Math.round(candidate.quality.total)} ·{" "}
      {candidate.model.variant}
      {candidate.model.brandText ? ` · «${candidate.model.brandText}»` : ""}
    </p>
  );
}
