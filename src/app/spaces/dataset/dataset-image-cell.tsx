"use client";

import React, { useCallback, useContext, useMemo, useRef, useState } from "react";
import { History, ImageIcon, X } from "lucide-react";
import { restoreImageCellFromHistory } from "./dataset-image-history";
import { uploadProjectMediaFile } from "../project-media-s3-save";
import type { FieldValue } from "./dataset-types";

/** Tamaño fijo de miniatura en todas las celdas imagen del Dataset. */
export const DATASET_IMAGE_THUMB_PX = 48;

/**
 * Contexto con el `projectId` del Studio para subir las imágenes del Dataset a S3 al añadirlas.
 * Sin él, las imágenes se quedarían como data URL gigante dentro del documento del proyecto, que el
 * pipeline de guardado (materialización / compactación) puede degradar o descartar — provocando que
 * la imagen "desaparezca" o se quede en enlace roto al rato. Subir a S3 al añadir las hace estables.
 */
const DatasetImageUploadContext = React.createContext<{ projectId: string | null }>({
  projectId: null,
});

export function DatasetImageUploadProvider({
  projectId,
  children,
}: {
  projectId: string | null;
  children: React.ReactNode;
}) {
  const value = useMemo(() => ({ projectId }), [projectId]);
  return (
    <DatasetImageUploadContext.Provider value={value}>{children}</DatasetImageUploadContext.Provider>
  );
}

function fileToImageValue(file: File): Promise<Extract<FieldValue, { type: "image" }>> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Solo imágenes"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const url = typeof reader.result === "string" ? reader.result : "";
      const assetId = `img_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const img = new Image();
      img.onload = () => {
        resolve({ type: "image", assetId, url, w: img.naturalWidth, h: img.naturalHeight });
      };
      img.onerror = () => resolve({ type: "image", assetId, url });
      img.src = url;
    };
    reader.onerror = () => reject(reader.error ?? new Error("No se pudo leer el archivo"));
    reader.readAsDataURL(file);
  });
}

function extractImageUrlFromDataTransfer(dt: DataTransfer): string | null {
  const uri = dt.getData("text/uri-list") || dt.getData("text/plain");
  if (uri && /^https?:\/\//i.test(uri.trim())) return uri.trim();
  const html = dt.getData("text/html");
  const m = html.match(/src=["']([^"']+)["']/i);
  if (m?.[1] && /^https?:\/\//i.test(m[1])) return m[1];
  return null;
}

type DatasetImageCellProps = {
  value: FieldValue;
  onChange: (value: FieldValue) => void;
  compact?: boolean;
};

export function DatasetImageCell({ value, onChange, compact }: DatasetImageCellProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const { projectId } = useContext(DatasetImageUploadContext);
  const url = value.type === "image" ? value.url : "";
  const hasImage = Boolean(url?.trim());
  const history =
    value.type === "image" && Array.isArray(value.generationHistory)
      ? value.generationHistory.filter((entry) => entry.url?.trim())
      : [];
  const [historyOpen, setHistoryOpen] = useState(false);

  const applyImage = useCallback(
    (nextUrl: string, extra?: { w?: number; h?: number }) => {
      const trimmed = nextUrl.trim();
      if (!trimmed) {
        onChange({ type: "image", assetId: "", url: "" });
        return;
      }
      const assetId =
        value.type === "image" && value.assetId ? value.assetId : `img_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      onChange({
        type: "image",
        assetId,
        url: trimmed,
        w: extra?.w ?? (value.type === "image" ? value.w : undefined),
        h: extra?.h ?? (value.type === "image" ? value.h : undefined),
      });
    },
    [onChange, value],
  );

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const file = Array.from(files).find((f) => f.type.startsWith("image/"));
      if (!file) return;
      let preview: Extract<FieldValue, { type: "image" }>;
      try {
        preview = await fileToImageValue(file);
      } catch {
        return;
      }
      // Vista previa optimista inmediata (data URL) mientras sube.
      onChange(preview);
      // Sin proyecto a mano: se conserva el data URL (comportamiento anterior).
      if (!projectId) return;
      setUploading(true);
      try {
        const uploaded = await uploadProjectMediaFile(file, {
          mediaId: preview.assetId,
          projectId,
          policy: { preserveImageQuality: true },
        });
        onChange({
          type: "image",
          assetId: preview.assetId,
          url: uploaded.url,
          s3Key: uploaded.s3Key,
          w: preview.w,
          h: preview.h,
        });
      } catch (err) {
        // La subida falló (sin S3 / sin red): se conserva el data URL ya aplicado.
        console.warn("[Dataset] No se pudo subir la imagen a S3; se conserva inline.", err);
      } finally {
        setUploading(false);
      }
    },
    [onChange, projectId],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      if (e.dataTransfer.files?.length) {
        void handleFiles(e.dataTransfer.files);
        return;
      }
      const droppedUrl = extractImageUrlFromDataTransfer(e.dataTransfer);
      if (droppedUrl) applyImage(droppedUrl);
    },
    [applyImage, handleFiles],
  );

  const thumbSize = compact ? 40 : DATASET_IMAGE_THUMB_PX;

  return (
    <div
      className={`group/cell relative flex items-center justify-center transition-colors ${
        dragOver
          ? "bg-[var(--foldder-studio-accent,#14b8a6)]/10 ring-2 ring-[var(--foldder-studio-accent,#14b8a6)]/50"
          : "hover:bg-white/[0.03]"
      } ${hasImage ? "p-1" : "p-2"}`}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
        setDragOver(true);
      }}
      onDragEnter={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOver(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOver(false);
      }}
      onDrop={onDrop}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const files = e.target.files;
          if (files?.length) void handleFiles(files);
          e.target.value = "";
        }}
      />

      {hasImage ? (
        <div className="relative" style={{ width: thumbSize, height: thumbSize }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt=""
            className={`h-full w-full border border-white/10 object-cover transition-opacity ${uploading ? "opacity-50" : ""}`}
            style={{ width: thumbSize, height: thumbSize }}
            draggable={false}
          />
          {uploading ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/35">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white/90" />
            </div>
          ) : null}
          {history.length > 0 ? (
            <div className="absolute -left-1.5 -top-1.5">
              <button
                type="button"
                title={`${history.length} versión${history.length === 1 ? "" : "es"} anterior${history.length === 1 ? "" : "es"}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setHistoryOpen((open) => !open);
                }}
                className="flex h-5 w-5 items-center justify-center border border-white/20 bg-[#0b0f14] text-white/75 transition hover:border-[var(--foldder-studio-accent,#14b8a6)]/50 hover:text-[var(--foldder-studio-accent,#14b8a6)]"
              >
                <History size={10} strokeWidth={2.2} />
              </button>
              {historyOpen ? (
                <div
                  className="absolute left-0 top-6 z-30 min-w-[140px] border border-white/15 bg-[#0b0f14] p-1 shadow-lg"
                  onClick={(e) => e.stopPropagation()}
                >
                  {history.map((entry, index) => (
                    <button
                      key={`${entry.assetId}-${entry.savedAt}`}
                      type="button"
                      className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-[11px] text-white/75 transition hover:bg-white/5 hover:text-white"
                      onClick={() => {
                        if (value.type !== "image") return;
                        onChange(restoreImageCellFromHistory(value, index));
                        setHistoryOpen(false);
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={entry.url}
                        alt=""
                        className="h-8 w-8 shrink-0 border border-white/10 object-cover"
                        draggable={false}
                      />
                      <span>Restaurar v{history.length - index}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          <button
            type="button"
            title="Quitar imagen"
            onClick={(e) => {
              e.stopPropagation();
              onChange({ type: "image", assetId: "", url: "" });
            }}
            className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center border border-white/20 bg-[#0b0f14] text-white/65 opacity-0 transition hover:bg-rose-500/90 hover:text-white group-hover/cell:opacity-100"
          >
            <X size={11} strokeWidth={2.5} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex flex-col items-center justify-center gap-1 border border-dashed border-white/15 text-white/45 transition hover:border-[var(--foldder-studio-accent,#14b8a6)]/40 hover:text-[var(--foldder-studio-accent,#14b8a6)]"
          style={{ width: thumbSize, height: thumbSize }}
          title="Arrastra una imagen o haz clic para elegir"
        >
          <ImageIcon size={16} strokeWidth={1.75} />
          {!compact ? <span className="text-[9px] leading-none">Soltar</span> : null}
        </button>
      )}
    </div>
  );
}

export function DatasetVideoCell({
  value,
  onChange,
}: {
  value: FieldValue;
  onChange: (value: FieldValue) => void;
}) {
  const url = value.type === "video" ? value.url : "";
  const assetId = value.type === "video" ? value.assetId : "";

  return (
    <input
      value={url}
      onChange={(e) => {
        const next = e.target.value;
        onChange({ type: "video", assetId: assetId || next, url: next });
      }}
      className="w-full border border-transparent bg-transparent px-2 py-1.5 text-[12px] text-white/85 outline-none hover:border-white/10 focus:border-[var(--foldder-studio-accent,#14b8a6)]/45"
      placeholder="URL del vídeo"
    />
  );
}
