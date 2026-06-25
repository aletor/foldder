"use client";

import React, { memo, useCallback, useMemo, useState } from "react";
import {
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import {
  AlertTriangle,
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
import type { PopulateBindings, PopulateNodeData } from "./populate-types";
import { extractPromptTokens } from "./populate-tokens";
import { resolveImageBindingForRow, resolvePromptForRow } from "./populate-resolve";
import { generatePopulateImage, type PopulateTemplateModel } from "./populate-generate";
import {
  buildGeneratedSubgraph,
  buildMediaListOutput,
  type MaterializedRow,
} from "./populate-materialize";

const POPULATE_ACCENT = "#FD52EB";
const POPULATE_EMPTY_BACKGROUND_SRC = "/assets/nodes/populate-empty-pink.png";

const TEMPLATE_REF_SLOTS = [
  { id: "image", label: "Ref 1 (Fondo)" },
  { id: "image2", label: "Ref 2" },
  { id: "image3", label: "Ref 3" },
  { id: "image4", label: "Ref 4" },
] as const;

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
  promptTemplate: string;
  bindings: PopulateBindings;
  fixedRefUrls: Record<string, string>;
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
  const nodesById = new Map(nodes.map((n) => [n.id, n]));

  let promptTemplate = typeof data.promptText === "string" ? (data.promptText as string) : "";
  if (!promptTemplate) {
    const promptEdge = edges.find((e) => e.target === tpl.id && e.targetHandle === "prompt");
    if (promptEdge) promptTemplate = resolvePromptValueFromEdgeSourceMap(promptEdge, nodesById) || "";
  }

  const fixedRefUrls: Record<string, string> = {};
  for (const slot of TEMPLATE_REF_SLOTS) {
    const refEdge = edges.find((e) => e.target === tpl.id && e.targetHandle === slot.id);
    if (refEdge) {
      const url = resolveMediaUrlFromEdgeSource(refEdge, nodes, edges);
      if (url) fixedRefUrls[slot.id] = url;
    }
  }

  return {
    templateNodeId: tpl.id,
    templateType: tpl.type ?? "",
    templateLabel:
      typeof data.label === "string" && data.label.trim() ? (data.label as string) : "Image Creation",
    model: {
      modelKey: data.modelKey as string | undefined,
      aspect_ratio: data.aspect_ratio as string | undefined,
      resolution: data.resolution as string | undefined,
      thinking: data.thinking as boolean | undefined,
      imageProvider: data.imageProvider as string | undefined,
    },
    promptTemplate,
    bindings: (data._populateBindings as PopulateBindings) ?? {},
    fixedRefUrls,
  };
}

function PopulateNodeImpl({ id, data, selected }: NodeProps) {
  const nodeData = (data ?? {}) as PopulateNodeData;
  const { getNodes, getEdges, setNodes } = useReactFlow();
  const { connectedDataset, datasetConnected, datasetLoading } = useConnectedDatasetForNode(id);

  const [busy, setBusy] = useState(false);
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
        for (const slot of TEMPLATE_REF_SLOTS) {
          const binding = template.bindings[slot.id];
          let url: string | null = null;
          let label: string = slot.label;
          if (binding?.source === "column") {
            url = resolveImageBindingForRow(binding, dataset, rowIndex);
            label = (binding.fieldId ? labelByFieldId.get(binding.fieldId) : undefined) ?? slot.label;
          } else {
            url = template.fixedRefUrls[slot.id] ?? null;
          }
          if (url) refs.push({ inputId: slot.id, url, label });
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

      const sub = buildGeneratedSubgraph(id, rows, template.model);
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

  const template = useMemo(() => getTemplate(), [getTemplate]);

  /** Resumen de mapeo: qué referencias toman columna y cuántos {campos} hay en el prompt. */
  const mapping = useMemo(() => {
    if (!template) return { columnRefs: [] as string[], tokenCount: 0 };
    const labelByFieldId = new Map(activeList?.schema.map((f) => [f.id, f.label]) ?? []);
    const columnRefs: string[] = [];
    for (const slot of TEMPLATE_REF_SLOTS) {
      const b = template.bindings[slot.id];
      if (b?.source === "column") {
        const col =
          (b.fieldId ? labelByFieldId.get(b.fieldId) : undefined) ?? b.fieldKey ?? "columna";
        columnRefs.push(`${slot.label} → ${col}`);
      }
    }
    return {
      columnRefs,
      tokenCount: new Set(extractPromptTokens(template.promptTemplate)).size,
    };
  }, [template, activeList]);

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
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt="Vista previa fila 1" />
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
          <span className="font-black uppercase tracking-[0.15em] text-white/90">
            Bucle por Dataset
          </span>

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

              {template ? (
                <span className="text-[7px] leading-snug text-white/50">
                  {mapping.tokenCount > 0
                    ? `Prompt con ${mapping.tokenCount} campo${mapping.tokenCount === 1 ? "" : "s"} del Dataset`
                    : "Configura campos {…} en Image Creation"}
                  {mapping.columnRefs.length > 0
                    ? ` · ${mapping.columnRefs.length} ref por columna`
                    : ""}
                </span>
              ) : (
                <span className="text-[7px] leading-snug text-white/50">
                  Conecta la salida Plantilla de Image Creation
                </span>
              )}

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
            </>
          )}
        </div>

        {error ? (
          <div className="foldder-frameless-error nodrag flex items-start gap-1.5 px-2 py-1 text-[10px]">
            <AlertTriangle size={11} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        <div className="foldder-frameless-footer-action nodrag populate-node-footer relative z-10">
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
