"use client";

import React from "react";
import { resolveNodeSidebarTileBackground } from "../node-sidebar-tile-bg";

/** Rectángulo superior izquierdo con la imagen del botón de librería — studio tocado desde instanciación. */
export function FoldderStudioTouchedMark({ nodeType }: { nodeType: string }) {
  const backgroundImage = resolveNodeSidebarTileBackground(nodeType);

  return (
    <span
      className="foldder-studio-touched-mark pointer-events-none"
      style={backgroundImage ? { backgroundImage: `url(${backgroundImage})` } : undefined}
      aria-hidden
      data-foldder-studio-touched-mark
      data-foldder-studio-touched-type={nodeType}
    />
  );
}
