"use client";

import { useEffect, useMemo, useState } from "react";
import { FolderOpen, Upload } from "lucide-react";
import { tryExtractKnowledgeFilesKeyFromUrl } from "@/lib/s3-media-hydrate";
import { useProjectAssetsCanvas } from "../project-assets-canvas-context";
import { listStudioFoldderImages } from "./studio-foldder-images";

export function StudioRefSourceButtons({
  size = "sm",
  disabled,
  onPc,
  onFoldder,
}: {
  size?: "sm" | "lg";
  disabled?: boolean;
  onPc: () => void;
  onFoldder: () => void;
}) {
  const box = size === "lg" ? "h-10 w-10" : "h-7 w-7";
  const icon = size === "lg" ? 16 : 12;
  const btn = `${box} flex items-center justify-center border border-white/15 text-white/45 hover:border-white/40 hover:text-white disabled:opacity-30`;
  return (
    <div className="flex items-center gap-1" data-studio-overlay-ui data-foldder-i18n-ignore>
      <button
        type="button"
        disabled={disabled}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={onPc}
        className={btn}
        title="Subir desde el ordenador"
        aria-label="Subir desde el ordenador"
      >
        <Upload size={icon} />
      </button>
      <button
        type="button"
        disabled={disabled}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={onFoldder}
        className={btn}
        title="Abrir desde Foldder"
        aria-label="Abrir desde Foldder"
      >
        <FolderOpen size={icon} />
      </button>
    </div>
  );
}

export function StudioFoldderImagePicker({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (url: string) => void;
}) {
  const ctx = useProjectAssetsCanvas();
  const images = useMemo(
    () =>
      listStudioFoldderImages({
        nodes: ctx?.flowNodes,
        assetsMetadata: ctx?.assetsMetadata,
        projectScopeId: ctx?.projectScopeId,
        projectFiles: ctx?.projectFiles,
        generatedTextAssets: ctx?.generatedTextAssets,
      }),
    [ctx?.assetsMetadata, ctx?.flowNodes, ctx?.generatedTextAssets, ctx?.projectFiles, ctx?.projectScopeId],
  );
  const [refreshed, setRefreshed] = useState<Record<string, string>>({});
  const [broken, setBroken] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, open]);

  useEffect(() => {
    if (!open) return;
    const keys = new Set<string>();
    for (const item of images) {
      const key = tryExtractKnowledgeFilesKeyFromUrl(item.url.trim());
      if (key) keys.add(key);
    }
    if (keys.size === 0) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/spaces/s3-presign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keys: Array.from(keys) }),
        });
        if (!res.ok) return;
        const payload = (await res.json().catch(() => ({}))) as { urls?: Record<string, string> };
        if (!payload.urls || cancelled) return;
        setRefreshed((prev) => ({ ...prev, ...payload.urls }));
      } catch {
        /* keep original URLs */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [images, open]);

  const view = useMemo(
    () =>
      images
        .map((item) => {
          const original = item.url.trim();
          const key = tryExtractKnowledgeFilesKeyFromUrl(original);
          const url = (key && refreshed[key] ? refreshed[key] : original).trim();
          return { ...item, url, original };
        })
        .filter((item) => !broken[item.url]),
    [broken, images, refreshed],
  );

  if (!open) return null;

  return (
    <div
      className="absolute inset-0 z-[100110] flex items-center justify-center bg-black/70 p-4"
      data-foldder-i18n-ignore
      data-studio-overlay-ui
      onPointerDown={(event) => event.stopPropagation()}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="studio-foldder-picker-title"
        className="relative z-10 flex max-h-[80%] w-full max-w-3xl flex-col border border-white/15 bg-[#0c0d11]"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex h-10 shrink-0 items-center justify-between border-b border-white/10 px-3">
          <h2 id="studio-foldder-picker-title" className="text-[10px] font-black uppercase tracking-[0.12em] text-white/80">
            Abrir desde Foldder
          </h2>
          <button type="button" onClick={onClose} className="px-2 text-[10px] font-black uppercase tracking-widest text-white/50 hover:text-white">
            Cerrar
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {view.length === 0 ? (
            <p className="px-2 py-8 text-center text-[12px] text-white/45">
              {images.length === 0
                ? "No hay imágenes en el proyecto todavía."
                : "No se pudieron mostrar las miniaturas."}
            </p>
          ) : (
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {view.map((item, index) => (
                <li key={`${item.id}::${item.url}::${index}`}>
                  <button
                    type="button"
                    title={item.sourceLabel}
                    onClick={() => onPick(item.url)}
                    className="group w-full overflow-hidden border border-white/10 bg-white/[0.03] text-left hover:border-white/40"
                  >
                    <img
                      src={item.url}
                      alt=""
                      className="h-20 w-full object-cover"
                      loading="lazy"
                      onError={(event) => {
                        const failed = (event.currentTarget.currentSrc || item.url).trim();
                        if (!failed) return;
                        setBroken((prev) => (prev[failed] ? prev : { ...prev, [failed]: true }));
                      }}
                    />
                    <p className="truncate px-1.5 py-1 text-[9px] text-white/50">{item.sourceLabel}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
