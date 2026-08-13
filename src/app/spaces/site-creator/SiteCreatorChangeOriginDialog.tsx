"use client";

import React from "react";
import { getPageDimensions } from "../indesign/page-formats";
import { canReplaceDesignerOrigin } from "./site-creator-blueprint-refs";
import type { DesignerSourceSnapshotV1, SiteBlueprintV1 } from "./site-creator-types";

export interface SiteCreatorChangeOriginDialogProps {
  open: boolean;
  blueprint: SiteBlueprintV1;
  currentSnapshot: DesignerSourceSnapshotV1;
  candidateSnapshot: DesignerSourceSnapshotV1;
  currentDesignerLabel: string;
  newDesignerLabel: string;
  busy?: boolean;
  errorMessage?: string | null;
  onCancel: () => void;
  onConfirm: (reviewedCandidateHash: string) => void;
}

export function SiteCreatorChangeOriginDialog({
  open,
  blueprint,
  currentSnapshot,
  candidateSnapshot,
  currentDesignerLabel,
  newDesignerLabel,
  busy = false,
  errorMessage,
  onCancel,
  onConfirm,
}: SiteCreatorChangeOriginDialogProps) {
  if (!open) return null;

  const allowed = canReplaceDesignerOrigin(blueprint);
  const currentDims = getPageDimensions(currentSnapshot.page);
  const candidateDims = getPageDimensions(candidateSnapshot.page);

  return (
    <div className="site-creator-dialog-backdrop fixed inset-0 z-[100030] flex items-center justify-center bg-black/60 p-4">
      <div
        className="site-creator-dialog w-full max-w-md rounded-lg border border-white/10 bg-[#101820] p-5 text-white shadow-2xl"
        role="dialog"
        aria-labelledby="site-creator-origin-title"
      >
        <h2 id="site-creator-origin-title" className="text-xs font-black uppercase tracking-[0.14em] text-[#22d3ee]">
          Cambiar origen
        </h2>
        <p className="mt-3 text-sm text-white/75">
          El diseño conectado no es el que originó este Site Creator.
        </p>

        <dl className="mt-4 space-y-3 text-xs text-white/70">
          <div>
            <dt className="font-semibold uppercase tracking-wide text-white/45">Origen actual</dt>
            <dd className="mt-1 text-white/85">
              {currentDesignerLabel} · {currentSnapshot.layerCount} capas · {currentDims.width}×
              {currentDims.height}px
            </dd>
          </div>
          <div>
            <dt className="font-semibold uppercase tracking-wide text-white/45">Nuevo origen</dt>
            <dd className="mt-1 text-white/85">
              {newDesignerLabel} · {candidateSnapshot.layerCount} capas · {candidateDims.width}×
              {candidateDims.height}px
            </dd>
          </div>
        </dl>

        {!allowed ? (
          <p className="mt-4 text-xs leading-relaxed text-amber-200/90">
            Este Site Creator ya contiene estructura. La migración a otro Designer se implementará en una fase
            posterior.
          </p>
        ) : null}

        {errorMessage ? <p className="mt-3 text-xs text-rose-300">{errorMessage}</p> : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            className="rounded border border-white/20 px-3 py-1.5 text-xs font-semibold text-white/80 hover:bg-white/5"
            onClick={onCancel}
            disabled={busy}
          >
            Mantener diseño actual
          </button>
          <button
            type="button"
            className="rounded border border-[#22d3ee] bg-[#22d3ee]/20 px-3 py-1.5 text-xs font-semibold text-[#22d3ee] hover:bg-[#22d3ee]/30 disabled:opacity-40"
            onClick={() => onConfirm(candidateSnapshot.contentHash)}
            disabled={busy || !allowed}
          >
            Usar nuevo Designer
          </button>
        </div>
      </div>
    </div>
  );
}
