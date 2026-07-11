"use client";

import React, { useEffect } from "react";
import type { BrandKitToast } from "@/lib/brandkit/brand-kit-studio-feedback";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";

const ICONS = {
  success: CheckCircle2,
  warn: AlertTriangle,
  error: AlertTriangle,
  neutral: Info,
} as const;

export function BrandKitStudioToastStack({
  toasts,
  onDismiss,
}: {
  toasts: BrandKitToast[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div className="brandKit-studio-toasts" aria-live="polite" aria-relevant="additions">
      {toasts.map((toast) => (
        <BrandKitStudioToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function BrandKitStudioToastItem({
  toast,
  onDismiss,
}: {
  toast: BrandKitToast;
  onDismiss: (id: string) => void;
}) {
  useEffect(() => {
    const timer = window.setTimeout(() => onDismiss(toast.id), toast.tone === "error" ? 9000 : 5500);
    return () => window.clearTimeout(timer);
  }, [onDismiss, toast.id, toast.tone]);

  const Icon = ICONS[toast.tone];

  return (
    <div className={`brandKit-studio-toast brandKit-studio-toast--${toast.tone}`} role="status">
      <Icon size={16} className="brandKit-studio-toast__icon" aria-hidden />
      <div className="brandKit-studio-toast__copy">
        <p className="brandKit-studio-toast__title">{toast.title}</p>
        {toast.detail ? <p className="brandKit-studio-toast__detail">{toast.detail}</p> : null}
      </div>
      <button
        type="button"
        className="brandKit-studio-toast__close"
        aria-label="Cerrar"
        onClick={() => onDismiss(toast.id)}
      >
        <X size={14} />
      </button>
    </div>
  );
}
