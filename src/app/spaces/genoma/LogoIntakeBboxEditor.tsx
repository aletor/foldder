"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BBoxPage } from "@/lib/genoma/logo-intake/bbox";
import {
  bboxPageToCssPercent,
  moveBBoxPage,
  normalizeBBoxPage,
  resizeBBoxPage,
  type BboxHandle,
} from "@/lib/genoma/logo-intake/bbox-ui";
import type { ValidateLogoIntakeResult } from "@/lib/genoma/logo-intake/service";
import type { Genome } from "@/lib/genoma/model/trait";
import {
  extractPreviewDataUrl,
  loadPageCanvas,
  trimBBoxOnPage,
} from "@/lib/genoma/logo-intake/bbox-editor-client";
import { cx, G } from "./face-utils";
import { GenomaMediaImage } from "./GenomaMediaImage";

const SAVE_BTN =
  "w-full border-2 border-[#FFBD1B] bg-[#FFBD1B] px-5 py-3 text-base font-semibold lowercase tracking-wide text-black shadow-lg shadow-[#FFBD1B]/20 transition hover:bg-[#e5aa18] disabled:cursor-not-allowed disabled:opacity-50";
const SECONDARY_BTN =
  "w-full border border-white/25 bg-white/5 px-5 py-2.5 text-sm lowercase tracking-wide text-white transition hover:border-white/50 hover:bg-white/10 disabled:opacity-50";

type EditPagePayload = {
  imageBase64: string;
  mime: string;
  width: number;
  height: number;
  bboxPage: BBoxPage;
  docName: string;
  page: number;
  candidateId: string;
};

const HANDLES: Exclude<BboxHandle, "move">[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

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

export function LogoIntakeBboxEditor({
  projectId,
  candidateId,
  genome,
  onClose,
  onValidated,
}: {
  projectId: string;
  candidateId: string;
  genome?: Genome;
  onClose: () => void;
  onValidated: (result: ValidateLogoIntakeResult) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState<EditPagePayload | null>(null);
  const [bboxPage, setBboxPage] = useState<BBoxPage>([0, 0, 1, 1]);
  const [previewUrl, setPreviewUrl] = useState("");
  const [viewMode, setViewMode] = useState<"full" | "logo">("full");
  const [busy, setBusy] = useState(false);

  const stageRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<{
    kind: BboxHandle;
    anchor: BBoxPage;
    orig: BBoxPage;
    startNorm?: { x: number; y: number };
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetch(
      `/api/genoma/logo-intake/edit-page?projectId=${encodeURIComponent(projectId)}&candidateId=${encodeURIComponent(candidateId)}`,
    )
      .then(async (res) => {
        const data = (await res.json()) as EditPagePayload & { error?: string };
        if (!res.ok) throw new Error(data.error ?? "edit_page_failed");
        if (cancelled) return;
        setPage(data);
        const canvas = await loadPageCanvas(data.imageBase64, data.mime, data.width, data.height);
        if (cancelled) return;
        canvasRef.current = canvas;
        const initialBbox = normalizeBBoxPage(data.bboxPage);
        const trimmed = trimBBoxOnPage({
          pageCanvas: canvas,
          pageWidth: data.width,
          pageHeight: data.height,
          bboxPage: initialBbox,
        });
        setBboxPage(trimmed ?? initialBbox);
        setLoading(false);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "edit_page_failed");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, candidateId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !page) return;
    setPreviewUrl(extractPreviewDataUrl(canvas, bboxPage, page.width, page.height));
  }, [bboxPage, page]);

  const onPointerDown = useCallback(
    (kind: BboxHandle) => (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const target = imgRef.current;
      if (!target) return;
      const norm = pointerToNorm(e.clientX, e.clientY, target);
      if (!norm) return;
      dragRef.current = {
        kind,
        anchor: [...bboxPage] as BBoxPage,
        orig: [...bboxPage] as BBoxPage,
        startNorm: norm,
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [bboxPage],
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const drag = dragRef.current;
    const target = imgRef.current;
    if (!drag || !target) return;
    const norm = pointerToNorm(e.clientX, e.clientY, target);
    if (!norm) return;

    if (drag.kind === "move" && drag.startNorm) {
      const dx = norm.x - drag.startNorm.x;
      const dy = norm.y - drag.startNorm.y;
      setBboxPage(moveBBoxPage(drag.orig, dx, dy));
      return;
    }

    if (drag.kind !== "move") {
      setBboxPage(resizeBBoxPage(drag.orig, drag.kind, norm, drag.anchor));
    }
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    dragRef.current = null;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
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

  const validate = useCallback(async () => {
    if (!page) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/genoma/logo-intake/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          candidateId: page.candidateId,
          adjustedBboxPage: normalizeBBoxPage(bboxPage),
          genome: genome ?? {},
        }),
      });
      const data = (await res.json()) as ValidateLogoIntakeResult & { error?: string };
      if (!res.ok || !data.state || !data.genome) throw new Error(data.error ?? "validate_failed");
      onValidated(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "validate_failed");
    } finally {
      setBusy(false);
    }
  }, [bboxPage, genome, onValidated, page, projectId]);

  const bboxCss = bboxPageToCssPercent(bboxPage);
  const logoScale =
    page && viewMode === "logo"
      ? Math.min(
          1 / Math.max(0.05, (bboxPage[2] - bboxPage[0]) * 1.4),
          1 / Math.max(0.05, (bboxPage[3] - bboxPage[1]) * 1.4),
          8,
        )
      : 1;
  const originX = `${(((bboxPage[0] + bboxPage[2]) / 2) * 100).toFixed(3)}%`;
  const originY = `${(((bboxPage[1] + bboxPage[3]) / 2) * 100).toFixed(3)}%`;

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-[#0d0d0f] text-white" role="dialog" aria-modal="true">
      <header className="flex shrink-0 items-center justify-between border-b border-white/10 px-6 py-4">
        <div>
          <p className="text-lg">Ajustar área</p>
          {page ? (
            <p className="text-sm text-white/50">
              {page.docName} · pág. {page.page}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={cx(SECONDARY_BTN, "w-auto shrink-0 px-4")}
            onClick={() => setViewMode("logo")}
            disabled={loading}
          >
            centrar en logo
          </button>
          <button
            type="button"
            className={cx(SECONDARY_BTN, "w-auto shrink-0 px-4")}
            onClick={() => setViewMode("full")}
            disabled={loading}
          >
            página completa
          </button>
          <button
            type="button"
            className={cx(SECONDARY_BTN, "w-auto shrink-0 px-4")}
            onClick={onClose}
          >
            cancelar
          </button>
        </div>
      </header>

      {error ? <p className="px-6 py-2 text-sm text-red-300">{error}</p> : null}

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div ref={stageRef} className="relative min-h-0 flex-1 overflow-auto bg-[#141416] p-4">
          {loading ? (
            <div className="flex h-full min-h-[40vh] items-center justify-center text-white/50">cargando página…</div>
          ) : page ? (
            <div
              className="mx-auto origin-top-left transition-transform duration-200"
              style={{
                transform: `scale(${logoScale})`,
                transformOrigin: `${originX} ${originY}`,
                width: "fit-content",
              }}
            >
              <div
                className="relative inline-block select-none touch-none"
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerLeave={onPointerUp}
              >
                <GenomaMediaImage
                  ref={imgRef}
                  src={`data:${page.mime};base64,${page.imageBase64}`}
                  alt=""
                  draggable={false}
                  className="block h-auto max-w-full"
                  width={page.width}
                  height={page.height}
                  eager
                />
                <div className="pointer-events-none absolute inset-0">
                  <div
                    className="pointer-events-auto absolute border-2 border-[#FFBD1B] bg-[#FFBD1B]/10"
                    style={bboxCss}
                    onPointerDown={onPointerDown("move")}
                  >
                    {HANDLES.map((handle) => (
                      <span
                        key={handle}
                        role="presentation"
                        className="absolute z-10 h-3 w-3 border border-black/40 bg-[#FFBD1B]"
                        style={{ ...handlePosition(handle), cursor: handleCursor(handle) }}
                        onPointerDown={onPointerDown(handle)}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <aside className="flex w-full shrink-0 flex-col gap-4 border-t border-white/10 bg-[#121214] p-6 lg:w-80 lg:border-t-0 lg:border-l">
          <p className={G.label}>preview del recorte</p>
          <div className="flex min-h-[120px] items-center justify-center border border-white/15 bg-white p-4">
            {previewUrl ? (
              <GenomaMediaImage src={previewUrl} alt="preview recorte" className="max-h-[28vh] max-w-full object-contain" eager />
            ) : (
              <span className="text-sm text-white/40">…</span>
            )}
          </div>
          <button
            type="button"
            disabled={loading || busy || !page}
            onClick={() => void validate()}
            className={SAVE_BTN}
          >
            {busy ? "guardando…" : "guardar recorte"}
          </button>
          <button
            type="button"
            disabled={loading || busy}
            onClick={trimToContent}
            className={SECONDARY_BTN}
          >
            ajustar a contenido
          </button>
          <p className="text-xs text-white/45">
            pulsa <span className="text-[#FFBD1B]">guardar recorte</span> para validar el logo del preview
          </p>
        </aside>
      </div>

      <footer className="shrink-0 border-t border-white/10 bg-[#0d0d0f] p-4 lg:hidden">
        <button
          type="button"
          disabled={loading || busy || !page}
          onClick={() => void validate()}
          className={SAVE_BTN}
        >
          {busy ? "guardando…" : "guardar recorte"}
        </button>
      </footer>
    </div>
  );
}
