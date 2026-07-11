"use client";

import { createPortal } from "react-dom";
import { useEffect, useRef, useState, type RefObject } from "react";
import { archiveCandidate, getTrait, upsertTrait, type Genome } from "@/lib/brandkit/model/trait";
import type { TraitId } from "@/lib/brandkit/model/trait-ids";
import {
  buildDepthRows,
  resolveSourceLabels,
  signalDisplayLabel,
  traitDepthTitle,
} from "@/lib/brandkit/projection/depth-view";
import type { LogoValue } from "@/lib/brandkit/model/trait-values";
import { logoCandidateNeedsVectorize } from "@/lib/brandkit/projection/logo-vectorize-action";
import type { BrandKitBookView } from "@/lib/brandkit/projection/book-view";
import { isIntakeGenomeCandidateId } from "@/lib/brandkit/logo-intake/genome-bridge";
import { useBrandKitDepthPopoverPosition } from "./use-brand-kit-depth-popover";
import { useBrandKitFaceContext } from "./brand-kit-face-context";
import { BrandKitLogoImage } from "./BrandKitLogoImage";

function BrandKitDepthPanelBody({
  genome,
  traitId,
  onClose,
  onVectorizingChange,
}: {
  genome: Genome;
  traitId: TraitId;
  onClose: () => void;
  onVectorizingChange?: (busy: boolean) => void;
}) {
  const ctx = useBrandKitFaceContext();
  const rows = buildDepthRows(genome, traitId);
  const allSourceIds = [...new Set(rows.flatMap((r) => r.sourceRefs))];
  const sourceLabels = resolveSourceLabels(genome, allSourceIds);
  const [vectorizingId, setVectorizingId] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  const crownedIntakeRow =
    traitId === "logo.primary"
      ? rows.find((row) => row.crowned && isIntakeGenomeCandidateId(row.id))
      : undefined;

  const handleVectorize = async (candidateId: string) => {
    if (!ctx?.onVectorizeLogo || vectorizingId || ctx.vectorizeEnabled === false) return;
    setVectorizingId(candidateId);
    onVectorizingChange?.(true);
    try {
      await ctx.onVectorizeLogo(candidateId);
    } finally {
      setVectorizingId(null);
      onVectorizingChange?.(false);
    }
  };

  const handleIntakeUnlock = async () => {
    if (!ctx?.onIntakeLogoUnlock || unlocking) return;
    setUnlocking(true);
    try {
      await ctx.onIntakeLogoUnlock();
      onClose();
    } finally {
      setUnlocking(false);
    }
  };

  return (
    <>
      <div className="brandKit-depth-popover__header">
        <p className="brandKit-depth-popover__title">{traitDepthTitle(traitId)}</p>
        <button type="button" className="brandKit-depth-popover__close" onClick={onClose}>
          cerrar
        </button>
      </div>

      {crownedIntakeRow ? (
        <div className="brandKit-depth-popover__intake-unlock border-b border-white/10 px-4 py-3">
          <p className="text-xs lowercase text-white/60">logo validado en intake</p>
          <button
            type="button"
            className="brandKit-depth-popover__action mt-2"
            disabled={unlocking}
            onClick={() => void handleIntakeUnlock()}
          >
            {unlocking ? "desbloqueando…" : "re-detectar logo"}
          </button>
        </div>
      ) : null}

      <ul className="brandKit-depth-popover__list">
        {rows.length === 0 ? (
          <li className="brandKit-depth-popover__empty">Sin candidatos activos</li>
        ) : (
          rows.map((row) => {
            const needsVectorize = logoCandidateNeedsVectorize(genome, traitId, row.id);
            const vectorizing = vectorizingId === row.id;
            const logoCandidate = getTrait(genome, traitId)?.candidates.find((c) => c.id === row.id);
            const vectorizeDisabled = ctx?.vectorizeEnabled === false;
            return (
              <li key={row.id} className="brandKit-depth-popover__row">
                <div className="brandKit-depth-popover__row-head">
                  {row.preview?.kind === "color" ? (
                    <span
                      className="brandKit-depth-popover__swatch"
                      style={{ backgroundColor: row.preview.hex }}
                      aria-hidden
                    />
                  ) : null}
                  {row.preview?.kind === "logo" && logoCandidate ? (
                    <BrandKitLogoImage
                      logo={logoCandidate.value as LogoValue}
                      derived={logoCandidate.derived}
                      className="brandKit-depth-popover__logo"
                    />
                  ) : null}
                  <div className="brandKit-depth-popover__row-copy">
                    <div className="brandKit-depth-popover__row-title">
                      <span className="truncate">{row.label}</span>
                      <span className="brandKit-depth-popover__score">{(row.score * 100).toFixed(0)}%</span>
                    </div>
                    {row.sublabel ? (
                      <p className="brandKit-depth-popover__sublabel">{row.sublabel}</p>
                    ) : null}
                  </div>
                </div>

                {row.signals.length > 0 ? (
                  <ul className="brandKit-depth-popover__signals">
                    {row.signals.slice(0, 4).map((s, i) => (
                      <li key={`${row.id}-${i}`}>{signalDisplayLabel(s, genome.sources)}</li>
                    ))}
                  </ul>
                ) : null}

                <div className="brandKit-depth-popover__actions">
                  {!row.crowned ? (
                    <button
                      type="button"
                      className="brandKit-depth-popover__action brandKit-depth-popover__action--primary"
                      onClick={() => ctx?.onCrown?.(traitId, row.id)}
                    >
                      confirmar
                    </button>
                  ) : (
                    <span className="brandKit-depth-popover__status">confirmado</span>
                  )}
                  {needsVectorize ? (
                    <button
                      type="button"
                      className="brandKit-depth-popover__action"
                      disabled={Boolean(vectorizingId) || vectorizeDisabled}
                      title={vectorizeDisabled ? "vectorizador no disponible" : undefined}
                      onClick={() => void handleVectorize(row.id)}
                    >
                      {vectorizing ? "vectorizando…" : "vectorizar"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="brandKit-depth-popover__action"
                    onClick={() => {
                      const t = getTrait(genome, traitId);
                      if (!t || !ctx?.onGenomeChange) return;
                      if (row.crowned && isIntakeGenomeCandidateId(row.id)) {
                        void ctx.onIntakeLogoUnlock?.();
                        return;
                      }
                      ctx.onGenomeChange(upsertTrait(genome, archiveCandidate(t, row.id)));
                    }}
                  >
                    archivar
                  </button>
                </div>
              </li>
            );
          })
        )}
      </ul>

      {sourceLabels.length > 0 ? (
        <div className="brandKit-depth-popover__sources">
          <p className="brandKit-depth-popover__sources-title">fuentes</p>
          <ul className="brandKit-depth-popover__sources-list">
            {sourceLabels.map((label) => (
              <li key={label} className="truncate">
                {label}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}

export function BrandKitDepthPanel({
  genome,
  traitId,
  anchorRef,
  onClose,
}: {
  genome: Genome;
  view: BrandKitBookView;
  traitId: TraitId;
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const panelStyle = useBrandKitDepthPopoverPosition(anchorRef, true, panelRef);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <>
      <button
        type="button"
        className="brandKit-depth-popover__backdrop"
        aria-label="cerrar panel"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className="brandKit-depth-popover"
        style={panelStyle}
        role="dialog"
        aria-label={traitDepthTitle(traitId)}
        onClick={(e) => e.stopPropagation()}
      >
        <BrandKitDepthPanelBody genome={genome} traitId={traitId} onClose={onClose} />
      </div>
    </>,
    document.body,
  );
}
