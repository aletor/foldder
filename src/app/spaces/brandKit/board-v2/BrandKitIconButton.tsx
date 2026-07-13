"use client";

import React from "react";
import type { LucideIcon } from "lucide-react";

export function BrandKitIconButton({
  icon: Icon,
  label,
  onClick,
  disabled = false,
  className = "",
}: {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`brandKit-foldder-btn brandKit-foldder-btn--white brandKit-foldder-btn--compact brandKit-foldder-btn--icon-only ${className}`.trim()}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon size={14} strokeWidth={1.75} aria-hidden />
    </button>
  );
}
