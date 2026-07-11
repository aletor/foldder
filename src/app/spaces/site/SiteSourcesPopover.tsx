"use client";

import React from "react";
import { X } from "lucide-react";
import type { SiteGraphConnectionStatus } from "@/lib/site/site-bindings";

export function SiteSourcesPopover({
  graphStatus,
  datasetLoading,
  graphApplyPending,
  autoGraphSync,
  brandConnected,
  onClose,
  onApplyGraphBindings,
  onAutoGraphSyncChange,
  onFillBrandContent,
}: {
  graphStatus: SiteGraphConnectionStatus;
  datasetLoading?: boolean;
  graphApplyPending?: boolean;
  autoGraphSync?: boolean;
  brandConnected?: boolean;
  onClose: () => void;
  onApplyGraphBindings?: () => void;
  onAutoGraphSyncChange?: (enabled: boolean) => void;
  onFillBrandContent?: () => void;
}) {
  return (
    <div className="site-editor-popover site-editor-popover--sources" role="dialog" aria-label="Fuentes">
      <header className="site-editor-popover__head">
        <h2 className="site-editor-popover__title">Fuentes</h2>
        <button type="button" className="site-editor-popover__close" onClick={onClose} aria-label="Cerrar">
          <X size={16} />
        </button>
      </header>

      <div className="site-editor-popover__body">
        <SourceRow
          label="ADN / Genoma"
          connected={Boolean(brandConnected)}
          detail={brandConnected ? "Conectado" : "Sin cable — conecta BrandKit"}
        />
        <SourceRow
          label="Dataset"
          connected={graphStatus.dataset.connected}
          detail={
            graphStatus.dataset.connected
              ? `${graphStatus.dataset.label ?? "Dataset"} · ${datasetLoading ? "…" : `${graphStatus.dataset.rowCount} filas`}`
              : "Sin cable"
          }
        />
        <SourceRow
          label="Contenido"
          connected={graphStatus.content.connected}
          detail={
            graphStatus.content.connected
              ? `${graphStatus.content.label ?? "Populate"} · ${graphStatus.content.itemCount} ítems`
              : "Sin cable"
          }
        />
        <SourceRow
          label="Media"
          connected={graphStatus.media.connected}
          detail={
            graphStatus.media.connected
              ? `${graphStatus.media.label ?? "Media"}${graphStatus.media.hasUrl ? "" : " · sin URL"}`
              : "Sin cable"
          }
        />

        {onApplyGraphBindings ? (
          <button
            type="button"
            className="site-editor-popover__action"
            disabled={!graphApplyPending}
            onClick={onApplyGraphBindings}
          >
            Aplicar grafo al borrador
          </button>
        ) : null}

        {onAutoGraphSyncChange ? (
          <label className="site-editor-popover__check">
            <input
              type="checkbox"
              checked={autoGraphSync !== false}
              onChange={(event) => onAutoGraphSyncChange(event.target.checked)}
            />
            Sync automático del grafo
          </label>
        ) : null}

        {onFillBrandContent && brandConnected ? (
          <button type="button" className="site-editor-popover__link-btn" onClick={onFillBrandContent}>
            Rellenar desde marca
          </button>
        ) : null}

        <p className="site-editor-popover__hint">
          Cablea puertos en el canvas para conectar Dataset, Populate o Media. Los cambios se reflejan aquí.
        </p>
      </div>
    </div>
  );
}

function SourceRow({
  label,
  connected,
  detail,
}: {
  label: string;
  connected: boolean;
  detail: string;
}) {
  return (
    <div className={`site-editor-source-row${connected ? " is-connected" : ""}`}>
      <div className="site-editor-source-row__main">
        <span className="site-editor-source-row__label">{label}</span>
        <span className="site-editor-source-row__detail">{detail}</span>
      </div>
      <span className="site-editor-source-row__status">{connected ? "●" : "○"}</span>
    </div>
  );
}
