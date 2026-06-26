"use client";

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NodeResizer, Position, useEdges, useReactFlow, useStore, useUpdateNodeInternals, type Edge, type Node, type NodeProps, type ReactFlowState } from "@xyflow/react";
import { shallow } from "zustand/shallow";
import { Clipboard, Download, File, Layers, Music, Search, X } from "lucide-react";

import { downloadS3Object, forceDownloadUrl, sanitizeDownloadFilename } from "@/lib/browser-download";
import { tryExtractKnowledgeFilesKeyFromUrl } from "@/lib/s3-media-hydrate";

import { FoldderDataHandle } from "./FoldderDataHandle";
import { NodeLabel, FoldderNodeHeaderTitle } from "./foldder-node-ui";
import { NodeIcon } from "./foldder-icons";
import { FoldderStudioHeader } from "./FoldderStudioHeader";
import {
  buildMediaListManifest,
  EXPORT_MULTIMEDIA_MEDIA_LIST_HANDLES,
  exportMultimediaTargetHandleSortKey,
  getDesignerExportMeta,
  isMediaListItemDownloadable,
  mergeMediaListOutputs,
  readMediaListFromNode,
} from "./media-list-consumers";
import { buildDatasetMediaListOutput } from "./dataset/dataset-media-list";
import {
  selectConnectedDatasetSource,
  useDesignerConnectedDataset,
} from "./designer/use-designer-connected-dataset";
import { mediaListDownloadFilename, downloadMediaListImageUrl, mediaListImageLikelyHasTransparency } from "./media-list-download";
import { normalizeExportMultimediaTargetHandle } from "./connection-utils";
import type { MediaListItem, MediaListOutput } from "./media-list-output";
import type { DesignerPageState } from "./designer/DesignerNode";
import { useFoldderRenderMetric } from "./use-performance-metrics";

const MEDIA_LIST_URL_TTL_MS = 50 * 60 * 1000;
const mediaListPresignedUrlCache = new globalThis.Map<string, { url: string; expiresAt: number }>();
const mediaListPresignInFlight = new globalThis.Map<string, Promise<string | null>>();

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function resolveMediaListS3Key(item: MediaListItem): string | undefined {
  const direct = typeof item.s3Key === "string" && item.s3Key.trim() ? item.s3Key.trim() : "";
  if (direct) return direct;
  const src = item.url || item.assetId || "";
  return tryExtractKnowledgeFilesKeyFromUrl(src) || undefined;
}

async function presignMediaListS3Key(key: string): Promise<string | null> {
  const cached = mediaListPresignedUrlCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.url;
  const pending = mediaListPresignInFlight.get(key);
  if (pending) return pending;
  const promise = (async () => {
    try {
      const res = await fetch("/api/spaces/s3-presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keys: [key] }),
      });
      if (!res.ok) return null;
      const payload = (await res.json()) as { urls?: Record<string, string> };
      const url = payload.urls?.[key];
      if (!url) return null;
      mediaListPresignedUrlCache.set(key, { url, expiresAt: Date.now() + MEDIA_LIST_URL_TTL_MS });
      return url;
    } catch {
      return null;
    } finally {
      mediaListPresignInFlight.delete(key);
    }
  })();
  mediaListPresignInFlight.set(key, promise);
  return promise;
}

function useMediaListItemUrl(item: MediaListItem | undefined): string | undefined {
  const [resolved, setResolved] = useState<{ cacheKey: string; url: string } | null>(null);
  const src = item?.url || item?.assetId;
  const key = item ? resolveMediaListS3Key(item) : undefined;
  const cacheKey = `${src || ""}\u0001${key || ""}`;
  useEffect(() => {
    let cancelled = false;
    if (!key) return () => {
      cancelled = true;
    };
    void (async () => {
      const fresh = await presignMediaListS3Key(key);
      if (!cancelled && fresh) setResolved({ cacheKey, url: fresh });
    })();
    return () => {
      cancelled = true;
    };
  }, [cacheKey, key]);
  return key ? (resolved?.cacheKey === cacheKey ? resolved.url : undefined) : src;
}

type ConnectedMediaListSourceSnapshot = {
  sourceId: string;
  sourceType?: string;
  sourceData?: unknown;
  targetHandle?: string | null;
};

function isExportMultimediaMediaListEdge(edge: Edge, nodeId: string): boolean {
  if (edge.target !== nodeId) return false;
  const h = edge.targetHandle;
  if (h === "dataset") return false;
  if (!h || h === "media_list") return true;
  return (EXPORT_MULTIMEDIA_MEDIA_LIST_HANDLES as readonly string[]).includes(h);
}

function exportMultimediaEdgeSlotKey(handle: string | null | undefined): string {
  return normalizeExportMultimediaTargetHandle(handle);
}

function selectConnectedMediaListSources(
  state: ReactFlowState<Node, Edge>,
  nodeId: string,
): ConnectedMediaListSourceSnapshot[] {
  const out: ConnectedMediaListSourceSnapshot[] = [];
  const seenSourceIds = new Set<string>();
  for (const edge of state.edges
    .filter((item) => isExportMultimediaMediaListEdge(item, nodeId))
    .sort((a, b) => exportMultimediaTargetHandleSortKey(exportMultimediaEdgeSlotKey(a.targetHandle)) - exportMultimediaTargetHandleSortKey(exportMultimediaEdgeSlotKey(b.targetHandle)))) {
    const sourceNode = state.nodeLookup.get(edge.source);
    if (!sourceNode) continue;
    if (sourceNode.type === "dataset") continue;
    if (seenSourceIds.has(sourceNode.id)) continue;
    seenSourceIds.add(sourceNode.id);
    out.push({
      sourceId: sourceNode.id,
      sourceType: sourceNode.type,
      sourceData: sourceNode.data,
      targetHandle: edge.targetHandle,
    });
  }
  return out;
}

type ExportMultimediaNodeData = {
  label?: string;
  /** Listado concreto del Dataset; vacío = todos los listados. */
  datasetListId?: string | null;
  _foldderCanvasIntro?: boolean;
};

function useConnectedMediaListSources(nodeId: string): MediaListOutput | null {
  const sources = useStore(
    useCallback((state: ReactFlowState<Node, Edge>) => selectConnectedMediaListSources(state, nodeId), [nodeId]),
    shallow,
  );
  return useMemo(() => {
    const outputs = sources
      .map((source) =>
        readMediaListFromNode({
          id: source.sourceId,
          type: source.sourceType,
          data: source.sourceData,
        } as Node),
      )
      .filter((v): v is MediaListOutput => Boolean(v));
    return mergeMediaListOutputs(outputs);
  }, [sources]);
}

function useExportMultimediaOutput(
  nodeId: string,
  datasetListId: string | null | undefined,
): { output: MediaListOutput | null; datasetConnected: boolean; datasetLoading: boolean } {
  const mediaListOutput = useConnectedMediaListSources(nodeId);
  const datasetSource = useStore(
    useCallback((state: ReactFlowState<Node, Edge>) => selectConnectedDatasetSource(state, nodeId), [nodeId]),
    shallow,
  );
  const { connectedDataset, datasetConnected, datasetLoading } = useDesignerConnectedDataset(nodeId);

  const output = useMemo(() => {
    const parts: MediaListOutput[] = [];
    if (mediaListOutput) parts.push(mediaListOutput);
    if (connectedDataset && datasetSource) {
      const fromDataset = buildDatasetMediaListOutput({
        dataset: connectedDataset,
        sourceNodeId: datasetSource.sourceNodeId,
        listId: datasetListId ?? null,
        title: connectedDataset.name,
      });
      if (fromDataset) parts.push(fromDataset);
    }
    return mergeMediaListOutputs(parts);
  }, [mediaListOutput, connectedDataset, datasetSource, datasetListId]);

  return { output, datasetConnected, datasetLoading };
}

/** Páginas de cada Designer conectado (nodeId → pages) para export full-res bajo demanda. */
function useConnectedDesignerPagesByNode(nodeId: string): Record<string, DesignerPageState[]> {
  return useStore(
    useCallback((state: ReactFlowState<Node, Edge>) => {
      const map: Record<string, DesignerPageState[]> = {};
      for (const source of selectConnectedMediaListSources(state, nodeId)) {
        if (source.sourceType !== "designer") continue;
        const pages = (source.sourceData as { pages?: unknown } | undefined)?.pages;
        if (Array.isArray(pages) && pages.length > 0) {
          map[source.sourceId] = pages as DesignerPageState[];
        }
      }
      return map;
    }, [nodeId]),
    shallow,
  );
}

async function resolveMediaListItemDownloadUrl(item: MediaListItem): Promise<string | null> {
  if (!isMediaListItemDownloadable(item)) return null;
  const key = resolveMediaListS3Key(item);
  if (key) return presignMediaListS3Key(key);
  const direct = item.url || item.assetId;
  return direct && !direct.startsWith("asset://") ? direct : null;
}

function mediaListStats(output: MediaListOutput | null) {
  const items = output?.items ?? [];
  return {
    total: items.length,
    videos: items.filter((item) => item.mediaType === "video").length,
    images: items.filter((item) => item.mediaType === "image").length,
    audio: items.filter((item) => item.mediaType === "audio").length,
    files: items.filter((item) => item.mediaType === "document" || item.mediaType === "file").length,
    pending: items.filter((item) => item.mediaType === "placeholder" || item.status === "missing" || item.status === "pending").length,
    downloadable: items.filter(isMediaListItemDownloadable).length,
    videoDuration: items.filter((item) => item.mediaType === "video").reduce((sum, item) => sum + (item.durationSeconds ?? 0), 0),
  };
}

function mediaListItemAspectRatio(item: MediaListItem): number {
  if (item.width && item.height && item.width > 0 && item.height > 0) {
    return item.width / item.height;
  }
  const raw = item.aspectRatio ?? item.metadata?.visualDirection?.aspectRatio;
  if (raw) {
    const parts = raw.replace("/", ":").split(":").map((part) => Number(part.trim()));
    if (parts.length === 2 && parts[0] > 0 && parts[1] > 0) return parts[0] / parts[1];
  }
  if (item.mediaType === "image" || item.mediaType === "video") return 16 / 9;
  return 1;
}

function MediaThumb({ item, compact = false }: { item: MediaListItem; compact?: boolean }) {
  const url = useMediaListItemUrl(item);
  const isPlaceholder = item.mediaType === "placeholder" || !url;
  const ratio = mediaListItemAspectRatio(item);

  const mediaContent = isPlaceholder ? (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-black/40 to-black/20 text-white/40">
      <Layers size={compact ? 16 : 24} />
    </div>
  ) : item.mediaType === "video" ? (
    <video className="h-full w-full object-contain" src={url} muted playsInline preload="metadata" />
  ) : item.mediaType === "image" ? (
    <div
      className={mediaListImageLikelyHasTransparency(item) ? "media-list-thumb-checker h-full w-full" : "h-full w-full"}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="h-full w-full object-contain" src={url} alt={item.title} />
    </div>
  ) : item.mediaType === "audio" ? (
    <div className="flex h-full w-full items-center justify-center bg-black/60 text-white"><Music size={compact ? 18 : 30} /></div>
  ) : (
    <div className="flex h-full w-full items-center justify-center bg-black/40 text-white/50"><File size={compact ? 18 : 30} /></div>
  );

  const typeBadge = (
    <span className="absolute left-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-white/85">
      {item.mediaType}
    </span>
  );

  if (compact) {
    return (
      <div className="relative flex h-14 w-full items-center justify-center overflow-hidden rounded-none bg-black/30">
        <div className="h-full max-w-full" style={{ aspectRatio: ratio }}>
          {mediaContent}
        </div>
        {typeBadge}
      </div>
    );
  }

  return (
    <div className="relative w-full overflow-hidden rounded-none bg-black/30" style={{ aspectRatio: ratio }}>
      {mediaContent}
      {typeBadge}
    </div>
  );
}

function downloadJson(filename: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function EmptyState({ title, line }: { title: string; line: string }) {
  return (
    <div className="rounded-none border border-dashed border-white/15 bg-black/25 p-5 text-center">
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-none bg-white/10 text-white/60">
        <Layers size={20} />
      </div>
      <div className="mt-3 text-sm font-black uppercase tracking-[0.12em] text-white/85">{title}</div>
      <p className="mt-1 text-xs leading-relaxed text-white/55">{line}</p>
    </div>
  );
}

type DesignerFullResRequest = {
  requestId: number;
  nodeId: string;
  pages: DesignerPageState[];
  targetPageIds: string[];
};

/**
 * Monta un Designer Studio headless (offscreen) que renderiza las páginas pedidas a PNG full-res
 * y las reporta. Mismo patrón que el export PDF headless del Image Export.
 */
function DesignerFullResExportPortal({
  request,
  onPage,
  onDone,
  onError,
}: {
  request: DesignerFullResRequest;
  onPage: (pageId: string, dataUrl: string) => void;
  onDone: () => void;
  onError: (err: Error) => void;
}) {
  const [Studio, setStudio] = useState<React.ComponentType<any> | null>(null);
  useEffect(() => {
    void import("./designer/DesignerStudio").then((m) => setStudio(() => m.default));
  }, []);
  if (!Studio) return null;
  return createPortal(
    <Studio
      initialPages={request.pages}
      activePageIndex={0}
      designerCanvasInstanceKey={request.nodeId}
      onClose={() => {}}
      onExport={() => {}}
      onUpdatePages={() => {}}
      headlessImageExport={{
        requestId: request.requestId,
        targetPageIds: request.targetPageIds,
        onPage,
        onDone,
        onError,
      }}
    />,
    document.body,
  );
}

type ExportMultimediaFilter = "all" | "video" | "image" | "audio" | "file" | "pending";

function ExportMultimediaStudio({
  output,
  designerPagesByNode,
  datasetLists,
  datasetListId,
  onDatasetListIdChange,
  onClose,
}: {
  output: MediaListOutput | null;
  designerPagesByNode: Record<string, DesignerPageState[]>;
  datasetLists: Array<{ id: string; name: string }>;
  datasetListId: string | null | undefined;
  onDatasetListIdChange: (listId: string | null) => void;
  onClose: () => void;
}) {
  const [filter, setFilter] = useState<ExportMultimediaFilter>("all");
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
  const [metadataItem, setMetadataItem] = useState<MediaListItem | null>(null);
  const [notice, setNotice] = useState("");
  const [designerExportReq, setDesignerExportReq] = useState<DesignerFullResRequest | null>(null);
  const designerExportRef = useRef<{
    resolve: (m: Record<string, string>) => void;
    reject: (e: Error) => void;
    collected: Record<string, string>;
  } | null>(null);

  const runDesignerFullResExport = useCallback(
    (nodeId: string, pages: DesignerPageState[], targetPageIds: string[]) =>
      new Promise<Record<string, string>>((resolve, reject) => {
        designerExportRef.current = { resolve, reject, collected: {} };
        setDesignerExportReq({ requestId: Date.now(), nodeId, pages, targetPageIds });
      }),
    [],
  );
  const stats = mediaListStats(output);
  const manifest = output ? buildMediaListManifest(output) : null;
  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return (output?.items ?? [])
      .filter((item) => {
        if (filter === "video") return item.mediaType === "video";
        if (filter === "image") return item.mediaType === "image";
        if (filter === "audio") return item.mediaType === "audio";
        if (filter === "file") return item.mediaType === "document" || item.mediaType === "file";
        if (filter === "pending") return item.mediaType === "placeholder" || item.status === "missing" || item.status === "pending";
        return true;
      })
      .filter((item) => {
        if (!normalizedQuery) return true;
        return [item.title, item.description, item.sceneTitle, item.role].filter(Boolean).join(" ").toLowerCase().includes(normalizedQuery);
      })
      .sort((a, b) => {
        const sceneA = a.sceneOrder ?? Number.MAX_SAFE_INTEGER;
        const sceneB = b.sceneOrder ?? Number.MAX_SAFE_INTEGER;
        if (sceneA !== sceneB) return sceneA - sceneB;
        return a.order - b.order;
      });
  }, [filter, output?.items, query]);
  const selectedDownloadable = filteredItems.filter((item) => selectedIds[item.id] && isMediaListItemDownloadable(item));

  const handleDownloadItems = useCallback(async (items: MediaListItem[], label: string) => {
    const downloadable = items.filter(isMediaListItemDownloadable);
    const skipped = items.length - downloadable.length;
    if (!downloadable.length) {
      setNotice("No hay archivos descargables en esta selección.");
      return;
    }

    // Páginas de Designer → render full-res bajo demanda (headless), luego descarga PNG.
    const designerItems = downloadable.filter((item) => getDesignerExportMeta(item));
    const otherItems = downloadable.filter((item) => !getDesignerExportMeta(item));

    for (const item of otherItems) {
      const filename = mediaListDownloadFilename(item);
      const key = resolveMediaListS3Key(item);
      if (key && item.mediaType === "image" && mediaListImageLikelyHasTransparency(item)) {
        const url = await presignMediaListS3Key(key);
        if (url) await downloadMediaListImageUrl(url, item);
        continue;
      }
      if (key) {
        downloadS3Object(key, filename);
        continue;
      }
      const url = await resolveMediaListItemDownloadUrl(item);
      if (!url) continue;
      if (item.mediaType === "image") {
        await downloadMediaListImageUrl(url, item);
        continue;
      }
      await forceDownloadUrl(url, filename);
    }

    if (designerItems.length > 0) {
      const byNode = new Map<string, MediaListItem[]>();
      for (const item of designerItems) {
        const meta = getDesignerExportMeta(item)!;
        const list = byNode.get(meta.nodeId) ?? [];
        list.push(item);
        byNode.set(meta.nodeId, list);
      }

      let designerDone = 0;
      setNotice(`${label}: generando ${designerItems.length} página(s) a resolución completa…`);
      try {
        for (const [nodeId, nodeItems] of byNode) {
          const pages = designerPagesByNode[nodeId] ?? [];
          if (pages.length === 0) {
            setNotice(`No se pudieron leer las páginas del Designer ${nodeId} para exportar a full-res.`);
            return;
          }
          const targetPageIds = nodeItems
            .map((item) => getDesignerExportMeta(item)?.pageId)
            .filter((v): v is string => Boolean(v));
          const rendered = await runDesignerFullResExport(nodeId, pages, targetPageIds);
          for (const item of nodeItems) {
            const meta = getDesignerExportMeta(item)!;
            const url = rendered[meta.pageId];
            if (!url) continue;
            const base = sanitizeDownloadFilename(item.title || `pagina-${meta.pageIndex + 1}`);
            await forceDownloadUrl(url, /\.[a-z0-9]{2,8}$/i.test(base) ? base : `${base}.png`);
            designerDone += 1;
          }
        }
        setNotice(`${label}: ${designerDone + otherItems.length} descarga(s) iniciada(s).${skipped ? ` ${skipped} pendiente(s) no incluidos.` : ""}`);
        return;
      } catch (e) {
        setNotice(`No se pudo generar el full-res: ${e instanceof Error ? e.message : String(e)}`);
        return;
      }
    }

    setNotice(`${label}: ${otherItems.length} descarga(s) iniciada(s).${skipped ? ` ${skipped} pendiente(s) no incluidos.` : ""}`);
  }, [designerPagesByNode, runDesignerFullResExport]);

  const handleManifestDownload = useCallback(() => {
    if (!manifest) return;
    downloadJson(`${output?.title || "media-list"}-manifest.json`, manifest);
  }, [manifest, output?.title]);

  const flatBtn = "flex h-9 items-center justify-center gap-1.5 bg-white/[0.06] px-3 text-[9px] font-black uppercase tracking-[0.1em] text-white/70 transition hover:bg-white/[0.12] hover:text-white disabled:cursor-not-allowed disabled:opacity-40";
  const flatPrimaryBtn = "flex h-9 items-center justify-center gap-1.5 bg-[var(--foldder-studio-accent,#21817f)] px-3 text-[9px] font-black uppercase tracking-[0.1em] text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40";

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[100080] flex flex-col bg-[#0d1f1e] text-white"
        role="dialog"
        aria-modal="true"
        aria-label="Export Multimedia studio"
        style={{ ["--foldder-studio-accent" as string]: "#21817f" }}
      >
        <img src="/nodes/enhancer-bg.png" alt="" className="pointer-events-none absolute inset-0 z-0 h-full w-full object-cover opacity-[0.10]" draggable={false} />
        <div className="pointer-events-none absolute inset-0 z-0 bg-[#0d1f1e]/82" />

        <div className="relative z-10 flex min-h-0 flex-1 flex-col">
          <FoldderStudioHeader
            nodeType="export_multimedia"
            nodeLabel="Export Multimedia"
            subtitle={
              output
                ? ((output.metadata as { mergedSourceCount?: number }).mergedSourceCount ?? 1) > 1
                  ? `${(output.metadata as { mergedSourceCount?: number }).mergedSourceCount} orígenes · ${stats.downloadable} descargables`
                  : `Media list · ${output.sourceNodeType || "origen"}`
                : "Sin media_list conectada"
            }
            onClose={onClose}
          />

          {/* Métricas — barra plana con divisores */}
          <div className="flex h-10 shrink-0 divide-x divide-white/10 border-b border-white/10 bg-black/30 text-[9px] font-black uppercase tracking-[0.08em] text-white/52">
            <span className="flex min-w-0 flex-1 items-center px-4 text-white/72">{stats.total} total</span>
            <span className="hidden items-center px-4 sm:flex">{stats.images} img</span>
            <span className="hidden items-center px-4 sm:flex">{stats.videos} vid</span>
            <span className="hidden items-center px-4 md:flex">{stats.audio} audio</span>
            <span className="hidden items-center px-4 md:flex">{stats.files} arch</span>
            <span className="hidden items-center px-4 lg:flex">{stats.pending} pend</span>
            <span className="hidden items-center px-4 lg:flex">{stats.videoDuration}s</span>
          </div>

          {/* Filtros + búsqueda — barra plana */}
          <div className="flex shrink-0 items-stretch divide-x divide-white/10 border-b border-white/10 bg-white/[0.04]">
            {datasetLists.length > 0 ? (
              <label className="flex h-10 min-w-[180px] shrink-0 items-center gap-2 border-r border-white/10 px-3 text-[9px] font-black uppercase tracking-[0.08em] text-white/55">
                <span className="shrink-0">Listado</span>
                <select
                  value={datasetListId ?? ""}
                  onChange={(event) => onDatasetListIdChange(event.target.value || null)}
                  className="min-w-0 flex-1 bg-transparent text-[11px] font-semibold normal-case tracking-normal text-white outline-none"
                >
                  <option value="">Todos los listados</option>
                  {datasetLists.map((list) => (
                    <option key={list.id} value={list.id}>
                      {list.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <div className="flex min-w-0 flex-1 items-stretch divide-x divide-white/10 overflow-x-auto">
              {([
                ["all", "Todos"],
                ["video", "Vídeos"],
                ["image", "Imágenes"],
                ["audio", "Audio"],
                ["file", "Archivos"],
                ["pending", "Pendientes"],
              ] as const).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFilter(id)}
                  aria-current={filter === id ? "true" : undefined}
                  className={cx(
                    "flex h-10 shrink-0 items-center px-4 text-[9px] font-black uppercase tracking-[0.08em] transition",
                    filter === id ? "bg-white text-slate-950" : "text-white/45 hover:bg-white/[0.08] hover:text-white/78",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="flex h-10 min-w-[200px] items-center gap-2 border-l border-white/10 px-3 text-white/55">
              <Search size={14} className="shrink-0" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por título…" className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/30" />
            </label>
          </div>

          {/* Acciones — barra plana */}
          <div className="flex min-h-10 shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-b border-white/10 bg-black/20 px-4 py-1.5">
            <span className="text-[9px] font-black uppercase tracking-[0.08em] text-white/45">
              {filteredItems.length} visibles · {selectedDownloadable.length} seleccionados
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              <button type="button" onClick={() => setSelectedIds(Object.fromEntries(filteredItems.map((item) => [item.id, true])))} className={flatBtn}>Seleccionar visibles</button>
              <button type="button" onClick={() => setSelectedIds({})} className={flatBtn}>Limpiar</button>
              <button type="button" onClick={() => void handleDownloadItems(selectedDownloadable, "Seleccionados")} className={flatPrimaryBtn}><Download size={12} strokeWidth={2.25} />Descargar selección</button>
              <button type="button" onClick={() => void handleDownloadItems(output?.items ?? [], "Todo")} className={flatPrimaryBtn}><Download size={12} strokeWidth={2.25} />Descargar todo</button>
              <button type="button" onClick={handleManifestDownload} className={flatBtn}>Manifest JSON</button>
            </div>
          </div>

          {notice ? (
            <p className="shrink-0 border-b border-white/10 bg-[var(--foldder-studio-accent,#21817f)]/12 px-4 py-2 text-[10px] font-black uppercase tracking-[0.08em] text-white/75">{notice}</p>
          ) : null}

          <main className="custom-scrollbar relative min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6 md:py-5">
            {!output ? (
              <EmptyState title="Sin fuentes conectadas" line="Conecta un Dataset o una salida media_list para revisar y descargar multimedia." />
            ) : !output.items.length ? (
              <EmptyState title="Lista vacía" line="La lista está vacía. Todavía no hay medios generados." />
            ) : (
              <div className="grid grid-cols-2 items-start gap-px bg-white/10 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
                {filteredItems.map((item) => {
                  const pending = item.mediaType === "placeholder" || item.status === "missing" || item.status === "pending";
                  return (
                    <article key={item.id} className={cx("flex flex-col bg-[#0d1f1e]", pending ? "opacity-75" : undefined)}>
                      <div className="relative">
                        <MediaThumb item={item} />
                        <label className="absolute left-2 top-2 flex h-8 w-8 items-center justify-center border border-white/15 bg-black/55 backdrop-blur-md">
                          <input type="checkbox" checked={Boolean(selectedIds[item.id])} onChange={(event) => setSelectedIds((current) => ({ ...current, [item.id]: event.target.checked }))} className="h-4 w-4 accent-[var(--foldder-studio-accent,#21817f)]" />
                        </label>
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col p-3">
                        <div className="line-clamp-2 text-xs font-black leading-tight text-white">{item.title}</div>
                        <div className="mt-2 flex flex-wrap gap-1.5 text-[9px] font-black uppercase tracking-[0.08em] text-white/45">
                          <span>{item.mediaType}</span>
                          <span className="text-white/20">·</span>
                          <span>{item.status || "pending"}</span>
                          {item.sceneOrder ? (<><span className="text-white/20">·</span><span>Esc {item.sceneOrder}</span></>) : null}
                          {item.durationSeconds ? (<><span className="text-white/20">·</span><span>{item.durationSeconds}s</span></>) : null}
                        </div>
                        {pending ? <p className="mt-2 text-[10px] leading-relaxed text-white/35">Este medio todavía no ha sido generado.</p> : null}
                        <div className="mt-auto flex items-center gap-px pt-3">
                          <button type="button" disabled={!isMediaListItemDownloadable(item)} onClick={() => void handleDownloadItems([item], "Item")} className={cx(flatPrimaryBtn, "flex-1")}>Descargar</button>
                          <button type="button" onClick={() => setMetadataItem(item)} className={cx(flatBtn, "px-3")} title="Ver metadata" aria-label="Ver metadata"><Clipboard size={13} /></button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </main>
        </div>
      </div>

      {metadataItem ? (
        <div className="fixed inset-0 z-[100090] flex items-center justify-center bg-black/70 p-5" style={{ ["--foldder-studio-accent" as string]: "#21817f" }}>
          <div className="flex max-h-[82vh] w-full max-w-3xl flex-col overflow-hidden border border-white/10 bg-[#0d1f1e] shadow-2xl">
            <div className="flex h-10 shrink-0 items-stretch border-b border-white/10 bg-white/[0.08]">
              <div className="flex min-w-0 flex-1 flex-col justify-center px-4">
                <div className="text-[9px] font-black uppercase tracking-[0.12em] text-white/40">Metadata</div>
                <h3 className="truncate text-[11px] font-black uppercase tracking-[0.08em] text-white">{metadataItem.title}</h3>
              </div>
              <button type="button" onClick={() => setMetadataItem(null)} className="flex h-10 w-10 shrink-0 items-center justify-center border-l border-white/20 bg-black/45 text-white transition hover:bg-black/60" aria-label="Cerrar"><X size={16} strokeWidth={2.25} /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-5">
              <pre className="whitespace-pre-wrap bg-black/40 p-4 text-xs leading-relaxed text-white/85">{JSON.stringify(metadataItem, null, 2)}</pre>
              <button type="button" onClick={() => void navigator.clipboard?.writeText(JSON.stringify(metadataItem, null, 2))} className={cx(flatPrimaryBtn, "mt-3")}>
                <Clipboard size={13} />Copiar JSON
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {designerExportReq ? (
        <DesignerFullResExportPortal
          request={designerExportReq}
          onPage={(pageId, dataUrl) => {
            if (designerExportRef.current) designerExportRef.current.collected[pageId] = dataUrl;
          }}
          onDone={() => {
            const ref = designerExportRef.current;
            designerExportRef.current = null;
            setDesignerExportReq(null);
            ref?.resolve(ref.collected);
          }}
          onError={(err) => {
            const ref = designerExportRef.current;
            designerExportRef.current = null;
            setDesignerExportReq(null);
            ref?.reject(err);
          }}
        />
      ) : null}
    </>,
    document.body,
  );
}

export const ExportMultimediaNode = memo(function ExportMultimediaNode({ id, data, selected }: NodeProps) {
  useFoldderRenderMetric("ExportMultimediaNode", id);
  const nodeData = (data ?? {}) as ExportMultimediaNodeData;
  const { setNodes } = useReactFlow();
  const edges = useEdges();
  const updateNodeInternals = useUpdateNodeInternals();
  const { output, datasetConnected, datasetLoading } = useExportMultimediaOutput(
    id,
    nodeData.datasetListId,
  );
  const { connectedDataset } = useDesignerConnectedDataset(id);
  const designerPagesByNode = useConnectedDesignerPagesByNode(id);
  const [studioOpen, setStudioOpen] = useState(false);

  const patchDatasetListId = useCallback(
    (listId: string | null) => {
      setNodes((nodes) =>
        nodes.map((n) =>
          n.id === id ? { ...n, data: { ...(n.data as object), datasetListId: listId } } : n,
        ),
      );
    },
    [id, setNodes],
  );

  const datasetLists = useMemo(
    () => (connectedDataset?.lists ?? []).map((l) => ({ id: l.id, name: l.name })),
    [connectedDataset],
  );

  const datasetEdgeConnected = useStore(
    useCallback((state: ReactFlowState<Node, Edge>) => !!selectConnectedDatasetSource(state, id), [id]),
  );

  const connectedEdges = useMemo(
    () =>
      edges
        .filter((e) => isExportMultimediaMediaListEdge(e, id))
        .sort((a, b) => exportMultimediaTargetHandleSortKey(exportMultimediaEdgeSlotKey(a.targetHandle)) - exportMultimediaTargetHandleSortKey(exportMultimediaEdgeSlotKey(b.targetHandle))),
    [edges, id],
  );
  const connectedHandleIds = useMemo(() => {
    const set = new Set<string>();
    for (const edge of connectedEdges) {
      set.add(normalizeExportMultimediaTargetHandle(edge.targetHandle));
    }
    return set;
  }, [connectedEdges]);
  const visibleCount = Math.min(Math.max(connectedEdges.length + 1, 1), EXPORT_MULTIMEDIA_MEDIA_LIST_HANDLES.length);
  const visibleHandles = useMemo(
    () => EXPORT_MULTIMEDIA_MEDIA_LIST_HANDLES.slice(0, visibleCount),
    [visibleCount],
  );

  useEffect(() => {
    updateNodeInternals(id);
  }, [id, visibleCount, datasetEdgeConnected, updateNodeInternals]);

  const connectedSourceCount = connectedEdges.length + (datasetEdgeConnected ? 1 : 0);
  const stats = mediaListStats(output);
  const statusLabel = datasetLoading
    ? "cargando dataset…"
    : !output
      ? datasetConnected
        ? "dataset conectado · sin medios"
        : "sin conexión"
      : stats.pending > 0
        ? "algunos archivos pendientes"
        : stats.downloadable > 0
          ? "listo para descargar"
          : datasetConnected
            ? "dataset + medios"
            : "media list recibida";

  const previewItems = (output?.items ?? []).slice(0, 6);

  return (
    <div
      className={cx(
        "custom-node tool-node export-multimedia-node foldder-node--frameless node--glass foldder-frameless-label-dark",
        output || datasetConnected ? "export-multimedia-node--active" : "export-multimedia-node--empty",
      )}
      style={{
        minWidth: 240,
        minHeight: 240,
        "--foldder-node-card-bg": "#21817f",
        "--foldder-frameless-glass-bg": "#21817f",
        "--foldder-frameless-accent": "#1f2328",
      } as React.CSSProperties}
    >
      <NodeResizer minWidth={240} minHeight={240} maxWidth={760} maxHeight={900} isVisible={selected} />
      <NodeLabel id={id} label={nodeData.label} defaultLabel="Export Multimedia" />

      <div className="handle-wrapper handle-left" style={{ top: "8%" }}>
        <FoldderDataHandle
          type="target"
          position={Position.Left}
          id="dataset"
          dataType="dataset"
          className={datasetEdgeConnected ? "foldder-data-handle--connected" : ""}
        />
      </div>

      {visibleHandles.map((hId, index) => (
        <div
          key={hId}
          className="handle-wrapper handle-left"
          style={{
            top: `${14 + ((index + 1) / (visibleHandles.length + 1)) * 78}%`,
          }}
        >
          <FoldderDataHandle
            type="target"
            position={Position.Left}
            id={hId}
            dataType="generic"
            className={connectedHandleIds.has(hId) ? "foldder-data-handle--connected" : ""}
          />
        </div>
      ))}

      <div className="node-header">
        <NodeIcon type="export_multimedia" selected={selected} size={16} />
        <FoldderNodeHeaderTitle className="flex-1" introActive={!!nodeData._foldderCanvasIntro}>
          Export Multimedia
        </FoldderNodeHeaderTitle>
      </div>

      <div className="node-content foldder-frameless-main export-multimedia-node-main nodrag nopan">
        <img src="/nodes/enhancer-bg.png" alt="" className="export-multimedia-node-bg" draggable={false} />

        <div className="export-multimedia-node-dock nodrag">
          {output ? (
            <>
              <div className="export-multimedia-stat-row">
                <span className="export-multimedia-stat-total">{stats.total}</span>
                <span className="export-multimedia-stat-sub">
                  {connectedSourceCount > 1 ? `${connectedSourceCount} orígenes · ` : ""}
                  {datasetConnected ? "dataset · " : ""}
                  {stats.images} img · {stats.videos} vid · {stats.files + stats.audio} otros
                  {stats.pending ? ` · ${stats.pending} pend.` : ""}
                </span>
              </div>
              {previewItems.length > 0 ? (
                <div className="export-multimedia-thumbs">
                  {previewItems.map((item) => (
                    <MediaThumb key={item.id} item={item} compact />
                  ))}
                </div>
              ) : (
                <p className="export-multimedia-empty-text">Lista vacía — todavía sin medios.</p>
              )}
            </>
          ) : (
            <p className="export-multimedia-empty-text">
              Conecta un Dataset (arriba) o salidas media_list (p. ej. Populate, Designer).
            </p>
          )}
        </div>
      </div>

      <div className="foldder-frameless-footer-action nodrag export-multimedia-node-footer">
        <button
          type="button"
          className="execute-btn export-multimedia-open-button nodrag w-full"
          onClick={() => setStudioOpen(true)}
          disabled={!output || datasetLoading}
        >
          {datasetLoading ? "Cargando dataset…" : output ? `Abrir · ${statusLabel}` : "Sin conexión"}
        </button>
      </div>

      {studioOpen ? (
        <ExportMultimediaStudio
          output={output}
          designerPagesByNode={designerPagesByNode}
          datasetLists={datasetLists}
          datasetListId={nodeData.datasetListId}
          onDatasetListIdChange={patchDatasetListId}
          onClose={() => setStudioOpen(false)}
        />
      ) : null}
    </div>
  );
});

export const ExportMultipleNode = ExportMultimediaNode;
