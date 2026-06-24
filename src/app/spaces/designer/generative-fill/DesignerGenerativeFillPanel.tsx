"use client";

import React from "react";
import { Loader2, Sparkles, X } from "lucide-react";
import type { GenerativeFillRect } from "@/lib/designer/generative-fill/types";
import {
  GENERATIVE_FILL_DEFAULT_CONTEXT_BLEED,
  GENERATIVE_FILL_DEFAULT_FEATHER,
} from "@/lib/designer/generative-fill/types";

export type DesignerGenerativeFillPanelProps = {
  selections: GenerativeFillRect[];
  prompt: string;
  feather: number;
  contextBleed: number;
  busy: boolean;
  error?: string | null;
  onPromptChange: (value: string) => void;
  onFeatherChange: (value: number) => void;
  onContextBleedChange: (value: number) => void;
  onClearSelections: () => void;
  onGenerate: () => void;
};

export function DesignerGenerativeFillPanel({
  selections,
  prompt,
  feather,
  contextBleed,
  busy,
  error,
  onPromptChange,
  onFeatherChange,
  onContextBleedChange,
  onClearSelections,
  onGenerate,
}: DesignerGenerativeFillPanelProps) {
  const zoneCount = selections.length;

  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-[10px] leading-relaxed text-zinc-500">
        Arrastra sobre el pliego para marcar zonas.{" "}
        <strong className="text-zinc-400">Shift+arrastrar</strong> añade otra zona. El resultado es
        una capa nueva con alfa.
      </p>

      <div className="flex items-center gap-2 text-[10px] text-zinc-400">
        <span>
          {zoneCount === 0 ? "Sin selección" : `${zoneCount} zona${zoneCount === 1 ? "" : "s"}`}
        </span>
        {zoneCount > 0 ? (
          <button
            type="button"
            onClick={onClearSelections}
            className="inline-flex items-center gap-0.5 text-zinc-500 hover:text-zinc-300"
          >
            <X size={11} /> Limpiar
          </button>
        ) : null}
      </div>

      <textarea
        value={prompt}
        onChange={(e) => onPromptChange(e.target.value)}
        rows={2}
        placeholder="Prompt opcional (vacío = relleno contextual)"
        className="w-full resize-none rounded border border-white/10 bg-black/30 px-2 py-1.5 text-[11px] text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-teal-500/40"
      />

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-0.5 text-[10px] text-zinc-500">
          Feather (px)
          <input
            type="number"
            min={0}
            max={32}
            value={feather}
            onChange={(e) => onFeatherChange(Number(e.target.value) || 0)}
            className="rounded border border-white/10 bg-black/30 px-2 py-1 text-[11px] text-zinc-200"
          />
        </label>
        <label className="flex flex-col gap-0.5 text-[10px] text-zinc-500">
          Contexto (px)
          <input
            type="number"
            min={0}
            max={256}
            value={contextBleed}
            onChange={(e) => onContextBleedChange(Number(e.target.value) || 0)}
            className="rounded border border-white/10 bg-black/30 px-2 py-1 text-[11px] text-zinc-200"
          />
        </label>
      </div>

      {error ? <p className="text-[10px] text-rose-300">{error}</p> : null}

      <button
        type="button"
        disabled={busy || zoneCount === 0}
        onClick={onGenerate}
        className="flex items-center justify-center gap-1.5 rounded-lg bg-teal-600/90 px-3 py-2 text-[11px] font-semibold text-white transition hover:bg-teal-500 disabled:opacity-45"
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
        {busy ? "Generando…" : "Generar relleno"}
      </button>
    </div>
  );
}

export const GENERATIVE_FILL_PANEL_DEFAULTS = {
  feather: GENERATIVE_FILL_DEFAULT_FEATHER,
  contextBleed: GENERATIVE_FILL_DEFAULT_CONTEXT_BLEED,
  prompt: "",
};
