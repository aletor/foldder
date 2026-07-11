"use client";

import React from "react";
import { X } from "lucide-react";

export function SiteCleanPreviewMode({ onExit }: { onExit: () => void }) {
  return (
    <button
      type="button"
      className="site-editor-clean-exit"
      onClick={onExit}
      aria-label="Salir del preview limpio"
      title="Volver al editor (Escape)"
    >
      <X size={16} strokeWidth={2} aria-hidden />
      <span>Editor</span>
    </button>
  );
}
