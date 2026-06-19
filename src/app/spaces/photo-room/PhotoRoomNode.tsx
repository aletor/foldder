"use client";

import React, { memo, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  NodeResizer,
  addEdge,
  useNodeId,
  useReactFlow,
  useStore,
  useUpdateNodeInternals,
  type Edge,
  type Node,
  type NodeProps,
  type ReactFlowState,
} from "@xyflow/react";
import { shallow } from "zustand/shallow";
import { FOLDDER_FIT_VIEW_EASE } from "@/lib/fit-view-ease";
import { defaultDataForCanvasDropNode } from "@/lib/canvas-connect-end-drop";
import { FoldderStudioModeCenterButton } from "../foldder-node-ui";
import { nodeFrameNeedsSync, resolveAspectLockedNodeFrame, resolveNodeChromeHeight } from "../studio-node-aspect";
import {
  applyCanvasGroupExpand,
  createCanvasGroupFromNodeIds,
  edgeTargetsMemberInput,
  nodeBoundsForLayout,
  parseCanvasGroupOutHandle,
  resolvePromptValueFromEdgeSourceMap,
} from "../canvas-group-logic";
import { withFoldderCanvasIntro } from "../spaces-canvas-intro";
import { FOLDDER_REGISTER_CANVAS_INTRO_EVENT } from "../hooks/use-foldder-canvas-intro";
import type { DesignerStudioApi, FreehandObject } from "../FreehandStudio";
import { DesignerPagePreview } from "../designer/DesignerPagePreview";
import { dispatchFoldderExportCreated } from "../foldder-export-events";
import { StudioCanvasNodeShell, type StudioCanvasNodeHandleSpec } from "../studio-node/studio-canvas-node";
import { hasFoldderStudioTouched, touchStudioNodeData } from "../studio-node/foldder-studio-touched";
import { useStudioNodeController } from "../studio-node/studio-node-architecture";
import {
  clearLiveStudioNodeData,
  registerLiveStudioExport,
  setLiveStudioNodeData,
  unregisterLiveStudioExport,
} from "../studio-live-documents";
import { nodeFrameFromSnapshot, selectNodeFrameSnapshot } from "../react-flow-selectors";
import { useCanvasPerformanceModeRef } from "../use-canvas-performance-mode";
import { useFoldderRenderMetric } from "../use-performance-metrics";
import { useNodeViewportVisibility } from "../use-node-viewport-visibility";
import type { PhotoRoomNodeStudioData } from "./photo-room-types";
import { registerPendingNanoStudioOpenFromPhotoRoom } from "./photo-room-nano-open-pending";
import { isFoldderLibraryPreviewData } from "../library-drag-preview";

/** Tras `flushSync`, el `useEffect` del Nano aún puede no haber registrado el listener; `requestAnimationFrame` va después. */
function dispatchOpenNanoStudioFromPhotoRoom(nanoNodeId: string, photoRoomNodeId: string) {
  window.dispatchEvent(
    new CustomEvent("foldder-open-nano-studio-from-photo-room", {
      detail: { nanoNodeId, photoRoomNodeId },
    }),
  );
}

const NODE_RESIZE_END_FIT_PADDING = 0.8;
const PHOTOROOM_NODE_MAX_WIDTH = 960;
const PHOTOROOM_NODE_MAX_HEIGHT = 2200;
const PHOTOROOM_EMPTY_BACKGROUND_SRC = "/assets/nodes/photoroom-empty-purple.jpg";

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

function selectPhotoRoomFlowSnapshot(state: ReactFlowState<Node, Edge>, nodeId: string): string[] {
  const result = new Array<string>(1 + SLOT_IDS.length * 2).fill("");
  let brainConnected = false;
  const slotEdges = new Map<string, Edge>();

  for (const edge of state.edges) {
    if (!brainConnected && edge.target === nodeId && edge.targetHandle === "brain") {
      brainConnected = true;
    }
    for (const slotId of SLOT_IDS) {
      if (!slotEdges.has(slotId) && edgeTargetsMemberInput(edge, nodeId, slotId)) {
        slotEdges.set(slotId, edge);
      }
    }
  }

  const nodesById = state.nodeLookup as unknown as ReadonlyMap<string, Node>;
  result[0] = brainConnected ? "1" : "0";
  SLOT_IDS.forEach((slotId, index) => {
    const edge = slotEdges.get(slotId);
    const base = 1 + index * 2;
    result[base] = edge ? "1" : "0";
    result[base + 1] = edge ? resolvePromptValueFromEdgeSourceMap(edge, nodesById) : "";
  });

  return result;
}

function PhotoRoomLibraryPreviewCard({
  id,
  selected,
  label,
}: {
  id: string;
  selected?: boolean;
  label?: string;
}) {
  return (
    <StudioCanvasNodeShell
      nodeId={id}
      nodeType="photoRoom"
      selected={selected}
      label={label}
      defaultLabel="PhotoRoom"
      title="PhotoRoom"
      headerIcon={
        <span className="flex h-5 w-5 items-center justify-center rounded-none bg-[#63d4fd]">
          <img src="/photoroom_icon.svg" alt="" className="h-3.5 w-3.5 object-contain" draggable={false} />
        </span>
      }
      titleClassName="min-w-0 flex-1 uppercase leading-tight tracking-tight line-clamp-2"
      baseClassName="custom-node processor-node photo-room-node"
      className="group/node foldder-frameless-label-dark"
      handles={[]}
      variant="frameless"
      material="media"
    >
      <div className="foldder-frameless-main relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-[#0a0a0a]">
        <div className="photoroom-empty-background relative h-full w-full overflow-hidden" aria-hidden>
          <img
            src={PHOTOROOM_EMPTY_BACKGROUND_SRC}
            alt=""
            className="h-full w-full object-contain object-bottom"
            draggable={false}
          />
        </div>
      </div>
    </StudioCanvasNodeShell>
  );
}

export const PhotoRoomNode = memo(({ id, data, selected }: NodeProps<any>) => {
  useFoldderRenderMetric("PhotoRoomNode", id);
  const nodeData = data as PhotoRoomNodeData;
  const isLibraryPreview = isFoldderLibraryPreviewData(nodeData);
  const [liveStudioData, setLiveStudioData] = useState<Partial<PhotoRoomNodeData> | null>(null);
  const liveStudioDataRef = useRef<Partial<PhotoRoomNodeData> | null>(null);
  const { setNodes, setEdges, getNodes, getEdges, fitView } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const {
    isStudioOpen: showStudio,
    setIsStudioOpen: setShowStudio,
    standardShell,
    openStudio,
    closeStudio,
  } = useStudioNodeController({
    nodeId: id,
    nodeType: "photoRoom",
    enabled: !isLibraryPreview,
    openEvents: ["foldder-open-photo-room-studio"],
    matchOpen: (detail) => detail.nodeId === id || detail.photoRoomNodeId === id,
    matchClose: (detail) => detail.nodeId === id || detail.photoRoomNodeId === id,
  });
  const showStudioRef = useRef(showStudio);
  useLayoutEffect(() => {
    showStudioRef.current = showStudio;
  }, [showStudio]);
  const studioApiRef = useRef<DesignerStudioApi | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const frameSyncKeyRef = useRef<string | null>(null);
  const nodeMediaVisible = useNodeViewportVisibility(id, 900, selected);
  const canvasPerformanceModeRef = useCanvasPerformanceModeRef(
    useCallback((active: boolean) => {
      if (!active) requestAnimationFrame(() => updateNodeInternals(id));
    }, [id, updateNodeInternals]),
  );
  const currentNodeFrameSnapshot = useStore(
    useCallback((state: ReactFlowState<Node, Edge>) => selectNodeFrameSnapshot(state, id), [id]),
    shallow,
  );
  const photoRoomFlowSnapshot = useStore(
    useCallback((state: ReactFlowState<Node, Edge>) => selectPhotoRoomFlowSnapshot(state, id), [id]),
    shallow,
  );
  const currentNodeFrame = nodeFrameFromSnapshot(currentNodeFrameSnapshot);
  const brainConnected = photoRoomFlowSnapshot[0] === "1";
  const effectiveNodeData = showStudio && liveStudioData ? { ...nodeData, ...liveStudioData } : nodeData;

  const studioArtboard = useMemo(() => {
    const ab = effectiveNodeData.studioArtboard;
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
  }, [
    id,
    effectiveNodeData.studioArtboard?.id,
    effectiveNodeData.studioArtboard?.width,
    effectiveNodeData.studioArtboard?.height,
    effectiveNodeData.studioArtboard?.background,
  ]);

  const studioObjects = useMemo(
    () => (Array.isArray(effectiveNodeData.studioObjects) ? effectiveNodeData.studioObjects : []),
    [effectiveNodeData.studioObjects],
  );

  const studioLayoutGuides = useMemo(
    () => (Array.isArray(effectiveNodeData.studioLayoutGuides) ? effectiveNodeData.studioLayoutGuides : []),
    [effectiveNodeData.studioLayoutGuides],
  );

  const persistStudio = useCallback(
    (patch: Partial<PhotoRoomNodeStudioData> & { value?: string; type?: string }) => {
      if (showStudioRef.current) {
        const next = { ...(liveStudioDataRef.current ?? {}), ...patch };
        liveStudioDataRef.current = next;
        setLiveStudioNodeData(id, next as Record<string, unknown>);
        setLiveStudioData(next);
        return;
      }
      setNodes((nds: Node[]) =>
        nds.map((n) =>
          n.id === id ? { ...n, data: { ...((n.data ?? {}) as Record<string, unknown>), ...patch } } : n,
        ),
      );
    },
    [id, setNodes],
  );

  const commitLivePhotoRoomData = useCallback(() => {
    const patch = liveStudioDataRef.current;
    if (!patch || Object.keys(patch).length === 0) {
      clearLiveStudioNodeData(id);
      liveStudioDataRef.current = null;
      setLiveStudioData(null);
      return;
    }
    const { previewThumb: _previewThumb, ...persistPatch } = patch as PhotoRoomNodeData & {
      previewThumb?: string;
    };
    clearLiveStudioNodeData(id);
    liveStudioDataRef.current = null;
    setLiveStudioData(null);
    setNodes((nds: Node[]) =>
      nds.map((n) =>
        n.id === id
          ? { ...n, data: touchStudioNodeData(n.data as Record<string, unknown>, persistPatch as Record<string, unknown>) }
          : n,
      ),
    );
  }, [id, setNodes]);

  useEffect(() => () => clearLiveStudioNodeData(id), [id]);

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
        showStudioRef.current = false;
        setShowStudio(false);
        setNodes(mergedNodes as any);
        setEdges(edgesWithChains as any);
      });

      window.dispatchEvent(
        new CustomEvent(FOLDDER_REGISTER_CANVAS_INTRO_EVENT, {
          detail: { nodeIds: [mediaId, nanoId] },
        }),
      );

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
          "Esta entrada no viene de un nodo Image Creation (p. ej. grupo plegado u otro tipo de nodo). Expande el marco del grupo o conecta la salida de imagen de Image Creation a esta ranura.",
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
        showStudioRef.current = false;
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
    SLOT_IDS.forEach((sid, index) => {
      m[sid] = photoRoomFlowSnapshot[1 + index * 2] === "1";
    });
    return m;
  }, [photoRoomFlowSnapshot]);

  const photoRoomConnectedInputs = useMemo(() => {
    const out: { slot: string; src: string }[] = [];
    SLOT_IDS.forEach((sid, index) => {
      const src = photoRoomFlowSnapshot[1 + index * 2 + 1]?.trim() ?? "";
      if (src.length > 0) out.push({ slot: sid, src });
    });
    return out;
  }, [photoRoomFlowSnapshot]);

  const previewUrl = photoRoomConnectedInputs[0]?.src ?? null;
  const anyInputEdge = useMemo(
    () => SLOT_IDS.some((_, index) => photoRoomFlowSnapshot[1 + index * 2] === "1"),
    [photoRoomFlowSnapshot],
  );

  const visibleSlots = useMemo(() => {
    const out: string[] = [];
    for (let i = 0; i < SLOT_IDS.length; i++) {
      const sid = SLOT_IDS[i]!;
      if (i === 0 || connectedBySlot[SLOT_IDS[i - 1]!]) out.push(sid);
    }
    return out;
  }, [connectedBySlot]);

  const nodeHandles = useMemo<StudioCanvasNodeHandleSpec[]>(() => [
    ...visibleSlots.map((sid) => {
      const idx = SLOT_IDS.indexOf(sid as (typeof SLOT_IDS)[number]);
      const ok = connectedBySlot[sid];
      return {
        side: "left" as const,
        top: SLOT_TOP_PCT[sid] ?? `${11 + idx * 11}%`,
        type: "target" as const,
        id: sid,
        dataType: "image" as const,
        label: ok ? `✓ Imagen ${idx + 1}` : `Imagen ${idx + 1}`,
        labelStyle: ok ? { color: "#f59e0b" } : undefined,
      };
    }),
    { side: "left", top: "96%", type: "target", id: "brain", dataType: "brain", label: "Brain" },
    { side: "right", top: "50%", type: "source", id: "image", dataType: "image", label: "Salida imagen" },
  ], [connectedBySlot, visibleSlots]);

  const refreshHandleGeometry = useCallback(() => {
    if (canvasPerformanceModeRef.current) return;
    const run = () => updateNodeInternals(id);
    requestAnimationFrame(() => {
      run();
      requestAnimationFrame(run);
    });
    window.setTimeout(run, 140);
  }, [id, updateNodeInternals]);

  useEffect(() => {
    if (isLibraryPreview) return;
    refreshHandleGeometry();
  }, [isLibraryPreview, refreshHandleGeometry, visibleSlots.join(",")]);

  useEffect(() => {
    if (isLibraryPreview) return;
    const raf = requestAnimationFrame(() => refreshHandleGeometry());
    const t = window.setTimeout(() => refreshHandleGeometry(), 180);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
    };
  }, [isLibraryPreview, refreshHandleGeometry, brainConnected, showStudio, studioObjects.length, effectiveNodeData.value]);

  const photoRoomInputsSig = useMemo(
    () => photoRoomConnectedInputs.map((c) => `${c.slot}:${c.src}`).join("|"),
    [photoRoomConnectedInputs],
  );

  /**
   * Studio cerrado: quitar del documento persistido las capas de entrada sin cable (no vaciar `value`:
   * la miniatura usa preview/export vía `displayUrl` y borrar el PNG exportado dejaba el thumb negro).
   */
  useEffect(() => {
    if (isLibraryPreview || showStudio) return;
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
  }, [isLibraryPreview, photoRoomInputsSig, showStudio, id, setNodes]);

  /**
   * Sin documento de studio: `data.value` sigue la primera imagen conectada (salida del nodo).
   * Con studio guardado no pisamos `value` aquí; la miniatura usa `previewUrl` en `displayUrl`.
   */
  useEffect(() => {
    if (isLibraryPreview || showStudio) return;
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
  }, [anyInputEdge, id, isLibraryPreview, previewUrl, setNodes, showStudio]);

  /**
   * Miniatura del nodo:
   * - si hay documento de Studio persistido, priorizar siempre el render exportado (`value`);
   * - si no hay Studio persistido, usar la primera imagen conectada como preview rápida.
   *
   * Esto evita que, al salir de Studio con entradas conectadas, la miniatura externa vuelva
   * a mostrar el input crudo en vez del resultado editado.
   */
  const hasPersistedStudio = Array.isArray(studioObjects) && studioObjects.length > 0;
  const exportedThumb =
    typeof effectiveNodeData.value === "string" && effectiveNodeData.value.length > 0 ? effectiveNodeData.value : null;
  const livePreviewThumb =
    typeof (effectiveNodeData as { previewThumb?: string }).previewThumb === "string" &&
    (effectiveNodeData as { previewThumb?: string }).previewThumb!.length > 0
      ? (effectiveNodeData as { previewThumb?: string }).previewThumb!
      : null;
  const displayUrl =
    showStudio && livePreviewThumb
      ? livePreviewThumb
      : hasPersistedStudio
        ? exportedThumb ?? previewUrl ?? null
        : previewUrl ?? exportedThumb ?? null;
  const showPersistedPhotoRoomPreview = hasPersistedStudio && Boolean(displayUrl) && nodeMediaVisible;

  /** Studio abierto: miniatura ligera en el nodo (no pisa `value`, salida del grafo = export completo al cerrar). */
  useEffect(() => {
    if (isLibraryPreview || !showStudio) return;
    if (canvasPerformanceModeRef.current) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        const api = studioApiRef.current;
        if (!api?.getNodePreviewPngDataUrl || cancelled) return;
        try {
          const url = await api.getNodePreviewPngDataUrl({ maxSide: 480 });
          if (!url || cancelled) return;
          if (showStudioRef.current) {
            const next = { ...(liveStudioDataRef.current ?? {}), previewThumb: url };
            liveStudioDataRef.current = next;
            setLiveStudioNodeData(id, next as Record<string, unknown>);
            setLiveStudioData(next);
            return;
          }
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
  }, [isLibraryPreview, photoRoomInputsSig, showStudio, handleStudioExportPreview, id]);

  /** Permite a Image Describer exportar el lienzo abierto sin cerrar PhotoRoom. */
  useEffect(() => {
    if (isLibraryPreview || !showStudio) {
      unregisterLiveStudioExport(id);
      return;
    }
    let cancelled = false;
    const tryRegister = () => {
      if (cancelled) return true;
      const api = studioApiRef.current;
      if (!api?.getNodePreviewPngDataUrl) return false;
      registerLiveStudioExport(id, (opts) => api.getNodePreviewPngDataUrl!(opts));
      return true;
    };
    if (tryRegister()) {
      return () => {
        cancelled = true;
        unregisterLiveStudioExport(id);
      };
    }
    const interval = window.setInterval(() => {
      if (tryRegister()) window.clearInterval(interval);
    }, 120);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      unregisterLiveStudioExport(id);
    };
  }, [id, isLibraryPreview, showStudio]);

  useLayoutEffect(() => {
    if (isLibraryPreview) return;
    const syncKey = `${studioArtboard.width}x${studioArtboard.height}`;
    if (frameSyncKeyRef.current === syncKey) return;
    const chromeHeight = resolveNodeChromeHeight(frameRef.current, previewRef.current);
    const nextFrame = resolveAspectLockedNodeFrame({
      node: currentNodeFrame,
      contentWidth: studioArtboard.width,
      contentHeight: studioArtboard.height,
      minWidth: 200,
      maxWidth: PHOTOROOM_NODE_MAX_WIDTH,
      minHeight: 120,
      maxHeight: PHOTOROOM_NODE_MAX_HEIGHT,
      chromeHeight,
    });
    frameSyncKeyRef.current = syncKey;
    const nextAspectRatio = studioArtboard.width / studioArtboard.height;
    setNodes((nds: any) =>
      nds.map((node: any) => {
        if (node.id !== id) return node;
        const needsFrameSync = nodeFrameNeedsSync(node, nextFrame);
        const currentAspectRatio =
          typeof node.data?._foldderAspectRatio === "number" ? node.data._foldderAspectRatio : null;
        const needsAspectSync =
          currentAspectRatio === null || Math.abs(currentAspectRatio - nextAspectRatio) > 0.0001;
        if (!needsFrameSync && !needsAspectSync) return node;
        return {
          ...node,
          ...(needsFrameSync ? { width: nextFrame.width, height: nextFrame.height } : {}),
          data: { ...node.data, _foldderAspectRatio: nextAspectRatio },
          style: needsFrameSync ? { ...node.style, width: nextFrame.width, height: nextFrame.height } : node.style,
        };
      }),
    );
    requestAnimationFrame(() => updateNodeInternals(id));
  }, [id, isLibraryPreview, setNodes, studioArtboard.height, studioArtboard.width, updateNodeInternals]);

  if (isLibraryPreview) {
    return (
      <PhotoRoomLibraryPreviewCard
        id={id}
        selected={selected}
        label={effectiveNodeData.label}
      />
    );
  }

  return (
    <StudioCanvasNodeShell
      ref={frameRef}
      nodeId={id}
      nodeType="photoRoom"
      selected={selected}
      label={effectiveNodeData.label}
      defaultLabel="PhotoRoom"
      title="PhotoRoom"
      badge={`${visibleSlots.length} in`}
      headerIcon={
        <span className="flex h-5 w-5 items-center justify-center rounded-none bg-[#63d4fd]">
          <img src="/photoroom_icon.svg" alt="" className="h-3.5 w-3.5 object-contain" draggable={false} />
        </span>
      }
      titleClassName="min-w-0 flex-1 uppercase leading-tight tracking-tight line-clamp-2"
      badgeClassName="shrink-0"
      baseClassName="custom-node processor-node photo-room-node"
      className="group/node foldder-frameless-label-dark"
      minWidth={200}
      handles={nodeHandles}
      variant="frameless"
      material="media"
      introActive={!!(nodeData as { _foldderCanvasIntro?: boolean })._foldderCanvasIntro}
      studioTouched={hasFoldderStudioTouched(effectiveNodeData as Record<string, unknown>)}
    >
      <FoldderNodeResizerLocal
        minWidth={200}
        minHeight={120}
        maxWidth={PHOTOROOM_NODE_MAX_WIDTH}
        maxHeight={PHOTOROOM_NODE_MAX_HEIGHT}
        keepAspectRatio
        isVisible={selected}
      />

      <div
        ref={previewRef}
        className="foldder-frameless-main relative flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        {showPersistedPhotoRoomPreview ? (
          <div className="absolute inset-0 overflow-hidden" aria-hidden>
            <img
              src={displayUrl ?? ""}
              alt=""
              className="h-full w-full object-cover"
              onLoad={refreshHandleGeometry}
              onError={refreshHandleGeometry}
            />
          </div>
        ) : hasPersistedStudio ? (
          <div
            className="absolute inset-0 overflow-hidden bg-[#fafafa]"
            style={{
              aspectRatio: `${Math.max(1, studioArtboard.width)} / ${Math.max(1, studioArtboard.height)}`,
            }}
          >
            <DesignerPagePreview
              objects={studioObjects}
              pageWidth={studioArtboard.width}
              pageHeight={studioArtboard.height}
              renderImages={nodeMediaVisible}
            />
          </div>
        ) : (
          <div className="photoroom-empty-background absolute inset-0 overflow-hidden" aria-hidden>
            <img
              src={PHOTOROOM_EMPTY_BACKGROUND_SRC}
              alt=""
              className="h-full w-full object-contain object-bottom"
              draggable={false}
              onLoad={refreshHandleGeometry}
              onError={refreshHandleGeometry}
            />
          </div>
        )}
        <div className="relative z-10 flex min-h-0 flex-1 flex-col pointer-events-none">
          <div className="flex-1" />
          <FoldderStudioModeCenterButton onClick={() => {
            showStudioRef.current = true;
            openStudio();
          }} />
        </div>
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
            docSetupDone={!!effectiveNodeData.photoRoomDocSetupDone}
            connectedImageInputs={photoRoomConnectedInputs}
            studioApiRef={studioApiRef}
            onPhotoRoomModificarImagenIA={handlePhotoRoomModificarImagenIA}
            onPhotoRoomRasterizeInputImage={handlePhotoRoomRasterizeInputImage}
            onPhotoRoomOpenConnectedNanoStudio={handlePhotoRoomOpenConnectedNanoStudio}
            onPersist={persistStudio}
            onExportPreview={handleStudioExportPreview}
            onFinalExport={(detail) => {
              dispatchFoldderExportCreated({ ...detail, sourceNodeId: id });
            }}
            standardShell={standardShell ?? undefined}
            onClose={() => {
              showStudioRef.current = false;
              commitLivePhotoRoomData();
              closeStudio({ notifyStandardShell: true });
            }}
          />
        </Suspense>
      ) : null}
    </StudioCanvasNodeShell>
  );
});

PhotoRoomNode.displayName = "PhotoRoomNode";
