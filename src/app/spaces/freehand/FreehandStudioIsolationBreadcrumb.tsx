"use client";

import React from "react";

export type IsolationBreadcrumbFrame = {
  kind: "boolean" | "vectorGroup" | "group" | "clipping";
  groupId?: string;
  containerId?: string;
  editMode?: "mask" | "content";
  parentObjects: Array<{ id: string; name?: string }>;
};

export type FreehandStudioIsolationBreadcrumbProps = {
  frames: readonly IsolationBreadcrumbFrame[];
  onExitToLevel: (level: number) => void;
};

export function FreehandStudioIsolationBreadcrumb({ frames, onExitToLevel }: FreehandStudioIsolationBreadcrumbProps) {
  return (
    <div className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-violet-900/40 border-b border-violet-500/30 text-[10px] font-bold uppercase tracking-wider">
      <button type="button" onClick={() => onExitToLevel(0)}
        className="text-violet-300 hover:text-white transition-colors">Scene</button>
      {frames.map((frame, i) => {
        const id = frame.kind === "clipping" ? frame.containerId : frame.groupId;
        const label = frame.kind === "clipping"
          ? (frame.parentObjects.find((o) => o.id === frame.containerId)?.name ?? "Clip container")
          : frame.kind === "vectorGroup"
            ? "Vector group"
            : frame.kind === "group"
              ? (frame.parentObjects.find((o) => o.id === frame.groupId)?.name ?? "Carpeta")
              : (frame.parentObjects.find((o) => o.id === frame.groupId)?.name ?? "Boolean Group");
        const sub = frame.kind === "clipping" && frame.editMode === "mask" ? " · mask" : "";
        return (
          <React.Fragment key={id}>
            <span className="text-violet-500/60">/</span>
            <button type="button"
              onClick={() => onExitToLevel(i)}
              className={`${i === frames.length - 1 ? "text-white" : "text-violet-300 hover:text-white"} transition-colors`}>
              {label}{sub}
            </button>
          </React.Fragment>
        );
      })}
      <span className="text-violet-500/40 ml-2 normal-case tracking-normal font-normal italic">Esc to exit · editing limited to this scope</span>
    </div>
  );
}
