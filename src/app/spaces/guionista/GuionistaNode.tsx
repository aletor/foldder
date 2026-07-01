"use client";

import React, { memo, useCallback, useLayoutEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import { NodeResizer, NodeProps, useReactFlow, useStore, useUpdateNodeInternals, type Edge, type Node, type ReactFlowState } from "@xyflow/react";
import { shallow } from "zustand/shallow";
import { BookOpen, ChevronRight, FileText, Film, LayoutTemplate, PenLine, RefreshCw, Sparkles } from "lucide-react";
import { getNodeGridFrameForType, growCanvasDimensionToGrid } from "../canvas-grid-layout";
import { GuionistaStudio } from "../GuionistaStudio";
import {
  FoldderNodeContentDock,
  FoldderNodeContentDockActions,
  FoldderNodeContentDockMain,
  FoldderNodeContentMeta,
  FoldderNodeContentMetaRow,
  FoldderStudioModeCenterButton,
} from "../foldder-node-ui";
import { useProjectAssetsCanvas } from "../project-assets-canvas-context";
import { nodeFrameNeedsSync, resolveNodeFrameWidth } from "../studio-node-aspect";
import { normalizeProjectAssets } from "../project-assets-metadata";
import { useProjectBrainCanvas } from "../project-brain-canvas-context";
import {
  normalizeGuionistaData,
  plainTextFromMarkdown,
  type GuionistaBrainContext,
  type GuionistaFormat,
  type GuionistaNodeData,
  type GuionistaSocialPlatform,
  type GuionistaTextAsset,
} from "../guionista-types";
import {
  StudioCanvasNodeShell,
  type StudioCanvasNodeHandleSpec,
} from "../studio-node/studio-canvas-node";
import { hasFoldderStudioTouched, touchStudioNodeData } from "../studio-node/foldder-studio-touched";
import { useStudioNodeController } from "../studio-node/studio-node-architecture";
import { textFromStudioSourceNode } from "../studio-node/source-node-text";
import { useFoldderRenderMetric } from "../use-performance-metrics";

const GUIONISTA_NODE_HANDLES: StudioCanvasNodeHandleSpec[] = [
  { side: "left", top: "30%", type: "target", id: "prompt", dataType: "prompt", label: "Prompt" },
  { side: "left", top: "52%", type: "target", id: "text", dataType: "txt", label: "Text" },
  { side: "left", top: "74%", type: "target", id: "brain", dataType: "brain", label: "BrandKit" },
  { side: "right", top: "38%", type: "source", id: "text", dataType: "txt", label: "Text out" },
  { side: "right", top: "68%", type: "source", id: "prompt", dataType: "prompt", label: "Prompt out" },
];

const GUIONISTA_EMPTY_BACKGROUND_SRC = "/assets/nodes/guionista-empty-blue.png";
const GUIONISTA_ACCENT = "#1b71df";
const GUIONISTA_NODE_MAX_HEIGHT = 2200;
const GUIONISTA_DOCK_MIN_CHROME = 180;
const GUIONISTA_CONNECTED_PREVIEW_MIN = 140;

function selectGuionistaConnections(
  state: ReactFlowState<Node, Edge>,
  nodeId: string,
): { promptConnected: boolean; textConnected: boolean; brainConnected: boolean; hasConnections: boolean } {
  const nodeLookup = state.nodeLookup as unknown as ReadonlyMap<string, Node>;
  let promptConnected = false;
  let textConnected = false;
  let brainConnected = false;
  for (const edge of state.edges) {
    if (edge.target !== nodeId) continue;
    const handle = edge.targetHandle;
    if (!handle || handle === "prompt") promptConnected = true;
    if (handle === "text") textConnected = true;
    if (handle === "brain") brainConnected = true;
    const source = nodeLookup.get(edge.source) ?? state.nodes.find((node) => node.id === edge.source);
    if (source?.type === "projectBrain") brainConnected = true;
  }
  return {
    promptConnected,
    textConnected,
    brainConnected,
    hasConnections: promptConnected || textConnected || brainConnected,
  };
}

function summarizeGuionistaBrainContext(assetsMetadata: unknown, enabled: boolean): GuionistaBrainContext {
  if (!enabled) return { enabled: false };
  const assets = normalizeProjectAssets(assetsMetadata);
  const strategy = assets.strategy;
  const content = strategy.contentDna;
  return {
    enabled: true,
    tone: [
      ...strategy.languageTraits,
      ...strategy.syntaxPatterns,
      ...(content?.writingDo ?? []),
    ].filter(Boolean).slice(0, 12),
    projectContext: [
      content?.topics?.length ? `Topics: ${content.topics.slice(0, 8).join(", ")}` : "",
      content?.contentPillars?.length ? `Pillars: ${content.contentPillars.slice(0, 8).join(", ")}` : "",
      content?.preferredFormats?.length ? `Formats: ${content.preferredFormats.slice(0, 8).join(", ")}` : "",
    ].filter(Boolean).join("\n"),
    approvedClaims: [
      ...strategy.approvedPhrases,
      ...(content?.approvedClaims ?? []),
      ...strategy.approvedPatterns,
    ].filter(Boolean).slice(0, 12),
    avoidPhrases: [
      ...strategy.tabooPhrases,
      ...strategy.forbiddenTerms,
      ...(content?.forbiddenClaims ?? []),
      ...(content?.writingAvoid ?? []),
      ...strategy.rejectedPatterns,
    ].filter(Boolean).slice(0, 16),
    notes: [
      ...(content?.narrativeAngles ?? []),
      ...(content?.articleStructures ?? []),
      ...strategy.funnelMessages.map((message) => `${message.stage}: ${message.text}`),
    ].filter(Boolean).slice(0, 10),
    references: [
      ...strategy.factsAndEvidence.map((fact) => [fact.claim, ...fact.evidence].filter(Boolean).join(" · ")).filter(Boolean),
      ...(content?.evidence ?? []).map((entry) => typeof entry === "string" ? entry : JSON.stringify(entry).slice(0, 240)),
    ].slice(0, 10),
    editorialStyle: [
      ...strategy.preferredTerms.map((term) => `Preferred: ${term}`),
      ...strategy.voiceExamples.map((example) => example.text).filter(Boolean),
    ].slice(0, 10),
  };
}

type GuionistaAssetVisualMeta = {
  label: string;
  detail?: string;
  badge: string;
  accent: string;
  icon: React.ReactNode;
};

function LinkedInBrandIcon({ className = "h-4 w-4", ...props }: ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden {...props}>
      <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.36V9h3.41v1.56h.05c.47-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12ZM7.12 20.45H3.56V9h3.56v11.45ZM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0Z" />
    </svg>
  );
}

function InstagramBrandIcon({ className = "h-4 w-4", ...props }: ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden {...props}>
      <rect x="3" y="3" width="18" height="18" rx="5.2" stroke="currentColor" strokeWidth="2.1" />
      <circle cx="12" cy="12" r="4.2" stroke="currentColor" strokeWidth="2.1" />
      <circle cx="17.35" cy="6.65" r="1.25" fill="currentColor" />
    </svg>
  );
}

function XBrandIcon({ className = "h-4 w-4", ...props }: ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden {...props}>
      <path d="M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.66l-5.21-6.82-5.97 6.82H1.67l7.73-8.84L1.25 2.25h6.83l4.71 6.23 5.45-6.23Zm-1.16 17.52h1.83L7.08 4.13H5.12l11.96 15.64Z" />
    </svg>
  );
}

function resolveGuionistaAssetVisualMeta(format: GuionistaFormat, platform?: GuionistaSocialPlatform): GuionistaAssetVisualMeta {
  if (platform === "LinkedIn") {
    return {
      label: "Post",
      detail: "LinkedIn",
      badge: "LINKEDIN",
      accent: "border-sky-300/55 bg-sky-300/12 text-sky-100",
      icon: <LinkedInBrandIcon className="h-4 w-4" />,
    };
  }
  if (platform === "Instagram") {
    return {
      label: "Post",
      detail: "Instagram",
      badge: "INSTAGRAM",
      accent: "border-fuchsia-300/45 bg-fuchsia-300/12 text-fuchsia-100",
      icon: <InstagramBrandIcon className="h-4 w-4" />,
    };
  }
  if (platform === "X") {
    return {
      label: "Post",
      detail: "X",
      badge: "X",
      accent: "border-zinc-200/35 bg-zinc-100/10 text-zinc-100",
      icon: <XBrandIcon className="h-3.5 w-3.5" />,
    };
  }
  if (platform === "Short") {
    return {
      label: "Short caption",
      detail: "Short",
      badge: "SHORT",
      accent: "border-slate-200/35 bg-slate-100/10 text-slate-100",
      icon: <FileText className="h-3.5 w-3.5" strokeWidth={2} />,
    };
  }
  const byFormat: Record<GuionistaFormat, GuionistaAssetVisualMeta> = {
    article: {
      label: "Artículo",
      badge: "ARTICLE",
      accent: "border-amber-200/45 bg-amber-200/12 text-amber-100",
      icon: <BookOpen className="h-3.5 w-3.5" strokeWidth={2} />,
    },
    post: {
      label: "Post",
      badge: "POST",
      accent: "border-blue-200/35 bg-blue-200/10 text-blue-100",
      icon: <FileText className="h-3.5 w-3.5" strokeWidth={2} />,
    },
    script: {
      label: "Guion",
      badge: "SCRIPT",
      accent: "border-orange-200/40 bg-orange-200/12 text-orange-100",
      icon: <PenLine className="h-3.5 w-3.5" strokeWidth={2} />,
    },
    scenes: {
      label: "Escenas",
      badge: "SCENES",
      accent: "border-violet-200/40 bg-violet-200/12 text-violet-100",
      icon: <Film className="h-3.5 w-3.5" strokeWidth={2} />,
    },
    slides: {
      label: "Slides",
      badge: "SLIDES",
      accent: "border-cyan-200/40 bg-cyan-200/12 text-cyan-100",
      icon: <LayoutTemplate className="h-3.5 w-3.5" strokeWidth={2} />,
    },
    campaign: {
      label: "Campaña",
      badge: "CAMPAIGN",
      accent: "border-emerald-200/40 bg-emerald-200/12 text-emerald-100",
      icon: <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />,
    },
    rewrite: {
      label: "Reescritura",
      badge: "REWRITE",
      accent: "border-rose-200/38 bg-rose-200/12 text-rose-100",
      icon: <RefreshCw className="h-3.5 w-3.5" strokeWidth={2} />,
    },
  };
  return byFormat[format];
}

type GuionistaExteriorDerivativeMeta = GuionistaAssetVisualMeta & {
  platformLabel: string;
  toneClass: string;
};

function resolveGuionistaExteriorDerivativeMeta(
  format: GuionistaFormat,
  platform?: GuionistaSocialPlatform,
): GuionistaExteriorDerivativeMeta {
  const visual = resolveGuionistaAssetVisualMeta(format, platform);
  if (platform === "LinkedIn") {
    return { ...visual, platformLabel: "LinkedIn", toneClass: "guionista-node-derivative-icon--linkedin" };
  }
  if (platform === "Instagram") {
    return { ...visual, platformLabel: "Instagram", toneClass: "guionista-node-derivative-icon--instagram" };
  }
  if (platform === "X") {
    return { ...visual, platformLabel: "X", toneClass: "guionista-node-derivative-icon--x" };
  }
  if (platform === "Short") {
    return { ...visual, platformLabel: "Short", toneClass: "guionista-node-derivative-icon--short" };
  }
  return {
    ...visual,
    platformLabel: visual.detail ?? visual.label,
    toneClass: `guionista-node-derivative-icon--${format}`,
  };
}

function guionistaAssetPreview(asset: GuionistaTextAsset): string {
  return asset.preview || plainTextFromMarkdown(asset.markdown || asset.plainText || "").slice(0, 120);
}

function guionistaTitleAndPreview(args: {
  activeAsset: GuionistaTextAsset | null;
  currentVersion: { title: string; markdown: string } | null;
}): { title: string; preview: string } {
  const title = args.activeAsset?.title || args.currentVersion?.title || "Guionista";
  const rawPreview =
    args.activeAsset?.preview ||
    (args.currentVersion?.markdown ? plainTextFromMarkdown(args.currentVersion.markdown) : "Convierte una idea en texto útil");
  return {
    title,
    preview: rawPreview.length > 118 ? `${rawPreview.slice(0, 117)}…` : rawPreview,
  };
}

function selectGuionistaInputSnapshot(
  state: ReactFlowState<Node, Edge>,
  nodeId: string,
): { brainConnected: boolean; initialBriefing: string } {
  const nodeLookup = state.nodeLookup as unknown as ReadonlyMap<string, Node>;
  const chunks: string[] = [];
  let brainConnected = false;
  for (const edge of state.edges) {
    if (edge.target !== nodeId) continue;
    const source = nodeLookup.get(edge.source) ?? state.nodes.find((node) => node.id === edge.source);
    if (!brainConnected && (source?.type === "projectBrain" || edge.targetHandle === "brain")) {
      brainConnected = true;
    }
    const text = textFromStudioSourceNode(source);
    if (text) chunks.push(text);
  }
  return {
    brainConnected,
    initialBriefing: chunks.join("\n\n"),
  };
}

function resolveGuionistaNodeHeight(args: {
  baseHeight: number;
  hasConnections: boolean;
  hasDerivatives: boolean;
  derivativeCount: number;
  hasGeneratedText: boolean;
}): number {
  if (!args.hasConnections && !args.hasDerivatives && !args.hasGeneratedText) {
    return args.baseHeight;
  }

  const derivativeBlock = args.hasDerivatives
    ? 64 + 32 + args.derivativeCount * 52 + Math.max(0, args.derivativeCount - 1) * 6
    : GUIONISTA_CONNECTED_PREVIEW_MIN;

  const stackedHeight = derivativeBlock + GUIONISTA_DOCK_MIN_CHROME;
  return Math.min(
    GUIONISTA_NODE_MAX_HEIGHT,
    growCanvasDimensionToGrid(Math.max(args.baseHeight, stackedHeight)),
  );
}

export const GuionistaNode = memo(function GuionistaNode({ id, data, selected }: NodeProps) {
  useFoldderRenderMetric("GuionistaNode", id);
  const nodeData = normalizeGuionistaData(data);
  const { setNodes } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const frameSyncKeyRef = useRef<string | null>(null);
  const inputSnapshot = useStore(
    useCallback((state: ReactFlowState<Node, Edge>) => selectGuionistaInputSnapshot(state, id), [id]),
    shallow,
  );
  const connectionSnapshot = useStore(
    useCallback((state: ReactFlowState<Node, Edge>) => selectGuionistaConnections(state, id), [id]),
    shallow,
  );
  const assetsCtx = useProjectAssetsCanvas();
  const brainCtx = useProjectBrainCanvas();
  const [openAssetId, setOpenAssetId] = useState<string | null>(null);
  const { isStudioOpen, openStudio: openStudioController, closeStudio } = useStudioNodeController({
    nodeId: id,
    nodeType: "guionista",
    openEvents: ["foldder-open-guionista-asset"],
    matchOpen: (detail) => detail.nodeId === id || (typeof detail.assetId === "string" && (!detail.nodeId || detail.nodeId === id)),
    onOpen: (detail) => {
      setOpenAssetId(typeof detail.assetId === "string" ? detail.assetId : null);
    },
    onClose: () => {
      setOpenAssetId(null);
    },
  });

  const currentVersion = useMemo(() => {
    const versions = nodeData.versions ?? [];
    return versions.find((version) => version.id === nodeData.activeVersionId) ?? versions.at(-1) ?? null;
  }, [nodeData.activeVersionId, nodeData.versions]);
  const activeTextAsset = useMemo(
    () => assetsCtx?.generatedTextAssets?.items.find((asset) => asset.id === nodeData.assetId) ?? null,
    [assetsCtx?.generatedTextAssets?.items, nodeData.assetId],
  );
  const activeFormat = activeTextAsset?.type ?? currentVersion?.format ?? nodeData.format ?? "post";
  const activePlatform = activeTextAsset?.platform;
  const activeVisualMeta = resolveGuionistaAssetVisualMeta(activeFormat, activePlatform);
  const compactTypeLabel = activeVisualMeta.detail
    ? `${activeVisualMeta.label.toUpperCase()} · ${activeVisualMeta.detail.toUpperCase()}`
    : activeVisualMeta.badge;
  const compactText = guionistaTitleAndPreview({ activeAsset: activeTextAsset, currentVersion });
  const sourceAssetIdForDerivatives = activeTextAsset?.sourceAssetId ?? activeTextAsset?.id ?? nodeData.assetId;
  const generatedDerivatives = useMemo(() => {
    if (!sourceAssetIdForDerivatives) return [];
    return (assetsCtx?.generatedTextAssets?.items ?? [])
      .filter((asset) => {
        if (!activeTextAsset?.sourceAssetId || !activeTextAsset.platform) return asset.id !== activeTextAsset?.id;
        return !(asset.sourceAssetId === activeTextAsset.sourceAssetId && asset.platform === activeTextAsset.platform);
      })
      .filter((asset) => asset.sourceAssetId === sourceAssetIdForDerivatives)
      .sort((a, b) => Date.parse(b.updatedAt || b.createdAt) - Date.parse(a.updatedAt || a.createdAt))
      .filter((asset, index, list) => {
        const key = asset.platform ? `${asset.sourceAssetId ?? ""}:${asset.platform}` : asset.id;
        return list.findIndex((candidate) => {
          const candidateKey = candidate.platform ? `${candidate.sourceAssetId ?? ""}:${candidate.platform}` : candidate.id;
          return candidateKey === key;
        }) === index;
      });
  }, [activeTextAsset, assetsCtx?.generatedTextAssets?.items, sourceAssetIdForDerivatives]);
  const socialDerivatives = generatedDerivatives.filter((asset) => asset.type === "post" && asset.platform);

  const brainConnected = inputSnapshot.brainConnected || connectionSnapshot.brainConnected;
  const initialBriefing = inputSnapshot.initialBriefing;
  const hasConnections = connectionSnapshot.hasConnections;
  const hasGeneratedText = Boolean(activeTextAsset || currentVersion?.markdown?.trim());
  const hasDerivatives = generatedDerivatives.length > 0;
  const hasDock = hasConnections || hasGeneratedText || hasDerivatives;
  const showConnectedIcon = hasDock;
  const connectedOnly = hasConnections && !hasGeneratedText && !hasDerivatives;

  const brainHints = useMemo(
    () =>
      brainConnected
        ? ["Tono del proyecto", "Contexto del proyecto", "Claims aprobados", "Frases a evitar", "Notas relevantes"]
        : [],
    [brainConnected],
  );
  const brainContext = useMemo(
    () => summarizeGuionistaBrainContext(brainCtx?.assetsMetadata, brainConnected),
    [brainCtx?.assetsMetadata, brainConnected],
  );
  const activeVersionIndex = useMemo(() => {
    const versions = nodeData.versions ?? [];
    const index = versions.findIndex((version) => version.id === nodeData.activeVersionId);
    return index >= 0 ? index + 1 : versions.length || (currentVersion ? 1 : 0);
  }, [currentVersion, nodeData.activeVersionId, nodeData.versions]);
  const inputsLabel = useMemo(() => {
    const parts: string[] = [];
    if (connectionSnapshot.promptConnected) parts.push("Prompt");
    if (connectionSnapshot.textConnected) parts.push("Text");
    if (brainConnected) parts.push("BrandKit");
    return parts.length > 0 ? parts.join(" · ") : "—";
  }, [brainConnected, connectionSnapshot.promptConnected, connectionSnapshot.textConnected]);
  const derivativesLabel =
    generatedDerivatives.length > 0
      ? socialDerivatives.length > 0
        ? `${generatedDerivatives.length} pieza${generatedDerivatives.length === 1 ? "" : "s"} · ${socialDerivatives.length} social`
        : `${generatedDerivatives.length} derivado${generatedDerivatives.length === 1 ? "" : "s"}`
      : "—";
  const statusLabel = activeTextAsset ? "Guardado" : hasGeneratedText ? "Borrador" : hasConnections ? "Conectado" : "Vacío";
  const versionLabel = activeVersionIndex > 0 ? `V${activeVersionIndex}` : "—";
  const studioTouched = hasFoldderStudioTouched(nodeData as Record<string, unknown>);

  useLayoutEffect(() => {
    const baseFrame = getNodeGridFrameForType("guionista");
    if (!baseFrame) return;

    if (!hasDock) {
      const syncKey = "guionista-base";
      if (frameSyncKeyRef.current === syncKey) return;
      frameSyncKeyRef.current = syncKey;
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== id) return n;
          if (!nodeFrameNeedsSync(n, baseFrame)) return n;
          return {
            ...n,
            width: baseFrame.width,
            height: baseFrame.height,
            measured: { width: baseFrame.width, height: baseFrame.height },
            style: { ...(n.style as React.CSSProperties), width: baseFrame.width, height: baseFrame.height, minHeight: baseFrame.height },
          };
        }),
      );
      requestAnimationFrame(() => updateNodeInternals(id));
      return;
    }

    const measuredHeight = resolveGuionistaNodeHeight({
      baseHeight: baseFrame.height,
      hasConnections,
      hasDerivatives,
      derivativeCount: generatedDerivatives.length,
      hasGeneratedText,
    });
    const syncKey = `guionista-content:${hasConnections ? "connected" : "idle"}:${generatedDerivatives.length}:${measuredHeight}:${hasGeneratedText ? "text" : "empty-text"}`;
    if (frameSyncKeyRef.current === syncKey) return;

    frameSyncKeyRef.current = syncKey;
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id !== id) return n;
        const resolvedWidth = resolveNodeFrameWidth(n, baseFrame.width);
        const resolvedTarget = { width: resolvedWidth, height: measuredHeight };
        if (!nodeFrameNeedsSync(n, resolvedTarget)) return n;
        return {
          ...n,
          width: resolvedWidth,
          height: measuredHeight,
          measured: { width: resolvedWidth, height: measuredHeight },
          style: {
            ...(n.style as React.CSSProperties),
            width: resolvedWidth,
            height: measuredHeight,
            minHeight: measuredHeight,
            maxHeight: GUIONISTA_NODE_MAX_HEIGHT,
          },
        };
      }),
    );
    requestAnimationFrame(() => updateNodeInternals(id));
  }, [
    generatedDerivatives.length,
    hasConnections,
    hasDerivatives,
    hasDock,
    hasGeneratedText,
    id,
    setNodes,
    updateNodeInternals,
  ]);

  const patchData = useCallback(
    (patch: Partial<GuionistaNodeData>) => {
      setNodes((nds) =>
        nds.map((node) =>
          node.id === id
            ? {
                ...node,
                data: touchStudioNodeData(node.data as Record<string, unknown>, {
                  ...patch,
                  value: patch.value ?? patch.promptValue ?? (patch.versions?.find((version) => version.id === patch.activeVersionId)?.markdown) ?? (node.data as Record<string, unknown> | undefined)?.value ?? "",
                }),
              }
            : node,
        ),
      );
    },
    [id, setNodes],
  );

  const openStudio = useCallback(() => {
    setOpenAssetId(null);
    openStudioController();
  }, [openStudioController]);
  const openAssetInThisNode = useCallback(
    (assetId: string) => {
      setOpenAssetId(assetId);
      openStudioController({ nodeId: id, assetId });
    },
    [id, openStudioController],
  );

  return (
    <StudioCanvasNodeShell
      nodeId={id}
      nodeType="guionista"
      selected={selected}
      label={nodeData.label}
      defaultLabel="Guionista"
      title="GUIONISTA"
      introActive={!!(nodeData as { _foldderCanvasIntro?: boolean })._foldderCanvasIntro}
      minWidth={200}
      className={`guionista-node foldder-frameless-label-dark${hasDock ? " guionista-node--has-content" : " guionista-node--empty"}${connectedOnly ? " guionista-node--connected-only" : ""}${hasDerivatives ? " guionista-node--has-derivatives" : ""}${showConnectedIcon || studioTouched ? " foldder-node--studio-touched" : ""}`}
      handles={GUIONISTA_NODE_HANDLES}
      variant="frameless"
      material="media"
      studioTouched={studioTouched}
      exteriorTileMark={showConnectedIcon}
      style={
        {
          minWidth: 200,
          minHeight: hasDock ? GUIONISTA_DOCK_MIN_CHROME + GUIONISTA_CONNECTED_PREVIEW_MIN : 300,
          "--foldder-node-card-bg": GUIONISTA_ACCENT,
          "--foldder-frameless-glass-bg": GUIONISTA_ACCENT,
          "--foldder-frameless-accent": GUIONISTA_ACCENT,
        } as React.CSSProperties
      }
    >
      <NodeResizer minWidth={200} minHeight={120} maxWidth={960} maxHeight={2200} isVisible={selected} />
      <div
        className={`node-content foldder-frameless-main guionista-node-main${hasDock ? " foldder-node-content-main--with-dock" : ""}`}
      >
        <div className="guionista-node-preview-area foldder-node-content-preview-area">
          <img
            src={GUIONISTA_EMPTY_BACKGROUND_SRC}
            alt=""
            className="guionista-node-bg"
            draggable={false}
          />

          {!hasDock ? (
            <>
              <div className="guionista-node-empty-hint" aria-hidden>
                Conecta Prompt, Text o BrandKit y abre Studio para escribir.
              </div>
              <FoldderStudioModeCenterButton
                label={currentVersion ? "Abrir" : "Empezar"}
                title="Abrir Guionista Studio"
                onClick={openStudio}
              />
            </>
          ) : null}

          {hasDerivatives ? (
            <div className="guionista-node-derivatives nodrag nopan">
              <div className="guionista-node-derivatives-header">
                <p className="guionista-node-derivatives-title">Derivados</p>
                <p className="guionista-node-derivatives-count">
                  {socialDerivatives.length
                    ? `Social pack · ${socialDerivatives.length}`
                    : `Piezas · ${generatedDerivatives.length}`}
                </p>
              </div>
              <div className="guionista-node-derivatives-list">
                {generatedDerivatives.map((asset) => {
                  const meta = resolveGuionistaExteriorDerivativeMeta(asset.type, asset.platform);
                  return (
                    <button
                      key={asset.id}
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        openAssetInThisNode(asset.id);
                      }}
                      onDoubleClick={(event) => {
                        event.stopPropagation();
                        openAssetInThisNode(asset.id);
                      }}
                      className="guionista-node-derivative-card nodrag group"
                      title={`Abrir ${meta.platformLabel} en Guionista`}
                    >
                      <span className={`guionista-node-derivative-icon ${meta.toneClass}`}>
                        {meta.icon}
                      </span>
                      <span className="guionista-node-derivative-copy">
                        <span className="guionista-node-derivative-platform">{meta.platformLabel}</span>
                        <span className="guionista-node-derivative-title">{asset.title}</span>
                        <span className="guionista-node-derivative-preview">{guionistaAssetPreview(asset)}</span>
                      </span>
                      <ChevronRight className="guionista-node-derivative-chevron" strokeWidth={2} aria-hidden />
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>

        {hasDock ? (
          <div className="guionista-node-dock-wrap shrink-0">
            <FoldderNodeContentDock>
              <FoldderNodeContentDockMain>
                <p className="foldder-node-content-dock-text">{compactText.title}</p>
                {hasGeneratedText ? (
                  <p className="foldder-node-content-dock-text foldder-node-content-dock-text--placeholder">
                    {compactText.preview}
                  </p>
                ) : (
                  <p className="foldder-node-content-dock-text foldder-node-content-dock-text--placeholder">
                    Entradas conectadas. Abre Studio para generar texto.
                  </p>
                )}
                <FoldderNodeContentMeta>
                  <FoldderNodeContentMetaRow label="Formato" value={compactTypeLabel} />
                  <FoldderNodeContentMetaRow label="Entradas" value={inputsLabel} />
                  <FoldderNodeContentMetaRow label="BrandKit" value={brainConnected ? "Conectado" : "—"} />
                  <FoldderNodeContentMetaRow label="Versión" value={versionLabel} />
                  <FoldderNodeContentMetaRow label="Derivados" value={derivativesLabel} />
                  <FoldderNodeContentMetaRow label="Estado" value={statusLabel} variant="status" />
                </FoldderNodeContentMeta>
              </FoldderNodeContentDockMain>
              <FoldderNodeContentDockActions className="guionista-node-dock-actions">
                <FoldderStudioModeCenterButton
                  variant="dock"
                  label={currentVersion || activeTextAsset ? "Abrir Studio" : "Empezar"}
                  title="Abrir Guionista Studio"
                  onClick={openStudio}
                />
              </FoldderNodeContentDockActions>
            </FoldderNodeContentDock>
          </div>
        ) : null}
      </div>

      {isStudioOpen && (
        <GuionistaStudio
          nodeId={id}
          data={nodeData}
          generatedTextAssets={assetsCtx?.generatedTextAssets}
          openAssetId={openAssetId}
          initialBriefing={initialBriefing}
          brainConnected={brainConnected}
          brainHints={brainHints}
          brainContext={brainContext}
          onChange={patchData}
          onSaveAsset={assetsCtx?.saveGuionistaTextAsset}
          onClose={() => {
            closeStudio();
          }}
        />
      )}
    </StudioCanvasNodeShell>
  );
});
