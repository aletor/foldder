/**
 * Avisos cuando termina una petición a la IA aunque el usuario haya cambiado de nodo.
 * Los nodos llaman a `runAiJobWithNotification`; la UI escucha `foldder-ai-job-complete`.
 */

export const AI_JOB_COMPLETE_EVENT = "foldder-ai-job-complete";

/** Enfocar el lienzo completo (asistente, acciones sin nodo concreto). */
export const AI_JOB_CANVAS_NODE_ID = "__foldder_canvas__";

export type AiJobCompleteDetail = {
  /** Si falta o es `AI_JOB_CANVAS_NODE_ID`, el botón del aviso encuadra todo el lienzo. */
  nodeId?: string;
  /** Nombre corto del flujo (p. ej. "Nano Banana", "Veo") */
  label: string;
  ok: boolean;
  message?: string;
};

function emitAiJobComplete(detail: AiJobCompleteDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(AI_JOB_COMPLETE_EVENT, { detail }));
}

/**
 * Ejecuta `fn` y al terminar emite un evento para mostrar aviso + poder ir al nodo.
 * Devuelve `true` si `fn` terminó sin lanzar, `false` si hubo error.
 */
export async function runAiJobWithNotification(
  meta: { nodeId?: string; label: string },
  fn: () => Promise<void>
): Promise<boolean> {
  try {
    await fn();
    emitAiJobComplete({ nodeId: meta.nodeId, label: meta.label, ok: true });
    return true;
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    emitAiJobComplete({ nodeId: meta.nodeId, label: meta.label, ok: false, message });
    return false;
  }
}
