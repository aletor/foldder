"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

export type SiteCreatorMediaPickItem = {
  id: string;
  url: string;
  s3Key?: string;
  sourceLabel: string;
};

export function SiteCreatorMediaPicker({
  items,
  onPick,
  onClose,
}: {
  items: SiteCreatorMediaPickItem[];
  onPick: (item: SiteCreatorMediaPickItem) => void;
  onClose: () => void;
}) {
  const [broken, setBroken] = useState<Record<string, boolean>>({});
  const [resolvedUrls, setResolvedUrls] = useState<Record<string, string>>({});
  const keys = useMemo(
    () => [...new Set(items.map((item) => item.s3Key).filter((key): key is string => Boolean(key)))],
    [items],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (keys.length === 0) return;
    let cancelled = false;
    void fetch("/api/spaces/s3-presign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keys }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((payload: { urls?: Record<string, string> } | null) => {
        if (cancelled || !payload?.urls) return;
        setResolvedUrls((prev) => ({ ...prev, ...payload.urls }));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [keys]);

  const visible = items.filter((item) => !broken[(resolvedUrls[item.s3Key ?? ""] || item.url).trim()]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4"
      data-testid="site-creator-media-picker"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-white/12 bg-[#101820] shadow-2xl">
        <header className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div>
            <h2 className="text-[13px] font-black uppercase tracking-[0.1em] text-zinc-100">
              Abrir desde Foldder
            </h2>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              La imagen sustituye el contenido de esta card. El encuadre sigue el molde.
            </p>
          </div>
          <button
            type="button"
            className="inline-flex h-8 items-center justify-center rounded-[6px] border border-white/12 bg-white/5 px-3 text-[11px] font-semibold text-zinc-200"
            onClick={onClose}
          >
            Cerrar
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {visible.length === 0 ? (
            <p className="rounded-xl border border-dashed border-white/12 px-4 py-8 text-center text-[12px] text-zinc-500">
              No hay imágenes disponibles en Foldder todavía.
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {visible.map((item) => {
                const url = (item.s3Key && resolvedUrls[item.s3Key]) || item.url;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      title={item.sourceLabel}
                      className="group w-full overflow-hidden rounded-xl border border-white/10 bg-[#171c25] text-left transition hover:border-[#a8ff32]/45"
                      onClick={() => onPick({ ...item, url })}
                    >
                      <img
                        src={url}
                        alt=""
                        className="h-28 w-full object-cover"
                        loading="lazy"
                        onError={() => {
                          const failed = url.trim();
                          if (!failed) return;
                          setBroken((prev) => (prev[failed] ? prev : { ...prev, [failed]: true }));
                        }}
                      />
                      <p className="truncate px-2 py-1.5 text-[10px] font-semibold text-zinc-200">
                        {item.sourceLabel}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
