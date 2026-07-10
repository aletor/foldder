"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { X } from "lucide-react";
import { GenomaPreviewImage } from "./GenomaPreviewImage";

type GenomaImageLightboxContextValue = {
  openImage: (src: string) => void;
};

const GenomaImageLightboxContext = createContext<GenomaImageLightboxContextValue | null>(null);

export function GenomaImageLightboxProvider({ children }: { children: React.ReactNode }) {
  const [src, setSrc] = useState<string | null>(null);

  const openImage = useCallback((next: string) => {
    if (next.trim()) setSrc(next);
  }, []);

  useEffect(() => {
    if (!src) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSrc(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [src]);

  return (
    <GenomaImageLightboxContext.Provider value={{ openImage }}>
      {children}
      {src ? (
        <div className="genoma-lightbox" role="dialog" aria-modal="true" onClick={() => setSrc(null)}>
          <button
            type="button"
            className="genoma-lightbox__close"
            aria-label="Cerrar"
            onClick={() => setSrc(null)}
          >
            <X size={18} />
          </button>
          <div onClick={(event) => event.stopPropagation()}>
            <GenomaPreviewImage src={src} alt="" className="genoma-lightbox__img" eager />
          </div>
        </div>
      ) : null}
    </GenomaImageLightboxContext.Provider>
  );
}

export function useGenomaImageLightbox(): GenomaImageLightboxContextValue {
  const ctx = useContext(GenomaImageLightboxContext);
  if (!ctx) {
    return { openImage: () => undefined };
  }
  return ctx;
}
