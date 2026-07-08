"use client";

import React, { useMemo, useRef, useState } from "react";
import { normalizeGenomaUrlInput } from "@/lib/genoma/crawl/url-utils";
import { GenomaCrawlProgress, type GenomaCrawlProgressState } from "./GenomaCrawlProgress";

export function GenomaEntryScreen({
  onLoadDemo,
  onReset,
  onAnalyze,
  onIngestFiles,
  isAnalyzing = false,
  crawlProgress = null,
}: {
  onLoadDemo: () => void;
  onReset: () => void;
  onAnalyze: (url: string, enableLlm?: boolean) => void;
  onIngestFiles?: (files: File[], enableLlm?: boolean) => void;
  isAnalyzing?: boolean;
  crawlProgress?: GenomaCrawlProgressState | null;
}) {
  const [url, setUrl] = useState("");
  const [enableLlm, setEnableLlm] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const normalized = useMemo(() => normalizeGenomaUrlInput(url), [url]);
  const canAnalyze = normalized.ok && !isAnalyzing;

  const submit = () => {
    if (!normalized.ok) return;
    onAnalyze(normalized.url, enableLlm);
  };

  const ingestFiles = (files: FileList | File[]) => {
    const list = Array.from(files);
    if (!list.length || !onIngestFiles) return;
    onIngestFiles(list, enableLlm);
  };

  return (
    <div className="genoma-entry">
      <div>
        <h1 className="genoma-entry__title">Tu marca, desglosada.</h1>
        <p className="genoma-entry__copy">
          Dame tu web y te devuelvo logo, colores, tipografías, tono e imágenes — todo editable y listo para usar en el resto de Foldder.
        </p>
      </div>

      <form
        className="genoma-entry__row"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className="genoma-entry__input-wrap">
          <input
            className="genoma-entry__input"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="coca-cola.com/es/es"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            disabled={isAnalyzing}
            aria-invalid={url.trim().length > 0 && !normalized.ok}
          />
          {url.trim() && normalized.ok ? (
            <span className="genoma-entry__hint">→ {normalized.displayUrl}</span>
          ) : url.trim() && !normalized.ok ? (
            <span className="genoma-entry__hint genoma-entry__hint--error">{normalized.message}</span>
          ) : (
            <span className="genoma-entry__hint">Dominio o URL — no hace falta escribir https://</span>
          )}
        </div>
        <button type="submit" className="genoma-pill" disabled={!canAnalyze}>
          {isAnalyzing ? "Analizando…" : "Analizar"}
        </button>
      </form>

      <label className="genoma-entry__llm-toggle">
        <input
          type="checkbox"
          checked={enableLlm}
          onChange={(event) => setEnableLlm(event.target.checked)}
          disabled={isAnalyzing}
        />
        <span>Incluir síntesis IA (voz, valores, claims) — requiere saldo en wallet</span>
      </label>

      <div className="genoma-entry__examples">
        {["coca-cola.com/es/es", "www.nike.com", "stripe.com"].map((example) => (
          <button
            key={example}
            type="button"
            className="genoma-pill genoma-pill--ghost"
            disabled={isAnalyzing}
            onClick={() => setUrl(example)}
          >
            {example}
          </button>
        ))}
      </div>

      {crawlProgress ? (
        <div className="genoma-entry__progress">
          <GenomaCrawlProgress progress={crawlProgress} />
        </div>
      ) : null}

      <div
        className={`genoma-entry__dropzone${dragOver ? " is-dragover" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          ingestFiles(event.dataTransfer.files);
        }}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") fileInputRef.current?.click();
        }}
        role="button"
        tabIndex={0}
      >
        ¿Sin web? Suelta aquí lo que tengas: manual de marca, logo, fotos, presentaciones.
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.png,.jpg,.jpeg,.webp,.svg,.docx,.txt,.md,.pptx"
          className="sr-only"
          disabled={isAnalyzing}
          onChange={(event) => {
            if (event.target.files) ingestFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </div>

      <div className="flex flex-wrap gap-10">
        <button type="button" className="genoma-pill" onClick={onLoadDemo}>
          Cargar demo G1
        </button>
        <button type="button" className="genoma-pill genoma-pill--ghost" onClick={onReset}>
          Empezar de cero
        </button>
      </div>
    </div>
  );
}
