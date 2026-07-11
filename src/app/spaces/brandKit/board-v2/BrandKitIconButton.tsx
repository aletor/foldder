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
      className={`brandKit-icon-btn ${className}`.trim()}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon size={14} strokeWidth={1.75} aria-hidden />
    </button>
  );
}
