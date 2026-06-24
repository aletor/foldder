"use client";

import React, { useCallback, useRef, useState } from "react";
import { ImageIcon, X } from "lucide-react";
import type { FieldValue } from "./dataset-types";

/** Tamaño fijo de miniatura en todas las celdas imagen del Dataset. */
export const DATASET_IMAGE_THUMB_PX = 48;

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
  const url = value.type === "image" ? value.url : "";
  const hasImage = Boolean(url?.trim());

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
      try {
        const next = await fileToImageValue(file);
        onChange(next);
      } catch {
        /* ignore */
      }
    },
    [onChange],
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
            className="h-full w-full border border-white/10 object-cover"
            style={{ width: thumbSize, height: thumbSize }}
            draggable={false}
          />
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
