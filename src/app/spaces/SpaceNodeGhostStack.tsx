"use client";

import React from "react";

/** Capas decorativas del Nested Space (baraja de colores detrás del portal). */
export function SpaceNodeGhostStack() {
  return (
    <div className="space-node-ghost-stack" aria-hidden>
      <div className="space-node-ghost-stack__layer space-node-ghost-stack__layer--3" />
      <div className="space-node-ghost-stack__layer space-node-ghost-stack__layer--2" />
      <div className="space-node-ghost-stack__layer space-node-ghost-stack__layer--1" />
    </div>
  );
}
