"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  User,
  Shirt,
  Camera,
  Crop,
  Lightbulb,
  Palette,
  Armchair,
  Smile,
  Check,
  Copy,
  type LucideIcon,
} from "lucide-react";
import {
  DESCRIBER_ANALYSIS_CATEGORY_ORDER,
  resolveDescriberAnalysisDisplay,
  type DescriberAnalysisCategory,
} from "@/lib/parse-describer-sections";

export const DESCRIBER_ICON_REVEAL_MS = 3000;

const ANALYZED_LABEL = "ANALYZED";
const ANALYZED_LETTER_MS = 85;

function DescriberAnalyzedTitle({
  onCopy,
  copied,
}: {
  onCopy?: () => void;
  copied?: boolean;
}) {
  const [visibleLetters, setVisibleLetters] = useState(0);
  const [showCopyButton, setShowCopyButton] = useState(false);

  useEffect(() => {
    setVisibleLetters(0);
    setShowCopyButton(false);
    const timers: ReturnType<typeof setTimeout>[] = [];

    for (let index = 0; index < ANALYZED_LABEL.length; index += 1) {
      timers.push(
        window.setTimeout(() => {
          setVisibleLetters(index + 1);
        }, (index + 1) * ANALYZED_LETTER_MS),
      );
    }

    timers.push(
      window.setTimeout(() => {
        setShowCopyButton(true);
      }, ANALYZED_LABEL.length * ANALYZED_LETTER_MS + 120),
    );

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  return (
    <div className="describer-node-analyzed-banner absolute inset-x-0 top-1/2 z-[7] -translate-y-1/2 nodrag nopan">
      <div className="describer-node-analyzed-row">
        <span className="describer-node-analyzed-label" aria-label={ANALYZED_LABEL}>
          {ANALYZED_LABEL.split("").map((letter, index) => (
            <span
              key={`${letter}-${index}`}
              className={`describer-node-analyzed-letter${index < visibleLetters ? " describer-node-analyzed-letter--visible" : ""}`}
              aria-hidden={index >= visibleLetters}
            >
              {letter}
            </span>
          ))}
        </span>
        {onCopy && showCopyButton ? (
          <button
            type="button"
            className="describer-copy-prompt-btn describer-copy-prompt-btn--analyzed nodrag shrink-0"
            onClick={onCopy}
            title={copied ? "Copied" : "Copy prompt"}
            aria-label={copied ? "Copied" : "Copy prompt"}
          >
            <Copy size={15} strokeWidth={2} aria-hidden />
          </button>
        ) : null}
      </div>
    </div>
  );
}

const METRIC_META: Record<
  DescriberAnalysisCategory,
  { label: string; icon: LucideIcon }
> = {
  subject: { label: "Subject & pose", icon: User },
  wardrobe: { label: "Wardrobe", icon: Shirt },
  camera: { label: "Camera & lens", icon: Camera },
  framing: { label: "Framing", icon: Crop },
  lighting: { label: "Lighting", icon: Lightbulb },
  color: { label: "Color grade", icon: Palette },
  environment: { label: "Environment", icon: Armchair },
  mood: { label: "Mood & style", icon: Smile },
};

type DescriberNodeAnalysisOverlayProps = {
  mode: "progress" | "complete";
  description?: string | null;
  revealedCount?: number;
  onCopy?: () => void;
  copied?: boolean;
};

function DescriberNodeMediaMetric({
  label,
  icon: Icon,
  animate,
}: {
  label: string;
  icon: LucideIcon;
  animate?: boolean;
}) {
  return (
    <span
      className={`describer-node-media-metric inline-flex items-center gap-0.5${animate ? " describer-node-media-metric--revealed" : ""}`}
      title={label}
    >
      <span className="describer-node-media-metric__icon" aria-hidden>
        <Icon size={11} strokeWidth={2.2} />
      </span>
      <Check size={9} strokeWidth={3} className="describer-node-media-metric__check shrink-0" aria-hidden />
    </span>
  );
}

export function DescriberNodeAnalysisOverlay({
  mode,
  description,
  revealedCount = 0,
  onCopy,
  copied = false,
}: DescriberNodeAnalysisOverlayProps) {
  const parsedStatus = useMemo(
    () => (description ? resolveDescriberAnalysisDisplay(description) : null),
    [description],
  );

  const visibleMetrics = useMemo(() => {
    if (mode === "progress") {
      return DESCRIBER_ANALYSIS_CATEGORY_ORDER.slice(0, revealedCount);
    }
    if (!description?.trim()) return [];
    return DESCRIBER_ANALYSIS_CATEGORY_ORDER.filter((id) => parsedStatus?.[id]);
  }, [description, mode, parsedStatus, revealedCount]);

  if (mode === "complete" && visibleMetrics.length === 0) {
    return null;
  }

  return (
    <>
      <div className="describer-node-media-scrim pointer-events-none absolute inset-0 z-[2]" aria-hidden />
      {mode === "complete" ? (
        <DescriberAnalyzedTitle onCopy={onCopy} copied={copied} />
      ) : null}
      <div className="describer-node-media-footer absolute inset-x-0 bottom-0 z-[8] px-3 pb-3 pt-10 nodrag nopan">
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            {visibleMetrics.length > 0 ? (
              <div className="describer-node-media-metrics flex flex-wrap items-center gap-x-2.5 gap-y-0.5" aria-label="Analyzed image elements">
                {visibleMetrics.map((id, index) => {
                  const meta = METRIC_META[id];
                  return (
                    <DescriberNodeMediaMetric
                      key={id}
                      label={meta.label}
                      icon={meta.icon}
                      animate={mode === "progress" && index === visibleMetrics.length - 1}
                    />
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}

/** @deprecated Use DescriberNodeAnalysisOverlay */
export function DescriberNodeAnalysisGrid({ description }: { description: string }) {
  return <DescriberNodeAnalysisOverlay mode="complete" description={description} />;
}
