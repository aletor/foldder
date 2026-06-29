"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Loader2, Sparkles } from "lucide-react";
import type { PublicPopulateShareRecord } from "@/lib/populate-share-types";
import {
  autofillDesignerFormFromRowIndex,
  freezeDesignerPagesForForm,
  resolveDesignerSlotValues,
  type DesignerFormModel,
} from "@/app/spaces/populate/populate-designer-form";
import { DesignerFormImagePicker } from "@/app/spaces/populate/DesignerFormImagePicker";
import {
  DesignerHeadlessRasterPortal,
  type DesignerHeadlessRasterRequest,
} from "@/app/spaces/designer/DesignerHeadlessRasterPortal";

type Props = {
  initial: PublicPopulateShareRecord;
};

/**
 * Formulario público de una plantilla Designer. A diferencia del de Image Creation (que llama a la
 * IA en el servidor), aquí se rasteriza la plantilla EN EL NAVEGADOR con los valores tecleados y se
 * devuelven tantas imágenes como slides. No consume wallet.
 */
export function PublicDesignerFormClient({ initial }: Props) {
  const { payload } = initial;
  const designer = payload.designer!;
  const model: DesignerFormModel = useMemo(
    () => ({
      fields: designer.formFields,
      rows: designer.rows ?? [],
      slideCount: designer.slideCount,
      empty: designer.formFields.length === 0,
    }),
    [designer],
  );

  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<string[]>([]);

  // Driver del raster headless (mismo patrón que Populate): monta un Designer offscreen por petición.
  const [rasterReq, setRasterReq] = useState<DesignerHeadlessRasterRequest | null>(null);
  const rasterRef = useRef<{
    resolve: (m: Record<string, string>) => void;
    reject: (e: Error) => void;
    collected: Record<string, string>;
  } | null>(null);
  const seqRef = useRef(0);

  useEffect(() => {
    void fetch("/api/populate-share/visit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: initial.token }),
    });
  }, [initial.token]);

  const rasterize = useCallback(
    (pages: DesignerHeadlessRasterRequest["pages"], pageIds: string[]) =>
      new Promise<Record<string, string>>((resolve, reject) => {
        rasterRef.current = { resolve, reject, collected: {} };
        const seq = (seqRef.current += 1);
        setRasterReq({
          requestId: seq,
          instanceKey: `pub_${initial.token}_raster_${seq}`,
          pages,
          targetPageIds: pageIds,
        });
      }),
    [initial.token],
  );

  const canGenerate = !model.empty;

  const onAutofill = useCallback(
    (rowIndex: number) => {
      const next = autofillDesignerFormFromRowIndex(model, rowIndex);
      setValues((prev) => ({ ...prev, ...next }));
    },
    [model],
  );

  const onGenerate = useCallback(async () => {
    setError(null);
    setBusy(true);
    setResults([]);
    setProgress({ done: 0, total: designer.slideCount });
    try {
      const slotValues = resolveDesignerSlotValues({
        model,
        textValues: values,
        imageSelections: values,
      });
      const pages = freezeDesignerPagesForForm(designer.pages, slotValues);
      const pageIds = pages.map((p) => p.id);
      const byId = await rasterize(pages, pageIds);
      const out = pageIds.map((pid) => byId[pid]).filter((u): u is string => Boolean(u));
      if (out.length === 0) {
        setError("No se pudo generar la imagen.");
        return;
      }
      setResults(out);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al generar");
    } finally {
      setBusy(false);
      setProgress(null);
      setRasterReq(null);
    }
  }, [designer, model, values, rasterize]);

  const onDownload = useCallback((url: string, index: number) => {
    const a = document.createElement("a");
    a.href = url;
    const base = (payload.title || "foldder").replace(/\s+/g, "-").toLowerCase();
    a.download = `${base}-slide-${index + 1}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, [payload.title]);

  const datalistPrefix = `public-designer-${initial.token}`;

  return (
    <div className="min-h-screen bg-[#120810] px-4 py-8 text-[#f5e9f4] sm:px-6">
      <div className="mx-auto w-full max-w-md">
        <header className="mb-8 text-center">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#fd52eb]">Foldder</p>
          <h1 className="mt-2 text-xl font-bold text-white">{payload.title || initial.name}</h1>
          <p className="mt-1 text-sm text-white/50">
            Rellena los campos y genera {designer.slideCount} slide{designer.slideCount === 1 ? "" : "s"}
          </p>
        </header>

        {model.empty ? (
          <p className="text-center text-sm text-white/45">Este formulario no tiene campos configurados.</p>
        ) : (
          <form
            className="flex flex-col gap-4 rounded-xl border border-[#fd52eb]/35 bg-black/40 p-5 backdrop-blur-sm"
            onSubmit={(e) => {
              e.preventDefault();
              void onGenerate();
            }}
          >
            {model.rows.length > 0 ? (
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#fd52eb]/85">
                  Autorellenar
                </span>
                <select
                  className="rounded-lg border border-[#fd52eb]/30 bg-black/50 px-3 py-2.5 text-sm text-white outline-none focus:border-[#fd52eb]/70 focus:ring-2 focus:ring-[#fd52eb]/20"
                  value=""
                  onChange={(e) => {
                    const idx = Number(e.target.value);
                    if (Number.isInteger(idx)) onAutofill(idx);
                    e.target.value = "";
                  }}
                >
                  <option value="">Desde un jugador ▾</option>
                  {model.rows.map((r) => (
                    <option key={r.rowIndex} value={r.rowIndex}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {model.fields.map((field) => {
              if (field.kind === "image") {
                return (
                  <DesignerFormImagePicker
                    key={field.slotKey}
                    label={field.label}
                    options={field.imageOptions}
                    value={values[field.slotKey] ?? ""}
                    onChange={(v) => setValues((p) => ({ ...p, [field.slotKey]: v }))}
                    variant="public"
                    emptyHint="Sin opciones disponibles"
                  />
                );
              }
              const listId = field.suggestions.length > 0 ? `${datalistPrefix}-${field.slotKey}` : undefined;
              return (
                <label key={field.slotKey} className="flex flex-col gap-1">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#fd52eb]/85">
                    {field.label}
                  </span>
                  <input
                    className="rounded-lg border border-[#fd52eb]/30 bg-black/50 px-3 py-2.5 text-sm text-white outline-none focus:border-[#fd52eb]/70 focus:ring-2 focus:ring-[#fd52eb]/20"
                    type="text"
                    value={values[field.slotKey] ?? ""}
                    list={listId}
                    placeholder={`${field.label}…`}
                    onChange={(e) => setValues((p) => ({ ...p, [field.slotKey]: e.target.value }))}
                  />
                  {listId ? (
                    <datalist id={listId}>
                      {field.suggestions.map((s) => (
                        <option key={s} value={s} />
                      ))}
                    </datalist>
                  ) : null}
                </label>
              );
            })}

            {error ? <p className="text-sm text-rose-400">{error}</p> : null}

            <button
              type="submit"
              className="mt-1 flex items-center justify-center gap-2 rounded-lg bg-[#fd52eb] px-4 py-3 text-sm font-bold text-[#1a0418] transition hover:bg-[#ff6ef0] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={busy || !canGenerate}
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} strokeWidth={2.2} />}
              {busy && progress ? `Generando ${progress.done}/${progress.total}` : "Generar"}
            </button>
          </form>
        )}

        {results.length > 0 ? (
          <section className="mt-8 flex flex-col gap-4" aria-live="polite">
            <h2 className="text-center text-xs font-extrabold uppercase tracking-[0.15em] text-white/70">
              {results.length} slide{results.length === 1 ? "" : "s"}
            </h2>
            {results.map((url, i) => (
              <div key={i} className="flex flex-col items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt={`Slide ${i + 1}`}
                  className="w-full rounded-xl border border-white/10 shadow-2xl"
                />
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-lg border border-[#fd52eb]/50 bg-black/50 px-4 py-2 text-sm font-semibold text-[#fd52eb] hover:bg-[#fd52eb]/10"
                  onClick={() => onDownload(url, i)}
                >
                  <Download size={15} strokeWidth={2.2} />
                  Descargar slide {i + 1}
                </button>
              </div>
            ))}
          </section>
        ) : null}
      </div>

      {rasterReq ? (
        <DesignerHeadlessRasterPortal
          request={rasterReq}
          onPage={(pageId, dataUrl) => {
            if (rasterRef.current) rasterRef.current.collected[pageId] = dataUrl;
          }}
          onDone={() => {
            const ref = rasterRef.current;
            rasterRef.current = null;
            ref?.resolve(ref.collected);
          }}
          onError={(err) => {
            const ref = rasterRef.current;
            rasterRef.current = null;
            ref?.reject(err);
          }}
        />
      ) : null}
    </div>
  );
}
