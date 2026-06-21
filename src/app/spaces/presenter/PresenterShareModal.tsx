"use client";

import React, { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowRight,
  ChevronLeft,
  Clock,
  Link2,
  Lock,
  Sparkles,
  User,
  X,
} from "lucide-react";
import type { DesignerPageState } from "../designer/DesignerNode";
import type { PresenterImageVideoPlacement } from "./presenter-image-video-types";
import type { SlideTransitionId } from "./slide-transition-types";
import type { PresenterShareOptions } from "@/lib/presenter-share-types";
import { DEFAULT_PRESENTER_SHARE_OPTIONS } from "@/lib/presenter-share-types";
import {
  PRESENTER_MODAL_BTN_PRIMARY,
  PRESENTER_MODAL_BTN_SECONDARY,
  presenterModalBackdropClass,
  presenterModalFooterClass,
  presenterModalHeaderClass,
  presenterModalOverlayClass,
  presenterModalPanelProps,
} from "./presenter-modal-chrome";

type ShareLinkRow = {
  id: string;
  token: string;
  name: string;
  slug: string;
  visits: number;
  createdAt: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  deckKey: string;
  deckTitle: string;
  pages: DesignerPageState[];
  transitionsByPageId: Record<string, SlideTransitionId>;
  imageVideoPlacements?: PresenterImageVideoPlacement[];
};

function Toggle({
  on,
  onChange,
  disabled,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative h-5 w-9 shrink-0 rounded-none transition-colors ${
        on ? "bg-[#f5b91b]" : "bg-zinc-600"
      } ${disabled ? "opacity-40" : ""}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
          on ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </button>
  );
}

export function PresenterShareModal({
  open,
  onClose,
  deckKey,
  deckTitle,
  pages,
  transitionsByPageId,
  imageVideoPlacements = [],
}: Props) {
  const [view, setView] = useState<"list" | "new">("list");
  const [links, setLinks] = useState<ShareLinkRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [linkName, setLinkName] = useState(deckTitle);
  const [opts, setOpts] = useState<PresenterShareOptions>({ ...DEFAULT_PRESENTER_SHARE_OPTIONS });

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const refresh = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const r = await fetch(`/api/presenter-share?deckKey=${encodeURIComponent(deckKey)}`);
      const j = (await r.json()) as { links?: unknown; error?: string };
      if (!r.ok) {
        setFetchError(j.error?.trim() || `Error ${r.status}`);
        setLinks([]);
        return;
      }
      setLinks(Array.isArray(j.links) ? (j.links as ShareLinkRow[]) : []);
    } catch (e) {
      const msg =
        e instanceof TypeError && (e.message === "Failed to fetch" || e.message.includes("fetch"))
          ? "No se pudo conectar con el servidor (¿está en marcha `npm run dev`?)."
          : e instanceof Error
            ? e.message
            : "Error de red";
      setFetchError(msg);
      setLinks([]);
    } finally {
      setLoading(false);
    }
  }, [deckKey]);

  useEffect(() => {
    if (!open) return;
    void refresh();
    setView("list");
    setLinkName(deckTitle);
    setOpts({ ...DEFAULT_PRESENTER_SHARE_OPTIONS });
  }, [open, deckKey, deckTitle, refresh]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2600);
  }, []);

  const copyUrl = useCallback(
    (token: string, options?: { toast?: boolean }) => {
      const u = `${origin}/p/${token}`;
      const showCopyToast = options?.toast !== false;
      void navigator.clipboard.writeText(u).then(
        () => {
          if (showCopyToast) showToast("Enlace copiado al portapapeles");
        },
        () => {
          if (showCopyToast) showToast("No se pudo copiar el enlace");
        },
      );
      return u;
    },
    [origin, showToast],
  );

  const createLink = async () => {
    setCreating(true);
    setFetchError(null);
    try {
      const r = await fetch("/api/presenter-share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deckKey,
          deckTitle,
          name: linkName.trim() || deckTitle,
          options: {
            allowDuplication: opts.allowDuplication,
            collectEngagementAnalytics: opts.collectEngagementAnalytics,
            visitorConsentAnalytics: opts.visitorConsentAnalytics,
            requirePasscode: opts.requirePasscode,
            passcodePlain: opts.passcodePlain,
            requireVisitorEmail: opts.requireVisitorEmail,
            allowPdfDownload: opts.allowPdfDownload,
            autoDisableLink: opts.autoDisableLink,
            autoDisableAt:
              opts.autoDisableLink && opts.autoDisableAt
                ? new Date(opts.autoDisableAt).toISOString()
                : null,
          },
          payload: { pages, transitionsByPageId, imageVideoPlacements },
        }),
      });
      const j = (await r.json()) as { link?: { token?: string }; error?: string };
      if (!r.ok) {
        setFetchError(j.error?.trim() || `No se pudo crear el enlace (${r.status})`);
        return;
      }
      if (j.link?.token) {
        copyUrl(j.link.token, { toast: false });
        showToast("Enlace creado y copiado al portapapeles");
      }
      setView("list");
      await refresh();
    } catch (e) {
      const msg =
        e instanceof TypeError && (e.message === "Failed to fetch" || e.message.includes("fetch"))
          ? "No se pudo conectar con el servidor."
          : e instanceof Error
            ? e.message
            : "Error de red";
      setFetchError(msg);
    } finally {
      setCreating(false);
    }
  };

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className={presenterModalOverlayClass}
      role="dialog"
      aria-modal="true"
      aria-labelledby="presenter-share-title"
    >
      <button
        type="button"
        className={presenterModalBackdropClass}
        aria-label="Cerrar"
        onClick={onClose}
      />
      <div {...presenterModalPanelProps()}>
        <div className={presenterModalHeaderClass}>
          {view === "new" ? (
            <button
              type="button"
              onClick={() => setView("list")}
              className="flex h-10 w-10 shrink-0 items-center justify-center border-r border-white/10 text-zinc-400 transition hover:bg-white/[0.06] hover:text-white"
              aria-label="Volver"
            >
              <ChevronLeft size={16} strokeWidth={2} />
            </button>
          ) : (
            <span className="w-10 shrink-0 border-r border-white/10" aria-hidden />
          )}
          <div className="flex min-w-0 flex-1 items-center justify-center px-2">
            {view === "list" ? (
              <>
                <h2
                  id="presenter-share-title"
                  className="text-[10px] font-black uppercase tracking-[0.12em] text-white/90"
                >
                  Enlaces compartidos
                </h2>
              </>
            ) : (
              <h2 className="text-[10px] font-black uppercase tracking-[0.12em] text-white/90">
                Nuevo enlace
              </h2>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center border-l border-white/10 text-zinc-400 transition hover:bg-white/[0.06] hover:text-white"
            aria-label="Cerrar"
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2.5">
          {view === "list" && (
            <>
              <p className="mb-2 text-[10px] leading-snug text-zinc-500">
                {deckTitle} · enlaces públicos de esta presentación
              </p>
              {fetchError && (
                <p
                  className="mb-2 rounded-[4px] border border-rose-500/35 bg-rose-500/10 px-2.5 py-2 text-center text-[10px] leading-snug text-rose-200/95"
                  role="alert"
                >
                  {fetchError}
                </p>
              )}
              {loading ? (
                <p className="py-8 text-center text-[10px] text-zinc-500">Cargando…</p>
              ) : links.length === 0 ? (
                <p className="border border-white/[0.06] bg-white/[0.02] px-2.5 py-5 text-center text-[10px] text-zinc-500">
                  Aún no hay enlaces. Usa <span className="font-semibold text-zinc-400">Nuevo enlace</span> abajo.
                </p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {links.map((l) => (
                    <li
                      key={l.id}
                      className="flex items-center gap-2 border border-white/[0.07] bg-white/[0.03] px-2 py-1.5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11px] font-semibold text-zinc-100">{l.name}</p>
                        <p className="mt-0.5 flex items-center gap-1 text-[9px] font-medium text-sky-400/90">
                          <Sparkles size={10} className="shrink-0" aria-hidden />
                          {l.visits} visitas
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyUrl(l.token)}
                        className="flex shrink-0 items-center gap-1 border border-white/12 bg-white/[0.04] px-2 py-1 text-[9px] font-semibold text-zinc-200 transition-colors hover:bg-white/10"
                      >
                        <Link2 size={11} strokeWidth={1.75} />
                        Copiar
                      </button>
                      <a
                        href={`${origin}/p/${l.token}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 border border-white/12 bg-white/[0.04] px-2 py-1 text-[9px] font-semibold text-[#f5b91b] transition-colors hover:bg-white/10"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Abrir
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {view === "new" && (
            <div className="flex flex-col gap-3 pb-1">
              {fetchError && (
                <p
                  className="rounded-[4px] border border-rose-500/35 bg-rose-500/10 px-2.5 py-2 text-center text-[10px] leading-snug text-rose-200/95"
                  role="alert"
                >
                  {fetchError}
                </p>
              )}
              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                  Nombre del enlace
                </label>
                <input
                  value={linkName}
                  onChange={(e) => setLinkName(e.target.value)}
                  className="w-full rounded-none border border-white/10 bg-[#0e1014] px-2.5 py-1.5 text-[12px] text-zinc-100 outline-none ring-0 placeholder:text-zinc-600 focus:border-[#f5b91b]/55"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                  URL pública
                </label>
                <p className="border border-white/[0.1] bg-[#0e1014] px-2.5 py-1.5 text-[11px] text-zinc-400">
                  {origin}/p/[token opaco]
                </p>
                <p className="mt-1 text-[9px] leading-snug text-zinc-600">
                  El enlace real se genera al crear y se copia automáticamente al portapapeles.
                </p>
              </div>

              <p className="text-[9px] font-bold uppercase tracking-wide text-zinc-600">Acceso</p>

              <div className="flex items-start justify-between gap-3 rounded-[4px] border border-white/[0.07] bg-white/[0.02] px-2.5 py-2">
                <div className="flex gap-2">
                  <Lock size={15} className="mt-0.5 shrink-0 text-zinc-500" aria-hidden />
                  <div>
                    <p className="text-[11px] font-semibold text-zinc-100">Requerir código de acceso</p>
                  </div>
                </div>
                <Toggle
                  on={opts.requirePasscode}
                  onChange={(v) => setOpts((o) => ({ ...o, requirePasscode: v }))}
                />
              </div>
              {opts.requirePasscode && (
                <input
                  type="password"
                  value={opts.passcodePlain}
                  onChange={(e) => setOpts((o) => ({ ...o, passcodePlain: e.target.value }))}
                  placeholder="Código"
                  className="w-full rounded-[4px] border border-white/[0.1] bg-[#0e1014] px-2.5 py-1.5 text-[12px] text-zinc-100 outline-none focus:border-white/20"
                />
              )}

              <div className="flex items-start justify-between gap-3 rounded-[4px] border border-white/[0.07] bg-white/[0.02] px-2.5 py-2">
                <div className="flex gap-2">
                  <User size={15} className="mt-0.5 shrink-0 text-zinc-500" aria-hidden />
                  <div>
                    <p className="text-[11px] font-semibold text-zinc-100">Requerir email del visitante</p>
                  </div>
                </div>
                <Toggle
                  on={opts.requireVisitorEmail}
                  onChange={(v) => setOpts((o) => ({ ...o, requireVisitorEmail: v }))}
                />
              </div>

              <div className="flex items-start justify-between gap-3 rounded-[4px] border border-white/[0.07] bg-white/[0.02] px-2.5 py-2">
                <div className="flex gap-2">
                  <Clock size={15} className="mt-0.5 shrink-0 text-zinc-500" aria-hidden />
                  <div>
                    <p className="text-[11px] font-semibold text-zinc-100">Desactivar enlace automáticamente</p>
                  </div>
                </div>
                <Toggle
                  on={opts.autoDisableLink}
                  onChange={(v) => setOpts((o) => ({ ...o, autoDisableLink: v }))}
                />
              </div>
              {opts.autoDisableLink && (
                <input
                  type="datetime-local"
                  value={opts.autoDisableAt ?? ""}
                  onChange={(e) =>
                    setOpts((o) => ({ ...o, autoDisableAt: e.target.value ? e.target.value : null }))
                  }
                  className="w-full rounded-[4px] border border-white/[0.1] bg-[#0e1014] px-2.5 py-1.5 text-[12px] text-zinc-100 outline-none focus:border-white/20"
                />
              )}

              <p className="text-[9px] font-bold uppercase tracking-wide text-zinc-600">Próximamente</p>
              <ul className="space-y-1.5 rounded-[4px] border border-white/[0.07] bg-white/[0.02] px-2.5 py-2 text-[10px] leading-snug text-zinc-500">
                <li>Permitir duplicar la presentación</li>
                <li>Analíticas de engagement por slide</li>
                <li>Descarga PDF para visitantes</li>
              </ul>
            </div>
          )}
        </div>

        {toast ? (
          <div className="pointer-events-none absolute bottom-14 left-1/2 z-[2] -translate-x-1/2 border border-[#f5b91b]/35 bg-[#f5b91b]/15 px-3 py-1.5 text-[10px] font-semibold text-[#f5b91b]">
            {toast}
          </div>
        ) : null}

        {view === "list" && (
          <div className={`${presenterModalFooterClass} justify-between gap-0 px-0`}>
            <button
              type="button"
              className={`${PRESENTER_MODAL_BTN_SECONDARY} flex-1 border-0 border-r border-white/10`}
              onClick={() => {
                void refresh();
              }}
            >
              Actualizar lista
              <ArrowRight size={12} strokeWidth={2} className="opacity-80" />
            </button>
            <button type="button" onClick={() => setView("new")} className={`${PRESENTER_MODAL_BTN_PRIMARY} flex-1`}>
              + Nuevo enlace
            </button>
          </div>
        )}

        {view === "new" && (
          <div className={`${presenterModalFooterClass} justify-end px-0`}>
            <button
              type="button"
              disabled={creating}
              onClick={() => void createLink()}
              className={PRESENTER_MODAL_BTN_PRIMARY}
            >
              {creating ? "Creando…" : "Crear enlace"}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
