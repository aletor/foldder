"use client";

import React, { useMemo, useState } from "react";
import { layerObjectMap, layerUiDescriptor } from "./designer-layer-fingerprint";
import {
  diffDesignerSourceSnapshots,
  diffModifiedLayerCount,
  type DesignerSourceDiffV1,
} from "./designer-source-diff";
import type { DesignerSourceSnapshotV1 } from "./site-creator-types";

export interface SiteCreatorSyncDialogProps {
  open: boolean;
  current: DesignerSourceSnapshotV1;
  candidate: DesignerSourceSnapshotV1;
  busy?: boolean;
  errorMessage?: string | null;
  onCancel: () => void;
  onConfirm: (reviewedCandidateHash: string) => void;
}

function changeLabelsForLayer(diff: DesignerSourceDiffV1, layerId: string): string[] {
  const labels: string[] = [];
  if (diff.layers.addedIds.includes(layerId)) labels.push("añadida");
  if (diff.layers.removedIds.includes(layerId)) labels.push("eliminada");
  if (diff.layers.visuallyChangedIds.includes(layerId)) labels.push("modificada");
  if (diff.layers.hierarchyChangedIds.includes(layerId)) labels.push("estructura");
  return labels;
}

export function SiteCreatorSyncDialog({
  open,
  current,
  candidate,
  busy = false,
  errorMessage,
  onCancel,
  onConfirm,
}: SiteCreatorSyncDialogProps) {
  const [showDetails, setShowDetails] = useState(false);
  const diff = useMemo(() => diffDesignerSourceSnapshots(current, candidate), [current, candidate]);
  const modifiedCount = diffModifiedLayerCount(diff);
  const candidateObjects = useMemo(() => layerObjectMap(candidate.page), [candidate.page]);
  const currentObjects = useMemo(() => layerObjectMap(current.page), [current.page]);

  if (!open) return null;

  const detailLayerIds = [
    ...diff.layers.addedIds,
    ...diff.layers.removedIds,
    ...new Set([...diff.layers.visuallyChangedIds, ...diff.layers.hierarchyChangedIds]),
  ].sort((a, b) => a.localeCompare(b));

  return (
    <div className="site-creator-dialog-backdrop fixed inset-0 z-[100030] flex items-center justify-center bg-black/60 p-4">
      <div
        className="site-creator-dialog w-full max-w-md rounded-lg border border-white/10 bg-[#101820] p-5 text-white shadow-2xl"
        role="dialog"
        aria-labelledby="site-creator-sync-title"
      >
        <h2 id="site-creator-sync-title" className="text-xs font-black uppercase tracking-[0.14em] text-[#22d3ee]">
          Actualizar desde Designer
        </h2>

        <ul className="mt-4 space-y-2 text-sm text-white/85">
          <li>{diff.summary.added} capas nuevas</li>
          <li>{diff.summary.removed} capas eliminadas</li>
          <li>{modifiedCount} capas modificadas</li>
          <li>{diff.summary.hierarchyChanged} cambios de estructura</li>
          {diff.pageChanges.dimensionsChanged ? <li>Cambio de dimensiones</li> : null}
          {diff.pageChanges.backgroundChanged ? <li>Cambio de fondo</li> : null}
        </ul>

        <button
          type="button"
          className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-[#22d3ee] hover:text-[#67e8f9]"
          onClick={() => setShowDetails((value) => !value)}
        >
          {showDetails ? "Ocultar detalles" : "Ver detalles"}
        </button>

        {showDetails ? (
          <ul className="mt-3 max-h-40 space-y-1 overflow-auto rounded border border-white/10 bg-black/20 p-2 text-xs text-white/70">
            {detailLayerIds.map((layerId) => {
              const obj =
                candidateObjects.get(layerId) ??
                currentObjects.get(layerId) ??
                current.page.objects.find((o) => o.id === layerId);
              const descriptor = obj ? layerUiDescriptor(obj) : { label: layerId, type: "?", name: layerId };
              const changes = changeLabelsForLayer(diff, layerId).join(", ");
              return (
                <li key={layerId}>
                  {descriptor.label} · {changes || "—"}
                </li>
              );
            })}
          </ul>
        ) : null}

        {errorMessage ? <p className="mt-3 text-xs text-rose-300">{errorMessage}</p> : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            className="rounded border border-white/20 px-3 py-1.5 text-xs font-semibold text-white/80 hover:bg-white/5"
            onClick={onCancel}
            disabled={busy}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="rounded border border-[#22d3ee] bg-[#22d3ee]/20 px-3 py-1.5 text-xs font-semibold text-[#22d3ee] hover:bg-[#22d3ee]/30 disabled:opacity-40"
            onClick={() => onConfirm(diff.candidateHash)}
            disabled={busy}
          >
            Actualizar diseño
          </button>
        </div>
      </div>
    </div>
  );
}
