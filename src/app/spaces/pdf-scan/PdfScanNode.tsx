"use client";

/* eslint-disable @next/next/no-img-element */

import React, { memo, useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Position, useReactFlow, type NodeProps } from "@xyflow/react";
import { FileText, Loader2, ScanText, Type, Upload, VectorSquare } from "lucide-react";
import { FoldderDataHandle } from "../FoldderDataHandle";
import {
  FoldderNodeContentDock,
  FoldderNodeContentDockActions,
  FoldderNodeContentDockMain,
  FoldderNodeContentMeta,
  FoldderNodeContentMetaRow,
} from "../foldder-node-ui";
import { FoldderStudioHeader } from "../FoldderStudioHeader";
import { useStudioBodyLock } from "../studio-node/studio-node-architecture";
import { touchStudioNodeData } from "../studio-node/foldder-studio-touched";
import type { PdfScanMode, PdfScanNodeData } from "@/lib/pdf-scan/pdf-scan-types";
import { PDF_SCAN_MAX_FILE_BYTES, PDF_SCAN_OCR_MAX_PAGES, isPdfDocumentLayoutOutput } from "@/lib/pdf-scan/pdf-scan-types";
import { looksLikeScannedPdf } from "@/lib/pdf-scan/pdf-scan-ocr-heuristics";
import { buildMediaListFromPdfScanImages } from "./pdf-scan-to-designer";
import type { MediaListOutput } from "../media-list-output";
import {
  fetchPostWithWalletPreflight,
  notifyWalletFromApiResponse,
} from "@/lib/wallet-fetch-preflight";
import "../spaces.css";

type StageResult = {
  source: NonNullable<PdfScanNodeData["source"]>;
};

type AnalyzeResult = {
  jobId: string;
  mode: PdfScanMode;
  source: NonNullable<PdfScanNodeData["source"]>;
  scan: NonNullable<PdfScanNodeData["scan"]>;
  images: NonNullable<PdfScanNodeData["images"]>;
  textPreview: NonNullable<PdfScanNodeData["textPreview"]>;
  fidelity?: PdfScanNodeData["fidelity"];
  output: NonNullable<PdfScanNodeData["output"]>;
};

async function stagePdfFile(file: File): Promise<StageResult> {
  const body = new FormData();
  body.append("mode", "stage");
  body.append("file", file);
  const res = await fetch("/api/spaces/pdf-scan", { method: "POST", body });
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    source?: PdfScanNodeData["source"];
  };
  if (!res.ok || !json.ok || !json.source) {
    throw new Error(json.error || `Error ${res.status} al subir el PDF`);
  }
  return { source: json.source };
}

async function analyzeStagedPdf(args: {
  source: NonNullable<PdfScanNodeData["source"]>;
  mode: PdfScanMode;
}): Promise<AnalyzeResult> {
  const body = new FormData();
  body.append("mode", args.mode);
  body.append("s3Key", args.source.s3Key);
  body.append("contentSha256", args.source.contentSha256);
  body.append("fileName", args.source.fileName);
  body.append("byteSize", String(args.source.byteSize));
  if (args.source.url) body.append("sourceUrl", args.source.url);

  const res = await fetch("/api/spaces/pdf-scan", { method: "POST", body });
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    jobId?: string;
    mode?: PdfScanMode;
    source?: PdfScanNodeData["source"];
    scan?: PdfScanNodeData["scan"];
    images?: PdfScanNodeData["images"];
    textPreview?: PdfScanNodeData["textPreview"];
    fidelity?: PdfScanNodeData["fidelity"];
    output?: PdfScanNodeData["output"];
  };
  if (!res.ok || !json.ok || !json.jobId || !json.source || !json.scan || !json.output) {
    throw new Error(json.error || `Error ${res.status} al analizar el PDF`);
  }
  return {
    jobId: json.jobId,
    mode: json.mode === "document" ? "document" : "texts",
    source: json.source,
    scan: json.scan,
    images: json.images ?? [],
    textPreview: json.textPreview ?? [],
    fidelity: json.fidelity,
    output: json.output,
  };
}

async function runOcrOnStagedPdf(args: {
  source: NonNullable<PdfScanNodeData["source"]>;
  pagesDone?: number[];
}): Promise<AnalyzeResult & { warning?: string; ocr?: PdfScanNodeData["ocr"] }> {
  const res = await fetchPostWithWalletPreflight("/api/spaces/pdf-scan/ocr", {
    s3Key: args.source.s3Key,
    contentSha256: args.source.contentSha256,
    fileName: args.source.fileName,
    byteSize: args.source.byteSize,
    sourceUrl: args.source.url,
    maxPages: PDF_SCAN_OCR_MAX_PAGES,
    pagesDone: args.pagesDone ?? [],
  });
  await notifyWalletFromApiResponse(res);
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    warning?: string;
    jobId?: string;
    mode?: PdfScanMode;
    source?: PdfScanNodeData["source"];
    scan?: PdfScanNodeData["scan"];
    images?: PdfScanNodeData["images"];
    textPreview?: PdfScanNodeData["textPreview"];
    fidelity?: PdfScanNodeData["fidelity"];
    output?: PdfScanNodeData["output"];
    ocr?: PdfScanNodeData["ocr"];
  };
  if (!res.ok || !json.ok || !json.jobId || !json.source || !json.scan || !json.output) {
    throw new Error(json.error || `Error ${res.status} en OCR`);
  }
  return {
    jobId: json.jobId,
    mode: "texts",
    source: json.source,
    scan: json.scan,
    images: json.images ?? [],
    textPreview: json.textPreview ?? [],
    fidelity: json.fidelity,
    output: json.output,
    warning: json.warning,
    ocr: json.ocr ?? json.scan.ocr,
  };
}

function Prop({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-white/10 bg-white/[0.03] px-3 py-2">
      <dt className="text-[9px] font-bold uppercase tracking-[0.1em] text-white/40">{label}</dt>
      <dd className="mt-1 text-[13px] font-semibold text-white/88">{value}</dd>
    </div>
  );
}

function PdfScanStudio({
  data,
  nodeLabel,
  busy,
  busyLabel,
  error,
  onClose,
  onPickFile,
  onAnalyze,
  onOcr,
}: {
  data: PdfScanNodeData;
  nodeLabel: string;
  busy: boolean;
  busyLabel: string;
  error: string | null;
  onClose: () => void;
  onPickFile: (file: File) => void;
  onAnalyze: (mode: PdfScanMode) => void;
  onOcr: () => void;
}) {
  useStudioBodyLock(true);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const scan = data.scan;
  const images = data.images ?? [];
  const staged = data.status === "staged" && Boolean(data.source);
  const ready = data.status === "ready" && Boolean(scan);

  return createPortal(
    <div
      className="fixed inset-0 z-[100090] flex flex-col bg-[#0b0f14] text-white"
      data-foldder-studio-panel
      data-foldder-pdf-scan-studio
    >
      <FoldderStudioHeader
        nodeType="pdfScan"
        nodeLabel={nodeLabel}
        subtitle={
          scan
            ? `${scan.pageCount} hojas · ${scan.dpi} ppp · ${scan.mode === "document" ? "Documento" : "Textos"}`
            : staged
              ? "Elige cómo interpretar el PDF"
              : "Suelta un PDF"
        }
        onClose={onClose}
      />
      <div className="custom-scrollbar mx-auto min-h-0 w-full max-w-3xl flex-1 overflow-y-auto p-4">
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onPickFile(file);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
          }}
          onDrop={(e) => {
            e.preventDefault();
            const file = Array.from(e.dataTransfer.files).find(
              (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"),
            );
            if (file) onPickFile(file);
          }}
          className="flex w-full flex-col items-center justify-center gap-3 border border-dashed border-white/20 bg-white/[0.03] px-6 py-10 text-center transition hover:border-white/35 hover:bg-white/[0.05] disabled:opacity-60"
        >
          {busy ? (
            <Loader2 className="animate-spin text-slate-300" size={28} />
          ) : (
            <Upload className="text-slate-300" size={28} />
          )}
          <p className="text-[13px] font-semibold text-white/80">
            {busy ? busyLabel : data.source ? "Sustituir PDF" : "Suelta un PDF aquí"}
          </p>
          <p className="text-[11px] text-white/40">
            Máx. {Math.round(PDF_SCAN_MAX_FILE_BYTES / (1024 * 1024))} MB · sin IA en el núcleo
          </p>
        </button>

        {(error || data.error) && (
          <div className="mt-3 border border-rose-500/30 bg-rose-500/15 px-3 py-2 text-[11px] font-semibold text-rose-100">
            {error || data.error}
          </div>
        )}

        {staged || ready ? (
          <div className="mt-5 space-y-3">
            <div className="border border-white/10 bg-white/[0.03] px-3 py-3">
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-white/45">Archivo</p>
              <p className="mt-1 text-[13px] font-semibold text-white/88">{data.source?.fileName}</p>
              <p className="text-[11px] text-white/40">
                {Math.round((data.source?.byteSize ?? 0) / 1024)} KB
                {ready && data.mode ? ` · modo ${data.mode === "document" ? "Documento editable" : "Textos editables"}` : ""}
              </p>
            </div>

            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-white/45">
              {ready ? "Reprocesar" : "Interpretación"}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => onAnalyze("texts")}
                className="flex flex-col items-start gap-2 border border-white/15 bg-white/[0.04] px-4 py-4 text-left transition hover:border-sky-400/40 hover:bg-sky-500/10 disabled:opacity-50"
              >
                <Type size={18} className="text-sky-300" />
                <span className="text-[13px] font-bold text-white/90">Textos editables</span>
                <span className="text-[11px] leading-snug text-white/45">
                  Fondo limpio + campos de texto. Ideal para documentos y copy.
                </span>
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => onAnalyze("document")}
                className="flex flex-col items-start gap-2 border border-white/15 bg-white/[0.04] px-4 py-4 text-left transition hover:border-emerald-400/40 hover:bg-emerald-500/10 disabled:opacity-50"
              >
                <VectorSquare size={18} className="text-emerald-300" />
                <span className="text-[13px] font-bold text-white/90">Documento editable</span>
                <span className="text-[11px] leading-snug text-white/45">
                  Vectores + texto + imágenes como capas Freehand (máxima editabilidad).
                </span>
              </button>
            </div>
          </div>
        ) : null}

        {ready && scan ? (
          <div className="mt-4 space-y-2">
            {looksLikeScannedPdf({
              pageCount: scan.pageCount,
              textSpanCount: scan.textSpanCount,
            }) ? (
              <p className="text-[11px] text-amber-200/80">
                Parece un escaneo (poco texto nativo). OCR es opcional y de pago.
              </p>
            ) : null}
            <button
              type="button"
              disabled={busy}
              onClick={() => onOcr()}
              className="flex w-full items-start gap-3 border border-amber-400/35 bg-amber-500/10 px-4 py-3 text-left transition hover:border-amber-300/50 hover:bg-amber-500/15 disabled:opacity-50"
            >
              <ScanText size={18} className="mt-0.5 shrink-0 text-amber-200" />
              <span>
                <span className="block text-[13px] font-bold text-white/90">
                  OCR (escaneo) · pago
                </span>
                <span className="mt-1 block text-[11px] leading-snug text-white/45">
                  Gemini · 1 llamada por página (máx. {PDF_SCAN_OCR_MAX_PAGES}). Confirmarás el coste en
                  wallet. Sin reintentos automáticos.
                  {data.ocr?.pagesDone?.length
                    ? ` Hechas: ${data.ocr.pagesDone.join(", ")}.`
                    : ""}
                </span>
              </span>
            </button>
          </div>
        ) : null}

        {scan ? (
          <div className="mt-5 space-y-4">
            <h3 className="text-[10px] font-black uppercase tracking-[0.12em] text-white/45">Propiedades</h3>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Prop label="Hojas" value={String(scan.pageCount)} />
              <Prop label="Tamaño (px)" value={`${scan.widthPx} × ${scan.heightPx}`} />
              <Prop label="ppp" value={String(scan.dpi)} />
              <Prop label="Campos de texto" value={String(scan.textSpanCount)} />
              <Prop label="Imágenes" value={String(scan.imageCount)} />
              <Prop label="Paths" value={String(scan.pathCount ?? 0)} />
            </dl>

            {data.fidelity ? (
              <div className="border border-white/10 bg-white/[0.03] px-3 py-3 text-[11px] text-white/55">
                <p className="text-[10px] font-black uppercase tracking-[0.12em] text-white/45">Fidelidad</p>
                <p className="mt-1">
                  {data.fidelity.textFieldCount} textos · {data.fidelity.pathCount} paths ·{" "}
                  {data.fidelity.imageLayerCount} imágenes
                  {typeof data.fidelity.groupCount === "number"
                    ? ` · ${data.fidelity.groupCount} grupos`
                    : ""}
                  {typeof data.fidelity.softMaskHits === "number" && data.fidelity.softMaskHits > 0
                    ? ` · ${data.fidelity.softMaskHits} soft masks`
                    : ""}
                </p>
                {typeof data.fidelity.qaScore === "number" ? (
                  <p className="mt-1">
                    SSIM {(data.fidelity.qaScore * 100).toFixed(1)}%
                    {typeof data.fidelity.fallbackRegionCount === "number"
                      ? ` · ${data.fidelity.fallbackRegionCount} fallbacks`
                      : ""}
                  </p>
                ) : null}
                {data.fidelity.notes[0] ? <p className="mt-1 text-white/40">{data.fidelity.notes[0]}</p> : null}
                {data.fidelity.notes[1] ? <p className="mt-1 text-white/35">{data.fidelity.notes[1]}</p> : null}
              </div>
            ) : null}

            {images.length > 0 ? (
              <div>
                <p className="mb-2 text-[10px] font-black uppercase tracking-[0.12em] text-white/45">
                  Imágenes detectadas
                </p>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {images.map((img) => (
                    <div
                      key={img.id}
                      className="relative h-20 w-20 shrink-0 overflow-hidden border border-white/10 bg-black/40"
                      title={`p${img.page} · ${img.width}×${img.height}`}
                    >
                      <img src={img.thumbUrl || img.url} alt="" className="h-full w-full object-contain" />
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <p className="text-[11px] leading-relaxed text-white/40">
              Conecta <span className="text-white/70">Image Layout</span> a Designer, o{" "}
              <span className="text-white/70">Export Multimedia</span> para descargar imágenes.
            </p>
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

export const PdfScanNode = memo(function PdfScanNode({ id, data, selected }: NodeProps) {
  const nodeData = data as PdfScanNodeData;
  const { setNodes } = useReactFlow();
  const [studioOpen, setStudioOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState("Procesando…");
  const [localError, setLocalError] = useState<string | null>(null);

  const patchData = useCallback(
    (patch: Partial<PdfScanNodeData>) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id
            ? {
                ...n,
                data: touchStudioNodeData(n.data as Record<string, unknown>, patch as Record<string, unknown>),
              }
            : n,
        ),
      );
    },
    [id, setNodes],
  );

  const handleFile = useCallback(
    async (file: File) => {
      if (file.size > PDF_SCAN_MAX_FILE_BYTES) {
        setLocalError(`PDF demasiado grande (máx. ${Math.round(PDF_SCAN_MAX_FILE_BYTES / (1024 * 1024))} MB).`);
        return;
      }
      setBusy(true);
      setBusyLabel("Subiendo PDF…");
      setLocalError(null);
      try {
        const staged = await stagePdfFile(file);
        patchData({
          status: "staged",
          source: staged.source,
          mode: undefined,
          scan: undefined,
          images: undefined,
          textPreview: undefined,
          fidelity: undefined,
          ocr: undefined,
          output: undefined,
          value: undefined,
          mediaListOutput: undefined,
          jobId: undefined,
          error: undefined,
          label: staged.source.fileName.replace(/\.pdf$/i, "") || "PDFScan",
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "No se pudo subir el PDF.";
        setLocalError(message);
        patchData({ status: "error", error: message });
      } finally {
        setBusy(false);
      }
    },
    [patchData],
  );

  const handleAnalyze = useCallback(
    async (mode: PdfScanMode) => {
      const source = nodeData.source;
      if (!source?.s3Key) {
        setLocalError("Primero suelta un PDF.");
        return;
      }
      setBusy(true);
      setBusyLabel(mode === "document" ? "Compilando documento…" : "Extrayendo textos…");
      setLocalError(null);
      patchData({ status: "scanning", mode, error: undefined });
      try {
        const result = await analyzeStagedPdf({ source, mode });
        const mediaListOutput: MediaListOutput = buildMediaListFromPdfScanImages({
          nodeId: id,
          jobId: result.jobId,
          title: result.source.fileName,
          images: result.images,
        });
        patchData({
          status: "ready",
          mode: result.mode,
          jobId: result.jobId,
          source: result.source,
          scan: result.scan,
          images: result.images,
          textPreview: result.textPreview,
          fidelity: result.fidelity ?? (result.output && "fidelity" in result.output ? result.output.fidelity : undefined),
          output: result.output,
          value: result.output,
          type: "image_layout",
          mediaListOutput,
          error: undefined,
          label: result.source.fileName.replace(/\.pdf$/i, "") || "PDFScan",
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "No se pudo analizar el PDF.";
        setLocalError(message);
        patchData({ status: nodeData.source ? "staged" : "error", error: message });
      } finally {
        setBusy(false);
      }
    },
    [id, nodeData.source, patchData],
  );

  const handleOcr = useCallback(async () => {
    const source = nodeData.source;
    if (!source?.s3Key) {
      setLocalError("Primero suelta un PDF.");
      return;
    }
    setBusy(true);
    setBusyLabel("OCR (pago)…");
    setLocalError(null);
    patchData({ status: "scanning", error: undefined });
    try {
      const result = await runOcrOnStagedPdf({
        source,
        pagesDone: nodeData.ocr?.pagesDone ?? nodeData.scan?.ocr?.pagesDone,
      });
      const mediaListOutput: MediaListOutput = buildMediaListFromPdfScanImages({
        nodeId: id,
        jobId: result.jobId,
        title: result.source.fileName,
        images: result.images,
      });
      patchData({
        status: "ready",
        mode: "texts",
        jobId: result.jobId,
        source: result.source,
        scan: result.scan,
        images: result.images,
        textPreview: result.textPreview,
        fidelity: result.fidelity,
        ocr: result.ocr,
        output: result.output,
        value: result.output,
        type: "image_layout",
        mediaListOutput,
        error: result.warning || undefined,
        label: result.source.fileName.replace(/\.pdf$/i, "") || "PDFScan",
      });
      if (result.warning) setLocalError(result.warning);
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo completar el OCR.";
      setLocalError(message);
      patchData({ status: nodeData.scan ? "ready" : nodeData.source ? "staged" : "error", error: message });
    } finally {
      setBusy(false);
    }
  }, [id, nodeData.ocr?.pagesDone, nodeData.scan, nodeData.source, patchData]);

  const ready = nodeData.status === "ready" && Boolean(nodeData.scan);
  const staged = nodeData.status === "staged" && Boolean(nodeData.source);
  const previewUrl =
    nodeData.output && isPdfDocumentLayoutOutput(nodeData.output)
      ? nodeData.output.pages[0]?.previewUrl
      : nodeData.output && "pages" in nodeData.output
        ? (nodeData.output.pages[0] as { backgroundUrl?: string })?.backgroundUrl
        : undefined;
  const label = nodeData.label?.trim() || "PDFScan";

  return (
    <div
      className={`custom-node foldder-node--frameless node--media pdf-scan-node ${selected ? "selected" : ""} ${
        ready ? "pdf-scan-node--ready" : "pdf-scan-node--empty"
      }`}
      style={{ ["--foldder-node-card-bg" as string]: "#64748b", width: "100%", height: "100%", minWidth: 200, minHeight: 160 }}
    >
      <div className="node-content foldder-frameless-main relative flex h-full min-h-0 flex-col overflow-hidden">
        {previewUrl ? (
          <img src={previewUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-85" draggable={false} />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 bg-[#1e293b] text-white/55">
            <FileText size={28} />
            <span className="text-[10px] font-black uppercase tracking-[0.1em]">PDFScan</span>
          </div>
        )}
        <div className="relative mt-auto">
          <FoldderNodeContentDock allowNodeDrag>
            <FoldderNodeContentDockMain>
              <FoldderNodeContentMeta>
                <FoldderNodeContentMetaRow label="PDF" value={label} />
                {nodeData.scan ? (
                  <FoldderNodeContentMetaRow
                    label="Scan"
                    value={`${nodeData.mode === "document" ? "Doc" : "Txt"} · ${nodeData.scan.pageCount} pág · ${nodeData.scan.textSpanCount} txt`}
                  />
                ) : staged ? (
                  <FoldderNodeContentMetaRow label="Estado" value="Listo para interpretar" />
                ) : (
                  <FoldderNodeContentMetaRow label="Estado" value={busy ? busyLabel : "Vacío"} />
                )}
              </FoldderNodeContentMeta>
            </FoldderNodeContentDockMain>
            <FoldderNodeContentDockActions>
              <button
                type="button"
                className="foldder-node-content-dock-btn nodrag"
                onClick={() => setStudioOpen(true)}
              >
                {ready ? "Abrir" : staged ? "Interpretar" : "PDF"}
              </button>
            </FoldderNodeContentDockActions>
          </FoldderNodeContentDock>
        </div>
      </div>

      <div className="handle-wrapper handle-right" style={{ top: "38%" }}>
        <span className="handle-label text-slate-300">Image Layout</span>
        <FoldderDataHandle type="source" position={Position.Right} id="layout" dataType="generic" />
      </div>
      <div className="handle-wrapper handle-right" style={{ top: "62%" }}>
        <span className="handle-label text-amber-300">Export Multimedia</span>
        <FoldderDataHandle type="source" position={Position.Right} id="media_list" dataType="generic" />
      </div>

      {studioOpen && typeof document !== "undefined" ? (
        <PdfScanStudio
          data={nodeData}
          nodeLabel={label}
          busy={busy}
          busyLabel={busyLabel}
          error={localError}
          onClose={() => setStudioOpen(false)}
          onPickFile={(file) => void handleFile(file)}
          onAnalyze={(mode) => void handleAnalyze(mode)}
          onOcr={() => void handleOcr()}
        />
      ) : null}
    </div>
  );
});
