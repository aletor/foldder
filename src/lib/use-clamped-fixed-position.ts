import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";

const PAD = 12;

/**
 * `position: fixed` en (x, y) y ajuste para que el nodo medido no salga del viewport.
 * Útil para menús contextuales. `remeasureKey` debe cambiar cuando cambie el alto/ancho del contenido.
 */
export function useClampedFixedPosition(
  x: number,
  y: number,
  enabled: boolean,
  remeasureKey: string | number,
): { ref: RefObject<HTMLDivElement | null>; style: CSSProperties } {
  const ref = useRef<HTMLDivElement | null>(null);
  const [style, setStyle] = useState<CSSProperties>(() => ({ left: x, top: y }));

  useLayoutEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    if (!el) return;

    const vw = typeof window !== "undefined" ? window.innerWidth : 0;
    const vh = typeof window !== "undefined" ? window.innerHeight : 0;
    if (!vw || !vh) return;

    el.style.position = "fixed";
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;

    const rect = el.getBoundingClientRect();
    let left = x;
    let top = y;

    if (left + rect.width > vw - PAD) left = Math.max(PAD, vw - rect.width - PAD);
    if (top + rect.height > vh - PAD) top = Math.max(PAD, vh - rect.height - PAD);
    if (left < PAD) left = PAD;
    if (top < PAD) top = PAD;

    setStyle((prev) =>
      prev.left === left && prev.top === top ? prev : { left, top },
    );
  }, [x, y, enabled, remeasureKey]);

  return { ref, style };
}
