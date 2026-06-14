"use client";

import { useStore } from "@xyflow/react";
import { shallow } from "zustand/shallow";
import { useInputMode } from "./input-mode-context";

const GRID_BG_STYLE = {
  position: "absolute",
  width: "100%",
  height: "100%",
  top: 0,
  left: 0,
} as const;

type FoldderCanvasGridBackgroundProps = {
  gap: number;
  lineWidth?: number;
  color?: string;
  dotSize?: number;
};

export function FoldderCanvasGridBackground({
  gap,
  lineWidth = 0.7,
  color = "#111",
  dotSize = 5,
}: FoldderCanvasGridBackgroundProps) {
  const { isTouchUI } = useInputMode();
  const { transform, patternId } = useStore(
    (state) => ({
      transform: state.transform,
      patternId: `foldder-grid-${state.rfId}`,
    }),
    shallow,
  );

  if (isTouchUI) return null;

  const zoom = transform[2] || 1;
  const scaledGap = gap * zoom || 1;
  const scaledLineWidth = lineWidth * zoom;
  const dotRadius = (dotSize / 2) * zoom;
  const patternX = transform[0] % scaledGap;
  const patternY = transform[1] % scaledGap;

  return (
    <svg
      className="react-flow__background foldder-canvas-grid-background"
      style={GRID_BG_STYLE}
      aria-hidden
      data-testid="rf__background"
    >
      <defs>
        <pattern
          id={patternId}
          x={patternX}
          y={patternY}
          width={scaledGap}
          height={scaledGap}
          patternUnits="userSpaceOnUse"
        >
          <line
            x1={0}
            y1={0}
            x2={0}
            y2={scaledGap}
            stroke={color}
            strokeWidth={scaledLineWidth}
            className="foldder-canvas-grid-lines"
          />
          <line
            x1={0}
            y1={0}
            x2={scaledGap}
            y2={0}
            stroke={color}
            strokeWidth={scaledLineWidth}
            className="foldder-canvas-grid-lines"
          />
          {!isTouchUI ? (
            <circle
              cx={0}
              cy={0}
              r={dotRadius}
              fill={color}
              className="foldder-canvas-grid-dots"
            />
          ) : null}
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${patternId})`} />
    </svg>
  );
}
