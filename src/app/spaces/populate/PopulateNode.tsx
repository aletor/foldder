"use client";

import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  useReactFlow,
  useStore,
  type Edge,
  type Node,
  type NodeProps,
  type ReactFlowState,
} from "@xyflow/react";
import { Loader2, Sparkles } from "lucide-react";
import { StudioCanvasNodeShell, type StudioCanvasNodeHandleSpec } from "../studio-node/studio-canvas-node";
import { useConnectedDatasetForNode } from "@/app/spaces/loop/use-loop-context";
import {
  listPopulateDesignerTemplateConfigs,
  populateDesignerTemplatesSignature,
  type PopulateDesignerTemplateConfig,
} from "./populate-designer-template";
import { freezePopulateTemplatePages } from "./populate-slot-layout";
import {
  DesignerHeadlessRasterPortal,
  type DesignerHeadlessRasterRequest,
} from "../designer/DesignerHeadlessRasterPortal";
import { findPopulateTemplateLinkEdges } from "./populate-template-link";
import {
  bindingForTemplate,
  syncPopulateTemplateBinding,
  patchPopulateBinding,
} from "./populate-designer-binding";
import { derivePopulateForm, resolvePopulateSlotValues } from "./populate-designer-form";
import type { PopulateNodeData, PopulateTemplateBinding } from "./populate-types";
import { PopulateStudio } from "./PopulateStudio";
import type { PopulateStudioGeneratePreview } from "./PopulateStudio";
import { PopulateNodeBackgroundGrid } from "./PopulateNodeBackgroundGrid";
import { buildPopulateSharePayload } from "./populate-share-payload";
import {
  buildPopulateShareDefaults,
  POPULATE_SHARE_PREVIEW_MAX_SIDE,
} from "./populate-share-defaults";
import type { PopulateShareTemplatePreview } from "./populate-share-payload";
import { buildPopulateMultiTemplateRunOutput, buildPopulateRunOutput } from "./populate-output";
import { dispatchPopulateDesignerCommit } from "./populate-designer-commit";
import { useProjectAssetsCanvas } from "../project-assets-canvas-context";
import { reconcileSpacePortalNode } from "../space-media-list";
import { useSpacesMapCanvas } from "../spaces-map-canvas-context";

const BG = "/assets/nodes/populate-empty-pink.png";

function reconcilePopulateCanvasNodes(
  nodes: Node[],
  spacesMap: ReturnType<typeof useSpacesMapCanvas>,
): Node[] {
  return nodes.map((n) => (n.type === "space" ? reconcileSpacePortalNode(n, spacesMap) : n));
}

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
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rasterReq, setRasterReq] = useState<DesignerHeadlessRasterRequest | null>(null);
  const rasterRef = React.useRef<{
    resolve: (m: Record<string, string>) => void;
    reject: (e: Error) => void;
    collected: Record<string, string>;
    onPageDone?: () => void;
    requestId: number;
  } | null>(null);

  const projectAssetsCtx = useProjectAssetsCanvas();
  const projectScopeId = projectAssetsCtx?.projectScopeId ?? "__local__";
  const spacesMap = useSpacesMapCanvas();

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

  /** Re-suscribir cuando cambian páginas/campos del Designer (incl. huecos dentro de clips). */
  const designerTemplatesSignature = useStore(
    useCallback(
      (s: ReactFlowState<Node, Edge>) =>
        populateDesignerTemplatesSignature(
          id,
          reconcilePopulateCanvasNodes(s.nodes, spacesMap),
          s.edges,
          spacesMap,
        ),
      [id, spacesMap],
    ),
  );

  const designerTemplates = useMemo(() => {
    const nodes = reconcilePopulateCanvasNodes(getNodes(), spacesMap);
    const edges = getEdges();
    return listPopulateDesignerTemplateConfigs(id, nodes, edges, spacesMap);
  }, [designerTemplatesSignature, getEdges, getNodes, id, spacesMap]);

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
    (
      pages: DesignerHeadlessRasterRequest["pages"],
      pageIds: string[],
      instanceKey: string,
      opts?: { maxSide?: number; fullResolution?: boolean; onPageDone?: () => void },
    ) =>
      new Promise<Record<string, string>>((resolve, reject) => {
        if (rasterRef.current) {
          rasterRef.current.reject(new Error("Raster superseded"));
          rasterRef.current = null;
        }
        const requestId = Date.now();
        rasterRef.current = { resolve, reject, collected: {}, onPageDone: opts?.onPageDone, requestId };
        setRasterReq({
          requestId,
          instanceKey,
          pages,
          targetPageIds: pageIds,
          maxSide: opts?.maxSide,
          fullResolution: opts?.fullResolution,
        });
      }),
    [],
  );

  const defaultPickedRowsForForm = useCallback(
    (form: ReturnType<typeof derivePopulateForm>) => {
      const pickedRows: Record<string, string> = {};
      for (const entity of form.entities) {
        const cardId = entity.options[0]?.cardId;
        if (cardId && entity.pickId) pickedRows[entity.pickId] = cardId;
      }
      return pickedRows;
    },
    [],
  );

  const onGenerate = useCallback(
    async (studioPreview?: {
      templateNodeId: string;
      pickedRows: Record<string, string>;
      pickedPoses: Record<string, string>;
      manualValues: Record<string, string>;
      createEditables?: boolean;
    }) => {
      if (!connectedDataset || !listId || designerTemplates.length === 0) return;
      const createEditables =
        studioPreview?.createEditables ?? nodeData.createEditablesOnGenerate ?? false;
      const bindings = nodeData.templateBindings ?? [];
      const totalSlides = designerTemplates.reduce((n, t) => n + t.pages.length, 0);
      setBusy(true);
      setProgress({ done: 0, total: totalSlides });
      setError(null);
      setPreviewUrls([]);
      patchSelf({ status: "running", error: undefined });
      let doneSlides = 0;
      try {
        const instances: Array<{
          label: string;
          pages: ReturnType<typeof freezePopulateTemplatePages>;
          cardId?: string;
        }> = [];
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

          const useStudioPreview = studioPreview?.templateNodeId === template.templateNodeId;
          const pickedRows = useStudioPreview
            ? studioPreview.pickedRows
            : defaultPickedRowsForForm(form);
          const pickedPoses = useStudioPreview
            ? studioPreview.pickedPoses
            : binding.entityPoseColumnFieldId;
          const manualValues = useStudioPreview ? studioPreview.manualValues : {};

          const slotValues = resolvePopulateSlotValues({
            binding,
            dataset: connectedDataset,
            listId,
            pickedRows,
            manualValues,
            pickedPoses,
          });
          const pages = freezePopulateTemplatePages(
            template.pages,
            slotValues,
            binding.slotLayoutOverrides,
          );
          const firstCardId = Object.values(pickedRows)[0];
          if (createEditables) {
            instances.push({
              label: template.templateLabel,
              pages,
              cardId: firstCardId,
            });
          }

          const pageIds = pages.map((p) => p.id);
          const urls = await rasterize(
            pages,
            pageIds,
            `pop_${id}_gen_${template.templateNodeId}`,
            {
              fullResolution: true,
              onPageDone: () => {
                doneSlides += 1;
                setProgress({ done: doneSlides, total: totalSlides });
              },
            },
          );
          const slideUrls = pageIds.map((pid) => urls[pid]).filter((u): u is string => Boolean(u));
          packs.push({ templateLabel: template.templateLabel, slideUrls });
          allUrls.push(...slideUrls);
        }

        if (instances.length === 0 && !createEditables && allUrls.length === 0) {
          throw new Error("Configura al menos una plantilla en Populate Studio.");
        }
        if (createEditables && instances.length === 0) {
          throw new Error("Configura al menos una plantilla en Populate Studio.");
        }

        if (createEditables) {
          dispatchPopulateDesignerCommit({
            populateNodeId: id,
            spaceName: nodeData.label?.trim() || "Populate",
            instances,
          });
        }

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
        setProgress(null);
      }
    },
    [
      connectedDataset,
      designerTemplates,
      defaultPickedRowsForForm,
      id,
      listId,
      nodeData.label,
      nodeData.createEditablesOnGenerate,
      nodeData.templateBindings,
      patchSelf,
      rasterize,
    ],
  );

  const onShare = useCallback(
    async (studioPreview?: PopulateStudioGeneratePreview) => {
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
        const sharePreviewsByTemplateId: Record<string, PopulateShareTemplatePreview> = {};

        for (const template of designerTemplates) {
          const binding = bindingForTemplate(bindings, template.templateNodeId);
          if (!binding || template.pages.length === 0) continue;

          const defaults = buildPopulateShareDefaults({
            binding,
            template,
            dataset: connectedDataset,
            listId,
            studioPreview: studioPreview
              ? {
                  pickedRows: studioPreview.pickedRows,
                  pickedPoses: studioPreview.pickedPoses,
                  manualValues: studioPreview.manualValues,
                }
              : null,
            useStudioPreview: studioPreview?.templateNodeId === template.templateNodeId,
          });

          const slotValues = resolvePopulateSlotValues({
            binding,
            dataset: connectedDataset,
            listId,
            pickedRows: defaults.pickedRows,
            manualValues: defaults.manualValues,
            pickedPoses: defaults.pickedPoses,
          });
          const pages = freezePopulateTemplatePages(
            template.pages,
            slotValues,
            binding.slotLayoutOverrides,
          );
          const firstPageId = pages[0]?.id;
          let previewUrl: string | undefined;
          if (firstPageId) {
            const urls = await rasterize(
              pages,
              [firstPageId],
              `pop_share_${template.templateNodeId}`,
              { maxSide: POPULATE_SHARE_PREVIEW_MAX_SIDE },
            );
            previewUrl = urls[firstPageId];
          }

          sharePreviewsByTemplateId[template.templateNodeId] = {
            defaults,
            previewThumbUrl: previewUrl,
            previewHeroUrl: previewUrl,
          };
        }

        const payload = buildPopulateSharePayload({
          title: nodeData.label || "Populate",
          dataset: connectedDataset,
          listId,
          templates: designerTemplates,
          bindings,
          sharePreviewsByTemplateId,
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
    },
    [
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
      rasterize,
    ],
  );

  const onCopyShareUrl = useCallback(() => {
    if (!nodeData.publicShareToken) return;
    const url = `${window.location.origin}/f/${nodeData.publicShareToken}`;
    void navigator.clipboard.writeText(url).then(
      () => setShareError(null),
      () => setShareError("No se pudo copiar el enlace"),
    );
  }, [nodeData.publicShareToken]);

  const templateCount = designerTemplates.length;
  const canOpenStudio = Boolean(
    connectedDataset && listId && activeDesignerTemplate && activeBinding && templateCount > 0,
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

  const totalSlideCount = useMemo(
    () => designerTemplates.reduce((n, t) => n + t.pages.length, 0),
    [designerTemplates],
  );

  const lastRunOutputs = nodeData.lastRunOutputs ?? [];
  const generateResults = previewUrls.length > 0 ? previewUrls : lastRunOutputs;
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
        className={`populate-node${templateCount > 0 && connectedDataset ? " populate-node--connected" : ""}`}
      >
        <div className="foldder-frameless-main relative flex min-h-0 flex-1 flex-col overflow-hidden">
          {templateCount === 0 ? (
            <div className="populate-empty-background absolute inset-0 overflow-hidden" aria-hidden>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={BG} alt="" className="h-full w-full object-cover object-center" draggable={false} />
            </div>
          ) : (
            <PopulateNodeBackgroundGrid templates={designerTemplates} />
          )}

          <div className="populate-node-summary nodrag relative z-10">
            {!connectedDataset ? (
              <p className="populate-node-summary__text populate-node-summary__text--muted">
                Conecta un Dataset y plantillas Designer.
              </p>
            ) : datasetLoading ? (
              <p className="populate-node-summary__text populate-node-summary__text--muted">
                <Loader2 size={12} className="inline animate-spin" /> Cargando Dataset…
              </p>
            ) : templateCount === 0 ? (
              <p className="populate-node-summary__text populate-node-summary__text--muted">
                Conecta plantillas Designer (Document → Plantilla).
              </p>
            ) : (
              <p className="populate-node-summary__text">
                {templateCount} template{templateCount === 1 ? "" : "s"} conectado
                {templateCount === 1 ? "" : "s"}
              </p>
            )}
          </div>

          {(error ?? shareError ?? nodeData.error) ? (
            <div className="foldder-frameless-error nodrag relative z-10 flex items-start gap-1.5 px-2 py-1 text-[10px]">
              <span>{error ?? shareError ?? nodeData.error}</span>
            </div>
          ) : null}

          <div className="foldder-frameless-footer-action nodrag populate-node-footer relative z-10">
            <button
              type="button"
              className="populate-open-studio nodrag"
              disabled={!canOpenStudio}
              title={
                canOpenStudio
                  ? "Abrir Studio para mapear y generar"
                  : "Conecta Dataset y al menos una plantilla"
              }
              onClick={(e) => {
                e.stopPropagation();
                setStudioOpen(true);
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <Sparkles size={14} strokeWidth={2.2} />
              Abrir Studio
            </button>
          </div>
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
              templateBindings={nodeData.templateBindings ?? []}
              onClose={() => setStudioOpen(false)}
              onChangeBinding={onChangeBinding}
              rasterizePages={rasterize}
              onShare={(preview) => void onShare(preview)}
              shareBusy={shareBusy}
              shareError={shareError}
              shareUrl={shareUrl}
              onCopyShareUrl={onCopyShareUrl}
              shareMatchLabel={nodeData.shareMatchLabel ?? nodeData.label ?? ""}
              onShareMatchLabelChange={(value) => patchSelf({ shareMatchLabel: value })}
              projectSaved={projectScopeId !== "__local__"}
              canGenerate={canGenerate}
              busy={busy}
              progress={progress}
              generateError={error ?? nodeData.error ?? null}
              generateResults={generateResults}
              totalSlideCount={totalSlideCount}
              createEditablesOnGenerate={nodeData.createEditablesOnGenerate ?? false}
              onCreateEditablesOnGenerateChange={(value) =>
                patchSelf({ createEditablesOnGenerate: value })
              }
              onGenerate={(preview) => void onGenerate(preview)}
            />,
            document.body,
          )
        : null}

      {rasterReq ? (
        <DesignerHeadlessRasterPortal
          request={rasterReq}
          onPage={(pageId, dataUrl) => {
            const ref = rasterRef.current;
            if (!ref || ref.requestId !== rasterReq.requestId) return;
            ref.collected[pageId] = dataUrl;
            ref.onPageDone?.();
          }}
          onDone={() => {
            const ref = rasterRef.current;
            if (!ref || ref.requestId !== rasterReq.requestId) return;
            rasterRef.current = null;
            setRasterReq(null);
            ref.resolve(ref.collected);
          }}
          onError={(err) => {
            const ref = rasterRef.current;
            if (!ref || ref.requestId !== rasterReq.requestId) return;
            rasterRef.current = null;
            setRasterReq(null);
            ref.reject(err);
          }}
        />
      ) : null}
    </>
  );
}

export const PopulateNode = memo(PopulateNodeImpl);
