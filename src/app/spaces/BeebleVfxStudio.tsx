"use client";

import React, { useCallback, useEffect, useMemo, useState, memo } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Sparkles,
  RefreshCw,
  Loader2,
  AlertCircle,
  Clock,
  ChevronDown,
  Film,
  ImageIcon,
  Layers,
  Zap,
  Wand2,
  Clapperboard,
} from "lucide-react";
import type { BeebleJob } from "@/lib/beeble-api";
import { BeebleClient, estimateBeebleCredits, type BeebleAccountInfo } from "@/lib/beeble-api";

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
  /** Texto guardado en el nodo (editable). */
  prompt: string;
  /** Valor resuelto desde el cable `prompt`, si existe. */
  promptFromGraph: string;
  promptConnected: boolean;
  activeJobId?: string;
  activeJobStatus?: BeebleJob["status"];
  activeJobProgress?: number;
  outputRenderUrl?: string;
  outputSourceUrl?: string;
  outputAlphaUrl?: string;
  onLaunch: () => void | Promise<void>;
  isLaunching: boolean;
  onRefreshJob?: (jobId: string) => void;
  historyJobs?: BeebleJob[];
  onLoadHistory?: () => void;
};

function truncateUrl(s: string, max = 48) {
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
    prompt,
    promptFromGraph,
    promptConnected,
    activeJobId,
    activeJobStatus,
    activeJobProgress,
    outputRenderUrl,
    outputSourceUrl,
    outputAlphaUrl,
    onLaunch,
    isLaunching,
    onRefreshJob,
    historyJobs,
    onLoadHistory,
  } = props;

  const [labelDraft, setLabelDraft] = useState(nodeLabel);
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

  const client = useMemo(() => new BeebleClient(""), []);

  const refreshAccount = useCallback(async () => {
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
    if (onLoadHistory) onLoadHistory();
  }, [onLoadHistory]);

  const cost = estimateBeebleCredits(maxResolution, null);

  const showAlphaPanel = alphaMode === "select" || alphaMode === "custom";

  const jobBadge = useMemo(() => {
    const st = activeJobStatus;
    if (!st) return { text: "Listo", className: "bg-zinc-700/50 text-zinc-200 ring-1 ring-white/10" };
    if (st === "in_queue") return { text: "En cola", className: "bg-amber-500/20 text-amber-100 ring-1 ring-amber-500/30" };
    if (st === "processing") return { text: "Procesando", className: "bg-sky-500/20 text-sky-100 ring-1 ring-sky-500/35" };
    if (st === "completed") return { text: "Completado", className: "bg-emerald-500/15 text-emerald-100 ring-1 ring-emerald-500/25" };
    return { text: "Error", className: "bg-rose-500/20 text-rose-100 ring-1 ring-rose-500/30" };
  }, [activeJobStatus]);

  const upstreamOverrides =
    promptConnected && promptFromGraph.trim().length > 0 && promptFromGraph.trim() !== prompt.trim();

  const effectivePromptLine = promptFromGraph.trim() || prompt.trim();
  const hasRefOrPrompt = !!referenceImageUri?.trim() || effectivePromptLine.length > 0;
  const canLaunch =
    !!sourceVideoUri?.trim() &&
    hasRefOrPrompt &&
    !["in_queue", "processing"].includes(activeJobStatus ?? "");

  const onDropUpload = async (target: "video" | "reference" | "alpha", file: File) => {
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
      className="nb-studio-root fixed inset-0 z-[10050] flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden overscroll-none bg-[#030308] text-zinc-100"
      data-foldder-studio-canvas=""
      data-beeble-vfx-studio=""
    >
      {/* Fondo sutil */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.45]"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(124,58,237,0.35), transparent), radial-gradient(ellipse 60% 40% at 100% 50%, rgba(236,72,153,0.12), transparent)",
        }}
      />

      <header className="relative z-10 flex shrink-0 items-center gap-3 border-b border-white/[0.07] bg-[#07070d]/90 px-4 py-3 backdrop-blur-md">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600/40 to-fuchsia-600/30 ring-1 ring-white/15 shadow-lg shadow-violet-950/40">
          <Clapperboard className="h-5 w-5 text-violet-100" strokeWidth={1.5} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <input
            value={labelDraft}
            onChange={(e) => {
              setLabelDraft(e.target.value);
              updatePatch({ label: e.target.value });
            }}
            className="min-w-0 max-w-[min(100%,20rem)] rounded-lg border border-white/10 bg-black/35 px-3 py-1.5 text-sm font-semibold text-zinc-50 outline-none placeholder:text-zinc-600 focus:border-violet-500/40 focus:ring-2 focus:ring-violet-500/20"
            placeholder="Nombre del nodo"
          />
          <p className="text-[10px] text-zinc-500">Beeble SwitchX · VFX sobre vídeo</p>
        </div>
        <span
          className={`hidden shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide sm:inline-flex ${jobBadge.className}`}
        >
          {jobBadge.text}
        </span>
        <div className="hidden max-w-[12rem] flex-col items-end gap-0.5 text-right text-[9px] leading-tight text-zinc-500 md:flex">
          {accountInfo?.spending_used != null && accountInfo?.spending_limit != null ? (
            <span className="font-mono text-zinc-400">
              ${Number(accountInfo.spending_used).toFixed(2)} / ${Number(accountInfo.spending_limit).toFixed(0)}
            </span>
          ) : (
            <span>Cuenta —</span>
          )}
          {accountInfo?.rate_limits?.rpm && (
            <span>
              RPM {accountInfo.rate_limits.rpm.usage}/{accountInfo.rate_limits.rpm.limit}
            </span>
          )}
          {accountErr && <span className="text-rose-400">{accountErr}</span>}
        </div>
        <button
          type="button"
          onClick={() => void refreshAccount()}
          className="rounded-xl border border-white/10 bg-white/[0.04] p-2 text-zinc-400 transition hover:bg-white/[0.08] hover:text-zinc-200"
          title="Actualizar cuenta"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl border border-white/10 bg-white/[0.04] p-2 text-zinc-400 transition hover:bg-rose-500/15 hover:text-rose-200"
          title="Cerrar"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
        {/* Columna izquierda: medios y técnica */}
        <aside className="flex w-full shrink-0 flex-col gap-4 overflow-y-auto border-b border-white/[0.06] bg-black/20 p-4 lg:max-w-[380px] lg:border-b-0 lg:border-r">
          <div>
            <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Entradas</h2>
            <p className="mt-1 text-[11px] text-zinc-600">Vídeo, referencia y máscara según el modo alpha.</p>
          </div>

          <AssetBlock
            title="Vídeo fuente"
            subtitle="Requerido"
            icon={<Film className="h-4 w-4 text-cyan-300" />}
            url={sourceVideoUri}
            connected={sourceVideoConnected}
            video
            accent="cyan"
            onFile={(f) => void onDropUpload("video", f)}
          />

          <AssetBlock
            title="Imagen de referencia"
            subtitle="Opcional · estilo o sujeto"
            icon={<ImageIcon className="h-4 w-4 text-fuchsia-300" />}
            url={referenceImageUri}
            connected={referenceConnected}
            accent="fuchsia"
            onFile={(f) => void onDropUpload("reference", f)}
          />

          {showAlphaPanel && (
            <AssetBlock
              title="Máscara alpha"
              subtitle="Según modo select/custom"
              icon={<Layers className="h-4 w-4 text-emerald-300" />}
              url={alphaUri}
              connected={alphaConnected}
              accent="emerald"
              onFile={(f) => void onDropUpload("alpha", f)}
            />
          )}

          <div className="rounded-2xl border border-white/[0.08] bg-zinc-950/50 p-3 ring-1 ring-white/[0.04]">
            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Modo alpha</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(["auto", "fill", "select", "custom"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => updatePatch({ alphaMode: m })}
                  className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold capitalize transition ${
                    alphaMode === m
                      ? "bg-violet-600 text-white shadow-md shadow-violet-900/40"
                      : "border border-white/10 bg-black/30 text-zinc-400 hover:border-white/20 hover:text-zinc-200"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-zinc-950/50 p-3 ring-1 ring-white/[0.04]">
            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Resolución máxima</p>
            <div className="mt-2 flex gap-2">
              {([720, 1080] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => updatePatch({ maxResolution: r })}
                  className={`flex-1 rounded-xl py-2 text-xs font-bold transition ${
                    maxResolution === r
                      ? "bg-sky-600 text-white shadow-md shadow-sky-900/30"
                      : "border border-white/10 bg-black/40 text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  {r}p
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* Columna principal: prompt + salida */}
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 overflow-y-auto p-4 lg:p-6">
            <section className="mx-auto max-w-3xl">
              <div className="mb-3 flex items-end justify-between gap-3">
                <div>
                  <h2 className="flex items-center gap-2 text-sm font-bold text-zinc-100">
                    <Wand2 className="h-4 w-4 text-violet-400" />
                    Instrucción VFX
                  </h2>
                  <p className="mt-0.5 text-[11px] text-zinc-500">
                    Un solo prompt. Conecta un nodo al handle <span className="font-mono text-violet-400/90">Prompt</span>{" "}
                    o escribe aquí; si hay cable con texto, ese texto tiene prioridad.
                  </p>
                </div>
                {promptConnected && (
                  <span className="shrink-0 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-300 ring-1 ring-emerald-500/25">
                    Cable conectado
                  </span>
                )}
              </div>

              {upstreamOverrides && (
                <div className="mb-3 rounded-xl border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-100/95">
                  El texto del grafo sustituye al borrador del nodo para esta generación.
                </div>
              )}

              <div className="overflow-hidden rounded-2xl border border-white/[0.1] bg-[#0a0a12]/90 shadow-inner shadow-black/40 ring-1 ring-violet-500/10">
                <textarea
                  value={prompt}
                  onChange={(e) => updatePatch({ prompt: e.target.value })}
                  rows={8}
                  spellCheck={false}
                  className="min-h-[180px] w-full resize-y bg-transparent px-4 py-3 text-[13px] leading-relaxed text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
                  placeholder="Describe el efecto: iluminación, estilo, qué debe ocurrir en la escena…"
                />
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] bg-black/25 px-3 py-2 text-[10px] text-zinc-500">
                  <span>
                    {effectivePromptLine.length} caracteres · ~{cost.estimated} créd. / 30f ({maxResolution}p)
                    {cost.isApprox ? " (aprox.)" : ""}
                  </span>
                  {promptFromGraph.trim() ? (
                    <span className="max-w-[70%] truncate font-mono text-[9px] text-zinc-600" title={promptFromGraph}>
                      Upstream: {truncateUrl(promptFromGraph, 56)}
                    </span>
                  ) : null}
                </div>
              </div>

              <button
                type="button"
                disabled={!canLaunch || isLaunching}
                onClick={() => void onLaunch()}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 via-fuchsia-600 to-pink-600 py-3.5 text-sm font-bold uppercase tracking-wide text-white shadow-lg shadow-fuchsia-950/40 transition enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isLaunching ? <Loader2 className="h-5 w-5 animate-spin" /> : <Zap className="h-5 w-5" />}
                Lanzar generación
              </button>
            </section>

            <section className="mx-auto mt-8 max-w-3xl border-t border-white/[0.06] pt-8">
              <h2 className="mb-4 flex items-center gap-2 text-sm font-bold text-zinc-200">
                <Sparkles className="h-4 w-4 text-cyan-400" />
                Resultado y job
              </h2>

              {!activeJobId && (
                <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/[0.1] bg-zinc-950/40 py-14 text-center">
                  <div className="rounded-full bg-zinc-900 p-4 ring-1 ring-white/10">
                    <Sparkles className="h-8 w-8 text-zinc-600" />
                  </div>
                  <p className="text-sm text-zinc-500">Aún no hay un job activo</p>
                  <p className="max-w-sm text-xs text-zinc-600">Configura vídeo + prompt o referencia y lanza arriba.</p>
                </div>
              )}

              {activeJobId && (activeJobStatus === "in_queue" || activeJobStatus === "processing") && (
                <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-zinc-900/80 to-black/60 p-4 ring-1 ring-white/[0.06]">
                  <div className="flex items-center gap-3 text-sm">
                    {activeJobStatus === "in_queue" ? (
                      <Clock className="h-5 w-5 shrink-0 text-amber-400" />
                    ) : (
                      <Loader2 className="h-5 w-5 shrink-0 animate-spin text-sky-400" />
                    )}
                    <span className="font-medium text-zinc-200">
                      {activeJobStatus === "in_queue" ? "En cola de procesamiento" : "Renderizando…"}
                    </span>
                    <span className="ml-auto font-mono text-sm text-zinc-400">{activeJobProgress ?? 0}%</span>
                  </div>
                  <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-violet-500 via-fuchsia-500 to-cyan-400 transition-all duration-500"
                      style={{ width: `${Math.min(100, activeJobProgress ?? 0)}%` }}
                    />
                  </div>
                </div>
              )}

              {activeJobStatus === "failed" && (
                <div className="flex items-start gap-3 rounded-2xl border border-rose-500/30 bg-rose-950/25 p-4 text-sm text-rose-100">
                  <AlertCircle className="h-5 w-5 shrink-0 text-rose-400" />
                  <span>La generación falló. Revisa la consola o reintenta.</span>
                </div>
              )}

              {activeJobStatus === "completed" && outputRenderUrl && (
                <div className="space-y-4">
                  <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/50 ring-1 ring-white/[0.06]">
                    <video src={outputRenderUrl} className="w-full" controls playsInline />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {outputRenderUrl && (
                      <a
                        href={outputRenderUrl}
                        download
                        className="rounded-xl bg-white/10 px-3 py-2 text-xs font-medium text-zinc-200 hover:bg-white/15"
                      >
                        Descargar render
                      </a>
                    )}
                    {outputSourceUrl && (
                      <a
                        href={outputSourceUrl}
                        download
                        className="rounded-xl bg-white/5 px-3 py-2 text-xs text-zinc-400 hover:bg-white/10"
                      >
                        Source
                      </a>
                    )}
                    {outputAlphaUrl && (
                      <a
                        href={outputAlphaUrl}
                        download
                        className="rounded-xl bg-white/5 px-3 py-2 text-xs text-zinc-400 hover:bg-white/10"
                      >
                        Alpha
                      </a>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => updatePatch({ value: outputRenderUrl, type: "video" })}
                    className="w-full rounded-xl bg-emerald-600/30 py-3 text-sm font-semibold text-emerald-100 ring-1 ring-emerald-500/30 transition hover:bg-emerald-600/40"
                  >
                    Usar este vídeo en el canvas
                  </button>
                </div>
              )}

              <details
                open={historyOpen}
                onToggle={(e) => setHistoryOpen((e.target as HTMLDetailsElement).open)}
                className="mt-6 rounded-xl border border-white/[0.06] bg-zinc-950/40"
              >
                <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-xs font-semibold text-zinc-400 marker:content-none [&::-webkit-details-marker]:hidden hover:text-zinc-300">
                  <ChevronDown className="h-3.5 w-3.5" />
                  Historial reciente
                </summary>
                <ul className="space-y-1 border-t border-white/[0.05] px-2 py-2 text-[11px] text-zinc-500">
                  {(historyJobs ?? []).slice(0, 10).map((j) => (
                    <li
                      key={j.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-white/[0.04]"
                    >
                      <span className="font-mono text-zinc-400">{j.id.slice(0, 10)}…</span>
                      <span className="text-zinc-600">{j.status}</span>
                      <button
                        type="button"
                        className="text-xs font-medium text-violet-400 hover:underline"
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
                        Restaurar
                      </button>
                    </li>
                  ))}
                  {(!historyJobs || historyJobs.length === 0) && (
                    <li className="px-2 py-2 text-zinc-600">Sin jobs recientes.</li>
                  )}
                </ul>
              </details>
            </section>
          </div>
        </main>
      </div>
    </div>,
    document.body,
  );
});

BeebleVfxStudio.displayName = "BeebleVfxStudio";

function AssetBlock({
  title,
  subtitle,
  icon,
  url,
  connected,
  video,
  onFile,
  accent,
}: {
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  url: string;
  connected: boolean;
  video?: boolean;
  onFile: (f: File) => void;
  accent: "cyan" | "fuchsia" | "emerald";
}) {
  const [playing, setPlaying] = useState(false);
  const ring =
    accent === "cyan"
      ? "ring-cyan-500/20"
      : accent === "fuchsia"
        ? "ring-fuchsia-500/20"
        : "ring-emerald-500/20";

  return (
    <div className={`rounded-2xl border border-white/[0.08] bg-zinc-950/60 p-3 ring-1 ${ring}`}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/[0.06]">{icon}</div>
          <div>
            <p className="text-[12px] font-semibold text-zinc-200">{title}</p>
            {subtitle && <p className="text-[10px] text-zinc-600">{subtitle}</p>}
          </div>
        </div>
        {connected && (
          <span className="shrink-0 rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-emerald-300">
            Grafo
          </span>
        )}
      </div>
      {url ? (
        <div className="relative overflow-hidden rounded-xl border border-white/10 bg-black/50">
          {video ? (
            <video
              src={url}
              className="max-h-36 w-full object-contain"
              muted
              playsInline
              loop={playing}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
            />
          ) : (
            <img src={url} alt="" className="max-h-36 w-full object-contain" />
          )}
          {video && (
            <button
              type="button"
              className="absolute bottom-2 left-2 rounded-lg bg-black/75 px-2 py-1 text-[10px] font-medium text-zinc-200"
              onClick={() => setPlaying((p) => !p)}
            >
              {playing ? "Pausa" : "Play"}
            </button>
          )}
          <p className="truncate px-2 py-1.5 font-mono text-[9px] text-zinc-600" title={url}>
            {truncateUrl(url)}
          </p>
        </div>
      ) : (
        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 bg-black/30 py-8 transition hover:border-violet-500/30 hover:bg-violet-500/[0.03]">
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
          <span className="text-xs font-medium text-zinc-500">Soltar o elegir archivo</span>
        </label>
      )}
    </div>
  );
}
