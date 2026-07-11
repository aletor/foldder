"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LogoLabNav } from "../LogoLabNav";
import { bboxXYXYToCssPercent } from "@/lib/brandkit/logo-lab/bbox-overlay";
import type { GoldenDocument, GroundTruthLogo, DocumentResult } from "@/lib/brandkit/logo-lab/golden/types";
import "../logo-lab.css";

type AnnotatedLogo = GroundTruthLogo & { clientId: string };

type ManifestDoc = GoldenDocument & { pdfAvailable?: boolean };

function annotationKey(g: GroundTruthLogo): string {
  return `${g.page}:${g.bboxPage.map((v) => v.toFixed(4)).join(",")}:${g.role}`;
}

function withClientIds(items: GroundTruthLogo[], docId: string): AnnotatedLogo[] {
  return items.map((g, index) => ({
    ...g,
    clientId: `${docId}:${annotationKey(g)}:${index}`,
  }));
}

function formatBbox(b: readonly number[]): string {
  return b.map((v) => v.toFixed(3)).join(", ");
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function normalizeDragRect(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): [number, number, number, number] {
  return [
    clamp01(Math.min(x0, x1)),
    clamp01(Math.min(y0, y1)),
    clamp01(Math.max(x0, x1)),
    clamp01(Math.max(y0, y1)),
  ];
}

export function GoldenAnnotateView({
  initialDocId,
  inspectRunId,
}: {
  initialDocId?: string;
  inspectRunId?: string;
}) {
  const [documents, setDocuments] = useState<ManifestDoc[]>([]);
  const [docId, setDocId] = useState(initialDocId ?? "catalogo26");
  const [pageNumber, setPageNumber] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [groundTruth, setGroundTruth] = useState<AnnotatedLogo[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [inspectResult, setInspectResult] = useState<DocumentResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<[number, number, number, number] | null>(null);
  const [drawRole, setDrawRole] = useState<GroundTruthLogo["role"]>("primary");
  const [drawVariant, setDrawVariant] = useState<GroundTruthLogo["variant"]>("full");
  const stageRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const drawingRef = useRef<{ x: number; y: number } | null>(null);
  const draftRef = useRef<[number, number, number, number] | null>(null);
  const moveRef = useRef<{
    clientId: string;
    startX: number;
    startY: number;
    origBbox: [number, number, number, number];
  } | null>(null);
  const loadedDocRef = useRef<string | null>(null);

  const activeDoc = useMemo(
    () => documents.find((d) => d.id === docId) ?? null,
    [documents, docId],
  );

  const pageImageSrc = `/api/logo-lab/page?golden=${encodeURIComponent(docId)}&page=${pageNumber}`;

  const pageAnnotations = groundTruth.filter((g) => g.page === pageNumber);
  const documentAnnotations = groundTruth;

  const applyManifestDoc = useCallback((doc: ManifestDoc) => {
    loadedDocRef.current = doc.id;
    setGroundTruth(withClientIds(doc.groundTruth, doc.id));
    setSelectedClientId(null);
  }, []);

  const loadManifest = useCallback(async () => {
    const res = await fetch("/api/logo-lab/golden");
    const data = (await res.json()) as { documents: ManifestDoc[] };
    setDocuments(data.documents ?? []);
  }, []);

  useEffect(() => {
    void loadManifest();
  }, [loadManifest]);

  useEffect(() => {
    if (!docId) return;
    void fetch(`/api/logo-lab/golden/meta?doc=${encodeURIComponent(docId)}`)
      .then((r) => r.json())
      .then((meta: { totalPages?: number }) => {
        setTotalPages(Math.max(1, meta.totalPages ?? 1));
      })
      .catch(() => setTotalPages(1));
  }, [docId]);

  useEffect(() => {
    if (!activeDoc) return;
    if (loadedDocRef.current === activeDoc.id) return;
    applyManifestDoc(activeDoc);
  }, [activeDoc, applyManifestDoc]);

  useEffect(() => {
    if (!inspectRunId || !docId) {
      setInspectResult(null);
      return;
    }
    void fetch(`/api/logo-lab/benchmark?runId=${encodeURIComponent(inspectRunId)}`)
      .then((r) => r.json())
      .then((run: { perDocument?: DocumentResult[] }) => {
        setInspectResult(run.perDocument?.find((d) => d.docId === docId) ?? null);
      })
      .catch(() => setInspectResult(null));
  }, [inspectRunId, docId]);

  useEffect(() => {
    if (inspectRunId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.key === "Delete" || e.key === "Backspace") && selectedClientId) {
        e.preventDefault();
        setGroundTruth((prev) => prev.filter((g) => g.clientId !== selectedClientId));
        setSelectedClientId(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [inspectRunId, selectedClientId]);

  const pointerToNorm = (clientX: number, clientY: number): [number, number] | null => {
    const img = imgRef.current;
    if (!img) return null;
    const rect = img.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return [
      clamp01((clientX - rect.left) / rect.width),
      clamp01((clientY - rect.top) / rect.height),
    ];
  };

  const updateAnnotationBbox = (clientId: string, bboxPage: [number, number, number, number]) => {
    setGroundTruth((prev) =>
      prev.map((g) => (g.clientId === clientId ? { ...g, bboxPage } : g)),
    );
  };

  const onStagePointerDown = (e: React.PointerEvent) => {
    if (inspectRunId) return;
    if ((e.target as HTMLElement).closest(".logo-lab-bbox--gt-clickable")) return;
    const pt = pointerToNorm(e.clientX, e.clientY);
    if (!pt) return;
    drawingRef.current = { x: pt[0], y: pt[1] };
    const next: [number, number, number, number] = [pt[0], pt[1], pt[0], pt[1]];
    draftRef.current = next;
    setDraft(next);
    stageRef.current?.setPointerCapture(e.pointerId);
  };

  const onAnnotationPointerDown = (
    e: React.PointerEvent,
    annotation: AnnotatedLogo,
  ) => {
    if (inspectRunId) return;
    e.stopPropagation();
    e.preventDefault();
    setSelectedClientId(annotation.clientId);
    const pt = pointerToNorm(e.clientX, e.clientY);
    if (!pt) return;
    moveRef.current = {
      clientId: annotation.clientId,
      startX: pt[0],
      startY: pt[1],
      origBbox: [...annotation.bboxPage],
    };
    stageRef.current?.setPointerCapture(e.pointerId);
  };

  const onStagePointerMove = (e: React.PointerEvent) => {
    const move = moveRef.current;
    if (move) {
      const pt = pointerToNorm(e.clientX, e.clientY);
      if (!pt) return;
      const dx = pt[0] - move.startX;
      const dy = pt[1] - move.startY;
      const [x1, y1, x2, y2] = move.origBbox;
      const width = x2 - x1;
      const height = y2 - y1;
      let nx1 = x1 + dx;
      let ny1 = y1 + dy;
      nx1 = clamp01(Math.min(nx1, 1 - width));
      ny1 = clamp01(Math.min(ny1, 1 - height));
      updateAnnotationBbox(move.clientId, [nx1, ny1, nx1 + width, ny1 + height]);
      return;
    }

    const start = drawingRef.current;
    if (!start) return;
    const pt = pointerToNorm(e.clientX, e.clientY);
    if (!pt) return;
    const next = normalizeDragRect(start.x, start.y, pt[0], pt[1]);
    draftRef.current = next;
    setDraft(next);
  };

  const onStagePointerUp = () => {
    if (moveRef.current) {
      moveRef.current = null;
      draftRef.current = null;
      setDraft(null);
      return;
    }

    const start = drawingRef.current;
    drawingRef.current = null;
    const finalDraft = draftRef.current;
    draftRef.current = null;
    setDraft(null);
    if (!start || !finalDraft) return;

    const [x1, y1, x2, y2] = finalDraft;
    if (x2 - x1 < 0.005 || y2 - y1 < 0.005) return;

    setGroundTruth((prev) => [
      ...prev,
      {
        clientId: `${docId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
        page: pageNumber,
        bboxPage: [x1, y1, x2, y2],
        role: drawRole,
        variant: drawVariant,
      },
    ]);
  };

  const saveDocument = async () => {
    if (!activeDoc) return;
    setSaving(true);
    setError(null);
    setSaveMessage(null);
    try {
      const { pdfAvailable: _pdfAvailable, ...docBase } = activeDoc;
      const payload: GoldenDocument = {
        ...docBase,
        groundTruth: groundTruth.map(({ clientId: _id, ...g }) => ({
          ...g,
          bboxPage: [
            Math.round(g.bboxPage[0] * 1_000_000) / 1_000_000,
            Math.round(g.bboxPage[1] * 1_000_000) / 1_000_000,
            Math.round(g.bboxPage[2] * 1_000_000) / 1_000_000,
            Math.round(g.bboxPage[3] * 1_000_000) / 1_000_000,
          ] as [number, number, number, number],
        })),
      };

      const res = await fetch("/api/logo-lab/golden", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_document",
          document: payload,
        }),
      });
      const body = (await res.json()) as { error?: string; document?: GoldenDocument };
      if (!res.ok) {
        throw new Error(body.error ?? "save_failed");
      }
      if (!body.document) throw new Error("save_missing_document");

      const savedDoc: ManifestDoc = {
        ...body.document,
        pdfAvailable: activeDoc.pdfAvailable,
      };
      setDocuments((prev) => prev.map((d) => (d.id === savedDoc.id ? savedDoc : d)));
      applyManifestDoc(savedDoc);
      setSaveMessage(`guardado · ${body.document.groundTruth.length} anotaciones`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "save_failed");
    } finally {
      setSaving(false);
    }
  };

  const removeAnnotation = (clientId: string) => {
    setGroundTruth((prev) => prev.filter((g) => g.clientId !== clientId));
    setSelectedClientId((current) => (current === clientId ? null : current));
  };

  return (
    <div className="logo-lab">
      <header className="logo-lab-header">
        <div>
          <p className="logo-lab-kicker">brandKit · golden set</p>
          <h1 className="logo-lab-title">anotación GT</h1>
          <p className="logo-lab-subtitle">
            Dibuja rects en espacio de página (0–1). Solo guarda en desarrollo.
            {inspectRunId ? " Modo inspección: predicción verde + GT azul." : ""}
          </p>
        </div>
        <LogoLabNav />
      </header>

      {error ? <p className="logo-lab-error">{error}</p> : null}
      {saveMessage ? <p className="logo-lab-save-ok">{saveMessage}</p> : null}

      <div className="logo-lab-body">
        <aside className="logo-lab-sidebar">
          <p className="logo-lab-section-label">documento</p>
          <select
            className="logo-lab-select"
            value={docId}
            onChange={(e) => {
              setDocId(e.target.value);
              setPageNumber(1);
            }}
          >
            {documents.map((d) => (
              <option key={d.id} value={d.id} disabled={d.pdfAvailable === false}>
                {d.id}
                {d.pdfAvailable === false ? " (sin pdf)" : ""}
              </option>
            ))}
          </select>

          <p className="logo-lab-section-label logo-lab-section-label--spaced">página</p>
          <div className="logo-lab-page-nav">
            <button
              type="button"
              className="logo-lab-page-nav__btn"
              disabled={pageNumber <= 1}
              onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
            >
              ←
            </button>
            <span>
              {pageNumber} / {totalPages}
            </span>
            <button
              type="button"
              className="logo-lab-page-nav__btn"
              disabled={pageNumber >= totalPages}
              onClick={() => setPageNumber((p) => Math.min(totalPages, p + 1))}
            >
              →
            </button>
          </div>

          {!inspectRunId ? (
            <>
              <p className="logo-lab-section-label logo-lab-section-label--spaced">nueva anotación</p>
              <label className="logo-lab-field">
                role
                <select
                  value={drawRole}
                  onChange={(e) => setDrawRole(e.target.value as GroundTruthLogo["role"])}
                >
                  <option value="primary">primary</option>
                  <option value="secondary">secondary</option>
                </select>
              </label>
              <label className="logo-lab-field">
                variant
                <select
                  value={drawVariant ?? "full"}
                  onChange={(e) =>
                    setDrawVariant(e.target.value as NonNullable<GroundTruthLogo["variant"]>)
                  }
                >
                  <option value="full">full</option>
                  <option value="isotype">isotype</option>
                  <option value="wordmark">wordmark</option>
                </select>
              </label>
              <button type="button" className="logo-lab-upload__btn" disabled={saving} onClick={() => void saveDocument()}>
                {saving ? "guardando…" : "guardar manifest"}
              </button>
            </>
          ) : null}

          <p className="logo-lab-section-label logo-lab-section-label--spaced">
            anotaciones ({documentAnnotations.length})
          </p>
          <ul className="logo-lab-gt-list">
            {documentAnnotations.map((g) => (
              <li
                key={g.clientId}
                className={`logo-lab-gt-item${
                  selectedClientId === g.clientId ? " logo-lab-gt-item--selected" : ""
                }`}
              >
                <button
                  type="button"
                  className="logo-lab-gt-item__select"
                  onClick={() => {
                    setPageNumber(g.page);
                    setSelectedClientId(g.clientId);
                  }}
                >
                  <span>
                    pág. {g.page} · {g.role} · {g.variant ?? "—"}
                  </span>
                  <span className="logo-lab-gt-item__bbox">[{formatBbox(g.bboxPage)}]</span>
                </button>
                {!inspectRunId ? (
                  <button
                    type="button"
                    className="logo-lab-gt-item__delete"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      removeAnnotation(g.clientId);
                    }}
                  >
                    borrar
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
          {!inspectRunId && selectedClientId ? (
            <button
              type="button"
              className="logo-lab-gt-item__delete logo-lab-gt-item__delete--block"
              onClick={() => removeAnnotation(selectedClientId)}
            >
              borrar seleccionada
            </button>
          ) : null}
        </aside>

        <main className="logo-lab-main">
          <div className="logo-lab-viewer">
            <p className="logo-lab-viewer__title">frame batch · espacio de página</p>
            <div
              ref={stageRef}
              className={`logo-lab-viewer__stage${inspectRunId ? "" : " logo-lab-viewer__stage--draw"}`}
              onPointerDown={onStagePointerDown}
              onPointerMove={onStagePointerMove}
              onPointerUp={onStagePointerUp}
              onPointerCancel={onStagePointerUp}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={imgRef}
                src={pageImageSrc}
                alt={`pág. ${pageNumber}`}
                className="logo-lab-viewer__page"
                draggable={false}
              />
              <div className="logo-lab-viewer__overlay" aria-hidden>
                {pageAnnotations.map((g) => {
                  const rect = bboxXYXYToCssPercent(g.bboxPage);
                  return (
                    <div
                      key={g.clientId}
                      className={`logo-lab-bbox logo-lab-bbox--gt${
                        selectedClientId === g.clientId ? " logo-lab-bbox--selected" : ""
                      }${inspectRunId ? "" : " logo-lab-bbox--gt-clickable"}`}
                      style={{
                        left: rect.left,
                        top: rect.top,
                        width: rect.width,
                        height: rect.height,
                      }}
                      onPointerDown={
                        inspectRunId
                          ? undefined
                          : (e) => onAnnotationPointerDown(e, g)
                      }
                    >
                      <span className="logo-lab-bbox__label logo-lab-bbox__label--gt">{g.role}</span>
                    </div>
                  );
                })}
                {inspectResult?.predictedBboxPage &&
                inspectResult.predictedPage === pageNumber
                  ? (() => {
                      const rect = bboxXYXYToCssPercent(inspectResult.predictedBboxPage!);
                      return (
                        <div
                          className="logo-lab-bbox logo-lab-bbox--pred"
                          style={{
                            left: rect.left,
                            top: rect.top,
                            width: rect.width,
                            height: rect.height,
                          }}
                        />
                      );
                    })()
                  : null}
                {draft
                  ? (() => {
                      const rect = bboxXYXYToCssPercent(draft);
                      return (
                        <div
                          className="logo-lab-bbox logo-lab-bbox--draft"
                          style={{
                            left: rect.left,
                            top: rect.top,
                            width: rect.width,
                            height: rect.height,
                          }}
                        />
                      );
                    })()
                  : null}
              </div>
            </div>
            <p className="logo-lab-viewer__caption">
              pág. {pageNumber} · arrastra vacío=nuevo · arrastra recuadro=mover · guardar manifest persiste en disco
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
