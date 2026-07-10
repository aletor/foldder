"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { BBoxPage } from "@/lib/genoma/logo-intake/bbox";
import {
  bboxPageToCssPercent,
  moveBBoxPage,
  normalizeBBoxPage,
  resizeBBoxPage,
  type BboxHandle,
} from "@/lib/genoma/logo-intake/bbox-ui";
import { extractPreviewDataUrl, loadPageCanvas, trimBBoxOnPage } from "@/lib/genoma/logo-intake/bbox-editor-client";
import type { LogoValue } from "@/lib/genoma/genoma-types";
import { isValidBboxPage, logoSourceBboxToPageTuple } from "@/lib/genoma/genoma-logo-bbox";
import { genomaLocaleEs } from "@/lib/genoma/genoma-locale.es";
import { GenomaFoldderButton } from "./GenomaFoldderButton";
import { GenomaMediaImage } from "../GenomaMediaImage";
import { Check, X } from "lucide-react";

type EditPagePayload = {
  imageBase64: string;
  mime: string;
  width: number;
  height: number;
  page: number;
  bboxPage: BBoxPage;
};

const HANDLES: Exclude<BboxHandle, "move">[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

const ERROR_LABELS: Record<string, string> = {
  missing_fields: "Faltan datos para recortar el logo",
  invalid_bbox: "Área inválida — ajusta la caja amarilla",
  source_not_found: "No encuentro el archivo fuente en el servidor",
  pdf_not_found: "No encuentro el archivo fuente en el servidor",
  crop_failed: "No pude guardar el recorte",
  edit_page_failed: "No pude cargar la imagen fuente",
  missing_pdf_context: "Este logo no tiene archivo de origen guardado",
};

function formatEditorError(code: string): string {
  return ERROR_LABELS[code] ?? code;
}

function handleCursor(handle: Exclude<BboxHandle, "move">): string {
  const map: Record<Exclude<BboxHandle, "move">, string> = {
    nw: "nwse-resize",
    n: "ns-resize",
    ne: "nesw-resize",
    e: "ew-resize",
    se: "nwse-resize",
    s: "ns-resize",
    sw: "nesw-resize",
    w: "ew-resize",
  };
  return map[handle];
}

function handlePosition(handle: Exclude<BboxHandle, "move">): React.CSSProperties {
  const pos: Record<Exclude<BboxHandle, "move">, React.CSSProperties> = {
    nw: { left: 0, top: 0, transform: "translate(-50%, -50%)" },
    n: { left: "50%", top: 0, transform: "translate(-50%, -50%)" },
    ne: { right: 0, top: 0, transform: "translate(50%, -50%)" },
    e: { right: 0, top: "50%", transform: "translate(50%, -50%)" },
    se: { right: 0, bottom: 0, transform: "translate(50%, 50%)" },
    s: { left: "50%", bottom: 0, transform: "translate(-50%, 50%)" },
    sw: { left: 0, bottom: 0, transform: "translate(-50%, 50%)" },
    w: { left: 0, top: "50%", transform: "translate(-50%, -50%)" },
  };
  return pos[handle];
}

function pointerToNorm(clientX: number, clientY: number, el: HTMLElement): { x: number; y: number } | null {
  const rect = el.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  return {
    x: (clientX - rect.left) / rect.width,
    y: (clientY - rect.top) / rect.height,
  };
}

export function GenomaLogoBboxEditor({
  logo,
  onClose,
  onSaved,
}: {
  logo: LogoValue;
  onClose: () => void;
  onSaved: (logo: LogoValue) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState<EditPagePayload | null>(null);
  const [currentPageNumber, setCurrentPageNumber] = useState(logo.sourcePageNumber ?? 1);
  const [bboxPage, setBboxPage] = useState<BBoxPage>([0.04, 0.03, 0.32, 0.12]);
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<{
    kind: BboxHandle;
    anchor: BBoxPage;
    orig: BBoxPage;
    startNorm?: { x: number; y: number };
  } | null>(null);

  useEffect(() => {
    if (!logo.sourcePdfSha256 || !currentPageNumber) {
      setError(formatEditorError("missing_pdf_context"));
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    const bboxTuple =
      currentPageNumber === (logo.sourcePageNumber ?? 1) && logo.sourceBbox
        ? logoSourceBboxToPageTuple(logo.sourceBbox)
        : null;
    const params = new URLSearchParams({
      contentSha256: logo.sourcePdfSha256,
      pageNumber: String(currentPageNumber),
    });
    if (bboxTuple) params.set("bboxPage", JSON.stringify(bboxTuple));

    void fetch(`/api/spaces/genoma/logo-adjust/page?${params.toString()}`)
      .then(async (res) => {
        const data = (await res.json()) as EditPagePayload & { error?: string };
        if (!res.ok) throw new Error(data.error ?? "edit_page_failed");
        if (cancelled) return;
        setPage(data);
        setBboxPage(normalizeBBoxPage(data.bboxPage));
        canvasRef.current = await loadPageCanvas(data.imageBase64, data.mime, data.width, data.height);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const code = err instanceof Error ? err.message : "edit_page_failed";
          setError(formatEditorError(code));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [currentPageNumber, logo.sourceBbox, logo.sourcePageNumber, logo.sourcePdfSha256]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !page || !isValidBboxPage(normalizeBBoxPage(bboxPage))) {
      setPreviewUrl(null);
      return;
    }
    setPreviewUrl(
      extractPreviewDataUrl(canvas, bboxPage, page.width, page.height) || null,
    );
  }, [bboxPage, page]);

  const onPointerDown = useCallback(
    (kind: BboxHandle) => (event: React.PointerEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const target = imgRef.current;
      if (!target) return;
      const startNorm = kind === "move" ? pointerToNorm(event.clientX, event.clientY, target) ?? undefined : undefined;
      dragRef.current = {
        kind,
        anchor: [...bboxPage] as BBoxPage,
        orig: [...bboxPage] as BBoxPage,
        startNorm,
      };
      target.setPointerCapture(event.pointerId);
    },
    [bboxPage],
  );

  const onPointerMove = useCallback((event: React.PointerEvent) => {
    const drag = dragRef.current;
    const target = imgRef.current;
    if (!drag || !target) return;
    const norm = pointerToNorm(event.clientX, event.clientY, target);
    if (!norm) return;

    if (drag.kind === "move" && drag.startNorm) {
      const dx = norm.x - drag.startNorm.x;
      const dy = norm.y - drag.startNorm.y;
      setBboxPage(normalizeBBoxPage(moveBBoxPage(drag.orig, dx, dy)));
      return;
    }

    if (drag.kind !== "move") {
      setBboxPage(normalizeBBoxPage(resizeBBoxPage(drag.orig, drag.kind, norm, drag.anchor)));
    }
  }, []);

  const onPointerUp = useCallback((event: React.PointerEvent) => {
    dragRef.current = null;
    try {
      (event.target as HTMLElement).releasePointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
  }, []);

  const trimToContent = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !page) return;
    const trimmed = trimBBoxOnPage({
      pageCanvas: canvas,
      pageWidth: page.width,
      pageHeight: page.height,
      bboxPage,
    });
    if (trimmed) setBboxPage(trimmed);
  }, [bboxPage, page]);

  const save = useCallback(async () => {
    if (!logo.sourcePdfSha256 || !currentPageNumber) return;
    const normalized = normalizeBBoxPage(bboxPage);
    if (!isValidBboxPage(normalized)) {
      setError(formatEditorError("invalid_bbox"));
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/spaces/genoma/logo-adjust/crop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentSha256: logo.sourcePdfSha256,
          pageNumber: currentPageNumber,
          bboxPage: [...normalized],
          docName: logo.sourceDocName,
          previousLogo: logo,
        }),
      });
      const data = (await res.json()) as { logo?: LogoValue; error?: string };
      if (!res.ok || !data.logo) throw new Error(data.error ?? "crop_failed");
      onSaved(data.logo);
    } catch (err) {
      const code = err instanceof Error ? err.message : "crop_failed";
      setError(formatEditorError(code));
    } finally {
      setBusy(false);
    }
  }, [bboxPage, currentPageNumber, logo, onSaved]);

  const bboxCss = bboxPageToCssPercent(bboxPage);
  const totalPages = logo.totalDocPages ?? 0;
  const showPagePicker = totalPages > 1;
  const pageLabel = genomaLocaleEs.logoPageSignal(currentPageNumber, totalPages);

  return (
    <div className="genoma-v2-logo-adjust" role="dialog" aria-modal="true">
      <div className="genoma-v2-logo-adjust__header">
        <div>
          <p className="genoma-v2-logo-adjust__title">{genomaLocaleEs.adjustLogoArea}</p>
          {pageLabel ? <p className="genoma-v2-muted">{logo.sourceDocName ?? ""} · {pageLabel}</p> : null}
          {showPagePicker ? (
            <label className="genoma-v2-logo-adjust__page-picker">
              <span>{genomaLocaleEs.logoEditorPageLabel}</span>
              <select
                value={currentPageNumber}
                onChange={(event) => setCurrentPageNumber(Number(event.target.value))}
                disabled={busy || loading}
              >
                {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
                  <option key={pageNumber} value={pageNumber}>
                    {genomaLocaleEs.logoPageSignal(pageNumber, totalPages)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
        <button type="button" className="genoma-v2-icon-btn" onClick={onClose} aria-label="Cerrar">
          <X size={18} />
        </button>
      </div>

      {loading ? <p className="genoma-v2-muted">Cargando página…</p> : null}
      {error ? <p className="genoma-v2-error">{error}</p> : null}

      {!loading && page ? (
        <div className="genoma-v2-logo-adjust__body">
          <div className="genoma-v2-logo-adjust__stage">
            <div
              className="genoma-v2-logo-adjust__canvas"
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              <GenomaMediaImage
                ref={imgRef}
                src={`data:${page.mime};base64,${page.imageBase64}`}
                alt=""
                className="genoma-v2-logo-adjust__page"
                draggable={false}
                width={page.width}
                height={page.height}
                eager
              />
              <div className="genoma-v2-logo-adjust__overlay">
                <div
                  className="genoma-v2-logo-adjust__bbox"
                  style={bboxCss}
                  onPointerDown={onPointerDown("move")}
                >
                  {HANDLES.map((handle) => (
                    <span
                      key={handle}
                      role="presentation"
                      className="genoma-v2-logo-adjust__handle"
                      style={{ ...handlePosition(handle), cursor: handleCursor(handle) }}
                      onPointerDown={onPointerDown(handle)}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
          <aside className="genoma-v2-logo-adjust__preview">
            <p className="genoma-v2-logo-adjust__preview-label">{genomaLocaleEs.logoCropPreview}</p>
            <div className="genoma-v2-logo-adjust__preview-frame">
              {previewUrl ? (
                <GenomaMediaImage src={previewUrl} alt="" className="genoma-v2-logo-adjust__preview-img" eager />
              ) : (
                <span className="genoma-v2-muted">…</span>
              )}
            </div>
            <GenomaFoldderButton variant="muted" disabled={busy || loading} onClick={trimToContent}>
              {genomaLocaleEs.logoTrimToContent}
            </GenomaFoldderButton>
          </aside>
        </div>
      ) : null}

      <GenomaFoldderButton icon={Check} disabled={busy || loading || !page} onClick={() => void save()}>
        {genomaLocaleEs.confirmLogo}
      </GenomaFoldderButton>
    </div>
  );
}
