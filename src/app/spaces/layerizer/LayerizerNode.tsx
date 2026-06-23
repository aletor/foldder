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
import { Check, ChevronRight, Eye, Layers, Loader2, Maximize2, MousePointerSquareDashed, Scissors, Send, Sparkles, Type, Wand2, X } from "lucide-react";
import { runAiJobWithNotification } from "@/lib/ai-job-notifications";
import { resolvePromptValueFromEdgeSource } from "../canvas-group-logic";
import { FoldderDataHandle } from "../FoldderDataHandle";
import { NodeIcon, resolveFoldderNodeState } from "../foldder-icons";
import { FoldderNodeHeaderTitle, NodeLabel } from "../foldder-node-ui";
import { FoldderStudioTouchedMark } from "../studio-node/foldder-studio-touched-mark";
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

// Mensajes que rotan durante el escaneo para reflejar las fases reales del pipeline.
const DETECT_SCAN_MESSAGES = [
  "Analizando la composición de la escena…",
  "Localizando los objetos principales…",
  "Refinando los límites con SAM…",
  "Ordenando las capas por relevancia…",
];
const TEXT_SCAN_MESSAGES = [
  "Rastreando bloques de tipografía…",
  "Delimitando las áreas de texto…",
];
const REGION_SCAN_MESSAGES = [
  "Inspeccionando el área seleccionada…",
  "Detectando objetos locales…",
  "Ajustando los límites…",
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

/** Dimensiones del master guardadas en node.data. */
function dimsFromNodeData(d: LayerizerNodeData): { w: number; h: number } | null {
  if (d.masterWidth && d.masterHeight) return { w: d.masterWidth, h: d.masterHeight };
  return null;
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
  const [dims, setDims] = useState<{ w: number; h: number } | null>(dimsFromNodeData(nodeData));
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

  // Rehidrata detección y dimensiones desde node.data (p. ej. al reabrir el studio).
  useEffect(() => {
    if (nodeData.detected?.length) setDetected(nodeData.detected);
    const stored = dimsFromNodeData(nodeData);
    if (stored) setDims(stored);
  }, [nodeData.detected, nodeData.masterWidth, nodeData.masterHeight]);

  // Si hay detecciones pero faltan dims (sesiones antiguas), resolver desde la imagen al abrir.
  useEffect(() => {
    if (!open || dims || !inputImage) return;
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      if (w > 0 && h > 0) {
        setDims({ w, h });
        patchData({ masterWidth: w, masterHeight: h });
      }
    };
    img.src = inputImage;
    return () => { cancelled = true; };
  }, [open, dims, inputImage, patchData]);

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
      patchData({ detected: objs, masterUrl: inputImage, masterWidth: json.width, masterHeight: json.height });
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
        patchData({
          detected: merged,
          masterUrl: inputImage,
          ...(json.width && json.height ? { masterWidth: json.width, masterHeight: json.height } : {}),
        });
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
          patchData({
            detected: merged,
            masterUrl: inputImage,
            ...(json.width && json.height ? { masterWidth: json.width, masterHeight: json.height } : {}),
          });
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
              masterWidth: ev.output.original?.w ?? ev.output.background.w,
              masterHeight: ev.output.original?.h ?? ev.output.background.h,
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
      className={`custom-node layerizer-node foldder-node--frameless node--media group/node ${previewUrl ? "" : "layerizer-node--empty"}`}
      style={{
        width: 260,
        minWidth: 220,
        // Con imagen: la tarjeta adopta su aspect ratio (sin marco/letterbox).
        // Sin imagen: altura mínima para el placeholder "Connect an image".
        aspectRatio: imgAR ? String(imgAR) : undefined,
        minHeight: imgAR ? 0 : 150,
        "--foldder-frameless-accent": "#a6c85e",
      } as React.CSSProperties}
    >
      <NodeLabel id={id} label={nodeData.label} defaultLabel="Layerizer" />

      {previewUrl ? <FoldderStudioTouchedMark nodeType="layerizer" /> : null}

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

  // Paleta por tipo: texto = cian, parte = celeste, objeto = violeta.
  const tone = obj.isText ? "cyan" : isPart ? "sky" : "purple";
  // Frameless: sin cajas; la selección se marca con una barra de acento a la izquierda.
  const ring =
    selected
      ? tone === "cyan"
        ? "border-cyan-400 bg-cyan-500/[0.07]"
        : tone === "sky"
          ? "border-sky-400 bg-sky-500/[0.07]"
          : "border-purple-400 bg-purple-500/[0.07]"
      : "border-transparent hover:bg-white/[0.03]";
  const dot =
    selected
      ? tone === "cyan"
        ? "border-cyan-400 bg-cyan-400 text-black"
        : tone === "sky"
          ? "border-sky-400 bg-sky-400 text-black"
          : "border-purple-400 bg-purple-400 text-black"
      : "border-white/25 text-transparent";
  const iconColor = selected
    ? tone === "cyan" ? "text-cyan-300" : tone === "sky" ? "text-sky-300" : "text-purple-300"
    : "text-white/45";

  return (
    <div className={`group/row flex flex-col border-l-2 px-2.5 py-2 transition-colors ${ring}`}>
      <div className="flex items-center gap-2 overflow-hidden">
        {expandable ? (
          <button
            onClick={() => onToggleExpand(obj.id)}
            title={expanded ? "Colapsar partes" : "Ver partes"}
            className="shrink-0 p-0.5 text-white/40 hover:text-white"
          >
            <ChevronRight size={13} className={`transition-transform ${expanded ? "rotate-90" : ""}`} />
          </button>
        ) : (
          <span className="w-[14px] shrink-0" />
        )}
        <button onClick={() => onToggleSelect(obj.id)} className="flex flex-1 items-center gap-2.5 overflow-hidden text-left">
          <span className={`flex h-4 w-4 shrink-0 items-center justify-center border transition-all ${dot}`}>
            <Check size={10} strokeWidth={3.5} />
          </span>
          {obj.isText ? <Type size={13} className={iconColor} /> : <Scissors size={13} className={iconColor} />}
          <span className={`truncate ${isPart ? "text-[11px] text-white/75" : "text-[12px] text-white/90"}`}>{obj.label}</span>
          {obj.isText ? (
            <span className="shrink-0 text-[8px] font-bold uppercase tracking-wider text-cyan-300/80">texto</span>
          ) : null}
          {obj.manual ? (
            <span className="shrink-0 text-[8px] font-bold uppercase tracking-wider text-amber-300/80">manual</span>
          ) : null}
          {partsBadge ? (
            <span className="ml-auto shrink-0 text-[8px] font-medium text-white/40">{partsBadge}</span>
          ) : null}
        </button>
      </div>

      {selected && !obj.isText ? (
        <div className="mt-1.5 flex items-center gap-3 pl-[26px]">
          <button
            onClick={() => onPreviewMask(obj.id)}
            disabled={previewing}
            title="Previsualizar la máscara de selección (SAM)"
            className={`flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider transition-colors disabled:opacity-50 ${
              hasPreview ? "text-purple-300" : "text-white/45 hover:text-white/80"
            }`}
          >
            {previewing ? <Loader2 size={10} className="animate-spin" /> : <Eye size={10} />}
            máscara
          </button>
          <button
            onClick={() => onToggleAmodal(obj.id)}
            title="Completar zonas ocultas del objeto (amodal)"
            className={`flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider transition-colors ${
              amodal ? "text-amber-300" : "text-white/45 hover:text-white/80"
            }`}
          >
            <Wand2 size={10} /> amodal
          </button>
        </div>
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

  // --- Modo "scan": HUD de acciones + línea que recorre la imagen ---
  const scanning = detecting || detectingText || analyzingRegion;
  const [scanStep, setScanStep] = useState(0);
  useEffect(() => {
    if (!scanning) {
      setScanStep(0);
      return;
    }
    const id = setInterval(() => setScanStep((i) => i + 1), 1800);
    return () => clearInterval(id);
  }, [scanning]);
  const scanMessages = detecting
    ? DETECT_SCAN_MESSAGES
    : detectingText
      ? TEXT_SCAN_MESSAGES
      : analyzingRegion
        ? REGION_SCAN_MESSAGES
        : [];
  const scanMessage = scanMessages.length ? scanMessages[scanStep % scanMessages.length] : "";

  // Celebración de un solo disparo al completar la extracción.
  const prevOutputRef = useRef(false);
  const [celebrate, setCelebrate] = useState(false);
  useEffect(() => {
    const has = !!output;
    if (has && !prevOutputRef.current) {
      setCelebrate(true);
      const t = setTimeout(() => setCelebrate(false), 1700);
      prevOutputRef.current = has;
      return () => clearTimeout(t);
    }
    prevOutputRef.current = has;
  }, [output]);

  const pct = (v: number, total: number) => `${(v / total) * 100}%`;

  // Fases del flujo para el stepper de la barra superior.
  const STEPS = [
    { n: 1, label: "Detectar" },
    { n: 2, label: "Seleccionar" },
    { n: 3, label: "Extraer" },
  ] as const;
  const phase = output ? 3 : detected.length === 0 ? 1 : running ? 3 : 2;
  const busy = detecting || detectingText || analyzingRegion;

  const objectSubjects = subjects.filter((s) => !s.isText);
  const textSubjects = subjects.filter((s) => s.isText);

  const renderSubject = (subject: DetectedObject) => {
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
  };

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col bg-black/95 backdrop-blur-md">
      <style>{`@keyframes layerizer-scan{0%{top:-6%;opacity:0}12%{opacity:1}88%{opacity:1}100%{top:104%;opacity:0}}@keyframes layerizer-pop{0%{transform:scale(0.5);opacity:0}45%{transform:scale(1.08);opacity:1}70%{transform:scale(1);opacity:1}100%{transform:scale(1);opacity:0}}@keyframes layerizer-flash{0%{opacity:0}25%{opacity:1}100%{opacity:0}}`}</style>
      {/* Profundidad: glows radiales para dar dimensión al fondo. */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_22%_12%,rgba(168,85,247,0.14),transparent_55%),radial-gradient(circle_at_88%_88%,rgba(34,211,238,0.10),transparent_55%)]" />

      {/* Barra superior con stepper */}
      <div className="relative z-10 flex items-center justify-between border-b border-white/10 px-5 py-3">
        <div className="flex items-center gap-2.5 text-white">
          <Layers size={16} className="text-purple-400" />
          <span className="text-sm font-black uppercase tracking-[0.18em]">Layerizer</span>
        </div>

        <div className="absolute left-1/2 hidden -translate-x-1/2 items-center md:flex">
          {STEPS.map((s, i) => {
            const active = !output && phase === s.n;
            const done = !!output || phase > s.n;
            return (
              <div key={s.n} className="flex items-center">
                <div
                  className={`flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                    active ? "text-purple-200" : done ? "text-emerald-300/80" : "text-white/35"
                  }`}
                >
                  <span
                    className={`flex h-4 w-4 items-center justify-center text-[9px] ${
                      active ? "text-purple-300" : done ? "text-emerald-300/80" : "text-white/35"
                    }`}
                  >
                    {done ? <Check size={11} strokeWidth={3.5} /> : active ? "●" : s.n}
                  </span>
                  {s.label}
                </div>
                {i < STEPS.length - 1 ? <span className="mx-1 h-px w-5 bg-white/15" /> : null}
              </div>
            );
          })}
        </div>

        <button onClick={onClose} className="relative z-10 p-1.5 text-white/60 transition-colors hover:text-white">
          <X size={18} />
        </button>
      </div>

      <div className="relative z-10 flex min-h-0 flex-1">
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
            {!output && detected.map((obj) =>
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

            {!output && detected.map((obj) => {
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
                    <div className="flex items-center gap-2 bg-amber-500/95 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-black">
                      <Loader2 size={12} className="animate-spin" />
                      Analizando…
                    </div>
                  </div>
                ) : (
                  <div className="pointer-events-auto absolute -bottom-10 left-0 flex items-center gap-1.5 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => onAnalyzeRegion(pendingRect)}
                      className="flex items-center gap-1.5 bg-amber-500 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-black hover:bg-amber-400"
                    >
                      <Sparkles size={12} />
                      Analizar en local
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingRect(null)}
                      className="bg-white/10 px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white/70 hover:bg-white/20"
                    >
                      Cancelar
                    </button>
                  </div>
                )}
              </div>
            ) : null}

            {/* Línea de escaneo que recorre la imagen de arriba a abajo */}
            {detecting || detectingText ? (
              <div className="pointer-events-none absolute inset-0 overflow-hidden">
                <div className="absolute inset-0 bg-black/10" />
                <div className="absolute inset-x-0" style={{ animation: "layerizer-scan 2.4s ease-in-out infinite" }}>
                  <div
                    className="h-24 w-full -translate-y-full"
                    style={{ background: "linear-gradient(to top, rgba(34,211,238,0.18), transparent)" }}
                  />
                  <div
                    className="h-[2px] w-full"
                    style={{
                      background:
                        "linear-gradient(90deg, transparent 0%, rgba(34,211,238,0.95) 38%, rgba(168,85,247,0.95) 62%, transparent 100%)",
                      boxShadow: "0 0 14px 2px rgba(34,211,238,0.55)",
                    }}
                  />
                </div>
              </div>
            ) : null}
          </div>

          {/* HUD de acciones durante el escaneo */}
          {scanning ? (
            <div className="pointer-events-none absolute top-6 left-1/2 -translate-x-1/2 z-20">
              <div className="flex items-center gap-2.5 text-[11px] font-semibold text-cyan-100 drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
                <Loader2 size={13} className="animate-spin text-cyan-300" />
                <span>{scanMessage}</span>
              </div>
            </div>
          ) : null}

          {/* Indicador de selección */}
          {detected.length > 0 && !output ? (
            <div className="pointer-events-none absolute left-6 top-6 text-[10px] font-semibold uppercase tracking-wider text-white/70 drop-shadow-[0_2px_6px_rgba(0,0,0,0.8)]">
              {selectedIds.size} de {detected.length} seleccionadas
            </div>
          ) : null}

          {/* Celebración de un disparo al completar */}
          {celebrate ? (
            <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
              <div
                className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.22),transparent_60%)]"
                style={{ animation: "layerizer-flash 1.7s ease-out forwards" }}
              />
              <div
                className="flex flex-col items-center gap-3"
                style={{ animation: "layerizer-pop 1.7s ease-out forwards" }}
              >
                <Check size={72} strokeWidth={2.5} className="text-emerald-400 drop-shadow-[0_0_40px_rgba(16,185,129,0.85)]" />
                <span className="text-sm font-black uppercase tracking-[0.2em] text-emerald-300 drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
                  Layout listo
                </span>
              </div>
            </div>
          ) : null}

          {/* Barra flotante de herramientas de entrada */}
          {detected.length > 0 && !output ? (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2">
              <div className="flex items-center gap-5">
                <button
                  onClick={onDetect}
                  disabled={busy}
                  title="Volver a detectar objetos"
                  className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-white/80 transition-colors hover:text-white disabled:opacity-40"
                >
                  {detecting ? <Loader2 size={14} className="animate-spin text-purple-300" /> : <Sparkles size={14} className="text-purple-300" />}
                  Objetos
                </button>
                <button
                  onClick={onDetectText}
                  disabled={busy || !inputImage}
                  title="Detectar bloques de texto"
                  className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-white/80 transition-colors hover:text-white disabled:opacity-40"
                >
                  {detectingText ? <Loader2 size={14} className="animate-spin text-cyan-300" /> : <Type size={14} className="text-cyan-300" />}
                  Texto
                </button>
                <span className="h-4 w-px bg-white/15" />
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/40">
                  <MousePointerSquareDashed size={14} className="text-amber-300/70" />
                  Arrastra para analizar un área
                </div>
              </div>
            </div>
          ) : null}

          {/* Bandeja de resultados (final con efecto wow) */}
          {output ? (
            <div className="absolute inset-x-0 bottom-0 z-20 border-t border-emerald-400/30 bg-gradient-to-t from-black/85 to-transparent px-6 pb-5 pt-6 backdrop-blur-xl">
              <div className="mb-2.5 flex items-center justify-between">
                <span className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.15em] text-emerald-300">
                  <Check size={13} strokeWidth={3} />
                  {output.layers.length} capas listas
                </span>
                <span className="flex items-center gap-1.5 text-[10px] text-emerald-200/85">
                  <Send size={12} />
                  Conecta <strong className="font-bold text-emerald-100">Image Layout</strong> al nodo Designer
                </span>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                <div className="relative h-20 w-20 shrink-0 overflow-hidden bg-[repeating-conic-gradient(#333_0%_25%,#222_0%_50%)] bg-[length:12px_12px]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={output.original?.url ?? output.masterUrl} alt="original" className="h-full w-full object-cover" />
                  <span className="absolute bottom-0 left-0 right-0 bg-black/70 px-1 py-0.5 text-center text-[8px] font-semibold text-white">Capa 1</span>
                </div>
                <div className="relative h-20 w-20 shrink-0 overflow-hidden bg-[repeating-conic-gradient(#333_0%_25%,#222_0%_50%)] bg-[length:12px_12px]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={output.background.url} alt="bg" className="h-full w-full object-cover" />
                  <span className="absolute bottom-0 left-0 right-0 bg-black/70 px-1 py-0.5 text-center text-[8px] font-semibold text-white">Capa 2</span>
                </div>
                {output.layers.map((l, i) => (
                  <div
                    key={l.id}
                    className="relative h-20 w-20 shrink-0 overflow-hidden bg-[repeating-conic-gradient(#333_0%_25%,#222_0%_50%)] bg-[length:12px_12px]"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={l.url} alt={l.label} className="h-full w-full object-contain" />
                    <span className="absolute bottom-0 left-0 right-0 truncate bg-black/70 px-1 py-0.5 text-center text-[8px] font-semibold text-white">
                      {l.label || `Capa ${i + 3}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {/* Rail inspector */}
        <div className="flex w-[340px] shrink-0 flex-col border-l border-white/10 bg-zinc-950/70 text-white backdrop-blur-xl">
          {detected.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-5 p-8 text-center">
              <Layers size={36} className="text-purple-300/80" />
              <div className="space-y-1.5">
                <p className="text-sm font-bold text-white">Detecta las capas</p>
                <p className="text-[11px] leading-relaxed text-white/50">
                  Encuentra los objetos principales de la imagen para extraerlos como capas independientes con fondo transparente.
                </p>
              </div>
              <button
                onClick={onDetect}
                disabled={detecting || !inputImage}
                className="flex w-full items-center justify-center gap-2 bg-purple-600 px-4 py-3 text-xs font-black uppercase tracking-[0.15em] transition-colors hover:bg-purple-500 disabled:opacity-50"
              >
                {detecting ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                {detecting ? "Detectando…" : "Detectar objetos"}
              </button>
              <button
                onClick={onDetectText}
                disabled={detectingText || detecting || !inputImage}
                className="flex items-center gap-1.5 text-[11px] font-semibold text-cyan-300/80 transition-colors hover:text-cyan-200 disabled:opacity-40"
              >
                {detectingText ? <Loader2 size={12} className="animate-spin" /> : <Type size={12} />}
                o detectar texto
              </button>
            </div>
          ) : (
            <>
              {/* Zona scrollable: lista de capas */}
              <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-[0.16em] text-white/55">Capas detectadas</span>
                  <button
                    onClick={onDetect}
                    disabled={busy}
                    title="Volver a detectar"
                    className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-purple-300 transition-colors hover:text-purple-200 disabled:opacity-40"
                  >
                    {detecting ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
                    re-detectar
                  </button>
                </div>

                {detectingText ? (
                  <div className="flex items-center gap-2 text-[10px] text-cyan-200">
                    <Loader2 size={12} className="shrink-0 animate-spin" />
                    Buscando bloques de tipografía…
                  </div>
                ) : null}
                {analyzingRegion ? (
                  <div className="flex items-center gap-2 text-[10px] text-amber-200">
                    <Loader2 size={12} className="shrink-0 animate-spin" />
                    Analizando área seleccionada…
                  </div>
                ) : null}

                {objectSubjects.length > 0 ? (
                  <div className="flex flex-col gap-1.5">
                    {textSubjects.length > 0 ? (
                      <span className="px-0.5 text-[9px] font-bold uppercase tracking-[0.18em] text-white/35">Objetos</span>
                    ) : null}
                    {objectSubjects.map(renderSubject)}
                  </div>
                ) : null}

                {textSubjects.length > 0 ? (
                  <div className="flex flex-col gap-1.5">
                    <span className="px-0.5 text-[9px] font-bold uppercase tracking-[0.18em] text-cyan-300/50">Texto</span>
                    {textSubjects.map(renderSubject)}
                  </div>
                ) : null}
              </div>

              {/* Footer fijo: coste + acción / progreso */}
              <div className="shrink-0 space-y-3 border-t border-white/10 p-4">
                {error ? <div className="border-l-2 border-rose-400 bg-rose-500/10 px-3 py-2 text-[10px] text-rose-300">{error}</div> : null}

                {running && progress ? (
                  <div className="flex flex-col gap-2">
                    {PROGRESS_STEPS.map((step, i) => (
                      <div key={step.status} className="flex items-center gap-2 text-[10px]">
                        {i < activeStepIndex ? (
                          <Check size={11} className="text-emerald-400" strokeWidth={3} />
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
                ) : (
                  <div className="space-y-1 text-[11px] text-white/65">
                    <div className="flex justify-between"><span>Extraer ({cost.objectCount})</span><span>{usd(cost.extractUsd)}</span></div>
                    <div className="flex justify-between"><span>Fondo limpio</span><span>{usd(cost.cleanPlateUsd)}</span></div>
                    {cost.amodalCount > 0 ? (
                      <div className="flex justify-between"><span>Amodal ({cost.amodalCount})</span><span>{usd(cost.amodalUsd)}</span></div>
                    ) : null}
                    <div className="mt-1.5 flex justify-between border-t border-white/10 pt-1.5 text-xs font-black text-white">
                      <span>Total</span><span>{usd(cost.totalUsd)}</span>
                    </div>
                  </div>
                )}

                <button
                  onClick={onExtract}
                  disabled={running || selectedIds.size === 0}
                  className="flex w-full items-center justify-center gap-2 bg-purple-600 px-4 py-3.5 text-xs font-black uppercase tracking-[0.15em] transition-colors hover:bg-purple-500 disabled:opacity-50"
                >
                  {running ? <Loader2 size={14} className="animate-spin" /> : <Scissors size={14} />}
                  {running ? "Extrayendo…" : output ? "Volver a extraer" : "Extraer Layout"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
