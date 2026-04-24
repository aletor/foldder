"use client";

import React, { memo, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  NodeResizer,
  Position,
  addEdge,
  useEdges,
  useNodeId,
  useNodes,
  useReactFlow,
  useUpdateNodeInternals,
  type NodeProps,
} from "@xyflow/react";
import { ImageIcon, Maximize2 } from "lucide-react";
import { FOLDDER_FIT_VIEW_EASE } from "@/lib/fit-view-ease";
import { defaultDataForCanvasDropNode } from "@/lib/canvas-connect-end-drop";
import { FoldderDataHandle } from "../FoldderDataHandle";
import { NodeIcon, resolveFoldderNodeState } from "../foldder-icons";
import { NodeLabel, FoldderNodeHeaderTitle } from "../foldder-node-ui";
import {
  applyCanvasGroupExpand,
  createCanvasGroupFromNodeIds,
  edgeTargetsMemberInput,
  nodeBoundsForLayout,
  parseCanvasGroupOutHandle,
  resolvePromptValueFromEdgeSource,
} from "../canvas-group-logic";
import { withFoldderCanvasIntro } from "../spaces-canvas-intro";
import type { DesignerStudioApi, FreehandObject } from "../FreehandStudio";
import type { PhotoRoomNodeStudioData } from "./photo-room-types";
import { registerPendingNanoStudioOpenFromPhotoRoom } from "./photo-room-nano-open-pending";

/** Tras `flushSync`, el `useEffect` del Nano aún puede no haber registrado el listener; `requestAnimationFrame` va después. */
function dispatchOpenNanoStudioFromPhotoRoom(nanoNodeId: string, photoRoomNodeId: string) {
  window.dispatchEvent(
    new CustomEvent("foldder-open-nano-studio-from-photo-room", {
      detail: { nanoNodeId, photoRoomNodeId },
    }),
  );
}

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
  const { setNodes, setEdges, getNodes, getEdges, fitView } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const [showStudio, setShowStudio] = useState(false);
  const studioApiRef = useRef<DesignerStudioApi | null>(null);
  const brainConnected = edges.some((e) => e.target === id && e.targetHandle === "brain");

  const studioArtboard = useMemo(() => {
    const ab = nodeData.studioArtboard;
    const wRaw = ab?.width;
    const hRaw = ab?.height;
    const w = typeof wRaw === "number" ? wRaw : Number(wRaw);
    const h = typeof hRaw === "number" ? hRaw : Number(hRaw);
    return {
      id: typeof ab?.id === "string" && ab.id.length > 0 ? ab.id : `pr_ab_${id}`,
      width: Number.isFinite(w) && w > 0 ? Math.round(w) : 1920,
      height: Number.isFinite(h) && h > 0 ? Math.round(h) : 1080,
      background: typeof ab?.background === "string" ? ab.background : "#ffffff",
    };
  }, [id, nodeData.studioArtboard?.id, nodeData.studioArtboard?.width, nodeData.studioArtboard?.height, nodeData.studioArtboard?.background]);

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

  const handlePhotoRoomModificarImagenIA = useCallback(
    (payload: { imageObjectId: string; imageSrc: string; studioNodeKey: string }) => {
      const { imageObjectId, imageSrc, studioNodeKey } = payload;
      const trimmed = imageSrc.trim();
      if (!trimmed) return;

      const flowPhotoRoomId = id;
      const edgesNow = getEdges();
      let slot: string | null = null;
      for (const sid of SLOT_IDS) {
        if (!edgesNow.some((e: any) => edgeTargetsMemberInput(e, flowPhotoRoomId, sid))) {
          slot = sid;
          break;
        }
      }
      if (!slot) {
        window.alert(
          "Todas las entradas de imagen de PhotoRoom están ocupadas. Desconecta una para continuar.",
        );
        return;
      }

      const idx = studioObjects.findIndex((o) => o.id === imageObjectId);
      if (idx === -1) return;
      const oldLayer = studioObjects[idx]!;
      if (oldLayer.type !== "image") return;
      if ((oldLayer as { photoRoomInputSlot?: string }).photoRoomInputSlot) return;

      const nodesNow = getNodes() as any[];
      const prFlowNode = nodesNow.find((n) => n.id === flowPhotoRoomId);
      if (!prFlowNode) return;

      const ts = Date.now();
      const mediaId = `mediaInput_${ts}`;
      const nanoId = `nanoBanana_${ts}`;
      /** Media → Nano Banana → PhotoRoom, alineados en Y al centro del nodo PhotoRoom; hueco según anchos estimados. */
      const FLOW_GAP = 56;
      const prDims = nodeBoundsForLayout(prFlowNode as any);
      const nanoDims = nodeBoundsForLayout({ type: "nanoBanana", position: { x: 0, y: 0 } } as any);
      const mediaDims = nodeBoundsForLayout({ type: "mediaInput", position: { x: 0, y: 0 } } as any);
      const nanoX = prFlowNode.position.x - FLOW_GAP - nanoDims.w;
      const nanoY = prFlowNode.position.y + (prDims.h - nanoDims.h) / 2;
      const mediaPos = {
        x: nanoX - FLOW_GAP - mediaDims.w,
        y: prFlowNode.position.y + (prDims.h - mediaDims.h) / 2,
      };
      const nanoPos = { x: nanoX, y: nanoY };

      const nanoDefaults = defaultDataForCanvasDropNode("nanoBanana") as Record<string, unknown>;
      const mediaNode = {
        id: mediaId,
        type: "mediaInput" as const,
        position: mediaPos,
        data: withFoldderCanvasIntro("mediaInput", {
          value: trimmed,
          type: "image",
          label: "IA · capa PhotoRoom",
        }),
      };
      const nanoNode = {
        id: nanoId,
        type: "nanoBanana" as const,
        position: nanoPos,
        data: withFoldderCanvasIntro("nanoBanana", {
          ...nanoDefaults,
          value: trimmed,
          type: "image",
        }),
      };

      const edgeMN = {
        id: `e_${mediaId}_${nanoId}_${ts}`,
        source: mediaId,
        target: nanoId,
        sourceHandle: "media",
        targetHandle: "image",
        type: "buttonEdge" as const,
      };
      const edgeNP = {
        id: `e_${nanoId}_${flowPhotoRoomId}_${ts}`,
        source: nanoId,
        target: flowPhotoRoomId,
        sourceHandle: "image",
        targetHandle: slot,
        type: "buttonEdge" as const,
      };

      const newLayerId = `${studioNodeKey}__pr_in_${slot}`;
      const newImg = {
        ...oldLayer,
        id: newLayerId,
        src: trimmed,
        photoRoomInputSlot: slot,
        photoRoomPreserveInputFrame: true,
      };
      const nextStudioObjects = [...studioObjects.slice(0, idx), newImg, ...studioObjects.slice(idx + 1)];

      const nextPrIndex = (() => {
        let max = 0;
        for (const n of nodesNow) {
          if (n.type !== "canvasGroup") continue;
          const lab = String((n.data as { label?: string })?.label ?? "").trim();
          const m = /^imagen_(\d+)_PR$/i.exec(lab);
          if (m) max = Math.max(max, parseInt(m[1]!, 10));
        }
        return max + 1;
      })();
      const groupLabel = `imagen_${nextPrIndex}_PR`;

      const withTwo = [...nodesNow, mediaNode, nanoNode];
      const grouped = createCanvasGroupFromNodeIds([mediaId, nanoId], withTwo, groupLabel);
      if (!grouped) return;

      const beforeIds = new Set(nodesNow.map((n: { id: string }) => n.id));
      const groupMeta = grouped.nodes.find(
        (n: any) => n.type === "canvasGroup" && !beforeIds.has(n.id),
      ) as { id: string } | undefined;
      const groupId = groupMeta?.id;
      if (!groupId) return;

      const mergedNodes = grouped.nodes.map((n: any) =>
        n.id === flowPhotoRoomId ? { ...n, data: { ...n.data, studioObjects: nextStudioObjects } } : n,
      );

      /**
       * Grupo expandido al crear: si se aplica `applyCanvasGroupCollapse` aquí, XYFlow pone `hidden` en los
       * hijos y `NodeWrapper` hace `return null` — el Nano no monta y no puede abrir Studio (pending ni evento).
       * El marco `imagen_N_PR` se pliega al cerrar el Nano Studio (`CustomNodes` → `closeNanoStudio`).
       */
      const edgesWithChains = addEdge(edgeNP, addEdge(edgeMN, edgesNow as any));

      registerPendingNanoStudioOpenFromPhotoRoom(nanoId, flowPhotoRoomId);

      flushSync(() => {
        setShowStudio(false);
        setNodes(mergedNodes as any);
        setEdges(edgesWithChains as any);
      });

      requestAnimationFrame(() => {
        updateNodeInternals(flowPhotoRoomId);
        updateNodeInternals(groupId);
        updateNodeInternals(mediaId);
        updateNodeInternals(nanoId);
        void fitView({
          nodes: [{ id: groupId }, { id: flowPhotoRoomId }],
          padding: 0.45,
          duration: 560,
          interpolate: "smooth",
          ...FOLDDER_FIT_VIEW_EASE,
        });
        dispatchOpenNanoStudioFromPhotoRoom(nanoId, flowPhotoRoomId);
        queueMicrotask(() => {
          studioApiRef.current?.setSelectedIds(new Set([newLayerId]));
        });
      });
    },
    [id, getEdges, getNodes, setNodes, setEdges, studioObjects, updateNodeInternals, fitView, studioApiRef, setShowStudio],
  );

  /**
   * Desconectar el cable y limpiar backup/grupo: debe hacerse en SpacesContent vía evento, porque
   * `useEdgesState` controla las aristas allí y `useReactFlow().setEdges` desde este nodo no las actualiza.
   */
  const handlePhotoRoomRasterizeInputImage = useCallback(
    (payload: { imageObjectId: string; photoRoomInputSlot: string; studioObjects: FreehandObject[] }) => {
      const slot = payload.photoRoomInputSlot.trim();
      if (!slot) return;
      if (!Array.isArray(payload.studioObjects)) return;
      window.dispatchEvent(
        new CustomEvent("foldder-photoroom-disconnect-slot", {
          detail: { photoRoomNodeId: id, slot, studioObjects: payload.studioObjects },
        }),
      );
    },
    [id],
  );

  /** Capa con ranura: abrir el Nano Banana que alimenta ese cable (mismo evento que tras crear el flujo desde capa local). */
  const handlePhotoRoomOpenConnectedNanoStudio = useCallback(
    (payload: { photoRoomInputSlot: string }) => {
      const slot = payload.photoRoomInputSlot.trim();
      if (!slot) return;
      const edgesNow = getEdges();
      const nodesNow = getNodes() as any[];
      const incoming = edgesNow.find((ed: any) => edgeTargetsMemberInput(ed, id, slot));
      if (!incoming?.source) {
        window.alert(
          "No hay conexión a esta ranura en el grafo. Comprueba el cable o crea el flujo desde «Modificar imagen con IA» en una capa local.",
        );
        return;
      }
      const src = nodesNow.find((n: any) => n.id === incoming.source);
      let nanoFlowId: string | null = null;
      if (src?.type === "nanoBanana") {
        nanoFlowId = incoming.source;
      } else if (src?.type === "canvasGroup" && incoming.sourceHandle?.startsWith("g_out_")) {
        const p = parseCanvasGroupOutHandle(incoming.sourceHandle);
        if (p) {
          const inner = nodesNow.find((n: any) => n.id === p.memberId);
          if (inner?.type === "nanoBanana") nanoFlowId = p.memberId;
        }
      }
      if (!nanoFlowId) {
        window.alert(
          "Esta entrada no viene de un Nano Banana (p. ej. grupo plegado o otro tipo de nodo). Expande el marco del grupo o conecta la salida de imagen de un Nano a esta ranura.",
        );
        return;
      }

      registerPendingNanoStudioOpenFromPhotoRoom(nanoFlowId, id);

      let nextNodes = nodesNow;
      let nextEdges = edgesNow as any[];
      const nanoN = nodesNow.find((n: any) => n.id === nanoFlowId);
      const parentId = nanoN?.parentId as string | undefined;
      if (parentId) {
        const parent = nodesNow.find((n: any) => n.id === parentId && n.type === "canvasGroup");
        if (parent && (parent.data as { collapsed?: boolean })?.collapsed) {
          const expanded = applyCanvasGroupExpand(parentId, nodesNow as any, edgesNow as any);
          if (expanded) {
            nextNodes = expanded.nodes as any[];
            nextEdges = expanded.edges as any[];
          }
        }
      }

      flushSync(() => {
        setShowStudio(false);
        if (nextNodes !== nodesNow) {
          setNodes(nextNodes as any);
          setEdges(nextEdges as any);
        }
      });

      requestAnimationFrame(() => {
        dispatchOpenNanoStudioFromPhotoRoom(nanoFlowId, id);
      });
    },
    [id, getEdges, getNodes, setNodes, setEdges, setShowStudio],
  );

  const connectedBySlot = useMemo(() => {
    const m: Record<string, boolean> = {};
    for (const sid of SLOT_IDS) {
      m[sid] = edges.some((e: any) => edgeTargetsMemberInput(e, id, sid));
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

  const refreshHandleGeometry = useCallback(() => {
    const run = () => updateNodeInternals(id);
    requestAnimationFrame(() => {
      run();
      requestAnimationFrame(run);
    });
    window.setTimeout(run, 140);
  }, [id, updateNodeInternals]);

  useEffect(() => {
    refreshHandleGeometry();
  }, [refreshHandleGeometry, visibleSlots.join(",")]);

  useEffect(() => {
    const raf = requestAnimationFrame(() => refreshHandleGeometry());
    const t = window.setTimeout(() => refreshHandleGeometry(), 180);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
    };
  }, [refreshHandleGeometry, brainConnected, showStudio, studioObjects.length, nodeData.value]);

  /** Volver desde Nano Banana Studio (flujo «Modificar imagen con IA»): reabrir este PhotoRoom en Studio. */
  useEffect(() => {
    const openStudio = (ev: Event) => {
      const d = (ev as CustomEvent<{ photoRoomNodeId: string }>).detail;
      if (d?.photoRoomNodeId !== id) return;
      setShowStudio(true);
    };
    window.addEventListener("foldder-open-photo-room-studio", openStudio as EventListener);
    return () => window.removeEventListener("foldder-open-photo-room-studio", openStudio as EventListener);
  }, [id]);

  const previewUrl = useMemo(() => {
    for (const sid of SLOT_IDS) {
      const e = edges.find((ed: any) => edgeTargetsMemberInput(ed, id, sid));
      if (!e) continue;
      const v = resolvePromptValueFromEdgeSource(e, nodes as any);
      if (typeof v === "string" && v) return v;
    }
    return null;
  }, [edges, id, nodes]);

  const anyInputEdge = useMemo(
    () => SLOT_IDS.some((sid) => edges.some((e: any) => edgeTargetsMemberInput(e, id, sid))),
    [edges, id],
  );

  /** Imágenes conectadas por slot → capas PhotoRoom (no eliminables en Studio). */
  const photoRoomConnectedInputs = useMemo(() => {
    const out: { slot: string; src: string }[] = [];
    for (const sid of SLOT_IDS) {
      const e = edges.find((ed: any) => edgeTargetsMemberInput(ed, id, sid));
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

      <div className="handle-wrapper handle-left" style={{ top: "96%" }}>
        <FoldderDataHandle type="target" position={Position.Left} id="brain" dataType="brain" />
        <span className="handle-label">Brain</span>
      </div>

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
          <img
            src={displayUrl}
            alt=""
            className="max-h-full max-w-full h-auto w-auto object-contain"
            onLoad={refreshHandleGeometry}
            onError={refreshHandleGeometry}
          />
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
            brainConnected={brainConnected}
            docSetupDone={!!nodeData.photoRoomDocSetupDone}
            connectedImageInputs={photoRoomConnectedInputs}
            studioApiRef={studioApiRef}
            onPhotoRoomModificarImagenIA={handlePhotoRoomModificarImagenIA}
            onPhotoRoomRasterizeInputImage={handlePhotoRoomRasterizeInputImage}
            onPhotoRoomOpenConnectedNanoStudio={handlePhotoRoomOpenConnectedNanoStudio}
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
