"use client";

import { useEffect, useRef } from "react";
import { runBrainLightning } from "./brain-lightning-canvas";

const LIGHTNING_MS = 2400;

type BrainLightningOverlayProps = {
  stageRef: React.RefObject<HTMLDivElement | null>;
  activeCapsule: string | null;
  enabled: boolean;
};

function getBoltPoints(stage: HTMLDivElement, activeCapsule: string) {
  const stageRect = stage.getBoundingClientRect();
  const figure = stage.querySelector<HTMLElement>("[data-home-v2-brain-figure-wrap]");
  const capsule = stage.querySelector<HTMLElement>(
    `[data-home-v2-brain-capsule-wrap][data-capsule="${activeCapsule}"] [data-home-v2-brain-capsule]`,
  );

  if (!figure || !capsule || stageRect.width === 0 || stageRect.height === 0) {
    return null;
  }

  const figureRect = figure.getBoundingClientRect();
  const capsuleRect = capsule.getBoundingClientRect();

  return {
    start: {
      x: figureRect.left + figureRect.width / 2 - stageRect.left,
      y: figureRect.top + figureRect.height / 2 - stageRect.top,
    },
    end: {
      x: capsuleRect.left + capsuleRect.width / 2 - stageRect.left,
      y: capsuleRect.top + capsuleRect.height / 2 - stageRect.top,
    },
  };
}

export function BrainLightningOverlay({ stageRef, activeCapsule, enabled }: BrainLightningOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!enabled || !activeCapsule) return;

    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!stage || !canvas) return;

    let stopAnimation: (() => void) | undefined;
    let frameId = 0;

    const startBolt = () => {
      const points = getBoltPoints(stage, activeCapsule);
      if (!points) return;

      stopAnimation?.();
      stopAnimation = runBrainLightning(canvas, points.start, points.end, LIGHTNING_MS);
    };

    frameId = requestAnimationFrame(startBolt);

    return () => {
      cancelAnimationFrame(frameId);
      stopAnimation?.();
    };
  }, [activeCapsule, enabled, stageRef]);

  if (!enabled) return null;

  return <canvas ref={canvasRef} data-home-v2-brain-lightning aria-hidden />;
}
