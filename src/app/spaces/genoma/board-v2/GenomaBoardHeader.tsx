"use client";

import React from "react";
import type { GenomaDocument } from "@/lib/genoma/genoma-types";
import { summarizeGenomaBoard } from "@/lib/genoma/genoma-board-status";
import { genomaLocaleEs } from "@/lib/genoma/genoma-locale.es";
import { computeGenomaCompleteness } from "@/lib/genoma/genoma-defaults";

type GenomaBoardHeaderProps = {
  doc: GenomaDocument;
  onBrandNameChange?: (name: string) => void;
};

export function GenomaBoardHeader({ doc, onBrandNameChange }: GenomaBoardHeaderProps) {
  const summary = summarizeGenomaBoard(doc);
  const completeness = computeGenomaCompleteness(doc);
  const brand = doc.brandName?.value ?? "Marca";

  return (
    <header className="genoma-v2-header">
      <div className="genoma-v2-header__brand">
        <input
          className="genoma-v2-header__title"
          value={brand}
          aria-label="Nombre de marca"
          onChange={(event) => onBrandNameChange?.(event.target.value)}
        />
        <span className="genoma-v2-header__completeness">{completeness.percent}% ADN</span>
      </div>
      <div className="genoma-v2-header__actions">
        {summary.needsYou > 0 ? (
          <span className="genoma-v2-header__pending">
            {genomaLocaleEs.analysisDoneNeedsYou(summary.needsYou)}
          </span>
        ) : summary.resolved > 0 ? (
          <span className="genoma-v2-header__ready">{genomaLocaleEs.boardReady}</span>
        ) : null}
      </div>
    </header>
  );
}
