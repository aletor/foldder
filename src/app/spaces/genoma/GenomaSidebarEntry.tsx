"use client";

import React, { useMemo, useRef, useState } from "react";
import { Globe, Plus } from "lucide-react";
import { genomaLocaleEs } from "@/lib/genoma/genoma-locale.es";
import { normalizeGenomaUrlInput } from "@/lib/genoma/crawl/url-utils";
import { GenomaFoldderButton } from "./board-v2/GenomaFoldderButton";
import type { GenomaSidebarPhase } from "@/lib/genoma/studio/sidebar-phase";

type GenomaSidebarEntryProps = {
  phase: GenomaSidebarPhase;
  isAnalyzing: boolean;
  hasSources: boolean;
  onAnalyze: (url: string, enableLlm?: boolean) => void;
  onIngestFiles: (files: File[], enableLlm?: boolean) => void;
};

export function GenomaSidebarEntry({
  phase,
  isAnalyzing,
  hasSources,
  onAnalyze,
  onIngestFiles,
}: GenomaSidebarEntryProps) {
  const [url, setUrl] = useState("");
  const [enableLlm, setEnableLlm] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const [expanded, setExpanded] = useState(phase === "empty");
  const [showOptions, setShowOptions] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const normalized = useMemo(() => normalizeGenomaUrlInput(url), [url]);
  const canAnalyze = normalized.ok && !isAnalyzing;

  const ingestFiles = (files: FileList | File[]) => {
    const list = Array.from(files);
    if (!list.length) return;
    onIngestFiles(list, enableLlm);
    setExpanded(false);
  };

  if (phase !== "empty" && !expanded) {
    return (
      <section className="genoma-sidebar-entry genoma-sidebar-entry--collapsed" aria-label="Entrada de material">
        <button
          type="button"
          className="genoma-sidebar-entry__expand"
          onClick={() => setExpanded(true)}
          disabled={isAnalyzing}
        >
          <Plus size={14} aria-hidden />
          {genomaLocaleEs.addAnotherSource}
        </button>
      </section>
    );
  }

  return (
    <section className="genoma-sidebar-entry" aria-label="Entrada de material">
      {phase === "empty" ? (
        <>
          <p className="genoma-sidebar-entry__lead">{genomaLocaleEs.sidebarEmptyLead}</p>
          <p className="genoma-sidebar-entry__sub">{genomaLocaleEs.sidebarEmptySub}</p>
        </>
      ) : (
        <button
          type="button"
          className="genoma-sidebar-entry__collapse"
          onClick={() => setExpanded(false)}
        >
          {genomaLocaleEs.hideAddSource}
        </button>
      )}

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
        className={`genoma-split-entry__dropzone${dragOver ? " is-dragover" : ""}${isAnalyzing ? " is-disabled" : ""}${phase === "empty" ? " genoma-split-entry__dropzone--hero" : ""}`}
      >
        <span>{phase === "empty" ? genomaLocaleEs.sidebarDropHero : "suelta archivos o haz clic"}</span>
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

      <p className="genoma-sidebar-entry__or">{genomaLocaleEs.sidebarOrUrl}</p>

      <form
        className="genoma-split-entry__url"
        onSubmit={(event) => {
          event.preventDefault();
          if (!normalized.ok) return;
          onAnalyze(normalized.url, enableLlm);
          setUrl("");
          setExpanded(false);
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
          {isAnalyzing
            ? genomaLocaleEs.analyzingButton
            : hasSources
              ? genomaLocaleEs.addSource
              : genomaLocaleEs.analyze}
        </GenomaFoldderButton>
      </form>

      {url.trim() && normalized.ok ? (
        <p className="genoma-split-entry__hint">{normalized.displayUrl}</p>
      ) : url.trim() && !normalized.ok ? (
        <p className="genoma-split-entry__hint genoma-split-entry__hint--error">{normalized.message}</p>
      ) : null}

      <button
        type="button"
        className="genoma-sidebar-entry__options-toggle"
        onClick={() => setShowOptions((value) => !value)}
        aria-expanded={showOptions}
      >
        {genomaLocaleEs.sidebarAnalysisOptions}
      </button>

      {showOptions ? (
        <div className="genoma-sidebar-entry__options">
          <label className="genoma-split-entry__llm">
            <input
              type="checkbox"
              checked={enableLlm}
              onChange={(event) => setEnableLlm(event.target.checked)}
              disabled={isAnalyzing}
            />
            <span>síntesis ia</span>
          </label>
          <p className="genoma-split-entry__hint">{genomaLocaleEs.synthesisIaHint}</p>
          {!hasSources ? (
            <p className="genoma-split-entry__hint">{genomaLocaleEs.crawlCostHint}</p>
          ) : (
            <p className="genoma-split-entry__hint">{genomaLocaleEs.addSourceHint}</p>
          )}
        </div>
      ) : null}
    </section>
  );
}
