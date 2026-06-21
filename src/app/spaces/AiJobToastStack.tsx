"use client";

import { AI_JOB_CANVAS_NODE_ID, type AiJobCompleteDetail } from "@/lib/ai-job-notifications";

export type AiJobToastItem = { id: string } & AiJobCompleteDetail;

type AiJobToastStackProps = {
  toasts: AiJobToastItem[];
  onFocusNode: (nodeId?: string) => void;
  onDismiss: (id: string) => void;
};

function truncateMessage(message: string, max = 56): string {
  const trimmed = message.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

export function AiJobToastStack({ toasts, onFocusNode, onDismiss }: AiJobToastStackProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="foldder-ai-job-toasts flex flex-col items-end gap-1.5" aria-live="polite">
      {toasts.map((t) => {
        const focusCanvas = !t.nodeId || t.nodeId === AI_JOB_CANVAS_NODE_ID;
        const focusLabel = focusCanvas ? "Ver lienzo" : "Ir al nodo";
        const summary = `${t.ok ? "Listo" : "Error"} · ${t.label}`;

        return (
          <div
            key={t.id}
            className={`foldder-ai-job-toast pointer-events-auto${t.ok ? " foldder-ai-job-toast--ok" : " foldder-ai-job-toast--error"}`}
            role="status"
          >
            <span className="foldder-ai-job-toast__beacon" aria-hidden />
            <div className="foldder-ai-job-toast__copy min-w-0">
              <p className="foldder-ai-job-toast__summary" title={summary}>
                {summary}
              </p>
              {!t.ok && t.message ? (
                <p className="foldder-ai-job-toast__message" title={t.message}>
                  {truncateMessage(t.message)}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              className="foldder-ai-job-toast__go"
              title={focusLabel}
              aria-label={focusLabel}
              onClick={() => {
                onFocusNode(t.nodeId);
                onDismiss(t.id);
              }}
            >
              →
            </button>
            <button
              type="button"
              className="foldder-ai-job-toast__close"
              aria-label="Cerrar aviso"
              onClick={() => onDismiss(t.id)}
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
