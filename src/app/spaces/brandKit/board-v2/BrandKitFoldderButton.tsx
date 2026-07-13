"use client";

import React from "react";
import type { LucideIcon } from "lucide-react";

type BrandKitFoldderButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: LucideIcon;
  variant?: "primary" | "muted" | "ghost" | "white";
  compact?: boolean;
};

export function BrandKitFoldderButton({
  icon: Icon,
  variant = "primary",
  compact = false,
  className = "",
  children,
  type = "button",
  ...props
}: BrandKitFoldderButtonProps) {
  const variantClass =
    variant === "muted"
      ? " brandKit-foldder-btn--muted"
      : variant === "ghost"
        ? " brandKit-foldder-btn--ghost"
        : variant === "white"
          ? " brandKit-foldder-btn--white"
          : "";

  return (
    <button
      type={type}
      className={`brandKit-foldder-btn${variantClass}${compact ? " brandKit-foldder-btn--compact" : ""} ${className}`.trim()}
      {...props}
    >
      {Icon ? <Icon size={14} strokeWidth={2} aria-hidden /> : null}
      {children}
    </button>
  );
}
