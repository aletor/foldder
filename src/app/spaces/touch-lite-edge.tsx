"use client";

import { BaseEdge, getSmoothStepPath, type EdgeProps } from "@xyflow/react";

/** iPad/touch: edge mínima — sin smart routing, gradientes ni animación de puntos. */
export function TouchLiteEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
}: EdgeProps) {
  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 4,
  });

  return (
    <BaseEdge
      path={edgePath}
      markerEnd={markerEnd}
      style={{
        ...style,
        stroke: "rgba(100, 100, 100, 0.5)",
        strokeWidth: 1.5,
      }}
    />
  );
}
