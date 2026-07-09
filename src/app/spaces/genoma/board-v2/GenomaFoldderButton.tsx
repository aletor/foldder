"use client";

import React from "react";
import type { LucideIcon } from "lucide-react";

type GenomaFoldderButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: LucideIcon;
  variant?: "primary" | "muted" | "ghost";
};

export function GenomaFoldderButton({
  icon: Icon,
  variant = "primary",
  className = "",
  children,
  type = "button",
  ...props
}: GenomaFoldderButtonProps) {
  const variantClass =
    variant === "muted" ? " genoma-foldder-btn--muted" : variant === "ghost" ? " genoma-foldder-btn--ghost" : "";

  return (
    <button type={type} className={`genoma-foldder-btn${variantClass} ${className}`.trim()} {...props}>
      {Icon ? <Icon size={14} strokeWidth={2} aria-hidden /> : null}
      {children}
    </button>
  );
}
