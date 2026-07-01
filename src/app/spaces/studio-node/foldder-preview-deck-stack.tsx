"use client";

import React from "react";

/** Capas visibles rotadas bajo la superficie de preview (efecto baraja). */
export function FoldderPreviewDeckStack({
  layerCount,
  children,
  className = "",
}: {
  layerCount: number;
  children: React.ReactNode;
  className?: string;
}) {
  const showDeck = layerCount >= 2;

  return (
    <div className={`foldder-preview-deck-stack${className ? ` ${className}` : ""}`}>
      {showDeck ? (
        <div className="foldder-preview-deck-stack__deck" aria-hidden>
          {layerCount >= 3 ? (
            <div className="foldder-preview-deck-stack__layer foldder-preview-deck-stack__layer--3" />
          ) : null}
          <div className="foldder-preview-deck-stack__layer foldder-preview-deck-stack__layer--2" />
          <div className="foldder-preview-deck-stack__layer foldder-preview-deck-stack__layer--1" />
        </div>
      ) : null}
      <div className="foldder-preview-deck-stack__surface">{children}</div>
    </div>
  );
}
