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
import {
  FoldderNodeContentDock,
  FoldderNodeContentDockActions,
  FoldderNodeContentDockMain,
  FoldderNodeContentMeta,
  FoldderNodeContentMetaRow,
  FoldderStudioModeCenterButton,
} from "../foldder-node-ui";
import { touchStudioNodeData } from "../studio-node/foldder-studio-touched";
import { resolveFoldderNodeStudioBackground } from "../studio-node/foldder-studio-node-backgrounds";
import { useFoldderRenderMetric } from "../use-performance-metrics";
import {
  FoldderStudioHeader,
  foldderStudioHeaderActionClassName,
} from "../FoldderStudioHeader";
import { DATASET_STUDIO_ACCENT } from "./DatasetStudioChrome";
import { datasetScopeSummaryTag } from "./dataset-scope-copy";
import type { Dataset, DatasetNodeData, DatasetPreview, DatasetScope } from "./dataset-types";
import { createDataset, normalizeDataset, setScope, validate } from "./dataset-logic";
import { DatasetStudio } from "./DatasetStudio";
import { DatasetConnectModal } from "./DatasetConnectModal";
import { DatasetAddChooser } from "./DatasetAddChooser";
import { DatasetImportScopeModal } from "./DatasetImportScopeModal";
import {
  FOLDDER_FOLDDATA_EXTENSION,
  importDatasetFolddataFile,
  prepareImportedDataset,
} from "./dataset-folddata";
import { uploadImportedDatasetMediaToS3 } from "./dataset-folddata-hydrate";
import { useDatasetCanvasContext } from "./dataset-canvas-context";
import {
  createGlobalDataset,
  deleteGlobalDataset,
  fetchGlobalDataset,
  listGlobalDatasets,
  saveGlobalDataset,
  type DatasetListItem,
} from "./dataset-api";
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

function buildDatasetNodeExteriorInfo(
  cardView: ReturnType<typeof cardViewFromNode>,
  versionStale: boolean,
): {
  isEmpty: boolean;
  headline: string;
  listNamesLine: string;
  metaLine?: string;
} {
  const isEmpty =
    cardView.cardCount === 0 && cardView.listCount <= 1 && cardView.constantCount === 0;

  if (isEmpty) {
    return { isEmpty: true, headline: "", listNamesLine: "" };
  }

  const listadoWord = cardView.listCount === 1 ? "listado" : "listados";
  const elementoWord = cardView.cardCount === 1 ? "elemento" : "elementos";
  const headline = `${cardView.listCount} ${listadoWord}, ${cardView.cardCount} ${elementoWord}`;

  const listNamesLine = cardView.lists
    .map((list) => list.name.trim())
    .filter(Boolean)
    .join(", ");

  const metaParts: string[] = [];
  if (!cardView.complete) {
    metaParts.push(`${cardView.gapCount} vacío${cardView.gapCount === 1 ? "" : "s"}`);
  }
  if (cardView.constantCount > 0) {
    metaParts.push(
      `${cardView.constantCount} compartido${cardView.constantCount === 1 ? "" : "s"}`,
    );
  }
  if (cardView.scope === "global") {
    metaParts.push(datasetScopeSummaryTag("global"));
  }
  if (versionStale) {
    metaParts.push("Actualizado en otro proyecto");
  }

  return {
    isEmpty: false,
    headline,
    listNamesLine,
    metaLine: metaParts.length > 0 ? metaParts.join(" · ") : undefined,
  };
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
  const [importScopeOpen, setImportScopeOpen] = useState(false);
  const [pendingImportFile, setPendingImportFile] = useState<File | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const saveTimerRef = useRef<number | null>(null);
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  const globalVersionRef = useRef(nodeData.datasetRef?.version ?? 0);
  const loadedGlobalIdRef = useRef<string | null>(null);
  const initialChooserHandledRef = useRef(false);
  const importFileInputRef = useRef<HTMLInputElement>(null);

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

  const requestImportFolddata = useCallback(() => {
    importFileInputRef.current?.click();
  }, []);

  const handleImportFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setPendingImportFile(file);
    setImportScopeOpen(true);
    setChooserOpen(false);
    setConnectOpen(false);
  }, []);

  const cancelImportFolddata = useCallback(() => {
    if (importBusy) return;
    setImportScopeOpen(false);
    setPendingImportFile(null);
  }, [importBusy]);

  const handleImportConfirm = useCallback(
    async (scope: DatasetScope) => {
      if (!pendingImportFile) return;
      setImportBusy(true);
      setStudioError(null);
      try {
        const { dataset: raw } = await importDatasetFolddataFile(pendingImportFile);
        let hydrated = raw;
        try {
          hydrated = await uploadImportedDatasetMediaToS3(raw, { projectId: projectScopeId });
        } catch (uploadErr) {
          console.error("[Dataset] import .folddata → S3", uploadErr);
          setStudioError(
            uploadErr instanceof Error
              ? `Las imágenes no se pudieron subir a la nube: ${uploadErr.message}`
              : String(uploadErr),
          );
          return;
        }
        const imported = prepareImportedDataset(hydrated, scope, projectScopeId);
        cancelPendingGlobalSave();
        if (scope === "global") {
          const response = await createGlobalDataset(imported.name, imported);
          loadedGlobalIdRef.current = response.dataset.id;
          globalVersionRef.current = response.dataset.version;
          applyGlobalRef(response.dataset, response.consumerProjectIds);
          setStudioDataset(response.dataset);
        } else {
          loadedGlobalIdRef.current = null;
          applyLocalInline(imported);
          setStudioDataset(imported);
        }
        setImportScopeOpen(false);
        setPendingImportFile(null);
        patchNodeData({ _datasetShowChooser: undefined });
        openStudio();
      } catch (error) {
        setStudioError(error instanceof Error ? error.message : "No se pudo importar el archivo");
      } finally {
        setImportBusy(false);
      }
    },
    [
      applyGlobalRef,
      applyLocalInline,
      cancelPendingGlobalSave,
      openStudio,
      patchNodeData,
      pendingImportFile,
      projectScopeId,
    ],
  );

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

  const exteriorInfo = useMemo(
    () => buildDatasetNodeExteriorInfo(cardView, versionStale),
    [cardView, versionStale],
  );

  const consumersSignature = useStore(
    useCallback((state: ReactFlowState<Node, Edge>) => selectDatasetConsumers(state, id), [id]),
  );
  const connectedConsumers = useMemo(
    () => JSON.parse(consumersSignature) as DatasetConsumerInfo[],
    [consumersSignature],
  );

  const hasDock = !isLibraryPreview && !exteriorInfo.isEmpty;
  const showConnectedIcon = connectedConsumers.length > 0;
  const listadosLabel = `${cardView.listCount} ${cardView.listCount === 1 ? "listado" : "listados"}`;
  const constantesLabel = cardView.constantCount > 0 ? String(cardView.constantCount) : "—";
  const scopeLabel = cardView.scope === "global" ? "Global" : "Local";
  const statusLabel = versionStale
    ? "Desactualizado"
    : cardView.complete
      ? "Completo"
      : `${cardView.gapCount} vacío${cardView.gapCount === 1 ? "" : "s"}`;
  const consumersLabel =
    connectedConsumers.length > 0
      ? connectedConsumers.map((c) => friendlyNodeName(c.type, c.label)).join(", ")
      : "—";

  return (
    <StudioCanvasNodeShell
      nodeId={id}
      nodeType="dataset"
      selected={selected}
      label={nodeData.label}
      defaultLabel="Dataset"
      title={cardView.name || "Dataset"}
      minWidth={200}
      className={`dataset-node${hasDock ? " dataset-node--has-content" : " dataset-node--empty"}${showConnectedIcon ? " dataset-node--connected" : ""}`}
      handles={DATASET_NODE_HANDLES}
      variant="frameless"
      material="media"
      exteriorTileMark={showConnectedIcon}
      style={
        {
          minWidth: 200,
          minHeight: 416,
          "--foldder-node-card-bg": "#37b7df",
          "--foldder-frameless-glass-bg": "#37b7df",
          "--foldder-frameless-accent": "#37b7df",
        } as React.CSSProperties
      }
    >
      <NodeResizer minWidth={200} minHeight={120} maxWidth={960} maxHeight={420} isVisible={selected} />
      <div
        className={`node-content foldder-frameless-main dataset-node-main${hasDock ? " foldder-node-content-main--with-dock" : ""}`}
      >
        <div className="dataset-node-preview foldder-node-content-preview-area">
          <img
            src={DATASET_EMPTY_BACKGROUND_SRC}
            alt=""
            className="dataset-node-bg"
            draggable={false}
          />

          {exteriorInfo.isEmpty ? (
            <div className="dataset-node-empty-hint" aria-hidden>
              <span className="dataset-node-empty-hint__title">Tabla vacía</span>
              <span className="dataset-node-empty-hint__body">
                Abre Studio para definir columnas y filas.
              </span>
            </div>
          ) : null}

          {!hasDock && !isLibraryPreview ? (
            <FoldderStudioModeCenterButton onClick={() => openStudio()} />
          ) : null}
        </div>

        {hasDock ? (
          <div className="dataset-node-dock-wrap shrink-0">
            <FoldderNodeContentDock allowNodeDrag>
              <FoldderNodeContentDockMain>
                {exteriorInfo.headline ? (
                  <p className="foldder-node-content-dock-text">{exteriorInfo.headline}</p>
                ) : null}
                {exteriorInfo.listNamesLine ? (
                  <p className="foldder-node-content-dock-text foldder-node-content-dock-text--placeholder">
                    {exteriorInfo.listNamesLine}
                  </p>
                ) : null}
                {exteriorInfo.metaLine ? (
                  <p className="foldder-node-content-dock-text foldder-node-content-dock-text--placeholder">
                    {exteriorInfo.metaLine}
                  </p>
                ) : null}
                <FoldderNodeContentMeta>
                  <FoldderNodeContentMetaRow label="Listados" value={listadosLabel} />
                  <FoldderNodeContentMetaRow label="Elementos" value={String(cardView.cardCount)} />
                  <FoldderNodeContentMetaRow label="Constantes" value={constantesLabel} />
                  <FoldderNodeContentMetaRow label="Alcance" value={scopeLabel} />
                  <FoldderNodeContentMetaRow label="Salida" value={consumersLabel} />
                  <FoldderNodeContentMetaRow label="Estado" value={statusLabel} variant="status" />
                </FoldderNodeContentMeta>
              </FoldderNodeContentDockMain>
              <FoldderNodeContentDockActions className="dataset-node-dock-actions">
                <FoldderStudioModeCenterButton
                  variant="dock"
                  label="Open Studio"
                  onClick={() => openStudio()}
                />
              </FoldderNodeContentDockActions>
            </FoldderNodeContentDock>
          </div>
        ) : null}
      </div>

      {chooserOpen && !isLibraryPreview ? (
        <StudioNodePortal bodyLock={false}>
          <DatasetAddChooser
            onCreateLocal={handleCreateLocal}
            onConnectGlobal={() => {
              setChooserOpen(false);
              setConnectOpen(true);
            }}
            onImportFile={requestImportFolddata}
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
              projectScopeId={projectScopeId}
              onChange={commitDataset}
              onScopeChange={handleScopeChange}
              onSelectGlobalDataset={handleSelectGlobalFromStudio}
              onCreateNewLocal={handleCreateLocal}
              onRequestImportFolddata={requestImportFolddata}
              onClose={() => closeStudio()}
            />
          ) : null}
        </StudioNodePortal>
      ) : null}

      <input
        ref={importFileInputRef}
        type="file"
        accept={FOLDDER_FOLDDATA_EXTENSION}
        className="hidden"
        aria-hidden
        onChange={handleImportFileChange}
      />

      {importScopeOpen && pendingImportFile && !isLibraryPreview ? (
        <StudioNodePortal bodyLock={false}>
          <DatasetImportScopeModal
            filename={pendingImportFile.name}
            busy={importBusy}
            onCancel={cancelImportFolddata}
            onConfirm={(scope) => void handleImportConfirm(scope)}
          />
        </StudioNodePortal>
      ) : null}
    </StudioCanvasNodeShell>
  );
});

DatasetNode.displayName = "DatasetNode";
