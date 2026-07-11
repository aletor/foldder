"use client";

import React from "react";
import { AlignCenter, AlignLeft, AlignRight } from "lucide-react";
import type { BlockMotion, MediaContent, TextContent, TextRole } from "@/lib/site/site-types";

export const TEXT_ROLE_OPTIONS: Array<{ value: TextRole; label: string }> = [
  { value: "h1", label: "H1" },
  { value: "h2", label: "H2" },
  { value: "h3", label: "H3" },
  { value: "body", label: "Body" },
  { value: "quote", label: "Quote" },
  { value: "caption", label: "Caption" },
];

export const MAX_WIDTH_OPTIONS: Array<{ value: NonNullable<TextContent["maxWidth"]>; label: string }> = [
  { value: "narrow", label: "Estrecho" },
  { value: "normal", label: "Normal" },
  { value: "full", label: "Completo" },
];

export const MOTION_PRESET_OPTIONS: Array<{ value: NonNullable<BlockMotion["preset"]>; label: string }> = [
  { value: "soft", label: "Soft" },
  { value: "expo", label: "Expo" },
  { value: "bounce", label: "Bounce" },
  { value: "linear", label: "Linear" },
];

export const MOTION_TRIGGER_OPTIONS: Array<{ value: NonNullable<BlockMotion["trigger"]>; label: string }> = [
  { value: "appear", label: "Aparecer" },
  { value: "scroll", label: "Scroll" },
  { value: "hover", label: "Hover" },
];

export const MEDIA_RATIO_OPTIONS: MediaContent["ratio"][] = ["16:9", "4:3", "1:1", "9:16", "3:2", "auto"];

export function TextRoleControl({
  value,
  onChange,
  compact,
}: {
  value: TextRole;
  onChange: (role: TextRole) => void;
  compact?: boolean;
}) {
  return (
    <div className={`site-quick-control__seg-grid${compact ? " site-quick-control__seg-grid--compact" : ""}`}>
      {TEXT_ROLE_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`site-quick-control__seg-btn${value === option.value ? " is-active" : ""}`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function AlignmentControl({
  value,
  onChange,
}: {
  value: NonNullable<TextContent["align"]>;
  onChange: (align: TextContent["align"]) => void;
}) {
  const options: Array<{ value: NonNullable<TextContent["align"]>; icon: React.ReactNode; label: string }> = [
    { value: "left", icon: <AlignLeft size={16} />, label: "Izquierda" },
    { value: "center", icon: <AlignCenter size={16} />, label: "Centro" },
    { value: "right", icon: <AlignRight size={16} />, label: "Derecha" },
  ];
  return (
    <div className="site-quick-control__icon-row">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`site-quick-control__icon-btn${value === option.value ? " is-active" : ""}`}
          onClick={() => onChange(option.value)}
          title={option.label}
          aria-label={option.label}
        >
          {option.icon}
        </button>
      ))}
    </div>
  );
}

export function MaxWidthControl({
  value,
  onChange,
}: {
  value: NonNullable<TextContent["maxWidth"]>;
  onChange: (maxWidth: TextContent["maxWidth"]) => void;
}) {
  const widths: Record<NonNullable<TextContent["maxWidth"]>, number> = {
    narrow: 40,
    normal: 65,
    full: 100,
  };
  return (
    <div className="site-quick-control__width-row">
      {MAX_WIDTH_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`site-quick-control__width-btn${value === option.value ? " is-active" : ""}`}
          onClick={() => onChange(option.value)}
          title={option.label}
        >
          <span className="site-quick-control__width-preview" aria-hidden>
            <span style={{ width: `${widths[option.value]}%` }} />
          </span>
          <span className="site-quick-control__width-label">{option.label}</span>
        </button>
      ))}
    </div>
  );
}

export function MotionModeControl({
  value,
  onChange,
}: {
  value: BlockMotion["mode"];
  onChange: (mode: BlockMotion["mode"]) => void;
}) {
  return (
    <div className="site-quick-control__seg-row">
      <button
        type="button"
        className={`site-quick-control__seg-btn${value === "inherit" ? " is-active" : ""}`}
        onClick={() => onChange("inherit")}
      >
        Heredar
      </button>
      <button
        type="button"
        className={`site-quick-control__seg-btn${value === "override" ? " is-active" : ""}`}
        onClick={() => onChange("override")}
      >
        Override
      </button>
    </div>
  );
}

export function MotionPresetControl({
  value,
  onChange,
}: {
  value: NonNullable<BlockMotion["preset"]>;
  onChange: (preset: BlockMotion["preset"]) => void;
}) {
  return (
    <div className="site-quick-control__seg-grid site-quick-control__seg-grid--compact">
      {MOTION_PRESET_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`site-quick-control__seg-btn${value === option.value ? " is-active" : ""}`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function MotionTriggerControl({
  value,
  onChange,
}: {
  value: NonNullable<BlockMotion["trigger"]>;
  onChange: (trigger: BlockMotion["trigger"]) => void;
}) {
  return (
    <div className="site-quick-control__seg-row">
      {MOTION_TRIGGER_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`site-quick-control__seg-btn${value === option.value ? " is-active" : ""}`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function MediaRatioControl({
  value,
  onChange,
}: {
  value: MediaContent["ratio"];
  onChange: (ratio: MediaContent["ratio"]) => void;
}) {
  return (
    <div className="site-quick-control__seg-grid site-quick-control__seg-grid--compact">
      {MEDIA_RATIO_OPTIONS.map((ratio) => (
        <button
          key={ratio}
          type="button"
          className={`site-quick-control__seg-btn${value === ratio ? " is-active" : ""}`}
          onClick={() => onChange(ratio)}
        >
          {ratio}
        </button>
      ))}
    </div>
  );
}

export function MediaFitControl({
  value,
  onChange,
}: {
  value: MediaContent["fit"];
  onChange: (fit: MediaContent["fit"]) => void;
}) {
  return (
    <div className="site-quick-control__seg-row">
      {(["cover", "contain"] as const).map((fit) => (
        <button
          key={fit}
          type="button"
          className={`site-quick-control__seg-btn${value === fit ? " is-active" : ""}`}
          onClick={() => onChange(fit)}
        >
          {fit === "cover" ? "Cover" : "Contain"}
        </button>
      ))}
    </div>
  );
}

export function QuickField({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <div className="site-quick-control__field">
      {label ? <span className="site-quick-control__field-label">{label}</span> : null}
      {children}
    </div>
  );
}
