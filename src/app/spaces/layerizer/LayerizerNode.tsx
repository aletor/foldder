"use client";

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Position,
  useEdges,
  useNodes,
  useReactFlow,
  type NodeProps,
  type Node,
} from "@xyflow/react";
import { ChevronRight, Eye, Layers, Loader2, Maximize2, Scissors, Send, Sparkles, Type, Wand2, X } from "lucide-react";
import { runAiJobWithNotification } from "@/lib/ai-job-notifications";
import { resolvePromptValueFromEdgeSource } from "../canvas-group-logic";
import { FoldderDataHandle } from "../FoldderDataHandle";
import { NodeIcon, resolveFoldderNodeState } from "../foldder-icons";
import { FoldderNodeHeaderTitle, NodeLabel } from "../foldder-node-ui";
import { useRegisterAssistantNodeRun } from "../use-assistant-node-run";
import { layerizerCostBreakdown } from "@/lib/layerizer/layerizer-cost";
import type {
  DetectedObject,
  LayerizerJobStatus,
  LayerizerNodeData,
  LayerizerOutput,
  LayerizerStreamEvent,
  SelectedObject,
} from "./layerizer-types";

const PROGRESS_STEPS: Array<{ status: LayerizerJobStatus; label: string }> = [
  { status: "segmenting", label: "Segmentando" },
  { status: "matting", label: "Recortando" },
  { status: "compositing_bg", label: "Fondo limpio" },
  { status: "amodal", label: "Completando" },
  { status: "assembling", label: "Montando" },
];

function usd(n: number): string {
  return `$${n.toFixed(3)}`;
}

/** Intersección sobre unión de dos bboxes [x,y,w,h]. */
function iou(a: [number, number, number, number], b: [number, number, number, number]): number {
  const ix = Math.max(a[0], b[0]);
  const iy = Math.max(a[1], b[1]);
  const ix2 = Math.min(a[0] + a[2], b[0] + b[2]);
  const iy2 = Math.min(a[1] + a[3], b[1] + b[3]);
  const iw = Math.max(0, ix2 - ix);
  const ih = Math.max(0, iy2 - iy);
  const inter = iw * ih;
  const uni = a[2] * a[3] + b[2] * b[3] - inter;
  return uni > 0 ? inter / uni : 0;
}

/** Fusiona detecciones nuevas evitando duplicados (IoU alto con un sujeto existente). */
function mergeDetected(prev: DetectedObject[], found: DetectedObject[]): DetectedObject[] {
  const result = [...prev];
  for (const f of found) {
    const dup = result.some((p) => !p.parentId && iou(p.bbox, f.bbox) > 0.6);
    if (!dup) result.push(f);
  }
  return result;
}

/** Fusiona bloques de texto nuevos evitando duplicados por IoU. */
function mergeTextDetected(prev: DetectedObject[], found: DetectedObject[]): DetectedObject[] {
  const result = [...prev];
  for (const f of found) {
    const dup = result.some((p) => p.isText && iou(p.bbox, f.bbox) > 0.5);
    if (!dup) result.push({ ...f, isText: true });
  }
  return result;
}

export const LayerizerNode = memo(function LayerizerNode({ id, data, selected }: NodeProps) {
  const nodeData = data as LayerizerNodeData;
  const nodes = useNodes();
  const edges = useEdges();
  const { setNodes } = useReactFlow();

  const [open, setOpen] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [detectingText, setDetectingText] = useState(false);
  const [detected, setDetected] = useState<DetectedObject[]>(nodeData.detected ?? []);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [amodalIds, setAmodalIds] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ status: LayerizerJobStatus; message?: string } | null>(null);
  const [output, setOutput] = useState<LayerizerOutput | null>(nodeData.output ?? null);
  const [error, setError] = useState<string | null>(null);
  const [maskPreviews, setMaskPreviews] = useState<Record<string, string>>({});
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [analyzingRegion, setAnalyzingRegion] = useState(false);
  // Aspect ratio (w/h) de la imagen conectada, para que la tarjeta se adapte.
  const [imgAR, setImgAR] = useState<number | null>(null);

  const toggleExpand = useCallback((subjectId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(subjectId)) next.delete(subjectId);
      else next.add(subjectId);
      return next;
    });
  }, []);

  const inputImage = useMemo(() => {
    const incoming = edges.filter((e) => e.target === id);
    for (const edge of incoming) {
      const val = resolvePromptValueFromEdgeSource(edge, nodes);
      if (typeof val === "string" && val.trim()) return val.trim();
    }
    return "";
  }, [edges, id, nodes]);

  const patchData = useCallback(
    (patch: Partial<LayerizerNodeData>) => {
      setNodes((nds) =>
        nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)) as Node[],
      );
    },
    [id, setNodes],
  );

  const selectedObjects = useMemo<SelectedObject[]>(() => {
    return detected
      .filter((d) => selectedIds.has(d.id))
      .map((d) => ({
        id: d.id,
        label: d.label,
        prompt: { kind: "box" as const, box: d.bbox },
        amodalComplete: amodalIds.has(d.id),
        parentId: d.parentId,
        isText: d.isText,
      }));
  }, [detected, selectedIds, amodalIds]);

  const cost = useMemo(() => layerizerCostBreakdown(selectedObjects), [selectedObjects]);

  const detect = useCallback(async () => {
    if (!inputImage) {
      setError("Conecta una imagen a la entrada.");
      return;
    }
    setError(null);
    setDetecting(true);
    try {
      const res = await fetch("/api/spaces/layerizer/detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: inputImage }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Detección fallida");
      const objs = (json.objects ?? []) as DetectedObject[];
      setDetected(objs);
      setDims({ w: json.width, h: json.height });
      setSelectedIds(new Set());
      patchData({ detected: objs, masterUrl: inputImage });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDetecting(false);
    }
  }, [inputImage, patchData]);

  const detectText = useCallback(async () => {
    if (!inputImage) {
      setError("Conecta una imagen a la entrada.");
      return;
    }
    setError(null);
    setDetectingText(true);
    try {
      const res = await fetch("/api/spaces/layerizer/detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: inputImage, mode: "text" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Detección de texto fallida");
      const found = (json.objects ?? []) as DetectedObject[];
      if (found.length === 0) {
        setError("No se encontraron bloques de texto.");
        return;
      }
      setDetected((prev) => {
        const merged = mergeTextDetected(prev, found);
        patchData({ detected: merged, masterUrl: inputImage });
        return merged;
      });
      if (json.width && json.height) setDims({ w: json.width, h: json.height });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDetectingText(false);
    }
  }, [inputImage, patchData]);

  const analyzeRegion = useCallback(
    async (region: [number, number, number, number]) => {
      if (!inputImage) {
        setError("Conecta una imagen a la entrada.");
        return;
      }
      setError(null);
      setAnalyzingRegion(true);
      try {
        const res = await fetch("/api/spaces/layerizer/detect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: inputImage, region }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "Análisis local fallido");
        const found = (json.objects ?? []) as DetectedObject[];
        if (found.length === 0) {
          setError("No se encontraron objetos en el área.");
          return;
        }
        setDetected((prev) => {
          const merged = mergeDetected(prev, found);
          patchData({ detected: merged, masterUrl: inputImage });
          return merged;
        });
        if (json.width && json.height) setDims({ w: json.width, h: json.height });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setAnalyzingRegion(false);
      }
    },
    [inputImage, patchData],
  );

  const toggleSelect = useCallback((objId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(objId)) next.delete(objId);
      else next.add(objId);
      return next;
    });
  }, []);

  const toggleAmodal = useCallback((objId: string) => {
    setAmodalIds((prev) => {
      const next = new Set(prev);
      if (next.has(objId)) next.delete(objId);
      else next.add(objId);
      return next;
    });
  }, []);

  const previewMask = useCallback(
    async (objId: string) => {
      const obj = detected.find((d) => d.id === objId);
      if (!obj || !inputImage) return;
      setPreviewingId(objId);
      try {
        const res = await fetch("/api/spaces/layerizer/preview-mask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: inputImage, prompt: { kind: "box", box: obj.bbox } }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "Preview falló");
        if (typeof json.maskDataUrl === "string") {
          setMaskPreviews((prev) => ({ ...prev, [objId]: json.maskDataUrl }));
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setPreviewingId(null);
      }
    },
    [detected, inputImage],
  );

  const extract = useCallback(async () => {
    if (!inputImage || selectedObjects.length === 0) {
      setError("Selecciona al menos un objeto.");
      return;
    }
    setError(null);
    setRunning(true);
    setOutput(null);
    setProgress({ status: "queued", message: "Encolando" });
    const ok = await runAiJobWithNotification({ nodeId: id, label: "Extract Layout" }, async () => {
      const res = await fetch("/api/spaces/layerizer/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: inputImage,
          selected: selectedObjects,
        }),
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || `Extract falló (${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line) continue;
          const ev = JSON.parse(line) as LayerizerStreamEvent;
          if (ev.type === "progress") {
            setProgress({ status: ev.status, message: ev.message });
          } else if (ev.type === "done") {
            setOutput(ev.output);
            patchData({
              output: ev.output,
              value: ev.output,
              jobId: ev.jobId,
              status: ev.status,
              type: "image_layout",
            });
          } else if (ev.type === "error") {
            throw new Error(ev.message);
          }
        }
      }
    });
    setRunning(false);
    setProgress(null);
    if (!ok) setError("La extracción falló. Revisa el saldo o reintenta.");
  }, [inputImage, selectedObjects, id, patchData]);

  useRegisterAssistantNodeRun(id, extract);

  const activeStepIndex = progress
    ? PROGRESS_STEPS.findIndex((s) => s.status === progress.status)
    : -1;

  const previewUrl = output?.background?.url || inputImage || nodeData.masterUrl;

  useEffect(() => {
    if (!previewUrl) setImgAR(null);
  }, [previewUrl]);

  return (
    <div
      className="custom-node foldder-node--frameless node--media group/node"
      style={{
        width: 260,
        minWidth: 220,
        // Con imagen: la tarjeta adopta su aspect ratio (sin marco/letterbox).
        // Sin imagen: altura mínima para el placeholder "Connect an image".
        ...(imgAR ? { aspectRatio: String(imgAR), minHeight: 0 } : { minHeight: 150 }),
        "--foldder-frameless-accent": "#a855f7",
      } as React.CSSProperties}
    >
      <NodeLabel id={id} label={nodeData.label} defaultLabel="Layerizer" />

      <div className="handle-wrapper handle-left">
        <FoldderDataHandle type="target" position={Position.Left} id="image" dataType="image" />
        <span className="handle-label text-emerald-400">Image</span>
      </div>

      <div className="node-header">
        <NodeIcon
          type="layerizer"
          selected={selected}
          state={resolveFoldderNodeState({ loading: running, done: Boolean(output) })}
          size={16}
        />
        <FoldderNodeHeaderTitle>Layerizer</FoldderNodeHeaderTitle>
      </div>

      <div className="node-content foldder-frameless-main">
        {previewUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={previewUrl}
            draggable={false}
            onLoad={(e) => {
              const t = e.currentTarget;
              if (t.naturalWidth > 0 && t.naturalHeight > 0) {
                setImgAR(t.naturalWidth / t.naturalHeight);
              }
            }}
            className="pointer-events-none absolute inset-0 h-full w-full object-contain opacity-90"
            alt="Layerizer input"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-white/40">
            <Layers size={22} />
            <span className="text-[8px] font-black uppercase tracking-[0.2em]">Connect an image</span>
          </div>
        )}

        {output ? (
          <div className="foldder-frameless-secondary-panel nodrag flex flex-col gap-1 text-[8px] text-white/80">
            <span className="font-black uppercase tracking-[0.15em] text-purple-300">
              {output.layers.length} capas + fondo
            </span>
          </div>
        ) : null}

        <button onClick={() => setOpen(true)} disabled={!inputImage} className="execute-btn nodrag">
          <Maximize2 size={13} />
          <span>Open Layerizer</span>
        </button>
      </div>

      <div className="handle-wrapper handle-right">
        <span className="handle-label text-purple-400">Image Layout</span>
        <FoldderDataHandle type="source" position={Position.Right} id="layout" dataType="generic" />
      </div>

      {open && typeof document !== "undefined"
        ? createPortal(
            <LayerizerFullscreen
              inputImage={inputImage}
              detected={detected}
              dims={dims}
              detecting={detecting}
              detectingText={detectingText}
              selectedIds={selectedIds}
              amodalIds={amodalIds}
              running={running}
              progress={progress}
              output={output}
              error={error}
              cost={cost}
              activeStepIndex={activeStepIndex}
              maskPreviews={maskPreviews}
              previewingId={previewingId}
              expandedIds={expandedIds}
              analyzingRegion={analyzingRegion}
              onDetect={detect}
              onDetectText={detectText}
              onAnalyzeRegion={analyzeRegion}
              onToggleSelect={toggleSelect}
              onToggleAmodal={toggleAmodal}
              onToggleExpand={toggleExpand}
              onPreviewMask={previewMask}
              onExtract={extract}
              onClose={() => setOpen(false)}
            />,
            document.body,
          )
        : null}
    </div>
  );
});

interface FullscreenProps {
  inputImage: string;
  detected: DetectedObject[];
  dims: { w: number; h: number } | null;
  detecting: boolean;
  detectingText: boolean;
  selectedIds: Set<string>;
  amodalIds: Set<string>;
  running: boolean;
  progress: { status: LayerizerJobStatus; message?: string } | null;
  output: LayerizerOutput | null;
  error: string | null;
  cost: ReturnType<typeof layerizerCostBreakdown>;
  activeStepIndex: number;
  maskPreviews: Record<string, string>;
  previewingId: string | null;
  expandedIds: Set<string>;
  analyzingRegion: boolean;
  onDetect: () => void;
  onDetectText: () => void;
  onAnalyzeRegion: (region: [number, number, number, number]) => void;
  onToggleSelect: (id: string) => void;
  onToggleAmodal: (id: string) => void;
  onToggleExpand: (id: string) => void;
  onPreviewMask: (id: string) => void;
  onExtract: () => void;
  onClose: () => void;
}

interface ObjectRowProps {
  obj: DetectedObject;
  isPart: boolean;
  selected: boolean;
  amodal: boolean;
  previewing: boolean;
  hasPreview: boolean;
  expandable: boolean;
  expanded: boolean;
  partsBadge: string | null;
  onToggleSelect: (id: string) => void;
  onToggleAmodal: (id: string) => void;
  onToggleExpand: (id: string) => void;
  onPreviewMask: (id: string) => void;
}

function ObjectRow(props: ObjectRowProps) {
  const {
    obj, isPart, selected, amodal, previewing, hasPreview,
    expandable, expanded, partsBadge,
    onToggleSelect, onToggleAmodal, onToggleExpand, onPreviewMask,
  } = props;

  const accentPreview = hasPreview
    ? obj.isText
      ? "bg-cyan-500/30 text-cyan-200"
      : isPart
        ? "bg-sky-500/30 text-sky-200"
        : "bg-purple-500/30 text-purple-200"
    : "bg-white/10 text-white/40";
  const rowAccent = obj.isText
    ? selected
      ? "border-cyan-500/60 bg-cyan-500/10"
      : "border-cyan-500/30 border-dashed bg-cyan-500/5"
    : selected
      ? isPart
        ? "border-sky-500/60 bg-sky-500/10"
        : "border-purple-500/60 bg-purple-500/10"
      : "border-white/10 bg-white/5";
  return (
    <div className={`flex items-center justify-between gap-2 rounded-md border px-2.5 py-2 ${rowAccent}`}>
      <div className="flex flex-1 items-center gap-1.5 overflow-hidden">
        {expandable ? (
          <button
            onClick={() => onToggleExpand(obj.id)}
            title={expanded ? "Colapsar partes" : "Ver partes"}
            className="shrink-0 rounded p-0.5 text-white/50 hover:bg-white/10 hover:text-white"
          >
            <ChevronRight size={13} className={`transition-transform ${expanded ? "rotate-90" : ""}`} />
          </button>
        ) : (
          <span className="w-[18px] shrink-0" />
        )}
        <button onClick={() => onToggleSelect(obj.id)} className="flex flex-1 items-center gap-2 overflow-hidden text-left">
          {obj.isText ? (
            <Type size={12} className={selected ? "text-cyan-300" : "text-white/40"} />
          ) : (
            <Scissors
              size={12}
              className={selected ? (isPart ? "text-sky-300" : "text-purple-300") : "text-white/40"}
            />
          )}
          <span className={`truncate ${isPart ? "text-[11px] text-white/80" : "text-xs"}`}>{obj.label}</span>
          {obj.isText ? (
            <span className="shrink-0 rounded bg-cyan-500/20 px-1 text-[8px] font-bold text-cyan-300">texto</span>
          ) : null}
          {obj.manual ? (
            <span className="shrink-0 rounded bg-amber-500/20 px-1 text-[8px] font-bold text-amber-300">manual</span>
          ) : null}
          {partsBadge ? (
            <span className="shrink-0 rounded bg-white/10 px-1 text-[8px] text-white/50">{partsBadge}</span>
          ) : null}
        </button>
      </div>
      {selected && !obj.isText ? (
        <>
          <button
            onClick={() => onPreviewMask(obj.id)}
            disabled={previewing}
            title="Previsualizar máscara de selección (SAM)"
            className={`flex items-center gap-1 rounded px-1.5 py-1 text-[8px] font-bold uppercase tracking-wider disabled:opacity-50 ${accentPreview}`}
          >
            {previewing ? <Loader2 size={10} className="animate-spin" /> : <Eye size={10} />}
            máscara
          </button>
          <button
            onClick={() => onToggleAmodal(obj.id)}
            title="Completar zonas ocultas (amodal)"
            className={`flex items-center gap-1 rounded px-1.5 py-1 text-[8px] font-bold uppercase tracking-wider ${
              amodal ? "bg-amber-500/30 text-amber-200" : "bg-white/10 text-white/40"
            }`}
          >
            <Wand2 size={10} /> amodal
          </button>
        </>
      ) : null}
    </div>
  );
}

function LayerizerFullscreen(props: FullscreenProps) {
  const {
    inputImage, detected, dims, detecting, detectingText, selectedIds, amodalIds, running, progress,
    output, error, cost, activeStepIndex,
    maskPreviews, previewingId, expandedIds, analyzingRegion,
    onDetect, onDetectText, onAnalyzeRegion, onToggleSelect, onToggleAmodal, onToggleExpand, onPreviewMask, onExtract, onClose,
  } = props;

  const W = dims?.w || 1;
  const H = dims?.h || 1;

  // Agrupa por sujeto: nivel 0 (sin parentId) con sus partes (parentId === sujeto).
  const subjects = detected.filter((d) => !d.parentId);
  const partsOf = (subjectId: string) => detected.filter((d) => d.parentId === subjectId);

  // --- Dibujo de área manual (arrastrar sobre el lienzo) ---
  const frameRef = useRef<HTMLDivElement | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const draggedRef = useRef(false);
  const [drawRect, setDrawRect] = useState<[number, number, number, number] | null>(null);
  const [pendingRect, setPendingRect] = useState<[number, number, number, number] | null>(null);

  const toImgPx = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } => {
      const r = frameRef.current?.getBoundingClientRect();
      if (!r) return { x: 0, y: 0 };
      const x = Math.max(0, Math.min(W, ((clientX - r.left) / r.width) * W));
      const y = Math.max(0, Math.min(H, ((clientY - r.top) / r.height) * H));
      return { x, y };
    },
    [W, H],
  );

  const onFramePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0 || analyzingRegion) return;
      draggedRef.current = false;
      // No iniciar dibujo si se pulsa un control (etiquetas de caja, barra de acción):
      // dejar que el botón reciba su click.
      if ((e.target as HTMLElement).closest("button")) return;
      const p = toImgPx(e.clientX, e.clientY);
      dragStartRef.current = p;
      setPendingRect(null);
    },
    [toImgPx, analyzingRegion],
  );

  const onFramePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const start = dragStartRef.current;
      if (!start) return;
      const p = toImgPx(e.clientX, e.clientY);
      const dx = Math.abs(p.x - start.x);
      const dy = Math.abs(p.y - start.y);
      if (!draggedRef.current && dx < 6 && dy < 6) return; // umbral: distinguir clic de arrastre
      if (!draggedRef.current) {
        // Captura SOLO al confirmar arrastre real, para no robar clicks a los botones.
        draggedRef.current = true;
        try { frameRef.current?.setPointerCapture(e.pointerId); } catch { /* noop */ }
      }
      const x = Math.min(start.x, p.x);
      const y = Math.min(start.y, p.y);
      setDrawRect([Math.round(x), Math.round(y), Math.round(Math.abs(p.x - start.x)), Math.round(Math.abs(p.y - start.y))]);
    },
    [toImgPx],
  );

  const onFramePointerUp = useCallback(() => {
    const rect = drawRect;
    dragStartRef.current = null;
    setDrawRect(null);
    if (draggedRef.current && rect && rect[2] >= 12 && rect[3] >= 12) {
      setPendingRect(rect);
    }
  }, [drawRect]);

  // Al terminar el análisis local, quitar el marco pendiente.
  const wasAnalyzingRef = useRef(false);
  useEffect(() => {
    if (analyzingRegion) {
      wasAnalyzingRef.current = true;
    } else if (wasAnalyzingRef.current) {
      wasAnalyzingRef.current = false;
      setPendingRect(null);
    }
  }, [analyzingRegion]);

  const pct = (v: number, total: number) => `${(v / total) * 100}%`;

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col bg-black/95 backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
        <div className="flex items-center gap-2 text-white">
          <Layers size={16} className="text-purple-400" />
          <span className="text-sm font-black uppercase tracking-[0.18em]">Layerizer</span>
        </div>
        <button onClick={onClose} className="rounded-md p-1.5 text-white/60 hover:bg-white/10 hover:text-white">
          <X size={18} />
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Lienzo con overlays */}
        <div className="relative flex flex-1 items-center justify-center overflow-hidden p-6">
          <div
            ref={frameRef}
            onPointerDown={onFramePointerDown}
            onPointerMove={onFramePointerMove}
            onPointerUp={onFramePointerUp}
            className="relative cursor-crosshair touch-none select-none"
          >
            {inputImage ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={inputImage}
                alt="master"
                className="pointer-events-none block max-h-[80vh] w-auto max-w-full select-none object-contain"
                draggable={false}
              />
            ) : null}

            {/* Overlay de máscaras SAM (selección pixel-exacta) sobre objetos seleccionados. */}
            {detected.map((obj) =>
              selectedIds.has(obj.id) && maskPreviews[obj.id] ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  key={`mask_${obj.id}`}
                  src={maskPreviews[obj.id]}
                  alt=""
                  className="pointer-events-none absolute inset-0 h-full w-full object-contain mix-blend-screen opacity-60"
                  style={{ filter: "drop-shadow(0 0 0 #a855f7)" }}
                  draggable={false}
                />
              ) : null,
            )}

            {detected.map((obj) => {
              if (obj.parentId && !expandedIds.has(obj.parentId)) return null;
              const isSel = selectedIds.has(obj.id);
              const isPart = !!obj.parentId;
              const isTxt = !!obj.isText;
              return (
                <div
                  key={obj.id}
                  className={`pointer-events-none absolute border-2 transition-colors ${
                    isTxt
                      ? isSel
                        ? "border-cyan-400 bg-cyan-400/15"
                        : "border-cyan-400/50 border-dashed bg-cyan-400/5"
                      : isSel
                        ? isPart
                          ? "border-sky-400 bg-sky-400/20"
                          : "border-purple-400 bg-purple-400/20"
                        : isPart
                          ? "border-sky-300/40 border-dashed bg-sky-300/5"
                          : "border-white/40 bg-white/5"
                  }`}
                  style={{
                    left: `${(obj.bbox[0] / W) * 100}%`,
                    top: `${(obj.bbox[1] / H) * 100}%`,
                    width: `${(obj.bbox[2] / W) * 100}%`,
                    height: `${(obj.bbox[3] / H) * 100}%`,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => onToggleSelect(obj.id)}
                    title="Clic para seleccionar"
                    className={`pointer-events-auto absolute -top-5 left-0 whitespace-nowrap px-1.5 py-0.5 text-[9px] font-bold text-white ${
                      isTxt ? "bg-cyan-700/90" : isPart ? "bg-sky-600/80" : "bg-black/70"
                    }`}
                  >
                    {obj.label}
                  </button>
                </div>
              );
            })}

            {/* Marco en vivo mientras se arrastra */}
            {drawRect ? (
              <div
                className="pointer-events-none absolute border-2 border-amber-400 bg-amber-400/10"
                style={{
                  left: pct(drawRect[0], W),
                  top: pct(drawRect[1], H),
                  width: pct(drawRect[2], W),
                  height: pct(drawRect[3], H),
                }}
              />
            ) : null}

            {/* Área pendiente / en análisis */}
            {pendingRect ? (
              <div
                className={`pointer-events-none absolute border-2 ${
                  analyzingRegion
                    ? "animate-pulse border-amber-300 bg-amber-400/30 shadow-[0_0_24px_rgba(251,191,36,0.45)]"
                    : "border-amber-400 bg-amber-400/10"
                }`}
                style={{
                  left: pct(pendingRect[0], W),
                  top: pct(pendingRect[1], H),
                  width: pct(pendingRect[2], W),
                  height: pct(pendingRect[3], H),
                }}
              >
                {analyzingRegion ? (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="flex items-center gap-2 rounded-md bg-amber-500/95 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-black shadow-lg">
                      <Loader2 size={12} className="animate-spin" />
                      Analizando…
                    </div>
                  </div>
                ) : (
                  <div className="pointer-events-auto absolute -bottom-10 left-0 flex items-center gap-1.5 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => onAnalyzeRegion(pendingRect)}
                      className="flex items-center gap-1.5 rounded-md bg-amber-500 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-black hover:bg-amber-400"
                    >
                      <Sparkles size={12} />
                      Analizar en local
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingRect(null)}
                      className="rounded-md bg-white/10 px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white/70 hover:bg-white/20"
                    >
                      Cancelar
                    </button>
                  </div>
                )}
              </div>
            ) : null}
          </div>

          {/* Pista de uso */}
          <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-[9px] text-white/60">
            Arrastra sobre la imagen (también dentro de otras cajas) para analizar un área · Clic en la etiqueta para seleccionar
          </div>
        </div>

        {/* Panel lateral */}
        <div className="flex w-[320px] flex-col gap-3 overflow-y-auto border-l border-white/10 bg-zinc-950/80 p-4 text-white">
          {detected.length === 0 ? (
            <button
              onClick={onDetect}
              disabled={detecting || !inputImage}
              className="flex items-center justify-center gap-2 rounded-lg bg-purple-600 px-4 py-3 text-xs font-black uppercase tracking-[0.15em] hover:bg-purple-500 disabled:opacity-50"
            >
              {detecting ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              {detecting ? "Detectando…" : "Detectar objetos"}
            </button>
          ) : (
            <>
              <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-[0.15em] text-white/60">
                <span>Objetos ({selectedIds.size}/{detected.length})</span>
                <button onClick={onDetect} disabled={detecting || detectingText || analyzingRegion} className="text-purple-300 hover:text-purple-200 disabled:opacity-40">
                  {detecting ? "…" : "re-detectar"}
                </button>
              </div>

              <button
                onClick={onDetectText}
                disabled={detectingText || detecting || analyzingRegion || !inputImage}
                className="flex items-center justify-center gap-2 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.12em] text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-50"
              >
                {detectingText ? <Loader2 size={13} className="animate-spin" /> : <Type size={13} />}
                {detectingText ? "Detectando texto…" : "Detectar texto"}
              </button>

              {detectingText ? (
                <div className="flex items-center gap-2 rounded-md border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-[10px] text-cyan-200">
                  <Loader2 size={12} className="animate-spin shrink-0" />
                  Buscando bloques de tipografía…
                </div>
              ) : null}

              {analyzingRegion ? (
                <div className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[10px] text-amber-200">
                  <Loader2 size={12} className="animate-spin shrink-0" />
                  Analizando área seleccionada…
                </div>
              ) : null}

              <div className="flex flex-col gap-1.5">
                {subjects.map((subject) => {
                  const parts = partsOf(subject.id);
                  const isExpanded = expandedIds.has(subject.id);
                  const selectedParts = parts.filter((p) => selectedIds.has(p.id)).length;
                  return (
                    <div key={subject.id} className="flex flex-col gap-1">
                      <ObjectRow
                        obj={subject}
                        isPart={false}
                        selected={selectedIds.has(subject.id)}
                        amodal={amodalIds.has(subject.id)}
                        previewing={previewingId === subject.id}
                        hasPreview={!!maskPreviews[subject.id]}
                        expandable={parts.length > 0}
                        expanded={isExpanded}
                        partsBadge={parts.length > 0 ? `${selectedParts}/${parts.length}` : null}
                        onToggleSelect={onToggleSelect}
                        onToggleAmodal={onToggleAmodal}
                        onToggleExpand={onToggleExpand}
                        onPreviewMask={onPreviewMask}
                      />
                      {isExpanded
                        ? parts.map((part) => (
                            <div key={part.id} className="ml-3 border-l border-white/10 pl-2">
                              <ObjectRow
                                obj={part}
                                isPart
                                selected={selectedIds.has(part.id)}
                                amodal={amodalIds.has(part.id)}
                                previewing={previewingId === part.id}
                                hasPreview={!!maskPreviews[part.id]}
                                expandable={false}
                                expanded={false}
                                partsBadge={null}
                                onToggleSelect={onToggleSelect}
                                onToggleAmodal={onToggleAmodal}
                                onToggleExpand={onToggleExpand}
                                onPreviewMask={onPreviewMask}
                              />
                            </div>
                          ))
                        : null}
                    </div>
                  );
                })}
              </div>

              {/* Coste en vivo */}
              <div className="mt-1 rounded-lg border border-white/10 bg-black/40 p-3 text-[10px] text-white/70">
                <div className="flex justify-between"><span>Extraer ({cost.objectCount})</span><span>{usd(cost.extractUsd)}</span></div>
                <div className="flex justify-between"><span>Fondo limpio</span><span>{usd(cost.cleanPlateUsd)}</span></div>
                {cost.amodalCount > 0 ? (
                  <div className="flex justify-between"><span>Amodal ({cost.amodalCount})</span><span>{usd(cost.amodalUsd)}</span></div>
                ) : null}
                <div className="mt-1 flex justify-between border-t border-white/10 pt-1 text-xs font-black text-white">
                  <span>Total</span><span>{usd(cost.totalUsd)}</span>
                </div>
              </div>

              {/* Progreso */}
              {running && progress ? (
                <div className="flex flex-col gap-2 rounded-lg border border-purple-500/30 bg-purple-500/5 p-3">
                  {PROGRESS_STEPS.map((step, i) => (
                    <div key={step.status} className="flex items-center gap-2 text-[10px]">
                      {i < activeStepIndex ? (
                        <span className="text-emerald-400">✓</span>
                      ) : i === activeStepIndex ? (
                        <Loader2 size={11} className="animate-spin text-purple-300" />
                      ) : (
                        <span className="text-white/20">○</span>
                      )}
                      <span className={i === activeStepIndex ? "text-white" : "text-white/40"}>{step.label}</span>
                    </div>
                  ))}
                  {progress.message ? <span className="text-[9px] text-white/50">{progress.message}</span> : null}
                </div>
              ) : null}

              <button
                onClick={onExtract}
                disabled={running || selectedIds.size === 0}
                className="mt-1 flex items-center justify-center gap-2 rounded-lg bg-purple-600 px-4 py-3 text-xs font-black uppercase tracking-[0.15em] hover:bg-purple-500 disabled:opacity-50"
              >
                {running ? <Loader2 size={14} className="animate-spin" /> : <Scissors size={14} />}
                {running ? "Extrayendo…" : "Extract Layout"}
              </button>
            </>
          )}

          {error ? <div className="rounded-md bg-rose-500/15 px-3 py-2 text-[10px] text-rose-300">{error}</div> : null}

          {/* Resultado */}
          {output ? (
            <div className="mt-2 flex flex-col gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
              <span className="text-[10px] font-black uppercase tracking-[0.15em] text-emerald-300">
                {output.layers.length} capas listas
              </span>

              <div className="grid grid-cols-3 gap-1.5">
                <div className="relative aspect-square overflow-hidden rounded border border-white/15 bg-[repeating-conic-gradient(#333_0%_25%,#222_0%_50%)] bg-[length:12px_12px]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={output.original?.url ?? output.masterUrl}
                    alt="original"
                    className="h-full w-full object-cover"
                  />
                  <span className="absolute bottom-0 left-0 bg-black/70 px-1 text-[7px] text-white">Capa 1</span>
                </div>
                <div className="relative aspect-square overflow-hidden rounded border border-white/15 bg-[repeating-conic-gradient(#333_0%_25%,#222_0%_50%)] bg-[length:12px_12px]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={output.background.url} alt="bg" className="h-full w-full object-cover" />
                  <span className="absolute bottom-0 left-0 bg-black/70 px-1 text-[7px] text-white">Capa 2</span>
                </div>
                {output.layers.map((l) => (
                  <div
                    key={l.id}
                    className="relative overflow-hidden rounded border border-white/15 bg-[repeating-conic-gradient(#333_0%_25%,#222_0%_50%)] bg-[length:12px_12px]"
                    style={{ aspectRatio: `${Math.max(1, l.w)} / ${Math.max(1, l.h)}` }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={l.url} alt={l.label} className="h-full w-full" />
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2 rounded-md bg-emerald-600/20 px-3 py-2 text-[10px] text-emerald-200">
                <Send size={12} />
                Conecta la salida <strong>Image Layout</strong> al nodo Designer.
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
