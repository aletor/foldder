import type { MouseEvent, PointerEvent } from "react";

/**
 * Dispara la acción en pointerdown (antes de que un listener de captura
 * desmonte el menú) y en click para tests / teclado. Evita ejecutar dos veces.
 */
export function floatingPressHandlers(activate: () => void): {
  onPointerDown: (e: PointerEvent<HTMLElement>) => void;
  onClick: (e: MouseEvent<HTMLElement>) => void;
} {
  return {
    onPointerDown: (e) => {
      if (e.button !== 0 && e.button !== undefined) return;
      e.stopPropagation();
      activate();
      (e.currentTarget as HTMLElement).dataset.scActivated = "1";
    },
    onClick: (e) => {
      e.preventDefault();
      e.stopPropagation();
      const el = e.currentTarget as HTMLElement;
      if (el.dataset.scActivated === "1") {
        delete el.dataset.scActivated;
        return;
      }
      activate();
    },
  };
}

export function isNodeInsideRefs(target: EventTarget | null, refs: Array<{ current: HTMLElement | null }>): boolean {
  if (!(target instanceof Node)) return false;
  for (const ref of refs) {
    if (ref.current?.contains(target)) return true;
  }
  if (target instanceof Element && target.closest("[data-site-creator-floating-ui='true']")) {
    return true;
  }
  return false;
}
