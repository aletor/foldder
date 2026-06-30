"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Loader2, Sparkles } from "lucide-react";
import type { PublicLoopShareRecord } from "@/lib/loop-share-types";

type Props = {
  initial: PublicLoopShareRecord;
};

export function PublicLoopFormClient({ initial }: Props) {
  const { payload } = initial;
  const { formModel } = payload;

  const [textValues, setTextValues] = useState<Record<string, string>>({});
  const [imageRows, setImageRows] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outputUrl, setOutputUrl] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/loop-share/visit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: initial.token }),
    });
  }, [initial.token]);

  const canGenerate = useMemo(() => !formModel.empty, [formModel.empty]);

  const onGenerate = useCallback(async () => {
    setError(null);
    setBusy(true);
    setOutputUrl(null);
    try {
      const res = await fetch(`/api/loop-share/${encodeURIComponent(initial.token)}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ textValues, imageRows }),
      });
      const json = (await res.json()) as { output?: string; error?: string };
      if (!res.ok) {
        setError(json.error?.trim() || `Error ${res.status}`);
        return;
      }
      if (!json.output) {
        setError("No se recibió imagen.");
        return;
      }
      setOutputUrl(json.output);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setBusy(false);
    }
  }, [initial.token, textValues, imageRows]);

  const onDownload = useCallback(async () => {
    if (!outputUrl) return;
    try {
      const res = await fetch(outputUrl);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${payload.title.replace(/\s+/g, "-").toLowerCase() || "foldder"}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      window.open(outputUrl, "_blank");
    }
  }, [outputUrl, payload.title]);

  const datalistPrefix = `public-populate-${initial.token}`;

  return (
    <div className="min-h-screen bg-[#120810] px-4 py-8 text-[#f5e9f4] sm:px-6">
      <div className="mx-auto w-full max-w-md">
        <header className="mb-8 text-center">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#fd52eb]">Foldder</p>
          <h1 className="mt-2 text-xl font-bold text-white">{payload.title || initial.name}</h1>
          <p className="mt-1 text-sm text-white/50">Rellena los campos y genera la pieza</p>
        </header>

        {formModel.empty ? (
          <p className="text-center text-sm text-white/45">Este formulario no tiene campos configurados.</p>
        ) : (
          <form
            className="flex flex-col gap-4 rounded-xl border border-[#fd52eb]/35 bg-black/40 p-5 backdrop-blur-sm"
            onSubmit={(e) => {
              e.preventDefault();
              void onGenerate();
            }}
          >
            {formModel.textFields.map((field) => {
              if (field.kind === "constant") {
                return (
                  <label key={field.fieldKey} className="flex flex-col gap-1">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#fd52eb]/85">
                      {field.label}
                    </span>
                    <span className="text-sm italic text-white/55">{field.constantValue || "—"}</span>
                  </label>
                );
              }
              const listId = field.suggestions.length > 0 ? `${datalistPrefix}-${field.fieldKey}` : undefined;
              return (
                <label key={field.fieldKey} className="flex flex-col gap-1">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#fd52eb]/85">
                    {field.label}
                  </span>
                  <input
                    className="rounded-lg border border-[#fd52eb]/30 bg-black/50 px-3 py-2.5 text-sm text-white outline-none focus:border-[#fd52eb]/70 focus:ring-2 focus:ring-[#fd52eb]/20"
                    type="text"
                    value={textValues[field.fieldKey] ?? ""}
                    list={listId}
                    placeholder={`${field.label}…`}
                    onChange={(e) =>
                      setTextValues((prev) => ({ ...prev, [field.fieldKey]: e.target.value }))
                    }
                    required
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

            {formModel.imageFields.map((field) => (
              <label key={field.inputId} className="flex flex-col gap-1">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#fd52eb]/85">
                  {field.label}
                </span>
                <select
                  className="rounded-lg border border-[#fd52eb]/30 bg-black/50 px-3 py-2.5 text-sm text-white outline-none focus:border-[#fd52eb]/70 focus:ring-2 focus:ring-[#fd52eb]/20"
                  value={imageRows[field.inputId] ?? ""}
                  onChange={(e) => {
                    const idx = Number(e.target.value);
                    if (Number.isInteger(idx)) {
                      setImageRows((prev) => ({ ...prev, [field.inputId]: idx }));
                    }
                  }}
                  required
                >
                  <option value="">Elegir…</option>
                  {field.options.map((o) => (
                    <option key={o.rowIndex} value={o.rowIndex}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            ))}

            {error ? <p className="text-sm text-rose-400">{error}</p> : null}

            <button
              type="submit"
              className="mt-1 flex items-center justify-center gap-2 rounded-lg bg-[#fd52eb] px-4 py-3 text-sm font-bold text-[#1a0418] transition hover:bg-[#ff6ef0] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={busy || !canGenerate}
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} strokeWidth={2.2} />}
              Generar imagen
            </button>
          </form>
        )}

        {outputUrl ? (
          <section className="mt-8 flex flex-col items-center gap-4" aria-live="polite">
            <h2 className="text-xs font-extrabold uppercase tracking-[0.15em] text-white/70">Resultado</h2>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={outputUrl}
              alt="Imagen generada"
              className="w-full rounded-xl border border-white/10 shadow-2xl"
            />
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg border border-[#fd52eb]/50 bg-black/50 px-4 py-2.5 text-sm font-semibold text-[#fd52eb] hover:bg-[#fd52eb]/10"
              onClick={() => void onDownload()}
            >
              <Download size={15} strokeWidth={2.2} />
              Descargar
            </button>
          </section>
        ) : null}
      </div>
    </div>
  );
}
