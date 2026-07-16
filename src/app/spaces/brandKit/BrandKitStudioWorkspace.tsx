"use client";

import React from "react";
import { BrandKitInspectorPanel } from "./board-v2/BrandKitInspectorPanel";
import { useBrandKitMosaicBoard } from "./board-v2/brand-kit-mosaic-context";

export function BrandKitStudioWorkspace({
  sidebar,
  children,
  onboarding = false,
}: {
  sidebar: React.ReactNode;
  children: React.ReactNode;
  /** Primera experiencia / primer ingest: sin sidebar ni inspector. */
  onboarding?: boolean;
}) {
  const board = useBrandKitMosaicBoard();
  const inspectorOpen = Boolean(!onboarding && board?.detailOpen && board.studioMode === "edit");

  return (
    <div
      className={`brandKit-studio-workspace${onboarding ? " brandKit-studio-workspace--onboarding" : ""}`}
      data-brandkit-inspector-open={inspectorOpen ? "true" : "false"}
      data-brandkit-onboarding={onboarding ? "true" : "false"}
    >
      {onboarding ? null : sidebar}
      <div className="brandKit-studio-workspace__center">{children}</div>
      {onboarding ? null : <BrandKitInspectorPanel />}
    </div>
  );
}
