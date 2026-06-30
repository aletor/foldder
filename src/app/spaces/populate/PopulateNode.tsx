"use client";

import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useReactFlow, type NodeProps } from "@xyflow/react";
import { Copy, Link2, Loader2, Sparkles } from "lucide-react";
import { StudioCanvasNodeShell, type StudioCanvasNodeHandleSpec } from "../studio-node/studio-canvas-node";
import { useConnectedDatasetForNode } from "@/app/spaces/loop/use-loop-context";
import {
  listPopulateDesignerTemplateConfigs,
  type PopulateDesignerTemplateConfig,
} from "./populate-designer-template";
import { freezeDesignerPagesForForm } from "@/app/spaces/loop/loop-designer-form";
import {
  DesignerHeadlessRasterPortal,
  type DesignerHeadlessRasterRequest,
} from "../designer/DesignerHeadlessRasterPortal";
import { findPopulateTemplateLinkEdges } from "./populate-template-link";
import {
  bindingForTemplate,
  syncPopulateTemplateBinding,
  patchPopulateBinding,
  groupPendingFieldsIntoEntities,
} from "./populate-designer-binding";
import { derivePopulateForm, resolvePopulateSlotValues } from "./populate-designer-form";
import type { PopulateNodeData, PopulateTemplateBinding } from "./populate-types";
import { PopulateStudio } from "./PopulateStudio";
import { buildPopulateSharePayload } from "./populate-share-payload";
import { buildPopulateMultiTemplateRunOutput, buildPopulateRunOutput } from "./populate-output";
import { dispatchPopulateDesignerCommit } from "./populate-designer-commit";
import { useProjectAssetsCanvas } from "../project-assets-canvas-context";

const BG = "/assets/nodes/populate-empty-pink.png";

const HANDLES: StudioCanvasNodeHandleSpec[] = [
  { side: "left", top: "40%", type: "target", id: "dataset", dataType: "dataset", label: "Dataset" },
  { side: "left", top: "70%", type: "target", id: "template", dataType: "template", label: "Plantilla" },
  { side: "right", top: "34%", type: "source", id: "media_list", dataType: "generic", label: "Media List" },
  { side: "right", top: "66%", type: "source", id: "out", dataType: "url", label: "Resultados" },
];

function PopulateNodeImpl({ id, data, selected }: NodeProps) {
  const nodeData = (data ?? {}) as unknown as PopulateNodeData;
  const { setNodes, getNodes, getEdges } = useReactFlow();
  const [studioOpen, setStudioOpen] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rasterReq, setRasterReq] = useState<DesignerHeadlessRasterRequest | null>(null);
  const rasterRef = React.useRef<{
    resolve: (m: Record<string, string>) => void;
    reject: (e: Error) => void;
    collected: Record<string, string>;
  } | null>(null);

  const projectAssetsCtx = useProjectAssetsCanvas();
  const projectScopeId = projectAssetsCtx?.projectScopeId ?? "__local__";

  const { connectedDataset, datasetLoading } = useConnectedDatasetForNode(id);
  const lists = connectedDataset?.lists ?? [];
  const listId = useMemo(() => {
    if (nodeData.listId && lists.some((l) => l.id === nodeData.listId)) return nodeData.listId;
    return lists[0]?.id ?? "";
  }, [nodeData.listId, lists]);

  const patchSelf = useCallback(
    (patch: Partial<PopulateNodeData>) => {
      setNodes((nds) =>
        nds.map((n) => (n.id === id ? { ...n, data: { ...(n.data ?? {}), ...patch } } : n)),
      );
    },
    [id, setNodes],
  );

  const templateEdges = useMemo(() => {
    const nodes = getNodes();
    const edges = getEdges();
    return findPopulateTemplateLinkEdges(id, nodes, edges).slice(0, 8);
  }, [getEdges, getNodes, id, studioOpen]);

  const designerTemplates = useMemo(() => {
    const nodes = getNodes();
    const edges = getEdges();
    return listPopulateDesignerTemplateConfigs(id, nodes, edges);
  }, [getEdges, getNodes, id, templateEdges]);

  const activeTemplateNodeId = useMemo(() => {
    if (
      nodeData.activeTemplateNodeId &&
      designerTemplates.some((t) => t.templateNodeId === nodeData.activeTemplateNodeId)
    ) {
      return nodeData.activeTemplateNodeId;
    }
    return designerTemplates[0]?.templateNodeId ?? "";
  }, [designerTemplates, nodeData.activeTemplateNodeId]);

  const activeDesignerTemplate = useMemo(
    () => designerTemplates.find((t) => t.templateNodeId === activeTemplateNodeId) ?? null,
    [activeTemplateNodeId, designerTemplates],
  );

  useEffect(() => {
    if (!connectedDataset || !listId || designerTemplates.length === 0) return;
    let nextBindings = [...(nodeData.templateBindings ?? [])];
    let changed = false;
    for (const template of designerTemplates) {
      const existing = bindingForTemplate(nextBindings, template.templateNodeId);
      const next = syncPopulateTemplateBinding({
        prev: existing,
        template,
        dataset: connectedDataset,
        listId,
      });
      if (JSON.stringify(existing) !== JSON.stringify(next)) {
        changed = true;
        nextBindings = [
          ...nextBindings.filter((b) => b.templateNodeId !== template.templateNodeId),
          next,
        ];
      }
    }
    if (!changed && nodeData.listId === listId) return;
    patchSelf({
      templateBindings: changed ? nextBindings : nodeData.templateBindings ?? [],
      listId,
      activeTemplateNodeId: activeTemplateNodeId || designerTemplates[0]?.templateNodeId,
    });
  }, [
    activeTemplateNodeId,
    connectedDataset,
    designerTemplates,
    listId,
    nodeData.listId,
    nodeData.templateBindings,
    patchSelf,
  ]);

  const activeBinding = useMemo(() => {
    if (!activeDesignerTemplate) return null;
    return bindingForTemplate(nodeData.templateBindings ?? [], activeDesignerTemplate.templateNodeId) ?? null;
  }, [activeDesignerTemplate, nodeData.templateBindings]);

  const onSelectList = useCallback(
    (nextListId: string) => patchSelf({ listId: nextListId }),
    [patchSelf],
  );

  const onSelectTemplate = useCallback(
    (templateNodeId: string) => patchSelf({ activeTemplateNodeId: templateNodeId }),
    [patchSelf],
  );

  const onChangeBinding = useCallback(
    (next: PopulateTemplateBinding) => {
      patchSelf({
        templateBindings: patchPopulateBinding(
          nodeData.templateBindings ?? [],
          next.templateNodeId,
          next,
        ),
      });
    },
    [nodeData.templateBindings, patchSelf],
  );

  const rasterize = useCallback(
    (pages: DesignerHeadlessRasterRequest["pages"], pageIds: string[], instanceKey: string) =>
      new Promise<Record<string, string>>((resolve, reject) => {
        rasterRef.current = { resolve, reject, collected: {} };
        setRasterReq({
          requestId: Date.now(),
          instanceKey,
          pages,
          targetPageIds: pageIds,
        });
      }),
    [],
  );

  const canGenerate = useMemo(
    () =>
      Boolean(
        connectedDataset &&
          listId &&
          designerTemplates.some((t) =>
            bindingForTemplate(nodeData.templateBindings ?? [], t.templateNodeId),
          ),
      ),
    [connectedDataset, designerTemplates, listId, nodeData.templateBindings],
  );

  const onGenerate = useCallback(async () => {
    if (!connectedDataset || !listId || designerTemplates.length === 0) return;
    const bindings = nodeData.templateBindings ?? [];
    setBusy(true);
    setError(null);
    patchSelf({ status: "running", error: undefined });
    try {
      const instances: Array<{ label: string; pages: ReturnType<typeof freezeDesignerPagesForForm>; cardId?: string }> =
        [];
      const packs: Array<{ templateLabel: string; slideUrls: string[] }> = [];
      const allUrls: string[] = [];

      for (const template of designerTemplates) {
        const binding = bindingForTemplate(bindings, template.templateNodeId);
        if (!binding) continue;

        const form = derivePopulateForm({
          binding,
          dynamicFields: template.dynamicFields,
          dataset: connectedDataset,
          listId,
          slideCount: template.pages.length,
        });
        const pickedRows: Record<string, string> = {};
        for (const entity of form.entities) {
          const cardId = entity.options[0]?.cardId;
          if (cardId && entity.pickId) pickedRows[entity.pickId] = cardId;
        }

        const slotValues = resolvePopulateSlotValues({
          binding,
          dataset: connectedDataset,
          listId,
          pickedRows,
          manualValues: {},
          pickedPoses: binding.entityPoseColumnFieldId,
        });
        const pages = freezeDesignerPagesForForm(template.pages, slotValues);
        const firstCardId = Object.values(pickedRows)[0];
        instances.push({
          label: template.templateLabel,
          pages,
          cardId: firstCardId,
        });

        const urls = await rasterize(
          pages,
          pages.map((p) => p.id),
          `pop_${id}_gen_${template.templateNodeId}`,
        );
        const slideUrls = Object.values(urls);
        packs.push({ templateLabel: template.templateLabel, slideUrls });
        allUrls.push(...slideUrls);
      }

      if (instances.length === 0) {
        throw new Error("Configura al menos una plantilla en Populate Studio.");
      }

      dispatchPopulateDesignerCommit({
        populateNodeId: id,
        spaceName: nodeData.label?.trim() || "Populate",
        instances,
      });

      setPreviewUrls(allUrls);
      const out =
        packs.length > 1
          ? buildPopulateMultiTemplateRunOutput({
              nodeId: id,
              label: nodeData.label || "Populate",
              packs,
            })
          : buildPopulateRunOutput({
              nodeId: id,
              label: nodeData.label || "Populate",
              slideUrls: allUrls,
              templateLabel: packs[0]?.templateLabel,
            });
      patchSelf({
        status: "done",
        error: undefined,
        value: out.value,
        lastRunOutputs: out.lastRunOutputs,
        mediaListOutput: out.mediaListOutput,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error al generar";
      setError(msg);
      patchSelf({ status: "error", error: msg });
    } finally {
      setBusy(false);
    }
  }, [
    connectedDataset,
    designerTemplates,
    id,
    listId,
    nodeData.label,
    nodeData.templateBindings,
    patchSelf,
    rasterize,
  ]);

  const onShare = useCallback(async () => {
    if (!connectedDataset || !listId || designerTemplates.length === 0) return;
    const bindings = nodeData.templateBindings ?? [];
    if (bindings.length === 0) return;
    if (!projectScopeId || projectScopeId === "__local__") {
      setShareError("Guarda el proyecto antes de compartir el formulario.");
      return;
    }
    setShareBusy(true);
    setShareError(null);
    try {
      const payload = buildPopulateSharePayload({
        title: nodeData.label || "Populate",
        dataset: connectedDataset,
        listId,
        templates: designerTemplates,
        bindings,
      });
      const matchLabel =
        nodeData.shareMatchLabel?.trim() || nodeData.label?.trim() || "Partido";
      const r = await fetch("/api/populate-share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shareKey: id,
          populateNodeId: id,
          name: nodeData.label || "Populate",
          projectId: projectScopeId,
          matchLabel,
          payload,
          existingToken: nodeData.publicShareToken,
        }),
      });
      const j = (await r.json()) as { token?: string; error?: string };
      if (!r.ok) {
        setShareError(j.error?.trim() || `Error ${r.status}`);
        return;
      }
      if (j.token) {
        patchSelf({ publicShareToken: j.token });
        const url = `${window.location.origin}/f/${j.token}`;
        void navigator.clipboard.writeText(url).catch(() => undefined);
      }
    } catch (e) {
      setShareError(e instanceof Error ? e.message : "No se pudo compartir");
    } finally {
      setShareBusy(false);
    }
  }, [
    connectedDataset,
    designerTemplates,
    id,
    listId,
    nodeData.label,
    nodeData.publicShareToken,
    nodeData.shareMatchLabel,
    nodeData.templateBindings,
    patchSelf,
    projectScopeId,
  ]);

  const onCopyShareUrl = useCallback(() => {
    if (!nodeData.publicShareToken) return;
    const url = `${window.location.origin}/f/${nodeData.publicShareToken}`;
    void navigator.clipboard.writeText(url).then(
      () => setShareError(null),
      () => setShareError("No se pudo copiar el enlace"),
    );
  }, [nodeData.publicShareToken]);

  const rowCount = lists.find((l) => l.id === listId)?.cards.length ?? 0;
  const entityCount = activeDesignerTemplate
    ? groupPendingFieldsIntoEntities(
        activeDesignerTemplate.dynamicFields.filter((f) => f.status === "pending"),
      ).length
    : 0;
  const pendingCount =
    activeDesignerTemplate?.dynamicFields.filter((f) => f.status === "pending").length ?? 0;
  const templateCount = designerTemplates.length;
  const lastRunOutputs = nodeData.lastRunOutputs ?? [];
  const displayPreview = previewUrls[0] ?? lastRunOutputs[0];
  const shareUrl = nodeData.publicShareToken
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/f/${nodeData.publicShareToken}`
    : null;

  return (
    <>
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
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={BG} alt="" className="h-full w-full object-cover object-center" draggable={false} />
          </div>

          <div className="populate-node-summary nodrag relative z-10">
            {!connectedDataset ? (
              <p className="populate-node-summary__text populate-node-summary__text--muted">
                Conecta un Dataset y un Designer (Document → Plantilla).
              </p>
            ) : datasetLoading ? (
              <p className="populate-node-summary__text populate-node-summary__text--muted">
                <Loader2 size={12} className="inline animate-spin" /> Cargando Dataset…
              </p>
            ) : templateCount === 0 ? (
              <p className="populate-node-summary__text populate-node-summary__text--muted">
                Conecta la salida Document de un Designer al handle Plantilla (hasta 8).
              </p>
            ) : (
              <>
                <p className="populate-node-summary__text">
                  {templateCount} plantilla{templateCount === 1 ? "" : "s"}
                  {activeDesignerTemplate ? ` · ${activeDesignerTemplate.templateLabel}` : ""} ·{" "}
                  {entityCount} entidad{entityCount === 1 ? "" : "es"} ·{" "}
                  {lists.find((l) => l.id === listId)?.name ?? "—"} · {rowCount} fila
                  {rowCount === 1 ? "" : "s"}
                  {pendingCount > entityCount
                    ? ` · ${pendingCount} huecos`
                    : ""}
                </p>
                {templateCount > 1 ? (
                  <select
                    className="populate-node-list-select nodrag"
                    value={activeTemplateNodeId}
                    onChange={(e) => onSelectTemplate(e.target.value)}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    {designerTemplates.map((t) => (
                      <option key={t.templateNodeId} value={t.templateNodeId}>
                        {t.templateLabel}
                      </option>
                    ))}
                  </select>
                ) : null}
                {lists.length > 1 ? (
                  <select
                    className="populate-node-list-select nodrag"
                    value={listId}
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
                {nodeData.publicShareToken ? (
                  <p className="populate-node-summary__meta flex items-center gap-1">
                    <Link2 size={11} />
                    Formulario compartido
                  </p>
                ) : null}
                {(error ?? shareError ?? nodeData.error) ? (
                  <p className="populate-node-summary__meta text-rose-200">
                    {error ?? shareError ?? nodeData.error}
                  </p>
                ) : null}
                {lastRunOutputs.length > 0 && !busy ? (
                  <p className="populate-node-summary__meta">
                    {lastRunOutputs.length} imagen{lastRunOutputs.length === 1 ? "" : "es"} en salida
                  </p>
                ) : null}
              </>
            )}
          </div>

          <div className="populate-node-footer nodrag relative z-10">
            <button
              type="button"
              className="populate-open-studio"
              onClick={(e) => {
                e.stopPropagation();
                setStudioOpen(true);
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <Sparkles size={14} />
              Open Studio
            </button>
            {canGenerate ? (
              <button
                type="button"
                className="populate-run-button"
                disabled={busy}
                onClick={(e) => {
                  e.stopPropagation();
                  void onGenerate();
                }}
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                Generar
              </button>
            ) : null}
            {nodeData.publicShareToken ? (
              <button
                type="button"
                className="populate-run-button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCopyShareUrl();
                }}
                title="Copiar enlace del formulario"
              >
                <Copy size={14} />
              </button>
            ) : null}
          </div>

          {displayPreview ? (
            <div className="populate-node-preview">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={displayPreview} alt="Vista previa" />
            </div>
          ) : null}
        </div>
      </StudioCanvasNodeShell>

      {studioOpen && activeBinding && connectedDataset && activeDesignerTemplate
        ? createPortal(
            <PopulateStudio
              nodeLabel={nodeData.label?.trim() || "Populate"}
              dataset={connectedDataset}
              listId={listId}
              templates={designerTemplates}
              activeTemplate={activeDesignerTemplate}
              activeTemplateNodeId={activeTemplateNodeId}
              onSelectTemplate={onSelectTemplate}
              binding={activeBinding}
              onClose={() => setStudioOpen(false)}
              onChangeBinding={onChangeBinding}
              rasterizePages={rasterize}
              onShare={() => void onShare()}
              shareBusy={shareBusy}
              shareError={shareError}
              shareUrl={shareUrl}
              onCopyShareUrl={onCopyShareUrl}
              shareMatchLabel={nodeData.shareMatchLabel ?? nodeData.label ?? ""}
              onShareMatchLabelChange={(value) => patchSelf({ shareMatchLabel: value })}
              projectSaved={projectScopeId !== "__local__"}
            />,
            document.body,
          )
        : null}

      {rasterReq ? (
        <DesignerHeadlessRasterPortal
          request={rasterReq}
          onPage={(pageId, dataUrl) => {
            if (rasterRef.current) rasterRef.current.collected[pageId] = dataUrl;
          }}
          onDone={() => {
            const ref = rasterRef.current;
            rasterRef.current = null;
            setRasterReq(null);
            ref?.resolve(ref.collected);
          }}
          onError={(err) => {
            const ref = rasterRef.current;
            rasterRef.current = null;
            setRasterReq(null);
            ref?.reject(err);
          }}
        />
      ) : null}
    </>
  );
}

export const PopulateNode = memo(PopulateNodeImpl);
