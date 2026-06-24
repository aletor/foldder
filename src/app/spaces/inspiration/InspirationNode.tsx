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
  ChevronDown,
  ChevronUp,
  Compass,
  Layers3,
  Link2,
  Loader2,
  Palette,
  Search,
  Sparkles,
  UserRound,
  Wallpaper,
} from "lucide-react";
import { runAiJobWithNotification } from "@/lib/ai-job-notifications";
import { useCanvasNodeMediaPreviewUrl } from "../hooks/use-authed-media-preview-url";
import { readJsonWithHttpError } from "@/lib/read-response-json";
import { resolvePromptValueFromEdgeSource } from "../canvas-group-logic";
import { FoldderDataHandle } from "../FoldderDataHandle";
import { NodeIcon, resolveFoldderNodeState } from "../foldder-icons";
import { FoldderNodeHeaderTitle, NodeLabel } from "../foldder-node-ui";
import {
  loadImageDimensions,
  nodeFrameNeedsSync,
  resolveAspectLockedNodeFrame,
} from "../studio-node-aspect";
import { StudioNodePortal } from "../studio-node/studio-node-architecture";
import {
  FoldderStudioHeader,
} from "../FoldderStudioHeader";
import {
  hasFoldderStudioTouched,
  touchStudioNodeData,
} from "../studio-node/foldder-studio-touched";
import { FoldderStudioTouchedMark } from "../studio-node/foldder-studio-touched-mark";

type InspirationFacet = "similar" | "textures" | "colors" | "style" | "people" | "backgrounds";
type InspirationProvider = "pexels" | "unsplash" | "arena";
type InspirationStatus = "empty" | "ready" | "searching" | "results" | "selected" | "output" | "error";
type InspirationReferenceSource = "direct" | "stock";

type InspirationResult = {
  id: string;
  source: "Pexels" | "Unsplash" | "Are.na";
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
  referenceSource?: InspirationReferenceSource;
  value?: string;
  type?: string;
  status?: InspirationStatus;
  error?: string;
  notice?: string;
  _foldderCanvasIntro?: boolean;
  _foldderStudioTouched?: boolean;
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
  { id: "arena", label: "Are.na" },
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

function looksLikeImageUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/^data:image\//i.test(trimmed)) return true;
  if (/^https?:\/\//i.test(trimmed)) return true;
  if (/^blob:/i.test(trimmed)) return true;
  return false;
}

function inspirationOriginLabel(data: InspirationNodeData): string | null {
  if (data.referenceSource === "direct") return "Direct link";
  const selected = data.selected;
  if (selected) {
    const facetLabel = FACETS.find((item) => item.id === data.facet)?.en;
    const providerLabel =
      PROVIDERS.find((item) => item.id === data.provider)?.label ?? selected.source;
    return facetLabel ? `${providerLabel} · ${facetLabel}` : providerLabel;
  }
  if (data.referenceSource === "stock" && data.provider) {
    const providerLabel = PROVIDERS.find((item) => item.id === data.provider)?.label;
    if (providerLabel) return providerLabel;
  }
  return null;
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
): { nodes: Node[]; didSync: boolean; frame: { width: number; height: number } | null } {
  const safeWidth = Math.max(1, contentWidth);
  const safeHeight = Math.max(1, contentHeight);
  const ratio = photoAspectRatio(safeWidth, safeHeight) ?? safeWidth / safeHeight;
  const targetNode = nodes.find((node) => node.id === nodeId);
  if (!targetNode) return { nodes, didSync: false, frame: null };

  const nextFrame = resolveAspectLockedNodeFrame({
    node: targetNode,
    contentWidth: safeWidth,
    contentHeight: safeHeight,
    minWidth: 200,
    maxWidth: 960,
    minHeight: 120,
    maxHeight: 1400,
  });

  let didSync = false;
  const nextNodes = nodes.map((node) => {
    if (node.id !== nodeId) return node;
    const needsFrameSync = nodeFrameNeedsSync(node, nextFrame);
    const currentRatio =
      typeof (node.data as { _foldderAspectRatio?: unknown } | undefined)?._foldderAspectRatio === "number"
        ? ((node.data as { _foldderAspectRatio?: number })._foldderAspectRatio ?? null)
        : null;
    const needsRatioSync = currentRatio === null || Math.abs(currentRatio - ratio) > 0.0001;
    if (!needsFrameSync && !needsRatioSync) return node;
    didSync = true;
    return {
      ...node,
      width: nextFrame.width,
      height: nextFrame.height,
      measured: { width: nextFrame.width, height: nextFrame.height },
      data: { ...node.data, _foldderAspectRatio: ratio },
      style: { ...node.style, width: nextFrame.width, height: nextFrame.height },
    };
  });

  return { nodes: didSync ? nextNodes : nodes, didSync, frame: nextFrame };
}

function inspirationFrameSyncKey(previewUrl: string, width: number, height: number): string {
  return `${previewUrl}:${width}x${height}`;
}

function scheduleInspirationNodeInternalsRefresh(
  nodeId: string,
  updateNodeInternals: (id: string) => void,
) {
  requestAnimationFrame(() => {
    updateNodeInternals(nodeId);
    requestAnimationFrame(() => updateNodeInternals(nodeId));
  });
}

function statusMessage(status: InspirationStatus, hasInput: boolean): string {
  if (!hasInput) {
    return "Connect a prompt or image, or find references on Pexels, Unsplash, or Are.na.";
  }
  if (status === "searching") return "Searching visual references…";
  if (status === "error") return "Couldn’t load references. Try another search.";
  if (status === "selected") return "Selected reference ready.";
  if (status === "output") return "Reference ready for the pipeline.";
  if (status === "results") return "Choose one reference image.";
  return "Ready to search inspiration.";
}

function InspirationStudio({
  nodeId,
  data,
  nodeLabel,
  promptInput,
  imageInput,
  expandDirectLink,
  onClose,
  onPatch,
}: {
  nodeId: string;
  data: InspirationNodeData;
  nodeLabel: string;
  promptInput: string;
  imageInput: string;
  expandDirectLink?: boolean;
  onClose: () => void;
  onPatch: (patch: Partial<InspirationNodeData>) => void;
}) {
  const facet = data.facet ?? "similar";
  const provider = data.provider ?? "pexels";
  const results = Array.isArray(data.results) ? data.results : [];
  const selected = data.selected ?? null;
  const [manualPrompt, setManualPrompt] = useState(data.manualPrompt ?? "");
  const [directLinkExpanded, setDirectLinkExpanded] = useState(Boolean(expandDirectLink));
  const [directUrl, setDirectUrl] = useState(
    data.referenceSource === "direct" && typeof data.value === "string" ? data.value : "",
  );
  const [directLinkError, setDirectLinkError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const effectiveImageInput =
    imageInput || (looksLikeImageUrl(directUrl) ? directUrl.trim() : "");
  const imageIntentCacheRef = useRef<{ imageUrl: string; intent: string } | null>(
    data.imageIntent && data.imageIntentSource
      ? { imageUrl: data.imageIntentSource, intent: data.imageIntent }
      : null,
  );
  const imageIntentPromiseRef = useRef<{ imageUrl: string; promise: Promise<string> } | null>(null);

  const hasAnyInput = Boolean(promptInput || effectiveImageInput || manualPrompt.trim());

  const describeImageIfNeeded = useCallback(async () => {
    if (!effectiveImageInput || promptInput || manualPrompt.trim()) return data.imageIntent || "";
    if (imageIntentCacheRef.current?.imageUrl === effectiveImageInput) return imageIntentCacheRef.current.intent;
    if (data.imageIntent && data.imageIntentSource === effectiveImageInput) {
      imageIntentCacheRef.current = { imageUrl: effectiveImageInput, intent: data.imageIntent };
      return data.imageIntent;
    }
    if (imageIntentPromiseRef.current?.imageUrl === effectiveImageInput) {
      return imageIntentPromiseRef.current.promise;
    }

    const promise = (async () => {
    const res = await fetch("/api/spaces/describe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: effectiveImageInput,
        type: "image",
        metadata: { source: "inspiration-input" },
      }),
    });
    const json = await readJsonWithHttpError<{ description?: string; error?: string }>(res, "/api/spaces/describe");
    const description = typeof json.description === "string" ? compactText(json.description, 420) : "";
    if (!description) throw new Error(json.error || "image_description_failed");
      imageIntentCacheRef.current = { imageUrl: effectiveImageInput, intent: description };
      onPatch({ imageIntent: description, imageIntentSource: effectiveImageInput });
    return description;
    })();

    imageIntentPromiseRef.current = { imageUrl: effectiveImageInput, promise };
    try {
      return await promise;
    } finally {
      if (imageIntentPromiseRef.current?.promise === promise) imageIntentPromiseRef.current = null;
    }
  }, [data.imageIntent, data.imageIntentSource, effectiveImageInput, manualPrompt, onPatch, promptInput]);

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
          let json: { results?: InspirationResult[]; error?: string; notice?: string; code?: string };
          try {
            json = await readJsonWithHttpError<{ results?: InspirationResult[]; error?: string; notice?: string; code?: string }>(
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
        referenceSource: "stock",
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

  const applyDirectLink = useCallback(async () => {
    const url = directUrl.trim();
    if (!looksLikeImageUrl(url)) {
      setDirectLinkError("Enter a valid image URL.");
      return;
    }
    setDirectLinkError(null);
    try {
      await loadImageDimensions(url);
    } catch {
      setDirectLinkError("Couldn’t load this link. Check the URL and try again.");
      return;
    }
    onPatch({
      value: url,
      type: "image",
      selected: null,
      referenceSource: "direct",
      status: "output",
      error: undefined,
      notice: undefined,
    });
    onClose();
  }, [directUrl, onClose, onPatch]);

  return (
    <StudioNodePortal>
      <div
        className="fixed inset-0 z-[100090] flex flex-col bg-[#0b0f14] text-white"
        data-foldder-studio-panel
        data-foldder-studio-canvas
        data-foldder-inspiration-studio
        data-foldder-i18n-ignore
      >
        <FoldderStudioHeader
          nodeType="inspiration"
          nodeLabel={nodeLabel}
          subtitle="Visual references"
          onClose={onClose}
        />

        <div className="grid min-h-0 flex-1 grid-cols-[minmax(176px,196px)_minmax(0,1fr)] divide-x divide-white/10">
          <aside
            className="flex min-h-0 shrink-0 flex-col overflow-hidden bg-[#0ac38a]/[0.04]"
            data-foldder-inspiration-sidebar
          >
            <div className="shrink-0 border-b border-white/10 px-3 py-2.5">
              <p className="mb-1.5 text-[8px] font-black uppercase tracking-[0.14em] text-emerald-200/70">Idea</p>
              {promptInput ? (
                <p
                  className="inspiration-studio-idea-chip line-clamp-4 text-[10px] leading-snug text-white/78"
                  title={promptInput}
                >
                  {compactText(promptInput, 120)}
                </p>
              ) : effectiveImageInput ? (
                <p className="inspiration-studio-idea-chip text-[10px] leading-snug text-white/62">
                  {imageInput ? "Linked image from canvas" : "Link ready for similar search"}
                </p>
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
                  placeholder="Describe what you want to find…"
                  rows={3}
                  className="inspiration-studio-idea-input min-h-[56px] w-full resize-none px-2 py-1.5 text-[11px] leading-snug text-white outline-none placeholder:text-white/30"
                />
              )}
            </div>

            <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-2 py-2">
              <p className="mb-1.5 px-1 text-[8px] font-black uppercase tracking-[0.14em] text-emerald-200/70">Explore</p>
              <div className="flex flex-col gap-0.5">
                {FACETS.map((item) => {
                  const active = facet === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      title={item.en}
                      onClick={() => void runSearch(item.id)}
                      disabled={loading || !hasAnyInput}
                      className={`inspiration-studio-facet flex h-9 items-center gap-2 px-2 text-left transition disabled:cursor-not-allowed disabled:opacity-35 ${
                        active
                          ? "bg-[#0ac38a]/28 text-emerald-50"
                          : "text-white/62 hover:bg-white/[0.07] hover:text-white/92"
                      }`}
                    >
                      <span className={`shrink-0 ${active ? "text-emerald-100" : "text-white/42"}`}>
                        {React.cloneElement(item.icon as React.ReactElement<{ size?: number }>, { size: 13 })}
                      </span>
                      <span className="truncate text-[9px] font-black uppercase tracking-[0.06em]">{item.en}</span>
                    </button>
                  );
                })}
              </div>
            </div>
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
                    className={`min-w-0 flex-1 px-2 text-[9px] font-black uppercase tracking-[0.08em] transition disabled:pointer-events-none disabled:opacity-50 ${
                      active
                        ? "bg-white text-slate-950"
                        : "text-white/45 hover:bg-white/[0.08] hover:text-white"
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
              <div className="hidden min-w-0 flex-[1.2] items-center justify-end px-3 xl:flex">
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
                  <Compass size={28} className="mb-3 text-[#0ac38a]/85" />
                  <p className="text-[13px] font-black uppercase tracking-[0.08em] text-white/82">
                    Start with an idea or image
                  </p>
                  <p className="mt-2 max-w-[340px] text-[10px] leading-relaxed text-white/48">
                    Pick a facet and provider, then use <span className="text-white/72">Search references</span> in the
                    bar below.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-3 divide-x divide-y divide-white/10 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8">
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

        <footer className="inspiration-studio-dock" data-foldder-inspiration-dock>
          <div className="inspiration-studio-dock__row">
            <button
              type="button"
              title="Search references"
              onClick={() => void runSearch()}
              disabled={loading || !hasAnyInput}
              className="inspiration-studio-dock__search nodrag"
            >
              {loading ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Search size={15} aria-hidden />}
              Search references
            </button>
            <button
              type="button"
              onClick={() => setDirectLinkExpanded((open) => !open)}
              aria-expanded={directLinkExpanded}
              className={`inspiration-studio-dock__link-toggle nodrag ${directLinkExpanded ? "is-open" : ""}`}
            >
              <Link2 size={14} aria-hidden />
              {directLinkExpanded ? "Hide direct link" : "Have a link?"}
              {directLinkExpanded ? <ChevronUp size={13} aria-hidden /> : <ChevronDown size={13} aria-hidden />}
            </button>
          </div>

          {directLinkExpanded ? (
            <div className="inspiration-studio-dock__link-panel">
              <div className="inspiration-studio-dock__link-field">
                <Link2 size={14} className="shrink-0 text-white/45" aria-hidden />
                <input
                  type="text"
                  value={directUrl}
                  onChange={(event) => {
                    setDirectUrl(event.target.value);
                    setDirectLinkError(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void applyDirectLink();
                    }
                  }}
                  placeholder="Paste image URL…"
                  className="min-w-0 flex-1 bg-transparent text-[12px] leading-snug text-white outline-none placeholder:text-white/32"
                />
              </div>
              <button
                type="button"
                onClick={() => void applyDirectLink()}
                disabled={!looksLikeImageUrl(directUrl)}
                className="inspiration-studio-dock__link-apply nodrag"
              >
                Use as reference
              </button>
              {directLinkError ? (
                <p className="inspiration-studio-dock__link-error">{directLinkError}</p>
              ) : (
                <p className="inspiration-studio-dock__link-hint">
                  Optional — skip stock search if you already have the image.
                </p>
              )}
            </div>
          ) : null}
        </footer>
      </div>
    </StudioNodePortal>
  );
}

const INSPIRATION_EMPTY_BACKGROUND_SRC = "/assets/nodes/inspiration-empty-green.png";

export const InspirationNode = memo(function InspirationNode({ id, data, selected }: NodeProps) {
  const nodes = useNodes();
  const flowNode = nodes.find((node) => node.id === id);
  const nodeData = (flowNode?.data ?? data) as InspirationNodeData;
  const edges = useEdges();
  const { setNodes } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const [studioOpen, setStudioOpen] = useState(false);
  const [studioExpandDirectLink, setStudioExpandDirectLink] = useState(false);
  const [studioTouched, setStudioTouched] = useState(
    () => hasFoldderStudioTouched(data as Record<string, unknown>),
  );
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
  const { displayUrl: inspirationCanvasUrl } = useCanvasNodeMediaPreviewUrl(outputUrl || null);
  const previewUrl = outputUrl || selectedRef?.thumbUrl || selectedRef?.imageUrl || "";
  const previewImageSize = useMemo(() => {
    if (!previewUrl) return null;
    if (measuredPreviewSize?.url === previewUrl) return measuredPreviewSize;
    const apiWidth = selectedRef?.width;
    const apiHeight = selectedRef?.height;
    if (apiWidth && apiHeight) return { url: previewUrl, width: apiWidth, height: apiHeight };
    return null;
  }, [measuredPreviewSize, previewUrl, selectedRef?.height, selectedRef?.width]);
  const previewImageWidth = previewImageSize?.width ?? null;
  const previewImageHeight = previewImageSize?.height ?? null;
  const showInspirationEmpty = !outputUrl && !selectedRef;
  const originLabel = inspirationOriginLabel(nodeData);

  const openStudio = useCallback((options?: { expandDirectLink?: boolean }) => {
    setStudioExpandDirectLink(Boolean(options?.expandDirectLink));
    setStudioOpen(true);
  }, []);

  const closeStudio = useCallback(() => {
    setStudioOpen(false);
    setStudioExpandDirectLink(false);
  }, []);

  useEffect(() => {
    if (hasFoldderStudioTouched(nodeData as Record<string, unknown>)) {
      setStudioTouched(true);
    }
  }, [nodeData]);

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
    if (showInspirationEmpty || !previewUrl || !previewImageWidth || !previewImageHeight) return;

    const syncKey = inspirationFrameSyncKey(previewUrl, previewImageWidth, previewImageHeight);
    if (frameSyncKeyRef.current === syncKey) return;

    let didSync = false;
    setNodes((nds) => {
      const result = syncInspirationNodeFrame(nds, id, previewImageWidth, previewImageHeight);
      didSync = result.didSync;
      return result.nodes;
    });

    frameSyncKeyRef.current = syncKey;
    if (didSync) {
      scheduleInspirationNodeInternalsRefresh(id, updateNodeInternals);
    }
  }, [
    id,
    previewImageHeight,
    previewImageWidth,
    previewUrl,
    setNodes,
    showInspirationEmpty,
    updateNodeInternals,
  ]);

  const patchData = useCallback(
    (patch: Partial<InspirationNodeData>) => {
      const immediateWidth = patch.selected?.width;
      const immediateHeight = patch.selected?.height;

      let shouldRefreshInternals = false;

      const shouldMarkTouched =
        Boolean(patch.selected) ||
        (typeof patch.value === "string" && patch.value.trim().length > 0);

      if (shouldMarkTouched) {
        setStudioTouched(true);
      }

      setNodes((nds) => {
        let nextNodes = nds.map((node) => {
          if (node.id !== id) return node;
          const nextData = shouldMarkTouched
            ? touchStudioNodeData(node.data as Record<string, unknown>, patch as Record<string, unknown>)
            : { ...node.data, ...patch };
          return { ...node, data: nextData };
        });

        if (immediateWidth && immediateHeight) {
          const result = syncInspirationNodeFrame(nextNodes, id, immediateWidth, immediateHeight);
          nextNodes = result.nodes;
          shouldRefreshInternals = result.didSync;
        } else if ("value" in patch && patch.value !== (nodeData.value ?? undefined)) {
          frameSyncKeyRef.current = null;
        }

        return nextNodes;
      });

      if (shouldRefreshInternals) {
        scheduleInspirationNodeInternalsRefresh(id, updateNodeInternals);
      }
    },
    [id, nodeData.value, setNodes, updateNodeInternals],
  );

  return (
    <div
      ref={frameRef}
      className={`custom-node inspiration-node foldder-node--frameless node--media group/node ${showInspirationEmpty ? "inspiration-node--empty" : "inspiration-node--has-preview"} ${status === "error" ? "foldder-node--error" : ""} ${status === "searching" ? "node-glow-running" : ""}`}
      style={{ minWidth: 200, minHeight: showInspirationEmpty ? 120 : 0 }}
    >
      <NodeResizer minWidth={200} minHeight={120} maxWidth={960} maxHeight={1400} keepAspectRatio={Boolean(previewUrl)} isVisible={selected} />
      {studioTouched ? <FoldderStudioTouchedMark nodeType="inspiration" /> : null}
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
          <div className="inspiration-node-empty-actions relative z-10 mt-auto flex flex-col gap-2 px-3 pb-3 pt-2">
            <p className="foldder-frameless-chip min-h-[26px] text-[9px] leading-snug text-white/80">
              {nodeData.error || statusMessage(status, hasInput)}
            </p>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                openStudio();
              }}
              className="foldder-frameless-action nodrag flex w-full items-center justify-center gap-2 px-3 py-2.5 text-[10px] font-black uppercase tracking-widest text-emerald-950 transition hover:bg-white"
            >
              <Search size={13} />
              Find references
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                openStudio({ expandDirectLink: true });
              }}
              className="inspiration-node-link-action nodrag flex w-full items-center justify-center gap-1.5 px-3 py-2 text-[9px] font-black uppercase tracking-[0.12em] transition"
            >
              <Link2 size={11} aria-hidden />
              Already have a link?
            </button>
          </div>
        </div>
      ) : (
        <div className="node-content foldder-frameless-main relative flex min-h-0 flex-1 flex-col overflow-hidden">
          <div ref={previewFrameRef} className="relative h-full w-full overflow-hidden bg-slate-950/70">
            {originLabel ? (
              <span className="absolute left-2 top-2 z-10 bg-black/58 px-2 py-1 text-[8px] font-black uppercase tracking-[0.08em] text-white/82 backdrop-blur-sm">
                {originLabel}
              </span>
            ) : null}
            {outputUrl ? (
              <img src={inspirationCanvasUrl ?? outputUrl} alt="" className="h-full w-full object-contain" draggable={false} decoding="async" />
            ) : selectedRef ? (
              <img
                src={selectedRef.thumbUrl || selectedRef.imageUrl}
                alt=""
                className="h-full w-full object-contain opacity-90"
                draggable={false}
              />
            ) : null}
          </div>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              openStudio();
            }}
            className="foldder-frameless-action nodrag absolute bottom-3 right-3 z-10 flex items-center gap-1.5 rounded-none bg-black/55 px-2.5 py-1.5 text-[9px] font-black uppercase tracking-[0.1em] text-white/90 opacity-0 transition hover:bg-black/70 group-hover/node:opacity-100 focus-visible:opacity-100"
          >
            <Sparkles size={12} />
            Change reference
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
          expandDirectLink={studioExpandDirectLink}
          onClose={closeStudio}
          onPatch={patchData}
        />
      ) : null}
    </div>
  );
});
