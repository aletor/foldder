"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DesignerPageState } from "@/app/spaces/designer/DesignerNode";
import { collectDesignerPageFontFamilies } from "@/app/spaces/designer/designer-page-text-frame-sync";
import { ensureGoogleFontPreviewBatchLoaded } from "@/app/spaces/freehand/google-fonts-preview-loader";
import { getPageDimensions } from "@/app/spaces/indesign/page-formats";
import { DesignerPageCanvasView } from "@/app/spaces/presenter/DesignerPageCanvasView";
import {
  collectPopulateEntityPickTargets,
  populateEntityAtCanvasPoint,
} from "./populate-studio-entity-pick";
import {
  buildPopulateStackWrap,
  collectPopulateObjectContentFingerprints,
  diffPopulateContentFingerprints,
  populatePulseObjectIdsForEntity,
  resolvePopulateContentBlinkRootIds,
} from "./populate-studio-entity-pulse";

const CONTENT_BLINK_MS = 200;

function pageBackground(page: DesignerPageState): string {
  if (page.pageBackground === "black") return "#000000";
  if (page.pageBackground === "transparent") return "transparent";
  return "#fafafa";
}

function clientToSvgPoint(svg: SVGSVGElement, clientX: number, clientY: number): { x: number; y: number } | null {
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  const p = pt.matrixTransform(ctm.inverse());
  return { x: p.x, y: p.y };
}

export function PopulateStudioEntityCanvas({
  page,
  entityLabels,
  selectedEntityId,
  onSelectEntity,
}: {
  page: DesignerPageState;
  entityLabels: Map<string, string>;
  selectedEntityId: string | null;
  onSelectEntity: (entityId: string | null) => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [fontsReady, setFontsReady] = useState(false);
  const [blinkObjectIds, setBlinkObjectIds] = useState<Set<string>>(() => new Set());
  const [blinkGeneration, setBlinkGeneration] = useState(0);
  const [selectionAnimKey, setSelectionAnimKey] = useState(0);
  const contentFpRef = useRef<Map<string, string>>(new Map());
  const contentFpReadyRef = useRef(false);
  const { width: pageWidth, height: pageHeight } = getPageDimensions(page);
  const objects = page.objects ?? [];

  const fontFamilies = useMemo(() => collectDesignerPageFontFamilies(page), [page]);

  useEffect(() => {
    let cancelled = false;
    setFontsReady(false);
    void ensureGoogleFontPreviewBatchLoaded(fontFamilies)
      .then(() => {
        if (!cancelled) setFontsReady(true);
      })
      .catch(() => {
        if (!cancelled) setFontsReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [fontFamilies]);

  useEffect(() => {
    const next = collectPopulateObjectContentFingerprints(objects);
    if (contentFpReadyRef.current) {
      const changed = diffPopulateContentFingerprints(contentFpRef.current, next);
      if (changed.size > 0) {
        const rootIds = resolvePopulateContentBlinkRootIds(objects, entityLabels, changed);
        setBlinkObjectIds(rootIds);
        setBlinkGeneration((g) => g + 1);
        const timer = window.setTimeout(() => setBlinkObjectIds(new Set()), CONTENT_BLINK_MS);
        contentFpRef.current = next;
        return () => window.clearTimeout(timer);
      }
    } else {
      contentFpReadyRef.current = true;
    }
    contentFpRef.current = next;
    return undefined;
  }, [entityLabels, objects]);

  useEffect(() => {
    if (selectedEntityId != null) {
      setSelectionAnimKey((k) => k + 1);
    }
  }, [selectedEntityId]);

  const pickTargets = useMemo(
    () => collectPopulateEntityPickTargets(objects, entityLabels),
    [entityLabels, objects],
  );

  const pulseObjectIds = useMemo(
    () => populatePulseObjectIdsForEntity(objects, entityLabels, selectedEntityId),
    [entityLabels, objects, selectedEntityId],
  );

  const stackWrapRenderedObject = useMemo(
    () => buildPopulateStackWrap(pulseObjectIds, selectionAnimKey, blinkObjectIds, blinkGeneration),
    [blinkGeneration, blinkObjectIds, pulseObjectIds, selectionAnimKey],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (e.button !== 0) return;
      const svg = svgRef.current;
      if (!svg) return;
      const pt = clientToSvgPoint(svg, e.clientX, e.clientY);
      if (!pt) return;
      e.preventDefault();
      e.stopPropagation();
      const hit = populateEntityAtCanvasPoint(pickTargets, pt.x, pt.y);
      onSelectEntity(hit?.entityId ?? null);
    },
    [onSelectEntity, pickTargets],
  );

  return (
    <div className={`populate-studio-entity-canvas${fontsReady ? " is-fonts-ready" : ""}`}>
      <DesignerPageCanvasView
        objects={objects}
        pageWidth={pageWidth}
        pageHeight={pageHeight}
        background={pageBackground(page)}
        stackWrapRenderedObject={stackWrapRenderedObject}
      />
      <svg
        ref={svgRef}
        className="populate-studio-entity-canvas__overlay"
        viewBox={`0 0 ${pageWidth} ${pageHeight}`}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={handlePointerDown}
      >
        {pickTargets.map((t) => (
          <rect
            key={t.objectId}
            x={t.bounds.x}
            y={t.bounds.y}
            width={t.bounds.width}
            height={t.bounds.height}
            fill="transparent"
            stroke="transparent"
            strokeWidth={0}
            className="populate-studio-entity-canvas__hit"
            data-entity-id={t.entityId}
          />
        ))}
      </svg>
    </div>
  );
}
