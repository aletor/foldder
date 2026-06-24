"use client";

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  NodeResizer,
  useReactFlow,
  useStore,
  type Edge,
  type Node,
  type NodeProps,
  type ReactFlowState,
} from "@xyflow/react";
import { StudioCanvasNodeShell, type StudioCanvasNodeHandleSpec } from "../studio-node/studio-canvas-node";
import { StudioNodePortal, useStudioNodeController } from "../studio-node/studio-node-architecture";
import { FoldderStudioModeCenterButton } from "../foldder-node-ui";
import { hasFoldderStudioTouched, touchStudioNodeData } from "../studio-node/foldder-studio-touched";
import { resolveFoldderNodeStudioBackground } from "../studio-node/foldder-studio-node-backgrounds";
import { useFoldderRenderMetric } from "../use-performance-metrics";
import {
  FoldderStudioHeader,
  foldderStudioHeaderActionClassName,
} from "../FoldderStudioHeader";
import { DATASET_STUDIO_ACCENT } from "./DatasetStudioChrome";
import { datasetScopeSummaryTag } from "./dataset-scope-copy";
import type { Dataset, DatasetNodeData, DatasetPreview } from "./dataset-types";
import { createDataset, normalizeDataset, setScope, validate } from "./dataset-logic";
import { DatasetStudio } from "./DatasetStudio";
import { DatasetConnectModal } from "./DatasetConnectModal";
import { DatasetAddChooser } from "./DatasetAddChooser";
import { useDatasetCanvasContext } from "./dataset-canvas-context";
import { deleteGlobalDataset, fetchGlobalDataset, listGlobalDatasets, saveGlobalDataset, type DatasetListItem } from "./dataset-api";
import { buildDatasetPreview } from "./dataset-project";
import { isFoldderLibraryPreviewData } from "../library-drag-preview";

const DATASET_EMPTY_BACKGROUND_SRC = resolveFoldderNodeStudioBackground("dataset");

/** Nombres legibles por tipo de nodo (fallback: el propio tipo capitalizado). */
const NODE_TYPE_LABELS: Record<string, string> = {
  designer: "Designer",
  presenter: "Presenter",
  listado: "Listado",
  guionista: "Guionista",
  cine: "Cine",
  nanoBanana: "Nano Banana",
  imageCreationAdvanced: "Image Creation",
  photoRoom: "PhotoRoom",
  videoEditor: "Video Editor",
  video_editor: "Video Editor",
  geminiVideo: "Gemini Video",
  vfxGenerator: "VFX",
  painter: "Painter",
};

function friendlyNodeName(type: string, label: string): string {
  const trimmed = label.trim();
  if (trimmed) return trimmed;
  if (NODE_TYPE_LABELS[type]) return NODE_TYPE_LABELS[type];
  if (!type) return "Nodo";
  return type.charAt(0).toUpperCase() + type.slice(1);
}

type DatasetConsumerInfo = { id: string; type: string; label: string };

/** Nodos del lienzo conectados al handle source `dataset` (consumidores de este Dataset). */
function selectDatasetConsumers(state: ReactFlowState<Node, Edge>, datasetNodeId: string): string {
  const out: DatasetConsumerInfo[] = [];
  const seen = new Set<string>();
  for (const edge of state.edges) {
    if (edge.source !== datasetNodeId) continue;
    if (seen.has(edge.target)) continue;
    const target = state.nodes.find((node) => node.id === edge.target);
    if (!target) continue;
    seen.add(edge.target);
    out.push({
      id: target.id,
      type: target.type ?? "",
      label: typeof (target.data as { label?: unknown } | undefined)?.label === "string"
        ? ((target.data as { label?: string }).label ?? "")
        : "",
    });
  }
  // Firma estable: solo cambia cuando cambia la lista/identidad/etiqueta de consumidores.
  return JSON.stringify(out);
}

const DATASET_NODE_HANDLES: StudioCanvasNodeHandleSpec[] = [
  {
    side: "right",
    top: "50%",
    style: { transform: "translateY(-50%)" },
    type: "source",
    id: "dataset",
    dataType: "dataset",
    label: "Dataset",
  },
];

function localDatasetFromNode(data: DatasetNodeData, projectScopeId: string): Dataset {
  if (data.dataset) return normalizeDataset(data.dataset);
  return createDataset(data.label?.trim() || "Dataset", "local", projectScopeId);
}

function previewFromDataset(dataset: Dataset): DatasetPreview {
  return buildDatasetPreview(normalizeDataset(dataset));
}

function cardViewFromNode(data: DatasetNodeData, projectScopeId: string) {
  if (data.datasetRef) {
    const preview = data.datasetPreview;
    return {
      name: preview?.name ?? data.label ?? "Dataset",
      scope: "global" as const,
      listCount: preview?.listCount ?? preview?.lists?.length ?? 0,
      lists: preview?.lists ?? [],
      cardCount: preview?.cardCount ?? 0,
      constantCount: preview?.constantCount ?? 0,
      complete: preview?.complete ?? false,
      gapCount: preview?.gapCount ?? 0,
      version: data.datasetRef.version,
      remoteVersion: data.datasetRemoteVersion ?? null,
      isGlobalRef: true,
    };
  }
  const dataset = localDatasetFromNode(data, projectScopeId);
  const validation = validate(dataset);
  return {
    name: dataset.name,
    scope: dataset.scope,
    listCount: dataset.lists.length,
    lists: dataset.lists.map((list) => ({
      id: list.id,
      name: list.name,
      key: list.key,
      cardCount: list.cards.length,
      schemaKeys: list.schema.map((field) => field.key),
    })),
    cardCount: dataset.lists.reduce((sum, list) => sum + list.cards.length, 0),
    constantCount: dataset.constants.fields.length,
    complete: validation.complete,
    gapCount: validation.gaps.length,
    version: dataset.version,
    remoteVersion: null,
    isGlobalRef: false,
  };
}

function buildDatasetNodeSummary(
  cardView: ReturnType<typeof cardViewFromNode>,
  versionStale: boolean,
): string {
  const isEmpty =
    cardView.cardCount === 0 && cardView.listCount <= 1 && cardView.constantCount === 0;

  if (isEmpty) {
    return "Tabla vacía — abre Studio para definir columnas y filas.";
  }

  const parts: string[] = [
    `${cardView.cardCount} fila${cardView.cardCount === 1 ? "" : "s"}`,
    `${cardView.listCount} pestaña${cardView.listCount === 1 ? "" : "s"}`,
  ];

  if (cardView.constantCount > 0) {
    parts.push(`${cardView.constantCount} compartido${cardView.constantCount === 1 ? "" : "s"}`);
  }

  parts.push(
    cardView.complete
      ? "Listo"
      : `${cardView.gapCount} vacío${cardView.gapCount === 1 ? "" : "s"}`,
  );

  if (cardView.scope === "global") {
    parts.push(datasetScopeSummaryTag("global"));
  }

  if (versionStale) {
    parts.push("Actualizado en otro proyecto");
  }

  return parts.join(" · ");
}

export const DatasetNode = memo(({ id, data, selected }: NodeProps<any>) => {
  useFoldderRenderMetric("DatasetNode", id);
  const nodeData = (data ?? {}) as DatasetNodeData;
  const isLibraryPreview = isFoldderLibraryPreviewData(nodeData);
  const { projectScopeId } = useDatasetCanvasContext();
  const { setNodes } = useReactFlow();
  const { isStudioOpen, openStudio, closeStudio } = useStudioNodeController({
    nodeId: id,
    nodeType: "dataset",
    enabled: !isLibraryPreview,
  });

  const [connectOpen, setConnectOpen] = useState(false);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [studioDataset, setStudioDataset] = useState<Dataset | null>(null);
  const [studioLoading, setStudioLoading] = useState(false);
  const [studioError, setStudioError] = useState<string | null>(null);
  const [consumerCount, setConsumerCount] = useState(0);
  const saveTimerRef = useRef<number | null>(null);
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  const globalVersionRef = useRef(nodeData.datasetRef?.version ?? 0);
  const loadedGlobalIdRef = useRef<string | null>(null);
  const initialChooserHandledRef = useRef(false);

  useEffect(() => {
    if (typeof nodeData.datasetRef?.version === "number") {
      globalVersionRef.current = nodeData.datasetRef.version;
    }
  }, [nodeData.datasetRef?.version]);

  const cancelPendingGlobalSave = useCallback(() => {
    if (saveTimerRef.current != null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    saveChainRef.current = Promise.resolve();
  }, []);

  const cardView = useMemo(() => cardViewFromNode(nodeData, projectScopeId), [nodeData, projectScopeId]);
  const studioTouched =
    hasFoldderStudioTouched(nodeData as Record<string, unknown>) || cardView.cardCount > 0 || Boolean(nodeData.datasetRef);
  const versionStale =
    cardView.isGlobalRef &&
    cardView.remoteVersion != null &&
    cardView.remoteVersion > cardView.version;

  const patchNodeData = useCallback(
    (patch: Partial<DatasetNodeData>) => {
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

  const applyGlobalRef = useCallback(
    (dataset: Dataset, consumerProjectIds: string[] = []) => {
      const preview = previewFromDataset(dataset);
      patchNodeData({
        dataset: undefined,
        datasetRef: { datasetId: dataset.id, version: dataset.version },
        datasetPreview: preview,
        datasetRemoteVersion: dataset.version,
        label: dataset.name,
      });
      setConsumerCount(consumerProjectIds.length);
    },
    [patchNodeData],
  );

  const applyLocalInline = useCallback(
    (dataset: Dataset) => {
      patchNodeData({
        dataset: { ...dataset, scope: "local", projectId: projectScopeId },
        datasetRef: undefined,
        datasetPreview: undefined,
        datasetRemoteVersion: undefined,
        label: dataset.name,
      });
      setConsumerCount(0);
    },
    [patchNodeData, projectScopeId],
  );

  useEffect(() => {
    const ref = nodeData.datasetRef;
    if (!ref?.datasetId) return;
    let cancelled = false;
    void fetchGlobalDataset(ref.datasetId)
      .then((response) => {
        if (cancelled) return;
        setConsumerCount(response.consumerCount);
        if (response.dataset.version > ref.version) {
          patchNodeData({
            datasetRemoteVersion: response.dataset.version,
            datasetPreview: previewFromDataset(response.dataset),
          });
        }
      })
      .catch(() => {
        /* preview cache is enough for card */
      });
    return () => {
      cancelled = true;
    };
  }, [nodeData.datasetRef, patchNodeData]);

  useEffect(() => {
    if (!isStudioOpen) {
      loadedGlobalIdRef.current = null;
      setStudioDataset(null);
      setStudioError(null);
      setStudioLoading(false);
      return;
    }

    const refId = nodeData.datasetRef?.datasetId;
    if (refId) {
      if (loadedGlobalIdRef.current === refId) return;
      loadedGlobalIdRef.current = refId;
      setStudioLoading(true);
      setStudioError(null);
      let cancelled = false;
      void fetchGlobalDataset(refId)
        .then((response) => {
          if (cancelled) return;
          setStudioDataset(response.dataset);
          setConsumerCount(response.consumerCount);
          globalVersionRef.current = response.dataset.version;
          patchNodeData({
            datasetRemoteVersion: response.dataset.version,
            datasetPreview: previewFromDataset(response.dataset),
          });
        })
        .catch((error) => {
          if (cancelled) return;
          loadedGlobalIdRef.current = null;
          setStudioError(error instanceof Error ? error.message : "No se pudo cargar el Dataset");
        })
        .finally(() => {
          if (!cancelled) setStudioLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }

    loadedGlobalIdRef.current = null;
    setStudioDataset(localDatasetFromNode(nodeData, projectScopeId));
    setStudioLoading(false);
    setStudioError(null);
    return undefined;
  }, [isStudioOpen, nodeData.datasetRef?.datasetId, patchNodeData, projectScopeId]);

  const queueGlobalSave = useCallback(
    (next: Dataset) => {
      if (saveTimerRef.current != null) window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(() => {
        saveChainRef.current = saveChainRef.current
          .then(async () => {
            const response = await saveGlobalDataset(next, globalVersionRef.current);
            globalVersionRef.current = response.dataset.version;
            applyGlobalRef(response.dataset, response.consumerProjectIds);
            setStudioDataset(response.dataset);
          })
          .catch((error) => {
            setStudioError(error instanceof Error ? error.message : "Error al guardar");
          });
      }, 450);
    },
    [applyGlobalRef],
  );

  const commitDataset = useCallback(
    (next: Dataset) => {
      setStudioDataset(next);
      const isGlobalRef = next.scope === "global" && Boolean(nodeData.datasetRef?.datasetId);
      if (isGlobalRef) {
        queueGlobalSave(next);
        patchNodeData({
          datasetPreview: previewFromDataset(next),
          label: next.name,
        });
        return;
      }
      applyLocalInline({ ...next, scope: "local", projectId: projectScopeId });
    },
    [applyLocalInline, nodeData.datasetRef?.datasetId, patchNodeData, projectScopeId, queueGlobalSave],
  );

  const handleScopeChange = useCallback(
    async (current: Dataset, direction: "promote" | "demote") => {
      if (direction === "promote") {
        const scoped = setScope(current, "global", { consumerCount, projectId: projectScopeId });
        if (!scoped.ok) {
          return { ok: false, dataset: current, reason: scoped.reason };
        }
        try {
          const response = await saveGlobalDataset(scoped.dataset);
          globalVersionRef.current = response.dataset.version;
          loadedGlobalIdRef.current = response.dataset.id;
          applyGlobalRef(response.dataset, response.consumerProjectIds);
          setStudioDataset(response.dataset);
          return { ok: true, dataset: response.dataset };
        } catch (error) {
          return {
            ok: false,
            dataset: current,
            reason: error instanceof Error ? error.message : "No se pudo promover a global",
          };
        }
      }

      const scoped = setScope(current, "local", { consumerCount, projectId: projectScopeId });
      if (!scoped.ok) {
        return { ok: false, dataset: current, reason: scoped.reason };
      }
      try {
        cancelPendingGlobalSave();
        if (consumerCount <= 1 && nodeData.datasetRef?.datasetId) {
          try {
            await deleteGlobalDataset(nodeData.datasetRef.datasetId);
          } catch (error) {
            const message = error instanceof Error ? error.message.toLowerCase() : "";
            if (!message.includes("not found")) throw error;
          }
        }
        loadedGlobalIdRef.current = null;
        globalVersionRef.current = 0;
        applyLocalInline(scoped.dataset);
        setStudioDataset(scoped.dataset);
        return { ok: true, dataset: scoped.dataset };
      } catch (error) {
        return {
          ok: false,
          dataset: current,
          reason: error instanceof Error ? error.message : "No se pudo hacer local",
        };
      }
    },
    [applyGlobalRef, applyLocalInline, cancelPendingGlobalSave, consumerCount, nodeData.datasetRef?.datasetId, projectScopeId],
  );

  const handleConnectGlobal = useCallback(
    (item: DatasetListItem) => {
      applyGlobalRef(
        normalizeDataset({
          id: item.id,
          name: item.name,
          scope: "global",
          lists: [],
          constants: { fields: [], values: {} },
          createdAt: item.updatedAt,
          updatedAt: item.updatedAt,
          version: item.version,
        }),
        [],
      );
      setConnectOpen(false);
      setChooserOpen(false);
      patchNodeData({ _datasetShowChooser: undefined });
      void fetchGlobalDataset(item.id)
        .then((response) => {
          applyGlobalRef(response.dataset, response.consumerProjectIds);
        })
        .catch(() => undefined);
    },
    [applyGlobalRef, patchNodeData],
  );

  const handleCreateLocal = useCallback(() => {
    const dataset = createDataset("Dataset", "local", projectScopeId);
    applyLocalInline(dataset);
    setConnectOpen(false);
    setChooserOpen(false);
    patchNodeData({ _datasetShowChooser: undefined });
    openStudio();
  }, [applyLocalInline, openStudio, patchNodeData, projectScopeId]);

  useEffect(() => {
    if (isLibraryPreview) {
      setChooserOpen(false);
      return;
    }
    if (!nodeData._datasetShowChooser) return;
    if (initialChooserHandledRef.current) return;

    let cancelled = false;
    initialChooserHandledRef.current = true;

    void listGlobalDatasets()
      .then((rows) => {
        if (cancelled) return;
        if (rows.length > 0) {
          setChooserOpen(true);
          return;
        }
        handleCreateLocal();
      })
      .catch(() => {
        if (cancelled) return;
        handleCreateLocal();
      });

    return () => {
      cancelled = true;
    };
  }, [handleCreateLocal, isLibraryPreview, nodeData._datasetShowChooser]);

  const handleSelectGlobalFromStudio = useCallback(
    (item: DatasetListItem) => {
      if (nodeData.datasetRef?.datasetId === item.id) return;
      void fetchGlobalDataset(item.id).then((response) => {
        applyGlobalRef(response.dataset, response.consumerProjectIds);
        setStudioDataset(response.dataset);
        loadedGlobalIdRef.current = response.dataset.id;
      });
    },
    [applyGlobalRef, nodeData.datasetRef?.datasetId],
  );

  const summaryText = useMemo(
    () => buildDatasetNodeSummary(cardView, versionStale),
    [cardView, versionStale],
  );

  const consumersSignature = useStore(
    useCallback((state: ReactFlowState<Node, Edge>) => selectDatasetConsumers(state, id), [id]),
  );
  const connectedConsumers = useMemo(
    () => JSON.parse(consumersSignature) as DatasetConsumerInfo[],
    [consumersSignature],
  );

  return (
    <StudioCanvasNodeShell
      nodeId={id}
      nodeType="dataset"
      selected={selected}
      label={nodeData.label}
      defaultLabel="Dataset"
      title={cardView.name || "Dataset"}
      minWidth={200}
      className="dataset-node foldder-frameless-label-dark"
      handles={DATASET_NODE_HANDLES}
      variant="frameless"
      material="media"
      studioTouched={studioTouched}
    >
      <NodeResizer minWidth={200} minHeight={120} maxWidth={960} maxHeight={420} isVisible={selected} />
      <div className="foldder-frameless-main relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="dataset-empty-background absolute inset-0 overflow-hidden" aria-hidden>
          <img
            src={DATASET_EMPTY_BACKGROUND_SRC}
            alt=""
            className="h-full w-full object-contain object-bottom"
            draggable={false}
          />
        </div>

        <div className="relative z-10 flex min-h-0 flex-1 flex-col pointer-events-none">
          <p className="line-clamp-3 px-3 pt-2 text-[11px] font-light leading-relaxed text-slate-600">
            {summaryText}
          </p>
          {connectedConsumers.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1 px-3 pt-1.5">
              <span className="text-[9px] font-medium uppercase tracking-wide text-slate-400">
                Conectado a
              </span>
              {connectedConsumers.map((consumer) => (
                <span
                  key={consumer.id}
                  className="inline-flex max-w-[120px] items-center truncate rounded-[4px] border border-slate-300/60 bg-white/70 px-1.5 py-0.5 text-[9px] font-medium text-slate-600"
                  title={friendlyNodeName(consumer.type, consumer.label)}
                >
                  {friendlyNodeName(consumer.type, consumer.label)}
                </span>
              ))}
            </div>
          ) : null}
          <div className="flex-1" />
          <FoldderStudioModeCenterButton onClick={() => openStudio()} />
        </div>
      </div>

      {chooserOpen && !isLibraryPreview ? (
        <StudioNodePortal bodyLock={false}>
          <DatasetAddChooser
            onCreateLocal={handleCreateLocal}
            onConnectGlobal={() => {
              setChooserOpen(false);
              setConnectOpen(true);
            }}
            onClose={() => {
              setChooserOpen(false);
              patchNodeData({ _datasetShowChooser: undefined });
            }}
          />
        </StudioNodePortal>
      ) : null}

      {connectOpen && !isLibraryPreview ? (
        <StudioNodePortal bodyLock={false}>
          <DatasetConnectModal
            onSelect={handleConnectGlobal}
            onCreateNew={handleCreateLocal}
            onClose={() => setConnectOpen(false)}
          />
        </StudioNodePortal>
      ) : null}

      {isStudioOpen && !isLibraryPreview ? (
        <StudioNodePortal>
          {studioLoading ? (
            <div
              className="fixed inset-0 z-[100090] flex flex-col bg-[#0b0f14] text-white"
              data-foldder-studio-panel
              data-foldder-studio-canvas
              data-foldder-studio-flush
              data-foldder-dataset-studio
              style={{ ["--foldder-studio-accent" as string]: DATASET_STUDIO_ACCENT }}
            >
              <FoldderStudioHeader
                nodeType="dataset"
                nodeLabel={cardView.name}
                subtitle="Fuente de datos para piezas"
                onClose={closeStudio}
              />
              <div className="flex flex-1 items-center justify-center text-[10px] font-black uppercase tracking-[0.08em] text-white/45">
                Cargando Dataset…
              </div>
            </div>
          ) : studioError && !studioDataset ? (
            <div
              className="fixed inset-0 z-[100090] flex flex-col bg-[#0b0f14] text-white"
              data-foldder-studio-panel
              data-foldder-studio-canvas
              data-foldder-studio-flush
              data-foldder-dataset-studio
              style={{ ["--foldder-studio-accent" as string]: DATASET_STUDIO_ACCENT }}
            >
              <FoldderStudioHeader
                nodeType="dataset"
                nodeLabel={cardView.name}
                subtitle="Fuente de datos para piezas"
                onClose={closeStudio}
                actions={
                  <button type="button" onClick={() => closeStudio()} className={foldderStudioHeaderActionClassName()}>
                    Cerrar
                  </button>
                }
              />
              <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
                <p className="text-[12px] text-rose-300">{studioError}</p>
              </div>
            </div>
          ) : studioDataset ? (
            <DatasetStudio
              dataset={studioDataset}
              consumerCount={consumerCount}
              remoteVersion={nodeData.datasetRemoteVersion ?? null}
              saveError={studioError}
              isGlobalRef={Boolean(nodeData.datasetRef)}
              onChange={commitDataset}
              onScopeChange={handleScopeChange}
              onSelectGlobalDataset={handleSelectGlobalFromStudio}
              onCreateNewLocal={handleCreateLocal}
              onClose={() => closeStudio()}
            />
          ) : null}
        </StudioNodePortal>
      ) : null}
    </StudioCanvasNodeShell>
  );
});

DatasetNode.displayName = "DatasetNode";
