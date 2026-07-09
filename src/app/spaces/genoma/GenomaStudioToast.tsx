"use client";

import React, { useEffect } from "react";
import type { GenomaToast } from "@/lib/genoma/genoma-studio-feedback";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";

const ICONS = {
  success: CheckCircle2,
  warn: AlertTriangle,
  error: AlertTriangle,
  neutral: Info,
} as const;

export function GenomaStudioToastStack({
  toasts,
  onDismiss,
}: {
  toasts: GenomaToast[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div className="genoma-studio-toasts" aria-live="polite" aria-relevant="additions">
      {toasts.map((toast) => (
        <GenomaStudioToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function GenomaStudioToastItem({
  toast,
  onDismiss,
}: {
  toast: GenomaToast;
  onDismiss: (id: string) => void;
}) {
  useEffect(() => {
    const timer = window.setTimeout(() => onDismiss(toast.id), toast.tone === "error" ? 9000 : 5500);
    return () => window.clearTimeout(timer);
  }, [onDismiss, toast.id, toast.tone]);

  const Icon = ICONS[toast.tone];

  return (
    <div className={`genoma-studio-toast genoma-studio-toast--${toast.tone}`} role="status">
      <Icon size={16} className="genoma-studio-toast__icon" aria-hidden />
      <div className="genoma-studio-toast__copy">
        <p className="genoma-studio-toast__title">{toast.title}</p>
        {toast.detail ? <p className="genoma-studio-toast__detail">{toast.detail}</p> : null}
      </div>
      <button
        type="button"
        className="genoma-studio-toast__close"
        aria-label="Cerrar"
        onClick={() => onDismiss(toast.id)}
      >
        <X size={14} />
      </button>
    </div>
  );
}
