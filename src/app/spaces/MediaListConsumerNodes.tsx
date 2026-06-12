"use client";

import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { NodeResizer, Position, useStore, type Edge, type Node, type NodeProps, type ReactFlowState } from "@xyflow/react";
import { shallow } from "zustand/shallow";
import { Clipboard, Download, File, Layers, Music, Search, X } from "lucide-react";

import { downloadS3Object, forceDownloadUrl, sanitizeDownloadFilename } from "@/lib/browser-download";
import { tryExtractKnowledgeFilesKeyFromUrl } from "@/lib/s3-media-hydrate";

import { FoldderDataHandle } from "./FoldderDataHandle";
import {
  buildMediaListManifest,
  isMediaListItemDownloadable,
  readMediaListFromNode,
} from "./media-list-consumers";
import type { MediaListItem, MediaListOutput } from "./media-list-output";
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
} | null;

function selectConnectedMediaListSource(
  state: ReactFlowState<Node, Edge>,
  nodeId: string,
): ConnectedMediaListSourceSnapshot {
  const edge = state.edges.find((item) => item.target === nodeId && (!item.targetHandle || item.targetHandle === "media_list"));
  if (!edge) return null;
  const sourceNode = state.nodeLookup.get(edge.source);
  if (!sourceNode) return null;
  return {
    sourceId: sourceNode.id,
    sourceType: sourceNode.type,
    sourceData: sourceNode.data,
  };
}

function useConnectedMediaList(nodeId: string): MediaListOutput | null {
  const source = useStore(
    useCallback((state: ReactFlowState<Node, Edge>) => selectConnectedMediaListSource(state, nodeId), [nodeId]),
    shallow,
  );
  return useMemo(() => {
    if (!source) return null;
    return readMediaListFromNode({
      id: source.sourceId,
      type: source.sourceType,
      data: source.sourceData,
    } as Node);
  }, [source]);
}

async function resolveMediaListItemDownloadUrl(item: MediaListItem): Promise<string | null> {
  if (!isMediaListItemDownloadable(item)) return null;
  const key = resolveMediaListS3Key(item);
  if (key) return presignMediaListS3Key(key);
  const direct = item.url || item.assetId;
  return direct && !direct.startsWith("asset://") ? direct : null;
}

function mediaListDownloadFilename(item: MediaListItem): string {
  const base = sanitizeDownloadFilename(item.title || item.id || "media");
  if (/\.[a-z0-9]{2,8}$/i.test(base)) return base;
  if (item.mediaType === "video") return `${base}.mp4`;
  if (item.mediaType === "image") return `${base}.jpg`;
  if (item.mediaType === "audio") return `${base}.mp3`;
  return base;
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

function MediaThumb({ item, compact = false }: { item: MediaListItem; compact?: boolean }) {
  const url = useMediaListItemUrl(item);
  const isPlaceholder = item.mediaType === "placeholder" || !url;
  return (
    <div className={cx("relative overflow-hidden rounded-2xl bg-slate-200", compact ? "h-14 w-16" : "aspect-video w-full")}>
      {isPlaceholder ? (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-200 to-slate-100 text-slate-400">
          <Layers size={compact ? 16 : 24} />
        </div>
      ) : item.mediaType === "video" ? (
        <video className="h-full w-full object-cover" src={url} muted playsInline preload="metadata" />
      ) : item.mediaType === "image" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="h-full w-full object-cover" src={url} alt={item.title} />
      ) : item.mediaType === "audio" ? (
        <div className="flex h-full w-full items-center justify-center bg-slate-900 text-white"><Music size={compact ? 18 : 30} /></div>
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-slate-100 text-slate-400"><File size={compact ? 18 : 30} /></div>
      )}
      <span className="absolute left-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-white/85">
        {item.mediaType}
      </span>
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
    <div className="rounded-3xl border border-dashed border-slate-300 bg-white/70 p-5 text-center">
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
        <Layers size={20} />
      </div>
      <div className="mt-3 text-sm font-black uppercase tracking-[0.12em] text-slate-700">{title}</div>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">{line}</p>
    </div>
  );
}

type ExportMultimediaFilter = "all" | "video" | "image" | "audio" | "file" | "pending";

function ExportMultimediaStudio({
  output,
  onClose,
}: {
  output: MediaListOutput | null;
  onClose: () => void;
}) {
  const [filter, setFilter] = useState<ExportMultimediaFilter>("all");
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
  const [metadataItem, setMetadataItem] = useState<MediaListItem | null>(null);
  const [notice, setNotice] = useState("");
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
    for (const item of downloadable) {
      const filename = mediaListDownloadFilename(item);
      const key = resolveMediaListS3Key(item);
      if (key) {
        downloadS3Object(key, filename);
        continue;
      }
      const url = await resolveMediaListItemDownloadUrl(item);
      if (url) await forceDownloadUrl(url, filename);
    }
    setNotice(`${label}: ${downloadable.length} descarga(s) iniciada(s).${skipped ? ` ${skipped} pendiente(s) no incluidos.` : ""} ZIP queda preparado para una fase posterior.`);
  }, []);

  const handleManifestDownload = useCallback(() => {
    if (!manifest) return;
    downloadJson(`${output?.title || "media-list"}-manifest.json`, manifest);
  }, [manifest, output?.title]);

  return createPortal(
    <div className="fixed inset-0 z-[100080] bg-slate-950/82 p-4 text-slate-900 backdrop-blur-md">
      <div className="mx-auto flex h-full max-w-[1540px] flex-col overflow-hidden rounded-[32px] border border-white/60 bg-[#f4f5f6] shadow-2xl">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-white/88 px-6 py-4">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Export Multimedia</div>
            <h2 className="mt-1 text-2xl font-black tracking-[-0.05em]">Revisión y descarga multimedia</h2>
            <p className="mt-1 text-sm text-slate-500">
              {output ? `Media list desde ${output.sourceNodeType || "origen"} · ${output.sourceNodeId}` : "Sin media_list conectada"}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-2xl border border-slate-200 bg-white p-3 text-slate-500 hover:text-slate-900">
            <X size={18} />
          </button>
        </header>

        <main className="min-h-0 flex-1 overflow-auto p-5">
          <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-7">
            {[
              ["Total", stats.total],
              ["Vídeos", stats.videos],
              ["Imágenes", stats.images],
              ["Audio", stats.audio],
              ["Archivos", stats.files],
              ["Pendientes", stats.pending],
              ["Duración vídeo", `${stats.videoDuration}s`],
            ].map(([label, value]) => (
              <div key={label} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">{label}</div>
                <div className="mt-1 text-2xl font-black tracking-[-0.05em] text-slate-900">{value}</div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-slate-200 bg-white p-3">
            <div className="flex flex-wrap gap-2">
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
                  className={cx("rounded-full px-3 py-2 text-xs font-black uppercase tracking-[0.1em] transition", filter === id ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200")}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="flex min-w-[260px] items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
              <Search size={15} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por título..." className="w-full bg-transparent outline-none" />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-semibold text-slate-500">{filteredItems.length} item(s) visibles · {selectedDownloadable.length} descargable(s) seleccionados</div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setSelectedIds(Object.fromEntries(filteredItems.map((item) => [item.id, true])))} className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-black uppercase tracking-[0.1em] text-slate-600">Seleccionar visibles</button>
              <button type="button" onClick={() => setSelectedIds({})} className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-black uppercase tracking-[0.1em] text-slate-600">Limpiar</button>
              <button type="button" onClick={() => void handleDownloadItems(selectedDownloadable, "Seleccionados")} className="rounded-full bg-slate-900 px-3 py-2 text-xs font-black uppercase tracking-[0.1em] text-white">Descargar seleccionados</button>
              <button type="button" onClick={() => void handleDownloadItems(output?.items ?? [], "Todo")} className="rounded-full bg-slate-900 px-3 py-2 text-xs font-black uppercase tracking-[0.1em] text-white">Descargar todo</button>
              <button type="button" onClick={handleManifestDownload} className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-black uppercase tracking-[0.1em] text-slate-700">Manifest JSON</button>
            </div>
          </div>
          {notice ? <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">{notice}</div> : null}

          {!output ? (
            <div className="mt-5"><EmptyState title="Sin media_list conectada" line="Conecta una salida media_list para revisar y descargar multimedia." /></div>
          ) : !output.items.length ? (
            <div className="mt-5"><EmptyState title="Lista vacía" line="La lista está vacía. Todavía no hay medios generados." /></div>
          ) : (
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {filteredItems.map((item) => {
                const pending = item.mediaType === "placeholder" || item.status === "missing" || item.status === "pending";
                return (
                  <article key={item.id} className={cx("overflow-hidden rounded-[28px] border bg-white shadow-sm", pending ? "border-slate-200 opacity-75" : "border-slate-200")}>
                    <div className="relative">
                      <MediaThumb item={item} />
                      <label className="absolute left-3 top-3 flex h-9 w-9 items-center justify-center rounded-full border border-white/70 bg-white/90 shadow">
                        <input type="checkbox" checked={Boolean(selectedIds[item.id])} onChange={(event) => setSelectedIds((current) => ({ ...current, [item.id]: event.target.checked }))} className="h-4 w-4 accent-slate-900" />
                      </label>
                    </div>
                    <div className="p-3">
                      <div className="line-clamp-2 text-sm font-black leading-tight text-slate-900">{item.title}</div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-black uppercase tracking-[0.1em] text-slate-500">{item.mediaType}</span>
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-black uppercase tracking-[0.1em] text-slate-500">{item.status || "pending"}</span>
                        {item.sceneOrder ? <span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-black uppercase tracking-[0.1em] text-slate-500">Escena {item.sceneOrder}</span> : null}
                        {item.durationSeconds ? <span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-black uppercase tracking-[0.1em] text-slate-500">{item.durationSeconds}s</span> : null}
                      </div>
                      {pending ? <p className="mt-2 text-xs text-slate-400">Este medio todavía no ha sido generado.</p> : null}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" disabled={!isMediaListItemDownloadable(item)} onClick={() => void handleDownloadItems([item], "Item")} className="rounded-full bg-slate-900 px-3 py-2 text-[10px] font-black uppercase tracking-[0.1em] text-white disabled:bg-slate-200 disabled:text-slate-400">Descargar</button>
                        <button type="button" onClick={() => setMetadataItem(item)} className="rounded-full border border-slate-200 px-3 py-2 text-[10px] font-black uppercase tracking-[0.1em] text-slate-600">Ver metadata</button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </main>
      </div>

      {metadataItem ? (
        <div className="fixed inset-0 z-[100090] flex items-center justify-center bg-slate-950/55 p-5">
          <div className="max-h-[82vh] w-full max-w-3xl overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Metadata</div>
                <h3 className="mt-1 text-lg font-black">{metadataItem.title}</h3>
              </div>
              <button type="button" onClick={() => setMetadataItem(null)} className="rounded-2xl border border-slate-200 p-2 text-slate-500"><X size={17} /></button>
            </div>
            <div className="max-h-[62vh] overflow-auto p-5">
              <pre className="whitespace-pre-wrap rounded-2xl bg-slate-950 p-4 text-xs leading-relaxed text-slate-100">{JSON.stringify(metadataItem, null, 2)}</pre>
              <button type="button" onClick={() => void navigator.clipboard?.writeText(JSON.stringify(metadataItem, null, 2))} className="mt-3 inline-flex items-center gap-2 rounded-full bg-slate-900 px-3 py-2 text-xs font-black uppercase tracking-[0.1em] text-white">
                <Clipboard size={14} />Copiar JSON
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>,
    document.body,
  );
}

export const ExportMultimediaNode = memo(function ExportMultimediaNode({ id, data, selected }: NodeProps) {
  useFoldderRenderMetric("ExportMultimediaNode", id);
  const output = useConnectedMediaList(id);
  const [studioOpen, setStudioOpen] = useState(false);
  const stats = mediaListStats(output);
  const statusLabel = !output
    ? "sin conexión"
    : stats.pending > 0
      ? "algunos archivos pendientes"
      : stats.downloadable > 0
        ? "listo para descargar"
        : "media list recibida";

  return (
    <div
      className={cx(
        "custom-node export-multimedia-node foldder-node--frameless node--glass relative p-4 text-slate-900",
        selected ? "export-multimedia-node--selected" : undefined,
      )}
      style={{ minWidth: 200, minHeight: 120 }}
    >
      <NodeResizer minWidth={200} minHeight={120} maxWidth={960} maxHeight={2200} isVisible={selected} />
      <FoldderDataHandle type="target" position={Position.Left} id="media_list" dataType="generic" />
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Export Multimedia</div>
          <h3 className="mt-1 text-lg font-black tracking-[-0.04em]">{String((data as { label?: unknown }).label || "Export Multimedia")}</h3>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-white">
          <Download size={18} />
        </div>
      </div>
      <div className="mt-4 rounded-3xl border border-slate-200 bg-slate-50 p-4">
        {output ? (
          <>
            <div className="text-3xl font-black tracking-[-0.06em]">{stats.total} archivos</div>
            <div className="mt-2 text-sm font-semibold text-slate-600">{stats.videos} vídeos · {stats.images} imágenes · {stats.files + stats.audio} otros</div>
            <div className="mt-1 text-sm font-semibold text-slate-500">{stats.pending} pendientes</div>
          </>
        ) : (
          <>
            <div className="text-lg font-black tracking-[-0.04em]">Sin media list conectada</div>
            <div className="mt-1 text-sm text-slate-500">Conecta una salida media_list</div>
          </>
        )}
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="rounded-full bg-slate-100 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">{statusLabel}</span>
        <button type="button" onClick={() => setStudioOpen(true)} className="rounded-2xl bg-slate-900 px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-white">Abrir</button>
      </div>
      {studioOpen ? <ExportMultimediaStudio output={output} onClose={() => setStudioOpen(false)} /> : null}
    </div>
  );
});

export const ExportMultipleNode = ExportMultimediaNode;
