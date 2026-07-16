"use client";

import React from "react";
import type { LucideIcon } from "lucide-react";

type BrandKitFoldderButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: LucideIcon;
  variant?: "primary" | "muted" | "ghost" | "white" | "dock";
  compact?: boolean;
  iconOnly?: boolean;
  round?: boolean;
};

export function BrandKitFoldderButton({
  icon: Icon,
  variant = "primary",
  compact = false,
  iconOnly = false,
  round = false,
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
          : variant === "dock"
            ? " brandKit-foldder-btn--dock"
            : "";

  return (
    <button
      type={type}
      className={`brandKit-foldder-btn${variantClass}${compact ? " brandKit-foldder-btn--compact" : ""}${iconOnly ? " brandKit-foldder-btn--icon-only" : ""}${round ? " brandKit-foldder-btn--round" : ""} ${className}`.trim()}
      {...props}
    >
      {Icon ? <Icon size={16} strokeWidth={1.75} aria-hidden /> : null}
      {children}
    </button>
  );
}
