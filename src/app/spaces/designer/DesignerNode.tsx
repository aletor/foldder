"use client";

import React, { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { NodeResizer, useEdges, useNodes, useReactFlow, useUpdateNodeInternals, type NodeProps } from "@xyflow/react";
import { Pencil } from "lucide-react";
import { FOLDDER_FIT_VIEW_EASE } from "@/lib/fit-view-ease";
import { FoldderStudioModeCenterButton } from "../foldder-node-ui";
import type { IndesignPageFormatId } from "../indesign/page-formats";
import { DEFAULT_DESIGNER_PAGE_FORMAT, getPageDimensions } from "../indesign/page-formats";
import { nodeFrameNeedsSync, resolveAspectLockedNodeFrame, resolveNodeChromeHeight } from "../studio-node-aspect";
import { DesignerPagePreview } from "./DesignerPagePreview";
import type { Story, TextFrame } from "../indesign/text-model";
import type { ImageFrameRecord } from "../indesign/image-frame-model";
import type { FreehandObject, LayoutGuide } from "../FreehandStudio";
import {
  dispatchFoldderExportCreated,
  type FoldderExportCreatedDetail,
} from "../foldder-export-events";
import type { StandardStudioShellConfig } from "../StandardStudioShell";
import { StudioCanvasNodeShell, type StudioCanvasNodeHandleSpec } from "../studio-node/studio-canvas-node";
import { StudioNodePortal, useStudioNodeController } from "../studio-node/studio-node-architecture";
import type { PresenterGroupStep } from "../presenter/presenter-group-animations";

const DESIGNER_NODE_MAX_WIDTH = 960;
const DESIGNER_NODE_MAX_HEIGHT = 2200;

const DESIGNER_NODE_HANDLES: StudioCanvasNodeHandleSpec[] = [
  { side: "left", top: "50%", style: { transform: "translateY(-50%)" }, type: "target", id: "brain", dataType: "brain", label: "Brain" },
  { side: "right", top: "38%", style: { transform: "translateY(-50%)" }, type: "source", id: "image", dataType: "image", label: "Image" },
  { side: "right", top: "62%", style: { transform: "translateY(-50%)" }, type: "source", id: "document", dataType: "generic", label: "Document" },
];

export type DesignerPageState = {
  id: string;
  format: IndesignPageFormatId;
  customWidth?: number;
  customHeight?: number;
  objects: FreehandObject[];
  layoutGuides?: LayoutGuide[];
  stories?: Story[];
  textFrames?: TextFrame[];
  imageFrames?: ImageFrameRecord[];
  /** Presenter: pasos de animación en Play (persistido en la página). */
  presenterGroupSteps?: PresenterGroupStep[];
  /** Presenter: omitir en modo Play; miniatura muy atenuada en el rail. */
  presenterSkipSlide?: boolean;
};

export type DesignerNodeData = {
  label?: string;
  value?: string;
  pages?: DesignerPageState[];
  activePageIndex?: number;
  /** Auto-optimización: cola legada HR→OPT en segundo plano; las imágenes nuevas solo persisten OPT en S3. */
  autoImageOptimization?: boolean;
};

function DesignerNodeResizer(props: React.ComponentProps<typeof NodeResizer>) {
  const { fitView } = useReactFlow();
  const { onResizeEnd, ...rest } = props;
  return (
    <NodeResizer
      {...rest}
      onResizeEnd={(e, p) => {
        onResizeEnd?.(e, p);
        requestAnimationFrame(() => {
          void fitView({ padding: 0.75, duration: 400, interpolate: "smooth", ...FOLDDER_FIT_VIEW_EASE });
        });
      }}
    />
  );
}

export const DesignerNode = memo(({ id, data, selected }: NodeProps<any>) => {
  const nodeData = data as DesignerNodeData;
  const nodes = useNodes();
  const edges = useEdges();
  const { setNodes } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const { isStudioOpen, openStudio, closeStudio, standardShell } = useStudioNodeController({
    nodeId: id,
    nodeType: "designer",
  });
  const brainConnected = edges.some((e) => e.target === id && e.targetHandle === "brain");

  const pages: DesignerPageState[] =
    Array.isArray(nodeData.pages) && nodeData.pages.length > 0
      ? nodeData.pages
      : [
          {
            id: `dpg_${id}_0`,
            format: DEFAULT_DESIGNER_PAGE_FORMAT,
            objects: [],
            layoutGuides: [],
            stories: [],
            textFrames: [],
            imageFrames: [],
          },
        ];

  const activeIdx = Math.min(
    Math.max(0, nodeData.activePageIndex ?? 0),
    Math.max(0, pages.length - 1),
  );

  const firstPageDims = pages[0] ? getPageDimensions(pages[0]) : null;
  const currentNode = nodes.find((node) => node.id === id);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const refreshHandleGeometry = useCallback(() => {
    const run = () => updateNodeInternals(id);
    requestAnimationFrame(() => {
      run();
      requestAnimationFrame(run);
    });
    window.setTimeout(run, 140);
  }, [id, updateNodeInternals]);

  useEffect(() => {
    const raf = requestAnimationFrame(() => refreshHandleGeometry());
    const t = window.setTimeout(() => refreshHandleGeometry(), 160);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
    };
  }, [refreshHandleGeometry, nodeData.value, pages.length, firstPageDims?.width, firstPageDims?.height]);

  useLayoutEffect(() => {
    if (!firstPageDims) return;
    const chromeHeight = resolveNodeChromeHeight(frameRef.current, previewRef.current);
    const nextFrame = resolveAspectLockedNodeFrame({
      node: currentNode,
      contentWidth: firstPageDims.width,
      contentHeight: firstPageDims.height,
      minWidth: 280,
      maxWidth: DESIGNER_NODE_MAX_WIDTH,
      minHeight: 200,
      maxHeight: DESIGNER_NODE_MAX_HEIGHT,
      chromeHeight,
    });
    if (!nodeFrameNeedsSync(currentNode, nextFrame)) return;
    setNodes((nds) =>
      nds.map((node) =>
        node.id === id
          ? {
              ...node,
              width: nextFrame.width,
              height: nextFrame.height,
              style: { ...node.style, width: nextFrame.width, height: nextFrame.height },
            }
          : node,
      ),
    );
    requestAnimationFrame(() => updateNodeInternals(id));
  }, [
    currentNode?.width,
    currentNode?.height,
    currentNode?.measured?.width,
    currentNode?.measured?.height,
    firstPageDims?.width,
    firstPageDims?.height,
    id,
    setNodes,
    updateNodeInternals,
  ]);

  const onUpdatePages = useCallback(
    (next: DesignerPageState[], nextActiveIdx?: number) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id
            ? {
                ...n,
                data: {
                  ...n.data,
                  pages: next,
                  ...(nextActiveIdx !== undefined ? { activePageIndex: nextActiveIdx } : {}),
                },
              }
            : n,
        ),
      );
    },
    [id, setNodes],
  );

  const onExport = useCallback(
    (dataUrl: string) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, value: dataUrl } } : n,
        ),
      );
    },
    [id, setNodes],
  );

  const onAutoImageOptimizationChange = useCallback(
    (enabled: boolean) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, autoImageOptimization: enabled } } : n,
        ),
      );
    },
    [id, setNodes],
  );

  return (
    <StudioCanvasNodeShell
      ref={frameRef}
      nodeId={id}
      nodeType="designer"
      selected={selected}
      label={nodeData.label}
      defaultLabel="Designer"
      title="Designer"
      badge="DESIGN"
      headerIcon={
        <span className="flex h-5 w-5 items-center justify-center rounded-md bg-[#fdb04b]">
          <img src="/designer_icon.svg" alt="" className="h-3.5 w-3.5 object-contain" draggable={false} />
        </span>
      }
      headerClassName="border-b border-violet-500/15 bg-gradient-to-r from-zinc-900/90 via-zinc-900/70 to-zinc-900/90"
      titleClassName="flex-1 truncate uppercase tracking-[0.14em] text-zinc-100"
      className="group/node"
      minWidth={280}
      handles={DESIGNER_NODE_HANDLES}
      introActive={!!(nodeData as { _foldderCanvasIntro?: boolean })._foldderCanvasIntro}
    >
      <DesignerNodeResizer
        minWidth={280}
        minHeight={200}
        maxWidth={DESIGNER_NODE_MAX_WIDTH}
        maxHeight={DESIGNER_NODE_MAX_HEIGHT}
        keepAspectRatio
        isVisible={selected}
      />

      <div
        ref={previewRef}
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-b-[24px] bg-[#0a0a0a] group/out"
        style={{ minHeight: 120 }}
      >
        {nodeData.value ? (
          <img
            src={nodeData.value}
            alt="Designer preview — página 1"
            className="max-h-full max-w-full h-auto w-auto object-contain bg-zinc-950/80"
            onLoad={refreshHandleGeometry}
            onError={refreshHandleGeometry}
          />
        ) : pages[0] && (pages[0].objects?.length ?? 0) > 0 && firstPageDims ? (
          <div
            className="h-full w-full overflow-hidden bg-[#fafafa]"
            style={{
              aspectRatio: `${Math.max(1, firstPageDims.width)} / ${Math.max(1, firstPageDims.height)}`,
            }}
          >
            <DesignerPagePreview
              objects={pages[0].objects}
              pageWidth={firstPageDims.width}
              pageHeight={firstPageDims.height}
            />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 py-6 opacity-40">
            <Pencil size={28} className="text-violet-400" strokeWidth={1.5} />
            <span className="text-[7px] font-black uppercase tracking-widest text-zinc-500">
              Open Studio to design
            </span>
          </div>
        )}
        <FoldderStudioModeCenterButton onClick={() => {
          openStudio();
        }} />
      </div>

      {isStudioOpen && (
        <StudioNodePortal>
          <DesignerStudioLazy
            initialPages={pages}
            activePageIndex={activeIdx}
            designerCanvasInstanceKey={id}
            brainConnected={brainConnected}
            onClose={() => {
              closeStudio({ notifyStandardShell: true });
            }}
            onExport={onExport}
            onFinalExport={(detail) => {
              dispatchFoldderExportCreated({ ...detail, sourceNodeId: id });
            }}
            standardShell={standardShell ?? undefined}
            onUpdatePages={onUpdatePages}
            autoImageOptimization={nodeData.autoImageOptimization !== false}
            onAutoImageOptimizationChange={onAutoImageOptimizationChange}
          />
        </StudioNodePortal>
      )}
    </StudioCanvasNodeShell>
  );
});

function DesignerStudioLazy(props: {
  initialPages: DesignerPageState[];
  activePageIndex: number;
  designerCanvasInstanceKey: string;
  brainConnected?: boolean;
  onClose: () => void;
  onExport: (dataUrl: string) => void;
  onFinalExport?: (detail: Omit<FoldderExportCreatedDetail, "sourceNodeId">) => void;
  standardShell?: StandardStudioShellConfig;
  onUpdatePages: (pages: DesignerPageState[], activeIdx?: number) => void;
  autoImageOptimization?: boolean;
  onAutoImageOptimizationChange?: (enabled: boolean) => void;
}) {
  const [Studio, setStudio] = useState<React.ComponentType<any> | null>(null);
  useEffect(() => {
    import("./DesignerStudio").then((m) => setStudio(() => m.default));
  }, []);
  if (!Studio) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#0b0d10]">
        <span className="animate-pulse text-sm text-zinc-500">Loading Designer Studio…</span>
      </div>
    );
  }
  return <Studio {...props} />;
}
