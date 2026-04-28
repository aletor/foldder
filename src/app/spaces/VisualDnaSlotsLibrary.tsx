"use client";

import { useCallback, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ImageIcon, Loader2, RefreshCw, Trash2, AlertTriangle } from "lucide-react";
import type { VisualDnaSlot } from "@/lib/brain/visual-dna-slot/types";

export type VisualDnaSlotsLibraryProps = {
  slots: VisualDnaSlot[];
  busySlotIds: Readonly<Record<string, boolean>>;
  onRegenerate: (slotId: string) => void;
  onDelete: (slotId: string) => void;
  onRename: (slotId: string, label: string) => void;
  /** true = rail bajo la franja de ingesta (siempre visible). false = bloque ancho en otra sección. */
  belowIngest?: boolean;
};

function thumb(src?: string) {
  const u = src?.trim();
  if (!u) return null;
  return u;
}

export function VisualDnaSlotsLibrary({
  slots,
  busySlotIds,
  onRegenerate,
  onDelete,
  onRename,
  belowIngest = false,
}: VisualDnaSlotsLibraryProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLUListElement>(null);

  const scrollSlots = useCallback((dir: -1 | 1) => {
    const el = scrollerRef.current;
    if (!el) return;
    const card = el.querySelector("li");
    const step = Math.max(240, (card?.getBoundingClientRect().width ?? 280) + 12);
    el.scrollBy({ left: dir * step, behavior: "smooth" });
  }, []);

  const open = slots.find((s) => s.id === openId) ?? null;

  return (
    <div
      className={`min-w-0 space-y-2 rounded-[5px] border border-violet-200/90 bg-gradient-to-b from-violet-50/60 to-white ${
        belowIngest ? "p-2 sm:p-2.5" : "p-2 sm:p-3"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-violet-800">
            {belowIngest ? "ADN por imagen (esta subida)" : "Biblioteca ADN por imagen"}
          </p>
          <p className="mt-0.5 max-w-3xl text-[10.5px] leading-snug text-zinc-600">
            {belowIngest
              ? "Por cada imagen del pozo con vista previa se genera un slot: fuente a la izquierda y mosaico de sugerencias a la derecha. Desliza horizontalmente o usa las flechas si hay varios."
              : "Cada imagen analizada del pozo puede tener su propio slot con mosaico de sugerencias. Desliza horizontalmente o usa las flechas si hay varios."}
          </p>
        </div>
      </div>
      {slots.length === 0 ? (
        <p className="rounded-[5px] border border-dashed border-violet-200 bg-white/80 px-3 py-2 text-[11px] text-zinc-600">
          {belowIngest
            ? "Tras subir, el pozo puede guardar la imagen en S3: hace falta sesión y API para URL firmada y visión. Cuando exista fila de análisis y URL de vista, verás aquí «fuente · sugerencias». Si no aparece, revisa la consola de red o «Reanalizar imágenes» en Referencias visuales."
            : "Aún no hay slots. Se crean cuando hay una imagen en el pozo con URL o data URL, una fila de análisis visual (aunque siga en «pending») y aún no existe un slot para ese documento."}
        </p>
      ) : (
        <div className="flex min-w-0 items-stretch gap-1">
          <button
            type="button"
            aria-label="Slots anteriores"
            onClick={() => scrollSlots(-1)}
            className="hidden shrink-0 self-center rounded-[4px] border border-violet-200 bg-white p-1.5 text-violet-800 shadow-sm hover:bg-violet-50 sm:inline-flex"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <ul
            ref={scrollerRef}
            className="flex min-h-0 min-w-0 flex-1 snap-x snap-mandatory gap-3 overflow-x-auto overflow-y-visible scroll-smooth pb-1.5 pt-0.5 [scrollbar-width:thin]"
          >
          {slots.map((slot) => {
            const src = thumb(slot.sourceImageUrl);
            const mos = thumb(slot.mosaic.imageUrl);
            const busy = Boolean(busySlotIds[slot.id]);
            return (
              <li
                key={slot.id}
                className="flex w-[min(100%,calc(100vw-5.5rem))] shrink-0 snap-start flex-col rounded-[5px] border border-violet-200/80 bg-white p-2 shadow-sm sm:w-[280px]"
              >
                <input
                  key={`${slot.id}-${slot.label}`}
                  defaultValue={slot.label}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && v !== slot.label) onRename(slot.id, v);
                  }}
                  className="mb-1.5 w-full truncate rounded-[4px] border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[11px] font-semibold text-zinc-900"
                  aria-label="Etiqueta del slot"
                />
                <div className="grid min-h-[112px] grid-cols-2 gap-1.5">
                  <div className="relative min-h-0 overflow-hidden rounded-[4px] border border-zinc-200 bg-zinc-100">
                    <span className="absolute left-1 top-1 z-[1] rounded bg-black/60 px-1 py-0.5 text-[7px] font-black uppercase tracking-wide text-white">
                      Fuente
                    </span>
                    {src ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={src} alt="" className="h-full min-h-[104px] w-full object-cover" />
                    ) : (
                      <div className="flex min-h-[104px] w-full items-center justify-center text-zinc-400">
                        <ImageIcon className="h-6 w-6" aria-hidden />
                      </div>
                    )}
                  </div>
                  <div className="relative min-h-0 overflow-hidden rounded-[4px] border border-zinc-200 bg-zinc-50">
                    <span className="absolute left-1 top-1 z-[1] rounded bg-black/60 px-1 py-0.5 text-[7px] font-black uppercase tracking-wide text-white">
                      Sugerencias
                    </span>
                    {mos ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={mos}
                        alt="Tablero ADN sugerido"
                        className="h-full min-h-[104px] w-full object-cover object-top"
                      />
                    ) : (
                      <div className="flex min-h-[104px] w-full flex-col items-center justify-center gap-1 px-1 text-center text-[9px] text-zinc-500">
                        {busy ? (
                          <span className="flex items-center gap-1 font-medium text-violet-800">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                            Generando tablero…
                          </span>
                        ) : slot.status === "failed" ? (
                          <span className="text-rose-700">{slot.lastError?.slice(0, 72) ?? "Error"}</span>
                        ) : (
                          "Aquí aparecerá el mosaico de sugerencias."
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <p className="mt-1 text-[8px] text-zinc-500">
                  {new Date(slot.createdAt).toLocaleString("es")} ·{" "}
                  <span className="font-semibold text-zinc-700">{slot.status}</span>
                  {slot.status === "stale" ? (
                    <span className="ml-1 inline-flex items-center gap-0.5 text-amber-700">
                      <AlertTriangle className="h-3 w-3" aria-hidden />
                      stale
                    </span>
                  ) : null}
                  {typeof slot.confidence === "number" ? (
                    <span className="ml-1">· {(slot.confidence * 100).toFixed(0)}% conf.</span>
                  ) : null}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                  {slot.palette.dominantColors.slice(0, 3).map((c) => (
                    <span
                      key={c}
                      className="h-3.5 w-3.5 rounded-sm border border-zinc-200"
                      style={{ backgroundColor: c }}
                      title={c}
                    />
                  ))}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setOpenId(slot.id)}
                    className="rounded-[4px] border border-violet-300 bg-violet-50 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-violet-900 hover:bg-violet-100"
                  >
                    Ver ADN
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onRegenerate(slot.id)}
                    className="inline-flex items-center gap-1 rounded-[4px] border border-zinc-300 bg-white px-2 py-1 text-[9px] font-black uppercase tracking-wide text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
                  >
                    {busy ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <RefreshCw className="h-3 w-3" aria-hidden />}
                    Regenerar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!confirm("¿Eliminar este ADN por imagen? No borra el documento del pozo.")) return;
                      onDelete(slot.id);
                      if (openId === slot.id) setOpenId(null);
                    }}
                    className="inline-flex items-center gap-1 rounded-[4px] border border-rose-200 bg-rose-50 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-rose-900 hover:bg-rose-100"
                  >
                    <Trash2 className="h-3 w-3" aria-hidden />
                    Eliminar
                  </button>
                </div>
              </li>
            );
          })}
          </ul>
          <button
            type="button"
            aria-label="Slots siguientes"
            onClick={() => scrollSlots(1)}
            className="hidden shrink-0 self-center rounded-[4px] border border-violet-200 bg-white p-1.5 text-violet-800 shadow-sm hover:bg-violet-50 sm:inline-flex"
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}

      {open ? (
        <div
          className="fixed inset-0 z-[130] flex items-center justify-center bg-black/50 p-3"
          role="dialog"
          aria-modal="true"
        >
          <div className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-[5px] border border-zinc-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2">
              <p className="text-[11px] font-black uppercase tracking-wide text-zinc-800">ADN visual · {open.label}</p>
              <button
                type="button"
                onClick={() => setOpenId(null)}
                className="rounded-[4px] border border-zinc-200 px-2 py-1 text-[10px] font-bold text-zinc-700 hover:bg-zinc-50"
              >
                Cerrar
              </button>
            </div>
            <div className="max-h-[calc(90vh-48px)] overflow-y-auto p-3">
              <div className="grid gap-3 lg:grid-cols-2">
                <div>
                  <p className="mb-1 text-[9px] font-black uppercase text-zinc-500">Imagen fuente</p>
                  <div className="overflow-hidden rounded-[5px] border border-zinc-200 bg-zinc-50">
                    {thumb(open.sourceImageUrl) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={open.sourceImageUrl} alt="" className="w-full object-contain" />
                    ) : (
                      <p className="p-4 text-[11px] text-zinc-500">Sin vista previa (sube con data URL o URL https).</p>
                    )}
                  </div>
                </div>
                <div>
                  <p className="mb-1 text-[9px] font-black uppercase text-zinc-500">Mosaico de sugerencias</p>
                  <div className="overflow-hidden rounded-[5px] border border-zinc-200 bg-zinc-50">
                    {thumb(open.mosaic.imageUrl) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={open.mosaic.imageUrl} alt="Mosaico" className="w-full object-contain" />
                    ) : (
                      <p className="p-4 text-[11px] text-zinc-500">Sin mosaico generado.</p>
                    )}
                  </div>
                </div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <section className="rounded-[5px] border border-zinc-100 bg-zinc-50/80 p-2">
                  <p className="text-[9px] font-black uppercase text-zinc-600">Paleta</p>
                  <ul className="mt-1 flex flex-wrap gap-1">
                    {open.palette.dominantColors.map((c) => (
                      <li key={c} className="flex items-center gap-1 text-[10px]">
                        <span className="h-5 w-5 rounded border border-zinc-200" style={{ backgroundColor: c }} />
                        {c}
                      </li>
                    ))}
                  </ul>
                  {open.palette.colorNotes ? (
                    <p className="mt-1 text-[10px] text-zinc-600">{open.palette.colorNotes}</p>
                  ) : null}
                </section>
                <section className="rounded-[5px] border border-zinc-100 bg-zinc-50/80 p-2">
                  <p className="text-[9px] font-black uppercase text-zinc-600">Héroe / conclusión</p>
                  <p className="mt-1 text-[10px] text-zinc-800">{open.hero.description ?? "—"}</p>
                  {open.hero.conclusion ? (
                    <p className="mt-1 text-[10px] text-zinc-600">{open.hero.conclusion}</p>
                  ) : null}
                </section>
                <section className="rounded-[5px] border border-zinc-100 bg-zinc-50/80 p-2">
                  <p className="text-[9px] font-black uppercase text-zinc-600">Personas</p>
                  <p className="text-[10px] text-zinc-700">{open.people.notes ?? "—"}</p>
                </section>
                <section className="rounded-[5px] border border-zinc-100 bg-zinc-50/80 p-2">
                  <p className="text-[9px] font-black uppercase text-zinc-600">Objetos / producto</p>
                  <p className="text-[10px] text-zinc-700">{open.objects.notes ?? "—"}</p>
                </section>
                <section className="rounded-[5px] border border-zinc-100 bg-zinc-50/80 p-2">
                  <p className="text-[9px] font-black uppercase text-zinc-600">Entornos</p>
                  <p className="text-[10px] text-zinc-700">{open.environments.notes ?? "—"}</p>
                </section>
                <section className="rounded-[5px] border border-zinc-100 bg-zinc-50/80 p-2">
                  <p className="text-[9px] font-black uppercase text-zinc-600">Texturas</p>
                  <p className="text-[10px] text-zinc-700">{open.textures.notes ?? "—"}</p>
                </section>
                <section className="rounded-[5px] border border-zinc-100 bg-zinc-50/80 p-2 sm:col-span-2">
                  <p className="text-[9px] font-black uppercase text-zinc-600">Estilo general</p>
                  <p className="mt-1 text-[10px] text-zinc-800">{open.generalStyle.summary ?? "—"}</p>
                  {open.generalStyle.mood?.length ? (
                    <p className="mt-1 text-[10px] text-zinc-600">Mood: {open.generalStyle.mood.join(", ")}</p>
                  ) : null}
                </section>
                <section className="rounded-[5px] border border-zinc-100 bg-zinc-50/80 p-2 sm:col-span-2">
                  <p className="text-[9px] font-black uppercase text-zinc-600">Safe rules (última generación)</p>
                  <ul className="mt-1 list-inside list-disc text-[10px] text-zinc-700">
                    {(open.lastGenerationPrompts?.safeRulesDigest ?? []).slice(0, 12).map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                    {!(open.lastGenerationPrompts?.safeRulesDigest ?? []).length ? <li>—</li> : null}
                  </ul>
                </section>
                {open.mosaic.diagnostics ? (
                  <section className="rounded-[5px] border border-amber-100 bg-amber-50/80 p-2 sm:col-span-2">
                    <p className="text-[9px] font-black uppercase text-amber-900">Diagnóstico / dev</p>
                    <pre className="mt-1 max-h-40 overflow-auto text-[9px] leading-relaxed text-amber-950">
                      {JSON.stringify(open.mosaic.diagnostics, null, 2)}
                    </pre>
                  </section>
                ) : null}
              </div>
              <div className="mt-3 flex flex-wrap gap-2 border-t border-zinc-100 pt-3">
                <button
                  type="button"
                  disabled={Boolean(busySlotIds[open.id])}
                  onClick={() => onRegenerate(open.id)}
                  className="inline-flex items-center gap-1 rounded-[4px] border border-zinc-300 bg-white px-3 py-1.5 text-[10px] font-black uppercase text-zinc-800 disabled:opacity-50"
                >
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                  Regenerar este slot
                </button>
                {open.mosaic.prompt ? (
                  <p className="text-[9px] text-zinc-500">
                    Prompt interno guardado ({open.mosaic.prompt.length} caracteres).{" "}
                    <button
                      type="button"
                      className="font-semibold text-violet-700 underline"
                      onClick={() => {
                        void navigator.clipboard.writeText(open.mosaic.prompt ?? "");
                      }}
                    >
                      Copiar
                    </button>
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
