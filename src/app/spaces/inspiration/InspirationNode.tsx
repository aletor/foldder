"use client";

/* eslint-disable @next/next/no-img-element */

import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
} from "lucide-react";
import { runAiJobWithNotification } from "@/lib/ai-job-notifications";
import { readJsonWithHttpError } from "@/lib/read-response-json";
import { resolvePromptValueFromEdgeSource } from "../canvas-group-logic";
import { FoldderDataHandle } from "../FoldderDataHandle";
import { NodeIcon, resolveFoldderNodeState } from "../foldder-icons";
import { FoldderNodeHeaderTitle, NodeLabel } from "../foldder-node-ui";
import {
  loadImageDimensions,
  nodeFrameNeedsSync,
  resolveAspectLockedNodeFrame,
  resolveNodeChromeHeight,
} from "../studio-node-aspect";
import { StudioNodePortal } from "../studio-node/studio-node-architecture";
import {
  FoldderStudioHeader,
} from "../FoldderStudioHeader";

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

function syncInspirationNodeFrame(
  nodes: Node[],
  nodeId: string,
  contentWidth: number,
  contentHeight: number,
  targetNode?: Node,
): Node[] {
  const ratio = photoAspectRatio(contentWidth, contentHeight) ?? contentWidth / Math.max(1, contentHeight);
  const nextFrame = resolveAspectLockedNodeFrame({
    node: targetNode,
    contentWidth: ratio,
    contentHeight: 1,
    minWidth: 200,
    maxWidth: 960,
    minHeight: 120,
    maxHeight: 1400,
  });
  return nodes.map((node) => {
    if (node.id !== nodeId) return node;
    return {
      ...node,
      width: nextFrame.width,
      height: nextFrame.height,
      data: { ...node.data, _foldderAspectRatio: ratio },
      style: { ...node.style, width: nextFrame.width, height: nextFrame.height },
    };
  });
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
  nodeLabel,
  promptInput,
  imageInput,
  onClose,
  onPatch,
}: {
  nodeId: string;
  data: InspirationNodeData;
  nodeLabel: string;
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
      <div
        className="fixed inset-0 z-[100090] flex flex-col bg-[#0b0f14] text-white"
        data-foldder-studio-panel
        data-foldder-inspiration-studio
        data-foldder-i18n-ignore
      >
        <FoldderStudioHeader
          nodeType="inspiration"
          nodeLabel={nodeLabel}
          subtitle="Visual references"
          onClose={onClose}
        />

        <div className="grid min-h-0 flex-1 grid-cols-[minmax(272px,320px)_1fr] divide-x divide-white/10">
          <aside className="flex min-h-0 flex-col overflow-hidden bg-white/[0.02]">
            <div className="shrink-0 border-b border-white/10">
              <div className="flex h-8 items-center bg-white/[0.04] px-3">
                <p className="text-[9px] font-black uppercase tracking-[0.12em] text-white/45">Current input</p>
              </div>
              <div className="px-3 py-2">
                {promptInput ? (
                  <p className="text-[11px] leading-relaxed text-white/78">{compactText(promptInput, 320)}</p>
                ) : imageInput ? (
                  <div>
                    <p className="text-[11px] font-semibold text-white/78">Connected image</p>
                    <p className="mt-1 text-[9px] leading-relaxed text-white/38">
                      Visual intent is read once and reused for every search.
                    </p>
                  </div>
                ) : (
                  <textarea
                    value={manualPrompt}
                    onChange={(event) => {
                      setManualPrompt(event.target.value);
                      onPatch({
                        manualPrompt: event.target.value,
                        status: event.target.value.trim() ? "ready" : "empty",
                      });
                    }}
                    placeholder="Write an idea to explore…"
                    className="min-h-[88px] w-full resize-none bg-white/[0.06] px-2.5 py-2 text-[12px] leading-relaxed text-white outline-none placeholder:text-white/30 focus:bg-white/[0.10]"
                  />
                )}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto border-b border-white/10">
              <div className="flex h-8 items-center bg-white/[0.04] px-3">
                <p className="text-[9px] font-black uppercase tracking-[0.12em] text-white/45">Explore</p>
              </div>
              <div className="grid grid-cols-2 divide-x divide-y divide-white/10">
                {FACETS.map((item) => {
                  const active = facet === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => void runSearch(item.id)}
                      disabled={loading || !hasAnyInput}
                      className={`flex min-h-[52px] items-center gap-2 px-2.5 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${
                        active
                          ? "bg-emerald-500/22 text-emerald-100"
                          : "bg-white/[0.03] text-white/65 hover:bg-white/[0.08] hover:text-white"
                      }`}
                    >
                      <span className={active ? "text-emerald-200" : "text-white/45"}>{item.icon}</span>
                      <span className="text-[10px] font-black uppercase tracking-[0.06em]">{item.en}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              type="button"
              onClick={() => void runSearch()}
              disabled={loading || !hasAnyInput}
              className="flex h-10 shrink-0 items-center justify-center gap-2 bg-emerald-600 text-[10px] font-black uppercase tracking-[0.1em] text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-white/[0.06] disabled:text-white/30"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
              Search
            </button>
          </aside>

          <section className="flex min-h-0 flex-col overflow-hidden">
            <div className="flex h-10 shrink-0 divide-x divide-white/10 bg-white/[0.06]">
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
                    className={`flex-1 text-[10px] font-black uppercase tracking-[0.1em] transition disabled:pointer-events-none disabled:opacity-50 ${
                      active
                        ? "bg-white text-slate-950"
                        : "text-white/45 hover:bg-white/[0.08] hover:text-white"
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
              <div className="flex min-w-0 flex-[1.4] items-center justify-end px-3">
                <p className="truncate text-[9px] font-semibold uppercase tracking-[0.06em] text-white/35">
                  {results.length > 0
                    ? `${results.length} refs · ${PROVIDERS.find((item) => item.id === provider)?.label ?? provider}`
                    : "Run search to load references"}
                </p>
              </div>
            </div>

            {(data.error || data.notice) && (
              <div className="shrink-0 divide-y divide-white/8 border-b border-white/8">
                {data.error ? (
                  <div className="flex items-center gap-2 bg-rose-500/15 px-3 py-1.5 text-[10px] font-semibold text-rose-100">
                    {data.error}
                  </div>
                ) : null}
                {data.notice ? (
                  <div className="flex items-center gap-2 bg-amber-400/15 px-3 py-1.5 text-[10px] font-semibold text-amber-100">
                    {data.notice}
                  </div>
                ) : null}
              </div>
            )}

            <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-3 text-white/45">
                  <Loader2 size={24} className="animate-spin text-emerald-300" />
                  <span className="text-[10px] font-black uppercase tracking-[0.12em]">Searching references…</span>
                </div>
              ) : results.length === 0 ? (
                <div className="flex h-full min-h-[320px] flex-col items-center justify-center px-6 text-center">
                  <Compass size={28} className="mb-3 text-emerald-300/80" />
                  <p className="text-[13px] font-black uppercase tracking-[0.08em] text-white/75">
                    Start with an idea or image
                  </p>
                  <p className="mt-2 max-w-[300px] text-[10px] leading-relaxed text-white/38">
                    Pick a facet, choose a provider, and send the result to Eye, Brain or Nano Banana.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-3 divide-x divide-y divide-white/10 xl:grid-cols-5 2xl:grid-cols-8">
                  {results.map((result) => {
                    const active = selected?.id === result.id;
                    return (
                      <button
                        key={result.id}
                        type="button"
                        onClick={() => selectResult(result)}
                        className={`group relative aspect-[4/5] overflow-hidden bg-black text-left transition hover:brightness-110 ${
                          active ? "ring-2 ring-inset ring-emerald-400 brightness-110" : ""
                        }`}
                      >
                        <img
                          src={result.thumbUrl || result.imageUrl}
                          alt={result.title || "Inspiration reference"}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                        {active ? (
                          <span className="absolute left-0 top-0 bg-emerald-500 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.1em] text-emerald-950">
                            Selected
                          </span>
                        ) : null}
                        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 bg-black/72 px-2 py-2 opacity-0 transition group-hover:opacity-100">
                          <p className="text-[8px] font-black uppercase tracking-[0.1em] text-white/70">{result.source}</p>
                          <p className="truncate text-[10px] text-white/85">{result.author || result.title || "Reference"}</p>
                          <span className="mt-0.5 inline-flex w-fit bg-white px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.08em] text-slate-950">
                            Use image
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </StudioNodePortal>
  );
}

const INSPIRATION_EMPTY_BACKGROUND_SRC = "/assets/nodes/inspiration-empty-green.png";

export const InspirationNode = memo(function InspirationNode({ id, data, selected }: NodeProps) {
  const nodeData = data as InspirationNodeData;
  const nodes = useNodes();
  const edges = useEdges();
  const { setNodes } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const [studioOpen, setStudioOpen] = useState(false);
  const [measuredPreviewSize, setMeasuredPreviewSize] = useState<{ url: string; width: number; height: number } | null>(null);
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
  const previewImageSize = useMemo(() => {
    if (!previewUrl) return null;
    if (measuredPreviewSize?.url === previewUrl) return measuredPreviewSize;
    const apiWidth = selectedRef?.width;
    const apiHeight = selectedRef?.height;
    if (apiWidth && apiHeight) return { url: previewUrl, width: apiWidth, height: apiHeight };
    return null;
  }, [measuredPreviewSize, previewUrl, selectedRef?.height, selectedRef?.width]);
  const previewRatio =
    (previewImageSize ? photoAspectRatio(previewImageSize.width, previewImageSize.height) : null) ||
    photoAspectRatio(selectedRef?.width, selectedRef?.height) ||
    16 / 9;
  const currentNode = nodes.find((node) => node.id === id);
  const showInspirationEmpty = !outputUrl && !selectedRef;

  useEffect(() => {
    if (!previewUrl) {
      frameSyncKeyRef.current = null;
      setMeasuredPreviewSize(null);
      return;
    }

    let cancelled = false;
    const measureUrl = outputUrl || selectedRef?.imageUrl || previewUrl;
    void loadImageDimensions(measureUrl)
      .then(({ width, height }) => {
        if (cancelled) return;
        setMeasuredPreviewSize((prev) => {
          if (prev?.url === previewUrl && prev.width === width && prev.height === height) return prev;
          return { url: previewUrl, width, height };
        });
      })
      .catch(() => {
        /* keep API dimensions or default ratio */
      });

    return () => {
      cancelled = true;
    };
  }, [outputUrl, previewUrl, selectedRef?.imageUrl]);

  useLayoutEffect(() => {
    if (showInspirationEmpty || !previewUrl || !previewImageSize || previewImageSize.url !== previewUrl) return;

    const syncKey = `${previewUrl}:${previewImageSize.width}x${previewImageSize.height}`;
    if (frameSyncKeyRef.current === syncKey) return;

    const ratio =
      photoAspectRatio(previewImageSize.width, previewImageSize.height) ??
      previewImageSize.width / previewImageSize.height;
    const nextFrame = resolveAspectLockedNodeFrame({
      node: currentNode,
      contentWidth: ratio,
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
        const needsRatioSync = currentRatio === null || Math.abs(currentRatio - ratio) > 0.0001;
        if (!needsFrameSync && !needsRatioSync) return node;
        return {
          ...node,
          ...(needsFrameSync ? { width: nextFrame.width, height: nextFrame.height } : {}),
          data: { ...node.data, _foldderAspectRatio: ratio },
          style: needsFrameSync ? { ...node.style, width: nextFrame.width, height: nextFrame.height } : node.style,
        };
      }),
    );
    requestAnimationFrame(() => updateNodeInternals(id));
  }, [currentNode, id, previewImageSize, previewUrl, setNodes, showInspirationEmpty, updateNodeInternals]);

  const patchData = useCallback(
    (patch: Partial<InspirationNodeData>) => {
      const immediateWidth = patch.selected?.width;
      const immediateHeight = patch.selected?.height;
      const nextUrl =
        typeof patch.value === "string"
          ? patch.value
          : patch.selected?.imageUrl || patch.selected?.thumbUrl || "";

      if (immediateWidth && immediateHeight && nextUrl) {
        frameSyncKeyRef.current = `${nextUrl}:${immediateWidth}x${immediateHeight}`;
      } else if ("value" in patch || "selected" in patch) {
        frameSyncKeyRef.current = null;
      }

      setNodes((nds) => {
        let nextNodes = nds.map((node) =>
          node.id === id
            ? {
                ...node,
                data: {
                  ...node.data,
                  ...patch,
                },
              }
            : node,
        );
        if (immediateWidth && immediateHeight) {
          const targetNode = nextNodes.find((node) => node.id === id);
          nextNodes = syncInspirationNodeFrame(nextNodes, id, immediateWidth, immediateHeight, targetNode);
        }
        return nextNodes;
      });
      requestAnimationFrame(() => updateNodeInternals(id));
    },
    [id, setNodes, updateNodeInternals],
  );

  return (
    <div
      ref={frameRef}
      className={`custom-node inspiration-node foldder-node--frameless node--media ${showInspirationEmpty ? "inspiration-node--empty" : ""} ${status === "error" ? "foldder-node--error" : ""} ${status === "searching" ? "node-glow-running" : ""}`}
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

      {showInspirationEmpty ? (
        <div className="node-content foldder-frameless-main relative flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="inspiration-empty-background absolute inset-0 overflow-hidden" aria-hidden>
            <img
              src={INSPIRATION_EMPTY_BACKGROUND_SRC}
              alt=""
              className="h-full w-full object-contain object-bottom"
              draggable={false}
            />
          </div>
          <div className="relative z-10 mt-auto flex flex-col gap-3 px-3 pb-3 pt-2">
            <p className="foldder-frameless-chip min-h-[26px] text-[9px] leading-snug text-white/80">
              {nodeData.error || statusMessage(status, hasInput)}
            </p>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setStudioOpen(true);
              }}
              className="foldder-frameless-action nodrag flex w-full items-center justify-center gap-2 rounded-none bg-white/[0.88] px-3 py-2 text-[10px] font-black uppercase tracking-widest text-emerald-950 transition hover:bg-white"
            >
              <Maximize2 size={13} />
              Open Studio
            </button>
          </div>
        </div>
      ) : (
        <div className="node-content foldder-frameless-main space-y-3">
          <div
            ref={previewFrameRef}
            className="relative overflow-hidden rounded-none bg-slate-950/70"
            style={{ aspectRatio: previewRatio }}
          >
            {outputUrl ? (
              <img src={outputUrl} alt="" className="h-full w-full object-contain" />
            ) : selectedRef ? (
              <img
                src={selectedRef.thumbUrl || selectedRef.imageUrl}
                alt=""
                className="h-full w-full object-contain opacity-90"
              />
            ) : null}
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
            className="foldder-frameless-action nodrag flex w-full items-center justify-center gap-2 rounded-none bg-white/[0.07] px-3 py-2 text-[10px] font-black uppercase tracking-widest text-zinc-100 transition hover:bg-white/[0.12]"
          >
            <Maximize2 size={13} />
            Open Studio
          </button>
        </div>
      )}

      <div className="handle-wrapper handle-right" style={{ top: "50%" }}>
        <span className="handle-label">Image</span>
        <FoldderDataHandle type="source" position={Position.Right} id="image" dataType="image" />
      </div>

      {studioOpen ? (
        <InspirationStudio
          nodeId={id}
          data={nodeData}
          nodeLabel={nodeData.label?.trim() || "Inspiration"}
          promptInput={promptInput}
          imageInput={imageInput}
          onClose={() => setStudioOpen(false)}
          onPatch={patchData}
        />
      ) : null}
    </div>
  );
});
