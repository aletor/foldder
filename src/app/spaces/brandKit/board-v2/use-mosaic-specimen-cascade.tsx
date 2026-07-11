"use client";

import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";

export const MOSAIC_SPECIMEN_FALLBACK = "AaBb Gg Rr 0123";

const SPECIMEN_MIN_FONT_PX = 36;
const SPECIMEN_LINE_HEIGHT = 1.08;
const SPECIMEN_MAX_LINES = 2;

function fitsTwoLines(element: HTMLElement): boolean {
  const maxHeight = SPECIMEN_MIN_FONT_PX * SPECIMEN_LINE_HEIGHT * SPECIMEN_MAX_LINES;
  return element.scrollHeight <= maxHeight + 2;
}

export function useMosaicSpecimenCascade({
  headline,
  brandName,
  fontFamily,
  containerRef,
}: {
  headline?: string;
  brandName?: string;
  fontFamily: string;
  containerRef: RefObject<HTMLElement | null>;
}): { specimen: string; measureNode: ReactNode } {
  const [specimen, setSpecimen] = useState(MOSAIC_SPECIMEN_FALLBACK);
  const measureRef = useRef<HTMLParagraphElement>(null);

  useLayoutEffect(() => {
    const measureEl = measureRef.current;
    const container = containerRef.current;
    if (!measureEl || !container) return;

    measureEl.style.width = `${container.clientWidth}px`;

    const candidates = [headline?.trim(), brandName?.trim(), MOSAIC_SPECIMEN_FALLBACK].filter(
      (value): value is string => Boolean(value),
    );

    for (const candidate of candidates) {
      measureEl.textContent = candidate;
      if (fitsTwoLines(measureEl)) {
        setSpecimen(candidate);
        return;
      }
    }

    setSpecimen(MOSAIC_SPECIMEN_FALLBACK);
  }, [headline, brandName, fontFamily, containerRef]);

  const measureNode = (
    <p
      ref={measureRef}
      className="brandKit-type-specimen--mosaic-display brandKit-type-specimen--mosaic-measure"
      style={{ fontFamily }}
      aria-hidden
    />
  );

  return { specimen, measureNode };
}
