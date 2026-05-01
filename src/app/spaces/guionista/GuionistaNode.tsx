"use client";

import React, { memo, useCallback, useMemo, useState, type ComponentProps } from "react";
import { NodeProps, useEdges, useNodes, useReactFlow } from "@xyflow/react";
import { BookOpen, ChevronRight, FileText, Film, LayoutTemplate, PenLine, RefreshCw, Sparkles } from "lucide-react";
import { GuionistaStudio } from "../GuionistaStudio";
import { useProjectAssetsCanvas } from "../project-assets-canvas-context";
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
  StudioCanvasOpenButton,
  StudioCanvasPill,
  type StudioCanvasNodeHandleSpec,
} from "../studio-node/studio-canvas-node";
import { useStudioNodeController } from "../studio-node/studio-node-architecture";
import { textFromStudioSourceNode } from "../studio-node/source-node-text";

const GUIONISTA_NODE_HANDLES: StudioCanvasNodeHandleSpec[] = [
  { side: "left", top: "30%", type: "target", id: "prompt", dataType: "prompt", label: "Prompt" },
  { side: "left", top: "52%", type: "target", id: "text", dataType: "txt", label: "Text" },
  { side: "left", top: "74%", type: "target", id: "brain", dataType: "brain", label: "Brain" },
  { side: "right", top: "38%", type: "source", id: "text", dataType: "txt", label: "Text out" },
  { side: "right", top: "68%", type: "source", id: "prompt", dataType: "prompt", label: "Prompt out" },
];

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

export const GuionistaNode = memo(function GuionistaNode({ id, data, selected }: NodeProps) {
  const nodeData = normalizeGuionistaData(data);
  const { setNodes } = useReactFlow();
  const nodes = useNodes();
  const edges = useEdges();
  const assetsCtx = useProjectAssetsCanvas();
  const brainCtx = useProjectBrainCanvas();
  const [openAssetId, setOpenAssetId] = useState<string | null>(null);
  const [generatedExpanded, setGeneratedExpanded] = useState(false);
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
      })
      .slice(0, 8);
  }, [activeTextAsset, assetsCtx?.generatedTextAssets?.items, sourceAssetIdForDerivatives]);
  const socialDerivatives = generatedDerivatives.filter((asset) => asset.type === "post" && asset.platform);

  const incomingEdges = useMemo(() => edges.filter((edge) => edge.target === id), [edges, id]);
  const brainConnected = useMemo(
    () => incomingEdges.some((edge) => nodes.find((node) => node.id === edge.source)?.type === "projectBrain" || edge.targetHandle === "brain"),
    [incomingEdges, nodes],
  );
  const initialBriefing = useMemo(() => {
    const chunks = incomingEdges
      .map((edge) => textFromStudioSourceNode(nodes.find((node) => node.id === edge.source)))
      .filter(Boolean);
    return chunks.join("\n\n");
  }, [incomingEdges, nodes]);
  const brainHints = useMemo(
    () => brainConnected ? ["Tono del proyecto", "Contexto del proyecto", "Claims aprobados", "Frases a evitar", "Notas relevantes"] : [],
    [brainConnected],
  );
  const brainContext = useMemo(
    () => summarizeGuionistaBrainContext(brainCtx?.assetsMetadata, brainConnected),
    [brainCtx?.assetsMetadata, brainConnected],
  );

  const patchData = useCallback(
    (patch: Partial<GuionistaNodeData>) => {
      setNodes((nds) =>
        nds.map((node) =>
          node.id === id
            ? {
                ...node,
                data: {
                  ...node.data,
                  ...patch,
                  value: patch.value ?? patch.promptValue ?? (patch.versions?.find((version) => version.id === patch.activeVersionId)?.markdown) ?? (node.data as Record<string, unknown> | undefined)?.value ?? "",
                },
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
  const openAssetInThisNode = useCallback((assetId: string) => {
    setOpenAssetId(assetId);
    openStudioController({ nodeId: id, assetId });
  }, [id, openStudioController]);
  const visibleDerivatives = generatedExpanded ? generatedDerivatives.slice(0, 6) : generatedDerivatives.slice(0, 3);
  const activeVersionIndex = useMemo(() => {
    const versions = nodeData.versions ?? [];
    const index = versions.findIndex((version) => version.id === nodeData.activeVersionId);
    return index >= 0 ? index + 1 : versions.length || (currentVersion ? 1 : 0);
  }, [currentVersion, nodeData.activeVersionId, nodeData.versions]);
  const hasGeneratedText = Boolean(activeTextAsset || currentVersion?.markdown?.trim());

  return (
    <StudioCanvasNodeShell
      nodeId={id}
      nodeType="guionista"
      selected={selected}
      label={nodeData.label}
      defaultLabel="Guionista"
      title="GUIONISTA"
      badge={compactTypeLabel}
      introActive={!!(nodeData as { _foldderCanvasIntro?: boolean })._foldderCanvasIntro}
      minWidth={275}
      width={275}
      handles={GUIONISTA_NODE_HANDLES}
    >
      <div className="node-content flex min-w-0 flex-col gap-3 px-3 pb-3 pt-2">
        <div className="min-w-0">
          <span className="node-label">{hasGeneratedText ? activeVisualMeta.label : "Guionista"}</span>
          <div className="rounded-xl border border-slate-200/60 bg-slate-50/50 p-3 shadow-inner">
            <h3 className="line-clamp-2 text-[16px] font-semibold leading-[1.12] tracking-[-0.025em] text-slate-900">
              {compactText.title}
            </h3>
            <p className="mt-1.5 line-clamp-2 text-[11px] font-light leading-relaxed text-slate-600">
              {compactText.preview}
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <StudioCanvasPill active={Boolean(activeTextAsset)} activeClassName="border-emerald-500/20 bg-emerald-500/10 text-emerald-700">
                {activeTextAsset ? "Guardado" : "Borrador"}
              </StudioCanvasPill>
              {activeVersionIndex > 0 && (
                <span className="rounded-full border border-slate-300/70 bg-white/70 px-2.5 py-1 text-[9px] font-semibold text-slate-600">
                  V{activeVersionIndex}
                </span>
              )}
              <StudioCanvasPill active={brainConnected} activeClassName="border-sky-400/20 bg-sky-400/10 text-sky-700">
                {brainConnected ? "Usando Brain" : "Sin Brain"}
              </StudioCanvasPill>
              {generatedDerivatives.length > 0 && (
                <span className="rounded-full border border-slate-300/70 bg-white/70 px-2.5 py-1 text-[9px] font-semibold text-slate-600">
                  {generatedDerivatives.length} piezas
                </span>
              )}
            </div>
          </div>
        </div>

        {generatedDerivatives.length > 0 && (
          <div className="min-w-0">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="m-0 text-[9px] font-medium uppercase tracking-wide text-slate-500">Derivados</p>
              <p className="m-0 text-[8px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                {socialDerivatives.length ? `Social pack · ${socialDerivatives.length}` : `Piezas · ${generatedDerivatives.length}`}
              </p>
            </div>
            <div className="grid gap-1.5 rounded-xl border border-slate-200/60 bg-slate-50/50 p-2 shadow-inner">
              {visibleDerivatives.map((asset) => {
                const meta = resolveGuionistaAssetVisualMeta(asset.type, asset.platform);
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
                    className="nodrag group flex items-center gap-2 rounded-lg border border-slate-200/70 bg-white/70 px-2.5 py-2 text-left transition hover:border-slate-300 hover:bg-white"
                    title="Abrir en Guionista"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-200/80 bg-slate-900/5 text-slate-600">
                      {meta.icon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-1 text-[10px] font-semibold leading-tight text-slate-800">{asset.title}</p>
                      <p className="mt-0.5 line-clamp-1 text-[9px] font-light text-slate-500">{guionistaAssetPreview(asset)}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-slate-700" />
                  </button>
                );
              })}
              {generatedDerivatives.length > 3 && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setGeneratedExpanded((value) => !value);
                  }}
                  className="nodrag rounded-full border border-slate-300/70 bg-white/70 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.13em] text-slate-500 transition hover:bg-white hover:text-slate-800"
                >
                  {generatedExpanded ? "Ocultar" : `Ver ${generatedDerivatives.length - 3} más`}
                </button>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          <StudioCanvasOpenButton
            onClick={openStudio}
            accent="amber"
            icon={<BookOpen className="h-4 w-4 shrink-0 text-slate-600" strokeWidth={2} aria-hidden />}
          >
            {currentVersion ? "Abrir" : "Empezar"}
          </StudioCanvasOpenButton>
        </div>
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
