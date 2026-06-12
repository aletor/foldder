"use client";

/* eslint-disable @next/next/no-img-element */

import React, { memo, useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  NodeProps,
  NodeResizer,
  Position,
  useEdges,
  useNodes,
  useReactFlow,
  useUpdateNodeInternals,
  type Node,
} from "@xyflow/react";
import {
  Compass,
  Layers3,
  Loader2,
  Maximize2,
  Palette,
  Search,
  Sparkles,
  UserRound,
  Wallpaper,
  X,
} from "lucide-react";
import { runAiJobWithNotification } from "@/lib/ai-job-notifications";
import { readJsonWithHttpError } from "@/lib/read-response-json";
import { resolvePromptValueFromEdgeSource } from "../canvas-group-logic";
import { FoldderDataHandle } from "../FoldderDataHandle";
import { NodeIcon, resolveFoldderNodeState } from "../foldder-icons";
import { FoldderNodeHeaderTitle, NodeLabel } from "../foldder-node-ui";
import {
  nodeFrameNeedsSync,
  resolveAspectLockedNodeFrame,
  resolveNodeChromeHeight,
} from "../studio-node-aspect";
import { StudioNodePortal } from "../studio-node/studio-node-architecture";

type InspirationFacet = "similar" | "textures" | "colors" | "style" | "people" | "backgrounds";
type InspirationProvider = "pexels" | "unsplash";
type InspirationStatus = "empty" | "ready" | "searching" | "results" | "selected" | "output" | "error";

type InspirationResult = {
  id: string;
  source: "Pexels" | "Unsplash";
  imageUrl: string;
  thumbUrl: string;
  title?: string;
  author?: string;
  sourceUrl?: string;
  width?: number;
  height?: number;
  color?: string;
};

type InspirationNodeData = {
  label?: string;
  facet?: InspirationFacet;
  manualPrompt?: string;
  imageIntent?: string;
  imageIntentSource?: string;
  provider?: InspirationProvider;
  results?: InspirationResult[];
  selected?: InspirationResult | null;
  value?: string;
  type?: string;
  status?: InspirationStatus;
  error?: string;
  notice?: string;
  _foldderCanvasIntro?: boolean;
};

const FACETS: Array<{ id: InspirationFacet; es: string; en: string; icon: React.ReactNode }> = [
  { id: "similar", es: "Parecidas", en: "Similar", icon: <Sparkles size={15} /> },
  { id: "textures", es: "Texturas", en: "Textures", icon: <Layers3 size={15} /> },
  { id: "colors", es: "Colores", en: "Colors", icon: <Palette size={15} /> },
  { id: "style", es: "Estilo", en: "Style", icon: <Compass size={15} /> },
  { id: "people", es: "Personas", en: "People", icon: <UserRound size={15} /> },
  { id: "backgrounds", es: "Fondos", en: "Backgrounds", icon: <Wallpaper size={15} /> },
];

const PROVIDERS: Array<{ id: InspirationProvider; label: string }> = [
  { id: "pexels", label: "Pexels" },
  { id: "unsplash", label: "Unsplash" },
];

function firstImageUrlFromNode(node: Node | undefined): string {
  const data = node?.data as Record<string, unknown> | undefined;
  const value = typeof data?.value === "string" ? data.value : "";
  if (value) return value;
  const url = typeof data?.url === "string" ? data.url : "";
  return url;
}

function compactText(value: string, max = 150): string {
  const s = value.trim().replace(/\s+/g, " ");
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function photoAspectRatio(width?: number, height?: number): number | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || !width || !height) return null;
  return Math.min(2.4, Math.max(0.56, width / height));
}

function statusMessage(status: InspirationStatus, hasInput: boolean): string {
  if (!hasInput) return "Connect a prompt or image to find visual references.";
  if (status === "searching") return "Searching visual references…";
  if (status === "error") return "Couldn’t load references. Try another search.";
  if (status === "selected") return "Selected reference ready.";
  if (status === "output") return "Output image ready.";
  if (status === "results") return "Choose one reference image.";
  return "Ready to search inspiration.";
}

function InspirationStudio({
  nodeId,
  data,
  promptInput,
  imageInput,
  onClose,
  onPatch,
}: {
  nodeId: string;
  data: InspirationNodeData;
  promptInput: string;
  imageInput: string;
  onClose: () => void;
  onPatch: (patch: Partial<InspirationNodeData>) => void;
}) {
  const facet = data.facet ?? "similar";
  const provider = data.provider ?? "pexels";
  const results = Array.isArray(data.results) ? data.results : [];
  const selected = data.selected ?? null;
  const [manualPrompt, setManualPrompt] = useState(data.manualPrompt ?? "");
  const [loading, setLoading] = useState(false);
  const imageIntentCacheRef = useRef<{ imageUrl: string; intent: string } | null>(
    data.imageIntent && data.imageIntentSource
      ? { imageUrl: data.imageIntentSource, intent: data.imageIntent }
      : null,
  );
  const imageIntentPromiseRef = useRef<{ imageUrl: string; promise: Promise<string> } | null>(null);

  const hasAnyInput = Boolean(promptInput || imageInput || manualPrompt.trim());

  const describeImageIfNeeded = useCallback(async () => {
    if (!imageInput || promptInput || manualPrompt.trim()) return data.imageIntent || "";
    if (imageIntentCacheRef.current?.imageUrl === imageInput) return imageIntentCacheRef.current.intent;
    if (data.imageIntent && data.imageIntentSource === imageInput) {
      imageIntentCacheRef.current = { imageUrl: imageInput, intent: data.imageIntent };
      return data.imageIntent;
    }
    if (imageIntentPromiseRef.current?.imageUrl === imageInput) return imageIntentPromiseRef.current.promise;

    const promise = (async () => {
    const res = await fetch("/api/spaces/describe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: imageInput,
        type: "image",
        metadata: { source: "inspiration-input" },
      }),
    });
    const json = await readJsonWithHttpError<{ description?: string; error?: string }>(res, "/api/spaces/describe");
    const description = typeof json.description === "string" ? compactText(json.description, 420) : "";
    if (!description) throw new Error(json.error || "image_description_failed");
      imageIntentCacheRef.current = { imageUrl: imageInput, intent: description };
      onPatch({ imageIntent: description, imageIntentSource: imageInput });
    return description;
    })();

    imageIntentPromiseRef.current = { imageUrl: imageInput, promise };
    try {
      return await promise;
    } finally {
      if (imageIntentPromiseRef.current?.promise === promise) imageIntentPromiseRef.current = null;
    }
  }, [data.imageIntent, data.imageIntentSource, imageInput, manualPrompt, onPatch, promptInput]);

  const runSearch = useCallback(
    async (nextFacet = facet, nextProvider = provider) => {
      if (!hasAnyInput) return;
      setLoading(true);
      onPatch({
        status: "searching",
        facet: nextFacet,
        provider: nextProvider,
        manualPrompt,
        error: undefined,
        notice: undefined,
      });
      try {
        let runError: string | null = null;
        const ok = await runAiJobWithNotification({ nodeId, label: "Inspiration" }, async () => {
          const visualIntent = await describeImageIfNeeded();
          const query = (promptInput || manualPrompt || visualIntent).trim();
          const inputKind = promptInput || manualPrompt.trim() ? "prompt" : "image";
          if (!query) throw new Error("No prompt or image intent available.");
          const res = await fetch("/api/inspiration/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              query,
              inputKind,
              facet: nextFacet,
              provider: nextProvider,
              limit: 40,
            }),
          });
          let json: { results?: InspirationResult[]; error?: string; notice?: string };
          try {
            json = await readJsonWithHttpError<{ results?: InspirationResult[]; error?: string; notice?: string }>(
              res,
              "/api/inspiration/search",
            );
          } catch (error) {
            runError = error instanceof Error ? error.message : "Couldn’t load references.";
            throw error;
          }
          const list = Array.isArray(json.results) ? json.results : [];
          onPatch({
            facet: nextFacet,
            provider: nextProvider,
            manualPrompt,
            results: list,
            selected: null,
            status: list.length > 0 ? "results" : "error",
            error: list.length > 0 ? undefined : "No references found.",
            notice: typeof json.notice === "string" && json.notice.trim() ? json.notice : undefined,
          });
        });
        if (!ok) onPatch({ status: "error", error: runError || "Search cancelled or failed." });
      } catch (error) {
        console.error("[InspirationStudio]", error);
        onPatch({
          status: "error",
        error: error instanceof Error ? error.message : "Couldn’t load references.",
        });
      } finally {
        setLoading(false);
      }
    },
    [describeImageIfNeeded, facet, hasAnyInput, manualPrompt, nodeId, onPatch, promptInput, provider],
  );

  const selectResult = useCallback(
    (result: InspirationResult) => {
      onPatch({
        value: result.imageUrl,
        type: "image",
        selected: result,
        status: "output",
        facet,
        provider,
        error: undefined,
        notice: undefined,
      });
      onClose();
    },
    [facet, onClose, onPatch, provider],
  );

  return (
    <StudioNodePortal>
      <div className="fixed inset-0 z-[100090] flex flex-col bg-[#0b0c10] text-white" data-foldder-i18n-ignore>
        <header className="flex min-h-[72px] items-center justify-between bg-[#101116]/95 px-7 py-4 backdrop-blur-xl">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-violet-500/14 text-violet-200">
              <Compass size={20} />
            </div>
            <div className="min-w-0">
              <h1 className="text-[20px] font-black tracking-tight">Inspiration</h1>
              <p className="text-[12px] text-zinc-400">Find visual references from an idea or image.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-white/[0.05] text-zinc-400 transition hover:bg-white/10 hover:text-white"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </header>

        <main className="grid min-h-0 flex-1 grid-cols-[minmax(320px,392px)_1fr] gap-0 overflow-hidden">
          <aside className="flex min-h-0 flex-col overflow-y-auto bg-[#131419] p-5">
            <section className="shrink-0 space-y-3">
              <p className="mb-3 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">Current input</p>
              {promptInput ? (
                <div className="rounded-[10px] bg-black/25 p-3 text-[13px] leading-relaxed text-zinc-200">
                  {compactText(promptInput, 320)}
                </div>
              ) : imageInput ? (
                <div className="rounded-[10px] bg-black/25 p-3">
                  <p className="text-[12px] font-semibold text-zinc-200">Connected image input</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
                    The visual intent is read once and reused for every search.
                  </p>
                </div>
              ) : (
                <textarea
                  value={manualPrompt}
                  onChange={(event) => {
                    setManualPrompt(event.target.value);
                    onPatch({ manualPrompt: event.target.value, status: event.target.value.trim() ? "ready" : "empty" });
                  }}
                  placeholder="Write an idea to explore visual references…"
                  className="min-h-[118px] w-full resize-none rounded-[10px] bg-black/25 p-3 text-[13px] leading-relaxed text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:bg-black/35"
                />
              )}
            </section>

            <button
              type="button"
              onClick={() => void runSearch()}
              disabled={loading || !hasAnyInput}
              className="mt-5 flex w-full shrink-0 items-center justify-center gap-2 rounded-[10px] bg-violet-500 px-5 py-4 text-[12px] font-black uppercase tracking-[0.18em] text-white shadow-[0_16px_36px_rgba(124,58,237,0.28)] transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400 disabled:shadow-none"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
              Search {PROVIDERS.find((item) => item.id === provider)?.label ?? "Inspiration"}
            </button>

            <section className="mt-5 shrink-0 pb-5">
              <p className="mb-3 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">Explore</p>
              <div className="grid grid-cols-2 gap-2">
                {FACETS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => void runSearch(item.id)}
                    disabled={loading || !hasAnyInput}
                    className={`flex items-center gap-2 rounded-[10px] px-3 py-3 text-left text-[12px] font-bold transition ${
                      facet === item.id
                        ? "bg-violet-400/18 text-violet-100"
                        : "bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08]"
                    } disabled:cursor-not-allowed disabled:opacity-40`}
                  >
                    <span className="text-violet-200">{item.icon}</span>
                    {item.en}
                  </button>
                ))}
              </div>
            </section>
          </aside>

          <section className="min-h-0 overflow-y-auto bg-[#0b0c10] p-6">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-4">
              <div className="inline-flex rounded-[12px] border border-white/[0.08] bg-white/[0.04] p-1">
                {PROVIDERS.map((item) => {
                  const active = provider === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        if (item.id === provider) return;
                        if (hasAnyInput) {
                          void runSearch(facet, item.id);
                        } else {
                          onPatch({ provider: item.id });
                        }
                      }}
                      disabled={loading}
                      className={`rounded-[9px] px-4 py-2 text-[11px] font-black uppercase tracking-[0.14em] transition ${
                        active
                          ? "bg-white text-zinc-950 shadow-sm"
                          : "text-zinc-400 hover:bg-white/[0.06] hover:text-white"
                      } disabled:pointer-events-none disabled:opacity-50`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] font-semibold text-zinc-500">
                {results.length > 0
                  ? `${results.length} referencias en ${PROVIDERS.find((item) => item.id === provider)?.label ?? "este proveedor"}`
                  : "Busca una vez y cambia de proveedor con las pestañas."}
              </p>
            </div>

            {data.error ? (
              <div className="mb-5 rounded-[10px] bg-rose-500/12 px-4 py-3 text-[13px] text-rose-100">
                {data.error}
              </div>
            ) : null}
            {data.notice ? (
              <div className="mb-5 rounded-[10px] bg-amber-300/10 px-4 py-3 text-[13px] text-amber-100">
                {data.notice}
              </div>
            ) : null}

            {loading ? (
              <div className="flex h-full min-h-[420px] items-center justify-center">
                <div className="flex flex-col items-center gap-4 text-zinc-400">
                  <Loader2 size={30} className="animate-spin text-violet-200" />
                  <span className="text-[12px] font-black uppercase tracking-[0.18em]">Searching visual references…</span>
                </div>
              </div>
            ) : results.length === 0 ? (
              <div className="flex h-full min-h-[420px] items-center justify-center">
                <div className="max-w-[360px] text-center">
                  <Compass size={34} className="mx-auto mb-4 text-violet-200" />
                  <p className="text-[18px] font-black tracking-tight">Start with an idea or image.</p>
                  <p className="mt-2 text-[13px] leading-relaxed text-zinc-500">
                    Explore references, pick one image, and send it to Eye, Brain or Nano Banana.
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2 xl:grid-cols-5 2xl:grid-cols-8">
                {results.map((result) => {
                  const active = selected?.id === result.id;
                  return (
                    <button
                      key={result.id}
                      type="button"
                      onClick={() => selectResult(result)}
                      className={`group relative aspect-[4/5] overflow-hidden rounded-[10px] bg-zinc-950 text-left transition ${
                        active
                          ? "scale-[0.985] brightness-110"
                          : "hover:brightness-110"
                      }`}
                    >
                      <img
                        src={result.thumbUrl || result.imageUrl}
                        alt={result.title || "Inspiration reference"}
                        className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.035]"
                        loading="lazy"
                      />
                      {active ? (
                        <span className="absolute right-2 top-2 rounded-[10px] bg-violet-500 px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-white shadow-lg">
                          Selected
                        </span>
                      ) : null}
                      <div className="absolute inset-x-0 bottom-0 translate-y-2 bg-gradient-to-t from-black/85 via-black/45 to-transparent p-3 opacity-0 transition group-hover:translate-y-0 group-hover:opacity-100">
                        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white">{result.source}</p>
                        <p className="mt-1 truncate text-[11px] text-zinc-300">{result.author || result.title || "Reference"}</p>
                        <span className="mt-2 inline-flex rounded-[10px] bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-zinc-950">
                          Use this image
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        </main>
      </div>
    </StudioNodePortal>
  );
}

export const InspirationNode = memo(function InspirationNode({ id, data, selected }: NodeProps) {
  const nodeData = data as InspirationNodeData;
  const nodes = useNodes();
  const edges = useEdges();
  const { setNodes } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const [studioOpen, setStudioOpen] = useState(false);
  const [loadedPreviewRatio, setLoadedPreviewRatio] = useState<{ url: string; ratio: number } | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const previewFrameRef = useRef<HTMLDivElement | null>(null);
  const frameSyncKeyRef = useRef<string | null>(null);

  const promptEdge = useMemo(
    () => edges.find((edge) => edge.target === id && edge.targetHandle === "prompt"),
    [edges, id],
  );
  const imageEdge = useMemo(
    () => edges.find((edge) => edge.target === id && edge.targetHandle === "image"),
    [edges, id],
  );

  const promptInput = useMemo(() => {
    if (!promptEdge) return "";
    return String(resolvePromptValueFromEdgeSource(promptEdge, nodes as Node[]) ?? "").trim();
  }, [nodes, promptEdge]);

  const imageSourceNode = useMemo(
    () => nodes.find((node) => node.id === imageEdge?.source),
    [imageEdge?.source, nodes],
  );
  const imageInput = firstImageUrlFromNode(imageSourceNode);
  const status = nodeData.status ?? (nodeData.value ? "output" : promptInput || imageInput || nodeData.manualPrompt ? "ready" : "empty");
  const hasInput = Boolean(promptInput || imageInput || nodeData.manualPrompt);
  const outputUrl = typeof nodeData.value === "string" ? nodeData.value : "";
  const selectedRef = nodeData.selected ?? null;
  const resultsCount = Array.isArray(nodeData.results) ? nodeData.results.length : 0;
  const previewUrl = outputUrl || selectedRef?.thumbUrl || selectedRef?.imageUrl || "";
  const previewRatio =
    photoAspectRatio(selectedRef?.width, selectedRef?.height) ||
    (loadedPreviewRatio?.url === previewUrl ? loadedPreviewRatio.ratio : null) ||
    16 / 9;
  const currentNode = nodes.find((node) => node.id === id);

  useLayoutEffect(() => {
    if (!previewUrl || !Number.isFinite(previewRatio) || previewRatio <= 0) {
      frameSyncKeyRef.current = null;
      return;
    }
    const syncKey = `${previewUrl}:${previewRatio.toFixed(4)}`;
    if (frameSyncKeyRef.current === syncKey) return;
    const nextFrame = resolveAspectLockedNodeFrame({
      node: currentNode,
      contentWidth: previewRatio,
      contentHeight: 1,
      minWidth: 200,
      maxWidth: 960,
      minHeight: 120,
      maxHeight: 1400,
      chromeHeight: resolveNodeChromeHeight(frameRef.current, previewFrameRef.current),
    });
    frameSyncKeyRef.current = syncKey;
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id !== id) return node;
        const needsFrameSync = nodeFrameNeedsSync(node, nextFrame);
        const currentRatio =
          typeof (node.data as { _foldderAspectRatio?: unknown } | undefined)?._foldderAspectRatio === "number"
            ? ((node.data as { _foldderAspectRatio?: number })._foldderAspectRatio ?? null)
            : null;
        const needsRatioSync = currentRatio === null || Math.abs(currentRatio - previewRatio) > 0.0001;
        if (!needsFrameSync && !needsRatioSync) return node;
        return {
          ...node,
          ...(needsFrameSync ? { width: nextFrame.width, height: nextFrame.height } : {}),
          data: { ...node.data, _foldderAspectRatio: previewRatio },
          style: needsFrameSync ? { ...node.style, width: nextFrame.width, height: nextFrame.height } : node.style,
        };
      }),
    );
    requestAnimationFrame(() => updateNodeInternals(id));
  }, [currentNode, id, previewRatio, previewUrl, setNodes, updateNodeInternals]);

  const patchData = useCallback(
    (patch: Partial<InspirationNodeData>) => {
      setNodes((nds) =>
        nds.map((node) =>
          node.id === id
            ? {
                ...node,
                data: {
                  ...node.data,
                  ...patch,
                },
              }
            : node,
        ),
      );
    },
    [id, setNodes],
  );

  return (
    <div
      ref={frameRef}
      className={`custom-node inspiration-node foldder-node--frameless node--media ${status === "error" ? "foldder-node--error" : ""} ${status === "searching" ? "node-glow-running" : ""}`}
      style={{ minWidth: 200, minHeight: 120 }}
    >
      <NodeResizer minWidth={200} minHeight={120} maxWidth={960} maxHeight={1400} keepAspectRatio={Boolean(previewUrl)} isVisible={selected} />
      <NodeLabel id={id} label={nodeData.label} defaultLabel="Inspiration" />

      <div className="handle-wrapper handle-left" style={{ top: "31%" }}>
        <FoldderDataHandle type="target" position={Position.Left} id="prompt" dataType="prompt" />
        <span className="handle-label">Prompt</span>
      </div>
      <div className="handle-wrapper handle-left" style={{ top: "50%" }}>
        <FoldderDataHandle type="target" position={Position.Left} id="image" dataType="image" />
        <span className="handle-label">Image</span>
      </div>

      <div className="node-header">
        <NodeIcon
          type="inspiration"
          selected={selected}
          state={resolveFoldderNodeState({
            selected,
            loading: status === "searching",
            error: status === "error",
            done: Boolean(outputUrl),
          })}
          size={16}
        />
        <FoldderNodeHeaderTitle introActive={!!nodeData._foldderCanvasIntro}>Inspiration</FoldderNodeHeaderTitle>
      </div>

      <div className="node-content foldder-frameless-main space-y-3">
        <div
          ref={previewFrameRef}
          className="relative overflow-hidden rounded-[10px] bg-slate-950/70"
          style={{ aspectRatio: previewRatio }}
        >
          {outputUrl ? (
            <img
              src={outputUrl}
              alt=""
              className="h-full w-full object-contain"
              onLoad={(event) => {
                const img = event.currentTarget;
                const ratio = photoAspectRatio(img.naturalWidth, img.naturalHeight);
                if (ratio) setLoadedPreviewRatio({ url: outputUrl, ratio });
              }}
            />
          ) : selectedRef ? (
            <img
              src={selectedRef.thumbUrl || selectedRef.imageUrl}
              alt=""
              className="h-full w-full object-contain opacity-90"
              onLoad={(event) => {
                const img = event.currentTarget;
                const selectedUrl = selectedRef.thumbUrl || selectedRef.imageUrl;
                const ratio = photoAspectRatio(img.naturalWidth, img.naturalHeight);
                if (ratio) setLoadedPreviewRatio({ url: selectedUrl, ratio });
              }}
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-zinc-500">
              <Compass size={28} strokeWidth={1.5} />
              <span className="text-[8px] font-black uppercase tracking-[0.14em]">
                {resultsCount > 0 ? `${resultsCount} references` : promptInput || imageInput ? "Ready" : "Open Studio"}
              </span>
            </div>
          )}
        </div>

        <p className="foldder-frameless-chip min-h-[26px] text-[9px] leading-snug text-zinc-500">
          {nodeData.error || statusMessage(status, hasInput)}
        </p>

        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setStudioOpen(true);
          }}
          className="foldder-frameless-action nodrag flex w-full items-center justify-center gap-2 rounded-[10px] bg-white/[0.07] px-3 py-2 text-[10px] font-black uppercase tracking-widest text-zinc-100 transition hover:bg-white/[0.12]"
        >
          <Maximize2 size={13} />
          Open Studio
        </button>
      </div>

      <div className="handle-wrapper handle-right" style={{ top: "50%" }}>
        <span className="handle-label">Image</span>
        <FoldderDataHandle type="source" position={Position.Right} id="image" dataType="image" />
      </div>

      {studioOpen ? (
        <InspirationStudio
          nodeId={id}
          data={nodeData}
          promptInput={promptInput}
          imageInput={imageInput}
          onClose={() => setStudioOpen(false)}
          onPatch={patchData}
        />
      ) : null}
    </div>
  );
});
