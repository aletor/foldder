"use client";

import React from "react";
import { Position } from "@xyflow/react";
import { FoldderDataHandle, type FoldderHandleDataType } from "../FoldderDataHandle";
import { NodeIcon } from "../foldder-icons";
import { FoldderNodeHeaderTitle, NodeLabel } from "../foldder-node-ui";

export type StudioCanvasNodeHandleSpec = {
  id: string;
  label: string;
  side: "left" | "right";
  top: string;
  type: "source" | "target";
  dataType: FoldderHandleDataType;
  style?: React.CSSProperties;
  labelStyle?: React.CSSProperties;
};

export type StudioCanvasNodeShellProps = {
  nodeId: string;
  nodeType: string;
  selected?: boolean;
  label?: string;
  defaultLabel: string;
  title: string;
  badge?: React.ReactNode;
  headerIcon?: React.ReactNode;
  headerClassName?: string;
  titleClassName?: string;
  badgeClassName?: string;
  introActive?: boolean;
  width?: number;
  minWidth?: number;
  className?: string;
  baseClassName?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
  handles?: StudioCanvasNodeHandleSpec[];
};

export const StudioCanvasNodeShell = React.forwardRef<HTMLDivElement, StudioCanvasNodeShellProps>(function StudioCanvasNodeShell({
  nodeId,
  nodeType,
  selected,
  label,
  defaultLabel,
  title,
  badge,
  headerIcon,
  headerClassName,
  titleClassName,
  badgeClassName,
  introActive,
  width,
  minWidth,
  className,
  baseClassName = "custom-node tool-node",
  style,
  children,
  handles = [],
}, ref) {
  return (
    <div
      ref={ref}
      className={[baseClassName, className].filter(Boolean).join(" ")}
      style={{
        minWidth,
        width,
        ...style,
      }}
    >
      <NodeLabel id={nodeId} label={label} defaultLabel={defaultLabel} />

      <div className={["node-header", headerClassName].filter(Boolean).join(" ")}>
        {headerIcon ?? <NodeIcon type={nodeType} selected={selected} size={16} />}
        <FoldderNodeHeaderTitle className={titleClassName} introActive={introActive}>{title}</FoldderNodeHeaderTitle>
        {badge ? <div className={["node-badge max-w-[118px] truncate", badgeClassName].filter(Boolean).join(" ")}>{badge}</div> : null}
      </div>

      {children}

      {handles.map((handle) => (
        <StudioCanvasNodeHandle key={`${handle.side}:${handle.type}:${handle.id}`} {...handle} />
      ))}
    </div>
  );
});

export function StudioCanvasNodeHandle({
  id,
  label,
  side,
  top,
  type,
  dataType,
  style,
  labelStyle,
}: StudioCanvasNodeHandleSpec) {
  const position = side === "left" ? Position.Left : Position.Right;
  return (
    <div className={`handle-wrapper handle-${side}`} style={{ top, ...style }}>
      {side === "right" ? <span className="handle-label" style={labelStyle}>{label}</span> : null}
      <FoldderDataHandle type={type} position={position} id={id} dataType={dataType} />
      {side === "left" ? <span className="handle-label" style={labelStyle}>{label}</span> : null}
    </div>
  );
}

export function StudioCanvasOpenButton({
  icon,
  children,
  onClick,
  accent = "cyan",
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
  onClick: () => void;
  accent?: "amber" | "cyan" | "slate";
}) {
  const focusClass =
    accent === "amber"
      ? "focus-visible:ring-amber-400/50"
      : accent === "cyan"
        ? "focus-visible:ring-cyan-400/50"
        : "focus-visible:ring-slate-400/50";
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={`nodrag flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300/80 bg-white/90 px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide text-slate-800 shadow-sm transition hover:bg-white focus:outline-none focus-visible:ring-2 ${focusClass}`}
    >
      {icon}
      {children}
    </button>
  );
}

export function StudioCanvasPill({
  active,
  activeClassName,
  inactiveClassName = "border-slate-300/70 bg-white/70 text-slate-500",
  children,
}: {
  active?: boolean;
  activeClassName: string;
  inactiveClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-[9px] font-semibold ${
        active ? activeClassName : inactiveClassName
      }`}
    >
      {children}
    </span>
  );
}
