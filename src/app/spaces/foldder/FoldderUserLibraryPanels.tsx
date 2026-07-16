"use client";

/* eslint-disable @next/next/no-img-element */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  LayoutTemplate,
  Loader2,
  Palette,
  Trash2,
  Upload,
  Workflow,
} from "lucide-react";
import type { DesignerPageState } from "../designer/DesignerNode";
import type { BrandKitDocument } from "@/lib/brandkit/brand-kit-types";
import { normalizeBrandKitDocument } from "@/lib/brandkit/brand-kit-defaults";
import {
  addImageToLibrary,
  deleteInspirationLibraryItem,
  fetchInspirationBrandKit,
  fetchInspirationFlow,
  fetchInspirationTemplatePages,
  listInspirationLibrary,
  subscribeInspirationLibraryUpdated,
  type InspirationLibraryItem,
} from "../inspiration/inspiration-library-api";
import { uploadProjectMediaFile } from "../project-media-s3-save";
import { FoldderLibraryEmptyState } from "./FoldderLibraryStudioChrome";

export type FoldderUserLibrarySection = "templates" | "flows" | "brandKits";

type InsertHandlers = {
  onInsertDesignerTemplate: (args: { pages: DesignerPageState[]; title: string }) => void;
  onInsertLibraryImage: (args: { imageUrl: string; title: string }) => void;
  onInsertFlow: (args: { nodes: unknown[]; edges: unknown[]; title: string }) => void;
  onInsertBrandKit: (args: { brandKit: BrandKitDocument; title: string }) => void;
};

export function FoldderUserLibraryPanels({
  section,
  projectId,
  onClose,
  onInsertDesignerTemplate,
  onInsertLibraryImage,
  onInsertFlow,
  onInsertBrandKit,
}: {
  section: FoldderUserLibrarySection;
  projectId: string | null;
  onClose?: () => void;
} & InsertHandlers) {
  const [libraryItems, setLibraryItems] = useState<InspirationLibraryItem[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [libraryBusyId, setLibraryBusyId] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const libraryLoadedRef = useRef(false);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  const reloadLibrary = useCallback(async () => {
    setLibraryLoading(true);
    setLibraryError(null);
    try {
      const items = await listInspirationLibrary();
      setLibraryItems(items);
      libraryLoadedRef.current = true;
    } catch (error) {
      setLibraryError(error instanceof Error ? error.message : "No se pudo cargar la librería.");
    } finally {
      setLibraryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!libraryLoadedRef.current) void reloadLibrary();
  }, [reloadLibrary]);

  useEffect(() => {
    return subscribeInspirationLibraryUpdated(() => {
      libraryLoadedRef.current = false;
      void reloadLibrary();
    });
  }, [reloadLibrary]);

  const templateItems = useMemo(
    () => libraryItems.filter((i) => i.kind === "designer-template" || i.kind === "image"),
    [libraryItems],
  );
  const flowItems = useMemo(() => libraryItems.filter((i) => i.kind === "flow"), [libraryItems]);
  const brandKitItems = useMemo(
    () => libraryItems.filter((i) => i.kind === "brand-kit"),
    [libraryItems],
  );

  const insertTemplate = useCallback(
    async (item: InspirationLibraryItem) => {
      setLibraryBusyId(item.id);
      try {
        const pages = await fetchInspirationTemplatePages(item.id);
        if (!pages.length) throw new Error("La plantilla está vacía.");
        onInsertDesignerTemplate({ pages, title: item.title });
        onClose?.();
      } catch (error) {
        setLibraryError(error instanceof Error ? error.message : "No se pudo insertar la plantilla.");
      } finally {
        setLibraryBusyId(null);
      }
    },
    [onClose, onInsertDesignerTemplate],
  );

  const insertFlowItem = useCallback(
    async (item: InspirationLibraryItem) => {
      setLibraryBusyId(item.id);
      try {
        const flow = await fetchInspirationFlow(item.id);
        if (!flow.nodes.length) throw new Error("El flujo está vacío.");
        onInsertFlow({ nodes: flow.nodes, edges: flow.edges, title: item.title });
        onClose?.();
      } catch (error) {
        setLibraryError(error instanceof Error ? error.message : "No se pudo insertar el flujo.");
      } finally {
        setLibraryBusyId(null);
      }
    },
    [onClose, onInsertFlow],
  );

  const insertBrandKitItem = useCallback(
    async (item: InspirationLibraryItem) => {
      setLibraryBusyId(item.id);
      try {
        const raw = await fetchInspirationBrandKit(item.id);
        if (!raw || typeof raw !== "object") throw new Error("El BrandKit está vacío.");
        const brandKit = normalizeBrandKitDocument(raw);
        onInsertBrandKit({ brandKit, title: item.title });
        onClose?.();
      } catch (error) {
        setLibraryError(error instanceof Error ? error.message : "No se pudo abrir el BrandKit.");
      } finally {
        setLibraryBusyId(null);
      }
    },
    [onClose, onInsertBrandKit],
  );

  const selectLibraryImage = useCallback(
    (item: InspirationLibraryItem) => {
      if (!item.imageUrl) return;
      onInsertLibraryImage({ imageUrl: item.imageUrl, title: item.title });
      onClose?.();
    },
    [onClose, onInsertLibraryImage],
  );

  const removeLibraryItem = useCallback(async (item: InspirationLibraryItem) => {
    if (!window.confirm(`¿Eliminar "${item.title}" de Foldder?`)) return;
    setLibraryBusyId(item.id);
    try {
      await deleteInspirationLibraryItem(item.id);
      setLibraryItems((prev) => prev.filter((x) => x.id !== item.id));
    } catch (error) {
      setLibraryError(error instanceof Error ? error.message : "No se pudo eliminar.");
    } finally {
      setLibraryBusyId(null);
    }
  }, []);

  const handleUploadFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
      if (list.length === 0) return;
      setUploadingImage(true);
      setLibraryError(null);
      try {
        for (const file of list) {
          const uploaded = await uploadProjectMediaFile(file, {
            projectId,
            policy: { preserveImageQuality: true },
          });
          await addImageToLibrary({
            title: file.name.replace(/\.[a-z0-9]+$/i, "") || "Imagen",
            thumbUrl: uploaded.url,
            thumbS3Key: uploaded.s3Key,
            imageUrl: uploaded.url,
            imageS3Key: uploaded.s3Key,
          });
        }
        await reloadLibrary();
      } catch (error) {
        setLibraryError(error instanceof Error ? error.message : "No se pudo subir la imagen.");
      } finally {
        setUploadingImage(false);
      }
    },
    [projectId, reloadLibrary],
  );

  if (section === "templates") {
    return (
      <>
        <div className="mb-4 flex flex-wrap items-center gap-2 border-b border-white/10 pb-3">
          <span className="text-[8px] font-black uppercase tracking-[0.14em] text-white/35">Mis Templates</span>
          <p className="text-[9px] font-semibold uppercase tracking-[0.06em] text-white/40">
            Plantillas Designer e imágenes
          </p>
          <div className="ml-auto flex items-center gap-2">
            <input
              ref={uploadInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(event) => {
                if (event.target.files) void handleUploadFiles(event.target.files);
                event.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => uploadInputRef.current?.click()}
              disabled={uploadingImage}
              className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-[9px] font-black uppercase tracking-[0.06em] text-slate-950 transition hover:bg-white/90 disabled:opacity-50"
            >
              {uploadingImage ? (
                <Loader2 size={11} className="animate-spin" aria-hidden />
              ) : (
                <Upload size={11} aria-hidden />
              )}
              Subir imagen
            </button>
          </div>
        </div>

        {libraryError ? (
          <div className="mb-3 border border-rose-500/30 bg-rose-500/15 px-3 py-1.5 text-[10px] font-semibold text-rose-100">
            {libraryError}
          </div>
        ) : null}

        <div
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
          }}
          onDrop={(event) => {
            event.preventDefault();
            if (event.dataTransfer.files?.length) void handleUploadFiles(event.dataTransfer.files);
          }}
        >
          {libraryLoading && templateItems.length === 0 ? (
            <LoadingState label="Cargando librería…" />
          ) : templateItems.length === 0 ? (
            <FoldderLibraryEmptyState hint="Guarda plantillas desde un nodo Designer (A Inspiración) o sube imágenes aquí.">
              Tu librería de templates está vacía
            </FoldderLibraryEmptyState>
          ) : (
            <div className="inspiration-masonry columns-2 gap-2 sm:columns-3 lg:columns-4 xl:columns-5 [&>*]:mb-2">
              {templateItems.map((item) => {
                const isTemplate = item.kind === "designer-template";
                const itemBusy = libraryBusyId === item.id;
                return (
                  <div
                    key={item.id}
                    className="group relative block w-full break-inside-avoid overflow-hidden rounded-md bg-black/60 ring-1 ring-white/8"
                    style={
                      item.width && item.height
                        ? { aspectRatio: `${item.width} / ${item.height}` }
                        : undefined
                    }
                  >
                    <img
                      src={item.thumbUrl}
                      alt={item.title}
                      className="block h-auto w-full object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                    <span className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[7px] font-black uppercase tracking-[0.1em] text-white/80 backdrop-blur-sm">
                      {isTemplate ? <LayoutTemplate size={9} /> : null}
                      {isTemplate ? `${item.pageCount ?? 1} slides` : "Imagen"}
                    </span>
                    <button
                      type="button"
                      onClick={() => void removeLibraryItem(item)}
                      disabled={itemBusy}
                      title="Eliminar"
                      className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded bg-black/55 text-white/70 opacity-0 transition hover:bg-rose-600 hover:text-white group-hover:opacity-100"
                    >
                      <Trash2 size={11} aria-hidden />
                    </button>
                    <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1.5 bg-gradient-to-t from-black/85 to-transparent px-2 pb-2 pt-6 opacity-0 transition group-hover:opacity-100">
                      <p className="truncate text-[10px] text-white/85">{item.title}</p>
                      <button
                        type="button"
                        onClick={() => (isTemplate ? void insertTemplate(item) : selectLibraryImage(item))}
                        disabled={itemBusy}
                        className="inline-flex w-fit items-center gap-1.5 bg-white px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.08em] text-slate-950 transition hover:bg-white/90 disabled:opacity-60"
                      >
                        {itemBusy ? (
                          <Loader2 size={10} className="animate-spin" aria-hidden />
                        ) : isTemplate ? (
                          <LayoutTemplate size={10} aria-hidden />
                        ) : (
                          <Check size={10} aria-hidden />
                        )}
                        {isTemplate ? "Insertar Designer" : "Usar imagen"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </>
    );
  }

  if (section === "flows") {
    return (
      <>
        <div className="mb-4 flex flex-wrap items-center gap-2 border-b border-white/10 pb-3">
          <span className="text-[8px] font-black uppercase tracking-[0.14em] text-white/35">Mis flujos</span>
          <p className="text-[9px] font-semibold uppercase tracking-[0.06em] text-white/40">
            Conjuntos de nodos conectados, reutilizables
          </p>
        </div>

        {libraryError ? (
          <div className="mb-3 border border-rose-500/30 bg-rose-500/15 px-3 py-1.5 text-[10px] font-semibold text-rose-100">
            {libraryError}
          </div>
        ) : null}

        {libraryLoading && flowItems.length === 0 ? (
          <LoadingState label="Cargando flujos…" />
        ) : flowItems.length === 0 ? (
          <FoldderLibraryEmptyState hint="Clic derecho en un nodo del canvas → Guardar flujo en Inspiración.">
            Aún no has guardado flujos
          </FoldderLibraryEmptyState>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {flowItems.map((item) => {
              const itemBusy = libraryBusyId === item.id;
              return (
                <div
                  key={item.id}
                  className="group relative flex flex-col overflow-hidden rounded-lg border border-white/10 bg-gradient-to-br from-emerald-500/10 via-white/[0.03] to-white/[0.02] p-3 transition hover:border-emerald-400/40"
                >
                  <button
                    type="button"
                    onClick={() => void removeLibraryItem(item)}
                    disabled={itemBusy}
                    title="Eliminar flujo"
                    className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded bg-black/45 text-white/60 opacity-0 transition hover:bg-rose-600 hover:text-white group-hover:opacity-100"
                  >
                    <Trash2 size={11} aria-hidden />
                  </button>
                  <div className="flex items-center gap-2">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/30">
                      <Workflow size={16} aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[12px] font-bold text-white/90">{item.title}</p>
                      <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-white/45">
                        {item.nodeCount ?? 0} {item.nodeCount === 1 ? "nodo" : "nodos"}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void insertFlowItem(item)}
                    disabled={itemBusy}
                    className="mt-3 inline-flex items-center justify-center gap-1.5 rounded-md bg-white px-2.5 py-1.5 text-[9px] font-black uppercase tracking-[0.08em] text-slate-950 transition hover:bg-white/90 disabled:opacity-60"
                  >
                    {itemBusy ? (
                      <Loader2 size={11} className="animate-spin" aria-hidden />
                    ) : (
                      <Workflow size={11} aria-hidden />
                    )}
                    Insertar flujo
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2 border-b border-white/10 pb-3">
        <span className="text-[8px] font-black uppercase tracking-[0.14em] text-white/35">Mis BrandKits</span>
        <p className="text-[9px] font-semibold uppercase tracking-[0.06em] text-white/40">
          Marcas guardadas desde BrandKit Studio
        </p>
      </div>

      {libraryError ? (
        <div className="mb-3 border border-rose-500/30 bg-rose-500/15 px-3 py-1.5 text-[10px] font-semibold text-rose-100">
          {libraryError}
        </div>
      ) : null}

      {libraryLoading && brandKitItems.length === 0 ? (
        <LoadingState label="Cargando BrandKits…" accent="amber" />
      ) : brandKitItems.length === 0 ? (
        <FoldderLibraryEmptyState hint="Abre BrandKit Studio y usa Guardar en Mis BrandKits.">
          Aún no has guardado BrandKits
        </FoldderLibraryEmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {brandKitItems.map((item) => {
            const itemBusy = libraryBusyId === item.id;
            return (
              <div
                key={item.id}
                className="group relative flex flex-col overflow-hidden rounded-lg border border-white/10 bg-gradient-to-br from-amber-500/10 via-white/[0.03] to-white/[0.02] p-3 transition hover:border-amber-400/40"
              >
                <button
                  type="button"
                  onClick={() => void removeLibraryItem(item)}
                  disabled={itemBusy}
                  title="Eliminar BrandKit"
                  className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded bg-black/45 text-white/60 opacity-0 transition hover:bg-rose-600 hover:text-white group-hover:opacity-100"
                >
                  <Trash2 size={11} aria-hidden />
                </button>
                <div className="flex items-center gap-2">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-amber-500/15 ring-1 ring-amber-400/30">
                    {item.thumbUrl ? (
                      <img
                        src={item.thumbUrl}
                        alt=""
                        className="h-full w-full object-contain"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <Palette size={18} className="text-amber-200" aria-hidden />
                    )}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[12px] font-bold text-white/90">{item.title}</p>
                    <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-white/45">
                      {typeof item.completenessPercent === "number"
                        ? `${item.completenessPercent}% ADN`
                        : "BrandKit"}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void insertBrandKitItem(item)}
                  disabled={itemBusy}
                  className="mt-3 inline-flex items-center justify-center gap-1.5 rounded-md bg-white px-2.5 py-1.5 text-[9px] font-black uppercase tracking-[0.08em] text-slate-950 transition hover:bg-white/90 disabled:opacity-60"
                >
                  {itemBusy ? (
                    <Loader2 size={11} className="animate-spin" aria-hidden />
                  ) : (
                    <Palette size={11} aria-hidden />
                  )}
                  Abrir BrandKit
                </button>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function LoadingState({ label, accent = "emerald" }: { label: string; accent?: "emerald" | "amber" }) {
  return (
    <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 text-white/45">
      <Loader2
        size={22}
        className={`animate-spin ${accent === "amber" ? "text-amber-300" : "text-emerald-300"}`}
      />
      <span className="text-[10px] font-black uppercase tracking-[0.12em]">{label}</span>
    </div>
  );
}

/** Counts for Foldder tab badges (lightweight list fetch). */
export function useFoldderUserLibraryCounts(enabled: boolean) {
  const [counts, setCounts] = useState({ templates: 0, flows: 0, brandKits: 0 });

  const refresh = useCallback(async () => {
    try {
      const items = await listInspirationLibrary();
      setCounts({
        templates: items.filter((i) => i.kind === "designer-template" || i.kind === "image").length,
        flows: items.filter((i) => i.kind === "flow").length,
        brandKits: items.filter((i) => i.kind === "brand-kit").length,
      });
    } catch {
      /* keep previous */
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
    return subscribeInspirationLibraryUpdated(() => {
      void refresh();
    });
  }, [enabled, refresh]);

  return counts;
}
