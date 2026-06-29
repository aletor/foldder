"use client";

import React, { memo, useCallback, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import {
  useReactFlow,
  useStore,
  type Edge,
  type Node,
  type NodeProps,
  type ReactFlowState,
} from "@xyflow/react";
import {
  AlertTriangle,
  Download,
  FolderOpen,
  Loader2,
  Repeat,
  Sparkles,
} from "lucide-react";
import { StudioCanvasNodeShell, type StudioCanvasNodeHandleSpec } from "../studio-node/studio-canvas-node";
import { resolvePromptValueFromEdgeSourceMap } from "../canvas-group-logic";
import { getNodeOrchestrationDeclaration } from "./populate-declaration";
import {
  POPULATE_COMMIT_EVENT,
  useConnectedDatasetForNode,
} from "./use-populate-context";
import type {
  CreativeInputDescriptor,
  PopulateBindings,
  PopulateInputBinding,
  PopulateNodeData,
} from "./populate-types";
import {
  isPopulateTemplateLinkEdge,
  findPopulateTemplateLinkEdge,
} from "./populate-template-link";
import { resolveSpacePortalInnerTemplate, expandSpacePortalTemplateForPipeline } from "../space-portal-populate-link";
import { activeImageRefsSignature, resolveActiveImageRefs, type ActiveImageRef } from "./populate-active-refs";
import { extractPromptTokens } from "./populate-tokens";
import { resolveImageBindingForRow, resolvePromptForRow } from "./populate-resolve";
import { PopulateStudio } from "./PopulateStudio";
import { buildPopulateCompactSummary } from "./populate-studio-summary";
import {
  defaultPopulateDatasetOutputSettings,
} from "./PopulateDatasetOutputPanel";
import { finalizePopulateBatchRun, type FinalizePopulateChannelInput } from "./populate-batch-finalize";
import { findPipelineSinkIds, type PipelineEdge } from "./pipeline/discover-pipeline";
import type { RowResult } from "./pipeline/run-pipeline";
import type { PopulateDatasetOutputSettings } from "./populate-types";
import {
  autofillFormFromRow,
  derivePopulateForm,
  resolveFormImages,
  resolveFormPrompt,
} from "./populate-form";
import { buildPopulateSharePayload } from "./populate-share-payload";
import type { PopulateSharePayload } from "@/lib/populate-share-types";
import { generatePopulateImage, type PopulateTemplateModel } from "./populate-generate";
import {
  adaptPopulateBindingsForPipeline,
  analyzePopulatePipeline,
  buildMultiChannelPipelinePromptTemplates,
  buildPromptTemplatesByNodeId,
  createResolveFixedExternal,
  findPopulateCreativeTemplateNodeId,
  formatPipelineCostConfirm,
} from "./populate-pipeline-integration";
import {
  promptTextFromCreativeNode,
} from "./populate-channel-prompt";
import { defaultExecutorRegistry } from "./pipeline/executor-registry";
import { estimatePipelineCost } from "./pipeline/estimate-pipeline-cost";
import { executorNodeMap } from "./pipeline/pipeline-adapter";
import { runPopulatePipeline } from "./pipeline/populate-pipeline-run";
import {
  buildMediaListOutput,
  buildRowSubgraph,
  type MaterializedRow,
} from "./populate-materialize";
import { isNodeCloneTemplateType, resolveDesignerTemplateConfig } from "./populate-designer-template";
import { extractDesignerDynamicFields } from "./populate-designer-fields";
import {
  buildDesignerGeneratedSubgraph,
  freezeDesignerPagesForRow,
  type DesignerMaterializedRow,
} from "./populate-designer-materialize";
import { rasterizeAndUploadDesignerRows, uploadDesignerSlideRaster } from "./populate-designer-raster";
import {
  autofillDesignerFormFromRow,
  deriveDesignerForm,
  freezeDesignerPagesForForm,
  resolveDesignerSlotValues,
} from "./populate-designer-form";
import { makePopulateDesignerGroupId, type DesignerDatasetOutputSettings } from "./populate-designer-dataset-output";
import { persistPopulateDesignerDatasetOutput } from "./persist-populate-designer-dataset-output";
import {
  DesignerHeadlessRasterPortal,
  type DesignerHeadlessRasterRequest,
} from "../designer/DesignerHeadlessRasterPortal";
import { useProjectAssetsCanvas } from "../project-assets-canvas-context";
import type { DesignerPageState } from "../designer/DesignerNode";

const POPULATE_ACCENT = "#FD52EB";
const EMPTY_SLOT_BINDINGS: Record<
  string,
  { listId: string; listKey: string; fieldId: string; fieldKey: string }
> = {};
const POPULATE_EMPTY_BACKGROUND_SRC = "/assets/nodes/populate-empty-pink.png";

const HANDLES: StudioCanvasNodeHandleSpec[] = [
  { side: "left", top: "34%", type: "target", id: "dataset", dataType: "dataset", label: "Dataset" },
  { side: "left", top: "66%", type: "target", id: "template", dataType: "template", label: "Plantilla" },
  { side: "right", top: "34%", type: "source", id: "media_list", dataType: "generic", label: "Media List" },
  { side: "right", top: "66%", type: "source", id: "out", dataType: "url", label: "Resultados" },
];

type TemplateConfig = {
  templateNodeId: string;
  templateType: string;
  templateLabel: string;
  model: {
    modelKey?: string;
    aspect_ratio?: string;
    resolution?: string;
    thinking?: boolean;
    imageProvider?: string;
  };
  /** Prompt efectivo (Populate manda; si no, semilla del nodo creativo). */
  promptTemplate: string;
  /** Prompt inline del nodo creativo (semilla cuando Populate aún no lo edita). */
  seedPrompt: string;
  bindings: PopulateBindings;
  fixedRefUrls: Record<string, string>;
  /** Referencias de imagen con cable activo en Image Creation (solo estas se configuran). */
  activeImageRefs: ActiveImageRef[];
  /** @deprecated Usar activeImageRefs; alias de slots activos para resolución. */
  imageInputs: CreativeInputDescriptor[];
  textInputs: CreativeInputDescriptor[];
};

function resolveTemplateConfig(
  populateId: string,
  nodes: Node[],
  edges: Edge[],
): TemplateConfig | null {
  const linkEdge = findPopulateTemplateLinkEdge(populateId, nodes, edges);
  if (!linkEdge) return null;
  const sinkNode = nodes.find((n) => n.id === linkEdge.source);
  if (!sinkNode) return null;
  const populateNode = nodes.find((n) => n.id === populateId);
  const popData = (populateNode?.data ?? {}) as PopulateNodeData;
  const nodesById = new Map(nodes.map((n) => [n.id, n]));

  const innerFromSpace =
    sinkNode.type === "space" ? resolveSpacePortalInnerTemplate(sinkNode, {}) : null;
  const virtualTemplateNode: Node | null = innerFromSpace
    ? {
        id: `${sinkNode.id}__${innerFromSpace.innerNodeId}`,
        type: innerFromSpace.nodeType,
        position: sinkNode.position,
        data: innerFromSpace.nodeData,
      }
    : null;

  const creativeNodeId =
    findPopulateCreativeTemplateNodeId(populateId, nodes, edges, popData.templateBindings) ??
    virtualTemplateNode?.id ??
    linkEdge.source;
  const tpl =
    nodes.find((n) => n.id === creativeNodeId) ??
    virtualTemplateNode ??
    sinkNode;
  const data = (tpl.data ?? {}) as Record<string, unknown>;
  const templateType = String(tpl.type ?? "");
  const templateLabel =
    innerFromSpace?.label ??
    (typeof data.label === "string" && data.label.trim() ? (data.label as string) : templateType);

  // Declaración estándar del nodo creativo (NO hardcode por tipo).
  const declaration = getNodeOrchestrationDeclaration(tpl.type);

  // Semilla del prompt: clave declarada (p. ej. promptText) o el prompt conectado.
  const promptKey = declaration.promptDataKey ?? "promptText";
  let seedPrompt = typeof data[promptKey] === "string" ? (data[promptKey] as string) : "";
  if (!seedPrompt) {
    const promptEdge = edges.find((e) => e.target === tpl.id && e.targetHandle === "prompt");
    if (promptEdge) seedPrompt = resolvePromptValueFromEdgeSourceMap(promptEdge, nodesById) || "";
  }

  // Populate es la fuente de verdad de la plantilla; si aún no la editó, usa semilla.
  const promptTemplate =
    typeof popData.templatePrompt === "string" ? popData.templatePrompt : seedPrompt;

  // Bindings: los de Populate mandan; compat. con _populateBindings antiguos del nodo.
  const bindings =
    popData.templateBindings ?? (data._populateBindings as PopulateBindings) ?? {};

  // Referencias ACTIVAS: solo handles con cable entrante y URL resuelta.
  const activeImageRefs = resolveActiveImageRefs({
    templateNodeId: tpl.id,
    imageInputs: declaration.imageInputs,
    nodes,
    edges,
  });
  const fixedRefUrls: Record<string, string> = Object.fromEntries(
    activeImageRefs.map((ref) => [ref.inputId, ref.fixedUrl]),
  );

  return {
    templateNodeId: tpl.id,
    templateType,
    templateLabel: templateLabel || "Plantilla",
    model: {
      modelKey: data.modelKey as string | undefined,
      aspect_ratio: data.aspect_ratio as string | undefined,
      resolution: data.resolution as string | undefined,
      thinking: data.thinking as boolean | undefined,
      imageProvider: data.imageProvider as string | undefined,
    },
    promptTemplate,
    seedPrompt,
    bindings,
    fixedRefUrls,
    activeImageRefs,
    imageInputs: activeImageRefs,
    textInputs: declaration.textInputs,
  };
}

function PopulateNodeImpl({ id, data, selected }: NodeProps) {
  const nodeData = (data ?? {}) as PopulateNodeData;
  const { data: session } = useSession();
  const ownerEmail = session?.user?.email ?? "";
  const { getNodes, getEdges, setNodes } = useReactFlow();
  const { connectedDataset, datasetConnected, datasetLoading } = useConnectedDatasetForNode(id);

  const [busy, setBusy] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [studioOpen, setStudioOpen] = useState(false);
  const [previewRowIndex, setPreviewRowIndex] = useState(0);

  const projectAssetsCtx = useProjectAssetsCanvas();
  const projectId = projectAssetsCtx?.projectScopeId ?? null;

  // Driver del raster headless (Fase 4b): monta un Designer offscreen y resuelve {pageId: dataUrl}.
  const [designerRasterReq, setDesignerRasterReq] = useState<DesignerHeadlessRasterRequest | null>(null);
  const designerRasterRef = useRef<{
    resolve: (m: Record<string, string>) => void;
    reject: (e: Error) => void;
    collected: Record<string, string>;
  } | null>(null);
  const designerRasterSeqRef = useRef(0);
  const batchPipelineRowsRef = useRef<RowResult[]>([]);
  const batchCommitQueueRef = useRef(Promise.resolve());

  const rasterizeDesignerPages = useCallback(
    (pages: DesignerPageState[], pageIds: string[]) =>
      new Promise<Record<string, string>>((resolve, reject) => {
        designerRasterRef.current = { resolve, reject, collected: {} };
        const seq = (designerRasterSeqRef.current += 1);
        setDesignerRasterReq({
          requestId: seq,
          instanceKey: `${id}_raster_${seq}`,
          pages,
          targetPageIds: pageIds,
        });
      }),
    [id],
  );

  const onPreviewRowChange = useCallback((rowIndex: number) => {
    setPreviewRowIndex(rowIndex);
    setPreviewUrl(null);
  }, []);

  const lists = useMemo(() => connectedDataset?.lists ?? [], [connectedDataset]);
  const listId = useMemo(() => {
    if (nodeData.listId && lists.some((l) => l.id === nodeData.listId)) return nodeData.listId;
    return lists[0]?.id ?? null;
  }, [nodeData.listId, lists]);

  const activeList = useMemo(() => lists.find((l) => l.id === listId) ?? null, [lists, listId]);
  const rowCount = activeList?.cards.length ?? 0;

  const patchSelf = useCallback(
    (patch: Partial<PopulateNodeData>) => {
      setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)));
    },
    [id, setNodes],
  );

  const onSelectList = useCallback(
    (nextListId: string) => patchSelf({ listId: nextListId }),
    [patchSelf],
  );

  const buildRows = useCallback(
    (template: TemplateConfig, rowIndices: number[]): MaterializedRow[] => {
      const dataset = connectedDataset;
      if (!dataset || !listId) return [];
      const labelByFieldId = new Map(activeList?.schema.map((f) => [f.id, f.label]) ?? []);
      const manualTokens = nodeData.templateManualTokens;
      return rowIndices.map((rowIndex) => {
        const prompt = resolvePromptForRow(template.promptTemplate, dataset, listId, rowIndex, manualTokens);
        const refs: MaterializedRow["refs"] = [];
        for (const slot of template.activeImageRefs) {
          const binding = template.bindings[slot.inputId];
          let url: string | null = null;
          let label: string = slot.label;
          if (binding?.source === "column") {
            url = resolveImageBindingForRow(binding, dataset, rowIndex);
            label = (binding.fieldId ? labelByFieldId.get(binding.fieldId) : undefined) ?? slot.label;
          } else {
            url = template.fixedRefUrls[slot.inputId] ?? null;
          }
          if (url) refs.push({ inputId: slot.inputId, url, label });
        }
        return {
          rowIndex,
          cardId: activeList?.cards[rowIndex]?.id,
          prompt,
          refs,
        };
      });
    },
    [connectedDataset, listId, activeList, nodeData.templateManualTokens],
  );

  const getTemplate = useCallback(
    () => resolveTemplateConfig(id, getNodes(), getEdges()),
    [id, getNodes, getEdges],
  );

  const toGenModel = useCallback((template: TemplateConfig): PopulateTemplateModel => ({
    modelKey: template.model.modelKey || "flash31",
    aspectRatio: template.model.aspect_ratio || "16:9",
    resolution: template.model.resolution,
    thinking: template.model.thinking,
    provider: template.model.imageProvider === "openai" ? "openai" : "gemini",
  }), []);

  const onPreview = useCallback(async () => {
    setError(null);
    const template = getTemplate();
    if (!template) {
      setError("Conecta Image Creation (salida Image out) al handle Plantilla de Populate.");
      return;
    }
    if (rowCount === 0) {
      setError("El listado no tiene filas.");
      return;
    }
    const rowIdx = Math.max(0, Math.min(previewRowIndex, rowCount - 1));
    const [row] = buildRows(template, [rowIdx]);
    if (!row || !row.prompt.trim()) {
      setError("La plantilla no tiene prompt. Escribe el prompt en Image Creation.");
      return;
    }
    setPreviewLoading(true);
    setPreviewUrl(null);
    patchSelf({ status: "preview" });
    try {
      const result = await generatePopulateImage({
        prompt: row.prompt,
        images: row.refs.map((r) => r.url),
        model: toGenModel(template),
      });
      setPreviewUrl(result.output);
      patchSelf({ status: "idle" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error en la previsualización.");
      patchSelf({ status: "error" });
    } finally {
      setPreviewLoading(false);
    }
  }, [getTemplate, rowCount, buildRows, patchSelf, toGenModel, previewRowIndex]);

  const onGenerateBatch = useCallback(async () => {
    setError(null);
    const template = getTemplate();
    if (!template) {
      setError("Conecta un nodo creativo (salida → Plantilla) al handle Plantilla de Populate.");
      return;
    }
    if (!connectedDataset || !listId) {
      setError("Conecta un Dataset al handle izquierdo.");
      return;
    }
    if (rowCount === 0) {
      setError("El listado no tiene filas.");
      return;
    }

    const flowNodes = getNodes();
    const flowEdges = getEdges();
    const { nodes: pipelineNodes, edges: pipelineEdges } = expandSpacePortalTemplateForPipeline(
      flowNodes,
      flowEdges,
    );
    const executorNodes = pipelineNodes.map((n) => ({
      id: n.id,
      type: n.type ?? "",
      data: (n.data ?? {}) as Record<string, unknown>,
    }));

    const bindings = nodeData.templateBindings ?? template.bindings ?? {};
    const analysis = analyzePopulatePipeline(id, executorNodes, pipelineEdges, bindings);
    if (!analysis.validation.ok) {
      setError(analysis.validation.errors.join(" "));
      return;
    }

    const nodeById = executorNodeMap(executorNodes);
    const adaptedBindings = adaptPopulateBindingsForPipeline(bindings, analysis, nodeById);

    // Multi-canal: si hay 2+ creadores conectados a la plantilla, un canal por sink (cada uno
    // genera su imagen y se vuelca a su propia columna). Con 1 sink, camino legacy intacto.
    const sinkIds = analysis.sinkIds;
    const channelInputs: FinalizePopulateChannelInput[] =
      sinkIds.length > 1
        ? sinkIds.map((sid, i) => {
            const sNode = nodeById.get(sid);
            const sData = (sNode?.data ?? {}) as Record<string, unknown>;
            const sLabel =
              nodeData.channelLabels?.[sid] ??
              (typeof sData.label === "string" && sData.label.trim()
                ? (sData.label as string)
                : `Canal ${i + 1}`);
            const nodePrompt = promptTextFromCreativeNode(sNode);
            const channelPrompt = nodeData.channelPrompts?.[sid];
            return {
              channelId: sid,
              label: sLabel,
              templateType: sNode?.type ?? "nanoBanana",
              nodePrompt,
              channelPrompt,
              templateModel: {
                modelKey: sData.modelKey as string | undefined,
                aspect_ratio: sData.aspect_ratio as string | undefined,
                resolution: sData.resolution as string | undefined,
                thinking: sData.thinking as boolean | undefined,
                imageProvider: sData.imageProvider as string | undefined,
              },
              settings: nodeData.datasetOutputsByChannel?.[sid],
            };
          })
        : [];
    const runMultiChannel = channelInputs.length > 1;
    const templatePromptForRun = nodeData.templatePrompt ?? template.promptTemplate;
    const promptTemplatesByNodeId = runMultiChannel
      ? buildMultiChannelPipelinePromptTemplates({
          channels: channelInputs,
          analysis,
          edges: pipelineEdges,
          nodeById,
          templatePrompt: templatePromptForRun,
        })
      : buildPromptTemplatesByNodeId({
          analysis,
          templatePrompt: templatePromptForRun,
          nodeById,
        });
    const cost = estimatePipelineCost({
      order: analysis.order,
      iterated: analysis.iterated,
      rowCount,
      registry: defaultExecutorRegistry,
      nodeById,
    });
    if (cost.missingExecutorTypes.length > 0) {
      setError(
        `La tubería incluye nodos sin soporte de ejecución: ${cost.missingExecutorTypes.join(", ")}.`,
      );
      return;
    }

    if (typeof window !== "undefined") {
      const ok = window.confirm(
        formatPipelineCostConfirm({
          rowCount,
          cost,
          sinkLabel: runMultiChannel
            ? `${channelInputs.length} canales: ${channelInputs.map((c) => c.label).join(", ")}`
            : template.templateLabel,
        }),
      );
      if (!ok) return;
    }

    setBusy(true);
    setProgress({ done: 0, total: rowCount });
    patchSelf({
      status: "running",
      progressTotal: rowCount,
      progressDone: 0,
      error: undefined,
      lastRunFailures: undefined,
      lastRunOkCount: undefined,
      lastRunFailedCount: undefined,
    });

    const label = nodeData.label || "Populate";
    const templatePrompt = nodeData.templatePrompt ?? template.promptTemplate;
    const cardIdsByRow = activeList?.cards.map((c) => c.id) ?? [];

    batchPipelineRowsRef.current = [];
    batchCommitQueueRef.current = Promise.resolve();

    const applyBatchResult = async (
      pipelineRows: RowResult[],
      opts: { writeDataset: boolean; abortError?: string },
    ) => {
      const result = await finalizePopulateBatchRun({
        populateId: id,
        label,
        projectId,
        pipelineRows,
        totalRows: rowCount,
        templatePrompt,
        connectedDataset,
        listId,
        bindings: template.bindings,
        activeImageRefs: template.activeImageRefs,
        fixedRefUrls: template.fixedRefUrls,
        cardIdsByRow,
        manualTokenValues: nodeData.templateManualTokens,
        analysisOrder: analysis.order,
        nodeById,
        templateModel: template.model,
        templateType: template.templateType,
        soleNanoSink:
          analysis.order.length === 1 && nodeById.get(analysis.order[0]!)?.type === "nanoBanana",
        datasetOutput: nodeData.datasetOutput,
        channels: runMultiChannel ? channelInputs : undefined,
        flowNodes,
        flowEdges,
        setNodes,
        writeDataset: opts.writeDataset,
        abortError: opts.abortError,
      });

      if (result.lastRunOutputs.length > 0) {
        window.dispatchEvent(
          new CustomEvent(POPULATE_COMMIT_EVENT, {
            detail: {
              populateNodeId: id,
              spaceName: label,
              nodes: result.subgraph.nodes,
              edges: result.subgraph.edges,
              mediaListOutput: result.mediaList,
              value: result.firstOutput,
            },
          }),
        );
      }

      patchSelf({
        status: result.status,
        lastRunOutputs: result.lastRunOutputs,
        value: result.firstOutput || undefined,
        lastDatasetWriteSummary: result.lastDatasetWriteSummary,
        mediaListOutput: result.mediaList,
        lastRunFailures: result.failures.length > 0 ? result.failures : undefined,
        lastRunOkCount: result.okCount,
        lastRunFailedCount: result.failedCount,
        progressDone: pipelineRows.length,
        error: result.summaryError,
      });

      if (result.summaryError) setError(result.summaryError);
      else if (result.okCount > 0 && result.failedCount === 0 && !opts.abortError) setError(null);
    };

    const queueIncrementalCommit = (rows: RowResult[]) => {
      batchCommitQueueRef.current = batchCommitQueueRef.current
        .then(async () => {
          await applyBatchResult(rows, { writeDataset: false });
        })
        .catch((err) => {
          console.error("[Populate] incremental commit", err);
        });
    };

    try {
      const pipelineResult = await runPopulatePipeline({
        populateId: id,
        nodes: executorNodes,
        edges: pipelineEdges,
        dataset: connectedDataset,
        listId,
        bindings: adaptedBindings,
        templatePrompt,
        promptTemplatesByNodeId,
        manualTokenValues: nodeData.templateManualTokens,
        registry: defaultExecutorRegistry,
        ownerEmail,
        resolveFixedExternal: createResolveFixedExternal(pipelineNodes, pipelineEdges),
        onRowResult: (row) => {
          batchPipelineRowsRef.current[row.rowIndex] = row;
          const doneCount = row.rowIndex + 1;
          setProgress({ done: doneCount, total: rowCount });
          patchSelf({ progressDone: doneCount });
          queueIncrementalCommit([...batchPipelineRowsRef.current.filter(Boolean)]);
        },
      });

      batchPipelineRowsRef.current = pipelineResult.rows;
      await batchCommitQueueRef.current;
      await applyBatchResult(pipelineResult.rows, { writeDataset: true });
    } catch (err) {
      await batchCommitQueueRef.current;
      const partial = batchPipelineRowsRef.current.filter(Boolean);
      if (partial.length > 0) {
        await applyBatchResult(partial, {
          writeDataset: true,
          abortError: err instanceof Error ? err.message : "Error en el lote.",
        });
      } else {
        setError(err instanceof Error ? err.message : "Error en el lote.");
        patchSelf({ status: "error" });
      }
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }, [
    getTemplate,
    rowCount,
    patchSelf,
    id,
    nodeData.label,
    nodeData.templateBindings,
    nodeData.templatePrompt,
    nodeData.templateManualTokens,
    nodeData.datasetOutput,
    nodeData.datasetOutputsByChannel,
    nodeData.channelLabels,
    nodeData.channelPrompts,
    connectedDataset,
    listId,
    getNodes,
    getEdges,
    setNodes,
    ownerEmail,
    activeList,
    projectId,
  ]);

  /**
   * Generación por CLONADO (Designer): multiplica el documento en N instancias congeladas, una por
   * fila, resolviendo sus enlaces internos. No consume wallet (es render local del propio Designer).
   */
  const onGenerateDesignerBatch = useCallback(async () => {
    setError(null);
    const cfg = resolveDesignerTemplateConfig(id, getNodes(), getEdges());
    if (!cfg) {
      setError("Conecta un Designer (salida Document) al handle Plantilla de Populate.");
      return;
    }
    if (!connectedDataset || !listId) {
      setError("Conecta un Dataset al handle izquierdo.");
      return;
    }
    if (rowCount === 0) {
      setError("El listado no tiene filas.");
      return;
    }
    if (cfg.pages.length === 0) {
      setError("El Designer enlazado no tiene páginas.");
      return;
    }
    if (typeof window !== "undefined") {
      const ok = window.confirm(
        `Vas a multiplicar el Designer en ${rowCount} instancia${rowCount === 1 ? "" : "s"} (una por fila), ` +
          `congeladas con los datos de cada fila. ¿Continuar?`,
      );
      if (!ok) return;
    }

    setBusy(true);
    setProgress({ done: 0, total: rowCount });
    patchSelf({ status: "running", progressTotal: rowCount, progressDone: 0, error: undefined });
    const label = nodeData.label || "Populate";

    // Modo 2: mapeo hueco→columna asignado en la UI de Populate (huecos sin asignar quedan estáticos).
    const popData = (getNodes().find((n) => n.id === id)?.data ?? {}) as PopulateNodeData;
    const slotColumnMap = popData.designerSlotBindings ?? {};

    try {
      const rows: DesignerMaterializedRow[] = [];
      for (let i = 0; i < rowCount; i += 1) {
        const pages = freezeDesignerPagesForRow(cfg.pages, connectedDataset, i, slotColumnMap);
        rows.push({ rowIndex: i, cardId: activeList?.cards[i]?.id, pages });
        setProgress({ done: i + 1, total: rowCount });
        patchSelf({ progressDone: i + 1 });
      }

      const sub = buildDesignerGeneratedSubgraph(id, rows);
      window.dispatchEvent(
        new CustomEvent(POPULATE_COMMIT_EVENT, {
          detail: {
            populateNodeId: id,
            spaceName: label,
            nodes: sub.nodes,
            edges: sub.edges,
          },
        }),
      );

      // Fase 4b: rasterizar cada instancia y volcar M columnas × N filas al Dataset (si está activado).
      const outputSettings = nodeData.datasetOutput;
      if (outputSettings?.enabled && connectedDataset && listId) {
        try {
          setProgress({ done: 0, total: rowCount });
          const slideRows = await rasterizeAndUploadDesignerRows({
            rows,
            rasterize: rasterizeDesignerPages,
            upload: (dataUrl, ctx) =>
              uploadDesignerSlideRaster(dataUrl, {
                projectId,
                mediaId: `pdg_${id}_${ctx.rowIndex}_${ctx.slideKey}`,
              }),
            onRowDone: (done, total) => {
              setProgress({ done, total });
              patchSelf({ progressDone: done });
            },
          });
          const designerSettings: DesignerDatasetOutputSettings = {
            enabled: true,
            groupId: makePopulateDesignerGroupId(id),
            groupLabel: outputSettings.columnLabel || label,
            fillMode: outputSettings.fillMode,
          };
          const writeResult = await persistPopulateDesignerDatasetOutput({
            populateNodeId: id,
            nodes: getNodes(),
            edges: getEdges(),
            dataset: connectedDataset,
            listId,
            rows: slideRows,
            settings: designerSettings,
            setNodes,
          });
          patchSelf({
            lastDatasetWriteSummary:
              `${writeResult.writtenCount} celdas · ${writeResult.createdColumns} columnas nuevas` +
              (writeResult.orphanedColumns ? ` · ${writeResult.orphanedColumns} huérfanas` : ""),
          });
        } catch (writeErr) {
          console.error("[Populate] volcado de slides al Dataset", writeErr);
          setError(
            writeErr instanceof Error ? writeErr.message : "No se pudo volcar los slides al Dataset.",
          );
        } finally {
          setDesignerRasterReq(null);
        }
      }

      patchSelf({ status: "done", lastRunOutputs: [] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al multiplicar el Designer.");
      patchSelf({ status: "error" });
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }, [
    id,
    getNodes,
    getEdges,
    setNodes,
    connectedDataset,
    listId,
    rowCount,
    activeList,
    nodeData.label,
    nodeData.datasetOutput,
    projectId,
    rasterizeDesignerPages,
    patchSelf,
  ]);

  const onOpenResults = useCallback(() => {
    const spaceId = nodeData.spaceId;
    if (!spaceId) return;
    window.dispatchEvent(new CustomEvent("enter-space", { detail: { nodeId: id, spaceId } }));
  }, [id, nodeData.spaceId]);

  // Firma reactiva del nodo plantilla conectado: re-evalúa la plantilla cuando
  // cambia la conexión, el tipo/datos del nodo creativo o sus referencias.
  const templateSignature = useStore(
    useCallback(
      (s: ReactFlowState<Node, Edge>) => {
        const link = findPopulateTemplateLinkEdge(id, s.nodes, s.edges);
        if (!link) return "none";
        const tpl = s.nodes.find((n) => n.id === link.source);
        const d = (tpl?.data ?? {}) as Record<string, unknown>;
        const declaration = getNodeOrchestrationDeclaration(tpl?.type);
        const activeRefs = resolveActiveImageRefs({
          templateNodeId: link.source,
          imageInputs: declaration.imageInputs,
          nodes: s.nodes,
          edges: s.edges,
        });
        return [
          link.source,
          tpl?.type ?? "",
          typeof d.label === "string" ? d.label : "",
          typeof d.promptText === "string" ? d.promptText : "",
          typeof d.modelKey === "string" ? d.modelKey : "",
          activeImageRefsSignature(activeRefs),
        ].join("|");
      },
      [id],
    ),
  );

  const template = useMemo(
    () => getTemplate(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [getTemplate, templateSignature, nodeData.templatePrompt, nodeData.templateBindings],
  );

  // Firma reactiva de los CANALES (sinks): un canal por nodo creativo conectado a `template`.
  const channelsSignature = useStore(
    useCallback(
      (s: ReactFlowState<Node, Edge>) =>
        s.edges
          .filter((e) => e.target === id && e.targetHandle === "template")
          .map((e) => {
            const n = s.nodes.find((nn) => nn.id === e.source);
            const d = (n?.data ?? {}) as Record<string, unknown>;
            const nodePrompt = typeof d.promptText === "string" ? d.promptText : "";
            return `${e.source}:${n?.type ?? ""}:${typeof d.label === "string" ? d.label : ""}:${nodePrompt}`;
          })
          .join("|"),
      [id],
    ),
  );

  /** Canales detectados (sinks). Con ≥2 el Studio muestra una columna destino por canal. */
  const populateChannels = useMemo<{ channelId: string; label: string }[]>(() => {
    const nodes = getNodes();
    const edges = getEdges();
    const sinkIds = findPipelineSinkIds(id, edges as unknown as PipelineEdge[]);
    return sinkIds.map((sid, i) => {
      const n = nodes.find((nn) => nn.id === sid);
      const d = (n?.data ?? {}) as Record<string, unknown>;
      const label =
        nodeData.channelLabels?.[sid] ??
        (typeof d.label === "string" && d.label.trim() ? (d.label as string) : `Canal ${i + 1}`);
      return { channelId: sid, label };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, getNodes, getEdges, channelsSignature, nodeData.channelLabels]);

  const isMultiChannel = populateChannels.length > 1;

  const channelOutputs = useMemo(() => {
    const nodes = getNodes();
    return populateChannels.map((ch) => {
      const n = nodes.find((nn) => nn.id === ch.channelId);
      const executorNode = n
        ? { id: ch.channelId, type: n.type ?? "", data: (n.data ?? {}) as Record<string, unknown> }
        : undefined;
      return {
        channelId: ch.channelId,
        label: ch.label,
        nodePrompt: promptTextFromCreativeNode(executorNode),
        channelPrompt: nodeData.channelPrompts?.[ch.channelId] ?? "",
        settings:
          nodeData.datasetOutputsByChannel?.[ch.channelId] ??
          defaultPopulateDatasetOutputSettings(ch.label),
      };
    });
  }, [populateChannels, nodeData.datasetOutputsByChannel, nodeData.channelPrompts, getNodes]);

  const onChangeChannelOutput = useCallback(
    (channelId: string, next: PopulateDatasetOutputSettings) => {
      patchSelf({
        datasetOutputsByChannel: {
          ...(nodeData.datasetOutputsByChannel ?? {}),
          [channelId]: next,
        },
      });
    },
    [patchSelf, nodeData.datasetOutputsByChannel],
  );

  const onChangeChannelPrompt = useCallback(
    (channelId: string, next: string) => {
      patchSelf({
        channelPrompts: {
          ...(nodeData.channelPrompts ?? {}),
          [channelId]: next,
        },
      });
    },
    [patchSelf, nodeData.channelPrompts],
  );

  // Firma reactiva del template de tipo `node-clone` (Designer): nº de páginas + campos dinámicos.
  const designerSignature = useStore(
    useCallback(
      (s: ReactFlowState<Node, Edge>) => {
        const link = findPopulateTemplateLinkEdge(id, s.nodes, s.edges);
        if (!link) return "none";
        const tpl = s.nodes.find((n) => n.id === link.source);
        if (!tpl || !isNodeCloneTemplateType(tpl.type)) return "none";
        const pages = Array.isArray((tpl.data as { pages?: unknown[] })?.pages)
          ? ((tpl.data as { pages: DesignerPageState[] }).pages ?? [])
          : [];
        const fields = extractDesignerDynamicFields(pages);
        return [
          tpl.type ?? "",
          pages.length,
          fields.map((f) => `${f.key}:${f.status}`).join(","),
        ].join("|");
      },
      [id],
    ),
  );

  const designerTemplate = useMemo(
    () => (designerSignature === "none" ? null : resolveDesignerTemplateConfig(id, getNodes(), getEdges())),
    [designerSignature, id, getNodes, getEdges],
  );
  const isDesignerTemplate = !!designerTemplate;

  /** Huecos dinámicos pendientes de asignar columna (Modo 2). */
  const designerPendingFields = useMemo(
    () => (designerTemplate?.dynamicFields ?? []).filter((f) => f.status === "pending"),
    [designerTemplate],
  );
  const designerSlotBindings = nodeData.designerSlotBindings ?? EMPTY_SLOT_BINDINGS;
  const designerMappedCount = useMemo(
    () => designerPendingFields.filter((f) => Boolean(designerSlotBindings[f.key])).length,
    [designerPendingFields, designerSlotBindings],
  );

  /** Modelo de formulario Designer: un campo por hueco dinámico pendiente. */
  const designerFormModel = useMemo(
    () =>
      deriveDesignerForm({
        dynamicFields: designerTemplate?.dynamicFields ?? [],
        slotBindings: designerSlotBindings,
        dataset: connectedDataset ?? null,
        listId,
        slideCount: designerTemplate?.pages.length ?? 0,
      }),
    [designerTemplate, designerSlotBindings, connectedDataset, listId],
  );
  const [designerFormResults, setDesignerFormResults] = useState<string[]>([]);

  /**
   * Formulario Designer: congela UNA instancia con los valores tecleados y la rasteriza
   * (tantas imágenes como slides). No consume wallet (render local del propio Designer). Además
   * deja la instancia congelada en el lienzo, igual que el lote.
   */
  const onGenerateDesignerForm = useCallback(async () => {
    setError(null);
    const cfg = resolveDesignerTemplateConfig(id, getNodes(), getEdges());
    if (!cfg) {
      setError("Conecta un Designer (salida Document) al handle Plantilla de Populate.");
      return;
    }
    if (cfg.pages.length === 0) {
      setError("El Designer enlazado no tiene páginas.");
      return;
    }
    const freshPop = (getNodes().find((n) => n.id === id)?.data ?? {}) as PopulateNodeData;
    const fv = freshPop.formValues ?? {};
    const slotValues = resolveDesignerSlotValues({
      model: designerFormModel,
      textValues: fv,
      imageSelections: fv,
    });

    const label = nodeData.label || "Populate";
    setBusy(true);
    setDesignerFormResults([]);
    setProgress({ done: 0, total: cfg.pages.length });
    patchSelf({ status: "running", error: undefined });
    try {
      const pages = freezeDesignerPagesForForm(cfg.pages, slotValues);
      const pageIds = pages.map((p) => p.id);
      const byId = await rasterizeDesignerPages(pages, pageIds);
      const results = pageIds.map((pid) => byId[pid]).filter((u): u is string => Boolean(u));
      setDesignerFormResults(results);

      const sub = buildDesignerGeneratedSubgraph(id, [{ rowIndex: 0, pages }]);
      window.dispatchEvent(
        new CustomEvent(POPULATE_COMMIT_EVENT, {
          detail: { populateNodeId: id, spaceName: label, nodes: sub.nodes, edges: sub.edges },
        }),
      );
      patchSelf({ status: "done" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al generar la pieza Designer.");
      patchSelf({ status: "error" });
    } finally {
      setBusy(false);
      setProgress(null);
      setDesignerRasterReq(null);
    }
  }, [
    id,
    getNodes,
    getEdges,
    designerFormModel,
    nodeData.label,
    rasterizeDesignerPages,
    patchSelf,
  ]);

  /** Asigna (o limpia) la columna de un hueco dinámico; clave = `designerSlotKey`. */
  const onChangeDesignerSlotBinding = useCallback(
    (slotKey: string, fieldId: string) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== id) return n;
          const d = (n.data ?? {}) as PopulateNodeData;
          const prev = d.designerSlotBindings ?? {};
          if (!fieldId) {
            if (!(slotKey in prev)) return n;
            const next = { ...prev };
            delete next[slotKey];
            return { ...n, data: { ...n.data, designerSlotBindings: next } };
          }
          const list = (connectedDataset?.lists ?? []).find((l) => l.id === listId);
          const field = list?.schema.find((f) => f.id === fieldId);
          if (!list || !field) return n;
          return {
            ...n,
            data: {
              ...n.data,
              designerSlotBindings: {
                ...prev,
                [slotKey]: { listId: list.id, listKey: list.key, fieldId: field.id, fieldKey: field.key },
              },
            },
          };
        }),
      );
    },
    [id, setNodes, connectedDataset, listId],
  );

  /** Prompt y bindings efectivos para el editor (Populate manda; si no, semilla). */
  const editorPrompt =
    typeof nodeData.templatePrompt === "string" ? nodeData.templatePrompt : template?.seedPrompt ?? "";
  const editorBindings = useMemo<PopulateBindings>(
    () => nodeData.templateBindings ?? template?.bindings ?? {},
    [nodeData.templateBindings, template?.bindings],
  );

  const onChangeTemplatePrompt = useCallback(
    (next: string) => patchSelf({ templatePrompt: next }),
    [patchSelf],
  );

  const onChangeTemplateBinding = useCallback(
    (inputId: string, binding: PopulateInputBinding) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== id) return n;
          const d = (n.data ?? {}) as PopulateNodeData;
          const base = d.templateBindings ?? template?.bindings ?? {};
          return { ...n, data: { ...n.data, templateBindings: { ...base, [inputId]: binding } } };
        }),
      );
    },
    [id, setNodes, template?.bindings],
  );

  /**
   * Marca/desmarca un token del prompt como "manual" y guarda su valor.
   * `value === null` ⇒ vuelve a columna/constante (se borra el token manual).
   */
  const onChangeTemplateManualToken = useCallback(
    (tokenKey: string, value: string | null) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== id) return n;
          const d = (n.data ?? {}) as PopulateNodeData;
          const next: Record<string, string> = { ...(d.templateManualTokens ?? {}) };
          if (value === null) delete next[tokenKey];
          else next[tokenKey] = value;
          return { ...n, data: { ...n.data, templateManualTokens: next } };
        }),
      );
    },
    [id, setNodes],
  );

  /** Resumen de mapeo: qué referencias toman columna y cuántos {campos} hay en el prompt. */
  const mapping = useMemo(() => {
    if (!template) return { columnRefs: [] as string[], tokenCount: 0 };
    const labelByFieldId = new Map(activeList?.schema.map((f) => [f.id, f.label]) ?? []);
    const columnRefs: string[] = [];
    for (const slot of template.activeImageRefs) {
      const b = editorBindings[slot.inputId];
      if (b?.source === "column") {
        const col =
          (b.fieldId ? labelByFieldId.get(b.fieldId) : undefined) ?? b.fieldKey ?? "columna";
        columnRefs.push(`${slot.label} → ${col}`);
      }
    }
    return {
      columnRefs,
      tokenCount: new Set(extractPromptTokens(editorPrompt)).size,
    };
  }, [template, activeList, editorBindings, editorPrompt]);

  // ── Modo de ejecución: lote (Dataset) o formulario (una pieza manual) ──
  const mode: "batch" | "form" = nodeData.mode === "form" ? "form" : "batch";
  const setMode = useCallback(
    (next: "batch" | "form") => patchSelf({ mode: next }),
    [patchSelf],
  );

  const formModel = useMemo(
    () =>
      derivePopulateForm({
        promptTemplate: editorPrompt,
        bindings: editorBindings,
        imageInputs: template?.activeImageRefs ?? [],
        dataset: connectedDataset ?? null,
        listId,
      }),
    [editorPrompt, editorBindings, template?.activeImageRefs, connectedDataset, listId],
  );

  const formValues = useMemo(() => nodeData.formValues ?? {}, [nodeData.formValues]);
  const formImageRows = useMemo(() => nodeData.formImageRows ?? {}, [nodeData.formImageRows]);

  const onChangeFormText = useCallback(
    (key: string, value: string) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== id) return n;
          const d = (n.data ?? {}) as PopulateNodeData;
          return { ...n, data: { ...n.data, formValues: { ...(d.formValues ?? {}), [key]: value } } };
        }),
      );
    },
    [id, setNodes],
  );

  const onChangeFormImageRow = useCallback(
    (inputId: string, rowIndex: number) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== id) return n;
          const d = (n.data ?? {}) as PopulateNodeData;
          return {
            ...n,
            data: { ...n.data, formImageRows: { ...(d.formImageRows ?? {}), [inputId]: rowIndex } },
          };
        }),
      );
    },
    [id, setNodes],
  );

  const onAutofillForm = useCallback(
    (rowIndex: number) => {
      if (!connectedDataset || !listId) return;
      const { textValues, imageRows } = autofillFormFromRow(
        formModel,
        connectedDataset,
        listId,
        rowIndex,
      );
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== id) return n;
          const d = (n.data ?? {}) as PopulateNodeData;
          return {
            ...n,
            data: {
              ...n.data,
              formValues: { ...(d.formValues ?? {}), ...textValues },
              formImageRows: { ...(d.formImageRows ?? {}), ...imageRows },
            },
          };
        }),
      );
    },
    [connectedDataset, listId, formModel, id, setNodes],
  );

  const onAutofillDesignerForm = useCallback(
    (rowIndex: number) => {
      if (!connectedDataset || !listId) return;
      const values = autofillDesignerFormFromRow(
        designerFormModel,
        connectedDataset,
        listId,
        rowIndex,
      );
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== id) return n;
          const d = (n.data ?? {}) as PopulateNodeData;
          return {
            ...n,
            data: {
              ...n.data,
              formValues: { ...(d.formValues ?? {}), ...values },
            },
          };
        }),
      );
    },
    [connectedDataset, listId, designerFormModel, id, setNodes],
  );

  const onGenerateForm = useCallback(async () => {
    setError(null);
    const tpl = getTemplate();
    if (!tpl) {
      setError("Conecta Image Creation (salida Image out) al handle Plantilla de Populate.");
      return;
    }
    const freshPop = getNodes().find((n) => n.id === id);
    const fv = ((freshPop?.data ?? {}) as PopulateNodeData).formValues ?? {};
    const fir = ((freshPop?.data ?? {}) as PopulateNodeData).formImageRows ?? {};

    const prompt = resolveFormPrompt(formModel, tpl.promptTemplate, fv);
    if (!prompt.trim()) {
      setError("Rellena el formulario antes de generar.");
      return;
    }
    const refs = resolveFormImages({
      model: formModel,
      imageInputs: tpl.activeImageRefs,
      fixedRefUrls: tpl.fixedRefUrls,
      imageRows: fir,
      dataset: connectedDataset ?? null,
      listId,
    });

    const label = nodeData.label || "Populate";
    setBusy(true);
    setPreviewUrl(null);
    patchSelf({ status: "running" });
    try {
      const result = await generatePopulateImage({
        prompt,
        images: refs.map((r) => r.url),
        model: toGenModel(tpl),
      });
      setPreviewUrl(result.output);

      const row: MaterializedRow = {
        rowIndex: 0,
        prompt,
        refs: refs.map((r) => ({ inputId: r.inputId, url: r.url, label: r.label })),
        output: result.output,
        s3Key: result.s3Key,
      };
      const sub = buildRowSubgraph(id, row, tpl.model, 80, tpl.templateType, "form");
      const mediaList = buildMediaListOutput(id, label, [row]);

      window.dispatchEvent(
        new CustomEvent(POPULATE_COMMIT_EVENT, {
          detail: {
            populateNodeId: id,
            spaceName: label,
            nodes: sub.nodes,
            edges: sub.edges,
            mediaListOutput: mediaList,
            value: result.output,
            replacePrefix: `pop_${id}_form`,
          },
        }),
      );
      patchSelf({ status: "done", lastRunOutputs: [result.output], value: result.output, mediaListOutput: mediaList });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al generar la pieza.");
      patchSelf({ status: "error" });
    } finally {
      setBusy(false);
    }
  }, [getTemplate, getNodes, id, formModel, connectedDataset, listId, nodeData.label, patchSelf, toGenModel]);

  const publicFormShareToken = nodeData.publicFormShareToken ?? null;

  const buildSharePayload = useCallback((): PopulateSharePayload | null => {
    // Plantilla Designer: enlace de rasterizado en cliente (N imágenes = N slides).
    if (isDesignerTemplate) {
      const cfg = resolveDesignerTemplateConfig(id, getNodes(), getEdges());
      if (!cfg || cfg.pages.length === 0 || designerFormModel.empty) return null;
      return {
        title: nodeData.label || "Populate",
        promptTemplate: "",
        formModel: { textFields: [], imageFields: [], rows: [], empty: true },
        templateModel: { modelKey: "designer", aspectRatio: "" },
        fixedRefUrls: {},
        imageInputs: [],
        designer: {
          pages: cfg.pages,
          formFields: designerFormModel.fields,
          rows: designerFormModel.rows.map((row) => ({
            ...row,
            ...(connectedDataset && listId
              ? {
                  slotValues: autofillDesignerFormFromRow(
                    designerFormModel,
                    connectedDataset,
                    listId,
                    row.rowIndex,
                  ),
                }
              : {}),
          })),
          slideCount: cfg.pages.length,
        },
      };
    }
    const tpl = getTemplate();
    if (!tpl) return null;
    return buildPopulateSharePayload({
      title: nodeData.label || "Populate",
      promptTemplate: tpl.promptTemplate,
      formModel,
      templateModel: toGenModel(tpl),
      fixedRefUrls: tpl.fixedRefUrls,
      imageInputs: tpl.activeImageRefs,
    });
  }, [
    isDesignerTemplate,
    id,
    getNodes,
    getEdges,
    designerFormModel,
    connectedDataset,
    listId,
    getTemplate,
    nodeData.label,
    formModel,
    toGenModel,
  ]);

  const onShareForm = useCallback(async () => {
    setShareError(null);
    const payload = buildSharePayload();
    if (!payload) {
      setShareError(
        isDesignerTemplate
          ? "Marca campos dinámicos en el Designer antes de compartir."
          : "Inserta variables en la plantilla antes de compartir.",
      );
      return;
    }
    setShareBusy(true);
    try {
      const r = await fetch("/api/populate-share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shareKey: id,
          populateNodeId: id,
          name: nodeData.label || "Populate",
          existingToken: publicFormShareToken ?? undefined,
          payload,
        }),
      });
      const j = (await r.json()) as { link?: { token?: string }; error?: string };
      if (!r.ok) {
        setShareError(j.error?.trim() || `Error ${r.status}`);
        return;
      }
      if (j.link?.token) {
        patchSelf({ publicFormShareToken: j.link.token });
        const url = `${window.location.origin}/f/${j.link.token}`;
        void navigator.clipboard.writeText(url).catch(() => undefined);
      }
    } catch (e) {
      setShareError(e instanceof Error ? e.message : "Error al crear el enlace");
    } finally {
      setShareBusy(false);
    }
  }, [buildSharePayload, isDesignerTemplate, id, nodeData.label, publicFormShareToken, patchSelf]);

  const onCopyShareUrl = useCallback(() => {
    if (!publicFormShareToken) return;
    const url = `${window.location.origin}/f/${publicFormShareToken}`;
    void navigator.clipboard.writeText(url).then(
      () => setShareError(null),
      () => setShareError("No se pudo copiar el enlace"),
    );
  }, [publicFormShareToken]);

  const onDownloadResult = useCallback(async () => {
    if (!previewUrl) return;
    try {
      const res = await fetch(previewUrl);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(nodeData.label || "populate").replace(/\s+/g, "-").toLowerCase()}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      window.open(previewUrl, "_blank");
    }
  }, [previewUrl, nodeData.label]);

  const ready = (isDesignerTemplate || !!template) && rowCount > 0;
  const listName = activeList?.name ?? "—";
  const progressPct =
    progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  const lastRunOutputs = nodeData.lastRunOutputs ?? [];
  const lastRunFailures = nodeData.lastRunFailures ?? [];
  const runStatus = nodeData.status;
  const lastRunOkCount = nodeData.lastRunOkCount;
  const lastRunFailedCount = nodeData.lastRunFailedCount;
  const studioError = error ?? nodeData.error ?? null;
  const compactSummary = buildPopulateCompactSummary({
    listName,
    rowCount,
    templateLabel: template?.templateLabel ?? null,
    tokenCount: mapping.tokenCount,
    dynamicRefCount: mapping.columnRefs.length,
    activeRefCount: template?.activeImageRefs.length ?? 0,
    mode,
    hasShareToken: Boolean(publicFormShareToken),
  });
  const genModel = useMemo(
    () => (template ? toGenModel(template) : { modelKey: "flash31", aspectRatio: "16:9", provider: "gemini" as const }),
    [template, toGenModel],
  );

  const datasetOutputSettings = useMemo(
    () => nodeData.datasetOutput ?? defaultPopulateDatasetOutputSettings(template?.templateLabel ?? null),
    [nodeData.datasetOutput, template?.templateLabel],
  );

  const onChangeDatasetOutput = useCallback(
    (next: PopulateDatasetOutputSettings) => patchSelf({ datasetOutput: next }),
    [patchSelf],
  );

  return (
    <StudioCanvasNodeShell
      nodeId={id}
      nodeType="populate"
      selected={selected}
      label={nodeData.label}
      defaultLabel="Populate"
      title="Populate"
      handles={HANDLES}
      variant="frameless"
      material="media"
      className="populate-node"
    >
      <div className="foldder-frameless-main relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="populate-empty-background absolute inset-0 overflow-hidden" aria-hidden>
          <img
            src={POPULATE_EMPTY_BACKGROUND_SRC}
            alt=""
            className="h-full w-full object-cover object-center"
            draggable={false}
          />
        </div>

        {previewUrl || progress ? (
          <div className="populate-node-preview" aria-hidden={!previewUrl && !progress}>
            {previewUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={previewUrl} alt="Vista previa" />
                <button
                  type="button"
                  className="populate-download-btn nodrag"
                  onClick={(e) => {
                    e.stopPropagation();
                    void onDownloadResult();
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  title="Descargar imagen"
                >
                  <Download size={13} strokeWidth={2.2} />
                </button>
              </>
            ) : progress ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-white/90">
                <Loader2 size={22} className="animate-spin" style={{ color: POPULATE_ACCENT }} />
                <span className="text-[11px] font-semibold uppercase tracking-wide">
                  Bucle {progress.done}/{progress.total}
                </span>
                <div className="h-1 w-full max-w-[180px] bg-white/20">
                  <div
                    className="h-full transition-[width] duration-300"
                    style={{ width: `${progressPct}%`, background: POPULATE_ACCENT }}
                  />
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="populate-node-summary nodrag relative z-10">
          {!datasetConnected ? (
            <p className="populate-node-summary__text populate-node-summary__text--muted">
              Conecta un Dataset (izquierda) y Image Creation → Image out (abajo).
            </p>
          ) : datasetLoading ? (
            <p className="populate-node-summary__text populate-node-summary__text--muted">
              <Loader2 size={12} className="inline animate-spin" /> Cargando Dataset…
            </p>
          ) : (
            <>
              <p className="populate-node-summary__text">
                {isDesignerTemplate
                  ? `Designer «${designerTemplate?.templateLabel}» · ${listName} · ${rowCount} fila${
                      rowCount === 1 ? "" : "s"
                    } · ${designerTemplate?.pages.length ?? 0} slide${
                      (designerTemplate?.pages.length ?? 0) === 1 ? "" : "s"
                    } · ${designerTemplate?.dynamicFields.length ?? 0} campo${
                      (designerTemplate?.dynamicFields.length ?? 0) === 1 ? "" : "s"
                    } dinámico${(designerTemplate?.dynamicFields.length ?? 0) === 1 ? "" : "s"}`
                  : compactSummary}
              </p>
              {lists.length > 1 ? (
                <select
                  className="populate-node-list-select nodrag"
                  value={listId ?? ""}
                  onChange={(e) => onSelectList(e.target.value)}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  {lists.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name} · {l.cards.length}
                    </option>
                  ))}
                </select>
              ) : null}
              {isDesignerTemplate && datasetConnected ? (
                <p className="populate-node-summary__meta">
                  {designerMappedCount > 0
                    ? `${designerMappedCount}/${designerPendingFields.length} campo${
                        designerPendingFields.length === 1 ? "" : "s"
                      } mapeado${designerMappedCount === 1 ? "" : "s"}`
                    : designerPendingFields.length > 0
                      ? `${designerPendingFields.length} campo${
                          designerPendingFields.length === 1 ? "" : "s"
                        } por mapear en Studio`
                      : "Marca campos dinámicos en el Designer"}
                  {datasetOutputSettings.enabled ? " · volcado al Dataset activo" : ""}
                </p>
              ) : null}
              {lastRunOutputs.length > 0 && !busy ? (
                <p className="populate-node-summary__meta">
                  Última ejecución: {lastRunOutputs.length} imagen
                  {lastRunOutputs.length === 1 ? "" : "es"}
                  {runStatus === "partial" ? " · parcial" : ""}
                  {nodeData.lastRunFailedCount
                    ? ` · ${nodeData.lastRunFailedCount} fallo${nodeData.lastRunFailedCount === 1 ? "" : "s"}`
                    : ""}
                </p>
              ) : null}
            </>
          )}
        </div>

        {studioError ? (
          <div className="foldder-frameless-error nodrag flex items-start gap-1.5 px-2 py-1 text-[10px]">
            <AlertTriangle size={11} className="mt-0.5 shrink-0" />
            <span>{studioError}</span>
          </div>
        ) : null}

        <div className="foldder-frameless-footer-action nodrag populate-node-footer relative z-10">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setStudioOpen(true);
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="populate-open-studio nodrag"
            title="Abrir Studio para mapear variables y generar"
          >
            <Sparkles size={14} strokeWidth={2.2} />
            Abrir Studio
          </button>

          {mode === "batch" ? (
            <button
              type="button"
              disabled={busy || !ready}
              onClick={(e) => {
                e.stopPropagation();
                void (isDesignerTemplate ? onGenerateDesignerBatch() : onGenerateBatch());
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="execute-btn populate-run-button nodrag"
              title={
                ready
                  ? isDesignerTemplate
                    ? `Multiplica el Designer en ${rowCount} instancia${rowCount === 1 ? "" : "s"}, una por fila`
                    : `Genera ${rowCount} imagen${rowCount === 1 ? "" : "es"}, una por fila`
                  : isDesignerTemplate
                    ? "Conecta Dataset y Designer (Document)"
                    : "Conecta Dataset e Image out"
              }
            >
              {busy && progress ? (
                <>
                  <Loader2 size={13} className="animate-spin" />
                  Bucle {progress.done}/{progress.total}
                </>
              ) : (
                <>
                  <Repeat size={13} strokeWidth={2.2} />
                  Ejecutar · {rowCount}
                </>
              )}
            </button>
          ) : null}

          {(nodeData.spaceId || lastRunOutputs.length > 0) ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenResults();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="action-btn populate-open-results nodrag"
            >
              <FolderOpen size={12} />
              Resultados
            </button>
          ) : null}
        </div>
      </div>

      {studioOpen ? (
        <PopulateStudio
          nodeId={id}
          nodeLabel={nodeData.label?.trim() || "Populate"}
          mode={mode}
          onModeChange={setMode}
          onClose={() => setStudioOpen(false)}
          templateLabel={template?.templateLabel ?? designerTemplate?.templateLabel ?? null}
          promptText={editorPrompt}
          promptLabel={template?.textInputs[0]?.label ?? "Prompt"}
          bindings={editorBindings}
          activeImageRefs={template?.activeImageRefs ?? []}
          model={genModel}
          onChangePrompt={onChangeTemplatePrompt}
          onChangeBinding={onChangeTemplateBinding}
          manualTokens={nodeData.templateManualTokens ?? {}}
          onChangeManualToken={onChangeTemplateManualToken}
          schema={activeList?.schema ?? []}
          constantFields={connectedDataset?.constants.fields ?? []}
          listId={listId}
          listName={listName}
          rowCount={rowCount}
          lists={lists}
          onSelectList={onSelectList}
          datasetConnected={datasetConnected}
          datasetLoading={datasetLoading}
          dataset={connectedDataset ?? null}
          formModel={formModel}
          formValues={formValues}
          formImageRows={formImageRows}
          onChangeFormText={onChangeFormText}
          onChangeFormImageRow={onChangeFormImageRow}
          onAutofillForm={onAutofillForm}
          busy={busy}
          progress={progress}
          lastRunOutputs={lastRunOutputs}
          lastRunFailures={lastRunFailures}
          lastRunOkCount={lastRunOkCount}
          lastRunFailedCount={lastRunFailedCount}
          runStatus={runStatus}
          previewRowIndex={previewRowIndex}
          onPreviewRowChange={onPreviewRowChange}
          previewUrl={previewUrl}
          previewLoading={previewLoading}
          onPreview={() => void onPreview()}
          onGenerateBatch={() => void (isDesignerTemplate ? onGenerateDesignerBatch() : onGenerateBatch())}
          onGenerateForm={() => void onGenerateForm()}
          shareToken={publicFormShareToken}
          shareBusy={shareBusy}
          shareError={shareError}
          onShare={() => void onShareForm()}
          onCopyShareUrl={onCopyShareUrl}
          error={studioError}
          datasetOutput={datasetOutputSettings}
          onChangeDatasetOutput={onChangeDatasetOutput}
          channels={isMultiChannel ? channelOutputs : undefined}
          onChangeChannelOutput={onChangeChannelOutput}
          onChangeChannelPrompt={onChangeChannelPrompt}
          lastDatasetWriteSummary={nodeData.lastDatasetWriteSummary ?? null}
          isDesignerTemplate={isDesignerTemplate}
          designerFields={designerTemplate?.dynamicFields ?? []}
          designerSlideCount={designerTemplate?.pages.length ?? 0}
          designerSlotBindings={designerSlotBindings}
          onChangeDesignerSlotBinding={onChangeDesignerSlotBinding}
          designerFormModel={designerFormModel}
          designerFormValues={formValues}
          designerFormResults={designerFormResults}
          onChangeDesignerFormValue={onChangeFormText}
          onAutofillDesignerForm={onAutofillDesignerForm}
          onGenerateDesignerForm={() => void onGenerateDesignerForm()}
        />
      ) : null}
      {designerRasterReq ? (
        <DesignerHeadlessRasterPortal
          request={designerRasterReq}
          onPage={(pageId, dataUrl) => {
            if (designerRasterRef.current) designerRasterRef.current.collected[pageId] = dataUrl;
          }}
          onDone={() => {
            const ref = designerRasterRef.current;
            designerRasterRef.current = null;
            ref?.resolve(ref.collected);
          }}
          onError={(err) => {
            const ref = designerRasterRef.current;
            designerRasterRef.current = null;
            ref?.reject(err);
          }}
        />
      ) : null}
    </StudioCanvasNodeShell>
  );
}

export const PopulateNode = memo(PopulateNodeImpl);
