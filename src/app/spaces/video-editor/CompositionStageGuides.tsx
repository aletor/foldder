"use client";

import React from "react";

/** Regla de tercios + safe areas (action 90%, title 80%). */
export function CompositionStageGuides() {
  const thirds = [1 / 3, 2 / 3];
  const actionInset = 0.05;
  const titleInset = 0.1;

  return (
    <div className="pointer-events-none absolute inset-0 z-[8]">
      <svg className="h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        {thirds.map((pos) => (
          <g key={`t-${pos}`}>
            <line x1={pos * 100} y1={0} x2={pos * 100} y2={100} stroke="rgba(255,255,255,0.22)" strokeWidth={0.15} strokeDasharray="1.2 1.2" />
            <line x1={0} y1={pos * 100} x2={100} y2={pos * 100} stroke="rgba(255,255,255,0.22)" strokeWidth={0.15} strokeDasharray="1.2 1.2" />
          </g>
        ))}
        <rect
          x={actionInset * 100}
          y={actionInset * 100}
          width={(1 - actionInset * 2) * 100}
          height={(1 - actionInset * 2) * 100}
          fill="none"
          stroke="rgba(58,143,150,0.55)"
          strokeWidth={0.2}
        />
        <rect
          x={titleInset * 100}
          y={titleInset * 100}
          width={(1 - titleInset * 2) * 100}
          height={(1 - titleInset * 2) * 100}
          fill="none"
          stroke="rgba(58,143,150,0.35)"
          strokeWidth={0.15}
          strokeDasharray="0.8 0.8"
        />
      </svg>
    </div>
  );
}
