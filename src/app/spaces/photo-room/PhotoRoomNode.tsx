"use client";

import React, { memo, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  NodeResizer,
  Position,
  useEdges,
  useNodeId,
  useNodes,
  useReactFlow,
  useUpdateNodeInternals,
  type NodeProps,
} from "@xyflow/react";
import { ImageIcon, Maximize2 } from "lucide-react";
import { FOLDDER_FIT_VIEW_EASE } from "@/lib/fit-view-ease";
import { FoldderDataHandle } from "../FoldderDataHandle";
import { NodeIcon, resolveFoldderNodeState } from "../foldder-icons";
import { NodeLabel, FoldderNodeHeaderTitle } from "../foldder-node-ui";
import { resolvePromptValueFromEdgeSource } from "../canvas-group-logic";
import type { DesignerStudioApi } from "../FreehandStudio";
import type { PhotoRoomNodeStudioData } from "./photo-room-types";

const NODE_RESIZE_END_FIT_PADDING = 0.8;

const PhotoRoomStudioLazy = React.lazy(() => import("./PhotoRoomStudio"));

function FoldderNodeResizerLocal(props: React.ComponentProps<typeof NodeResizer>) {
  const nodeId = useNodeId();
  const { fitView } = useReactFlow();
  const { onResizeEnd, ...rest } = props;
  return (
    <NodeResizer
      {...rest}
      onResizeEnd={(event, params) => {
        onResizeEnd?.(event, params);
        if (nodeId) {
          requestAnimationFrame(() => {
            void fitView({
              nodes: [{ id: nodeId }],
              padding: NODE_RESIZE_END_FIT_PADDING,
              duration: 560,
              interpolate: "smooth",
              ...FOLDDER_FIT_VIEW_EASE,
            });
          });
        }
      }}
    />
  );
}

function ViewerOpenLocal({ nodeId, disabled }: { nodeId: string; disabled: boolean }) {
  return (
    <button
      type="button"
      title="Open viewer"
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        window.dispatchEvent(new CustomEvent("open-viewer-for-node", { detail: { nodeId } }));
      }}
      className={`nodrag flex shrink-0 cursor-pointer items-center justify-center rounded-md transition-colors ${disabled ? "opacity-35" : ""}`}
      style={{
        padding: 3,
        borderRadius: 6,
        background: "rgba(255,255,255,0.12)",
        border: "1px solid rgba(255,255,255,0.28)",
        color: "#fff",
        pointerEvents: disabled ? "none" : "auto",
      }}
    >
      <Maximize2 size={9} />
    </button>
  );
}

function PhotoRoomStudioModeButton({ onClick }: { onClick: () => void }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-[15] overflow-hidden opacity-0 transition-opacity duration-200 group-hover/node:opacity-100">
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-2">
        <button
          type="button"
          title="Abrir Studio"
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
          className="pointer-events-auto nodrag flex max-w-[min(100%,220px)] flex-col items-center gap-1.5 rounded-2xl border border-white/30 bg-white/[0.12] px-6 py-3.5 shadow-xl backdrop-blur-xl transition-all duration-300 ease-out hover:scale-[1.03] hover:bg-white/[0.22] hover:shadow-2xl"
        >
          <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
            Studio
          </span>
          <span className="flex items-center gap-2 font-mono text-[17px] font-black uppercase tracking-wide text-zinc-50">
            <Maximize2 size={22} strokeWidth={2.5} className="shrink-0 text-violet-200" />
            Mode
          </span>
        </button>
      </div>
    </div>
  );
}

const SLOT_IDS = ["in_0", "in_1", "in_2", "in_3", "in_4", "in_5", "in_6", "in_7"] as const;

const SLOT_TOP_PCT: Record<string, string> = {
  in_0: "11%",
  in_1: "22%",
  in_2: "33%",
  in_3: "44%",
  in_4: "55%",
  in_5: "66%",
  in_6: "77%",
  in_7: "88%",
};

type BaseNodeData = { label?: string; value?: string; type?: string };

type PhotoRoomNodeData = BaseNodeData & PhotoRoomNodeStudioData;

export const PhotoRoomNode = memo(({ id, data, selected }: NodeProps<any>) => {
  const nodeData = data as PhotoRoomNodeData;
  const nodes = useNodes();
  const edges = useEdges();
  const { setNodes } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const [showStudio, setShowStudio] = useState(false);
  const studioApiRef = useRef<DesignerStudioApi | null>(null);

  const studioArtboard = useMemo(() => {
    const ab = nodeData.studioArtboard;
    return {
      id: typeof ab?.id === "string" && ab.id.length > 0 ? ab.id : `pr_ab_${id}`,
      width: typeof ab?.width === "number" && ab.width > 0 ? ab.width : 1920,
      height: typeof ab?.height === "number" && ab.height > 0 ? ab.height : 1080,
      background: typeof ab?.background === "string" ? ab.background : "#ffffff",
    };
  }, [id, nodeData.studioArtboard]);

  const studioObjects = useMemo(
    () => (Array.isArray(nodeData.studioObjects) ? nodeData.studioObjects : []),
    [nodeData.studioObjects],
  );

  const studioLayoutGuides = useMemo(
    () => (Array.isArray(nodeData.studioLayoutGuides) ? nodeData.studioLayoutGuides : []),
    [nodeData.studioLayoutGuides],
  );

  const persistStudio = useCallback(
    (patch: Partial<PhotoRoomNodeStudioData> & { value?: string; type?: string }) => {
      setNodes((nds: any) =>
        nds.map((n: any) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)),
      );
    },
    [id, setNodes],
  );

  const handleStudioExportPreview = useCallback(
    (dataUrl: string) => {
      persistStudio({ value: dataUrl, type: "image" });
    },
    [persistStudio],
  );

  const connectedBySlot = useMemo(() => {
    const m: Record<string, boolean> = {};
    for (const sid of SLOT_IDS) {
      m[sid] = edges.some((e: any) => e.target === id && e.targetHandle === sid);
    }
    return m;
  }, [edges, id]);

  const visibleSlots = useMemo(() => {
    const out: string[] = [];
    for (let i = 0; i < SLOT_IDS.length; i++) {
      const sid = SLOT_IDS[i]!;
      if (i === 0 || connectedBySlot[SLOT_IDS[i - 1]!]) out.push(sid);
    }
    return out;
  }, [connectedBySlot]);

  useEffect(() => {
    updateNodeInternals(id);
  }, [id, visibleSlots.join(","), updateNodeInternals]);

  const previewUrl = useMemo(() => {
    for (const sid of SLOT_IDS) {
      const e = edges.find((ed: any) => ed.target === id && ed.targetHandle === sid);
      if (!e) continue;
      const v = resolvePromptValueFromEdgeSource(e, nodes as any);
      if (typeof v === "string" && v) return v;
    }
    return null;
  }, [edges, id, nodes]);

  const anyInputEdge = useMemo(
    () => SLOT_IDS.some((sid) => edges.some((e: any) => e.target === id && e.targetHandle === sid)),
    [edges, id],
  );

  /** Imágenes conectadas por slot → capas PhotoRoom (no eliminables en Studio). */
  const photoRoomConnectedInputs = useMemo(() => {
    const out: { slot: string; src: string }[] = [];
    for (const sid of SLOT_IDS) {
      const e = edges.find((ed: any) => ed.target === id && ed.targetHandle === sid);
      if (!e) continue;
      const v = resolvePromptValueFromEdgeSource(e, nodes as any);
      if (typeof v === "string" && v.trim().length > 0) {
        out.push({ slot: sid, src: v.trim() });
      }
    }
    return out;
  }, [edges, id, nodes]);

  const photoRoomInputsSig = useMemo(
    () => photoRoomConnectedInputs.map((c) => `${c.slot}:${c.src}`).join("|"),
    [photoRoomConnectedInputs],
  );

  /**
   * Studio cerrado: quitar del documento persistido las capas de entrada sin cable (no vaciar `value`:
   * la miniatura usa preview/export vía `displayUrl` y borrar el PNG exportado dejaba el thumb negro).
   */
  useEffect(() => {
    if (showStudio) return;
    const connectedSlots = new Set(photoRoomConnectedInputs.map((c) => c.slot));
    setNodes((nds: any) =>
      nds.map((n: any) => {
        if (n.id !== id) return n;
        const objs = n.data?.studioObjects;
        if (!Array.isArray(objs) || objs.length === 0) return n;
        const stripped = objs.filter((o: { photoRoomInputSlot?: string }) => {
          if (!o.photoRoomInputSlot) return true;
          return connectedSlots.has(o.photoRoomInputSlot);
        });
        if (stripped.length === objs.length) return n;
        return { ...n, data: { ...n.data, studioObjects: stripped } };
      }),
    );
  }, [photoRoomInputsSig, showStudio, id, setNodes]);

  /**
   * Sin documento de studio: `data.value` sigue la primera imagen conectada (salida del nodo).
   * Con studio guardado no pisamos `value` aquí; la miniatura usa `previewUrl` en `displayUrl`.
   */
  useEffect(() => {
    setNodes((nds: any) =>
      nds.map((n: any) => {
        if (n.id !== id) return n;
        const objs = n.data?.studioObjects;
        const hasPersistedStudio = Array.isArray(objs) && objs.length > 0;
        if (previewUrl && !hasPersistedStudio) {
          if (n.data?.value === previewUrl && n.data?.type === "image") return n;
          return { ...n, data: { ...n.data, value: previewUrl, type: "image" } };
        }
        if (!anyInputEdge && !hasPersistedStudio && (n.data?.value || n.data?.type === "image")) {
          return { ...n, data: { ...n.data, value: "", type: undefined } };
        }
        return n;
      }),
    );
  }, [anyInputEdge, id, previewUrl, setNodes]);

  /**
   * Miniatura del nodo: con cables, la primera imagen del grafo (actualización inmediata);
   * sin cables, última exportación del studio guardada en `value`.
   */
  const exportedThumb =
    typeof nodeData.value === "string" && nodeData.value.length > 0 ? nodeData.value : null;
  const displayUrl = previewUrl ?? exportedThumb ?? null;

  /** Studio abierto: actualizar miniatura del nodo al cambiar entradas (mismo PNG que al cerrar). */
  useEffect(() => {
    if (!showStudio) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        const api = studioApiRef.current;
        if (!api?.getNodePreviewPngDataUrl || cancelled) return;
        try {
          const url = await api.getNodePreviewPngDataUrl({ maxSide: 720 });
          if (!url || cancelled) return;
          handleStudioExportPreview(url);
        } catch {
          /* noop */
        }
      })();
    }, 520);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [photoRoomInputsSig, showStudio, handleStudioExportPreview]);

  return (
    <div className="custom-node processor-node group/node" style={{ minWidth: 260, maxHeight: 600 }}>
      <FoldderNodeResizerLocal minWidth={260} minHeight={200} maxWidth={520} maxHeight={560} isVisible={selected} />
      <NodeLabel id={id} label={nodeData.label} defaultLabel="PhotoRoom" />

      {visibleSlots.map((sid) => {
        const idx = SLOT_IDS.indexOf(sid as (typeof SLOT_IDS)[number]);
        const ok = connectedBySlot[sid];
        return (
          <div
            key={sid}
            className="handle-wrapper handle-left"
            style={{ top: SLOT_TOP_PCT[sid] ?? `${11 + idx * 11}%` }}
          >
            <FoldderDataHandle type="target" position={Position.Left} id={sid} dataType="image" />
            <span className="handle-label" style={{ color: ok ? "#f59e0b" : undefined }}>
              {ok ? `✓ Imagen ${idx + 1}` : `Imagen ${idx + 1}`}
            </span>
          </div>
        );
      })}

      <div className="handle-wrapper handle-right" style={{ top: "50%" }}>
        <span className="handle-label">Salida imagen</span>
        <FoldderDataHandle type="source" position={Position.Right} id="image" dataType="image" />
      </div>

      <div className="node-header">
        <NodeIcon
          type="photoRoom"
          selected={selected}
          size={16}
          state={resolveFoldderNodeState({ done: !!displayUrl })}
        />
        <FoldderNodeHeaderTitle
          className="min-w-0 flex-1 uppercase leading-tight tracking-tight line-clamp-2"
          introActive={!!(nodeData as { _foldderCanvasIntro?: boolean })._foldderCanvasIntro}
        >
          PhotoRoom
        </FoldderNodeHeaderTitle>
        <div className="node-badge shrink-0">{visibleSlots.length} in</div>
        <ViewerOpenLocal nodeId={id} disabled={!displayUrl} />
      </div>

      <div
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-b-[24px] bg-[#0a0a0a] group/out"
        style={{ minHeight: 120 }}
      >
        {displayUrl ? (
          <img src={displayUrl} alt="" className="max-h-full max-w-full h-auto w-auto object-contain" />
        ) : (
          <div className="flex w-full flex-col items-center justify-center gap-2 py-8">
            <ImageIcon size={28} className="text-zinc-400/50" />
            <span className="text-center text-[7px] font-black uppercase tracking-widest text-zinc-400/60">
              Conecta imágenes
              <br />
              y abre Studio
            </span>
          </div>
        )}
        <PhotoRoomStudioModeButton onClick={() => setShowStudio(true)} />
      </div>

      {showStudio ? (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-[10050] flex items-center justify-center bg-[#0b0d10] text-[13px] text-zinc-400">
              Cargando PhotoRoom…
            </div>
          }
        >
          <PhotoRoomStudioLazy
            open
            nodeId={id}
            objects={studioObjects}
            layoutGuides={studioLayoutGuides}
            artboard={studioArtboard}
            docSetupDone={!!nodeData.photoRoomDocSetupDone}
            connectedImageInputs={photoRoomConnectedInputs}
            studioApiRef={studioApiRef}
            onPersist={persistStudio}
            onExportPreview={handleStudioExportPreview}
            onClose={() => setShowStudio(false)}
          />
        </Suspense>
      ) : null}
    </div>
  );
});

PhotoRoomNode.displayName = "PhotoRoomNode";
