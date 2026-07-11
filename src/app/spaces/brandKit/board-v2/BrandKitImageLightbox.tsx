"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { X } from "lucide-react";
import { BrandKitMediaImage } from "../BrandKitMediaImage";

type BrandKitImageLightboxContextValue = {
  openImage: (src: string) => void;
};

const BrandKitImageLightboxContext = createContext<BrandKitImageLightboxContextValue | null>(null);

export function BrandKitImageLightboxProvider({ children }: { children: React.ReactNode }) {
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
    <BrandKitImageLightboxContext.Provider value={{ openImage }}>
      {children}
      {src ? (
        <div className="brandKit-lightbox" role="dialog" aria-modal="true" onClick={() => setSrc(null)}>
          <button
            type="button"
            className="brandKit-lightbox__close"
            aria-label="Cerrar"
            onClick={() => setSrc(null)}
          >
            <X size={18} />
          </button>
          <div onClick={(event) => event.stopPropagation()}>
            <BrandKitMediaImage src={src} alt="" className="brandKit-lightbox__img" eager />
          </div>
        </div>
      ) : null}
    </BrandKitImageLightboxContext.Provider>
  );
}

export function useBrandKitImageLightbox(): BrandKitImageLightboxContextValue {
  const ctx = useContext(BrandKitImageLightboxContext);
  if (!ctx) {
    return { openImage: () => undefined };
  }
  return ctx;
}
