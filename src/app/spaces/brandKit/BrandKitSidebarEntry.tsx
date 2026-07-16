"use client";

import React, { useMemo, useRef, useState } from "react";
import { Globe, Plus } from "lucide-react";
import { brandKitLocaleEs } from "@/lib/brandkit/brand-kit-locale.es";
import { normalizeBrandKitUrlInput } from "@/lib/brandkit/crawl/url-utils";
import { BrandKitFoldderButton } from "./board-v2/BrandKitFoldderButton";
import type { BrandKitSidebarPhase } from "@/lib/brandkit/studio/sidebar-phase";

type BrandKitSidebarEntryProps = {
  phase: BrandKitSidebarPhase;
  isAnalyzing: boolean;
  hasSources: boolean;
  onAnalyze: (url: string, enableLlm?: boolean) => void;
  onIngestFiles: (files: File[], enableLlm?: boolean) => void;
  /** En onboarding el lead/sub van en BrandKitBoardEmpty; aquí solo controles. */
  variant?: "sidebar" | "onboarding";
};

export function BrandKitSidebarEntry({
  phase,
  isAnalyzing,
  hasSources,
  onAnalyze,
  onIngestFiles,
  variant = "sidebar",
}: BrandKitSidebarEntryProps) {
  const [url, setUrl] = useState("");
  const [enableLlm, setEnableLlm] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const [expanded, setExpanded] = useState(phase === "empty");
  const [showOptions, setShowOptions] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const normalized = useMemo(() => normalizeBrandKitUrlInput(url), [url]);
  const canAnalyze = normalized.ok && !isAnalyzing;

  const ingestFiles = (files: FileList | File[]) => {
    const list = Array.from(files);
    if (!list.length) return;
    onIngestFiles(list, enableLlm);
    setExpanded(false);
  };

  if (phase !== "empty" && !expanded) {
    return (
      <section className="brandKit-sidebar-entry brandKit-sidebar-entry--collapsed" aria-label="Entrada de material">
        <button
          type="button"
          className="brandKit-sidebar-entry__expand"
          onClick={() => setExpanded(true)}
          disabled={isAnalyzing}
        >
          <Plus size={14} aria-hidden />
          {brandKitLocaleEs.addAnotherSource}
        </button>
      </section>
    );
  }

  const isOnboarding = variant === "onboarding";

  return (
    <section
      className={`brandKit-sidebar-entry${isOnboarding ? " brandKit-sidebar-entry--onboarding" : ""}`}
      aria-label="Entrada de material"
    >
      {phase === "empty" && !isOnboarding ? (
        <>
          <p className="brandKit-sidebar-entry__lead">{brandKitLocaleEs.sidebarEmptyLead}</p>
          <p className="brandKit-sidebar-entry__sub">{brandKitLocaleEs.sidebarEmptySub}</p>
        </>
      ) : null}

      {phase !== "empty" && !isOnboarding ? (
        <button
          type="button"
          className="brandKit-sidebar-entry__collapse"
          onClick={() => setExpanded(false)}
        >
          {brandKitLocaleEs.hideAddSource}
        </button>
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
        className={`brandKit-split-entry__dropzone${dragOver ? " is-dragover" : ""}${isAnalyzing ? " is-disabled" : ""}${phase === "empty" || isOnboarding ? " brandKit-split-entry__dropzone--hero" : ""}`}
      >
        <span>
          {phase === "empty" || isOnboarding
            ? brandKitLocaleEs.sidebarDropHero
            : "suelta archivos o haz clic"}
        </span>
        <span className="brandKit-split-entry__dropzone-meta">pdf, imágenes, manual de marca</span>
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

      <p className="brandKit-sidebar-entry__or">{brandKitLocaleEs.sidebarOrUrl}</p>

      <form
        className="brandKit-split-entry__url"
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
          placeholder={brandKitLocaleEs.sidebarUrlPlaceholder}
          className="brandKit-split-entry__input"
          inputMode="url"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          disabled={isAnalyzing}
          aria-invalid={url.trim().length > 0 && !normalized.ok}
        />
        <BrandKitFoldderButton type="submit" icon={Globe} disabled={!canAnalyze}>
          {isAnalyzing
            ? brandKitLocaleEs.analyzingButton
            : hasSources
              ? brandKitLocaleEs.addSource
              : brandKitLocaleEs.analyze}
        </BrandKitFoldderButton>
      </form>

      {url.trim() && normalized.ok ? (
        <p className="brandKit-split-entry__hint">{normalized.displayUrl}</p>
      ) : url.trim() && !normalized.ok ? (
        <p className="brandKit-split-entry__hint brandKit-split-entry__hint--error">{normalized.message}</p>
      ) : null}

      <button
        type="button"
        className="brandKit-sidebar-entry__options-toggle"
        onClick={() => setShowOptions((value) => !value)}
        aria-expanded={showOptions}
      >
        {brandKitLocaleEs.sidebarAnalysisOptions}
      </button>

      {showOptions ? (
        <div className="brandKit-sidebar-entry__options">
          <label className="brandKit-split-entry__llm">
            <input
              type="checkbox"
              checked={enableLlm}
              onChange={(event) => setEnableLlm(event.target.checked)}
              disabled={isAnalyzing}
            />
            <span>síntesis ia</span>
          </label>
          <p className="brandKit-split-entry__hint">{brandKitLocaleEs.synthesisIaHint}</p>
          {!hasSources ? (
            <p className="brandKit-split-entry__hint">{brandKitLocaleEs.crawlCostHint}</p>
          ) : (
            <p className="brandKit-split-entry__hint">{brandKitLocaleEs.addSourceHint}</p>
          )}
        </div>
      ) : null}
    </section>
  );
}
