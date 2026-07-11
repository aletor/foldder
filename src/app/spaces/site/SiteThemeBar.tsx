"use client";

import React from "react";
import { Monitor, Smartphone, Upload } from "lucide-react";
import type { SiteGraphConnectionStatus } from "@/lib/site/site-bindings";
import type { SitePreviewMode, ThemeState } from "@/lib/site/site-types";

export function SiteThemeBar({
  theme,
  brandConnected,
  brandName,
  motionDnaSource,
  graphStatus,
  datasetLoading,
  graphApplyPending,
  autoGraphSync,
  onApplyGraphBindings,
  onAutoGraphSyncChange,
  onFillBrandContent,
  onFinishPreset,
  onRhythmChange,
  onMotionIntensityChange,
}: {
  theme: ThemeState;
  brandConnected: boolean;
  brandName?: string;
  motionDnaSource?: string;
  graphStatus: SiteGraphConnectionStatus;
  datasetLoading?: boolean;
  graphApplyPending?: boolean;
  autoGraphSync?: boolean;
  onApplyGraphBindings?: () => void;
  onAutoGraphSyncChange?: (enabled: boolean) => void;
  onFillBrandContent?: () => void;
  onFinishPreset: (preset: ThemeState["finishPreset"]) => void;
  onRhythmChange: (rhythm: ThemeState["dials"]["rhythm"]) => void;
  onMotionIntensityChange: (intensity: 0 | 1 | 2) => void;
}) {
  const finishPresets: Array<NonNullable<ThemeState["finishPreset"]>> = ["editorial", "impact", "minimal"];
  const rhythms: ThemeState["dials"]["rhythm"][] = ["compact", "normal", "airy"];

  return (
    <div className="site-studio__theme-bar">
      <div className="site-studio__theme-base">
        {brandConnected ? (
          <span className="site-studio__theme-badge site-studio__theme-badge--brand">
            Marca: {brandName?.trim() || "Conectada"}
          </span>
        ) : (
          <span className="site-studio__theme-badge">Tema neutro Foldder</span>
        )}
        <span className="site-studio__theme-motion-dna">
          {motionDnaSource?.trim() || `Motion DNA: ${theme.motionDNA}`} · intensidad {theme.dials.motionIntensity}
        </span>
        <div className="site-studio__graph-badges" aria-label="Entradas del grafo">
          <GraphPortBadge
            label="Dataset"
            connected={graphStatus.dataset.connected}
            detail={
              graphStatus.dataset.connected
                ? `${graphStatus.dataset.label ?? "Dataset"} · ${datasetLoading ? "…" : `${graphStatus.dataset.rowCount} imgs`}`
                : "Sin cable"
            }
          />
          <GraphPortBadge
            label="Contenido"
            connected={graphStatus.content.connected}
            detail={
              graphStatus.content.connected
                ? `${graphStatus.content.label ?? "Populate"} · ${graphStatus.content.itemCount} imgs`
                : "Sin cable"
            }
          />
          <GraphPortBadge
            label="Media"
            connected={graphStatus.media.connected}
            detail={
              graphStatus.media.connected
                ? `${graphStatus.media.label ?? "Media"}${graphStatus.media.hasUrl ? "" : " · sin URL"}`
                : "Sin cable"
            }
          />
        </div>
        {onApplyGraphBindings ? (
          <button
            type="button"
            className={`site-studio__apply-graph-btn${graphApplyPending ? " is-pending" : ""}`}
            disabled={!graphApplyPending}
            onClick={onApplyGraphBindings}
            title={
              graphApplyPending
                ? "Guardar en el borrador las imágenes del grafo conectado"
                : "No hay cambios del grafo pendientes de aplicar"
            }
          >
            Aplicar grafo al borrador
          </button>
        ) : null}
        {onAutoGraphSyncChange ? (
          <label className="site-studio__checkbox-row site-studio__checkbox-row--inline">
            <input
              type="checkbox"
              checked={autoGraphSync !== false}
              onChange={(event) => onAutoGraphSyncChange(event.target.checked)}
            />
            Sync auto grafo
          </label>
        ) : null}
        {onFillBrandContent && brandConnected ? (
          <button type="button" className="site-studio__apply-graph-btn" onClick={onFillBrandContent}>
            Rellenar desde marca
          </button>
        ) : null}
      </div>

      <div className="site-studio__theme-dials">
        {finishPresets.map((preset) => (
          <button
            key={preset}
            type="button"
            className={`site-studio__dial-btn${theme.finishPreset === preset ? " is-active" : ""}`}
            onClick={() => onFinishPreset(preset)}
          >
            {preset}
          </button>
        ))}
        {rhythms.map((rhythm) => (
          <button
            key={rhythm}
            type="button"
            className={`site-studio__dial-btn${theme.dials.rhythm === rhythm ? " is-active" : ""}`}
            onClick={() => onRhythmChange(rhythm)}
          >
            Ritmo {rhythm}
          </button>
        ))}
        {([0, 1, 2] as const).map((level) => (
          <button
            key={level}
            type="button"
            className={`site-studio__dial-btn${theme.dials.motionIntensity === level ? " is-active" : ""}`}
            onClick={() => onMotionIntensityChange(level)}
          >
            Motion {level}
          </button>
        ))}
      </div>
    </div>
  );
}

function GraphPortBadge({
  label,
  connected,
  detail,
}: {
  label: string;
  connected: boolean;
  detail: string;
}) {
  return (
    <span
      className={`site-studio__graph-badge${connected ? " is-connected" : ""}`}
      title={`${label}: ${detail}`}
    >
      <span className="site-studio__graph-badge-label">{label}</span>
      <span className="site-studio__graph-badge-detail">{detail}</span>
    </span>
  );
}

export function SitePublishBar({
  previewMode,
  onPreviewModeChange,
  publishLabel,
  onPublish,
  canPublish,
  publishHash,
}: {
  previewMode: SitePreviewMode;
  onPreviewModeChange: (mode: SitePreviewMode) => void;
  publishLabel: string;
  onPublish: () => void;
  canPublish: boolean;
  publishHash?: string;
}) {
  return (
    <div className="site-studio__publish-bar">
      <div className="site-studio__publish-meta">
        {publishHash ? (
          <span className="site-studio__publish-hash" title="Hash del último snapshot publicado">
            Snapshot {publishHash.slice(0, 12)}…
          </span>
        ) : (
          <span className="site-studio__publish-hash site-studio__publish-hash--muted">Sin publicar aún</span>
        )}
      </div>
      <div className="site-studio__preview-toggle" role="group" aria-label="Vista previa">
        <button
          type="button"
          className={`site-studio__preview-btn${previewMode === "desktop" ? " is-active" : ""}`}
          onClick={() => onPreviewModeChange("desktop")}
        >
          <Monitor size={14} aria-hidden />
          Desktop
        </button>
        <button
          type="button"
          className={`site-studio__preview-btn${previewMode === "mobile" ? " is-active" : ""}`}
          onClick={() => onPreviewModeChange("mobile")}
        >
          <Smartphone size={14} aria-hidden />
          Móvil
        </button>
      </div>
      <button
        type="button"
        className="site-studio__publish-btn"
        onClick={onPublish}
        disabled={!canPublish}
        title={canPublish ? "Publicar sitio" : "Añade al menos una sección para publicar"}
      >
        <Upload size={14} aria-hidden />
        {publishLabel}
      </button>
    </div>
  );
}
