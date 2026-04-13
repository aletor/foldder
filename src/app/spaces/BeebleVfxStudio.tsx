"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState, memo } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Sparkles,
  Settings2,
  RefreshCw,
  Loader2,
  AlertCircle,
  Clock,
  ChevronDown,
  Film,
  ImageIcon,
  Layers,
  Zap,
} from "lucide-react";
import type { BeebleJob } from "@/lib/beeble-api";
import {
  BeebleClient,
  estimateBeebleCredits,
  readStoredBeebleApiKey,
  writeStoredBeebleApiKey,
  type BeebleAccountInfo,
} from "@/lib/beeble-api";

export type BeebleAlphaMode = "auto" | "fill" | "select" | "custom";

export type BeebleVfxStudioProps = {
  onClose: () => void;
  updatePatch: (patch: Record<string, unknown>) => void;
  nodeLabel: string;
  sourceVideoUri: string;
  sourceVideoConnected: boolean;
  referenceImageUri: string;
  referenceConnected: boolean;
  alphaUri: string;
  alphaConnected: boolean;
  alphaMode: BeebleAlphaMode;
  maxResolution: 720 | 1080;
  prompts: string[];
  promptConnected: boolean[];
  activePromptIndex: number;
  activeJobId?: string;
  activeJobStatus?: BeebleJob["status"];
  activeJobProgress?: number;
  outputRenderUrl?: string;
  outputSourceUrl?: string;
  outputAlphaUrl?: string;
  onLaunch: () => void | Promise<void>;
  isLaunching: boolean;
  apiKey: string | null;
  onApiKeyChange: (key: string | null) => void;
  onRefreshJob?: (jobId: string) => void;
  historyJobs?: BeebleJob[];
  onLoadHistory?: () => void;
};

function truncateUrl(s: string, max = 42) {
  if (!s) return "—";
  if (s.length <= max) return s;
  return `${s.slice(0, max - 2)}…`;
}

export const BeebleVfxStudio = memo(function BeebleVfxStudio(props: BeebleVfxStudioProps) {
  const {
    onClose,
    updatePatch,
    nodeLabel,
    sourceVideoUri,
    sourceVideoConnected,
    referenceImageUri,
    referenceConnected,
    alphaUri,
    alphaConnected,
    alphaMode,
    maxResolution,
    prompts,
    promptConnected,
    activePromptIndex,
    activeJobId,
    activeJobStatus,
    activeJobProgress,
    outputRenderUrl,
    outputSourceUrl,
    outputAlphaUrl,
    onLaunch,
    isLaunching,
    apiKey,
    onApiKeyChange,
    onRefreshJob,
    historyJobs,
    onLoadHistory,
  } = props;

  const [labelDraft, setLabelDraft] = useState(nodeLabel);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [keyDraft, setKeyDraft] = useState(() => readStoredBeebleApiKey() ?? "");
  const [accountInfo, setAccountInfo] = useState<BeebleAccountInfo | null>(null);
  const [accountErr, setAccountErr] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    document.body.classList.add("nb-studio-open");
    return () => document.body.classList.remove("nb-studio-open");
  }, []);

  useEffect(() => {
    setLabelDraft(nodeLabel);
  }, [nodeLabel]);

  const client = useMemo(() => (apiKey ? new BeebleClient(apiKey) : null), [apiKey]);

  const refreshAccount = useCallback(async () => {
    if (!client) {
      setAccountErr("Sin API key");
      return;
    }
    setAccountErr(null);
    try {
      const info = await client.getAccountInfo();
      setAccountInfo(info);
    } catch (e) {
      setAccountErr(e instanceof Error ? e.message : "Error cuenta");
    }
  }, [client]);

  useEffect(() => {
    void refreshAccount();
  }, [refreshAccount]);

  useEffect(() => {
    if (onLoadHistory && apiKey) onLoadHistory();
  }, [apiKey, onLoadHistory]);

  const cost = estimateBeebleCredits(maxResolution, null);

  const showAlphaPanel = alphaMode === "select" || alphaMode === "custom";

  const jobBadge = useMemo(() => {
    const st = activeJobStatus;
    if (!st) return { text: "Idle", className: "bg-zinc-600/40 text-zinc-200" };
    if (st === "in_queue") return { text: "En cola", className: "bg-amber-500/25 text-amber-100" };
    if (st === "processing") return { text: "Procesando", className: "bg-sky-500/25 text-sky-100" };
    if (st === "completed") return { text: "Listo", className: "bg-emerald-500/25 text-emerald-100" };
    return { text: "Error", className: "bg-rose-500/25 text-rose-100" };
  }, [activeJobStatus]);

  const activePromptText = (prompts[activePromptIndex] ?? "").trim();
  const hasRefOrPrompt =
    !!referenceImageUri?.trim() || activePromptText.length > 0;
  const canLaunch =
    !!sourceVideoUri?.trim() &&
    hasRefOrPrompt &&
    !["in_queue", "processing"].includes(activeJobStatus ?? "") &&
    !!apiKey;

  const onDropUpload = async (target: "video" | "reference" | "alpha", file: File) => {
    if (!client) {
      alert("Configura la API key en ajustes.");
      return;
    }
    try {
      const uri = await client.uploadAndGetUri(file);
      if (target === "video") updatePatch({ sourceVideoUri: uri });
      else if (target === "alpha") updatePatch({ alphaUri: uri });
      else updatePatch({ referenceImageUri: uri });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Error al subir");
    }
  };

  return createPortal(
    <div
      className="nb-studio-root fixed inset-0 z-[10050] flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden overscroll-none bg-[#06060a] text-zinc-100"
      data-foldder-studio-canvas=""
      data-beeble-vfx-studio=""
    >
      <header className="flex shrink-0 items-center gap-3 border-b border-white/[0.08] bg-[#07070c] px-3 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600/35 to-fuchsia-600/25 ring-1 ring-white/10">
            <Sparkles className="h-4 w-4 text-violet-200" strokeWidth={1.75} />
          </div>
          <input
            value={labelDraft}
            onChange={(e) => {
              setLabelDraft(e.target.value);
              updatePatch({ label: e.target.value });
            }}
            className="min-w-0 max-w-[14rem] rounded-md border border-white/10 bg-black/30 px-2 py-1 text-[11px] font-bold text-zinc-100 outline-none focus:border-violet-500/45"
            placeholder="Nombre del nodo"
          />
          <span
            className={`rounded-md px-2 py-0.5 text-[9px] font-black uppercase tracking-wide ${jobBadge.className}`}
          >
            {jobBadge.text}
          </span>
        </div>
        <div className="hidden max-w-[14rem] flex-col items-end text-right text-[8px] text-zinc-500 sm:flex">
          {accountInfo?.spending_used != null && accountInfo?.spending_limit != null ? (
            <span>
              ${Number(accountInfo.spending_used).toFixed(2)} / ${Number(accountInfo.spending_limit).toFixed(0)}
            </span>
          ) : (
            <span>Spending: —</span>
          )}
          {accountInfo?.rate_limits?.rpm && (
            <span>
              RPM {accountInfo.rate_limits.rpm.usage}/{accountInfo.rate_limits.rpm.limit} · Conc.{" "}
              {accountInfo.rate_limits.concurrency?.usage ?? "—"}/
              {accountInfo.rate_limits.concurrency?.limit ?? "—"}
            </span>
          )}
          {accountErr && <span className="text-rose-400">{accountErr}</span>}
        </div>
        <button
          type="button"
          onClick={() => void refreshAccount()}
          className="rounded-lg border border-white/10 p-1.5 text-zinc-400 hover:bg-white/[0.06]"
          title="Actualizar cuenta"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="rounded-lg border border-white/10 p-1.5 text-zinc-400 hover:bg-white/[0.06]"
          title="API key"
        >
          <Settings2 className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-white/10 p-1.5 text-zinc-400 hover:bg-white/[0.06]"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      {settingsOpen && (
        <div className="fixed inset-0 z-[10060] flex items-center justify-center bg-black/70 p-4" role="dialog">
          <div className="w-full max-w-md rounded-xl border border-white/10 bg-[#0c0c12] p-4 shadow-2xl">
            <h3 className="text-sm font-bold text-zinc-100">API key Beeble</h3>
            <p className="mt-1 text-[10px] text-zinc-500">
              Se guarda en este navegador (localStorage). El servidor usa BEEBLE_API_KEY si no envías cabecera.
            </p>
            <input
              type="password"
              value={keyDraft}
              onChange={(e) => setKeyDraft(e.target.value)}
              className="mt-3 w-full rounded-md border border-white/10 bg-black/40 px-2 py-2 text-xs outline-none"
              placeholder="x-api-key"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-md border border-white/10 px-3 py-1.5 text-[10px] text-zinc-300"
                onClick={() => setSettingsOpen(false)}
              >
                Cerrar
              </button>
              <button
                type="button"
                className="rounded-md bg-violet-600 px-3 py-1.5 text-[10px] font-bold text-white"
                onClick={() => {
                  const k = keyDraft.trim();
                  writeStoredBeebleApiKey(k || null);
                  onApiKeyChange(k || null);
                  setSettingsOpen(false);
                }}
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 overflow-hidden lg:grid-cols-3">
        {/* Columna izquierda — inputs */}
        <section className="flex min-h-0 flex-col gap-2 overflow-y-auto border-b border-white/[0.06] p-3 lg:border-b-0 lg:border-r">
          <p className="text-[9px] font-black uppercase tracking-wider text-zinc-500">Inputs</p>

          <AssetBlock
            title="Video fuente"
            icon={<Film className="h-3.5 w-3.5 text-cyan-400" />}
            url={sourceVideoUri}
            connected={sourceVideoConnected}
            video
            onFile={(f) => void onDropUpload("video", f)}
          />

          <AssetBlock
            title="Reference image"
            icon={<ImageIcon className="h-3.5 w-3.5 text-fuchsia-400" />}
            url={referenceImageUri}
            connected={referenceConnected}
            onFile={(f) => void onDropUpload("reference", f)}
            extraHint={
              <button
                type="button"
                disabled
                className="mt-1 w-full rounded border border-dashed border-white/10 py-1 text-[8px] text-zinc-600"
              >
                Generar con IA (próximamente)
              </button>
            }
          />

          {showAlphaPanel && (
            <AssetBlock
              title="Alpha mask"
              icon={<Layers className="h-3.5 w-3.5 text-emerald-400" />}
              url={alphaUri}
              connected={alphaConnected}
              onFile={(f) => void onDropUpload("alpha", f)}
            />
          )}

          <div>
            <p className="mb-1 text-[8px] font-bold uppercase text-zinc-500">Alpha mode</p>
            <div className="flex flex-wrap gap-1">
              {(["auto", "fill", "select", "custom"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => updatePatch({ alphaMode: m })}
                  className={`rounded-md px-2 py-1 text-[9px] font-bold capitalize ${
                    alphaMode === m
                      ? "bg-violet-600/50 text-white"
                      : "border border-white/10 bg-black/30 text-zinc-400"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1 text-[8px] font-bold uppercase text-zinc-500">Resolución máx.</p>
            <div className="flex gap-1">
              {([720, 1080] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => updatePatch({ maxResolution: r })}
                  className={`rounded-md px-3 py-1 text-[9px] font-bold ${
                    maxResolution === r
                      ? "bg-sky-600/50 text-white"
                      : "border border-white/10 bg-black/30 text-zinc-400"
                  }`}
                >
                  {r}p
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Columna central — prompts */}
        <section className="flex min-h-0 flex-col gap-2 overflow-y-auto border-b border-white/[0.06] p-3 lg:border-b-0 lg:border-r">
          <p className="text-[9px] font-black uppercase tracking-wider text-zinc-500">Prompts</p>
          <div className="flex min-h-0 flex-1 flex-col gap-2">
            {prompts.map((text, i) => (
              <div
                key={i}
                className={`rounded-lg border p-2 ${
                  activePromptIndex === i ? "border-violet-500/50 bg-violet-950/20" : "border-white/[0.06] bg-black/20"
                }`}
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-[8px] font-mono font-bold text-zinc-500">#{i + 1}</span>
                  {promptConnected[i] && (
                    <span className="rounded bg-emerald-500/20 px-1 py-px text-[7px] font-bold uppercase text-emerald-300">
                      Desde nodo
                    </span>
                  )}
                  <label className="ml-auto flex cursor-pointer items-center gap-1 text-[8px] text-zinc-500">
                    <input
                      type="radio"
                      name="activePrompt"
                      checked={activePromptIndex === i}
                      onChange={() => updatePatch({ activePromptIndex: i })}
                    />
                    Activo
                  </label>
                </div>
                <textarea
                  value={text}
                  onChange={(e) => {
                    const v = e.target.value;
                    const next = [...prompts];
                    next[i] = v;
                    updatePatch({ prompts: next });
                  }}
                  rows={3}
                  className="w-full resize-y rounded-md border border-white/10 bg-black/40 px-2 py-1 text-[10px] text-zinc-100 outline-none"
                />
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              const next = [...prompts, ""];
              updatePatch({ prompts: next, activePromptIndex: next.length - 1 });
            }}
            className="rounded-md border border-dashed border-white/15 py-2 text-[9px] font-bold text-zinc-500 hover:bg-white/[0.04]"
          >
            ＋ Añadir prompt
          </button>

          <div className="mt-auto border-t border-white/[0.06] pt-3">
            <p className="text-[9px] text-zinc-500">
              Coste estimado: ~{cost.estimated} créditos / 30 frames ({maxResolution}p)
              {cost.isApprox ? " · mínimo si no se conoce duración" : ""}
            </p>
            <button
              type="button"
              disabled={!canLaunch || isLaunching}
              onClick={() => void onLaunch()}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-700 py-2.5 text-[10px] font-black uppercase tracking-wide text-white disabled:opacity-40"
            >
              {isLaunching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              Lanzar generación
            </button>
            {!apiKey && (
              <p className="mt-1 text-[8px] text-amber-400">Configura la API key en ajustes (arriba a la derecha).</p>
            )}
          </div>
        </section>

        {/* Columna derecha — job + output */}
        <section className="flex min-h-0 flex-col gap-2 overflow-y-auto p-3">
          <p className="text-[9px] font-black uppercase tracking-wider text-zinc-500">Job y salida</p>

          {!activeJobId && (
            <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-white/[0.06] bg-zinc-950/40 py-8">
              <Sparkles className="h-8 w-8 text-zinc-600" />
              <p className="text-[10px] text-zinc-500">Lista para generar</p>
            </div>
          )}

          {activeJobId && (activeJobStatus === "in_queue" || activeJobStatus === "processing") && (
            <div className="rounded-lg border border-white/10 bg-black/30 p-3">
              <div className="flex items-center gap-2 text-[10px]">
                {activeJobStatus === "in_queue" ? (
                  <Clock className="h-4 w-4 text-amber-400" />
                ) : (
                  <Loader2 className="h-4 w-4 animate-spin text-sky-400" />
                )}
                <span>{activeJobStatus === "in_queue" ? "En cola" : "Procesando"}</span>
                <span className="ml-auto font-mono text-zinc-400">{activeJobProgress ?? 0}%</span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full bg-gradient-to-r from-violet-500 to-cyan-400 transition-all"
                  style={{ width: `${Math.min(100, activeJobProgress ?? 0)}%` }}
                />
              </div>
              <button type="button" disabled className="mt-2 text-[8px] text-zinc-600">
                Cancelar (no disponible en API)
              </button>
            </div>
          )}

          {activeJobStatus === "failed" && (
            <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-950/20 p-3 text-[10px] text-rose-200">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>Error en la generación. Revisa la consola o reintenta.</span>
            </div>
          )}

          {activeJobStatus === "completed" && outputRenderUrl && (
            <div className="space-y-2">
              <video src={outputRenderUrl} className="w-full rounded-lg border border-white/10" controls playsInline />
              <div className="flex flex-wrap gap-1 text-[8px]">
                {outputRenderUrl && (
                  <a href={outputRenderUrl} download className="rounded bg-white/10 px-2 py-1 text-zinc-300">
                    Render
                  </a>
                )}
                {outputSourceUrl && (
                  <a href={outputSourceUrl} download className="rounded bg-white/10 px-2 py-1 text-zinc-300">
                    Source
                  </a>
                )}
                {outputAlphaUrl && (
                  <a href={outputAlphaUrl} download className="rounded bg-white/10 px-2 py-1 text-zinc-300">
                    Alpha
                  </a>
                )}
              </div>
              <button
                type="button"
                onClick={() => updatePatch({ value: outputRenderUrl, type: "video" })}
                className="w-full rounded-md bg-emerald-600/40 py-2 text-[9px] font-bold text-emerald-100"
              >
                Usar este output en el canvas
              </button>
            </div>
          )}

          <details open={historyOpen} onToggle={(e) => setHistoryOpen((e.target as HTMLDetailsElement).open)}>
            <summary className="flex cursor-pointer list-none items-center gap-1 text-[9px] font-bold text-zinc-500 marker:content-none [&::-webkit-details-marker]:hidden">
              <ChevronDown className="h-3 w-3" />
              Historial (últimos jobs)
            </summary>
            <ul className="mt-2 space-y-1 text-[8px] text-zinc-500">
              {(historyJobs ?? []).slice(0, 10).map((j) => (
                <li key={j.id} className="flex flex-wrap items-center justify-between gap-1 rounded border border-white/[0.04] px-2 py-1">
                  <span className="font-mono">{j.id.slice(0, 8)}…</span>
                  <span>{j.status}</span>
                  <button
                    type="button"
                    className="text-violet-400 hover:underline"
                    onClick={() => {
                      if (j.output?.render) {
                        updatePatch({
                          outputRenderUrl: j.output.render,
                          outputSourceUrl: j.output.source,
                          outputAlphaUrl: j.output.alpha,
                          value: j.output.render,
                          type: "video",
                        });
                      }
                      onRefreshJob?.(j.id);
                    }}
                  >
                    Restaurar output
                  </button>
                </li>
              ))}
              {(!historyJobs || historyJobs.length === 0) && <li className="text-zinc-600">Sin datos.</li>}
            </ul>
          </details>
        </section>
      </div>
    </div>,
    document.body,
  );
});

BeebleVfxStudio.displayName = "BeebleVfxStudio";

function AssetBlock({
  title,
  icon,
  url,
  connected,
  video,
  onFile,
  extraHint,
}: {
  title: string;
  icon: React.ReactNode;
  url: string;
  connected: boolean;
  video?: boolean;
  onFile: (f: File) => void;
  extraHint?: React.ReactNode;
}) {
  const [playing, setPlaying] = useState(false);
  return (
    <div className="rounded-lg border border-white/[0.06] bg-zinc-950/40 p-2">
      <div className="mb-1 flex items-center gap-1.5">
        {icon}
        <span className="text-[9px] font-bold uppercase tracking-wide text-zinc-400">{title}</span>
        {connected && (
          <span className="rounded bg-cyan-500/20 px-1 py-px text-[7px] font-bold uppercase text-cyan-300">
            Conectado desde nodo
          </span>
        )}
      </div>
      {url ? (
        <div className="relative overflow-hidden rounded-md border border-white/10 bg-black/40">
          {video ? (
            <video
              src={url}
              className="max-h-32 w-full object-contain"
              muted
              playsInline
              loop={playing}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
            />
          ) : (
            <img src={url} alt="" className="max-h-32 w-full object-contain" />
          )}
          {video && (
            <button
              type="button"
              className="absolute bottom-1 left-1 rounded bg-black/70 px-2 py-0.5 text-[8px]"
              onClick={() => setPlaying((p) => !p)}
            >
              {playing ? "Pause" : "Play"}
            </button>
          )}
          <p className="truncate px-1 py-1 font-mono text-[7px] text-zinc-500" title={url}>
            {truncateUrl(url)}
          </p>
        </div>
      ) : (
        <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-white/15 py-6 text-[9px] text-zinc-500 hover:bg-white/[0.03]">
          <input
            type="file"
            accept={video ? "video/*" : "image/*"}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              e.target.value = "";
            }}
          />
          Soltar o elegir archivo
        </label>
      )}
      {extraHint}
    </div>
  );
}
