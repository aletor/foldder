"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { Node } from "@xyflow/react";
import { FolderOpen, X } from "lucide-react";
import { collectProjectMedia, projectMediaDedupeKey, type ProjectMediaItem } from "./project-media-inventory";
import { normalizeProjectAssets } from "./project-assets-metadata";
import { listAllBrainGeneratedSuggestionUrls } from "./brain-image-suggestions-cache";
import { tryExtractKnowledgeFilesKeyFromUrl } from "@/lib/s3-media-hydrate";

type Props = {
  open: boolean;
  onClose: () => void;
  nodes: Node[];
  /** Solo lectura: logos y colores definidos en Brain (`metadata.assets`). */
  assetsMetadata: unknown;
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
        ) : (
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
        )}
        <span className="pointer-events-none absolute bottom-1 right-1 rounded bg-black/65 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-white/90">
          {isVideo ? "Vídeo" : item.kind === "audio" ? "Audio" : "Imagen"}
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

export function ProjectAssetsFullscreen({ open, onClose, nodes, assetsMetadata, projectScopeId }: Props) {
  const { imported, generated } = useMemo(() => {
    const base = collectProjectMedia(nodes);
    const seen = new Set(
      base.generated.map((g) => projectMediaDedupeKey(g.url.trim())).filter(Boolean),
    );
    const extra: ProjectMediaItem[] = [];
    for (const url of listAllBrainGeneratedSuggestionUrls(projectScopeId)) {
      const key = url.trim();
      const dedupe = projectMediaDedupeKey(key);
      if (!key || !dedupe || seen.has(dedupe)) continue;
      seen.add(dedupe);
      extra.push({
        id: `brain-generated-${seen.size}-${key.slice(0, 32)}`,
        url: key,
        kind: "image",
        sourceLabel: "Brain · sugerencia IA",
        nodeId: "brain-cache",
      });
    }
    const assets = normalizeProjectAssets(assetsMetadata);
    const visualDnaSlots = assets.strategy.visualDnaSlots ?? [];
    for (const slot of visualDnaSlots) {
      const key = slot.mosaic?.imageUrl?.trim();
      const dedupe = key ? projectMediaDedupeKey(key) : "";
      if (!key || !dedupe || seen.has(dedupe)) continue;
      seen.add(dedupe);
      extra.push({
        id: `brain-visual-dna-slot-${slot.id}`,
        url: key,
        kind: "image",
        sourceLabel: `Brain · ADN por imagen (${slot.label || "slot"})`,
        nodeId: "brain-visual-dna-slot",
      });
    }
    return { imported: base.imported, generated: [...base.generated, ...extra] };
  }, [nodes, projectScopeId, assetsMetadata]);
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
              Vista de marca (solo lectura) y multimedia del lienzo
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
          <div className="flex flex-col gap-10 lg:flex-row lg:gap-12">
          <MediaSection
            title="Importados"
            subtitle="Archivos que has añadido: subidas, URLs, contenido en Designer/Presenter, etc."
            items={viewImported}
            emptyHint="Aún no hay elementos importados visibles en este proyecto."
          />
          <MediaSection
            title="Generados"
            subtitle="Salidas del sistema: Image/Video/VFX, Grok, historial graph-run, etc."
            items={viewGenerated}
            emptyHint="Aún no hay elementos generados en este proyecto."
          />
          </div>
          <p className="mt-10 pb-4 text-center text-[11px] text-zinc-600">
            Para editar logos y colores abre <span className="font-semibold text-zinc-500">Brain</span>. La lista de
            multimedia refleja el grafo actual; guarda el proyecto para persistir.
          </p>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(shell, document.body);
}
