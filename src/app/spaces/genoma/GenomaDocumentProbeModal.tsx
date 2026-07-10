"use client";

import React from "react";
import { createPortal } from "react-dom";
import { FileText, Loader2, X } from "lucide-react";
import type {
  GenomaDocumentProbeLogo,
  GenomaDocumentProbePagePreview,
  GenomaDocumentProbeResult,
} from "@/lib/genoma/studio/document-probe-types";

type GenomaDocumentProbeModalProps = {
  result: GenomaDocumentProbeResult | null;
  error: string | null;
  loading: boolean;
  onClose: () => void;
};

function formatBbox(logo: GenomaDocumentProbeResult["logos"][number]): string {
  const pct = (value: number) => `${Math.round(value * 1000) / 10}%`;
  return `${pct(logo.x)}, ${pct(logo.y)} · ${pct(logo.width)} × ${pct(logo.height)}`;
}

function previewForPrimaryLogo(
  primaryLogo: GenomaDocumentProbeLogo | null,
  previews: GenomaDocumentProbePagePreview[],
): { preview: GenomaDocumentProbePagePreview; logo: GenomaDocumentProbeLogo } | null {
  if (!primaryLogo || !previews.length) return null;
  const pageNumber = primaryLogo.page;
  const preview =
    previews.find((row) => row.pageNumber === pageNumber) ??
    previews.find((row) => row.pageNumber === null) ??
    null;
  if (!preview) return null;
  return { preview, logo: primaryLogo };
}

function isSameLogo(a: GenomaDocumentProbeLogo, b: GenomaDocumentProbeLogo): boolean {
  return (
    a.page === b.page &&
    a.x === b.x &&
    a.y === b.y &&
    a.width === b.width &&
    a.height === b.height &&
    a.label === b.label
  );
}

function bboxStyle(logo: GenomaDocumentProbeLogo): React.CSSProperties {
  return {
    left: `${logo.x * 100}%`,
    top: `${logo.y * 100}%`,
    width: `${logo.width * 100}%`,
    height: `${logo.height * 100}%`,
  };
}

function documentTypeLabel(type: string): string {
  const map: Record<string, string> = {
    pdf: "PDF",
    imagen: "Imagen",
    presentación: "Presentación",
    documento: "Documento",
    desconocido: "Desconocido",
  };
  return map[type.toLowerCase()] ?? type;
}

export function GenomaDocumentProbeModal({
  result,
  error,
  loading,
  onClose,
}: GenomaDocumentProbeModalProps) {
  if (!loading && !result && !error) return null;

  return createPortal(
    <>
      <button
        type="button"
        className="genoma-probe-modal__backdrop"
        aria-label="cerrar"
        onClick={onClose}
      />
      <div
        className="genoma-probe-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Vista rápida del documento"
      >
        <header className="genoma-probe-modal__header">
          <div className="genoma-probe-modal__header-main">
            <span className="genoma-probe-modal__badge">Modo prueba · 1 LLM</span>
            <h2 className="genoma-probe-modal__title">
              {result?.fileName ?? "Analizando documento…"}
            </h2>
            {result ? (
              <p className="genoma-probe-modal__subtitle">
                {result.model} · {(result.latencyMs / 1000).toFixed(1)} s
              </p>
            ) : null}
          </div>
          <button
            type="button"
            className="genoma-probe-modal__close"
            onClick={onClose}
            aria-label="cerrar"
          >
            <X size={18} strokeWidth={2} />
          </button>
        </header>

        {loading ? (
          <div className="genoma-probe-modal__loading" role="status">
            <Loader2 size={22} className="genoma-probe-modal__spinner" aria-hidden />
            <p>Leyendo el archivo y consultando el modelo…</p>
          </div>
        ) : null}

        {error ? (
          <div className="genoma-probe-modal__alert genoma-probe-modal__alert--error" role="alert">
            {error}
          </div>
        ) : null}

        {result ? (
          <div className="genoma-probe-modal__body">
            {(() => {
              const visual = previewForPrimaryLogo(result.primaryLogo, result.pagePreviews ?? []);
              if (!visual) return null;
              return (
                <section className="genoma-probe-modal__preview-panel" aria-label="Vista del logo principal">
                  <h3 className="genoma-probe-modal__panel-title">
                    Logo principal
                    {visual.preview.pageNumber ? (
                      <span className="genoma-probe-modal__logo-page">pág. {visual.preview.pageNumber}</span>
                    ) : null}
                  </h3>
                  <div className="genoma-probe-modal__preview-frame">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      className="genoma-probe-modal__preview-img"
                      src={`data:image/jpeg;base64,${visual.preview.jpegBase64}`}
                      alt={
                        visual.preview.pageNumber
                          ? `Página ${visual.preview.pageNumber}`
                          : "Vista del documento"
                      }
                    />
                    <div className="genoma-probe-modal__preview-overlay" aria-hidden>
                      <div
                        className="genoma-probe-modal__bbox"
                        style={bboxStyle(visual.logo)}
                        title={visual.logo.label ?? "Logo principal"}
                      />
                    </div>
                  </div>
                </section>
              );
            })()}

            <div className="genoma-probe-modal__type-card">
              <FileText size={18} aria-hidden className="genoma-probe-modal__type-icon" />
              <div>
                <span className="genoma-probe-modal__type-label">Tipo de documento</span>
                <strong className="genoma-probe-modal__type-value">
                  {documentTypeLabel(result.documentType)}
                </strong>
              </div>
            </div>

            <section className="genoma-probe-modal__panel">
              <h3 className="genoma-probe-modal__panel-title">
                Logos encontrados
                <span className="genoma-probe-modal__count">{result.logos.length}</span>
              </h3>
              {result.logos.length ? (
                <ul className="genoma-probe-modal__logo-list">
                  {result.logos.map((logo, index) => {
                    const isPrimary =
                      result.primaryLogo != null && isSameLogo(logo, result.primaryLogo);
                    return (
                    <li
                      key={`logo-${index}`}
                      className={`genoma-probe-modal__logo-row${isPrimary ? " is-primary" : ""}`}
                    >
                      <div className="genoma-probe-modal__logo-head">
                        <span className="genoma-probe-modal__logo-name">
                          {logo.label ?? `Logo ${index + 1}`}
                        </span>
                        <span className="genoma-probe-modal__logo-badges">
                          {isPrimary ? (
                            <span className="genoma-probe-modal__logo-primary">principal</span>
                          ) : null}
                          {logo.page ? (
                            <span className="genoma-probe-modal__logo-page">pág. {logo.page}</span>
                          ) : null}
                        </span>
                      </div>
                      <code className="genoma-probe-modal__logo-coords">{formatBbox(logo)}</code>
                    </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="genoma-probe-modal__empty">Ninguno detectado en las páginas enviadas.</p>
              )}
            </section>

            <section className="genoma-probe-modal__panel">
              <h3 className="genoma-probe-modal__panel-title">
                Colores principales
                <span className="genoma-probe-modal__count">{result.primaryColors.length}</span>
              </h3>
              {result.primaryColors.length ? (
                <ul className="genoma-probe-modal__color-grid">
                  {result.primaryColors.map((color) => (
                    <li key={color.hex} className="genoma-probe-modal__color-chip">
                      <span
                        className="genoma-probe-modal__swatch"
                        style={{ backgroundColor: color.hex }}
                        aria-hidden
                      />
                      <span className="genoma-probe-modal__color-hex">{color.hex}</span>
                      {color.label ? (
                        <span className="genoma-probe-modal__color-name">{color.label}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="genoma-probe-modal__empty">Sin colores dominantes claros.</p>
              )}
            </section>

            <section className="genoma-probe-modal__panel">
              <h3 className="genoma-probe-modal__panel-title">Resumen · 3 líneas</h3>
              <ol className="genoma-probe-modal__summary">
                {result.textSummary.map((line, index) => (
                  <li key={`summary-${index}`}>
                    <span className="genoma-probe-modal__summary-index">{index + 1}</span>
                    <span className="genoma-probe-modal__summary-text">{line || "—"}</span>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        ) : null}
      </div>
    </>,
    document.body,
  );
}
