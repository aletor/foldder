"use client";

import React, { useEffect } from "react";
import { ChevronLeft, ChevronRight, Download, X, ZoomIn } from "lucide-react";

function downloadDataUrl(url: string, name: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export function DesignerFormResultsLightbox({
  urls,
  index,
  onIndexChange,
  onClose,
  filenamePrefix = "slide",
}: {
  urls: string[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  filenamePrefix?: string;
}) {
  const url = urls[index];
  const hasNav = urls.length > 1;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && index > 0) onIndexChange(index - 1);
      if (e.key === "ArrowRight" && index < urls.length - 1) onIndexChange(index + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, onClose, onIndexChange, urls.length]);

  if (!url) return null;

  return (
    <div
      className="designer-form-results-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={`Vista ampliada slide ${index + 1}`}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="designer-form-results-lightbox__panel">
        <div className="designer-form-results-lightbox__head">
          <span className="designer-form-results-lightbox__title">
            Slide {index + 1} / {urls.length}
          </span>
          <div className="designer-form-results-lightbox__head-actions">
            <button
              type="button"
              className="designer-form-results-lightbox__icon-btn"
              onClick={() => downloadDataUrl(url, `${filenamePrefix}-${index + 1}.png`)}
              title="Descargar"
            >
              <Download size={14} />
            </button>
            <button
              type="button"
              className="designer-form-results-lightbox__icon-btn"
              onClick={onClose}
              aria-label="Cerrar"
            >
              <X size={14} />
            </button>
          </div>
        </div>
        <div className="designer-form-results-lightbox__body">
          {hasNav ? (
            <button
              type="button"
              className="designer-form-results-lightbox__nav"
              disabled={index <= 0}
              onClick={() => onIndexChange(index - 1)}
              aria-label="Anterior"
            >
              <ChevronLeft size={18} />
            </button>
          ) : null}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={`Slide ${index + 1}`} draggable={false} />
          {hasNav ? (
            <button
              type="button"
              className="designer-form-results-lightbox__nav designer-form-results-lightbox__nav--next"
              disabled={index >= urls.length - 1}
              onClick={() => onIndexChange(index + 1)}
              aria-label="Siguiente"
            >
              <ChevronRight size={18} />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function DesignerFormResultThumb({
  url,
  alt,
  onOpen,
  onDownload,
}: {
  url: string;
  alt: string;
  onOpen: () => void;
  onDownload: (e: React.MouseEvent) => void;
}) {
  return (
    <div className="designer-form-results__item">
      <button type="button" className="designer-form-results__open nodrag" onClick={onOpen} title="Ampliar">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={alt} draggable={false} />
        <span className="designer-form-results__zoom-hint" aria-hidden>
          <ZoomIn size={14} />
        </span>
      </button>
      <button
        type="button"
        className="designer-form-results__download nodrag"
        onClick={onDownload}
        title="Descargar"
      >
        <Download size={12} />
      </button>
    </div>
  );
}
