"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BookOpen, Brain, Check, ChevronDown, FileText, PenLine, Save, Sparkles, X } from "lucide-react";
import {
  createGuionistaApproaches,
  createGuionistaVersion,
  createSocialAdaptations,
} from "./guionista-engine";
import { runGuionistaAi } from "./guionista-ai-client";
import {
  GUI_DEFAULT_SETTINGS,
  GUI_FORMAT_LABELS,
  buildGuionistaAssetFromVersion,
  nowIso,
  normalizeGuionistaData,
  normalizeGuionistaSettings,
  plainTextFromMarkdown,
  type GuionistaApproach,
  type GuionistaBrainContext,
  type GuionistaFormat,
  type GuionistaGeneratedTextAssetsMetadata,
  type GuionistaNodeData,
  type GuionistaSettings,
  type GuionistaSocialAdaptation,
  type GuionistaTextAsset,
  type GuionistaVersion,
} from "./guionista-types";

const FORMAT_OPTIONS: Array<{ id: GuionistaFormat; title: string; help: string }> = [
  { id: "post", title: "Post", help: "LinkedIn, redes o publicaciones cortas." },
  { id: "article", title: "Artículo", help: "Texto editorial, blog u opinión." },
  { id: "script", title: "Guion", help: "Vídeo, voz en off o narración." },
  { id: "scenes", title: "Escenas", help: "Secuencias visuales y storyboard textual." },
  { id: "slides", title: "Slides", help: "Estructura para presentación." },
  { id: "campaign", title: "Campaña", help: "Claims, titulares, bajadas y CTAs." },
  { id: "rewrite", title: "Reescribir", help: "Mejorar o adaptar un texto existente." },
];

const QUICK_ACTIONS = [
  "Mas corto",
  "Mas claro",
  "Mas humano",
  "Mas premium",
  "Mas directo",
  "Mas ironico",
  "Crear titulares",
  "Adaptar a redes",
  "Convertir en slides",
  "Convertir en guion",
];

type Props = {
  nodeId: string;
  data: GuionistaNodeData;
  generatedTextAssets?: GuionistaGeneratedTextAssetsMetadata;
  openAssetId?: string | null;
  initialBriefing?: string;
  brainConnected?: boolean;
  brainHints?: string[];
  brainContext?: GuionistaBrainContext;
  onChange: (patch: Partial<GuionistaNodeData>) => void;
  onSaveAsset?: (asset: GuionistaTextAsset) => void;
  onClose: () => void;
};

function versionLabel(index: number, version: GuionistaVersion) {
  return `V${index + 1} · ${version.label || "Borrador"}`;
}

function mergeVersionIntoData(data: GuionistaNodeData, version: GuionistaVersion, versions: GuionistaVersion[]): Partial<GuionistaNodeData> {
  return {
    title: version.title,
    format: version.format,
    versions,
    activeVersionId: version.id,
    value: version.markdown,
    promptValue: version.markdown,
    updatedAt: new Date().toISOString(),
  };
}

function StatusPill({ brainConnected }: { brainConnected?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-[11px] font-light text-white/70">
      <Brain className="h-3.5 w-3.5" strokeWidth={1.6} />
      {brainConnected ? "Usando Brain" : "Sin Brain conectado"}
    </span>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">{children}</label>;
}

function relativeTimeFromIso(iso?: string): string | null {
  if (!iso) return null;
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return null;
  const diffSeconds = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (diffSeconds < 10) return "ahora";
  if (diffSeconds < 60) return `hace ${diffSeconds} s`;
  const minutes = Math.round(diffSeconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  return `hace ${days} d`;
}

function assetSignature(title: string | undefined, version: GuionistaVersion | null): string {
  return JSON.stringify({
    title: title || version?.title || "",
    versionId: version?.id || "",
    markdown: version?.markdown || "",
    format: version?.format || "",
  });
}

function saveStateLabel(saveState: "idle" | "dirty" | "saving" | "saved", hasAsset: boolean): string {
  if (saveState === "saving") return "Guardando…";
  if (saveState === "saved") return "Guardado";
  if (saveState === "dirty") return hasAsset ? "Cambios sin guardar" : "Sin guardar";
  return "Sin guardar";
}

function saveStateClass(saveState: "idle" | "dirty" | "saving" | "saved"): string {
  if (saveState === "saved") return "border-emerald-300/20 bg-emerald-300/10 text-emerald-100";
  if (saveState === "saving") return "border-amber-200/20 bg-amber-200/10 text-amber-50";
  if (saveState === "dirty") return "border-orange-300/20 bg-orange-300/10 text-orange-100";
  return "border-white/10 bg-white/[0.06] text-white/52";
}

export function GuionistaStudio({
  nodeId,
  data,
  generatedTextAssets,
  openAssetId,
  initialBriefing,
  brainConnected = false,
  brainHints = [],
  brainContext,
  onChange,
  onSaveAsset,
  onClose,
}: Props) {
  const normalized = useMemo(() => normalizeGuionistaData(data), [data]);
  const [stage, setStage] = useState<"create" | "approaches" | "editor" | "social">(
    normalized.versions?.length ? "editor" : "create",
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [brainOpen, setBrainOpen] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "dirty" | "saving" | "saved">("idle");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [loadingLabel, setLoadingLabel] = useState<string | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [socialPack, setSocialPack] = useState<GuionistaSocialAdaptation[]>([]);
  const retryLastActionRef = useRef<(() => void) | null>(null);
  const versions = useMemo(() => normalized.versions ?? [], [normalized.versions]);
  const current = useMemo(
    () => versions.find((version) => version.id === normalized.activeVersionId) ?? versions.at(-1) ?? null,
    [normalized.activeVersionId, versions],
  );
  const activeAsset = useMemo(
    () => generatedTextAssets?.items.find((asset) => asset.id === (openAssetId || normalized.assetId)) ?? null,
    [generatedTextAssets?.items, normalized.assetId, openAssetId],
  );
  const currentSignature = useMemo(
    () => assetSignature(current?.title || normalized.title, current),
    [current, normalized.title],
  );
  const savedSignature = useMemo(() => {
    if (!activeAsset) return "";
    const version = activeAsset.versions.find((item) => item.id === activeAsset.activeVersionId) ?? activeAsset.versions.at(-1) ?? null;
    return assetSignature(activeAsset.title, version);
  }, [activeAsset]);
  const lastSavedRelative = useMemo(() => relativeTimeFromIso(lastSavedAt ?? activeAsset?.updatedAt), [activeAsset?.updatedAt, lastSavedAt]);

  useEffect(() => {
    if (!initialBriefing || normalized.briefing) return;
    onChange({ briefing: initialBriefing });
  }, [initialBriefing, normalized.briefing, onChange]);

  useEffect(() => {
    if (!activeAsset) return;
    const active = activeAsset.versions.find((version) => version.id === activeAsset.activeVersionId) ?? activeAsset.versions.at(-1);
    if (!active) return;
    onChange({
      assetId: activeAsset.id,
      title: activeAsset.title,
      format: activeAsset.type,
      versions: activeAsset.versions,
      activeVersionId: active.id,
      value: active.markdown,
      promptValue: active.markdown,
      status: activeAsset.status,
      updatedAt: new Date().toISOString(),
    });
    setLastSavedAt(activeAsset.updatedAt);
    setSaveState("saved");
    setStage("editor");
    // Load each asset only when the requested id changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAsset?.id]);

  useEffect(() => {
    if (!current) {
      setSaveState(activeAsset ? "saved" : "idle");
      return;
    }
    if (!activeAsset) {
      setSaveState("dirty");
      return;
    }
    setSaveState(currentSignature === savedSignature ? "saved" : "dirty");
  }, [activeAsset, current, currentSignature, savedSignature]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.classList.add("nb-studio-open");
    return () => document.body.classList.remove("nb-studio-open");
  }, []);

  const beginLoading = useCallback((action: string, label: string) => {
    setLoadingAction(action);
    setLoadingLabel(label);
    setGenerationError(null);
  }, []);

  const endLoading = useCallback(() => {
    setLoadingAction(null);
    setLoadingLabel(null);
  }, []);

  const setRetryableError = useCallback((retry: () => void) => {
    retryLastActionRef.current = retry;
    setGenerationError("No se pudo generar. Reintentar.");
  }, []);

  const updateSettings = (patch: Partial<GuionistaSettings>) => {
    onChange({ settings: { ...normalizeGuionistaSettings(normalized.settings), ...patch } });
  };

  const createApproaches = useCallback(async () => {
    const request = {
      briefing: normalized.briefing || initialBriefing || "",
      format: normalized.format || "post",
      settings: normalized.settings || GUI_DEFAULT_SETTINGS,
      brainContext: brainConnected ? brainContext : { enabled: false },
    };
    beginLoading("approaches", "Creando enfoques…");
    try {
      const response = await runGuionistaAi({ task: "approaches", ...request });
      if (response.task !== "approaches") throw new Error("Respuesta inesperada.");
      onChange({ approaches: response.approaches, updatedAt: new Date().toISOString() });
      setStage("approaches");
      retryLastActionRef.current = null;
    } catch {
      if (!normalized.approaches?.length) {
        const approaches = createGuionistaApproaches({
          ...request,
          brainHints,
        });
        onChange({ approaches, updatedAt: new Date().toISOString() });
        setStage("approaches");
      }
      setRetryableError(() => {
        void createApproaches();
      });
    } finally {
      endLoading();
    }
  }, [beginLoading, brainConnected, brainContext, brainHints, endLoading, initialBriefing, normalized.approaches?.length, normalized.briefing, normalized.format, normalized.settings, onChange, setRetryableError]);

  const writeVersion = useCallback(async (approach?: GuionistaApproach | null) => {
    const request = {
      briefing: normalized.briefing || initialBriefing || "",
      format: normalized.format || "post",
      settings: normalized.settings || GUI_DEFAULT_SETTINGS,
      approach,
      brainContext: brainConnected ? brainContext : { enabled: false },
    };
    const actionKey = `draft:${approach?.id ?? "direct"}`;
    beginLoading(actionKey, "Escribiendo texto…");
    try {
      const response = await runGuionistaAi({ task: "draft", ...request });
      if (response.task !== "draft") throw new Error("Respuesta inesperada.");
      onChange({
        ...mergeVersionIntoData(normalized, response.version, [...versions, response.version]),
        selectedApproachId: approach?.id,
      });
      setStage("editor");
      retryLastActionRef.current = null;
    } catch {
      if (versions.length === 0) {
        const version = createGuionistaVersion({
          ...request,
          brainHints: brainConnected ? brainHints : [],
          label: approach ? "Primer borrador" : "Borrador directo",
        });
        onChange({
          ...mergeVersionIntoData(normalized, version, [version]),
          selectedApproachId: approach?.id,
        });
        setStage("editor");
      }
      setRetryableError(() => {
        void writeVersion(approach);
      });
    } finally {
      endLoading();
    }
  }, [beginLoading, brainConnected, brainContext, brainHints, endLoading, initialBriefing, normalized, onChange, setRetryableError, versions]);

  const updateActiveMarkdown = (markdown: string) => {
    if (!current) return;
    const nextVersion: GuionistaVersion = {
      ...current,
      markdown,
      plainText: plainTextFromMarkdown(markdown),
    };
    const nextVersions = versions.map((version) => (version.id === current.id ? nextVersion : version));
    onChange({
      ...mergeVersionIntoData(normalized, nextVersion, nextVersions),
      updatedAt: new Date().toISOString(),
    });
  };

  const applyQuickAction = useCallback(async (action: string) => {
    if (!current) return;
    if (action === "Adaptar a redes") {
      beginLoading(`quick:${action}`, "Adaptando a redes…");
      try {
        const response = await runGuionistaAi({
          task: "social",
          briefing: normalized.briefing || initialBriefing || "",
          format: current.format,
          settings: normalized.settings || GUI_DEFAULT_SETTINGS,
          currentVersion: current,
          sourceAssetId: normalized.assetId,
          sourceVersionId: current.id,
          brainContext: brainConnected ? brainContext : { enabled: false },
        });
        if (response.task !== "social") throw new Error("Respuesta inesperada.");
        setSocialPack(response.socialPack);
        retryLastActionRef.current = null;
      } catch {
        if (socialPack.length === 0) {
          setSocialPack(
            createSocialAdaptations({
              title: current.title,
              markdown: current.markdown,
              sourceAssetId: normalized.assetId,
              sourceVersionId: current.id,
            }),
          );
        }
        setRetryableError(() => {
          void applyQuickAction(action);
        });
      } finally {
        endLoading();
      }
      setStage("social");
      return;
    }
    const targetFormat = action === "Convertir en slides" ? "slides" : action === "Convertir en guion" ? "script" : undefined;
    beginLoading(`quick:${action}`, "Escribiendo texto…");
    try {
      const response = await runGuionistaAi({
        task: "transform",
        briefing: normalized.briefing || initialBriefing || "",
        format: current.format,
        settings: normalized.settings || GUI_DEFAULT_SETTINGS,
        currentVersion: current,
        action,
        targetFormat,
        brainContext: brainConnected ? brainContext : { enabled: false },
      });
      if (response.task !== "transform") throw new Error("Respuesta inesperada.");
      onChange(mergeVersionIntoData(normalized, response.version, [...versions, response.version]));
      setStage("editor");
      retryLastActionRef.current = null;
    } catch {
      setRetryableError(() => {
        void applyQuickAction(action);
      });
    } finally {
      endLoading();
    }
  }, [beginLoading, brainConnected, brainContext, current, endLoading, initialBriefing, normalized, onChange, setRetryableError, socialPack.length, versions]);

  const saveActiveAsset = () => {
    if (!current || !onSaveAsset) return;
    setSaveState("saving");
    const asset = buildGuionistaAssetFromVersion({
      existing: activeAsset,
      nodeId,
      format: current.format,
      title: current.title,
      version: current,
      versions,
      status: normalized.status || "draft",
    });
    onSaveAsset(asset);
    onChange({ assetId: asset.id, updatedAt: asset.updatedAt });
    setLastSavedAt(asset.updatedAt || nowIso());
    setSaveState("saved");
    setSavedMessage("Guardado en Generated Media");
    window.setTimeout(() => setSavedMessage(null), 1800);
  };

  const saveSocialPack = () => {
    if (!onSaveAsset || !current) return;
    for (const social of socialPack) {
      const version: GuionistaVersion = {
        id: social.id,
        label: social.platform,
        title: social.title,
        format: "post",
        markdown: `${social.text}${social.hashtags?.length ? `\n\n${social.hashtags.join(" ")}` : ""}`,
        plainText: plainTextFromMarkdown(social.text),
        createdAt: social.createdAt,
        sourceAction: "Adaptar a redes",
        structured: {
          platform: social.platform,
          hashtags: social.hashtags ?? [],
          sourceAssetId: social.sourceAssetId,
          sourceVersionId: social.sourceVersionId,
        },
      };
      onSaveAsset(
        buildGuionistaAssetFromVersion({
          format: "post",
          title: social.title,
          version,
          versions: [version],
          status: "draft",
          sourceAssetId: normalized.assetId,
          sourceVersionId: current.id,
          platform: social.platform,
        }),
      );
    }
    setSavedMessage("Adaptaciones guardadas en Posts");
    window.setTimeout(() => setSavedMessage(null), 1800);
  };

  const shell = (
    <div className="fixed inset-0 z-[100090] flex flex-col bg-[#101114] text-white" role="dialog" aria-modal="true">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 bg-black/55 px-5 backdrop-blur-2xl">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] text-amber-200">
            <PenLine className="h-5 w-5" strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/40">Guionista</p>
            <h1 className="truncate text-base font-light tracking-wide text-white">
              {current?.title || normalized.title || "Convierte pensamiento en narrativa"}
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill brainConnected={brainConnected} />
          <button type="button" onClick={onClose} className="rounded-xl border border-white/10 bg-white/[0.06] p-2 text-white/65 hover:bg-white/12 hover:text-white" aria-label="Cerrar Guionista">
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto bg-[radial-gradient(circle_at_18%_18%,rgba(253,176,75,0.13),transparent_32%),radial-gradient(circle_at_88%_20%,rgba(99,212,253,0.11),transparent_34%),linear-gradient(180deg,#121318,#090a0d)] px-5 py-6">
        <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
          <section className="min-w-0 rounded-[32px] border border-white/10 bg-white/[0.045] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.32)] backdrop-blur-xl">
            {(loadingLabel || generationError) && (
              <div className={`mb-4 rounded-2xl border px-4 py-3 text-[12px] font-light ${
                loadingLabel
                  ? "border-amber-200/18 bg-amber-200/10 text-amber-50"
                  : "border-rose-300/18 bg-rose-400/10 text-rose-100"
              }`}>
                <span>{loadingLabel || generationError}</span>
                {generationError && retryLastActionRef.current && !loadingAction && (
                  <button
                    type="button"
                    onClick={() => retryLastActionRef.current?.()}
                    className="ml-3 rounded-full border border-rose-100/20 bg-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-rose-50 hover:bg-white/16"
                  >
                    Reintentar
                  </button>
                )}
              </div>
            )}
            {stage === "create" && (
              <div className="mx-auto max-w-3xl py-8">
                <p className="text-[11px] font-light uppercase tracking-[0.26em] text-white/45">Crear</p>
                <h2 className="mt-3 text-4xl font-light tracking-tight text-white">¿Qué quieres escribir?</h2>
                <textarea
                  value={normalized.briefing || ""}
                  onChange={(event) => onChange({ briefing: event.target.value, updatedAt: new Date().toISOString() })}
                  placeholder="Escribe una idea, briefing, nota o pega un texto aquí. No hace falta que esté perfecto."
                  className="mt-6 min-h-48 w-full resize-y rounded-[26px] border border-white/10 bg-black/30 px-5 py-4 text-base font-light leading-relaxed text-white outline-none placeholder:text-white/28 focus:border-amber-200/40"
                />
                <div className="mt-6 grid grid-cols-2 gap-2 md:grid-cols-4">
                  {FORMAT_OPTIONS.map((format) => (
                    <button
                      key={format.id}
                      type="button"
                      onClick={() => onChange({ format: format.id, updatedAt: new Date().toISOString() })}
                      className={`rounded-2xl border px-3 py-3 text-left transition ${
                        normalized.format === format.id
                          ? "border-amber-200/55 bg-amber-200/12 text-amber-50"
                          : "border-white/10 bg-white/[0.04] text-white/68 hover:bg-white/[0.07]"
                      }`}
                    >
                      <span className="block text-[12px] font-semibold uppercase tracking-[0.12em]">{format.title}</span>
                      <span className="mt-1 block text-[10px] font-light leading-snug opacity-60">{format.help}</span>
                    </button>
                  ))}
                </div>
                <div className="mt-6 flex flex-wrap gap-3">
                  <button type="button" onClick={createApproaches} disabled={loadingAction === "approaches"} className="rounded-full bg-white px-5 py-3 text-[12px] font-semibold uppercase tracking-[0.16em] text-black shadow-xl hover:bg-amber-100 disabled:cursor-wait disabled:opacity-55">
                    Crear enfoques
                  </button>
                  <button type="button" onClick={() => writeVersion(null)} disabled={loadingAction === "draft:direct"} className="rounded-full border border-white/14 bg-white/[0.06] px-5 py-3 text-[12px] font-semibold uppercase tracking-[0.16em] text-white/75 hover:bg-white/10 hover:text-white disabled:cursor-wait disabled:opacity-55">
                    Escribir directamente
                  </button>
                </div>
              </div>
            )}

            {stage === "approaches" && (
              <div className="py-4">
                <button type="button" onClick={() => setStage("create")} className="text-[11px] font-light uppercase tracking-[0.18em] text-white/45 hover:text-white">
                  Volver
                </button>
                <h2 className="mt-3 text-3xl font-light">Elige un enfoque</h2>
                <div className="mt-6 grid gap-4 md:grid-cols-3">
                  {(normalized.approaches ?? []).map((approach) => (
                    <article key={approach.id} className="flex min-h-72 flex-col rounded-[26px] border border-white/10 bg-black/24 p-5">
                      <Sparkles className="h-5 w-5 text-amber-200" strokeWidth={1.6} />
                      <h3 className="mt-4 text-xl font-light leading-tight">{approach.title}</h3>
                      <p className="mt-4 text-sm font-light leading-relaxed text-white/62">{approach.idea}</p>
                      <p className="mt-4 text-[11px] font-light uppercase tracking-[0.12em] text-white/42">Tono: {approach.tone}</p>
                      {approach.rationale && (
                        <p className="mt-3 text-[11px] font-light leading-relaxed text-white/42">{approach.rationale}</p>
                      )}
                      <button type="button" onClick={() => writeVersion(approach)} disabled={loadingAction === `draft:${approach.id}`} className="mt-auto rounded-full bg-white px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-black hover:bg-amber-100 disabled:cursor-wait disabled:opacity-55">
                        Usar este enfoque
                      </button>
                    </article>
                  ))}
                </div>
              </div>
            )}

            {stage === "editor" && current && (
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_220px]">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-light uppercase tracking-[0.22em] text-white/40">{GUI_FORMAT_LABELS[current.format]}</p>
                      <input
                        value={current.title}
                        onChange={(event) => {
                          const next = { ...current, title: event.target.value };
                          onChange(mergeVersionIntoData(normalized, next, versions.map((version) => (version.id === current.id ? next : version))));
                        }}
                        className="mt-1 w-full bg-transparent text-3xl font-light text-white outline-none"
                      />
                      <div className={`mt-3 inline-flex flex-wrap items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-light uppercase tracking-[0.14em] ${saveStateClass(saveState)}`}>
                        <span>{saveStateLabel(saveState, !!activeAsset)}</span>
                        {lastSavedRelative && saveState === "saved" && (
                          <span className="normal-case tracking-normal opacity-70">Última edición: {lastSavedRelative}</span>
                        )}
                      </div>
                    </div>
                    <button type="button" onClick={saveActiveAsset} className="inline-flex items-center gap-2 rounded-full bg-emerald-300 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-950 hover:bg-emerald-200">
                      <Save className="h-3.5 w-3.5" /> Guardar en Generated Media
                    </button>
                  </div>
                  <textarea
                    value={current.markdown}
                    onChange={(event) => updateActiveMarkdown(event.target.value)}
                    className="mt-5 min-h-[54vh] w-full resize-y rounded-[26px] border border-white/10 bg-black/32 px-5 py-4 font-mono text-[14px] leading-relaxed text-white/86 outline-none focus:border-amber-200/35"
                  />
                </div>
                <aside className="space-y-4">
                  <div className="rounded-3xl border border-white/10 bg-white/[0.045] p-3">
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/42">Acciones rápidas</p>
                    <div className="flex flex-wrap gap-2">
                      {QUICK_ACTIONS.map((action) => (
                        <button key={action} type="button" onClick={() => applyQuickAction(action)} disabled={loadingAction === `quick:${action}`} className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-2 text-[10px] font-light text-white/70 hover:bg-white/12 hover:text-white disabled:cursor-wait disabled:opacity-45">
                          {action}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-3xl border border-white/10 bg-white/[0.045] p-3">
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/42">Versiones</p>
                    <div className="flex flex-col gap-2">
                      {versions.map((version, index) => (
                        <button
                          key={version.id}
                          type="button"
                          onClick={() => onChange(mergeVersionIntoData(normalized, version, versions))}
                          className={`rounded-2xl px-3 py-2 text-left text-[11px] ${version.id === current.id ? "bg-white text-black" : "bg-white/[0.06] text-white/65 hover:bg-white/10"}`}
                        >
                          {versionLabel(index, version)}
                        </button>
                      ))}
                    </div>
                    <button type="button" onClick={() => onChange(mergeVersionIntoData(normalized, current, versions))} className="mt-3 w-full rounded-2xl border border-white/10 px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-white/55 hover:bg-white/10 hover:text-white">
                      Restaurar esta versión
                    </button>
                  </div>
                </aside>
              </div>
            )}

            {stage === "social" && (
              <div>
                <button type="button" onClick={() => setStage("editor")} className="text-[11px] font-light uppercase tracking-[0.18em] text-white/45 hover:text-white">
                  Volver al texto
                </button>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-light uppercase tracking-[0.22em] text-white/40">Adaptar a redes</p>
                    <h2 className="mt-1 text-3xl font-light">Pack social editable</h2>
                  </div>
                  <button type="button" onClick={saveSocialPack} className="rounded-full bg-white px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-black hover:bg-amber-100">
                    Guardar adaptaciones
                  </button>
                </div>
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  {socialPack.map((social, index) => (
                    <article key={social.id} className="rounded-[26px] border border-white/10 bg-black/24 p-4">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-100/75">{social.platform}</p>
                      <input
                        value={social.title}
                        onChange={(event) => setSocialPack((pack) => pack.map((item, i) => (i === index ? { ...item, title: event.target.value, updatedAt: new Date().toISOString() } : item)))}
                        className="mt-2 w-full bg-transparent text-lg font-light text-white outline-none"
                      />
                      <textarea
                        value={social.text}
                        onChange={(event) => setSocialPack((pack) => pack.map((item, i) => (i === index ? { ...item, text: event.target.value, updatedAt: new Date().toISOString() } : item)))}
                        className="mt-3 min-h-44 w-full resize-y rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3 text-sm font-light leading-relaxed text-white/82 outline-none focus:border-amber-200/35"
                      />
                      <input
                        value={(social.hashtags ?? []).join(" ")}
                        onChange={(event) => setSocialPack((pack) => pack.map((item, i) => (i === index ? { ...item, hashtags: event.target.value.split(/\s+/).filter(Boolean).slice(0, 5), updatedAt: new Date().toISOString() } : item)))}
                        placeholder="#hashtags"
                        className="mt-3 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] text-white/70 outline-none placeholder:text-white/25"
                      />
                    </article>
                  ))}
                </div>
              </div>
            )}
          </section>

          <aside className="space-y-4">
            <section className="rounded-[28px] border border-white/10 bg-white/[0.045] p-4 backdrop-blur-xl">
              <button type="button" onClick={() => setSettingsOpen((value) => !value)} className="flex w-full items-center justify-between text-left">
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">Ajustes</span>
                <ChevronDown className={`h-4 w-4 transition ${settingsOpen ? "rotate-180" : ""}`} />
              </button>
              {settingsOpen && (
                <div className="mt-4 space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <FieldLabel>Idioma</FieldLabel>
                      <select value={normalized.settings?.language ?? "es"} onChange={(event) => updateSettings({ language: event.target.value as GuionistaSettings["language"] })} className="mt-1 w-full rounded-xl bg-black/35 px-2 py-2 text-xs">
                        <option value="auto">Automático</option>
                        <option value="es">Español</option>
                        <option value="en">Inglés</option>
                        <option value="ca">Catalán</option>
                      </select>
                    </div>
                    <div>
                      <FieldLabel>Longitud</FieldLabel>
                      <select value={normalized.settings?.length ?? "medium"} onChange={(event) => updateSettings({ length: event.target.value as GuionistaSettings["length"] })} className="mt-1 w-full rounded-xl bg-black/35 px-2 py-2 text-xs">
                        <option value="short">Corto</option>
                        <option value="medium">Medio</option>
                        <option value="long">Largo</option>
                      </select>
                    </div>
                    <div>
                      <FieldLabel>Tono</FieldLabel>
                      <select value={normalized.settings?.tone ?? "natural"} onChange={(event) => updateSettings({ tone: event.target.value as GuionistaSettings["tone"] })} className="mt-1 w-full rounded-xl bg-black/35 px-2 py-2 text-xs">
                        <option value="natural">Natural</option>
                        <option value="professional">Profesional</option>
                        <option value="premium">Premium</option>
                        <option value="institutional">Institucional</option>
                        <option value="ironic">Irónico</option>
                        <option value="emotional">Emocional</option>
                      </select>
                    </div>
                    <div>
                      <FieldLabel>Objetivo</FieldLabel>
                      <select value={normalized.settings?.goal ?? "explain"} onChange={(event) => updateSettings({ goal: event.target.value as GuionistaSettings["goal"] })} className="mt-1 w-full rounded-xl bg-black/35 px-2 py-2 text-xs">
                        <option value="explain">Explicar</option>
                        <option value="convince">Convencer</option>
                        <option value="sell">Vender</option>
                        <option value="present">Presentar</option>
                        <option value="inspire">Inspirar</option>
                        <option value="conversation">Abrir conversación</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <FieldLabel>Audiencia</FieldLabel>
                    <input value={normalized.settings?.audience ?? ""} onChange={(event) => updateSettings({ audience: event.target.value })} className="mt-1 w-full rounded-xl bg-black/35 px-3 py-2 text-xs outline-none" />
                  </div>
                  <div>
                    <FieldLabel>Instrucciones extra</FieldLabel>
                    <textarea value={normalized.settings?.extraInstructions ?? ""} onChange={(event) => updateSettings({ extraInstructions: event.target.value })} className="mt-1 min-h-20 w-full rounded-xl bg-black/35 px-3 py-2 text-xs outline-none" />
                  </div>
                </div>
              )}
            </section>

            <section className="rounded-[28px] border border-white/10 bg-white/[0.045] p-4 backdrop-blur-xl">
              <button type="button" onClick={() => setBrainOpen((value) => !value)} className="flex w-full items-center justify-between text-left">
                <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">
                  <Brain className="h-4 w-4" /> Brain
                </span>
                {brainConnected ? <Check className="h-4 w-4 text-emerald-300" /> : <X className="h-4 w-4 text-white/35" />}
              </button>
              {brainOpen && (
                <div className="mt-4 space-y-2 text-[12px] font-light leading-relaxed text-white/58">
                  {brainConnected ? (
                    <>
                      <p>Brain está usando:</p>
                      {(brainHints.length ? brainHints : ["Tono del proyecto", "Contexto del proyecto", "Notas relevantes"]).slice(0, 6).map((hint) => (
                        <p key={hint} className="flex items-center gap-2"><Check className="h-3 w-3 text-emerald-300" /> {hint}</p>
                      ))}
                    </>
                  ) : (
                    <p>Usará solo tu briefing. Puedes conectar Brain si quieres ADN/contexto del proyecto.</p>
                  )}
                </div>
              )}
            </section>

            <section className="rounded-[28px] border border-white/10 bg-white/[0.045] p-4 text-[12px] font-light leading-relaxed text-white/54 backdrop-blur-xl">
              <div className="mb-2 flex items-center gap-2 text-white/75">
                <BookOpen className="h-4 w-4" /> Generated Media
              </div>
              <p>Los textos finales se guardan en Foldder / Generated Media / Texts / Guionista.</p>
              {savedMessage && <p className="mt-3 rounded-2xl bg-emerald-300/12 px-3 py-2 text-emerald-100">{savedMessage}</p>}
            </section>

            <section className="rounded-[28px] border border-white/10 bg-white/[0.035] p-4 text-[11px] font-light leading-relaxed text-white/42">
              <div className="mb-2 flex items-center gap-2 text-white/55">
                <FileText className="h-4 w-4" /> Salidas
              </div>
              <p>Text out y Prompt out usan la versión activa. No se guarda nada como ADN de Brain automáticamente.</p>
            </section>
          </aside>
        </div>
      </main>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(shell, document.body);
}
