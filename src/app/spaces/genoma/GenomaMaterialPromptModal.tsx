"use client";

import type { MaterialPromptPayload } from "@/lib/genoma/ingest/material-prompt";
import type { ColorValue, LogoValue, TypographyValue } from "@/lib/genoma/model/trait-values";
import { specimenFontStack } from "@/lib/genoma/specimen/typography-specimen";
import { G, cx } from "./face-utils";
import { GenomaMediaImage } from "./GenomaMediaImage";

function PromptVisual({ prompt }: { prompt: MaterialPromptPayload }) {
  const value = prompt.candidate.value;
  if (prompt.traitId.startsWith("color.") && value && typeof value === "object" && "hex" in value) {
    const color = value as ColorValue;
    return (
      <div className="mt-6 h-20 w-full" style={{ backgroundColor: color.hex }} title={color.hex.toUpperCase()} />
    );
  }
  if (prompt.traitId.startsWith("logo.") && value && typeof value === "object" && "imageUrl" in value) {
    const logo = value as LogoValue;
    return (
      <div className="mt-6 flex h-24 items-center justify-center border-t border-[var(--border)] pt-6">
        <GenomaMediaImage src={logo.imageUrl} alt="" className="max-h-full max-w-full object-contain" eager />
      </div>
    );
  }
  if (prompt.traitId.startsWith("typography.") && value && typeof value === "object" && "family" in value) {
    const typo = value as TypographyValue;
    return (
      <p className="mt-6 text-3xl leading-tight text-[var(--text-main)]" style={{ fontFamily: specimenFontStack(typo) }}>
        {typo.family}
      </p>
    );
  }
  return null;
}

/** Inline — dentro del flujo de ingesta, sin overlay. */
export function GenomaMaterialPromptCard({
  prompt,
  onResolve,
  className,
}: {
  prompt: MaterialPromptPayload | null;
  onResolve: (optionId: string) => void;
  className?: string;
}) {
  if (!prompt) return null;

  return (
    <div className={cx("border-t border-[var(--border)] pt-8", className)} role="group" aria-labelledby="genoma-material-prompt-title">
      <p id="genoma-material-prompt-title" className="text-sm leading-relaxed lowercase text-[var(--text-main)]">
        {prompt.headline}
      </p>
      <PromptVisual prompt={prompt} />
      <p className="mt-4 text-xs lowercase text-[var(--text-muted)]">¿cómo lo añadimos?</p>
      {prompt.detail ? <p className="mt-2 text-xs text-[var(--text-muted)]">{prompt.detail}</p> : null}
      <div className="mt-6 flex flex-col gap-0 border-t border-[var(--border)]">
        {prompt.options.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => onResolve(option.id)}
            className={cx(
              G.listRow,
              "w-full border-b border-[var(--border)] bg-transparent text-left text-sm lowercase transition hover:text-[var(--text-main)]",
              option.id === "ignore" ? "text-[var(--text-muted)]" : "text-[var(--text-main)]",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
