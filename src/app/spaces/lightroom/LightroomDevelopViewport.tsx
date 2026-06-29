"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { LightroomDevelopDocument } from "./lightroom-mask-types";
import type { MaskLayerAlpha, LightroomDevelopEngine } from "./lightroom-webgl-engine";
import { LightroomDevelopEngine as EngineClass } from "./lightroom-webgl-engine";
import { getLinearSource } from "./lightroom-linear-cache";

export type LightroomDevelopViewportProps = {
  /** Clave de caché lineal (preferida sobre dataUrl). */
  sourceKey?: string | null;
  /** Fallback PNG 8-bit si no hay buffer lineal en sesión. */
  sourceDataUrl?: string | null;
  /** RAW: no usar dataUrl como fuente GPU (evita doble revelado tipo JPEG). */
  linearOnly?: boolean;
  document: LightroomDevelopDocument;
  fullResolution?: boolean;
  className?: string;
  refreshKey?: number;
  /** Muestra imagen base sin revelado (antes/después). */
  compareBefore?: boolean;
  compareSplit?: number;
  onRendered?: (dataUrl: string) => void;
  onEngineReady?: (engine: LightroomDevelopEngine | null) => void;
  onPointerNorm?: (norm: { x: number; y: number } | null) => void;
  onCanvasReady?: (canvas: HTMLCanvasElement | null) => void;
  overlay?: React.ReactNode;
};

export function LightroomDevelopViewport({
  sourceKey,
  sourceDataUrl,
  linearOnly = false,
  document,
  fullResolution = false,
  className = "",
  refreshKey = 0,
  compareBefore = false,
  compareSplit = 50,
  onRendered,
  onEngineReady,
  onPointerNorm,
  onCanvasReady,
  overlay,
}: LightroomDevelopViewportProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onCanvasReadyRef = useRef(onCanvasReady);
  onCanvasReadyRef.current = onCanvasReady;
  const engineRef = useRef<LightroomDevelopEngine | null>(null);
  const engineGenRef = useRef(0);
  const sourceRef = useRef<string | null>(null);
  const rafRef = useRef<number | null>(null);
  const alphasRef = useRef<MaskLayerAlpha[]>([]);
  const onRenderedRef = useRef(onRendered);
  const onEngineReadyRef = useRef(onEngineReady);
  const [engineReady, setEngineReady] = useState(false);
  const [sourceReady, setSourceReady] = useState(false);
  const [compareBeforeUrl, setCompareBeforeUrl] = useState<string | null>(null);

  onRenderedRef.current = onRendered;
  onEngineReadyRef.current = onEngineReady;

  useEffect(() => {
    if (!compareBefore) setCompareBeforeUrl(null);
  }, [compareBefore]);

  useEffect(() => {
    if (!engineReady) return;
    onCanvasReadyRef.current?.(canvasRef.current);
    return () => onCanvasReadyRef.current?.(null);
  }, [engineReady]);

  const resolvedSourceId = sourceKey ?? sourceDataUrl ?? null;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new EngineClass();
    engine.init(canvas);
    engineRef.current = engine;
    const gen = ++engineGenRef.current;
    setEngineReady(true);
    onEngineReadyRef.current?.(engine);

    return () => {
      engineGenRef.current = gen + 1;
      engine.dispose();
      engineRef.current = null;
      setEngineReady(false);
      setSourceReady(false);
      sourceRef.current = null;
      onEngineReadyRef.current?.(null);
    };
  }, []);

  useEffect(() => {
    sourceRef.current = null;
    setSourceReady(false);
  }, [resolvedSourceId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const engine = engineRef.current;
    if (!canvas || !engine || !engineReady || !resolvedSourceId) return;

    let cancelled = false;
    const gen = engineGenRef.current;

    void (async () => {
      if (sourceRef.current === resolvedSourceId) {
        await schedulePipelineRender(canvas, engine, document, alphasRef, onRenderedRef, rafRef, gen, engineGenRef, compareBefore, setCompareBeforeUrl);
        return;
      }

      try {
        if (sourceKey && getLinearSource(sourceKey)) {
          if (!engine.isReady) return;
          engine.setSourceFromLinearCache(sourceKey, fullResolution);
        } else if (linearOnly) {
          return;
        } else if (sourceDataUrl) {
          await engine.setSourceFromDataUrl(sourceDataUrl, fullResolution);
        } else {
          return;
        }
      } catch (e) {
        if (cancelled || gen !== engineGenRef.current) return;
        throw e;
      }

      if (cancelled || gen !== engineGenRef.current || engineRef.current !== engine || !engine.isReady) return;

      sourceRef.current = resolvedSourceId;
      setSourceReady(true);
      await schedulePipelineRender(canvas, engine, document, alphasRef, onRenderedRef, rafRef, gen, engineGenRef, compareBefore, setCompareBeforeUrl);
    })();

    return () => {
      cancelled = true;
    };
  }, [resolvedSourceId, sourceKey, sourceDataUrl, linearOnly, fullResolution, engineReady]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const engine = engineRef.current;
    if (!canvas || !engine || !engineReady || !resolvedSourceId || !sourceReady) return;

    const gen = engineGenRef.current;
    void schedulePipelineRender(canvas, engine, document, alphasRef, onRenderedRef, rafRef, gen, engineGenRef, compareBefore, setCompareBeforeUrl);
  }, [document, resolvedSourceId, sourceReady, engineReady, refreshKey, compareBefore]);

  return (
    <div
      className={`lightroom-viewport-wrap ${className}`.trim()}
      onPointerMove={(e) => {
        if (!onPointerNorm) return;
        const rect = e.currentTarget.getBoundingClientRect();
        onPointerNorm({
          x: (e.clientX - rect.left) / Math.max(rect.width, 1),
          y: (e.clientY - rect.top) / Math.max(rect.height, 1),
        });
      }}
      onPointerLeave={() => onPointerNorm?.(null)}
    >
      <canvas ref={canvasRef} className="lightroom-studio__canvas" aria-label="Vista previa de revelado" />
      {compareBefore && compareBeforeUrl ? (
        <div className="lr-compare" style={{ ["--split" as string]: `${compareSplit}%` }}>
          <img src={compareBeforeUrl} alt="" className="lr-compare__before" draggable={false} />
          <div className="lr-compare__divider" aria-hidden />
          <span className="lr-compare__label lr-compare__label--before">Antes</span>
          <span className="lr-compare__label lr-compare__label--after">Después</span>
        </div>
      ) : null}
      {overlay}
    </div>
  );
}

async function schedulePipelineRender(
  canvas: HTMLCanvasElement,
  engine: LightroomDevelopEngine,
  developDoc: LightroomDevelopDocument,
  alphasRef: React.MutableRefObject<MaskLayerAlpha[]>,
  onRenderedRef: React.MutableRefObject<LightroomDevelopViewportProps["onRendered"]>,
  rafRef: React.MutableRefObject<number | null>,
  gen: number,
  engineGenRef: React.MutableRefObject<number>,
  compareBefore: boolean,
  setCompareBeforeUrl: (url: string | null) => void,
) {
  if (gen !== engineGenRef.current || !engine.isReady) return;

  if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
  await new Promise<void>((resolve) => {
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      resolve();
    });
  });

  if (gen !== engineGenRef.current || !engine.isReady) return;

  alphasRef.current = await engine.buildLayerAlphas(developDoc);
  if (gen !== engineGenRef.current || !engine.isReady) return;

  engine.renderPipeline(canvas, developDoc, alphasRef.current);
  onRenderedRef.current?.(engine.toDataUrl(canvas));

  if (compareBefore) {
    const beforeCanvas = globalThis.document.createElement("canvas");
    engine.renderLinearSourcePreview(beforeCanvas);
    setCompareBeforeUrl(engine.toDataUrl(beforeCanvas));
  }
}

export { renderDevelopedDataUrl } from "./lightroom-bake";
