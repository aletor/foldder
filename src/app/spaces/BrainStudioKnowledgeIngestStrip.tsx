"use client";

import { BookOpen, Plus } from "lucide-react";
import { MAX_KNOWLEDGE_DOC_BYTES } from "./project-assets-metadata";

export type BrainStudioKnowledgeIngestStripProps = {
  /** Bloquea toda la ingesta mientras corre la cola (subida, URL o análisis). */
  pipelineLocked: boolean;
  /** Tareas pendientes en cola (incluye la que se está ejecutando hasta que termine el lote). */
  pipelineQueueCount: number;
  /** Paso actual de la cola (subida, análisis, visión); vacío si no hay actividad. */
  pipelineDetail?: string;
  onClearPozo: () => void;
  clearDisabled: boolean;
  imageDocCount: number;
  imageKnowledgeAnalyzed: number;
  pdfDocCount: number;
  pdfAnalyzed: number;
  documentTotal: number;
  urlCount: number;
  isDraggingCoreFiles: boolean;
  setIsDraggingCoreFiles: (v: boolean) => void;
  isDraggingContextFiles: boolean;
  setIsDraggingContextFiles: (v: boolean) => void;
  /** Tras soltar o elegir archivos: subida + análisis automáticos (cola). */
  onCoreFilesSelected: (files: File[]) => void;
  onContextFilesSelected: (files: File[]) => void;
  urlDraftCore: string;
  setUrlDraftCore: (v: string) => void;
  urlDraftContext: string;
  setUrlDraftContext: (v: string) => void;
  onAddUrl: (scope: "core" | "context") => void;
};

const ingestLockCls = "pointer-events-none cursor-not-allowed opacity-55";

function pickFilesFromDataTransfer(dt: DataTransfer | null): File[] {
  if (!dt?.files?.length) return [];
  return Array.from(dt.files);
}

export function BrainStudioKnowledgeIngestStrip({
  pipelineLocked,
  pipelineQueueCount,
  pipelineDetail = "",
  onClearPozo,
  clearDisabled,
  imageDocCount,
  imageKnowledgeAnalyzed,
  pdfDocCount,
  pdfAnalyzed,
  documentTotal,
  urlCount,
  isDraggingCoreFiles,
  setIsDraggingCoreFiles,
  isDraggingContextFiles,
  setIsDraggingContextFiles,
  onCoreFilesSelected,
  onContextFilesSelected,
  urlDraftCore,
  setUrlDraftCore,
  urlDraftContext,
  setUrlDraftContext,
  onAddUrl,
}: BrainStudioKnowledgeIngestStripProps) {
  const queueHint =
    pipelineQueueCount > 1
      ? `${pipelineQueueCount} tareas en cola`
      : pipelineQueueCount === 1
        ? "1 tarea en cola"
        : null;
  const imagePending = Math.max(0, imageDocCount - imageKnowledgeAnalyzed);
  const pdfPending = Math.max(0, pdfDocCount - pdfAnalyzed);
  const maxMb = Math.round(MAX_KNOWLEDGE_DOC_BYTES / 1024 / 1024);

  const openFilePicker = (scope: "core" | "context") => {
    if (pipelineLocked) return;
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = ".pdf,.docx,.txt,.md,.rtf,.jpg,.jpeg,.png,.webp";
    input.onchange = () => {
      if (input.files?.length) {
        const fn = scope === "core" ? onCoreFilesSelected : onContextFilesSelected;
        fn(Array.from(input.files));
      }
    };
    input.click();
  };

  return (
    <section
      aria-label="Documentación recibida e ingesta"
      className={`mb-4 space-y-3 rounded-[5px] border border-sky-200/90 bg-gradient-to-b from-sky-50/80 to-white px-3 py-3 sm:px-4 ${
        pipelineLocked ? "relative" : ""
      }`}
    >
      {pipelineLocked ? (
        <div className="mb-2 rounded-[5px] border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-snug text-amber-950">
          <p>
            <span className="font-bold">Subiendo o analizando</span>
            {queueHint ? ` · ${queueHint}` : ""}. Espera a que termine (sin reintentos automáticos: el error se muestra en
            toast o en la barra superior).
          </p>
          {pipelineDetail.trim() ? (
            <p className="mt-1.5 border-t border-amber-200/80 pt-1.5 text-[10.5px] font-medium text-amber-900/95">
              {pipelineDetail.trim()}
            </p>
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-wrap items-start gap-3 border-b border-sky-200/60 pb-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[5px] border border-sky-200 bg-white">
          <BookOpen className="h-5 w-5 text-sky-600" strokeWidth={1.5} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-black uppercase tracking-[0.14em] text-zinc-900">Documentación recibida</h2>
          <p className="mt-1 text-[12px] leading-relaxed text-zinc-600">
            Al <span className="font-semibold text-zinc-800">soltar o elegir</span> archivos se suben y se analizan en
            segundo plano (texto e imágenes). Si hay imágenes en el pozo, al terminar el análisis se actualiza también la
            capa visual sin pasos extra. Las URLs se procesan al pulsar <span className="font-semibold">Añadir</span>.
          </p>
        </div>
      </div>

      <div className={`grid grid-cols-1 gap-4 lg:grid-cols-2 ${pipelineLocked ? ingestLockCls : ""}`}>
        <div className="rounded-[5px] border border-sky-200 bg-white p-3 sm:p-4">
          <p className="mb-1 text-[11px] font-black uppercase tracking-wide text-sky-700">Ingesta empresa (CORE)</p>
          <p className="mb-2 text-[11px] text-zinc-600">Documentos propios · tono · verdad de marca</p>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              if (!pipelineLocked) setIsDraggingCoreFiles(true);
            }}
            onDragLeave={() => setIsDraggingCoreFiles(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDraggingCoreFiles(false);
              if (pipelineLocked) return;
              const files = pickFilesFromDataTransfer(e.dataTransfer);
              if (files.length) onCoreFilesSelected(files);
            }}
            onClick={() => openFilePicker("core")}
            className={`flex min-h-[100px] cursor-pointer flex-col items-center justify-center rounded-[5px] border-2 border-dashed px-3 py-5 text-center ${
              isDraggingCoreFiles ? "border-sky-400 bg-sky-50" : "border-zinc-200 bg-zinc-50 hover:border-zinc-300"
            }`}
          >
            <Plus className="mb-1.5 h-6 w-6 text-zinc-400" aria-hidden />
            <span className="text-[12px] font-semibold text-zinc-700">Arrastra o pulsa · CORE</span>
            <span className="mt-1 text-[10px] text-zinc-500">Sube y analiza al instante · máx {maxMb} MB</span>
          </div>
          <div className="mt-2 flex gap-2">
            <input
              value={urlDraftCore}
              onChange={(e) => setUrlDraftCore(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !pipelineLocked && (e.preventDefault(), onAddUrl("core"))}
              disabled={pipelineLocked}
              placeholder="https://…"
              className="min-w-0 flex-1 rounded-[5px] border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-[12px] disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => onAddUrl("core")}
              disabled={!urlDraftCore.trim() || pipelineLocked}
              className="rounded-[5px] border border-sky-500/50 bg-sky-50 px-2.5 py-1.5 text-[10px] font-bold uppercase text-sky-800 disabled:opacity-50"
            >
              Añadir
            </button>
          </div>
        </div>

        <div className="rounded-[5px] border border-amber-200 bg-white p-3 sm:p-4">
          <p className="mb-1 text-[11px] font-black uppercase tracking-wide text-amber-700">Ingesta contexto (mercado)</p>
          <p className="mb-2 text-[11px] text-zinc-600">Benchmarks · competencia (no contamina tono)</p>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              if (!pipelineLocked) setIsDraggingContextFiles(true);
            }}
            onDragLeave={() => setIsDraggingContextFiles(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDraggingContextFiles(false);
              if (pipelineLocked) return;
              const files = pickFilesFromDataTransfer(e.dataTransfer);
              if (files.length) onContextFilesSelected(files);
            }}
            onClick={() => openFilePicker("context")}
            className={`flex min-h-[100px] cursor-pointer flex-col items-center justify-center rounded-[5px] border-2 border-dashed px-3 py-5 text-center ${
              isDraggingContextFiles ? "border-amber-400 bg-amber-50" : "border-zinc-200 bg-zinc-50 hover:border-zinc-300"
            }`}
          >
            <Plus className="mb-1.5 h-6 w-6 text-zinc-400" aria-hidden />
            <span className="text-[12px] font-semibold text-zinc-700">Arrastra o pulsa · contexto</span>
            <span className="mt-1 text-[10px] text-zinc-500">Sube y analiza al instante · máx {maxMb} MB</span>
          </div>
          <div className="mt-2 flex gap-2">
            <input
              value={urlDraftContext}
              onChange={(e) => setUrlDraftContext(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !pipelineLocked && (e.preventDefault(), onAddUrl("context"))}
              disabled={pipelineLocked}
              placeholder="https://…"
              className="min-w-0 flex-1 rounded-[5px] border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-[12px] disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => onAddUrl("context")}
              disabled={!urlDraftContext.trim() || pipelineLocked}
              className="rounded-[5px] border border-amber-500/50 bg-amber-50 px-2.5 py-1.5 text-[10px] font-bold uppercase text-amber-800 disabled:opacity-50"
            >
              Añadir
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-[5px] border border-zinc-200/90 bg-white/90 px-3 py-2.5">
        <p className="text-[10px] font-black uppercase tracking-[0.12em] text-zinc-600">Resumen recibido en el pozo</p>
        <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-[11px] leading-snug text-zinc-800">
          <li>
            {documentTotal} archivo{documentTotal === 1 ? "" : "s"} en bandeja
            {urlCount > 0 ? (
              <>
                {" "}
                · {urlCount} enlace{urlCount === 1 ? "" : "s"}
              </>
            ) : null}
          </li>
          <li>
            {imageDocCount} imagen{imageDocCount === 1 ? "" : "es"} como documentación ({imageKnowledgeAnalyzed}{" "}
            analizada{imageKnowledgeAnalyzed === 1 ? "" : "s"}
            {imageDocCount > 0 ? ` · ${imagePending} sin analizar` : ""})
          </li>
          <li>
            {pdfDocCount} PDF ({pdfAnalyzed} analizado{pdfAnalyzed === 1 ? "" : "s"}
            {pdfDocCount > 0 ? ` · ${pdfPending} sin analizar` : ""})
          </li>
        </ul>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onClearPozo}
            disabled={clearDisabled}
            className="rounded-[5px] border border-rose-200 bg-rose-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-rose-900 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Vaciar pozo
          </button>
        </div>
      </div>
    </section>
  );
}
