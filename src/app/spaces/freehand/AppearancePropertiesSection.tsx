"use client";

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeftRight,
  ChevronDown,
  Link2,
  Unlink2,
} from "lucide-react";
import { ScrubNumberInput } from "../ScrubNumberInput";
import { ColorDropTarget } from "./ColorDropTarget";
import {
  type FillAppearance,
  migrateFill,
  solidFill,
  defaultLinearGradient,
  defaultRadialGradient,
  linearGradientFromAngle,
  angleFromLinearGradient,
  reverseGradientStops,
  addMidStop,
} from "./fill";
import {
  areCornersLinkedEquivalent,
  normalizeCornerRadius,
  type RectangleCornerRadius,
} from "./rectangle-corners";

/** Subconjunto mínimo del objeto seleccionado para el panel Appearance. */
export type AppearanceObject = {
  type: string;
  fill: unknown;
  stroke: string;
  strokeWidth: number;
  strokeLinecap: "butt" | "round" | "square";
  strokeLinejoin: "miter" | "round" | "bevel";
  strokeDasharray: string;
  strokeAlignment?: "center" | "inside" | "outside";
  opacity: number;
  width: number;
  height: number;
  cornerRadius?: Partial<RectangleCornerRadius>;
  rx?: number;
  cornersLinked?: boolean;
};
import { PALETTE_SWATCH_BTN_CLASS } from "./FreehandColorPalette";
import { setColorDragData } from "./color-drag";

type StrokeMarkerKind = "none" | "arrow" | "dot";

type PopoverKind = "fill" | "stroke" | null;

function clamp(n: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, n));
}

function parseStrokeDashSix(raw: string | undefined): string[] {
  const parts = (raw ?? "").trim().split(/[\s,]+/).filter(Boolean);
  const out = ["", "", "", "", "", ""];
  for (let i = 0; i < 6; i++) out[i] = parts[i] ?? "";
  return out;
}

function joinStrokeDashSix(parts: string[]): string {
  return parts.map((p) => p.trim()).join(" ").trim();
}

function fillSwatchStyle(fill: FillAppearance): React.CSSProperties {
  const mf = migrateFill(fill);
  if (mf.type === "solid") {
    if (mf.color === "none") {
      return {
        backgroundColor: "#2a2d33",
        backgroundImage:
          "linear-gradient(135deg, transparent 46%, rgb(239 68 68) 46%, rgb(239 68 68) 54%, transparent 54%)",
      };
    }
    return { backgroundColor: mf.color };
  }
  if (mf.type === "gradient-linear") {
    return {
      background: `linear-gradient(90deg, ${mf.stops
        .map((s) => `${s.color} ${s.position}%`)
        .join(", ")})`,
    };
  }
  return {
    background: `radial-gradient(circle, ${mf.stops.map((s) => `${s.color} ${s.position}%`).join(", ")})`,
  };
}

function strokeSwatchStyle(stroke: string): React.CSSProperties {
  if (stroke === "none") {
    return {
      backgroundColor: "#2a2d33",
      backgroundImage:
        "linear-gradient(135deg, transparent 46%, rgb(239 68 68) 46%, rgb(239 68 68) 54%, transparent 54%)",
    };
  }
  return { backgroundColor: stroke };
}

const PANEL_INP =
  "h-7 min-h-0 w-full rounded-[4px] border border-white/[0.1] bg-[#1e2024] px-1.5 text-[11px] text-zinc-100 outline-none focus:border-violet-400/45";
const PANEL_SEL = `${PANEL_INP} cursor-pointer py-0`;
const MINI_BTN =
  "flex h-7 w-7 shrink-0 items-center justify-center rounded-[4px] border border-white/[0.1] bg-[#1e2024] text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-100";
const MINI_BTN_ON = `${MINI_BTN} border-violet-400/50 bg-violet-500/25 text-violet-100`;

function NoneSwatchIcon() {
  return (
    <svg width="100%" height="100%" viewBox="0 0 20 20" className="text-red-500" aria-hidden>
      <line x1="3" y1="17" x2="17" y2="3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
    </svg>
  );
}

function FillTypeIcon({ kind }: { kind: "none" | "solid" | "linear" | "radial" }) {
  if (kind === "none") {
    return (
      <span className="relative block h-full w-full bg-[#2a2d33]">
        <NoneSwatchIcon />
      </span>
    );
  }
  if (kind === "solid") {
    return <span className="block h-full w-full bg-[linear-gradient(135deg,#666_25%,#bbb_25%,#bbb_50%,#666_50%,#666_75%,#bbb_75%)] bg-[length:6px_6px]" />;
  }
  if (kind === "linear") {
    return <span className="block h-full w-full bg-gradient-to-r from-zinc-900 to-zinc-100" />;
  }
  return (
    <span className="block h-full w-full rounded-full bg-[radial-gradient(circle,#f4f4f5_0%,#18181b_72%)] ring-1 ring-inset ring-white/10" />
  );
}

export type AppearancePropertiesSectionProps = {
  object: AppearanceObject;
  showFill: boolean;
  recentColors: string[];
  scrubHint: string;
  pathCornerRadiusLinked: boolean;
  onPathCornerRadiusLinkedChange: (v: boolean) => void;
  onFillChange: (updater: (f: FillAppearance) => FillAppearance) => void;
  onFillChangeSilent: (updater: (f: FillAppearance) => FillAppearance) => void;
  onPropChange: (key: string, value: unknown) => void;
  onPropChangeSilent: (key: string, value: unknown) => void;
  onStrokeColor: (hex: string) => void;
  onRectCornerRadius: (
    patch: number | Partial<RectangleCornerRadius>,
    opts?: { corner?: keyof RectangleCornerRadius; linked?: boolean; silent?: boolean },
  ) => void;
  onPathCornerRadius: (radius: number, opts?: { silent?: boolean }) => void;
  onCommitScrub: () => void;
  onFillColorUi?: (hex: string) => void;
  onTextFill?: (hex: string) => void;
  onTextFillInline?: (hex: string) => boolean;
  pathCornerStats: { count: number; maxRadius: number; value: number };
  renderDatasetLink?: (prop: string) => React.ReactNode;
};

function CompactPopover({
  anchorRef,
  open,
  onClose,
  children,
  width = 248,
}: {
  anchorRef: React.RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  width?: number;
}) {
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;
    const r = anchorRef.current.getBoundingClientRect();
    const pad = 8;
    let left = r.left;
    const maxLeft = window.innerWidth - width - pad;
    if (left > maxLeft) left = Math.max(pad, maxLeft);
    setPos({ top: r.bottom + 4, left });
  }, [open, anchorRef, width]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (anchorRef.current?.contains(t)) return;
      if ((t as Element).closest?.("[data-fh-appearance-popover]")) return;
      onClose();
    };
    document.addEventListener("mousedown", onDoc, true);
    return () => document.removeEventListener("mousedown", onDoc, true);
  }, [open, onClose, anchorRef]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      data-fh-appearance-popover
      className="fixed z-[100040] overflow-hidden rounded-[6px] border border-white/[0.12] bg-[#151820] shadow-[0_16px_48px_rgba(0,0,0,0.55)]"
      style={{ top: pos.top, left: pos.left, width }}
      role="dialog"
      aria-modal="true"
    >
      {children}
    </div>,
    document.body,
  );
}

export function AppearancePropertiesSection({
  object: o,
  showFill,
  recentColors,
  scrubHint,
  pathCornerRadiusLinked,
  onPathCornerRadiusLinkedChange,
  onFillChange,
  onFillChangeSilent,
  onPropChange,
  onPropChangeSilent,
  onStrokeColor,
  onRectCornerRadius,
  onPathCornerRadius,
  onCommitScrub,
  onFillColorUi,
  onTextFill,
  onTextFillInline,
  pathCornerStats,
  renderDatasetLink,
}: AppearancePropertiesSectionProps) {
  const [expanded, setExpanded] = useState(true);
  const [popover, setPopover] = useState<PopoverKind>(null);
  const fillAnchorRef = useRef<HTMLButtonElement>(null);
  const strokeAnchorRef = useRef<HTMLButtonElement>(null);

  const strokeWidthOptions = React.useMemo(() => {
    const base = [0, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 32, 40, 50];
    if (!base.some((v) => Math.abs(v - o.strokeWidth) < 1e-6)) base.push(o.strokeWidth);
    return base.sort((a, b) => a - b);
  }, [o.strokeWidth]);
  const mf = migrateFill(o.fill);
  const noFill = mf.type === "solid" && mf.color === "none";
  const noStroke = o.stroke === "none";
  const dashStr = o.strokeDasharray ?? "";
  const hasDash = !!dashStr.trim();
  const alignStroke = o.strokeAlignment ?? "center";
  const pathSel = o.type === "path" ? o : null;

  const applySolidFill = useCallback(
    (hex: string) => {
      if (o.type === "textOnPath") {
        onTextFill?.(hex);
        return;
      }
      if (!onTextFillInline?.(hex)) {
        onFillChange(() => solidFill(hex));
      }
      onFillColorUi?.(hex);
    },
    [o.type, onFillChange, onFillColorUi, onTextFill, onTextFillInline],
  );

  const fillMode: "none" | "solid" | "linear" | "radial" =
    mf.type === "gradient-linear"
      ? "linear"
      : mf.type === "gradient-radial"
        ? "radial"
        : noFill
          ? "none"
          : "solid";

  const textOnPathFill =
    o.type === "textOnPath"
      ? (() => {
          const fill = (o as { fill: string }).fill;
          const none = fill === "none" || fill === "transparent";
          const hex = /^#[0-9A-Fa-f]{6}$/.test(fill) ? fill : "#000000";
          return { none, hex };
        })()
      : null;

  const rectCorner =
    o.type === "rect"
      ? (() => {
          const corners = normalizeCornerRadius(o.cornerRadius ?? o.rx ?? 0, o.width, o.height);
          const linked = o.cornersLinked ?? areCornersLinkedEquivalent(corners);
          const maxR = Math.round((Math.min(o.width, o.height) / 2) * 100) / 100;
          return { corners, linked, maxR };
        })()
      : null;

  const cornerInp =
    "h-7 min-h-0 w-full cursor-ew-resize rounded-[4px] border border-white/[0.1] bg-[#1e2024] px-1 text-center font-mono text-[10px] text-zinc-100 outline-none focus:border-violet-400/45 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

  return (
    <div className="border-b border-white/[0.08] px-[10px] py-2">
      <button
        type="button"
        className="mb-1.5 flex w-full items-center gap-1 text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <ChevronDown
          size={12}
          className={`shrink-0 text-zinc-500 transition-transform ${expanded ? "" : "-rotate-90"}`}
        />
        <span className="text-[11px] font-semibold text-zinc-200">Appearance</span>
      </button>

      {expanded ? (
        <div className="space-y-1.5">
          {showFill ? (
            <div className="grid grid-cols-[52px_minmax(0,1fr)] items-center gap-2">
              <div className="flex items-center gap-0.5">
                <span className="text-[10px] text-zinc-500">Fill</span>
                {renderDatasetLink?.("fill")}
              </div>
              <ColorDropTarget className="min-w-0" onApplyHex={applySolidFill}>
                <button
                  ref={fillAnchorRef}
                  type="button"
                  title="Editar relleno"
                  aria-expanded={popover === "fill"}
                  onClick={() => setPopover((p) => (p === "fill" ? null : "fill"))}
                  className={`h-7 w-full min-w-0 rounded-[4px] border transition ${
                    popover === "fill"
                      ? "border-violet-400 ring-1 ring-violet-400/35"
                      : "border-white/[0.12] hover:border-white/25"
                  }`}
                  style={
                    o.type === "textOnPath" && textOnPathFill
                      ? strokeSwatchStyle(textOnPathFill.none ? "none" : textOnPathFill.hex)
                      : fillSwatchStyle(migrateFill(o.fill))
                  }
                />
              </ColorDropTarget>
            </div>
          ) : null}

          <div className="space-y-1">
            <div className="grid grid-cols-[52px_minmax(0,1fr)] items-center gap-2">
              <div className="flex items-center gap-0.5">
                <span className="text-[10px] text-zinc-500">Stroke</span>
                {renderDatasetLink?.("stroke")}
              </div>
              <ColorDropTarget className="min-w-0" onApplyHex={onStrokeColor}>
                <button
                  ref={strokeAnchorRef}
                  type="button"
                  title="Editar trazo"
                  aria-expanded={popover === "stroke"}
                  onClick={() => setPopover((p) => (p === "stroke" ? null : "stroke"))}
                  className={`h-7 w-full min-w-0 rounded-[4px] border transition ${
                    popover === "stroke"
                      ? "border-violet-400 ring-1 ring-violet-400/35"
                      : "border-white/[0.12] hover:border-white/25"
                  }`}
                  style={strokeSwatchStyle(o.stroke)}
                />
              </ColorDropTarget>
            </div>

            {!noStroke ? (
              <div className="grid grid-cols-[52px_1fr_1fr] items-center gap-1.5 pl-0">
                <span />
                <select
                  value={String(o.strokeWidth)}
                  onChange={(e) => onPropChange("strokeWidth", clamp(Number(e.target.value), 0, 50))}
                  className={PANEL_SEL}
                  title="Grosor"
                >
                  {strokeWidthOptions.map((v) => (
                      <option key={v} value={v}>
                        {v % 1 === 0 ? `${v} px` : `${v} px`}
                      </option>
                    ))}
                </select>
                <select
                  value={hasDash ? (dashStr.includes("2") && dashStr.includes("2") && !dashStr.includes("8") ? "dotted" : "dashed") : "solid"}
                  onChange={(e) => {
                    const v = e.target.value;
                    const next = v === "solid" ? "" : v === "dotted" ? "2 2" : "8 4";
                    onPropChange("strokeDasharray", next);
                    if (v === "solid") onPropChange("strokeDashoffset", 0);
                  }}
                  className={PANEL_SEL}
                  title="Estilo de línea"
                >
                  <option value="solid">Continua</option>
                  <option value="dashed">Discontinua</option>
                  <option value="dotted">Punteada</option>
                </select>
              </div>
            ) : null}

            {!noStroke ? (
              <div className="grid grid-cols-[52px_1fr_1fr_1fr] items-center gap-1 pl-0">
                <span />
                <select
                  value={alignStroke}
                  onChange={(e) => onPropChange("strokeAlignment", e.target.value)}
                  className={PANEL_SEL}
                  title="Alinear trazo"
                >
                  <option value="center">Centro</option>
                  <option value="inside">Interior</option>
                  <option value="outside">Exterior</option>
                </select>
                <select
                  value={o.strokeLinecap}
                  onChange={(e) => onPropChange("strokeLinecap", e.target.value)}
                  className={PANEL_SEL}
                  title="Extremo"
                >
                  <option value="butt">Tope</option>
                  <option value="round">Redondo</option>
                  <option value="square">Cuadrado</option>
                </select>
                <select
                  value={o.strokeLinejoin}
                  onChange={(e) => onPropChange("strokeLinejoin", e.target.value)}
                  className={PANEL_SEL}
                  title="Inglete"
                >
                  <option value="miter">Inglete</option>
                  <option value="round">Redondo</option>
                  <option value="bevel">Bisel</option>
                </select>
              </div>
            ) : null}
          </div>

          {rectCorner ? (
            <div className="grid grid-cols-[28px_1fr_1fr] gap-1 pt-0.5">
              <button
                type="button"
                title={rectCorner.linked ? "Desenlazar esquinas" : "Enlazar esquinas"}
                onClick={() => {
                  if (rectCorner.linked) {
                    onRectCornerRadius(rectCorner.corners, { linked: false });
                    return;
                  }
                  onRectCornerRadius(rectCorner.corners.topLeft, { linked: true });
                }}
                className={rectCorner.linked ? MINI_BTN_ON : MINI_BTN}
              >
                {rectCorner.linked ? <Link2 size={13} /> : <Unlink2 size={13} />}
              </button>
              {rectCorner.linked ? (
                <div className="col-span-2">
                  <ScrubNumberInput
                    value={Math.round(rectCorner.corners.topLeft * 100) / 100}
                    onKeyboardCommit={(n) => onRectCornerRadius(clamp(n, 0, rectCorner.maxR), { linked: true })}
                    onScrubLive={(n) =>
                      onRectCornerRadius(clamp(n, 0, rectCorner.maxR), { linked: true, silent: true })
                    }
                    onScrubEnd={onCommitScrub}
                    step={1}
                    roundFn={(n) => Math.round(clamp(n, 0, rectCorner.maxR) * 100) / 100}
                    min={0}
                    max={rectCorner.maxR}
                    title={scrubHint}
                    className={cornerInp}
                  />
                </div>
              ) : (
                (["topLeft", "topRight", "bottomLeft", "bottomRight"] as const).map((key) => (
                  <ScrubNumberInput
                    key={key}
                    value={Math.round(rectCorner.corners[key] * 100) / 100}
                    onKeyboardCommit={(n) =>
                      onRectCornerRadius({ [key]: clamp(n, 0, rectCorner.maxR) }, { corner: key, linked: false })
                    }
                    onScrubLive={(n) =>
                      onRectCornerRadius({ [key]: clamp(n, 0, rectCorner.maxR) }, {
                        corner: key,
                        linked: false,
                        silent: true,
                      })
                    }
                    onScrubEnd={onCommitScrub}
                    step={1}
                    roundFn={(n) => Math.round(clamp(n, 0, rectCorner.maxR) * 100) / 100}
                    min={0}
                    max={rectCorner.maxR}
                    title={scrubHint}
                    className={cornerInp}
                  />
                ))
              )}
            </div>
          ) : null}

          {o.type === "path" ? (
            <div className="grid grid-cols-[28px_1fr] gap-1 pt-0.5">
              <button
                type="button"
                title={pathCornerRadiusLinked ? "Desenlazar esquinas" : "Enlazar esquinas"}
                onClick={() => onPathCornerRadiusLinkedChange(!pathCornerRadiusLinked)}
                className={pathCornerRadiusLinked ? MINI_BTN_ON : MINI_BTN}
              >
                {pathCornerRadiusLinked ? <Link2 size={13} /> : <Unlink2 size={13} />}
              </button>
              {pathCornerRadiusLinked ? (
                <ScrubNumberInput
                  value={Math.round(pathCornerStats.value * 100) / 100}
                  onKeyboardCommit={(n) => onPathCornerRadius(clamp(n, 0, pathCornerStats.maxRadius))}
                  onScrubLive={(n) =>
                    onPathCornerRadius(clamp(n, 0, pathCornerStats.maxRadius), { silent: true })
                  }
                  onScrubEnd={onCommitScrub}
                  step={1}
                  roundFn={(n) => Math.round(clamp(n, 0, pathCornerStats.maxRadius) * 100) / 100}
                  min={0}
                  max={pathCornerStats.maxRadius}
                  disabled={pathCornerStats.count === 0}
                  title={
                    pathCornerStats.count > 0 ? scrubHint : "Sin esquinas rectas en este trazado"
                  }
                  className={cornerInp}
                />
              ) : (
                <p className="self-center text-[9px] leading-snug text-zinc-500">
                  Esquinas en el lienzo (Alt = una sola)
                </p>
              )}
            </div>
          ) : null}

          <CompactPopover
            anchorRef={fillAnchorRef}
            open={popover === "fill" && showFill}
            onClose={() => setPopover(null)}
          >
            <div className="p-2 space-y-2 max-h-[min(420px,70vh)] overflow-y-auto">
              <div className="flex items-center gap-1">
                {(
                  [
                    { id: "none" as const, title: "Sin relleno" },
                    { id: "solid" as const, title: "Color sólido" },
                    { id: "linear" as const, title: "Degradado lineal" },
                    { id: "radial" as const, title: "Degradado radial" },
                  ] as const
                ).map(({ id, title }) => (
                  <button
                    key={id}
                    type="button"
                    title={title}
                    onClick={() => {
                      if (o.type === "textOnPath") {
                        if (id === "none") onTextFill?.("none");
                        else if (id === "solid") onTextFill?.(textOnPathFill?.hex ?? "#000000");
                        return;
                      }
                      if (id === "none") onFillChange(() => solidFill("none"));
                      else if (id === "solid") {
                        const c =
                          mf.type === "solid" && mf.color !== "none" ? mf.color : "#6366f1";
                        onFillChange(() => solidFill(c));
                        onFillColorUi?.(c);
                      } else if (id === "linear") onFillChange(() => defaultLinearGradient());
                      else onFillChange(() => defaultRadialGradient());
                    }}
                    className={`h-7 w-7 overflow-hidden rounded-[4px] border p-0.5 ${
                      fillMode === id ? "border-violet-400 ring-1 ring-violet-400/40" : "border-white/15"
                    }`}
                  >
                    <FillTypeIcon kind={id} />
                  </button>
                ))}
                {o.type !== "textOnPath" ? (
                  <label
                    className="ml-auto flex h-7 w-7 cursor-pointer overflow-hidden rounded-[4px] border border-white/15"
                    title="Selector de color del sistema"
                  >
                    <span className="block h-full w-full bg-[conic-gradient(red,yellow,lime,cyan,blue,magenta,red)]" />
                    <input
                      type="color"
                      className="sr-only"
                      value={
                        mf.type === "solid" && mf.color !== "none" ? mf.color : "#6366f1"
                      }
                      onChange={(e) => applySolidFill(e.target.value)}
                    />
                  </label>
                ) : null}
              </div>

              {recentColors.length > 0 ? (
                <div>
                  <div className="mb-1 text-[9px] font-medium uppercase tracking-wider text-zinc-500">
                    Recientes
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {recentColors.slice(0, 18).map((hex) => (
                      <button
                        key={hex}
                        type="button"
                        title={hex}
                        draggable
                        onDragStart={(e) => setColorDragData(e, hex)}
                        onClick={() => applySolidFill(hex)}
                        className={PALETTE_SWATCH_BTN_CLASS}
                        style={{ backgroundColor: hex }}
                      />
                    ))}
                  </div>
                </div>
              ) : null}

              {o.type !== "textOnPath" && mf.type === "solid" && !noFill ? (
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    defaultValue={mf.color}
                    spellCheck={false}
                    onBlur={(e) => {
                      const v = e.currentTarget.value.trim();
                      if (/^#[0-9A-Fa-f]{6}$/.test(v)) applySolidFill(v);
                      else e.currentTarget.value = mf.color;
                    }}
                    className={`min-w-0 flex-1 ${PANEL_INP}`}
                  />
                  <ScrubNumberInput
                    value={Math.round(o.opacity * 100)}
                    onKeyboardCommit={(n) => onPropChange("opacity", clamp(Math.round(n), 0, 100) / 100)}
                    onScrubLive={(n) =>
                      onPropChangeSilent("opacity", clamp(Math.round(n), 0, 100) / 100)
                    }
                    onScrubEnd={onCommitScrub}
                    step={1}
                    roundFn={(n) => clamp(Math.round(n), 0, 100)}
                    min={0}
                    max={100}
                    title={`Opacidad % · ${scrubHint}`}
                    className="w-11 text-center"
                  />
                  <span className="text-[10px] text-zinc-500">%</span>
                </div>
              ) : null}

              {o.type !== "textOnPath" && mf.type === "gradient-linear" ? (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[9px] uppercase text-zinc-500">Ángulo</span>
                    <ScrubNumberInput
                      value={Math.round(angleFromLinearGradient(mf))}
                      onKeyboardCommit={(deg) => {
                        const xy = linearGradientFromAngle(Number(deg) || 0);
                        onFillChange((f) =>
                          f.type === "gradient-linear" ? { ...f, ...xy, stops: f.stops.map((s) => ({ ...s })) } : f,
                        );
                      }}
                      onScrubLive={(deg) => {
                        const xy = linearGradientFromAngle(Number(deg) || 0);
                        onFillChangeSilent((f) =>
                          f.type === "gradient-linear" ? { ...f, ...xy, stops: f.stops.map((s) => ({ ...s })) } : f,
                        );
                      }}
                      onScrubEnd={onCommitScrub}
                      step={1}
                      className="w-14"
                    />
                  </div>
                  <div
                    className="h-2.5 rounded-sm border border-white/10"
                    style={{
                      background: `linear-gradient(90deg, ${mf.stops
                        .map(
                          (s) =>
                            `rgba(${parseInt(s.color.slice(1, 3), 16)},${parseInt(s.color.slice(3, 5), 16)},${parseInt(s.color.slice(5, 7), 16)},${s.opacity}) ${s.position}%`,
                        )
                        .join(",")})`,
                    }}
                  />
                  <div className="flex gap-1">
                    <button
                      type="button"
                      className="rounded-[4px] border border-white/10 px-1.5 py-0.5 text-[9px] text-zinc-300"
                      onClick={() =>
                        onFillChange((f) =>
                          f.type === "gradient-linear" ? { ...f, stops: addMidStop(f.stops) } : f,
                        )
                      }
                    >
                      + Stop
                    </button>
                    <button
                      type="button"
                      className="rounded-[4px] border border-white/10 px-1.5 py-0.5 text-[9px] text-zinc-300"
                      onClick={() =>
                        onFillChange((f) =>
                          f.type === "gradient-linear"
                            ? { ...f, stops: reverseGradientStops(f.stops) }
                            : f,
                        )
                      }
                    >
                      Reverse
                    </button>
                  </div>
                  {mf.stops.map((s, si) => (
                    <div key={si} className="flex items-center gap-1">
                      <input
                        type="color"
                        value={s.color}
                        className="h-5 w-5 shrink-0 rounded border border-white/10"
                        onChange={(e) => {
                          const c = e.target.value;
                          onFillChange((f) => {
                            if (f.type !== "gradient-linear") return f;
                            return {
                              ...f,
                              stops: f.stops.map((st, j) => (j === si ? { ...st, color: c } : st)),
                            };
                          });
                        }}
                      />
                      <ScrubNumberInput
                        value={s.position}
                        onKeyboardCommit={(p) => {
                          onFillChange((f) => {
                            if (f.type !== "gradient-linear") return f;
                            return {
                              ...f,
                              stops: f.stops.map((st, j) =>
                                j === si ? { ...st, position: clamp(p, 0, 100) } : st,
                              ),
                            };
                          });
                        }}
                        onScrubLive={(p) => {
                          onFillChangeSilent((f) => {
                            if (f.type !== "gradient-linear") return f;
                            return {
                              ...f,
                              stops: f.stops.map((st, j) =>
                                j === si ? { ...st, position: clamp(p, 0, 100) } : st,
                              ),
                            };
                          });
                        }}
                        onScrubEnd={onCommitScrub}
                        step={1}
                        className="w-10"
                      />
                    </div>
                  ))}
                </div>
              ) : null}

              {o.type !== "textOnPath" && mf.type === "gradient-radial" ? (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[9px] uppercase text-zinc-500">Radio</span>
                    <ScrubNumberInput
                      value={Math.round(mf.r * 100) / 100}
                      onKeyboardCommit={(r) =>
                        onFillChange((f) =>
                          f.type === "gradient-radial" ? { ...f, r: clamp(r, 0.02, 2) } : f,
                        )
                      }
                      onScrubLive={(r) =>
                        onFillChangeSilent((f) =>
                          f.type === "gradient-radial" ? { ...f, r: clamp(r, 0.02, 2) } : f,
                        )
                      }
                      onScrubEnd={onCommitScrub}
                      step={0.02}
                      className="w-14"
                    />
                  </div>
                  {mf.stops.map((s, si) => (
                    <div key={si} className="flex items-center gap-1">
                      <input
                        type="color"
                        value={s.color}
                        className="h-5 w-5 shrink-0 rounded border border-white/10"
                        onChange={(e) => {
                          const c = e.target.value;
                          onFillChange((f) => {
                            if (f.type !== "gradient-radial") return f;
                            return {
                              ...f,
                              stops: f.stops.map((st, j) => (j === si ? { ...st, color: c } : st)),
                            };
                          });
                        }}
                      />
                      <ScrubNumberInput
                        value={s.position}
                        onKeyboardCommit={(p) => {
                          onFillChange((f) => {
                            if (f.type !== "gradient-radial") return f;
                            return {
                              ...f,
                              stops: f.stops.map((st, j) =>
                                j === si ? { ...st, position: clamp(p, 0, 100) } : st,
                              ),
                            };
                          });
                        }}
                        onScrubLive={(p) => {
                          onFillChangeSilent((f) => {
                            if (f.type !== "gradient-radial") return f;
                            return {
                              ...f,
                              stops: f.stops.map((st, j) =>
                                j === si ? { ...st, position: clamp(p, 0, 100) } : st,
                              ),
                            };
                          });
                        }}
                        onScrubEnd={onCommitScrub}
                        step={1}
                        className="w-10"
                      />
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </CompactPopover>

          <CompactPopover
            anchorRef={strokeAnchorRef}
            open={popover === "stroke"}
            onClose={() => setPopover(null)}
          >
            <div className="space-y-2 p-2 max-h-[min(360px,65vh)] overflow-y-auto">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  title="Sin trazo"
                  onClick={() => onPropChange("stroke", "none")}
                  className={`h-7 w-7 overflow-hidden rounded-[4px] border p-0.5 ${
                    noStroke ? "border-violet-400 ring-1 ring-violet-400/40" : "border-white/15"
                  }`}
                >
                  <FillTypeIcon kind="none" />
                </button>
                <label
                  className="ml-auto flex h-7 w-7 cursor-pointer overflow-hidden rounded-[4px] border border-white/15"
                  title="Selector de color"
                >
                  <span className="block h-full w-full bg-[conic-gradient(red,yellow,lime,cyan,blue,magenta,red)]" />
                  <input
                    type="color"
                    className="sr-only"
                    value={noStroke ? "#000000" : o.stroke}
                    onChange={(e) => onStrokeColor(e.target.value)}
                  />
                </label>
              </div>
              {recentColors.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {recentColors.slice(0, 18).map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      title={hex}
                      onClick={() => onStrokeColor(hex)}
                      className={PALETTE_SWATCH_BTN_CLASS}
                      style={{ backgroundColor: hex }}
                    />
                  ))}
                </div>
              ) : null}

              {!noStroke && hasDash ? (
                <div className="grid grid-cols-3 gap-1">
                  {parseStrokeDashSix(dashStr).map((val, idx) => (
                    <input
                      key={idx}
                      type="text"
                      value={val}
                      placeholder="—"
                      onChange={(e) => {
                        const next = [...parseStrokeDashSix(dashStr)];
                        next[idx] = e.target.value;
                        onPropChange("strokeDasharray", joinStrokeDashSix(next));
                      }}
                      className="rounded-[4px] border border-white/10 bg-[#1e2024] px-1 py-0.5 text-center font-mono text-[9px] text-zinc-100"
                    />
                  ))}
                </div>
              ) : null}

              {pathSel ? (
                <div className="space-y-1 border-t border-white/[0.08] pt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] uppercase text-zinc-500">Marcadores</span>
                    <button
                      type="button"
                      title="Intercambiar"
                      onClick={() => {
                        const p = o as {
                          strokeMarkerStart?: StrokeMarkerKind;
                          strokeMarkerEnd?: StrokeMarkerKind;
                        };
                        const a = p.strokeMarkerStart ?? "none";
                        const b = p.strokeMarkerEnd ?? "none";
                        onPropChange("strokeMarkerStart", b);
                        onPropChange("strokeMarkerEnd", a);
                      }}
                      className={MINI_BTN}
                    >
                      <ArrowLeftRight size={12} />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    <select
                      value={(o as { strokeMarkerStart?: StrokeMarkerKind }).strokeMarkerStart ?? "none"}
                      onChange={(e) =>
                        onPropChange("strokeMarkerStart", e.target.value as StrokeMarkerKind)
                      }
                      className={PANEL_SEL}
                    >
                      <option value="none">Inicio: —</option>
                      <option value="arrow">Inicio: flecha</option>
                      <option value="dot">Inicio: punto</option>
                    </select>
                    <select
                      value={(o as { strokeMarkerEnd?: StrokeMarkerKind }).strokeMarkerEnd ?? "none"}
                      onChange={(e) =>
                        onPropChange("strokeMarkerEnd", e.target.value as StrokeMarkerKind)
                      }
                      className={PANEL_SEL}
                    >
                      <option value="none">Fin: —</option>
                      <option value="arrow">Fin: flecha</option>
                      <option value="dot">Fin: punto</option>
                    </select>
                  </div>
                </div>
              ) : null}

              {o.type === "text" && o.strokeWidth > 0 ? (
                <div className="flex gap-1 border-t border-white/[0.08] pt-2">
                  {(["over", "under"] as const).map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => onPropChange("strokePosition", id)}
                      className={
                        ((o as { strokePosition?: "over" | "under" }).strokePosition ?? "over") === id
                          ? MINI_BTN_ON
                          : MINI_BTN
                      }
                    >
                      {id === "over" ? "Encima" : "Debajo"}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </CompactPopover>
        </div>
      ) : null}
    </div>
  );
}
