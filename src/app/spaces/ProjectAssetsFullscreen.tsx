"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { Node } from "@xyflow/react";
import { BookOpen, FileQuestion, FolderOpen, X } from "lucide-react";
import { collectFoldderLibrarySections } from "./foldder-library";
import type { ProjectMediaItem } from "./project-media-inventory";
import type { ProjectFilesMetadata, ProjectFile } from "./project-files";
import { normalizeProjectAssets } from "./project-assets-metadata";
import { tryExtractKnowledgeFilesKeyFromUrl } from "@/lib/s3-media-hydrate";
import { GUI_FORMAT_FOLDERS, GUI_FORMAT_LABELS, type GuionistaFormat, type GuionistaGeneratedTextAssetsMetadata, type GuionistaTextAsset } from "./guionista-types";

type Props = {
  open: boolean;
  onClose: () => void;
  nodes: Node[];
  /** Solo lectura: logos y colores definidos en Brain (`metadata.assets`). */
  assetsMetadata: unknown;
  projectFiles?: ProjectFilesMetadata;
  generatedTextAssets?: GuionistaGeneratedTextAssetsMetadata;
  onOpenGuionistaTextAsset?: (assetId: string) => void;
  /** Scope del proyecto activo para aislar caché y listados. */
  projectScopeId: string;
};

function MediaTile({ item }: { item: ProjectMediaItem }) {
  const isVideo = item.kind === "video";

  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col overflow-hidden rounded-xl border border-white/10 bg-zinc-900/80 shadow-lg transition hover:border-amber-400/35 hover:bg-zinc-900"
    >
      <div className="relative aspect-video w-full bg-black/50">
        {isVideo ? (
          <video
            src={item.url}
            className="h-full w-full object-cover"
            muted
            playsInline
            preload="metadata"
          />
        ) : item.kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.url}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
            onError={(e) => {
              (e.target as HTMLImageElement).style.opacity = "0.2";
            }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-zinc-500">
            <FileQuestion className="h-8 w-8" strokeWidth={1.6} />
          </div>
        )}
        <span className="pointer-events-none absolute bottom-1 right-1 rounded bg-black/65 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-white/90">
          {isVideo ? "Vídeo" : item.kind === "audio" ? "Audio" : item.kind === "image" ? "Imagen" : "Archivo"}
        </span>
      </div>
      <div className="min-w-0 px-2 py-1.5">
        <p className="truncate text-[10px] font-semibold text-zinc-200" title={item.sourceLabel}>
          {item.sourceLabel}
        </p>
        <p className="truncate font-mono text-[8px] text-zinc-500" title={item.url}>
          {item.url.replace(/^https?:\/\//, "").slice(0, 56)}
          {item.url.length > 56 ? "…" : ""}
        </p>
      </div>
    </a>
  );
}

function MediaSection({
  title,
  subtitle,
  items,
  emptyHint,
}: {
  title: string;
  subtitle: string;
  items: ProjectMediaItem[];
  emptyHint: string;
}) {
  return (
    <section className="min-w-0 flex-1">
      <div className="mb-3 border-b border-white/10 pb-2">
        <h3 className="text-sm font-black uppercase tracking-[0.12em] text-amber-200/95">{title}</h3>
        <p className="mt-0.5 text-[11px] text-zinc-500">{subtitle}</p>
      </div>
      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-white/10 bg-white/[0.03] px-3 py-8 text-center text-[12px] text-zinc-500">
          {emptyHint}
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {items.map((item) => (
            <li key={item.id}>
              <MediaTile item={item} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function MediaFileTile({ file }: { file: ProjectFile }) {
  const extension = (file.extension || file.name.match(/\.[^.]+$/)?.[0] || file.kind).replace(/^\./, "").toUpperCase();
  return (
    <div className="group flex flex-col overflow-hidden rounded-xl border border-white/10 bg-zinc-900/80 p-3 shadow-lg">
      <div className="flex h-24 items-center justify-center rounded-lg border border-white/10 bg-black/45">
        <FolderOpen className="h-8 w-8 text-amber-200/80" strokeWidth={1.5} />
      </div>
      <div className="min-w-0 pt-2">
        <p className="truncate text-[10px] font-semibold text-zinc-200" title={file.name}>
          {file.name}
        </p>
        <p className="mt-1 text-[8px] font-black uppercase tracking-wide text-zinc-500">
          {extension} · {file.nodeType || file.kind}
        </p>
      </div>
    </div>
  );
}

function ProjectFilesSection({
  title,
  subtitle,
  emptyHint,
  items,
}: {
  title: string;
  subtitle: string;
  emptyHint: string;
  items: ProjectFile[];
}) {
  return (
    <section className="min-w-0 flex-1">
      <div className="mb-3 border-b border-white/10 pb-2">
        <h3 className="text-sm font-black uppercase tracking-[0.12em] text-amber-200/95">{title}</h3>
        <p className="mt-0.5 text-[11px] text-zinc-500">{subtitle}</p>
      </div>
      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-white/10 bg-white/[0.03] px-3 py-8 text-center text-[12px] text-zinc-500">
          {emptyHint}
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {items.map((item) => (
            <li key={item.id}>
              <MediaFileTile file={item} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function GuionistaTextTile({
  item,
  onOpen,
}: {
  item: GuionistaTextAsset;
  onOpen?: (assetId: string) => void;
}) {
  const activeIndex = Math.max(0, item.versions.findIndex((version) => version.id === item.activeVersionId));
  return (
    <button
      type="button"
      onDoubleClick={() => onOpen?.(item.id)}
      onClick={() => undefined}
      className="group flex min-h-36 flex-col rounded-xl border border-amber-200/10 bg-zinc-900/80 p-3 text-left shadow-lg transition hover:border-amber-300/35 hover:bg-zinc-900"
      title="Doble clic para abrir en Guionista"
    >
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-amber-200/15 bg-amber-200/8 text-amber-200">
          <BookOpen className="h-4 w-4" strokeWidth={1.6} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[10px] font-semibold text-zinc-200">{item.title}</p>
          <p className="text-[8px] font-black uppercase tracking-wide text-zinc-500">
            {GUI_FORMAT_LABELS[item.type]} · V{activeIndex + 1} · {item.status}
          </p>
        </div>
      </div>
      <p className="mt-3 line-clamp-3 text-[10px] leading-relaxed text-zinc-500">{item.preview}</p>
      <span className="mt-auto text-[9px] font-semibold uppercase tracking-wide text-amber-200/50 group-hover:text-amber-200/80">
        Abrir en Guionista
      </span>
    </button>
  );
}

function groupGuionistaAssetsByFolder(assets: GuionistaTextAsset[]): Array<{ type: GuionistaFormat; folder: string; items: GuionistaTextAsset[] }> {
  const order = Object.keys(GUI_FORMAT_FOLDERS) as GuionistaFormat[];
  return order
    .map((type) => ({
      type,
      folder: GUI_FORMAT_FOLDERS[type],
      items: assets.filter((asset) => asset.type === type),
    }))
    .filter((group) => group.items.length > 0);
}

function GeneratedTextsSection({
  items,
  onOpen,
}: {
  items: GuionistaTextAsset[];
  onOpen?: (assetId: string) => void;
}) {
  return (
    <section className="min-w-0 flex-1">
      <div className="mb-3 border-b border-white/10 pb-2">
        <h4 className="text-[11px] font-black uppercase tracking-[0.12em] text-amber-100/70">Texts / Guionista</h4>
        <p className="mt-0.5 text-[11px] text-zinc-500">Posts, artículos, guiones, escenas, slides, campañas y reescrituras.</p>
      </div>
      {items.length === 0 ? null : (
        <div className="space-y-5">
          {groupGuionistaAssetsByFolder(items).map((group) => (
            <div key={group.type}>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{group.folder}</p>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {group.items.map((item) => (
                  <li key={item.id}>
                    <GuionistaTextTile item={item} onOpen={onOpen} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function BrandReadonlyStrip({ assetsMetadata }: { assetsMetadata: unknown }) {
  const brand = useMemo(() => normalizeProjectAssets(assetsMetadata).brand, [assetsMetadata]);

  return (
    <section
      className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 sm:px-5"
      aria-label="Identidad de marca desde Brain, solo consulta"
    >
      <p className="mb-3 text-[10px] font-black uppercase tracking-[0.12em] text-zinc-500">
        Marca <span className="font-medium normal-case text-zinc-600">(desde Brain · no editable aquí)</span>
      </p>
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:gap-6">
        <div className="flex flex-wrap gap-4">
          <div className="min-w-0">
            <p className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-zinc-500">Logo +</p>
            <div className="flex h-14 w-[4.5rem] items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-zinc-950/80">
              {brand.logoPositive ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={brand.logoPositive} alt="" className="max-h-full max-w-full object-contain p-1" />
              ) : (
                <span className="text-[9px] text-zinc-600">—</span>
              )}
            </div>
          </div>
          <div className="min-w-0">
            <p className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-zinc-500">Logo −</p>
            <div className="flex h-14 w-[4.5rem] items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-zinc-900/90">
              {brand.logoNegative ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={brand.logoNegative} alt="" className="max-h-full max-w-full object-contain p-1" />
              ) : (
                <span className="text-[9px] text-zinc-600">—</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3 sm:gap-4">
          {(
            [
              { key: "pri", label: "Pri.", hex: brand.colorPrimary },
              { key: "sec", label: "Sec.", hex: brand.colorSecondary },
              { key: "acc", label: "Acento", hex: brand.colorAccent },
            ] as const
          ).map(({ key, label, hex }) => {
            const ok = typeof hex === "string" && /^#[0-9A-Fa-f]{6}$/i.test(hex.trim());
            return (
              <div key={key} className="flex flex-col items-center gap-1">
                <span className="text-[8px] font-medium uppercase tracking-wide text-zinc-500">{label}</span>
                <span
                  className="h-7 w-7 shrink-0 rounded-md border border-white/15 shadow-inner ring-1 ring-black/20"
                  style={{ backgroundColor: ok ? hex : "transparent" }}
                  title={ok ? hex : "Sin color"}
                />
                <span className="font-mono text-[8px] leading-none text-zinc-500">{ok ? hex : "—"}</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function ProjectAssetsFullscreen({ open, onClose, nodes, assetsMetadata, projectFiles, generatedTextAssets, onOpenGuionistaTextAsset, projectScopeId }: Props) {
  const { importedMedia: imported, generatedMedia: generated, generatedTexts, mediaFiles, exports } = useMemo(
    () => collectFoldderLibrarySections({ nodes, assetsMetadata, projectScopeId, projectFiles, generatedTextAssets }),
    [nodes, assetsMetadata, projectScopeId, projectFiles, generatedTextAssets],
  );
  const [refreshedUrls, setRefreshedUrls] = useState<Record<string, string>>({});
  const viewImported = useMemo(
    () =>
      imported.map((it) => {
        const key = tryExtractKnowledgeFilesKeyFromUrl(it.url.trim());
        if (!key || !refreshedUrls[key]) return it;
        return { ...it, url: refreshedUrls[key] };
      }),
    [imported, refreshedUrls],
  );
  const viewGenerated = useMemo(
    () =>
      generated.map((it) => {
        const key = tryExtractKnowledgeFilesKeyFromUrl(it.url.trim());
        if (!key || !refreshedUrls[key]) return it;
        return { ...it, url: refreshedUrls[key] };
      }),
    [generated, refreshedUrls],
  );

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const all = [...imported, ...generated];
    const keyByUrl = new Map<string, string>();
    const keys = new Set<string>();
    for (const item of all) {
      const url = item.url.trim();
      const key = tryExtractKnowledgeFilesKeyFromUrl(url);
      if (!key) continue;
      keyByUrl.set(url, key);
      keys.add(key);
    }
    if (keys.size === 0) return;

    (async () => {
      try {
        const res = await fetch("/api/spaces/s3-presign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keys: Array.from(keys) }),
        });
        if (!res.ok) return;
        const payload = (await res.json()) as { urls?: Record<string, string> };
        const urls = payload.urls;
        if (!urls || cancelled) return;
        setRefreshedUrls((prev) => ({ ...prev, ...urls }));
      } catch {
        // Keep stale URLs silently; caller can close/reopen to retry.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, imported, generated]);

  useEffect(() => {
    if (!open) return;
    document.body.classList.add("nb-studio-open");
    return () => document.body.classList.remove("nb-studio-open");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const shell = (
    <div
      className="fixed inset-0 z-[100080] flex flex-col bg-[#0c0e12]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="project-assets-media-title"
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-zinc-950/90 px-4 py-3 backdrop-blur-md sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-500/25 bg-amber-500/10">
            <FolderOpen className="h-5 w-5 text-amber-300" strokeWidth={1.75} aria-hidden />
          </span>
          <div className="min-w-0">
            <h1 id="project-assets-media-title" className="text-base font-black uppercase tracking-wide text-zinc-100">
              Foldder
            </h1>
            <p className="text-[11px] text-zinc-500">
              Vista ampliada del contenedor vivo del proyecto
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex shrink-0 items-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-3 py-2 text-[12px] font-bold uppercase tracking-wide text-zinc-200 transition hover:bg-white/12"
        >
          <X className="h-4 w-4" strokeWidth={2} aria-hidden />
          Cerrar
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-8">
          <BrandReadonlyStrip assetsMetadata={assetsMetadata} />
          <MediaSection
            title="Imported Media"
            subtitle="Archivos que entran desde fuera: uploads, URLs, Pinterest, logos, PDFs, documentos de marca y referencias."
            items={viewImported}
            emptyHint="Aún no hay elementos importados visibles en este proyecto."
          />
          <MediaSection
            title="Generated Media"
            subtitle="Resultados generados por nodos: imágenes IA, vídeos IA, renders, variaciones, Background Remover, VFX, etc."
            items={viewGenerated}
            emptyHint="Aún no hay elementos generados en este proyecto."
          />
          {generatedTexts.length > 0 && (
            <GeneratedTextsSection items={generatedTexts} onOpen={onOpenGuionistaTextAsset} />
          )}
          <ProjectFilesSection
            title="Media Files"
            subtitle="Trabajos editables creados dentro de apps: .design, .photoroom, .painter, .presenter, etc."
            emptyHint="Aún no hay archivos editables guardados en Foldder."
            items={mediaFiles}
          />
          <ProjectFilesSection
            title="Exports"
            subtitle="Archivos finales exportados desde Foldder: PNG, JPG, PDF, vídeo o entregables listos para usar."
            emptyHint="Aún no hay exports persistidos en Foldder."
            items={exports}
          />
          <p className="mt-10 pb-4 text-center text-[11px] text-zinc-600">
            Esta es la misma entidad que el nodo <span className="font-semibold text-zinc-500">Foldder</span> de Vista Pro.
            La fuente de verdad sigue en <code className="rounded bg-black/30 px-1">metadata.assets</code>, el grafo y
            <code className="rounded bg-black/30 px-1">metadata.projectFiles</code>.
          </p>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(shell, document.body);
}
