"use client";

import React, { useMemo, useRef, useState } from "react";
import type { GenomaDocument } from "@/lib/genoma/genoma-types";
import { genomaLocaleEs } from "@/lib/genoma/genoma-locale.es";
import { normalizeGenomaUrlInput } from "@/lib/genoma/crawl/url-utils";
import { GenomaCrawlProgress, type GenomaCrawlProgressState } from "./GenomaCrawlProgress";
import { GenomaFoldderButton } from "./board-v2/GenomaFoldderButton";
import { Globe } from "lucide-react";

export type GenomaSidebarPanelProps = {
  doc: GenomaDocument;
  completenessPercent: number;
  isAnalyzing?: boolean;
  crawlProgress?: GenomaCrawlProgressState | null;
  crawlError?: string | null;
  canExport?: boolean;
  onAnalyze: (url: string, enableLlm?: boolean) => void;
  onIngestFiles?: (files: File[], enableLlm?: boolean) => void;
  onExportTokens?: () => void;
  onExportCompiled?: () => void;
};

export function GenomaSidebarPanel({
  doc,
  completenessPercent,
  isAnalyzing = false,
  crawlProgress = null,
  crawlError = null,
  canExport = false,
  onAnalyze,
  onIngestFiles,
  onExportTokens,
  onExportCompiled,
}: GenomaSidebarPanelProps) {
  const [url, setUrl] = useState("");
  const [enableLlm, setEnableLlm] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const normalized = useMemo(() => normalizeGenomaUrlInput(url), [url]);
  const canAnalyze = normalized.ok && !isAnalyzing;
  const sourcesCount = doc.sources.length;

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
    <aside className="genoma-studio-split__sidebar" aria-label="Entrada de material">
      <div className="genoma-studio-split__sidebar-scroll">
        <div className="genoma-split-stat" aria-label={`${completenessPercent}% del ADN resuelto`}>
          <span data-testid="genoma-completeness" className="genoma-split-stat__value">
            {completenessPercent}%
          </span>
          <span className="genoma-split-stat__label">adn resuelto</span>
        </div>

        <section className="genoma-split-entry" aria-label="Entrada de material">
          <form
            className="genoma-split-entry__url"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="url de la marca"
              className="genoma-split-entry__input"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              disabled={isAnalyzing}
              aria-invalid={url.trim().length > 0 && !normalized.ok}
            />
            <GenomaFoldderButton type="submit" icon={Globe} disabled={!canAnalyze}>
              {isAnalyzing ? "…" : "analizar"}
            </GenomaFoldderButton>
          </form>

          {url.trim() && normalized.ok ? (
            <p className="genoma-split-entry__hint">{normalized.displayUrl}</p>
          ) : url.trim() && !normalized.ok ? (
            <p className="genoma-split-entry__hint genoma-split-entry__hint--error">{normalized.message}</p>
          ) : null}

          <div
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") fileInputRef.current?.click();
            }}
            onClick={() => fileInputRef.current?.click()}
            onDragEnter={(event) => {
              event.preventDefault();
              setDragOver(true);
            }}
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
            className={`genoma-split-entry__dropzone${dragOver ? " is-dragover" : ""}${isAnalyzing ? " is-disabled" : ""}`}
          >
            <span>suelta archivos o haz clic</span>
            <span className="genoma-split-entry__dropzone-meta">pdf, imágenes, manual de marca</span>
          </div>

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

          <label className="genoma-split-entry__llm">
            <input
              type="checkbox"
              checked={enableLlm}
              onChange={(event) => setEnableLlm(event.target.checked)}
              disabled={isAnalyzing}
            />
            <span>síntesis ia</span>
          </label>
        </section>

        {crawlProgress ? <GenomaCrawlProgress progress={crawlProgress} compact /> : null}
        {crawlError ? <p className="genoma-studio-split__error">{crawlError}</p> : null}

        {sourcesCount > 0 ? (
          <section className="genoma-split-sources" aria-label="Fuentes">
            <p className="genoma-split-sources__title">
              {sourcesCount} {sourcesCount === 1 ? "fuente" : "fuentes"}
            </p>
            <ul className="genoma-split-sources__list">
              {doc.sources.map((source, index) => (
                <li key={`${source.ref}-${source.ts}-${index}`} title={source.ref}>
                  <span className="genoma-split-sources__ref">{source.ref}</span>
                  <span className="genoma-split-sources__kind">{source.kind === "url" ? "web" : "archivo"}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      <div className="genoma-studio-split__sidebar-footer">
        <div className="genoma-split-export">
          <GenomaFoldderButton variant="muted" disabled={!canExport} onClick={onExportTokens} title={genomaLocaleEs.tokens}>
            {genomaLocaleEs.tokens.toLowerCase()}
          </GenomaFoldderButton>
          <GenomaFoldderButton variant="muted" disabled={!canExport} onClick={onExportCompiled} title={genomaLocaleEs.compiled}>
            {genomaLocaleEs.compiled.toLowerCase()}
          </GenomaFoldderButton>
        </div>
      </div>
    </aside>
  );
}
