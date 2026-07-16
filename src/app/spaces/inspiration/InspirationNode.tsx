"use client";

/* eslint-disable @next/next/no-img-element */

import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  NodeProps,
  NodeResizer,
  useEdges,
  useNodes,
  useReactFlow,
  useUpdateNodeInternals,
  type Node,
} from "@xyflow/react";
import {
  Check,
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
import { useCanvasNodeMediaPreviewUrl } from "../hooks/use-authed-media-preview-url";
import { readJsonWithHttpError } from "@/lib/read-response-json";
import { resolvePromptValueFromEdgeSource } from "../canvas-group-logic";
import { getNodeGridFrameForType, growCanvasDimensionToGrid } from "../canvas-grid-layout";
import {
  FoldderNodeContentDock,
  FoldderNodeContentDockActions,
  FoldderNodeContentDockMain,
  FoldderNodeContentMeta,
  FoldderNodeContentMetaRow,
  FoldderStudioModeCenterButton,
} from "../foldder-node-ui";
import {
  loadImageDimensions,
  nodeFrameNeedsSync,
  resolveAspectLockedNodeFrame,
  resolveNodeChromeHeight,
  resolveNodeFrameWidth,
} from "../studio-node-aspect";
import { StudioCanvasNodeShell, type StudioCanvasNodeHandleSpec } from "../studio-node/studio-canvas-node";
import { StudioNodePortal } from "../studio-node/studio-node-architecture";
import {
  FoldderStudioHeader,
} from "../FoldderStudioHeader";
import {
  hasFoldderStudioTouched,
  touchStudioNodeData,
} from "../studio-node/foldder-studio-touched";
import {
  buildInspirationFeed,
  feedHasAnyResults,
  INSPIRATION_PROVIDERS,
  inspirationFeedKey,
  isFeedLoading,
  type InspirationFeedEntry,
  type InspirationInputKind,
} from "./inspiration-feed";
import {
  ensureInspirationFeed,
  getInspirationFeedEntry,
  subscribeInspirationFeed,
} from "./inspiration-feed-cache";
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
  /** Feed unificado: fuentes activas (toggles), filtro de calidad y última consulta resuelta. */
  inspirationSources?: InspirationProvider[];
  inspirationQualityOnly?: boolean;
  lastQuery?: string;
  lastInputKind?: InspirationInputKind;
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

const INSPIRATION_EMPTY_BACKGROUND_SRC = "/assets/nodes/inspiration-empty-green.png";
const INSPIRATION_ACCENT = "#0ac38a";
const INSPIRATION_DOCK_MIN_CHROME = 180;
const INSPIRATION_CONNECTED_PREVIEW_MIN = 140;
const INSPIRATION_NODE_MAX_HEIGHT = 1400;

function resolveInspirationNodeHeight(args: { baseHeight: number; hasDock: boolean }): number {
  if (!args.hasDock) return args.baseHeight;
  return Math.min(
    INSPIRATION_NODE_MAX_HEIGHT,
    growCanvasDimensionToGrid(Math.max(args.baseHeight, INSPIRATION_CONNECTED_PREVIEW_MIN + INSPIRATION_DOCK_MIN_CHROME)),
  );
}

function mapInspirationStatusLabel(status: InspirationStatus, isEmpty: boolean, isSearching: boolean): string {
  if (isEmpty) return "Vacío";
  if (isSearching) return "Buscando…";
  if (status === "error") return "Error";
  if (status === "output" || status === "selected") return "Listo";
  if (status === "results") return "Resultados";
  if (status === "ready") return "Conectado";
  return "—";
}

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
  chromeHeight = 0,
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
    minWidth: chromeHeight > 0 ? 260 : 200,
    maxWidth: 960,
    minHeight: 120,
    maxHeight: INSPIRATION_NODE_MAX_HEIGHT,
    chromeHeight,
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

/** Re-render reactivo cuando cambia el feed cacheado de una clave. */
function useInspirationFeedEntry(key: string): InspirationFeedEntry | undefined {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    if (!key) return;
    return subscribeInspirationFeed(key, force);
  }, [key]);
  return key ? getInspirationFeedEntry(key) : undefined;
}

const PROVIDER_LABEL: Record<InspirationProvider, string> = {
  pexels: "Pexels",
  unsplash: "Unsplash",
  arena: "Are.na",
};

function InspirationStudio({
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
  const selected = data.selected ?? null;
  const [manualPrompt, setManualPrompt] = useState(data.manualPrompt ?? "");
  const [directLinkExpanded, setDirectLinkExpanded] = useState(Boolean(expandDirectLink));
  const [directUrl, setDirectUrl] = useState(
    data.referenceSource === "direct" && typeof data.value === "string" ? data.value : "",
  );
  const [directLinkError, setDirectLinkError] = useState<string | null>(null);
  const [describeBusy, setDescribeBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const effectiveImageInput =
    imageInput || (looksLikeImageUrl(directUrl) ? directUrl.trim() : "");
  const imageIntentCacheRef = useRef<{ imageUrl: string; intent: string } | null>(
    data.imageIntent && data.imageIntentSource
      ? { imageUrl: data.imageIntentSource, intent: data.imageIntent }
      : null,
  );
  const imageIntentPromiseRef = useRef<{ imageUrl: string; promise: Promise<string> } | null>(null);

  const hasAnyInput = Boolean(promptInput || effectiveImageInput || manualPrompt.trim());

  // --- Feed unificado (las 3 librerías juntas, cacheado) ---
  const [activeFacet, setActiveFacet] = useState<InspirationFacet>(data.facet ?? "similar");
  const [activeInputKind, setActiveInputKind] = useState<InspirationInputKind>(
    data.lastInputKind ?? (promptInput ? "prompt" : "prompt"),
  );
  const [activeQuery, setActiveQuery] = useState<string>(() => {
    if (typeof data.lastQuery === "string" && data.lastQuery.trim()) return data.lastQuery.trim();
    return (promptInput || (data.manualPrompt ?? "")).trim();
  });

  const enabledProviders = useMemo<InspirationProvider[]>(() => {
    const raw = Array.isArray(data.inspirationSources)
      ? data.inspirationSources.filter((p): p is InspirationProvider =>
          INSPIRATION_PROVIDERS.includes(p),
        )
      : null;
    return raw && raw.length > 0 ? raw : [...INSPIRATION_PROVIDERS];
  }, [data.inspirationSources]);
  const qualityOnly = data.inspirationQualityOnly !== false;

  const feedKey = useMemo(
    () =>
      activeQuery
        ? inspirationFeedKey({ query: activeQuery, facet: activeFacet, inputKind: activeInputKind })
        : "",
    [activeQuery, activeFacet, activeInputKind],
  );
  const feedEntry = useInspirationFeedEntry(feedKey);
  const feed = useMemo(
    () => buildInspirationFeed(feedEntry, { providers: enabledProviders, qualityOnly }),
    [feedEntry, enabledProviders, qualityOnly],
  );
  const feedLoading = isFeedLoading(feedEntry, enabledProviders);
  const busy = describeBusy || feedLoading;

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
    async (nextFacet: InspirationFacet = activeFacet, force = false) => {
      if (!hasAnyInput) return;
      setLocalError(null);
      setDescribeBusy(true);
      try {
        const visualIntent = await describeImageIfNeeded();
        const kind: InspirationInputKind = promptInput || manualPrompt.trim() ? "prompt" : "image";
        const query = (promptInput || manualPrompt || visualIntent).trim();
        if (!query) {
          setLocalError("Escribe una idea o conecta una imagen para buscar.");
          return;
        }
        setActiveFacet(nextFacet);
        setActiveInputKind(kind);
        setActiveQuery(query);
        onPatch({
          facet: nextFacet,
          manualPrompt,
          lastQuery: query,
          lastInputKind: kind,
          status: "results",
          error: undefined,
          notice: undefined,
        });
        const key = inspirationFeedKey({ query, facet: nextFacet, inputKind: kind });
        ensureInspirationFeed({
          key,
          query,
          facet: nextFacet,
          inputKind: kind,
          providers: enabledProviders,
          force,
        });
      } catch (error) {
        console.error("[InspirationStudio]", error);
        setLocalError(error instanceof Error ? error.message : "No se pudo buscar.");
      } finally {
        setDescribeBusy(false);
      }
    },
    [activeFacet, describeImageIfNeeded, enabledProviders, hasAnyInput, manualPrompt, onPatch, promptInput],
  );

  // Al abrir con una consulta previa pero sin feed cacheado (p. ej. otro navegador), recárgalo.
  useEffect(() => {
    if (!feedKey || !activeQuery) return;
    const existing = getInspirationFeedEntry(feedKey);
    if (!feedHasAnyResults(existing)) {
      ensureInspirationFeed({
        key: feedKey,
        query: activeQuery,
        facet: activeFacet,
        inputKind: activeInputKind,
        providers: enabledProviders,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedKey]);

  const toggleProvider = useCallback(
    (provider: InspirationProvider) => {
      const set = new Set(enabledProviders);
      if (set.has(provider)) {
        if (set.size <= 1) return; // siempre al menos una fuente activa
        set.delete(provider);
      } else {
        set.add(provider);
      }
      const next = INSPIRATION_PROVIDERS.filter((p) => set.has(p));
      onPatch({ inspirationSources: next });
      if (set.has(provider) && feedKey && activeQuery) {
        ensureInspirationFeed({
          key: feedKey,
          query: activeQuery,
          facet: activeFacet,
          inputKind: activeInputKind,
          providers: [provider],
        });
      }
    },
    [activeFacet, activeInputKind, activeQuery, enabledProviders, feedKey, onPatch],
  );

  const selectResult = useCallback(
    (result: InspirationResult) => {
      onPatch({
        value: result.imageUrl,
        type: "image",
        selected: result,
        referenceSource: "stock",
        status: "output",
        facet: activeFacet,
        provider: result.source === "Unsplash" ? "unsplash" : result.source === "Are.na" ? "arena" : "pexels",
        error: undefined,
        notice: undefined,
      });
      onClose();
    },
    [activeFacet, onClose, onPatch],
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

  const loadingSourceCount = enabledProviders.filter(
    (p) => feedEntry?.sourceState[p] === "loading",
  ).length;
  const sourceErrors = enabledProviders
    .map((p) => (feedEntry?.sourceState[p] === "error" ? PROVIDER_LABEL[p] : null))
    .filter((x): x is string => Boolean(x));

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
                  const active = activeFacet === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      title={item.en}
                      onClick={() => void runSearch(item.id)}
                      disabled={describeBusy || !hasAnyInput}
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
            <>
            {/* Barra de fuentes (toggles no exclusivos) + calidad + contador */}
            <div className="flex h-11 shrink-0 items-center gap-2 border-b border-white/10 bg-white/[0.04] px-3">
              <span className="text-[8px] font-black uppercase tracking-[0.14em] text-white/35">Fuentes</span>
              <div className="flex items-center gap-1.5">
                {INSPIRATION_PROVIDERS.map((provider) => {
                  const on = enabledProviders.includes(provider);
                  const loadingSrc = feedEntry?.sourceState[provider] === "loading";
                  return (
                    <button
                      key={provider}
                      type="button"
                      onClick={() => toggleProvider(provider)}
                      className={`inspiration-source-chip flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.06em] transition ${
                        on
                          ? "bg-white text-slate-950"
                          : "bg-white/[0.06] text-white/45 hover:bg-white/[0.12] hover:text-white/80"
                      }`}
                    >
                      {loadingSrc ? (
                        <Loader2 size={11} className="animate-spin" aria-hidden />
                      ) : on ? (
                        <Check size={11} aria-hidden />
                      ) : null}
                      {PROVIDER_LABEL[provider]}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => onPatch({ inspirationQualityOnly: !qualityOnly })}
                title="Filtra fotos pequeñas o con proporciones extremas"
                className={`ml-1 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.06em] transition ${
                  qualityOnly
                    ? "bg-emerald-400/25 text-emerald-50"
                    : "bg-white/[0.06] text-white/45 hover:bg-white/[0.12] hover:text-white/80"
                }`}
              >
                <Sparkles size={11} aria-hidden />
                Solo las mejores
              </button>
              <div className="ml-auto flex items-center gap-2">
                {loadingSourceCount > 0 ? (
                  <span className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.06em] text-emerald-200/80">
                    <Loader2 size={11} className="animate-spin" aria-hidden />
                    Cargando…
                  </span>
                ) : null}
                <p className="truncate text-[9px] font-semibold uppercase tracking-[0.06em] text-white/35">
                  {feed.length > 0 ? `${feed.length} refs` : activeQuery ? "Sin resultados" : "Busca para empezar"}
                </p>
              </div>
            </div>

            {(localError || sourceErrors.length > 0) && (
              <div className="shrink-0 border-b border-white/8">
                {localError ? (
                  <div className="flex items-center gap-2 bg-rose-500/15 px-3 py-1.5 text-[10px] font-semibold text-rose-100">
                    {localError}
                  </div>
                ) : null}
                {sourceErrors.length > 0 ? (
                  <div className="flex items-center gap-2 bg-amber-400/12 px-3 py-1.5 text-[10px] font-semibold text-amber-100">
                    No se pudo cargar: {sourceErrors.join(", ")}
                  </div>
                ) : null}
              </div>
            )}

            <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-2">
              {feed.length === 0 && !feedLoading ? (
                <div className="flex h-full min-h-[320px] flex-col items-center justify-center px-6 text-center">
                  <Compass size={28} className="mb-3 text-[#0ac38a]/85" />
                  <p className="text-[13px] font-black uppercase tracking-[0.08em] text-white/82">
                    {activeQuery ? "Sin referencias" : "Empieza con una idea o imagen"}
                  </p>
                  <p className="mt-2 max-w-[340px] text-[10px] leading-relaxed text-white/48">
                    {activeQuery
                      ? "Prueba otra faceta, activa más fuentes o desactiva “Solo las mejores”."
                      : "Elige una faceta y pulsa Buscar referencias en la barra inferior. Saldrán Pexels, Unsplash y Are.na juntas."}
                  </p>
                </div>
              ) : (
                <div className="inspiration-masonry columns-2 gap-2 sm:columns-3 lg:columns-4 xl:columns-5 [&>*]:mb-2">
                  {feed.map((result) => {
                    const active = selected?.id === result.id;
                    const ratio =
                      result.width && result.height ? `${result.width} / ${result.height}` : undefined;
                    return (
                      <button
                        key={result.id}
                        type="button"
                        onClick={() => selectResult(result)}
                        style={ratio ? { aspectRatio: ratio } : undefined}
                        className={`group relative block w-full break-inside-avoid overflow-hidden rounded-md bg-black/60 text-left transition hover:brightness-110 ${
                          active ? "ring-2 ring-emerald-400 brightness-110" : "ring-1 ring-white/8"
                        }`}
                      >
                        <img
                          src={result.thumbUrl || result.imageUrl}
                          alt={result.title || "Inspiration reference"}
                          className="block h-auto w-full object-cover"
                          loading="lazy"
                          decoding="async"
                        />
                        <span className="absolute left-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[7px] font-black uppercase tracking-[0.1em] text-white/75 backdrop-blur-sm">
                          {result.source}
                        </span>
                        {active ? (
                          <span className="absolute right-1.5 top-1.5 rounded bg-emerald-500 px-1.5 py-0.5 text-[7px] font-black uppercase tracking-[0.1em] text-emerald-950">
                            ✓
                          </span>
                        ) : null}
                        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 bg-gradient-to-t from-black/85 to-transparent px-2 pb-2 pt-5 opacity-0 transition group-hover:opacity-100">
                          <p className="truncate text-[10px] text-white/85">{result.author || result.title || "Reference"}</p>
                          <span className="inline-flex w-fit bg-white px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.08em] text-slate-950">
                            Usar imagen
                          </span>
                        </div>
                      </button>
                    );
                  })}
                  {feedLoading
                    ? Array.from({ length: 6 }).map((_, i) => (
                        <div
                          key={`skeleton-${i}`}
                          className="mb-2 w-full animate-pulse break-inside-avoid rounded-md bg-white/[0.06]"
                          style={{ aspectRatio: i % 2 === 0 ? "3 / 4" : "4 / 3" }}
                        />
                      ))
                    : null}
                </div>
              )}
            </div>
            </>
          </section>
        </div>

        <footer className="inspiration-studio-dock" data-foldder-inspiration-dock>
          <div className="inspiration-studio-dock__row">
            <button
              type="button"
              title="Search references"
              onClick={() => void runSearch(activeFacet, true)}
              disabled={busy || !hasAnyInput}
              className="inspiration-studio-dock__search nodrag"
            >
              {busy ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Search size={15} aria-hidden />}
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
  const promptConnected = Boolean(promptEdge);
  const imageConnected = Boolean(imageEdge);
  const hasConnections = promptConnected || imageConnected;
  const hasDock = hasConnections;
  const isEmpty = !hasConnections;
  const hasPreviewVisual = hasConnections && !showInspirationEmpty;
  const connectedOnly = hasConnections && showInspirationEmpty;
  const showExteriorTile = hasDock;
  const isSearching = status === "searching";

  const inspirationHandles = useMemo((): StudioCanvasNodeHandleSpec[] => [
    {
      side: "left",
      top: "31%",
      type: "target",
      id: "prompt",
      dataType: "prompt",
      label: promptConnected ? "✓ Prompt" : "Prompt",
      labelStyle: promptConnected ? { color: "#3a8f96" } : undefined,
    },
    {
      side: "left",
      top: "50%",
      type: "target",
      id: "image",
      dataType: "image",
      label: imageConnected ? "✓ Image" : "Image",
      labelStyle: imageConnected ? { color: "#f59e0b" } : undefined,
    },
    {
      side: "right",
      top: "50%",
      type: "source",
      id: "image",
      dataType: "image",
      label: "Image",
    },
  ], [imageConnected, promptConnected]);

  const headerTitle = nodeData.label?.trim() || "Inspiration";
  const facetLabel = FACETS.find((item) => item.id === nodeData.facet)?.en ?? "—";
  const providerLabel =
    PROVIDERS.find((item) => item.id === nodeData.provider)?.label ??
    (nodeData.inspirationSources?.length
      ? nodeData.inspirationSources.map((source) => PROVIDERS.find((item) => item.id === source)?.label ?? source).join(" · ")
      : "—");
  const inputsLabel = useMemo(() => {
    const parts: string[] = [];
    if (promptConnected) parts.push("Prompt");
    if (imageConnected) parts.push("Image");
    return parts.length > 0 ? parts.join(" · ") : "—";
  }, [imageConnected, promptConnected]);
  const referenceLabel = originLabel ?? "—";
  const statusLabel = mapInspirationStatusLabel(status, isEmpty, isSearching);
  const previewLine = isEmpty
    ? "Conecta Prompt o Image y abre Studio."
    : isSearching
      ? "Buscando referencias visuales…"
      : nodeData.error
        ? nodeData.error
        : hasPreviewVisual
          ? referenceLabel !== "—"
            ? referenceLabel
            : "Referencia lista para el pipeline."
          : statusMessage(status, hasInput);

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
    const baseFrame = getNodeGridFrameForType("inspiration");
    if (!baseFrame) return;

    if (hasPreviewVisual && previewUrl && previewImageWidth && previewImageHeight) {
      const syncKey = `${inspirationFrameSyncKey(previewUrl, previewImageWidth, previewImageHeight)}:${hasDock ? "dock" : "preview-only"}`;
      if (frameSyncKeyRef.current === syncKey) return;

      const chromeHeight = resolveNodeChromeHeight(frameRef.current, previewFrameRef.current);
      let didSync = false;
      setNodes((nds) => {
        const result = syncInspirationNodeFrame(nds, id, previewImageWidth, previewImageHeight, chromeHeight);
        didSync = result.didSync;
        return result.nodes;
      });

      frameSyncKeyRef.current = syncKey;
      if (didSync) {
        scheduleInspirationNodeInternalsRefresh(id, updateNodeInternals);
      }
      return;
    }

    if (isEmpty) {
      const syncKey = "inspiration-base";
      if (frameSyncKeyRef.current === syncKey) return;
      frameSyncKeyRef.current = syncKey;
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id !== id) return node;
          if (!nodeFrameNeedsSync(node, baseFrame)) return node;
          return {
            ...node,
            width: baseFrame.width,
            height: baseFrame.height,
            measured: { width: baseFrame.width, height: baseFrame.height },
            style: { ...(node.style as React.CSSProperties), width: baseFrame.width, height: baseFrame.height, minHeight: baseFrame.height },
          };
        }),
      );
      scheduleInspirationNodeInternalsRefresh(id, updateNodeInternals);
      return;
    }

    if (!hasDock) return;

    const measuredHeight = resolveInspirationNodeHeight({ baseHeight: baseFrame.height, hasDock: true });
    const syncKey = `inspiration-content:${hasPreviewVisual ? "preview" : "meta"}:${measuredHeight}:${status}`;
    if (frameSyncKeyRef.current === syncKey) return;

    frameSyncKeyRef.current = syncKey;
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id !== id) return node;
        const resolvedWidth = resolveNodeFrameWidth(node, Math.max(baseFrame.width, 260));
        const resolvedTarget = { width: resolvedWidth, height: measuredHeight };
        if (!nodeFrameNeedsSync(node, resolvedTarget)) return node;
        return {
          ...node,
          width: resolvedWidth,
          height: measuredHeight,
          measured: { width: resolvedWidth, height: measuredHeight },
          style: {
            ...(node.style as React.CSSProperties),
            width: resolvedWidth,
            height: measuredHeight,
            minHeight: measuredHeight,
            maxHeight: INSPIRATION_NODE_MAX_HEIGHT,
          },
        };
      }),
    );
    scheduleInspirationNodeInternalsRefresh(id, updateNodeInternals);
  }, [
    hasDock,
    hasPreviewVisual,
    id,
    isEmpty,
    previewImageHeight,
    previewImageWidth,
    previewUrl,
    setNodes,
    status,
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
    <StudioCanvasNodeShell
      ref={frameRef}
      nodeId={id}
      nodeType="inspiration"
      selected={selected}
      label={nodeData.label}
      defaultLabel="Inspiration"
      title="INSPIRATION"
      introActive={!!nodeData._foldderCanvasIntro}
      studioTouched={showExteriorTile && studioTouched}
      exteriorTileMark={showExteriorTile}
      minWidth={hasConnections ? 260 : 200}
      handles={inspirationHandles}
      variant="frameless"
      material="media"
      className={`inspiration-node foldder-frameless-label-dark${isEmpty ? " inspiration-node--empty" : hasConnections ? " inspiration-node--has-content" : ""}${hasPreviewVisual ? " inspiration-node--has-preview" : ""}${connectedOnly ? " inspiration-node--connected-only" : ""}${hasConnections ? " inspiration-node--connected" : ""}${status === "error" ? " foldder-node--error" : ""}${isSearching ? " node-glow-running" : ""}`}
      style={
        {
          width: "100%",
          height: "100%",
          minWidth: hasConnections ? 260 : 200,
          minHeight: hasConnections ? INSPIRATION_DOCK_MIN_CHROME + INSPIRATION_CONNECTED_PREVIEW_MIN : 300,
          "--foldder-node-card-bg": INSPIRATION_ACCENT,
          "--foldder-frameless-glass-bg": INSPIRATION_ACCENT,
          "--foldder-frameless-accent": "#86efac",
        } as React.CSSProperties
      }
    >
      <NodeResizer
        minWidth={200}
        minHeight={120}
        maxWidth={960}
        maxHeight={INSPIRATION_NODE_MAX_HEIGHT}
        keepAspectRatio={hasPreviewVisual}
        isVisible={selected}
      />

      <div
        className={`node-content foldder-frameless-main inspiration-node-main${hasDock ? " foldder-node-content-main--with-dock" : ""}`}
      >
        <div
          ref={previewFrameRef}
          className="inspiration-node-preview-area foldder-node-content-preview-area group/inspiration"
        >
          {hasPreviewVisual ? (
            <>
              {outputUrl ? (
                <img
                  src={inspirationCanvasUrl ?? outputUrl}
                  alt=""
                  className="inspiration-node-preview-img"
                  draggable={false}
                  decoding="async"
                />
              ) : selectedRef ? (
                <img
                  src={selectedRef.thumbUrl || selectedRef.imageUrl}
                  alt=""
                  className="inspiration-node-preview-img inspiration-node-preview-img--selected"
                  draggable={false}
                />
              ) : null}
            </>
          ) : (
            <img
              src={INSPIRATION_EMPTY_BACKGROUND_SRC}
              alt=""
              className="inspiration-node-bg"
              draggable={false}
            />
          )}

          {isEmpty ? (
            <>
              <div className="inspiration-node-empty-hint" aria-hidden>
                <span className="inspiration-node-empty-hint__title">Inspiration vacío</span>
                <span className="inspiration-node-empty-hint__body">
                  Conecta Prompt o Image y abre Studio.
                </span>
              </div>
              <FoldderStudioModeCenterButton
                label="Empezar"
                title="Abrir Inspiration Studio"
                onClick={() => openStudio()}
              />
            </>
          ) : null}

          {isSearching ? (
            <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-[50]">
              <p className="bg-black/80 px-2 py-1 text-center text-[7px] font-black uppercase tracking-widest text-white/95 backdrop-blur-sm">
                Buscando referencias…
              </p>
            </div>
          ) : null}
        </div>

        {hasDock ? (
          <div className="inspiration-node-dock-wrap shrink-0">
            <FoldderNodeContentDock allowNodeDrag>
              <FoldderNodeContentDockMain>
                <p className="foldder-node-content-dock-text">{headerTitle}</p>
                <p className="foldder-node-content-dock-text foldder-node-content-dock-text--placeholder">
                  {previewLine}
                </p>
                <FoldderNodeContentMeta>
                  <FoldderNodeContentMetaRow label="Facet" value={facetLabel} />
                  <FoldderNodeContentMetaRow label="Fuente" value={providerLabel} />
                  <FoldderNodeContentMetaRow label="Referencia" value={referenceLabel} />
                  <FoldderNodeContentMetaRow label="Entradas" value={inputsLabel} />
                  <FoldderNodeContentMetaRow label="Estado" value={statusLabel} variant="status" />
                </FoldderNodeContentMeta>
              </FoldderNodeContentDockMain>
              <FoldderNodeContentDockActions className="inspiration-node-dock-actions">
                <FoldderStudioModeCenterButton
                  variant="dock"
                  label="Abrir Studio"
                  title="Abrir Inspiration Studio"
                  onClick={() => openStudio()}
                />
              </FoldderNodeContentDockActions>
            </FoldderNodeContentDock>
          </div>
        ) : null}
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
    </StudioCanvasNodeShell>
  );
});
