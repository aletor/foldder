"use client";

import React from "react";
import { brandKitLocaleEs } from "@/lib/brandkit/brand-kit-locale.es";

type BrandKitBoardEmptyProps = {
  /** Onboarding a pantalla completa: copy sin “a la izquierda”. */
  variant?: "board" | "onboarding";
};

export function BrandKitBoardEmpty({ variant = "board" }: BrandKitBoardEmptyProps) {
  const copy =
    variant === "onboarding"
      ? brandKitLocaleEs.boardEmptyCopyOnboarding
      : brandKitLocaleEs.boardEmptyCopy;

  return (
    <div
      className={`brandKit-board-empty${variant === "onboarding" ? " brandKit-board-empty--onboarding" : ""}`}
      aria-label="Libro de marca vacío"
    >
      <p className="brandKit-board-empty__label">{brandKitLocaleEs.boardEmptyLabel}</p>
      <h2 className="brandKit-board-empty__title">{brandKitLocaleEs.boardEmptyTitle}</h2>
      <p className="brandKit-board-empty__copy">{copy}</p>
      <ol className="brandKit-board-empty__steps">
        <li>{brandKitLocaleEs.boardEmptyStep1}</li>
        <li>{brandKitLocaleEs.boardEmptyStep2}</li>
        <li>{brandKitLocaleEs.boardEmptyStep3}</li>
      </ol>
    </div>
  );
}
