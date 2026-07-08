"use client";

import React from "react";
import type { GenomaDocument } from "@/lib/genoma/genoma-types";
import { genomaLocaleEs } from "@/lib/genoma/genoma-locale.es";
import { pendingGenomaSlotIds } from "@/lib/genoma/genoma-defaults";

type GenomaBoardHeaderProps = {
  doc: GenomaDocument;
  onBrandNameChange?: (name: string) => void;
  onExportTokens?: () => void;
  onExportCompiled?: () => void;
  canExport?: boolean;
};

export function GenomaBoardHeader({
  doc,
  onBrandNameChange,
  onExportTokens,
  onExportCompiled,
  canExport = false,
}: GenomaBoardHeaderProps) {
  const pending = pendingGenomaSlotIds(doc);
  const brand = doc.brandName?.value ?? "Marca";
  const hash = doc.compiledHash ?? "…";
  const completeness = doc.compiled ? "listo" : "pendiente";

  return (
    <header className="genoma-v2-header">
      <div className="genoma-v2-header__brand">
        <input
          className="genoma-v2-header__title"
          value={brand}
          aria-label="Nombre de marca"
          onChange={(event) => onBrandNameChange?.(event.target.value)}
        />
        <span className="genoma-v2-header__status">
          <span className="genoma-v2-live-dot" aria-hidden />
          {genomaLocaleEs.live}
        </span>
      </div>
      <div className="genoma-v2-header__actions">
        {pending.length ? (
          <span className="genoma-v2-pill genoma-v2-pill--pending">{genomaLocaleEs.pendingQueue}</span>
        ) : null}
        <button
          type="button"
          className="genoma-v2-pill genoma-v2-pill--ghost"
          disabled={!canExport}
          title={`Hash ${hash}`}
          onClick={onExportTokens}
        >
          {genomaLocaleEs.tokens}
        </button>
        <button
          type="button"
          className="genoma-v2-pill genoma-v2-pill--ghost"
          disabled={!canExport}
          title={`Compilado · ${completeness}`}
          onClick={onExportCompiled}
        >
          {genomaLocaleEs.compiled}
        </button>
      </div>
    </header>
  );
}
