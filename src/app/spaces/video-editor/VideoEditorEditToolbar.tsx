"use client";

import React from "react";
import { Link2, Link2Off, Magnet, Minus, Plus, Repeat, Scissors, Slice, ZoomIn } from "lucide-react";

import type { VideoEditorEditTool } from "./video-editor-edit-types";

const ACCENT = "#3a8f96";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function ToolButton({
  active,
  disabled,
  title,
  shortcut,
  onClick,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  title: string;
  shortcut?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={shortcut ? `${title} (${shortcut})` : title}
      className={cx(
        "inline-flex items-center gap-1 px-2 py-1 text-[10px] font-black uppercase tracking-[0.06em] transition disabled:cursor-not-allowed disabled:opacity-30",
        active ? "bg-[#3a8f96]/25 text-white" : "text-white/55 hover:bg-white/[0.06] hover:text-white/85",
      )}
    >
      {children}
    </button>
  );
}

function ToggleButton({
  active,
  title,
  onClick,
  children,
}: {
  active: boolean;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cx(
        "inline-flex items-center gap-1 px-2 py-1 text-[10px] font-black uppercase tracking-[0.06em] transition",
        active ? "bg-[#3a8f96]/25 text-white" : "text-white/55 hover:bg-white/[0.06] hover:text-white/85",
      )}
      style={active ? { boxShadow: `inset 0 0 0 1px ${ACCENT}55` } : undefined}
    >
      {children}
    </button>
  );
}

export function VideoEditorEditToolbar({
  editTool,
  onEditToolChange,
  snapEnabled,
  onSnapEnabledChange,
  linkedAvEnabled,
  onLinkedAvEnabledChange,
  inPoint,
  outPoint,
  onSetInPoint,
  onSetOutPoint,
  loopEnabled,
  onLoopEnabledChange,
  timelineZoom,
  onZoomIn,
  onZoomOut,
  onZoomFit,
  onSplit,
  canSplit,
}: {
  editTool: VideoEditorEditTool;
  onEditToolChange: (tool: VideoEditorEditTool) => void;
  snapEnabled: boolean;
  onSnapEnabledChange: (enabled: boolean) => void;
  linkedAvEnabled: boolean;
  onLinkedAvEnabledChange: (enabled: boolean) => void;
  inPoint?: number;
  outPoint?: number;
  onSetInPoint: () => void;
  onSetOutPoint: () => void;
  loopEnabled: boolean;
  onLoopEnabledChange: (enabled: boolean) => void;
  timelineZoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomFit: () => void;
  onSplit: () => void;
  canSplit: boolean;
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-0.5 border-b border-white/10 bg-[#1a1f28]/80 px-1 py-0.5">
      <ToolButton active={editTool === "select"} title="Seleccionar" shortcut="V" onClick={() => onEditToolChange("select")}>
        <ZoomIn size={12} />
        Select
      </ToolButton>
      <ToolButton active={editTool === "blade"} title="Cuchilla" shortcut="B" onClick={() => onEditToolChange("blade")}>
        <Slice size={12} />
        Blade
      </ToolButton>
      <ToolButton active={editTool === "trim"} title="Trim" shortcut="T" onClick={() => onEditToolChange("trim")}>
        <Scissors size={12} />
        Trim
      </ToolButton>
      {editTool === "blade" ? (
        <ToolButton disabled={!canSplit} title="Cortar en playhead" shortcut="X" onClick={onSplit}>
          <Scissors size={12} />
          Split
        </ToolButton>
      ) : null}
      <span className="mx-0.5 h-4 w-px bg-white/12" />
      <ToggleButton active={snapEnabled} title="Snap (magnetismo)" onClick={() => onSnapEnabledChange(!snapEnabled)}>
        <Magnet size={12} />
        Snap
      </ToggleButton>
      <ToggleButton active={linkedAvEnabled} title="Vínculo A/V" onClick={() => onLinkedAvEnabledChange(!linkedAvEnabled)}>
        {linkedAvEnabled ? <Link2 size={12} /> : <Link2Off size={12} />}
        Link
      </ToggleButton>
      <span className="mx-0.5 h-4 w-px bg-white/12" />
      <ToolButton active={inPoint !== undefined} title="Marcar In" shortcut="I" onClick={onSetInPoint}>
        In{inPoint !== undefined ? ` ${inPoint.toFixed(1)}` : ""}
      </ToolButton>
      <ToolButton active={outPoint !== undefined} title="Marcar Out" shortcut="O" onClick={onSetOutPoint}>
        Out{outPoint !== undefined ? ` ${outPoint.toFixed(1)}` : ""}
      </ToolButton>
      <ToggleButton active={loopEnabled} title="Loop In/Out" onClick={() => onLoopEnabledChange(!loopEnabled)}>
        <Repeat size={12} />
        Loop
      </ToggleButton>
      <span className="mx-0.5 h-4 w-px bg-white/12" />
      <ToolButton title="Alejar" onClick={onZoomOut}>
        <Minus size={12} />
      </ToolButton>
      <button
        type="button"
        onClick={onZoomFit}
        title="Ajustar zoom"
        className="px-1.5 py-1 text-[10px] font-semibold tabular-nums text-white/45 hover:text-white/70"
      >
        {timelineZoom.toFixed(0)}px/s
      </button>
      <ToolButton title="Acercar" onClick={onZoomIn}>
        <Plus size={12} />
      </ToolButton>
    </div>
  );
}
