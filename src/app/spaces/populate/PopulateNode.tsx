"use client";

import React, { memo, useCallback, useMemo, useState } from "react";
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
} from "lucide-react";
import { StudioCanvasNodeShell, type StudioCanvasNodeHandleSpec } from "../studio-node/studio-canvas-node";
import { resolveMediaUrlFromEdgeSource } from "../resolve-connected-media-url";
import { resolvePromptValueFromEdgeSourceMap } from "../canvas-group-logic";
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
import { extractPromptTokens } from "./populate-tokens";
import { resolveImageBindingForRow, resolvePromptForRow } from "./populate-resolve";
import { getNodeOrchestrationDeclaration } from "./populate-declaration";
import { PopulateTemplatePanel } from "./PopulateTemplatePanel";
import { PopulateFormPanel } from "./PopulateFormPanel";
import {
  autofillFormFromRow,
  derivePopulateForm,
  resolveFormImages,
  resolveFormPrompt,
} from "./populate-form";
import { buildPopulateSharePayload } from "./populate-share-payload";
import { generatePopulateImage, type PopulateTemplateModel } from "./populate-generate";
import {
  buildGeneratedSubgraph,
  buildMediaListOutput,
  buildRowSubgraph,
  type MaterializedRow,
} from "./populate-materialize";

const POPULATE_ACCENT = "#FD52EB";
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
  /** Inputs de imagen y texto leídos por DECLARACIÓN del nodo creativo. */
  imageInputs: CreativeInputDescriptor[];
  textInputs: CreativeInputDescriptor[];
};

function resolveTemplateConfig(
  populateId: string,
  nodes: Node[],
  edges: Edge[],
): TemplateConfig | null {
  const linkEdge = edges.find((e) => e.target === populateId && e.targetHandle === "template");
  if (!linkEdge) return null;
  const tpl = nodes.find((n) => n.id === linkEdge.source);
  if (!tpl) return null;
  const data = (tpl.data ?? {}) as Record<string, unknown>;
  const populateNode = nodes.find((n) => n.id === populateId);
  const popData = (populateNode?.data ?? {}) as PopulateNodeData;
  const nodesById = new Map(nodes.map((n) => [n.id, n]));

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

  // URLs de referencia fija: lo conectado a cada handle de imagen DECLARADO.
  const fixedRefUrls: Record<string, string> = {};
  for (const slot of declaration.imageInputs) {
    const refEdge = edges.find((e) => e.target === tpl.id && e.targetHandle === slot.inputId);
    if (refEdge) {
      const url = resolveMediaUrlFromEdgeSource(refEdge, nodes, edges);
      if (url) fixedRefUrls[slot.inputId] = url;
    }
  }

  return {
    templateNodeId: tpl.id,
    templateType: tpl.type ?? "",
    templateLabel:
      typeof data.label === "string" && data.label.trim()
        ? (data.label as string)
        : "Image Creation",
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
    imageInputs: declaration.imageInputs,
    textInputs: declaration.textInputs,
  };
}

function PopulateNodeImpl({ id, data, selected }: NodeProps) {
  const nodeData = (data ?? {}) as PopulateNodeData;
  const { getNodes, getEdges, setNodes } = useReactFlow();
  const { connectedDataset, datasetConnected, datasetLoading } = useConnectedDatasetForNode(id);

  const [busy, setBusy] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      return rowIndices.map((rowIndex) => {
        const prompt = resolvePromptForRow(template.promptTemplate, dataset, listId, rowIndex);
        const refs: MaterializedRow["refs"] = [];
        for (const slot of template.imageInputs) {
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
    [connectedDataset, listId, activeList],
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
      setError("Conecta un nodo Image Creation al handle Plantilla.");
      return;
    }
    if (rowCount === 0) {
      setError("El listado no tiene filas.");
      return;
    }
    const [row] = buildRows(template, [0]);
    if (!row || !row.prompt.trim()) {
      setError("La plantilla no tiene prompt. Escribe el prompt en Image Creation.");
      return;
    }
    setBusy(true);
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
      setBusy(false);
    }
  }, [getTemplate, rowCount, buildRows, patchSelf, toGenModel]);

  const onGenerateBatch = useCallback(async () => {
    setError(null);
    const template = getTemplate();
    if (!template) {
      setError("Conecta un nodo Image Creation al handle Plantilla.");
      return;
    }
    if (rowCount === 0) {
      setError("El listado no tiene filas.");
      return;
    }
    if (typeof window !== "undefined") {
      const ok = window.confirm(
        `Vas a generar ${rowCount} imágenes (una por fila). Esto consume wallet. ¿Continuar?`,
      );
      if (!ok) return;
    }

    const rowIndices = Array.from({ length: rowCount }, (_, i) => i);
    const rows = buildRows(template, rowIndices);
    setBusy(true);
    setProgress({ done: 0, total: rowCount });
    patchSelf({ status: "running", progressTotal: rowCount, progressDone: 0, error: undefined });

    const label = nodeData.label || "Populate";

    try {
      for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i]!;
        if (!row.prompt.trim()) continue;
        try {
          const result = await generatePopulateImage({
            prompt: row.prompt,
            images: row.refs.map((r) => r.url),
            model: toGenModel(template),
          });
          row.output = result.output;
          row.s3Key = result.s3Key;
        } catch (err) {
          // No abortamos el lote por un fallo puntual; se queda pendiente.
          console.error("[Populate] fila", row.rowIndex, err);
        }
        setProgress({ done: i + 1, total: rowCount });
        patchSelf({ progressDone: i + 1 });
      }

      const sub = buildGeneratedSubgraph(id, rows, template.model, template.templateType);
      const mediaList = buildMediaListOutput(id, label, rows);
      const firstOutput = rows.find((r) => r.output)?.output ?? "";

      window.dispatchEvent(
        new CustomEvent(POPULATE_COMMIT_EVENT, {
          detail: {
            populateNodeId: id,
            spaceName: label,
            nodes: sub.nodes,
            edges: sub.edges,
            mediaListOutput: mediaList,
            value: firstOutput,
          },
        }),
      );
      patchSelf({ status: "done" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error en el lote.");
      patchSelf({ status: "error" });
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }, [getTemplate, rowCount, buildRows, patchSelf, toGenModel, id, nodeData.label]);

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
        const link = s.edges.find((e) => e.target === id && e.targetHandle === "template");
        if (!link) return "none";
        const tpl = s.nodes.find((n) => n.id === link.source);
        const d = (tpl?.data ?? {}) as Record<string, unknown>;
        return [
          link.source,
          tpl?.type ?? "",
          typeof d.label === "string" ? d.label : "",
          typeof d.promptText === "string" ? d.promptText : "",
          typeof d.modelKey === "string" ? d.modelKey : "",
          s.edges.filter((e) => e.target === link.source).length,
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

  /** Resumen de mapeo: qué referencias toman columna y cuántos {campos} hay en el prompt. */
  const mapping = useMemo(() => {
    if (!template) return { columnRefs: [] as string[], tokenCount: 0 };
    const labelByFieldId = new Map(activeList?.schema.map((f) => [f.id, f.label]) ?? []);
    const columnRefs: string[] = [];
    for (const slot of template.imageInputs) {
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
        imageInputs: template?.imageInputs ?? [],
        dataset: connectedDataset ?? null,
        listId,
      }),
    [editorPrompt, editorBindings, template?.imageInputs, connectedDataset, listId],
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

  const onGenerateForm = useCallback(async () => {
    setError(null);
    const tpl = getTemplate();
    if (!tpl) {
      setError("Conecta un nodo Image Creation al handle Plantilla.");
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
      imageInputs: tpl.imageInputs,
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
      patchSelf({ status: "done" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al generar la pieza.");
      patchSelf({ status: "error" });
    } finally {
      setBusy(false);
    }
  }, [getTemplate, getNodes, id, formModel, connectedDataset, listId, nodeData.label, patchSelf, toGenModel]);

  const publicFormShareToken = nodeData.publicFormShareToken ?? null;

  const buildSharePayload = useCallback(() => {
    const tpl = getTemplate();
    if (!tpl) return null;
    return buildPopulateSharePayload({
      title: nodeData.label || "Populate",
      promptTemplate: tpl.promptTemplate,
      formModel,
      templateModel: toGenModel(tpl),
      fixedRefUrls: tpl.fixedRefUrls,
      imageInputs: tpl.imageInputs,
    });
  }, [getTemplate, nodeData.label, formModel, toGenModel]);

  const onShareForm = useCallback(async () => {
    setShareError(null);
    const payload = buildSharePayload();
    if (!payload || payload.formModel.empty) {
      setShareError("Inserta variables en la plantilla antes de compartir.");
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
  }, [buildSharePayload, id, nodeData.label, publicFormShareToken, patchSelf]);

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

  const formCanGenerate = !!template && !formModel.empty;
  const ready = !!template && rowCount > 0;
  const listName = activeList?.name ?? "—";
  const progressPct =
    progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

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

        <div className="foldder-frameless-secondary-panel nodrag relative z-10 flex flex-col gap-0.5 text-[8px] text-white/80">
          <div
            className="populate-mode-toggle nodrag"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className={mode === "batch" ? "is-active" : ""}
              onClick={(e) => {
                e.stopPropagation();
                setMode("batch");
              }}
            >
              Lote
            </button>
            <button
              type="button"
              className={mode === "form" ? "is-active" : ""}
              onClick={(e) => {
                e.stopPropagation();
                setMode("form");
              }}
            >
              Formulario
            </button>
          </div>

          {!datasetConnected ? (
            <span className="leading-snug text-white/55">
              Conecta un Dataset (izquierda) y Image Creation → Plantilla (abajo).
            </span>
          ) : datasetLoading ? (
            <span className="flex items-center gap-1 leading-snug text-white/55">
              <Loader2 size={10} className="animate-spin" /> Cargando Dataset…
            </span>
          ) : (
            <>
              <span className="leading-snug text-white/75">
                {listName} · {rowCount} {rowCount === 1 ? "fila" : "filas"}
                {template ? ` · ${template.templateLabel}` : " · sin plantilla"}
              </span>

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

              {!template ? (
                <span className="text-[7px] leading-snug text-white/50">
                  Conecta la salida Plantilla de Image Creation
                </span>
              ) : mode === "form" ? (
                <span className="text-[7px] leading-snug text-white/50">
                  Rellena el formulario y genera una pieza
                </span>
              ) : (
                <span className="text-[7px] leading-snug text-white/50">
                  {mapping.tokenCount > 0
                    ? `Prompt con ${mapping.tokenCount} campo${mapping.tokenCount === 1 ? "" : "s"} del Dataset`
                    : "Inserta campos {…} en el prompt de abajo"}
                  {mapping.columnRefs.length > 0
                    ? ` · ${mapping.columnRefs.length} ref por columna`
                    : ""}
                </span>
              )}

              {mode === "batch" ? (
                <button
                  type="button"
                  disabled={busy || !ready}
                  onClick={(e) => {
                    e.stopPropagation();
                    void onPreview();
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="populate-node-preview-link nodrag"
                >
                  Probar fila 1
                </button>
              ) : null}
            </>
          )}
        </div>

        {template && mode === "batch" ? (
          <div className="populate-template-editor nodrag relative z-10">
            <PopulateTemplatePanel
              promptText={editorPrompt}
              bindings={editorBindings}
              schema={activeList?.schema ?? []}
              constantFields={connectedDataset?.constants.fields ?? []}
              listId={listId}
              imageSlots={template.imageInputs}
              promptLabel={template.textInputs[0]?.label ?? "Prompt"}
              onChangePrompt={onChangeTemplatePrompt}
              onChangeBinding={onChangeTemplateBinding}
            />
          </div>
        ) : null}

        {template && mode === "form" ? (
          <div className="populate-template-editor nodrag relative z-10">
            <PopulateFormPanel
              model={formModel}
              textValues={formValues}
              imageRows={formImageRows}
              busy={busy}
              canGenerate={formCanGenerate}
              onChangeText={onChangeFormText}
              onChangeImageRow={onChangeFormImageRow}
              onAutofill={onAutofillForm}
              onGenerate={onGenerateForm}
              shareToken={publicFormShareToken}
              shareBusy={shareBusy}
              shareError={shareError}
              onShare={() => void onShareForm()}
              onCopyShareUrl={onCopyShareUrl}
            />
          </div>
        ) : null}

        {error ? (
          <div className="foldder-frameless-error nodrag flex items-start gap-1.5 px-2 py-1 text-[10px]">
            <AlertTriangle size={11} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        <div className="foldder-frameless-footer-action nodrag populate-node-footer relative z-10">
          {mode === "batch" ? (
            <button
              type="button"
              disabled={busy || !ready}
              onClick={(e) => {
                e.stopPropagation();
                void onGenerateBatch();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="execute-btn populate-run-button nodrag"
              title={
                ready
                  ? `Genera ${rowCount} imagen${rowCount === 1 ? "" : "es"}, una por fila`
                  : "Conecta Dataset y Plantilla"
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
                  Ejecutar bucle · {rowCount} {rowCount === 1 ? "fila" : "filas"}
                </>
              )}
            </button>
          ) : null}

          {nodeData.spaceId ? (
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
              Abrir resultados
            </button>
          ) : null}
        </div>
      </div>
    </StudioCanvasNodeShell>
  );
}

export const PopulateNode = memo(PopulateNodeImpl);
