"use client";

import React from "react";
import { Archive, Monitor, Smartphone, Upload, X } from "lucide-react";
import { resolveFoldderNodeStudioBackground } from "../studio-node/foldder-studio-node-backgrounds";
import type { SiteGraphConnectionStatus } from "@/lib/site/site-bindings";
import type { SitePreviewMode, ThemeState } from "@/lib/site/site-types";
import { SiteScrubNumberInput } from "./SiteScrubNumberInput";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function GraphPort({
  label,
  connected,
  detail,
}: {
  label: string;
  connected: boolean;
  detail: string;
}) {
  return (
    <span className={cx("site-studio__port", connected && "is-connected")} title={`${label}: ${detail}`}>
      <span className="site-studio__port-label">{label}</span>
      <span className="site-studio__port-detail">{detail}</span>
    </span>
  );
}

function SegGroup({
  children,
  "aria-label": ariaLabel,
}: {
  children: React.ReactNode;
  "aria-label"?: string;
}) {
  return (
    <div className="site-studio__seg" role="group" aria-label={ariaLabel}>
      {children}
    </div>
  );
}

function SegButton({
  active,
  onClick,
  children,
  title,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      className={cx("site-studio__seg-btn", active && "is-active")}
      onClick={onClick}
      title={title}
    >
      {children}
    </button>
  );
}

export function SiteStudioChrome({
  title,
  sectionCount,
  previewLocale,
  onClose,
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
  previewMode,
  onPreviewModeChange,
  publishLabel,
  onPublish,
  onExportZip,
  canPublish,
  publishHash,
  publicUrl,
  publishing,
  exporting,
  publishError,
  isStale,
}: {
  title: string;
  sectionCount: number;
  previewLocale: string;
  onClose: () => void;
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
  previewMode: SitePreviewMode;
  onPreviewModeChange: (mode: SitePreviewMode) => void;
  publishLabel: string;
  onPublish: () => void;
  onExportZip?: () => void;
  canPublish: boolean;
  publishHash?: string;
  publicUrl?: string;
  publishing?: boolean;
  exporting?: boolean;
  publishError?: string | null;
  isStale?: boolean;
}) {
  const finishPresets: Array<NonNullable<ThemeState["finishPreset"]>> = ["editorial", "impact", "minimal"];
  const rhythms: ThemeState["dials"]["rhythm"][] = ["compact", "normal", "airy"];
  const iconSrc = resolveFoldderNodeStudioBackground("site");

  return (
    <header className="site-studio__chrome" data-foldder-studio-header>
      {/* Fila 1 — identidad + publicación */}
      <div className="site-studio__chrome-row">
        <div className="site-studio__chrome-icon" aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={iconSrc} alt="" draggable={false} />
        </div>

        <div className="site-studio__chrome-title">
          <h1 className="site-studio__heading">{title}</h1>
          <p className="site-studio__meta">
            {sectionCount} sección{sectionCount === 1 ? "" : "es"} · {previewLocale}
            {brandConnected ? ` · ${brandName?.trim() || "Marca"}` : ""}
          </p>
        </div>

        <div className="site-studio__chrome-status">
          {isStale ? <span className="site-studio__status-warn">Sin publicar</span> : null}
          {publicUrl ? (
            <a className="site-studio__status-link" href={publicUrl} target="_blank" rel="noopener noreferrer">
              {publicUrl.replace(/^https?:\/\//, "")}
            </a>
          ) : (
            <span className="site-studio__status-muted">
              {publishHash ? `Snapshot ${publishHash.slice(0, 8)}` : "Borrador"}
            </span>
          )}
          {publishError ? <span className="site-studio__status-error">{publishError}</span> : null}
        </div>

        <SegGroup aria-label="Vista previa">
          <SegButton
            active={previewMode === "desktop"}
            onClick={() => onPreviewModeChange("desktop")}
            title="Vista escritorio"
          >
            <Monitor size={12} strokeWidth={2} aria-hidden />
            Desktop
          </SegButton>
          <SegButton
            active={previewMode === "mobile"}
            onClick={() => onPreviewModeChange("mobile")}
            title="Vista móvil"
          >
            <Smartphone size={12} strokeWidth={2} aria-hidden />
            Móvil
          </SegButton>
        </SegGroup>

        {onExportZip ? (
          <button
            type="button"
            className="site-studio__chrome-action"
            onClick={onExportZip}
            disabled={!canPublish || exporting || publishing}
            title="Exportar ZIP estático"
          >
            <Archive size={12} strokeWidth={2} aria-hidden />
            {exporting ? "…" : "ZIP"}
          </button>
        ) : null}

        <button
          type="button"
          className="site-studio__chrome-action site-studio__chrome-action--primary"
          onClick={onPublish}
          disabled={!canPublish || publishing || exporting}
          title="Publicar sitio"
        >
          <Upload size={12} strokeWidth={2} aria-hidden />
          {publishing ? "…" : publishLabel}
        </button>

        <button
          type="button"
          className="site-studio__chrome-close"
          onClick={onClose}
          aria-label="Cerrar"
          title="Cerrar"
        >
          <X size={14} strokeWidth={2.25} />
        </button>
      </div>

      {/* Fila 2 — grafo + tema */}
      <div className="site-studio__chrome-row site-studio__chrome-row--secondary">
        <div className="site-studio__chrome-graph">
          <GraphPort
            label="Dataset"
            connected={graphStatus.dataset.connected}
            detail={
              graphStatus.dataset.connected
                ? `${graphStatus.dataset.label ?? "Dataset"} · ${datasetLoading ? "…" : graphStatus.dataset.rowCount}`
                : "—"
            }
          />
          <GraphPort
            label="Contenido"
            connected={graphStatus.content.connected}
            detail={
              graphStatus.content.connected
                ? `${graphStatus.content.label ?? "Populate"} · ${graphStatus.content.itemCount}`
                : "—"
            }
          />
          <GraphPort
            label="Media"
            connected={graphStatus.media.connected}
            detail={
              graphStatus.media.connected
                ? `${graphStatus.media.label ?? "Media"}${graphStatus.media.hasUrl ? "" : " · sin URL"}`
                : "—"
            }
          />
        </div>

        {onApplyGraphBindings ? (
          <button
            type="button"
            className={cx("site-studio__chrome-text-btn", graphApplyPending && "is-pending")}
            disabled={!graphApplyPending}
            onClick={onApplyGraphBindings}
            title="Aplicar imágenes del grafo al borrador"
          >
            Aplicar grafo
          </button>
        ) : null}

        {onAutoGraphSyncChange ? (
          <label className="site-studio__chrome-check">
            <input
              type="checkbox"
              checked={autoGraphSync !== false}
              onChange={(event) => onAutoGraphSyncChange(event.target.checked)}
            />
            Sync auto
          </label>
        ) : null}

        {onFillBrandContent && brandConnected ? (
          <button type="button" className="site-studio__chrome-text-btn" onClick={onFillBrandContent}>
            Desde marca
          </button>
        ) : null}

        <span className="site-studio__chrome-divider" aria-hidden />

        <span className="site-studio__chrome-kicker">Acabado</span>
        <SegGroup aria-label="Preset de acabado">
          {finishPresets.map((preset) => (
            <SegButton
              key={preset}
              active={theme.finishPreset === preset}
              onClick={() => onFinishPreset(preset)}
            >
              {preset}
            </SegButton>
          ))}
        </SegGroup>

        <span className="site-studio__chrome-kicker">Ritmo</span>
        <SegGroup aria-label="Ritmo">
          {rhythms.map((rhythm) => (
            <SegButton key={rhythm} active={theme.dials.rhythm === rhythm} onClick={() => onRhythmChange(rhythm)}>
              {rhythm}
            </SegButton>
          ))}
        </SegGroup>

        <span className="site-studio__chrome-kicker">Motion</span>
        <div className="site-studio__chrome-motion">
          <SiteScrubNumberInput
            value={theme.dials.motionIntensity}
            min={0}
            max={2}
            step={1}
            roundFn={Math.round}
            onKeyboardCommit={(n) => onMotionIntensityChange(Math.min(2, Math.max(0, Math.round(n))) as 0 | 1 | 2)}
            onScrubLive={(n) =>
              onMotionIntensityChange(Math.min(2, Math.max(0, Math.round(n))) as 0 | 1 | 2)
            }
            onScrubEnd={() => {}}
            aria-label="Intensidad de motion"
          />
        </div>

        <span className="site-studio__chrome-motion-meta" title={motionDnaSource?.trim() || `DNA: ${theme.motionDNA}`}>
          {motionDnaSource?.trim() || theme.motionDNA}
        </span>
      </div>
    </header>
  );
}
