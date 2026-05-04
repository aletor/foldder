"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  BookOpen,
  Brain,
  ChevronDown,
  ChevronUp,
  CircleHelp,
  Edit3,
  ExternalLink,
  FileText,
  Globe,
  ImageIcon,
  LayoutDashboard,
  Loader2,
  Lock,
  MessageSquareText,
  Network,
  Plus,
  RefreshCw,
  Save,
  Send,
  Sparkles,
  Trash2,
  Unlock,
  X,
  XIcon,
} from "lucide-react";
import {
  AUDIENCE_PERSONA_CATALOG,
  MAX_LOGO_BYTES,
  normalizeProjectAssets,
  defaultBrainVisualStyle,
  defaultProjectAssets,
  type BrainDiscoveredBrandAsset,
  type BrainVisualImageAnalysis,
  type BrainVisualImageUserOverride,
  type BrainVisualReferenceLayer,
  type BrainGeneratedPiece,
  type BrainPersona,
  type BrainVoiceExample,
  type KnowledgeDocumentEntry,
  type ProjectAssetsMetadata,
  type VisualCapsule,
  type VisualCapsuleSuggestion,
  type VisualCapsuleSuggestionKind,
  type VisualCapsuleStatus,
  type VisualImageClassification,
} from "./project-assets-metadata";
import { BRAIN_ADN_COMPLETENESS_TOOLTIP_ES, computeAdnScore } from "@/lib/brain/brain-adn-score";
import {
  getBrainFreshnessSummary,
  getBrainVersion,
  markBrainStale,
  normalizeBrainMeta,
  touchBrainMetaAfterVisualAnalysis,
} from "@/lib/brain/brain-meta";
import { BRAIN_STALE_REASON } from "@/lib/brain/brain-stale-reasons";
import type { BrandSummaryBadge, BrandSummarySection } from "@/lib/brain/brain-brand-summary";
import {
  buildBrainBrandSummary,
  filterLegacyFunnelMessages,
  filterLegacyLanguageTraits,
  isLegacyDemoFunnelText,
  LEGACY_LANGUAGE_TRAITS_EXACT,
} from "@/lib/brain/brain-brand-summary";
import {
  buildVisualStyleFromVisionAnalyses,
  mergeVisualStyleWithVisionDerivedDescriptions,
} from "@/lib/brain/brain-visual-style-from-vision";
import { countVisualImageAnalysisDisposition, getPendingLearningProvenanceUi } from "@/lib/brain/brain-learning-provenance";
import { readResponseJson } from "@/lib/read-response-json";
import { hasVisualLearningReviewBundle } from "@/lib/brain/brain-visual-review-constants";
import {
  formatLearningReviewCardHeadline,
  formatLearningReviewExample,
  formatLearningReviewReasoning,
  formatLearningReviewText,
  labelForBrainNodeSource,
  labelForLearningCard,
  learningReviewDiagnosticBullets,
  stripLearningValueUiPrefixes,
} from "@/lib/brain/brain-review-labels";
import {
  aggregateVisualPatterns,
  collectVisualImageAssetRefs,
  createVisualLearningCandidates,
  getEffectiveClassification,
  isExcludedFromVisualDna,
  reanalyzeVisualReferences,
} from "@/lib/brain/brain-visual-analysis";
import type { LearningResolutionAction, StoredLearningCandidate } from "@/lib/brain/learning-candidate-schema";
import {
  listDownstreamBrainClients,
  type BrainDownstreamClient,
  type BrainFlowEdgeLite,
  type BrainFlowNodeLite,
} from "@/lib/brain/brain-canvas-brain-links";
import {
  BRAIN_TELEMETRY_EPHEMERAL_DEV_NOTE_ES,
  buildPendingCountByNodeId,
  connectedNodeSignalsCopy,
  learningRowMatchesCanvasNode,
  resolveLearningPendingAnchorNodeId,
} from "@/lib/brain/brain-connected-signals-ui";
import type { VisualReanalyzeDiagnosticRow } from "@/lib/brain/brain-visual-reanalyze-diagnostics";
import {
  BRAIN_TELEMETRY_SYNCED_EVENT,
  type BrainTelemetrySyncedEventDetail,
} from "@/lib/brain/brain-telemetry-client";
import { fetchBrainTelemetrySummaryByNodeId } from "@/lib/brain/fetch-brain-telemetry-summary";
import { applyLearningCandidateToProjectAssets } from "@/lib/brain/brain-apply-learning-candidate";
import { BrandSummarySourcesPanel, type BrandSummaryNavTab } from "./brand-summary-sources-panel";
import { BrandVisualDnaPanel } from "./BrandVisualDnaPanel";
import type { BrandVisualDnaStoredBundle } from "@/lib/brain/brand-visual-dna/types";
import { fireAndForgetDeleteS3Keys } from "@/lib/s3-delete-client";
import {
  BRAIN_BRAND_LOCKED_MESSAGE,
  canWriteBrainScope,
  getBrainScopeWriteBlockReason,
  resolveLearningCandidateBrainScope,
} from "@/lib/brain/brain-scope-policy";
import { geminiGenerateWithServerProgress } from "@/lib/gemini-generate-stream-client";
import {
  appendKnowledgeImageVisualDnaSlots,
  appendPendingCapsuleImageVisualDnaSlots,
  normalizeVisualDnaSlotSuppressedSourceIds,
  upgradeAnalyzedKnowledgeImageVisualDnaSlots,
} from "@/lib/brain/visual-dna-slot/slot-sync";
import {
  applyMosaicFailureToSlot,
  applyMosaicSuccessToSlot,
  generateVisualDnaSlotMosaic,
} from "@/lib/brain/visual-dna-slot/generate-mosaic";
import type { VisualDnaMosaicIntelligence, VisualDnaSlot } from "@/lib/brain/visual-dna-slot/types";
import {
  applyMosaicIntelligenceToSlot,
  normalizeVisualDnaMosaicIntelligence,
  visualDnaMosaicAdviceToSuggestion,
} from "@/lib/brain/visual-dna-slot/mosaic-intelligence";
import { normalizeVisualDnaSlots, removeVisualDnaSlot, updateVisualDnaSlot } from "@/lib/brain/visual-dna-slot/normalize";
import { VisualDnaSlotsLibrary } from "./VisualDnaSlotsLibrary";
import { hydrateKnowledgeImageDocumentsWithViewUrlsClient } from "@/lib/brain/brain-knowledge-image-view-urls-client";
import {
  stableKnowledgeFileUrlFromMaybeUrl,
  tryExtractKnowledgeFilesKeyFromUrl,
} from "@/lib/s3-media-hydrate";
import {
  buildNanoBananaBrainVisualDnaCollagePayload,
  computeBrainVisualDnaCollageFingerprint,
} from "@/lib/brain/brain-visual-dna-collage-nano";
import {
  capDecisionTraces,
  createBrainDecisionTrace,
  normalizeBrainDecisionTrace,
  type BrainDecisionTrace,
} from "@/lib/brain/brain-decision-trace";

function pickNewestVisualDnaSlot(a: VisualDnaSlot, b: VisualDnaSlot): VisualDnaSlot {
  const ta = Date.parse(a.updatedAt || a.createdAt || "");
  const tb = Date.parse(b.updatedAt || b.createdAt || "");
  if (Number.isFinite(ta) && Number.isFinite(tb)) return tb >= ta ? b : a;
  if (Number.isFinite(tb)) return b;
  return a;
}

function dedupeVisualDnaSlotsBySourceDocument(slots: VisualDnaSlot[]): VisualDnaSlot[] {
  const norm = normalizeVisualDnaSlots(slots);
  const byDoc = new Map<string, VisualDnaSlot>();
  const noDoc: VisualDnaSlot[] = [];
  for (const s of norm) {
    const docId = s.sourceDocumentId?.trim();
    if (!docId) {
      noDoc.push(s);
      continue;
    }
    const prev = byDoc.get(docId);
    byDoc.set(docId, prev ? pickNewestVisualDnaSlot(prev, s) : s);
  }
  return [...noDoc, ...Array.from(byDoc.values())];
}

function isKnowledgeImageDoc(doc: KnowledgeDocumentEntry): boolean {
  const mime = String(doc.mime || "").toLowerCase();
  return doc.type === "image" || doc.format === "image" || mime.startsWith("image/");
}

function getKnowledgeDocumentPreviewUrl(doc: KnowledgeDocumentEntry): string | null {
  if (!isKnowledgeImageDoc(doc)) return null;
  const dataUrl = doc.dataUrl?.trim();
  if (dataUrl?.startsWith("data:image")) return dataUrl;
  const sourceUrl = doc.originalSourceUrl?.trim();
  if (sourceUrl && /^https:\/\//i.test(sourceUrl)) return sourceUrl;
  return null;
}

function displayBrainVisualImageUrl(rawUrl: string | null | undefined): string | null {
  return stableKnowledgeFileUrlFromMaybeUrl(rawUrl);
}

function normalizeCanvasHex(value: string | null | undefined): string | null {
  const v = value?.trim();
  if (!v) return null;
  const hex = v.startsWith("#") ? v : `#${v}`;
  if (/^#[0-9a-f]{3}$/i.test(hex)) {
    return `#${hex
      .slice(1)
      .split("")
      .map((c) => `${c}${c}`)
      .join("")}`.toUpperCase();
  }
  if (/^#[0-9a-f]{6}$/i.test(hex)) return hex.toUpperCase();
  return null;
}

function hexLuminance(hex: string): number {
  const clean = normalizeCanvasHex(hex);
  if (!clean) return 1;
  const r = parseInt(clean.slice(1, 3), 16) / 255;
  const g = parseInt(clean.slice(3, 5), 16) / 255;
  const b = parseInt(clean.slice(5, 7), 16) / 255;
  const linear = [r, g, b].map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function pickAtmosphereBackgroundColor(colors: string[], fallback: string): string {
  const normalized = colors.map(normalizeCanvasHex).filter((hex): hex is string => Boolean(hex));
  const dark = normalized.filter((hex) => hexLuminance(hex) < 0.24).sort((a, b) => hexLuminance(a) - hexLuminance(b));
  return dark[0] ?? normalizeCanvasHex(fallback) ?? "#151446";
}

function BrainSourcePreview({
  src,
  label,
  className = "h-12 w-12",
}: {
  src: string | null | undefined;
  label: string;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[5px] border border-zinc-200 bg-white shadow-sm ${className}`}
      title={label}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={label} className="h-full w-full object-cover" />
      ) : (
        <ImageIcon className="h-5 w-5 text-zinc-400" aria-hidden />
      )}
    </span>
  );
}

function resolveBrainSourceScope(doc: KnowledgeDocumentEntry): NonNullable<KnowledgeDocumentEntry["brainSourceScope"]> {
  if (doc.brainSourceScope === "brand" || doc.brainSourceScope === "project" || doc.brainSourceScope === "capsule") {
    return doc.brainSourceScope;
  }
  return doc.scope === "context" ? "project" : "brand";
}

function normalizeHexCandidate(value: string | null | undefined): string | null {
  const v = value?.trim();
  if (!v) return null;
  const match = v.match(/#(?:[0-9a-fA-F]{6})\b/);
  return match ? match[0].toUpperCase() : null;
}

function discoveredAssetId(parts: Array<string | undefined | null>): string {
  return parts
    .map((p) => String(p ?? "").trim().toLowerCase().replace(/[^a-z0-9#:_-]+/g, "-"))
    .filter(Boolean)
    .join(":")
    .slice(0, 180);
}

function isVisualReferenceExcludedFromGeneralLook(
  assets: ProjectAssetsMetadata,
  sourceAssetId: string,
  analysis?: BrainVisualImageAnalysis | null,
): boolean {
  if (analysis && isExcludedFromVisualDna(analysis)) return true;
  return Boolean(assets.strategy.visualGeneralLook?.excludedReferenceSourceAssetIds?.includes(sourceAssetId));
}

function isGeneralLookEligibleReference(
  assets: ProjectAssetsMetadata,
  sourceAssetId: string,
): boolean {
  const doc = assets.knowledge.documents.find((d) => d.id === sourceAssetId);
  return doc ? resolveBrainSourceScope(doc) !== "capsule" : true;
}

function readDocumentVisualSignals(doc: KnowledgeDocumentEntry): { summary: string; colors: string[] } | null {
  if (doc.status !== "Analizado" || !doc.extractedContext) return null;
  try {
    const parsed = JSON.parse(doc.extractedContext) as Record<string, unknown>;
    const visual = parsed.visual_signals && typeof parsed.visual_signals === "object"
      ? (parsed.visual_signals as Record<string, unknown>)
      : null;
    if (!visual) return null;
    const readList = (key: string) =>
      Array.isArray(visual[key])
        ? (visual[key] as unknown[]).filter((x): x is string => typeof x === "string" && x.trim().length > 0)
        : [];
    const colors = [
      ...readList("colors"),
      ...readList("textures").flatMap((x) => x.match(/#(?:[0-9a-fA-F]{6})\b/g) ?? []),
      ...(doc.extractedContext.match(/#(?:[0-9a-fA-F]{6})\b/g) ?? []),
    ];
    const parts = [
      ...readList("protagonist").slice(0, 3),
      ...readList("environment").slice(0, 3),
      ...readList("textures").slice(0, 3),
      ...readList("people").slice(0, 2),
      ...readList("tone").slice(0, 3),
      ...readList("evidence_text").slice(0, 2),
    ];
    const summary = Array.from(new Set(parts.map((x) => x.trim()).filter(Boolean))).slice(0, 12).join(" · ");
    const hexColors = Array.from(new Set(colors.map(normalizeHexCandidate).filter((x): x is string => Boolean(x)))).slice(0, 12);
    return summary || hexColors.length ? { summary, colors: hexColors } : null;
  } catch {
    return null;
  }
}

function visualSourceKindLabel(kind: BrainVisualImageAnalysis["sourceKind"] | ReturnType<typeof collectVisualImageAssetRefs>[number]["sourceKind"]): string {
  switch (kind) {
    case "knowledge_document":
      return "Fuente visual";
    case "visual_style_slot":
      return "Slot visual";
    case "brand_logo":
      return "Logo";
    case "designer_image":
      return "Designer";
    case "photoroom_image":
      return "PhotoRoom";
    case "generated_image":
      return "Generada";
    default:
      return "Asset";
  }
}

function deriveDiscoveredBrandAssets(
  assets: ProjectAssetsMetadata,
  rows: Array<{ ref: ReturnType<typeof collectVisualImageAssetRefs>[number]; analysis: BrainVisualImageAnalysis | null }>,
): BrainDiscoveredBrandAsset[] {
  const out: BrainDiscoveredBrandAsset[] = [];
  const seen = new Set<string>();
  const excluded = new Set(assets.strategy.visualGeneralLook?.excludedDiscoveredBrandAssetIds ?? []);
  const now = new Date().toISOString();
  const push = (asset: BrainDiscoveredBrandAsset) => {
    if (!asset.id || seen.has(asset.id) || excluded.has(asset.id)) return;
    seen.add(asset.id);
    out.push(asset);
  };

  const brandColors = [
    ["colorPrimary", "Color primario", assets.brand.colorPrimary],
    ["colorSecondary", "Color secundario", assets.brand.colorSecondary],
    ["colorAccent", "Color acento", assets.brand.colorAccent],
  ] as const;
  for (const [key, label, raw] of brandColors) {
    const hex = normalizeHexCandidate(raw);
    if (!hex) continue;
    push({
      id: discoveredAssetId(["brand-kit", key, hex]),
      kind: "color",
      label,
      value: hex,
      hex,
      sourceName: "Gestor de marca",
      confidence: 1,
      discoveredAt: now,
    });
  }

  if (assets.brand.logoPositive?.trim()) {
    push({
      id: "brand-kit:logo-positive",
      kind: "logo",
      label: "Logo positivo",
      value: assets.brand.logoPositive,
      imageUrl: assets.brand.logoPositive,
      sourceAssetId: "brand:logoPositive",
      sourceName: "Gestor de marca",
      confidence: 1,
      discoveredAt: now,
    });
  }
  if (assets.brand.logoNegative?.trim()) {
    push({
      id: "brand-kit:logo-negative",
      kind: "logo",
      label: "Logo negativo",
      value: assets.brand.logoNegative,
      imageUrl: assets.brand.logoNegative,
      sourceAssetId: "brand:logoNegative",
      sourceName: "Gestor de marca",
      confidence: 1,
      discoveredAt: now,
    });
  }

  for (const doc of assets.knowledge.documents) {
    if (resolveBrainSourceScope(doc) !== "brand") continue;
    const signals = readDocumentVisualSignals(doc);
    if (!signals?.colors.length) continue;
    for (const hex of signals.colors.slice(0, 8)) {
      push({
        id: discoveredAssetId(["doc-visual-color", doc.id, hex]),
        kind: "color",
        label: `Color detectado · ${doc.name}`,
        value: hex,
        hex,
        sourceAssetId: doc.id,
        sourceDocumentId: doc.id,
        sourceName: doc.name,
        confidence: doc.analysisOrigin === "remote_ai" ? 0.7 : 0.46,
        discoveredAt: doc.analyzedAt ?? now,
      });
    }
  }

  for (const row of rows) {
    if (!isGeneralLookEligibleReference(assets, row.ref.id)) continue;
    if (isVisualReferenceExcludedFromGeneralLook(assets, row.ref.id, row.analysis)) continue;
    const doc = assets.knowledge.documents.find((d) => d.id === row.ref.id);
    const scope = doc ? resolveBrainSourceScope(doc) : "brand";
    const isBrandish = scope === "brand" || row.ref.sourceKind === "brand_logo";
    if (!isBrandish) continue;
    const preview = row.ref.imageUrlForVision?.trim();
    const name = row.ref.name || row.ref.label || doc?.name || row.ref.id;
    const looksLikeLogo = row.ref.sourceKind === "brand_logo" || /\blogo|logotipo|brand\s*mark|marca\b/i.test(name);
    if (preview && looksLikeLogo) {
      push({
        id: discoveredAssetId(["visual-ref-logo", row.ref.id]),
        kind: "logo",
        label: row.ref.sourceKind === "brand_logo" ? name : `Logo detectado · ${name}`,
        value: preview,
        imageUrl: preview,
        sourceAssetId: row.ref.id,
        sourceDocumentId: doc?.id,
        sourceName: name,
        confidence: row.ref.sourceKind === "brand_logo" ? 0.95 : 0.68,
        discoveredAt: row.analysis?.analyzedAt ?? now,
      });
    }
    const colors = [
      ...(row.analysis?.colorPalette?.dominant ?? []),
      ...(row.analysis?.colorPalette?.secondary ?? []),
    ];
    for (const raw of colors.slice(0, 8)) {
      const hex = normalizeHexCandidate(raw);
      if (!hex) continue;
      push({
        id: discoveredAssetId(["visual-ref-color", row.ref.id, hex]),
        kind: "color",
        label: `Color detectado · ${name}`,
        value: hex,
        hex,
        sourceAssetId: row.ref.id,
        sourceDocumentId: doc?.id,
        sourceName: name,
        confidence: row.analysis?.visionProviderId === "mock" ? 0.45 : 0.74,
        discoveredAt: row.analysis?.analyzedAt ?? now,
      });
      if (out.filter((x) => x.kind === "color").length >= 18) break;
    }
  }

  return out.slice(0, 40);
}

const VISUAL_DNA_SLOT_GENERATING_TIMEOUT_MS = 8 * 60 * 1000;
const VISUAL_DNA_SYNC_AUTO_ALL = "__all__";

function isVisualDnaSlotGeneratingStale(slot: VisualDnaSlot, now = Date.now()): boolean {
  if (slot.status !== "generating") return false;
  const t = Date.parse(slot.updatedAt || slot.createdAt || "");
  return Number.isFinite(t) && now - t > VISUAL_DNA_SLOT_GENERATING_TIMEOUT_MS;
}

function mergeKnowledgeStrategyPreservingVisualPipelines(
  incoming: ProjectAssetsMetadata["strategy"],
  live: ProjectAssetsMetadata["strategy"],
): ProjectAssetsMetadata["strategy"] {
  return {
    ...incoming,
    visualReferenceAnalysis: live.visualReferenceAnalysis ?? incoming.visualReferenceAnalysis,
    visualDnaSlots: live.visualDnaSlots ?? incoming.visualDnaSlots,
    visualCapsules: live.visualCapsules ?? incoming.visualCapsules,
    visualGeneralLook: live.visualGeneralLook ?? incoming.visualGeneralLook,
    visualDnaSlotSuppressedSourceIds: live.visualDnaSlotSuppressedSourceIds ?? incoming.visualDnaSlotSuppressedSourceIds,
  };
}

function preserveGeneratedVisualCollage(
  incoming: ProjectAssetsMetadata["strategy"]["visualReferenceAnalysis"],
  live: ProjectAssetsMetadata["strategy"]["visualReferenceAnalysis"],
): ProjectAssetsMetadata["strategy"]["visualReferenceAnalysis"] {
  if (!incoming) return live;
  if (!live) return incoming;
  return {
    ...incoming,
    dnaCollageImageDataUrl: incoming.dnaCollageImageDataUrl ?? live.dnaCollageImageDataUrl,
    dnaCollageSourceFingerprint: incoming.dnaCollageSourceFingerprint ?? live.dnaCollageSourceFingerprint,
    dnaCollageGeneratedAt: incoming.dnaCollageGeneratedAt ?? live.dnaCollageGeneratedAt,
  };
}

function compactBrainDocumentForKnowledgeAnalyze(doc: KnowledgeDocumentEntry): KnowledgeDocumentEntry {
  return {
    ...doc,
    dataUrl: undefined,
    originalSourceUrl: undefined,
  };
}

function compactBrainDocumentForVisualRequest(doc: KnowledgeDocumentEntry): KnowledgeDocumentEntry {
  const hasRemoteImage = Boolean(doc.s3Path?.trim() || doc.originalSourceUrl?.trim());
  return {
    ...doc,
    ...(hasRemoteImage ? { dataUrl: undefined } : {}),
  };
}

function compactStrategyForBrainApi(strategy: ProjectAssetsMetadata["strategy"]): ProjectAssetsMetadata["strategy"] {
  const visualReferenceAnalysis = strategy.visualReferenceAnalysis
    ? {
        ...strategy.visualReferenceAnalysis,
        dnaCollageImageDataUrl: undefined,
        brandVisualDnaBundle: undefined,
      }
    : undefined;
  return {
    ...strategy,
    visualReferenceAnalysis,
    visualDnaSlots: undefined,
    visualCapsules: undefined,
    visualGeneralLook: strategy.visualGeneralLook,
  };
}

function compactAssetsForVisualRequest(assets: ProjectAssetsMetadata): ProjectAssetsMetadata {
  return normalizeProjectAssets({
    ...assets,
    knowledge: {
      ...assets.knowledge,
      documents: assets.knowledge.documents.map(compactBrainDocumentForVisualRequest),
    },
    strategy: compactStrategyForBrainApi(assets.strategy),
  });
}

function visualCapsuleSuggestionFromSlotAsset(params: {
  slotId: string;
  kind: VisualCapsuleSuggestionKind;
  role: "same" | "similar";
  asset?: VisualDnaSlot["people"]["same"];
  fallbackNotes?: string;
}): VisualCapsuleSuggestion | null {
  const { slotId, kind, role, asset, fallbackNotes } = params;
  const imageUrl = asset?.imageUrl?.trim();
  const prompt = asset?.prompt?.trim();
  const fallbackDescription = role === "same" ? fallbackNotes?.trim() : "";
  const description = asset?.description?.trim() || prompt || fallbackDescription || "";
  if (!imageUrl && !prompt && !description) return null;
  return {
    id: `${slotId}_${kind}_${role}`,
    kind,
    title: role === "same" ? "Ejemplo principal" : "Variación compatible",
    ...(imageUrl ? { imageUrl } : {}),
    ...(prompt ? { prompt } : {}),
    ...(description ? { description } : {}),
  };
}

function visualCapsuleSuggestionsFromSlotSection(
  slot: VisualDnaSlot | undefined,
  kind: VisualCapsuleSuggestionKind,
  section: VisualDnaSlot["people"] | undefined,
  prev: VisualCapsuleSuggestion[] | undefined,
): VisualCapsuleSuggestion[] {
  const fromSlot = [
    visualCapsuleSuggestionFromSlotAsset({
      slotId: slot?.id ?? "slot",
      kind,
      role: "same",
      asset: section?.same,
      fallbackNotes: section?.notes,
    }),
    visualCapsuleSuggestionFromSlotAsset({
      slotId: slot?.id ?? "slot",
      kind,
      role: "similar",
      asset: section?.similar,
      fallbackNotes: section?.notes,
    }),
  ].filter((item): item is VisualCapsuleSuggestion => Boolean(item));
  return fromSlot.length ? fromSlot : prev ?? [];
}

function visualCapsuleGeneralLookSuggestionsFromSlot(
  slot: VisualDnaSlot | undefined,
  prev: VisualCapsuleSuggestion[] | undefined,
): VisualCapsuleSuggestion[] | undefined {
  const intelligence = slot?.mosaicIntelligence;
  if (!intelligence?.generalLooks?.length) return prev;
  const slotId = slot?.id ?? "slot";
  const imageUrl = slot?.mosaic?.imageUrl || slot?.sourceImageUrl;
  const fromMosaic = intelligence.generalLooks
    .slice(0, 2)
    .map((item, index) => visualDnaMosaicAdviceToSuggestion(slotId, "hero", item, index, imageUrl));
  return fromMosaic.length ? fromMosaic : prev;
}

function ignorePendingVisualCapsuleText(raw: string | undefined): string | undefined {
  const text = raw?.trim();
  if (!text) return undefined;
  const key = text.toLowerCase();
  if (
    key === "preparando análisis visual…" ||
    key === "preparando analisis visual…" ||
    key === "preparando análisis visual..." ||
    key === "preparando analisis visual..." ||
    key === "cápsula visual pendiente de análisis." ||
    key === "capsula visual pendiente de analisis."
  ) {
    return undefined;
  }
  return text;
}

async function analyzeVisualDnaMosaicIntelligenceClient(params: {
  slotId: string;
  imageUrl: string;
}): Promise<VisualDnaMosaicIntelligence | null> {
  const res = await fetch("/api/spaces/brain/visual/mosaic-intelligence", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      slotId: params.slotId,
      imageUrl: params.imageUrl,
    }),
  });
  if (!res.ok) return null;
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return normalizeVisualDnaMosaicIntelligence(json.intelligence);
}

function visualCapsuleFromDocAndSlot(params: {
  doc: KnowledgeDocumentEntry;
  analysis?: BrainVisualImageAnalysis;
  slot?: VisualDnaSlot;
  prev?: VisualCapsule;
  status?: VisualCapsuleStatus;
}): VisualCapsule {
  const { doc, analysis, slot, prev } = params;
  const now = new Date().toISOString();
  const sourceImageUrl = slot?.sourceImageUrl?.trim() || doc.dataUrl?.trim() || doc.originalSourceUrl?.trim() || prev?.sourceImageUrl;
  const title = prev?.title || slot?.label || doc.name || "Look visual";
  const hasMosaic = Boolean(slot?.mosaic?.imageUrl?.trim() || slot?.mosaic?.s3Path?.trim());
  const summary =
    ignorePendingVisualCapsuleText(slot?.generalStyle?.summary) ||
    ignorePendingVisualCapsuleText(slot?.hero?.description) ||
    ignorePendingVisualCapsuleText(prev?.summary);
  const heroConclusion =
    ignorePendingVisualCapsuleText(slot?.hero?.conclusion) ||
    ignorePendingVisualCapsuleText(slot?.hero?.description) ||
    ignorePendingVisualCapsuleText(prev?.heroConclusion);
  const hasUsableFallbackAnalysis = Boolean(
    sourceImageUrl &&
      (summary ||
        heroConclusion ||
        slot?.people?.notes ||
        slot?.textures?.notes ||
        slot?.objects?.notes ||
        slot?.environments?.notes ||
        slot?.generalStyle?.mood?.length ||
        prev?.persons?.length ||
        prev?.environments?.length ||
        prev?.textures?.length ||
        prev?.objects?.length),
  );
  const analysisStatus = (() => {
    if (hasMosaic) return "ready";
    if ((slot?.status === "failed" || analysis?.analysisStatus === "failed" || doc.status === "Error") && hasUsableFallbackAnalysis) {
      return "incomplete";
    }
    if (slot?.status === "failed" || analysis?.analysisStatus === "failed" || doc.status === "Error") return "error";
    if (slot?.status === "generating") return "analyzing";
    if (!analysis || analysis.analysisStatus === "pending" || analysis.analysisStatus === "queued" || analysis.analysisStatus === "analyzing") {
      return "analyzing";
    }
    return "incomplete";
  })();
  const palette = [
    ...(slot?.palette?.dominantColors ?? []),
    ...(prev?.palette?.map((p) => p.hex) ?? []),
  ]
    .filter(Boolean)
    .filter((hex, idx, arr) => arr.findIndex((x) => x.toLowerCase() === hex.toLowerCase()) === idx)
    .slice(0, 12)
    .map((hex) => ({ hex }));
  return {
    id: prev?.id || `vc_${doc.id}`,
    title,
    sourceImageId: doc.id,
    ...(sourceImageUrl ? { sourceImageUrl } : {}),
    createdAt: prev?.createdAt || doc.uploadedAt || slot?.createdAt || now,
    updatedAt: slot?.updatedAt || prev?.updatedAt || now,
    status: params.status ?? prev?.status ?? "reference",
    analysisStatus,
    scope: "capsule",
    summary,
    heroConclusion,
    palette,
    persons: visualCapsuleSuggestionsFromSlotSection(slot, "person", slot?.people, prev?.persons),
    environments: visualCapsuleSuggestionsFromSlotSection(slot, "environment", slot?.environments, prev?.environments),
    textures: visualCapsuleSuggestionsFromSlotSection(slot, "texture", slot?.textures, prev?.textures),
    objects: visualCapsuleSuggestionsFromSlotSection(slot, "object", slot?.objects, prev?.objects),
    generalLooks: visualCapsuleGeneralLookSuggestionsFromSlot(slot, prev?.generalLooks),
    moodTags: slot?.generalStyle?.mood?.length ? slot.generalStyle.mood : prev?.moodTags,
    visualTraits: slot?.generalStyle?.composition?.length ? slot.generalStyle.composition : prev?.visualTraits,
    fidelityScore: typeof slot?.confidence === "number" ? slot.confidence : prev?.fidelityScore,
    analysisProvider: slot?.mosaic?.provider ?? analysis?.visionProviderId ?? prev?.analysisProvider,
    sourceAnalysisId: analysis?.id ?? prev?.sourceAnalysisId,
    sourceVisualDnaSlotId: slot?.id ?? prev?.sourceVisualDnaSlotId,
    mosaicImageUrl: slot?.mosaic?.imageUrl ?? prev?.mosaicImageUrl ?? (hasUsableFallbackAnalysis ? sourceImageUrl : undefined),
    lastError: slot?.lastError ?? analysis?.failureReason ?? doc.errorMessage ?? prev?.lastError,
  };
}

function reconcileVisualCapsulesFromAssets(assets: ProjectAssetsMetadata): VisualCapsule[] {
  const existing = assets.strategy.visualCapsules ?? [];
  const bySource = new Map(existing.map((c) => [c.sourceImageId, c] as const));
  const analysisByDoc = new Map(
    (assets.strategy.visualReferenceAnalysis?.analyses ?? [])
      .filter((analysis) => analysis.sourceKind === "knowledge_document")
      .map((analysis) => [analysis.sourceAssetId, analysis] as const),
  );
  const slotByDoc = new Map(
    normalizeVisualDnaSlots(assets.strategy.visualDnaSlots)
      .filter((slot) => slot.sourceDocumentId)
      .map((slot) => [slot.sourceDocumentId!, slot] as const),
  );
  const out: VisualCapsule[] = [];
  for (const doc of assets.knowledge.documents) {
    if (!isKnowledgeImageDoc(doc)) continue;
    if (resolveBrainSourceScope(doc) !== "capsule") continue;
    const prev = bySource.get(doc.id);
    out.push(visualCapsuleFromDocAndSlot({ doc, analysis: analysisByDoc.get(doc.id), slot: slotByDoc.get(doc.id), prev }));
    bySource.delete(doc.id);
  }
  return out.slice(0, 100);
}

function visualReferenceRowMeta(
  analysis: BrainVisualImageAnalysis | null,
  layer: BrainVisualReferenceLayer | undefined,
): {
  estadoLabel: string;
  proveedorLabel: string;
  versionLabel: string;
  imageUrlLine: string;
  fallbackNote: string | null;
} {
  const versionFallback = layer?.analyzerVersion?.trim() || "—";
  const imageUrlLine =
    analysis?.imageUrlForVisionAvailable === true
      ? "disponible"
      : analysis?.imageUrlForVisionAvailable === false
        ? "no disponible"
        : "—";

  if (!analysis) {
    return {
      estadoLabel: "Pendiente",
      proveedorLabel: "—",
      versionLabel: versionFallback,
      imageUrlLine,
      fallbackNote: null,
    };
  }

  const attempted = analysis.visionProviderAttempted;
  const attemptedLabel =
    attempted === "gemini-vision"
      ? "Gemini"
      : attempted === "openai-vision"
        ? "OpenAI"
        : attempted === "mock"
          ? "Mock"
          : null;

  if (analysis.analysisStatus === "failed" && analysis.fallbackUsed) {
    return {
      estadoLabel: attemptedLabel ? `Error en ${attemptedLabel}` : "Error en visión remota",
      proveedorLabel: "Mock / heurística local",
      versionLabel: analysis.analyzerVersion?.trim() || "mock-1",
      imageUrlLine,
      fallbackNote:
        "Fallback heurístico mostrado. No es análisis visual real.",
    };
  }

  if (analysis.analysisStatus === "failed") {
    return {
      estadoLabel: "Error",
      proveedorLabel: "—",
      versionLabel: analysis.analyzerVersion?.trim() || versionFallback,
      imageUrlLine,
      fallbackNote: analysis.failureReason?.trim() ?? null,
    };
  }

  const provId = analysis.visionProviderId ?? layer?.lastVisionProviderId;
  const provLabel =
    provId === "gemini-vision"
      ? "Gemini"
      : provId === "openai-vision"
        ? "OpenAI"
        : provId === "mock"
          ? "Mock"
          : "—";

  if (provId === "mock") {
    return {
      estadoLabel: "Análisis simulado",
      proveedorLabel: "Mock",
      versionLabel: analysis.analyzerVersion?.trim() || versionFallback,
      imageUrlLine,
      fallbackNote: null,
    };
  }

  if (provId === "openai-vision" || provId === "gemini-vision") {
    return {
      estadoLabel: "Analizado con visión real",
      proveedorLabel: provLabel,
      versionLabel: analysis.analyzerVersion?.trim() || versionFallback,
      imageUrlLine,
      fallbackNote: null,
    };
  }

  const legacyMock =
    !provId &&
    ((!layer?.lastVisionProviderId && versionFallback.toLowerCase().startsWith("mock")) ||
      layer?.lastVisionProviderId === "mock");
  if (legacyMock) {
    return {
      estadoLabel: "Análisis simulado",
      proveedorLabel: "Mock",
      versionLabel: analysis.analyzerVersion?.trim() || versionFallback,
      imageUrlLine,
      fallbackNote: null,
    };
  }

  return {
    estadoLabel: analysis.analysisStatus === "analyzing" ? "Analizando" : "Analizado",
    proveedorLabel: provLabel,
    versionLabel: analysis.analyzerVersion?.trim() || versionFallback,
    imageUrlLine,
    fallbackNote: null,
  };
}

type MessageType = "" | "error" | "success" | "info";
type LogoSlotId = "positive" | "negative";
export type BrainMainSection =
  | "overview"
  | "sources"
  | "dna"
  | "looks"
  | "visual_refs"
  | "brand_visual_dna"
  | "knowledge"
  | "connected_nodes"
  | "review"
  | "diagnostics"
  | "voice"
  | "personas"
  | "messages"
  | "facts";

type BrainPrimarySection = "overview" | "sources" | "dna" | "looks" | "review" | "diagnostics";

function resolveBrainPrimarySection(section: BrainMainSection): BrainPrimarySection {
  switch (section) {
    case "knowledge":
      return "sources";
    case "visual_refs":
    case "brand_visual_dna":
    case "voice":
    case "personas":
    case "messages":
    case "facts":
      return "dna";
    case "connected_nodes":
      return "diagnostics";
    default:
      return section;
  }
}

type Props = {
  open: boolean;
  onClose: () => void;
  assetsMetadata: unknown;
  onAssetsMetadataChange: (next: ProjectAssetsMetadata) => void;
  /** Proyecto persistible; necesario para “Por revisar” (aprendizajes pendientes). */
  projectId?: string | null;
  /** Ámbito de aprendizajes (mismo id que uso en lienzo cuando aplica). */
  workspaceId?: string | null;
  /** Nodos del canvas (opcional) para “Nodos conectados”. */
  canvasNodes?: BrainFlowNodeLite[] | null;
  canvasEdges?: BrainFlowEdgeLite[] | null;
  /** Al abrir desde el lienzo (p. ej. «Revisar pendientes»), forzar pestaña inicial. */
  initialSection?: BrainMainSection | null;
  /** Análisis visual reanalizado en memoria; falta guardar `metadata.assets` en el servidor. */
  visualReferenceAnalysisDirty?: boolean;
  onVisualReferenceAnalysisDirty?: () => void;
  /** Tras reiniciar Brain por completo (p. ej. limpiar bandera de análisis visual sin guardar). */
  onBrainAssetsFullReset?: () => void;
  /** Persistir proyecto (incluye capa visual); mismo flujo que guardar en el lienzo. */
  onSaveProjectFromBrain?: () => Promise<boolean>;
  isSavingProject?: boolean;
};

type BrainChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  sources?: Array<{ id: string; name: string; score: number }>;
  suggestedUploads?: string[];
};

type GeneratedPreview = {
  internalPrompt: string;
  draft: string;
  critique: string;
  score: number;
  issues: string[];
  revised: string;
  sources: {
    core: Array<{ id: string; name: string }>;
    context: Array<{ id: string; name: string }>;
  };
};

function readFileDataUrl(file: File, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.size > maxBytes) {
      reject(new Error("FILE_TOO_LARGE"));
      return;
    }
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("READ_ERROR"));
    r.readAsDataURL(file);
  });
}

function tryNormalizeUrl(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  try {
    const u = new URL(t.includes("://") ? t : `https://${t}`);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.href;
  } catch {
    return null;
  }
}

function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function formatTraceDate(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  return new Date(t).toLocaleString("es-ES");
}

function traceKindLabel(kind: BrainDecisionTrace["kind"]): string {
  switch (kind) {
    case "runtime_context":
      return "Runtime context";
    case "learning_candidate":
      return "Propuesta de aprendizaje";
    case "visual_prompt":
      return "Visual prompt";
    case "merge_resolution":
      return "Merge / resolución";
    case "telemetry_aggregation":
      return "Telemetría agregada";
    default:
      return kind;
  }
}

function formatDecisionTraceSummary(summary: string): string {
  return formatLearningReviewReasoning(formatLearningReviewText(summary));
}

function formatDecisionTraceInputLabel(label: string): string {
  const clean = label.trim();
  if (!clean) return "";
  if (/manualoverridecounts/i.test(clean)) return "Cambios manuales en tono o longitud.";
  if (/uniqueaccepted/i.test(clean)) return "Sugerencias aceptadas.";
  if (/uniqueignored/i.test(clean)) return "Sugerencias descartadas.";
  if (/uniqueshown/i.test(clean)) return "Sugerencias mostradas.";
  if (/creative_preference/i.test(clean)) return formatLearningReviewText(clean.replace(/^.*?·\s*/u, ""));
  if (/project_memory/i.test(clean)) return formatLearningReviewText(clean.replace(/^.*?·\s*/u, ""));
  if (/contextual_memory/i.test(clean)) return formatLearningReviewText(clean.replace(/^.*?·\s*/u, ""));
  return formatLearningReviewExample(clean);
}

function tracePersistenceIntentLabel(intent: BrainDecisionTrace["persistenceIntent"]): string {
  switch (intent) {
    case "ephemeral":
      return "temporal";
    case "pending_review":
      return "pendiente revisión";
    case "persist_on_accept":
      return "persistir al aceptar";
    case "persist_on_export":
      return "persistir al exportar";
    case "persist_immediately":
      return "persistencia inmediata";
    default:
      return "sin política";
  }
}

/** Lista de texto segura para filas de análisis (legacy o JSON pueden no ser arrays). */
function brainAnalysisTextArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string").map((s) => s.trim()).filter(Boolean);
  if (typeof v === "string" && v.trim()) return [v.trim()];
  return [];
}

function labelVisualClassification(cls: VisualImageClassification | "EXCLUDED" | undefined): string {
  if (cls == null) return "—";
  if (cls === "EXCLUDED") return "EXCLUIDA";
  switch (cls) {
    case "CORE_VISUAL_DNA":
      return "CORE VISUAL";
    case "PROJECT_VISUAL_REFERENCE":
      return "REFERENCIA DE PROYECTO";
    case "CONTEXTUAL_VISUAL_MEMORY":
      return "CONTEXTO VISUAL";
    case "RAW_ASSET_ONLY":
      return "RAW ASSET";
    default:
      return cls;
  }
}

function computeVisualIdentityScore(assets: ReturnType<typeof normalizeProjectAssets>): number {
  let s = 0;
  if (assets.brand.logoPositive) s += 34;
  if (assets.brand.logoNegative) s += 26;
  const cols = [assets.brand.colorPrimary, assets.brand.colorSecondary, assets.brand.colorAccent].filter(
    (c) => typeof c === "string" && c.trim().length > 2,
  );
  s += Math.min(40, cols.length * 13);
  return Math.min(100, s);
}

function computeVisualRefsHealthScore(analyzed: number, total: number): number {
  if (!total) return 0;
  return Math.min(100, Math.round((analyzed / total) * 100));
}

function computeFactsSignalsScore(assets: ReturnType<typeof normalizeProjectAssets>): number {
  const n = assets.strategy.factsAndEvidence.filter((f) => f.verified || f.interpreted).length;
  return Math.min(100, Math.round((n / 10) * 100));
}

function computeNodeLearningScore(pendingCount: number, generatedPieces: number): number {
  return Math.min(100, pendingCount * 22 + Math.min(45, generatedPieces * 5));
}

function brandSummaryBadgeClass(badge: BrandSummaryBadge): string {
  switch (badge) {
    case "Confirmado":
      return "border-emerald-200 bg-emerald-50 text-emerald-900";
    case "Visual real":
      return "border-indigo-200 bg-indigo-50 text-indigo-900";
    case "Fallback":
      return "border-amber-200 bg-amber-50 text-amber-950";
    case "Legacy":
      return "border-rose-200 bg-rose-50 text-rose-900";
    case "Mezcla":
      return "border-violet-200 bg-violet-50 text-violet-900";
    case "Inferido":
      return "border-sky-200 bg-sky-50 text-sky-900";
    case "Pendiente":
      return "border-amber-300 bg-amber-100 text-amber-950";
    case "CORE":
      return "border-cyan-200 bg-cyan-50 text-cyan-950";
    case "Sin consolidar":
    case "Default sin confirmar":
      return "border-zinc-300 bg-zinc-100 text-zinc-700";
    case "Provisional":
      return "border-amber-200 bg-amber-50 text-amber-950";
    case "Legacy filtrado":
      return "border-rose-200 bg-rose-100 text-rose-950";
    case "Pendiente de análisis":
      return "border-amber-200 bg-amber-50 text-amber-900";
    default:
      return "border-zinc-200 bg-zinc-50 text-zinc-600";
  }
}

function LogoDropSlot({
  label,
  description,
  dataUrl,
  slotId,
  onPick,
  onClear,
  disabled,
  compact,
}: {
  label: string;
  description: string;
  dataUrl: string | null;
  slotId: LogoSlotId;
  onPick: (slot: LogoSlotId, file: File) => void;
  onClear: (slot: LogoSlotId) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f && f.type.startsWith("image/")) onPick(slotId, f);
  };

  return (
    <div className={`min-w-0 ${compact ? "" : "flex-1"}`}>
      <p
        className={`mb-1 font-black uppercase tracking-[0.14em] text-zinc-600 ${compact ? "text-[8px]" : "text-[10px]"}`}
        title={compact ? description : undefined}
      >
        {label}
      </p>
      {!compact && <p className="mb-2 text-[11px] leading-snug text-zinc-600">{description}</p>}
      <div
        role="button"
        tabIndex={0}
        title={compact ? description : undefined}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`relative flex cursor-pointer flex-col items-center justify-center overflow-hidden border-2 border-dashed transition ${
          compact ? "min-h-[76px] rounded-[5px]" : "min-h-[140px] rounded-[5px]"
        } ${
          dragOver
            ? "border-amber-400 bg-amber-50"
            : "border-zinc-200 bg-zinc-50 hover:border-zinc-300 hover:bg-zinc-100"
        }`}
        onClick={() => !disabled && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className="sr-only"
          disabled={disabled}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPick(slotId, f);
            e.target.value = "";
          }}
        />
        {dataUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={dataUrl}
              alt=""
              className={`max-w-full object-contain ${compact ? "max-h-14 p-1.5" : "max-h-[120px] p-3"}`}
            />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClear(slotId);
              }}
              className={`absolute rounded-[5px] border border-zinc-200 bg-white text-zinc-600 shadow-sm transition hover:bg-zinc-100 hover:text-zinc-900 ${
                compact ? "right-1 top-1 p-1" : "right-2 top-2 p-1.5"
              }`}
              aria-label="Quitar logo"
            >
              <Trash2 className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} strokeWidth={2} />
            </button>
          </>
        ) : (
          <div
            className={`flex flex-col items-center text-center ${compact ? "gap-1 px-2 py-2" : "gap-2 px-4 py-6"}`}
          >
            <ImageIcon
              className={`text-zinc-400 ${compact ? "h-5 w-5" : "h-8 w-8"}`}
              strokeWidth={1.25}
              aria-hidden
            />
            <span className={`font-semibold text-zinc-600 ${compact ? "text-[9px] leading-tight" : "text-[11px]"}`}>
              {compact ? "Soltar / elegir" : "Suelta o elige imagen"}
            </span>
            {!compact && (
              <span className="text-[10px] text-zinc-500">
                PNG, JPG, WebP o SVG · máx. {Math.round(MAX_LOGO_BYTES / 1024 / 1024)} MB
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
  compact,
}: {
  label: string;
  value: string | null;
  onChange: (hex: string | null) => void;
  compact?: boolean;
}) {
  const id = React.useId();
  const [text, setText] = useState(value ?? "");
  useEffect(() => {
    const t = window.setTimeout(() => setText(value ?? ""), 0);
    return () => window.clearTimeout(t);
  }, [value]);
  const pickerValue = value && /^#[0-9A-Fa-f]{6}$/i.test(value) ? value : "#ffffff";

  return (
    <div className={`flex min-w-0 flex-col ${compact ? "gap-1" : "flex-1 gap-1.5"}`}>
      <label
        htmlFor={id}
        className={`font-bold uppercase tracking-wide text-zinc-600 ${compact ? "text-[8px]" : "text-[10px]"}`}
      >
        {label}
      </label>
      <div
        className={`flex items-center gap-1.5 border border-zinc-200 bg-white ${compact ? "rounded-[5px] px-1.5 py-1" : "gap-2 rounded-[5px] px-2 py-1.5"}`}
      >
        <input
          id={id}
          type="color"
          value={pickerValue}
          onChange={(e) => onChange(e.target.value)}
          className={`cursor-pointer shrink-0 overflow-hidden rounded-[5px] border border-zinc-200 bg-transparent p-0 ${
            compact ? "h-7 w-8" : "h-9 w-11"
          }`}
          aria-label={label}
        />
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            const raw = text.trim();
            if (!raw) {
              onChange(null);
              return;
            }
            const v = raw.startsWith("#") ? raw : `#${raw}`;
            if (/^#[0-9A-Fa-f]{6}$/i.test(v)) {
              onChange(`#${v.slice(1).toLowerCase()}`);
            } else {
              setText(value ?? "");
            }
          }}
          className={`min-w-0 flex-1 bg-transparent font-mono text-zinc-900 outline-none placeholder:text-zinc-400 ${
            compact ? "text-[10px]" : "text-[12px]"
          }`}
          placeholder="#000000"
          spellCheck={false}
        />
      </div>
    </div>
  );
}

/** Cola secuencial de ingesta (subida, URL, análisis). Sin reintentos automáticos. */
type KnowledgeIngestJob =
  | { kind: "upload"; scope: "core" | "context"; files: File[]; brainSourceScope?: KnowledgeDocumentEntry["brainSourceScope"] }
  | { kind: "url"; scope: "core" | "context"; url: string; brainSourceScope?: KnowledgeDocumentEntry["brainSourceScope"] }
  | { kind: "analyze" };

export function ProjectBrainFullscreen({
  open,
  onClose,
  assetsMetadata,
  onAssetsMetadataChange,
  projectId = null,
  workspaceId = null,
  canvasNodes = null,
  canvasEdges = null,
  initialSection = null,
  visualReferenceAnalysisDirty = false,
  onVisualReferenceAnalysisDirty,
  onBrainAssetsFullReset,
  onSaveProjectFromBrain,
  isSavingProject = false,
}: Props) {
  const assets = useMemo(() => normalizeProjectAssets(assetsMetadata), [assetsMetadata]);
  const brandSummary = useMemo(() => buildBrainBrandSummary(assets), [assets]);
  const decisionTraces = useMemo(
    () =>
      capDecisionTraces(assets.strategy.decisionTraces, {
        max: 50,
        payloadRiskMax: 25,
        order: "desc",
      }),
    [assets.strategy.decisionTraces],
  );
  /** Vista previa ADN alineada con el resumen (filtra seed/demo; los datos crudos siguen en Voz/Mensajes hasta que edites). */
  const dnaTabPreview = useMemo(() => {
    const rawTraits = assets.strategy.languageTraits;
    const traitsClean = filterLegacyLanguageTraits(rawTraits);
    const legacyTraitRows = rawTraits.filter((t) => LEGACY_LANGUAGE_TRAITS_EXACT.has(t.trim().toLowerCase()));
    const voiceN = assets.strategy.voiceExamples.length;
    const funnel = assets.strategy.funnelMessages;
    const cleanFunnel = filterLegacyFunnelMessages(funnel);
    const legacyFunnelRows = funnel.filter((m) => isLegacyDemoFunnelText(m.text ?? ""));
    const toneHasRealSignals = traitsClean.length > 0 || voiceN > 0;
    const toneBody = traitsClean.length
      ? traitsClean.slice(0, 6).join(" · ")
      : voiceN > 0
        ? `${voiceN} ejemplo(s) de voz en «Voz y tono»${legacyTraitRows.length ? " (los rasgos listados eran demo EN y no se muestran aquí)." : "."}`
        : rawTraits.length
          ? "Solo hay rasgos demo en inglés (p. ej. Professional / Collaborative / Innovative). Sustitúyelos en «Voz y tono»."
          : "Añade rasgos y ejemplos en Voz y tono.";
    const toneStatus = toneHasRealSignals
      ? "Confirmado"
      : rawTraits.length > 0
        ? "Legacy"
        : "Incompleto";
    return {
      toneBody,
      toneStatus,
      toneFootnote:
        legacyTraitRows.length && traitsClean.length
          ? `Se ocultan del resumen ${legacyTraitRows.length} rasgo(s) demo EN no confirmados.`
          : null,
      messagesBody: cleanFunnel.length
        ? cleanFunnel
            .slice(0, 4)
            .map((m) => m.text)
            .join(" · ")
        : funnel.length
          ? "Los mensajes del embudo son copy demo (Foldder / Creative OS). Edita «Mensajes»."
          : "Define mensajes por etapa.",
      messagesStatus:
        cleanFunnel.length > 0 ? "Detectado" : funnel.length > 0 ? "Legacy" : "Incompleto",
      messagesFootnote:
        legacyFunnelRows.length && cleanFunnel.length
          ? `${legacyFunnelRows.length} mensaje(s) demo (inglés) no se muestran aquí ni en el resumen principal.`
          : null,
    };
  }, [assets.strategy.languageTraits, assets.strategy.funnelMessages, assets.strategy.voiceExamples]);

  const adn = useMemo(() => computeAdnScore(assets), [assets]);
  const brainClients = useMemo(
    () => listDownstreamBrainClients(canvasNodes ?? undefined, canvasEdges ?? undefined),
    [canvasNodes, canvasEdges],
  );
  const assetsMetadataRef = useRef<unknown>(assetsMetadata);
  const brainAtmosphereBackdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    assetsMetadataRef.current = assetsMetadata;
  }, [assetsMetadata]);

  const handleBrainAtmosphereMouseMove = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const el = brainAtmosphereBackdropRef.current;
    if (!el) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = rect.width > 0 ? (event.clientX - rect.left) / rect.width - 0.5 : 0;
    const y = rect.height > 0 ? (event.clientY - rect.top) / rect.height - 0.5 : 0;
    el.style.setProperty("--brain-parallax-x", `${x * 26}px`);
    el.style.setProperty("--brain-parallax-y", `${y * 22}px`);
    el.style.setProperty("--brain-parallax-x-soft", `${x * -16}px`);
    el.style.setProperty("--brain-parallax-y-soft", `${y * -12}px`);
  }, []);

  const loadPendingLearnings = useCallback(async () => {
    if (!projectId?.trim()) {
      setPendingLearnings([]);
      return;
    }
    setPendingLoading(true);
    try {
      const res = await fetch(
        `/api/spaces/brain/learning/pending?projectId=${encodeURIComponent(projectId.trim())}`,
      );
      const json = await readResponseJson<{ items?: StoredLearningCandidate[] }>(res, "brain/pending");
      if (json?.items) setPendingLearnings(json.items);
    } finally {
      setPendingLoading(false);
    }
  }, [projectId]);
  const pendingLoadInFlightRef = useRef<Promise<void> | null>(null);
  const pendingLoadLastAtRef = useRef(0);
  const loadPendingLearningsStable = useCallback(async () => {
    const now = Date.now();
    if (pendingLoadInFlightRef.current) return pendingLoadInFlightRef.current;
    if (now - pendingLoadLastAtRef.current < 1200) return;
    const run = loadPendingLearnings()
      .catch(() => undefined)
      .finally(() => {
        pendingLoadInFlightRef.current = null;
        pendingLoadLastAtRef.current = Date.now();
      });
    pendingLoadInFlightRef.current = run;
    return run;
  }, [loadPendingLearnings]);

  useEffect(() => {
    if (!open || !projectId?.trim()) {
      setPendingLearnings([]);
      return;
    }
    void loadPendingLearningsStable();
  }, [open, projectId, loadPendingLearningsStable]);

  const [activeTab, setActiveTab] = useState<BrainMainSection>("overview");
  const [atmosphereCanvasMode, setAtmosphereCanvasMode] = useState<"fusion" | "project">("fusion");
  const [brainIdentityEditorOpen, setBrainIdentityEditorOpen] = useState(false);
  /** Tarjeta «Contexto de marca» en ADN: vista corta + Ver más. */
  const [dnaBrandContextExpanded, setDnaBrandContextExpanded] = useState(false);
  const [brandSummarySectionSourcesKey, setBrandSummarySectionSourcesKey] = useState<BrandSummarySection["key"] | null>(
    null,
  );
  const [lastRestudyCompletedIso, setLastRestudyCompletedIso] = useState<string | null>(null);
  const prevOpenRef = useRef(false);
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      setActiveTab(initialSection ?? "overview");
    }
    prevOpenRef.current = open;
  }, [open, initialSection]);

  useEffect(() => {
    if (activeTab !== "dna") setDnaBrandContextExpanded(false);
  }, [activeTab]);

  const [urlDraftCore, setUrlDraftCore] = useState("");
  const [urlDraftContext, setUrlDraftContext] = useState("");
  const [isDraggingCoreFiles, setIsDraggingCoreFiles] = useState(false);
  const [isDraggingContextFiles, setIsDraggingContextFiles] = useState(false);
  const knowledgeIngestQueueRef = useRef<KnowledgeIngestJob[]>([]);
  const knowledgeIngestPumpRunningRef = useRef(false);
  /** Tras subir imágenes al pozo, tras el análisis de conocimiento se llama a visión remota (sin pulsar «Reanalizar imágenes»). */
  const visionAfterKnowledgeIngestRef = useRef(false);
  const [knowledgePipelineBusy, setKnowledgePipelineBusy] = useState(false);
  const [knowledgePipelineQueued, setKnowledgePipelineQueued] = useState(0);
  /** Paso actual de la cola de ingesta (subida, análisis, visión); visible en la bandeja de documentación. */
  const [knowledgePipelineDetail, setKnowledgePipelineDetail] = useState("");
  const knowledgeIngestLocked = knowledgePipelineBusy || knowledgePipelineQueued > 0;
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [expandedDocs, setExpandedDocs] = useState<Set<string>>(new Set());
  const [activeFilter, setActiveFilter] = useState("all");
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Record<string, unknown>>({});
  const [message, setMessage] = useState<{ text: string; type: MessageType }>({ text: "", type: "" });
  const [pendingLearnings, setPendingLearnings] = useState<StoredLearningCandidate[]>([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [telemetryByNodeId, setTelemetryByNodeId] = useState<
    Record<string, { summaryLine: string | null; lastAt: string | null }>
  >({});
  const [reviewSourceFilter, setReviewSourceFilter] = useState<
    "all" | "visual" | "designer" | "photoroom" | "article"
  >("all");
  const [reviewReasoningOpenId, setReviewReasoningOpenId] = useState<string | null>(null);

  const pendingFiltered = useMemo(() => {
    if (reviewSourceFilter === "all") return pendingLearnings;
    return pendingLearnings.filter((row) => {
      if (reviewSourceFilter === "visual") {
        const bundle = hasVisualLearningReviewBundle(row.candidate.evidence.eventCounts);
        return row.candidate.type === "VISUAL_MEMORY" || bundle;
      }
      if (reviewSourceFilter === "designer") return row.telemetryNodeType === "DESIGNER";
      if (reviewSourceFilter === "photoroom") return row.telemetryNodeType === "PHOTOROOM";
      if (reviewSourceFilter === "article") return row.telemetryNodeType === "ARTICLE_WRITER";
      return true;
    });
  }, [pendingLearnings, reviewSourceFilter]);

  const pendingReviewSplit = useMemo(() => {
    const anchored: StoredLearningCandidate[] = [];
    const orphans: StoredLearningCandidate[] = [];
    for (const row of pendingFiltered) {
      if (resolveLearningPendingAnchorNodeId(row)) anchored.push(row);
      else orphans.push(row);
    }
    return { anchored, orphans };
  }, [pendingFiltered]);

  const pendingByNodeId = useMemo(() => buildPendingCountByNodeId(pendingLearnings), [pendingLearnings]);

  const refreshTelemetrySummary = useCallback(async () => {
    if (!projectId?.trim()) {
      setTelemetryByNodeId({});
      return;
    }
    const ids = brainClients.map((c) => c.id).filter(Boolean);
    try {
      const map = ids.length ? await fetchBrainTelemetrySummaryByNodeId(projectId.trim(), ids) : {};
      setTelemetryByNodeId(map);
    } catch {
      setTelemetryByNodeId({});
    }
  }, [projectId, brainClients]);

  useEffect(() => {
    if (!open) {
      setTelemetryByNodeId({});
      return;
    }
    void refreshTelemetrySummary();
  }, [open, refreshTelemetrySummary]);

  useEffect(() => {
    if (!open || !projectId?.trim() || brainClients.length === 0) return;
    const knownClientIds = new Set(brainClients.map((client) => client.id).filter(Boolean));
    const handleTelemetrySynced = (event: Event) => {
      const detail = (event as CustomEvent<BrainTelemetrySyncedEventDetail>).detail;
      if (!detail || detail.projectId !== projectId.trim() || !knownClientIds.has(detail.nodeId)) return;
      void refreshTelemetrySummary();
    };
    window.addEventListener(BRAIN_TELEMETRY_SYNCED_EVENT, handleTelemetrySynced);
    return () => {
      window.removeEventListener(BRAIN_TELEMETRY_SYNCED_EVENT, handleTelemetrySynced);
    };
  }, [open, projectId, brainClients, refreshTelemetrySummary]);

  const refreshConnectedSignals = useCallback(async () => {
    await Promise.all([loadPendingLearningsStable(), refreshTelemetrySummary()]);
  }, [loadPendingLearningsStable, refreshTelemetrySummary]);

  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState<BrainChatMessage[]>([
    {
      id: "brain-chat-welcome",
      role: "assistant",
      text:
        "Soy Brain Copilot. Preguntame sobre el contenido que hayas subido y analizado. Si falta contexto, te sugerire que documentos o URLs subir.",
    },
  ]);

  const [voiceText, setVoiceText] = useState("");
  const [voiceKind, setVoiceKind] = useState<BrainVoiceExample["kind"]>("approved_voice");
  const [newTaboo, setNewTaboo] = useState("");
  const [newApprovedPhrase, setNewApprovedPhrase] = useState("");
  const [newLanguageTrait, setNewLanguageTrait] = useState("");
  const [newSyntaxPattern, setNewSyntaxPattern] = useState("");
  const [newPreferredTerm, setNewPreferredTerm] = useState("");
  const [newForbiddenTerm, setNewForbiddenTerm] = useState("");
  const [channelIntensityName, setChannelIntensityName] = useState("");
  const [channelIntensityValue, setChannelIntensityValue] = useState(60);

  const [personaName, setPersonaName] = useState("");
  const [personaPain, setPersonaPain] = useState("");
  const [personaChannel, setPersonaChannel] = useState("");
  const [personaSophistication, setPersonaSophistication] = useState("");
  const [personaTags, setPersonaTags] = useState("");
  const [personaObjections, setPersonaObjections] = useState("");
  const [personaProofNeeded, setPersonaProofNeeded] = useState("");
  const [personaAttentionTriggers, setPersonaAttentionTriggers] = useState("");
  const [personaMarketSophistication, setPersonaMarketSophistication] = useState("");
  const [personaModalOpen, setPersonaModalOpen] = useState(false);

  const [funnelStageDraft, setFunnelStageDraft] = useState<
    "awareness" | "consideration" | "conversion" | "retention"
  >("awareness");
  const [funnelTextDraft, setFunnelTextDraft] = useState("");
  const [messageClaimDraft, setMessageClaimDraft] = useState("");
  const [messageSupportDraft, setMessageSupportDraft] = useState("");
  const [messageAudienceDraft, setMessageAudienceDraft] = useState("");
  const [messageChannelDraft, setMessageChannelDraft] = useState("");
  const [messageCtaDraft, setMessageCtaDraft] = useState("");
  const [messageEvidenceDraft, setMessageEvidenceDraft] = useState("");

  const [briefObjective, setBriefObjective] = useState("");
  const [briefChannel, setBriefChannel] = useState("");
  const [briefPersonaId, setBriefPersonaId] = useState("");
  const [briefFunnel, setBriefFunnel] = useState<
    "awareness" | "consideration" | "conversion" | "retention"
  >("awareness");
  const [briefAsk, setBriefAsk] = useState("");
  const [generatingPiece, setGeneratingPiece] = useState(false);
  const [generatedPreview, setGeneratedPreview] = useState<GeneratedPreview | null>(null);
  const [pieceFeedbackNote, setPieceFeedbackNote] = useState("");
  const [factsVerificationFilter, setFactsVerificationFilter] = useState<"all" | "verified" | "interpreted">("verified");
  const [factsStrengthFilter, setFactsStrengthFilter] = useState<"all" | "fuerte" | "media" | "debil">("fuerte");

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string, type: MessageType = "info") => {
    setMessage({ text: msg, type });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setMessage({ text: "", type: "" }), 4200);
  }, []);
  const brandLocked = Boolean(assets.brainMeta?.brandLocked);
  const brandWriteBlockReason = getBrainScopeWriteBlockReason("brand", assets);
  const guardBrandWrite = useCallback(
    (actionLabel?: string) => {
      if (!brandWriteBlockReason) return true;
      showToast(actionLabel ? `${brandWriteBlockReason} ${actionLabel}` : brandWriteBlockReason, "info");
      return false;
    },
    [brandWriteBlockReason, showToast],
  );

  const [reviewEvidenceOpenId, setReviewEvidenceOpenId] = useState<string | null>(null);
  const [reviewResolvingId, setReviewResolvingId] = useState<string | null>(null);
  const [signalModalClient, setSignalModalClient] = useState<BrainDownstreamClient | null>(null);
  const [, setVisualReanalyzing] = useState(false);
  const [visualReanalyzeDiagnostics, setVisualReanalyzeDiagnostics] = useState<VisualReanalyzeDiagnosticRow[]>([]);
  const [visualQueueBusy, setVisualQueueBusy] = useState(false);
  const [serverVisionProviderId, setServerVisionProviderId] = useState<
    "mock" | "gemini-vision" | "openai-vision" | null
  >(null);
  const [serverVisionProbeDone, setServerVisionProbeDone] = useState(false);
  const [restudyBusy, setRestudyBusy] = useState(false);
  const [restudyTraceOpen, setRestudyTraceOpen] = useState(false);
  const [restudyLast, setRestudyLast] = useState<{
    steps: Array<{ step: string; ok: boolean; detail?: string }>;
    visual: {
      totalImages: number;
      analyzedReal: number;
      fallback: number;
      failed: number;
      tooGeneric: number;
      mock: number;
      provider: string;
    };
    documents: { totalCoreDocuments: number; analyzed: number; failed: number };
    summary: {
      identityNarrative: string;
      tone: string;
      messages: string;
      visualDirection: string;
      confidence: number;
      warnings: string[];
    };
    candidatesCreated: number;
    warnings: string[];
    traceability: Record<string, unknown>;
    devValidation?: {
      samples: Array<{ sourceAssetId: string; subjectTags: string[]; visualStyle: string[]; quality: string }>;
      passed: boolean;
      warning?: string;
    };
  } | null>(null);

  const refreshServerVisionProvider = useCallback(async () => {
    setServerVisionProbeDone(false);
    try {
      const res = await fetch("/api/spaces/brain/visual/provider");
      const j =
        (await readResponseJson<{ providerId?: string }>(res, "brain/visual/provider")) ?? {};
      if (!res.ok) {
        setServerVisionProviderId(res.status === 401 ? null : "mock");
        return;
      }
      const id = j.providerId;
      if (id === "gemini-vision" || id === "openai-vision" || id === "mock") {
        setServerVisionProviderId(id);
      } else {
        setServerVisionProviderId("mock");
      }
    } catch {
      setServerVisionProviderId(null);
    } finally {
      setServerVisionProbeDone(true);
    }
  }, []);

  useEffect(() => {
    if (!open) {
      setServerVisionProbeDone(false);
      setServerVisionProviderId(null);
      return;
    }
    void refreshServerVisionProvider();
  }, [open, refreshServerVisionProvider]);

  const visualDiagnosticByAssetId = useMemo(() => {
    const m = new Map<string, VisualReanalyzeDiagnosticRow>();
    for (const d of visualReanalyzeDiagnostics) m.set(d.assetId, d);
    return m;
  }, [visualReanalyzeDiagnostics]);

  const resolvePendingItem = useCallback(
    async (row: StoredLearningCandidate, action: LearningResolutionAction) => {
      const learningId = row.id;
      const targetScope = resolveLearningCandidateBrainScope(row);
      if (action === "PROMOTE_TO_DNA" && !canWriteBrainScope(targetScope, assets)) {
        showToast(BRAIN_BRAND_LOCKED_MESSAGE, "info");
        return;
      }
      setReviewResolvingId(learningId);
      try {
        const res = await fetch("/api/spaces/brain/learning/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ learningId, action, brandLocked }),
        });
        const json = await readResponseJson<{ error?: string }>(res, "brain/resolve");
        if (!res.ok) {
          showToast(json?.error ?? "No se pudo aplicar la decisión.", "error");
          return;
        }

        if (action !== "DISMISS") {
          const { nextAssets, applied, changedPaths, warnings } = applyLearningCandidateToProjectAssets(
            assets,
            row,
            action,
          );
          if (applied) {
            const staleReasons: string[] = [BRAIN_STALE_REASON.STRATEGY_MANUALLY_CHANGED];
            if (changedPaths.some((p) => p.includes("visualReference") || p.includes("confirmedVisualPatterns"))) {
              staleReasons.push(BRAIN_STALE_REASON.VISUAL_REFERENCE_CHANGED);
            }
            onAssetsMetadataChange({
              ...nextAssets,
              brainMeta: markBrainStale(normalizeBrainMeta(nextAssets.brainMeta), staleReasons),
            });
            onVisualReferenceAnalysisDirty?.();
            const human =
              changedPaths.includes("strategy.languageTraits")
                ? "Añadido a tono (rasgos de lenguaje)."
                : changedPaths.some((p) => p.includes("funnelMessages"))
                  ? "Añadido a mensajes del embudo."
                  : changedPaths.some((p) => p.includes("messageBlueprints"))
                    ? "Añadido a blueprints de mensaje."
                    : changedPaths.some((p) => p.includes("factsAndEvidence"))
                      ? "Añadido a hechos y pruebas."
                      : changedPaths.some((p) => p.includes("personas"))
                        ? "Añadido a personas."
                        : changedPaths.some((p) => p.includes("confirmedVisualPatterns"))
                          ? "Añadido a ADN visual confirmado."
                          : changedPaths.some((p) => p.includes("projectOnlyMemories"))
                            ? "Guardado en memoria de este proyecto."
                            : changedPaths.some((p) => p.includes("contextualMemories"))
                              ? "Guardado como contexto puntual."
                              : changedPaths.some((p) => p.includes("rejectedPatterns"))
                                ? "Archivado en patrones rechazados."
                                : changedPaths.some((p) => p.includes("approvedPhrases"))
                                  ? "Añadido a frases aprobadas / preferencias."
                                  : changedPaths.some((p) => p.includes("approvedPatterns"))
                                    ? "Añadido a patrones aprobados."
                                    : `Actualizado: ${changedPaths.join(", ") || "estrategia"}.`;
            showToast(human, "success");
            if (warnings.length) {
              showToast(warnings.join(" "), "info");
            }
          } else {
            showToast(
              "Aprendizaje marcado como resuelto en el servidor, pero no se pudo aplicar al proyecto en local. Revisa manualmente o guarda el proyecto.",
              "error",
            );
            if (warnings.length) showToast(warnings.join(" "), "info");
          }
        } else {
          showToast("Descartado.", "success");
        }

        setPendingLearnings((prev) => prev.filter((p) => p.id !== learningId));
      } catch {
        showToast("No se pudo aplicar la decisión.", "error");
      } finally {
        setReviewResolvingId(null);
      }
    },
    [assets, brandLocked, onAssetsMetadataChange, onVisualReferenceAnalysisDirty, showToast],
  );

  const devClearPendingLearnings = useCallback(
    async (mode: "all" | "orphan" | "visual_reference") => {
      const pid = projectId?.trim();
      if (!pid) {
        showToast("Guarda el proyecto con sesión para limpiar pendientes.", "error");
        return;
      }
      try {
        const res = await fetch(
          `/api/spaces/brain/learning/pending?projectId=${encodeURIComponent(pid)}&mode=${encodeURIComponent(mode)}`,
          { method: "DELETE" },
        );
        const json =
          (await readResponseJson<{ removed?: number; error?: string }>(res, "brain/pending DELETE")) ?? {};
        if (res.ok && typeof json.removed === "number") {
          showToast(`Pendientes eliminados (${mode}): ${json.removed}`, "success");
          await loadPendingLearningsStable();
        } else {
          showToast(json.error ?? "No se pudo limpiar", "error");
        }
      } catch {
        showToast("No se pudo limpiar pendientes.", "error");
      }
    },
    [projectId, loadPendingLearningsStable, showToast],
  );

  const handleBrainRestudy = useCallback(async () => {
    const pid = projectId?.trim();
    if (!pid) {
      showToast("Guarda el proyecto con sesión para re-estudiar Brain.", "error");
      return;
    }
    setRestudyBusy(true);
    setRestudyLast(null);
    try {
      const res = await fetch("/api/spaces/brain/restudy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: pid,
          workspaceId: workspaceId?.trim() || undefined,
          assets: assetsMetadataRef.current,
          options: {
            provider: "gemini",
            devValidateThreeImages: true,
          },
        }),
      });
      const json = (await readResponseJson<{
        ok?: boolean;
        error?: string;
        steps?: Array<{ step: string; ok: boolean; detail?: string }>;
        visual?: {
          totalImages: number;
          analyzedReal: number;
          fallback: number;
          failed: number;
          tooGeneric: number;
          mock: number;
          provider: string;
        };
        documents?: { totalCoreDocuments: number; analyzed: number; failed: number };
        summary?: {
          identityNarrative: string;
          tone: string;
          messages: string;
          visualDirection: string;
          confidence: number;
          warnings: string[];
        };
        candidatesCreated?: number;
        warnings?: string[];
        nextAssets?: ProjectAssetsMetadata;
        traceability?: Record<string, unknown>;
        devValidation?: {
          samples: Array<{ sourceAssetId: string; subjectTags: string[]; visualStyle: string[]; quality: string }>;
          passed: boolean;
          warning?: string;
        };
      }>(res, "brain/restudy")) ?? { error: "Sin respuesta JSON" };
      if (!res.ok || json.error) {
        showToast(json.error ?? "Re-estudio no disponible o falló.", "error");
        return;
      }
      if (json.nextAssets) {
        const normalizedNext = normalizeProjectAssets(json.nextAssets);
        const restudyTrace = createBrainDecisionTrace({
          kind: "merge_resolution",
          persistenceIntent: "persist_immediately",
          targetNodeType: "project_brain",
          useCase: "restudy_pipeline",
          inputs: [
            ...(json.visual
              ? [
                  {
                    id: "restudy_visual_total",
                    kind: "count",
                    label: `visual_total_images:${json.visual.totalImages}`,
                  },
                  {
                    id: "restudy_visual_real",
                    kind: "count",
                    label: `visual_real_analyzed:${json.visual.analyzedReal}`,
                  },
                ]
              : []),
            ...(typeof json.candidatesCreated === "number"
              ? [
                  {
                    id: "restudy_candidates_created",
                    kind: "count",
                    label: `candidates_created:${json.candidatesCreated}`,
                  },
                ]
              : []),
          ],
          outputSummary: {
            title: "Brain Restudy",
            summary: "Brain restudy pipeline completed and assets were refreshed.",
            confidence: typeof json.summary?.confidence === "number" ? json.summary.confidence : 0.7,
            warnings: (json.warnings ?? json.summary?.warnings ?? []).slice(0, 6),
          },
          confidence: typeof json.summary?.confidence === "number" ? json.summary.confidence : 0.7,
        });
        const traces = capDecisionTraces([restudyTrace, ...(normalizedNext.strategy.decisionTraces ?? [])], {
          max: 50,
          payloadRiskMax: 25,
          order: "desc",
        });
        onAssetsMetadataChange({
          ...normalizedNext,
          strategy: {
            ...normalizedNext.strategy,
            ...(traces.length ? { decisionTraces: traces } : {}),
          },
        });
        onVisualReferenceAnalysisDirty?.();
        setLastRestudyCompletedIso(new Date().toISOString());
      }
      if (
        json.steps &&
        json.visual &&
        json.documents &&
        json.summary &&
        typeof json.candidatesCreated === "number" &&
        json.traceability
      ) {
        setRestudyLast({
          steps: json.steps,
          visual: json.visual,
          documents: json.documents,
          summary: json.summary,
          candidatesCreated: json.candidatesCreated,
          warnings: json.warnings ?? json.summary.warnings ?? [],
          traceability: json.traceability,
          ...(json.devValidation ? { devValidation: json.devValidation } : {}),
        });
      }
      await loadPendingLearningsStable();
      showToast(
        json.ok ? "Re-estudio Brain completado. Revisa el panel de diagnóstico." : "Re-estudio con advertencias.",
        json.ok ? "success" : "info",
      );
    } catch {
      showToast("Error de red al re-estudiar Brain.", "error");
    } finally {
      setRestudyBusy(false);
    }
  }, [
    projectId,
    workspaceId,
    showToast,
    onAssetsMetadataChange,
    onVisualReferenceAnalysisDirty,
    loadPendingLearningsStable,
  ]);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const patch = useCallback(
    (fn: (a: ProjectAssetsMetadata) => ProjectAssetsMetadata, staleReasons?: string[]) => {
      const base = normalizeProjectAssets(assetsMetadataRef.current);
      let next = fn(base);
      if (staleReasons?.length) {
        next = {
          ...next,
          brainMeta: markBrainStale(normalizeBrainMeta(next.brainMeta), staleReasons),
        };
      }
      const normalized = normalizeProjectAssets(next);
      assetsMetadataRef.current = normalized;
      onAssetsMetadataChange(normalized);
    },
    [onAssetsMetadataChange],
  );

  const saveBrandVisualDnaBundle = useCallback(
    (bundle: BrandVisualDnaStoredBundle) => {
      if (!guardBrandWrite("No se puede guardar ADN visual de Marca.")) return;
      patch(
        (a) => {
          const layer = a.strategy.visualReferenceAnalysis ?? { analyses: [] };
          return {
            ...a,
            strategy: {
              ...a.strategy,
              visualReferenceAnalysis: { ...layer, brandVisualDnaBundle: bundle },
            },
          };
        },
        [BRAIN_STALE_REASON.VISUAL_REFERENCE_CHANGED, BRAIN_STALE_REASON.CONTENT_DNA_LAYER_CHANGED],
      );
      onVisualReferenceAnalysisDirty?.();
    },
    [guardBrandWrite, patch, onVisualReferenceAnalysisDirty],
  );

  const stripLegacyDemoStrategyCopy = useCallback(() => {
    if (!guardBrandWrite("No se puede limpiar copy legacy de Marca.")) return;
    patch(
      (a) => ({
        ...a,
        strategy: {
          ...a.strategy,
          funnelMessages: filterLegacyFunnelMessages(a.strategy.funnelMessages),
          languageTraits: filterLegacyLanguageTraits(a.strategy.languageTraits),
        },
      }),
      [BRAIN_STALE_REASON.STRATEGY_MANUALLY_CHANGED],
    );
    showToast("Se eliminaron del proyecto los mensajes demo del embudo y los rasgos EN demo (Professional/Collaborative/Innovative).", "success");
  }, [guardBrandWrite, patch, showToast]);

  const setBrand = useCallback(
    (partial: Partial<ProjectAssetsMetadata["brand"]>) => {
      if (!guardBrandWrite("No se puede editar identidad de Marca.")) return;
      const reasons: string[] = [];
      if ("logoPositive" in partial || "logoNegative" in partial) reasons.push(BRAIN_STALE_REASON.LOGO_CHANGED);
      if ("colorPrimary" in partial || "colorSecondary" in partial || "colorAccent" in partial) {
        reasons.push(BRAIN_STALE_REASON.BRAND_PALETTE_CHANGED);
      }
      patch((a) => ({ ...a, brand: { ...a.brand, ...partial } }), reasons.length ? reasons : undefined);
    },
    [guardBrandWrite, patch],
  );

  const setKnowledge = useCallback(
    (next: Partial<ProjectAssetsMetadata["knowledge"]>, staleReasons?: string[]) => {
      patch(
        (a) => ({
          ...a,
          knowledge: {
            ...a.knowledge,
            ...next,
            urls: next.urls ?? a.knowledge.urls,
            documents: next.documents ?? a.knowledge.documents,
          },
        }),
        staleReasons,
      );
    },
    [patch],
  );

  const setStrategy = useCallback(
    (next: Partial<ProjectAssetsMetadata["strategy"]>, staleReasons?: string[]) => {
      patch(
        (a) => ({
          ...a,
          strategy: {
            ...a.strategy,
            ...next,
            voiceExamples: next.voiceExamples ?? a.strategy.voiceExamples,
            tabooPhrases: next.tabooPhrases ?? a.strategy.tabooPhrases,
            approvedPhrases: next.approvedPhrases ?? a.strategy.approvedPhrases,
            languageTraits: next.languageTraits ?? a.strategy.languageTraits,
            syntaxPatterns: next.syntaxPatterns ?? a.strategy.syntaxPatterns,
            preferredTerms: next.preferredTerms ?? a.strategy.preferredTerms,
            forbiddenTerms: next.forbiddenTerms ?? a.strategy.forbiddenTerms,
            channelIntensity: next.channelIntensity ?? a.strategy.channelIntensity,
            allowAbsoluteClaims: next.allowAbsoluteClaims ?? a.strategy.allowAbsoluteClaims,
            personas: next.personas ?? a.strategy.personas,
            funnelMessages: next.funnelMessages ?? a.strategy.funnelMessages,
            messageBlueprints: next.messageBlueprints ?? a.strategy.messageBlueprints,
            factsAndEvidence: next.factsAndEvidence ?? a.strategy.factsAndEvidence,
            generatedPieces: next.generatedPieces ?? a.strategy.generatedPieces,
            approvedPatterns: next.approvedPatterns ?? a.strategy.approvedPatterns,
            rejectedPatterns: next.rejectedPatterns ?? a.strategy.rejectedPatterns,
            visualStyle: next.visualStyle ?? a.strategy.visualStyle,
            visualReferenceAnalysis: next.visualReferenceAnalysis
              ? preserveGeneratedVisualCollage(next.visualReferenceAnalysis, a.strategy.visualReferenceAnalysis)
              : a.strategy.visualReferenceAnalysis,
            brandVisualDna: next.brandVisualDna ?? a.strategy.brandVisualDna,
            contentDna: next.contentDna ?? a.strategy.contentDna,
            safeCreativeRules: next.safeCreativeRules ?? a.strategy.safeCreativeRules,
            visualDnaSlots: next.visualDnaSlots ?? a.strategy.visualDnaSlots,
            visualCapsules: next.visualCapsules ?? a.strategy.visualCapsules,
            visualGeneralLook: next.visualGeneralLook ?? a.strategy.visualGeneralLook,
            visualDnaSlotSuppressedSourceIds:
              next.visualDnaSlotSuppressedSourceIds ?? a.strategy.visualDnaSlotSuppressedSourceIds,
            decisionTraces: next.decisionTraces ?? a.strategy.decisionTraces,
          },
        }),
        staleReasons,
      );
    },
    [patch],
  );

  const visualImageRefCount = useMemo(() => collectVisualImageAssetRefs(assets).length, [assets]);
  const visualLayer = assets.strategy.visualReferenceAnalysis;
  const visualAnalyzedCount = visualLayer?.analyses?.length ?? 0;
  const visualDisposition = useMemo(
    () => countVisualImageAnalysisDisposition(visualLayer?.analyses),
    [visualLayer?.analyses],
  );
  const visualAggregatedResolved = useMemo(() => {
    const al = visualLayer?.analyses;
    if (!al?.length) return null;
    return aggregateVisualPatterns(al);
  }, [visualLayer?.analyses]);

  const visualRefInventoryRows = useMemo(() => {
    const refs = collectVisualImageAssetRefs(assets);
    const byId = new Map((assets.strategy.visualReferenceAnalysis?.analyses ?? []).map((a) => [a.sourceAssetId, a]));
    return refs.map((ref) => ({ ref, analysis: byId.get(ref.id) ?? null }));
  }, [assets]);

  const visualGeneralLookRows = useMemo(
    () => visualRefInventoryRows.filter((row) => isGeneralLookEligibleReference(assets, row.ref.id)),
    [assets, visualRefInventoryRows],
  );
  const visualGeneralLookActiveRows = useMemo(
    () =>
      visualGeneralLookRows.filter(
        (row) => !isVisualReferenceExcludedFromGeneralLook(assets, row.ref.id, row.analysis),
      ),
    [assets, visualGeneralLookRows],
  );
  const discoveredBrandAssets = useMemo(
    () => deriveDiscoveredBrandAssets(assets, visualGeneralLookRows),
    [assets, visualGeneralLookRows],
  );
  const activeDiscoveredBrandAssets = useMemo(() => {
    const excluded = new Set(assets.strategy.visualGeneralLook?.excludedDiscoveredBrandAssetIds ?? []);
    return discoveredBrandAssets.filter((asset) => !excluded.has(asset.id));
  }, [assets.strategy.visualGeneralLook?.excludedDiscoveredBrandAssetIds, discoveredBrandAssets]);
  const visualSignalDocumentsForGeneralLook = useMemo(
    () =>
      assets.knowledge.documents
        .filter((doc) => resolveBrainSourceScope(doc) !== "capsule")
        .filter((doc) => !assets.strategy.visualGeneralLook?.excludedReferenceSourceAssetIds?.includes(doc.id))
        .map((doc) => ({ doc, signals: readDocumentVisualSignals(doc) }))
        .filter((row): row is { doc: KnowledgeDocumentEntry; signals: { summary: string; colors: string[] } } => Boolean(row.signals)),
    [assets.knowledge.documents, assets.strategy.visualGeneralLook?.excludedReferenceSourceAssetIds],
  );
  const visualGeneralLookFingerprint = useMemo(
    () =>
      [
        computeBrainVisualDnaCollageFingerprint(visualGeneralLookActiveRows),
        ...visualSignalDocumentsForGeneralLook.map(({ doc, signals }) => `${doc.id}:${doc.analyzedAt ?? ""}:${signals.summary}:${signals.colors.join(",")}`),
      ].join("|docSignals:"),
    [visualGeneralLookActiveRows, visualSignalDocumentsForGeneralLook],
  );
  const visualGeneralLookNeedsRegeneration = Boolean(
    visualLayer?.dnaCollageImageDataUrl &&
      visualLayer.dnaCollageSourceFingerprint &&
      visualLayer.dnaCollageSourceFingerprint !== visualGeneralLookFingerprint,
  );
  const [visualGeneralMosaicBusy, setVisualGeneralMosaicBusy] = useState(false);

  const slotMosaicBusyRef = useRef(new Set<string>());
  const slotMosaicAutoAttemptRef = useRef(new Map<string, number>());
  const [visualDnaSlotBusy, setVisualDnaSlotBusy] = useState<Record<string, boolean>>({});

  const runSingleVisualDnaSlotMosaic = useCallback(
    async (slotId: string, opts?: { force?: boolean }) => {
      if (slotMosaicBusyRef.current.has(slotId)) return;
      slotMosaicBusyRef.current.add(slotId);
      setVisualDnaSlotBusy((p) => ({ ...p, [slotId]: true }));
      try {
        const rawAssets = normalizeProjectAssets(assetsMetadataRef.current);
        let assetsLoop = rawAssets;
        try {
          assetsLoop = await hydrateKnowledgeImageDocumentsWithViewUrlsClient(rawAssets);
        } catch {
          assetsLoop = rawAssets;
        }
        const slot = normalizeVisualDnaSlots(assetsLoop.strategy.visualDnaSlots).find((s) => s.id === slotId);
        if (!slot) return;
        const hasExistingMosaic = Boolean(slot.mosaic?.imageUrl?.trim() || slot.mosaic?.s3Path?.trim());
        if (!opts?.force && hasExistingMosaic) {
          if (slot.status !== "ready") {
            patch((a) => ({
              ...a,
              strategy: {
                ...a.strategy,
                visualDnaSlots: updateVisualDnaSlot(a.strategy.visualDnaSlots ?? [], slotId, {
                  status: "ready",
                  lastError: undefined,
                  updatedAt: new Date().toISOString(),
                }),
              },
            }));
          }
          return;
        }
        if (!opts?.force && (slot.status === "generating" || slot.status === "failed" || slot.status === "stale")) return;
        if (!opts?.force) {
          const lastAttempt = slotMosaicAutoAttemptRef.current.get(slotId) ?? 0;
          if (Date.now() - lastAttempt < 30 * 60 * 1000) return;
          slotMosaicAutoAttemptRef.current.set(slotId, Date.now());
        }

        const byId = new Map(
          (assetsLoop.strategy.visualReferenceAnalysis?.analyses ?? []).map((x) => [x.sourceAssetId, x]),
        );
        const rows = collectVisualImageAssetRefs(assetsLoop).map((ref) => ({
          ref,
          analysis: byId.get(ref.id) ?? null,
        }));
        const docId = slot.sourceDocumentId;
        if (!docId) return;
        let row = rows.find((r) => r.ref.id === docId && r.ref.sourceKind === "knowledge_document");
        if (!row) return;
        const rowDoc = assetsLoop.knowledge.documents.find((doc) => doc.id === docId);
        const isCapsuleSlot = Boolean(rowDoc && resolveBrainSourceScope(rowDoc) === "capsule");
        const slotSrc = slot.sourceImageUrl?.trim();
        if (!row.ref.imageUrlForVision?.trim() && slotSrc) {
          row = { ...row, ref: { ...row.ref, imageUrlForVision: slotSrc } };
        }
        const rowAnalysisStatus = row.analysis?.analysisStatus;
        const sourceOnlyMosaicAllowed = isCapsuleSlot && Boolean(row.ref.imageUrlForVision?.trim());
        if (rowAnalysisStatus === "failed" && !sourceOnlyMosaicAllowed) return;
        if (rowAnalysisStatus && rowAnalysisStatus !== "analyzed") {
          if (sourceOnlyMosaicAllowed) {
            row = { ...row, analysis: null };
          } else {
            patch((a) => ({
              ...a,
              strategy: {
                ...a.strategy,
                visualDnaSlots: updateVisualDnaSlot(a.strategy.visualDnaSlots ?? [], slotId, {
                  status: "pending",
                  lastError: undefined,
                  updatedAt: new Date().toISOString(),
                }),
              },
            }));
            return;
          }
        }
        if (!row.ref.imageUrlForVision?.trim()) {
          patch((a) => ({
            ...a,
            strategy: {
              ...a.strategy,
              visualDnaSlots: updateVisualDnaSlot(a.strategy.visualDnaSlots ?? [], slotId, {
                status: "failed",
                lastError: "Sin URL/data de imagen para el tablero por slot",
                updatedAt: new Date().toISOString(),
              }),
            },
          }));
          return;
        }

        patch((a) => ({
          ...a,
          strategy: {
            ...a.strategy,
            visualDnaSlots: updateVisualDnaSlot(a.strategy.visualDnaSlots ?? [], slotId, {
              status: "generating",
              updatedAt: new Date().toISOString(),
            }),
          },
        }));

        const slotNow =
          normalizeProjectAssets(assetsMetadataRef.current).strategy.visualDnaSlots?.find((s) => s.id === slotId) ??
          slot;
        const result = await generateVisualDnaSlotMosaic({
          slot: slotNow,
          row,
          assets: assetsLoop,
          generateImage: (body) => geminiGenerateWithServerProgress(body, () => {}),
        });
        const mosaicIntelligence =
          result.ok && result.imageUrl
            ? await analyzeVisualDnaMosaicIntelligenceClient({
                slotId,
                imageUrl: result.imageUrl,
              }).catch(() => null)
            : null;

        patch((a) => {
          const cur =
            normalizeVisualDnaSlots(a.strategy.visualDnaSlots).find((s) => s.id === slotId) ?? slotNow;
          const nextSlot = result.ok
            ? (() => {
                const withMosaic = applyMosaicSuccessToSlot(cur, {
                  imageUrl: result.imageUrl,
                  s3Path: result.s3Path,
                  mosaicPrompt: result.mosaicPrompt,
                  diagnostics: result.diagnostics,
                  safeRulesDigest: result.safeRulesDigest,
                });
                return mosaicIntelligence ? applyMosaicIntelligenceToSlot(withMosaic, mosaicIntelligence) : withMosaic;
              })()
            : applyMosaicFailureToSlot(cur, result.error);
          return {
            ...a,
            strategy: {
              ...a.strategy,
              visualDnaSlots: updateVisualDnaSlot(a.strategy.visualDnaSlots ?? [], slotId, nextSlot),
            },
          };
        });
      } finally {
        slotMosaicBusyRef.current.delete(slotId);
        setVisualDnaSlotBusy((p) => {
          const n = { ...p };
          delete n[slotId];
          return n;
        });
      }
    },
    [patch],
  );

  const syncVisualDnaSlotsRunningRef = useRef(false);
  const syncVisualDnaSlotsRerunRef = useRef(false);
  const syncVisualDnaSlotsAutoSourceIdsRef = useRef(new Set<string>());
  const syncVisualDnaSlotsAndGenerateMosaics = useCallback(async (opts?: {
    autoGenerate?: boolean;
    sourceDocumentIds?: string[];
  }) => {
    if (opts?.autoGenerate) {
      const ids = (opts.sourceDocumentIds ?? []).map((id) => id.trim()).filter(Boolean);
      if (ids.length) {
        ids.forEach((id) => syncVisualDnaSlotsAutoSourceIdsRef.current.add(id));
      } else {
        syncVisualDnaSlotsAutoSourceIdsRef.current.add(VISUAL_DNA_SYNC_AUTO_ALL);
      }
    }
    if (syncVisualDnaSlotsRunningRef.current) {
      syncVisualDnaSlotsRerunRef.current = true;
      return;
    }
    syncVisualDnaSlotsRunningRef.current = true;
    try {
      do {
        syncVisualDnaSlotsRerunRef.current = false;
        const autoSourceIds = new Set(syncVisualDnaSlotsAutoSourceIdsRef.current);
        syncVisualDnaSlotsAutoSourceIdsRef.current.clear();
        const rawSnap = normalizeProjectAssets(assetsMetadataRef.current);
        let assetsSnap = rawSnap;
        try {
          assetsSnap = await hydrateKnowledgeImageDocumentsWithViewUrlsClient(rawSnap);
        } catch {
          assetsSnap = rawSnap;
        }
        const hydratedSlots = normalizeVisualDnaSlots(assetsSnap.strategy.visualDnaSlots);
        const currentSlots = normalizeVisualDnaSlots(rawSnap.strategy.visualDnaSlots);
        const docsHydrated = assetsSnap.knowledge.documents;
        const docsCurrent = rawSnap.knowledge.documents;
        const hydratedDocById = new Map(docsHydrated.map((doc) => [doc.id, doc]));
        if (JSON.stringify(docsHydrated) !== JSON.stringify(docsCurrent)) {
          patch((a) => ({
            ...a,
            knowledge: {
              ...a.knowledge,
              documents: docsHydrated,
            },
          }));
        }
        if (
          hydratedSlots.length > 0 &&
          JSON.stringify(hydratedSlots) !== JSON.stringify(currentSlots)
        ) {
          patch((a) => ({
            ...a,
            strategy: {
              ...a.strategy,
              visualDnaSlots: (() => {
                const live = normalizeVisualDnaSlots(a.strategy.visualDnaSlots);
                const byId = new Map(live.map((s) => [s.id, s]));
                for (const hs of hydratedSlots) {
                  const prev = byId.get(hs.id);
                  const doc = hs.sourceDocumentId ? hydratedDocById.get(hs.sourceDocumentId) : undefined;
                  if (!prev) {
                    byId.set(hs.id, {
                      ...hs,
                      sourceImageUrl: hs.sourceImageUrl ?? doc?.dataUrl ?? doc?.originalSourceUrl,
                      sourceS3Path: hs.sourceS3Path ?? doc?.s3Path,
                    });
                    continue;
                  }
                  byId.set(hs.id, {
                    ...prev,
                    sourceImageUrl: hs.sourceImageUrl ?? doc?.dataUrl ?? doc?.originalSourceUrl ?? prev.sourceImageUrl,
                    sourceS3Path: hs.sourceS3Path ?? doc?.s3Path ?? prev.sourceS3Path,
                    mosaic: {
                      ...prev.mosaic,
                      ...hs.mosaic,
                    },
                    status:
                      slotMosaicBusyRef.current.has(hs.id)
                        ? prev.status
                        : hs.mosaic?.imageUrl?.trim() || hs.mosaic?.s3Path?.trim() || prev.mosaic?.imageUrl?.trim() || prev.mosaic?.s3Path?.trim()
                          ? "ready"
                          : prev.status,
                  });
                }
                return dedupeVisualDnaSlotsBySourceDocument(Array.from(byId.values()));
              })(),
            },
          }));
        }
        const upgradedAnalyzedSlots = upgradeAnalyzedKnowledgeImageVisualDnaSlots(assetsSnap).upgraded;
        if (upgradedAnalyzedSlots.length) {
          patch(
            (a) => ({
              ...a,
              strategy: {
                ...a.strategy,
                visualDnaSlots: (() => {
                  const live = normalizeVisualDnaSlots(a.strategy.visualDnaSlots);
                  const byId = new Map(live.map((s) => [s.id, s]));
                  for (const slot of upgradedAnalyzedSlots) {
                    const current = byId.get(slot.id);
                    byId.set(slot.id, {
                      ...slot,
                      mosaic: {
                        ...slot.mosaic,
                        ...current?.mosaic,
                      },
                      lastGenerationPrompts: current?.lastGenerationPrompts ?? slot.lastGenerationPrompts,
                      status:
                        current && slotMosaicBusyRef.current.has(current.id)
                          ? current.status
                          : slot.status,
                    });
                  }
                  return dedupeVisualDnaSlotsBySourceDocument(Array.from(byId.values()));
                })(),
              },
            }),
            [BRAIN_STALE_REASON.VISUAL_REFERENCE_CHANGED],
          );
        }
        const pendingCapsules = appendPendingCapsuleImageVisualDnaSlots(assetsSnap).appended;
        const analyzedSlots = appendKnowledgeImageVisualDnaSlots(
          pendingCapsules.length
            ? normalizeProjectAssets({
                ...assetsSnap,
                strategy: {
                  ...assetsSnap.strategy,
                  visualDnaSlots: [...normalizeVisualDnaSlots(assetsSnap.strategy.visualDnaSlots), ...pendingCapsules],
                },
              })
            : assetsSnap,
        ).appended;
        const appended = [...pendingCapsules, ...analyzedSlots];
        if (appended.length) {
          patch(
            (a) => ({
              ...a,
              strategy: {
                ...a.strategy,
                visualDnaSlots: (() => {
                  const live = normalizeVisualDnaSlots(a.strategy.visualDnaSlots);
                  const byId = new Set(live.map((s) => s.id));
                  const byDoc = new Set(live.map((s) => s.sourceDocumentId).filter(Boolean));
                  const merged = [...live];
                  for (const slot of appended) {
                    if (byId.has(slot.id)) continue;
                    const docId = slot.sourceDocumentId?.trim();
                    if (docId && byDoc.has(docId)) continue;
                    merged.push(slot);
                    byId.add(slot.id);
                    if (docId) byDoc.add(docId);
                  }
                  return dedupeVisualDnaSlotsBySourceDocument(merged);
                })(),
              },
            }),
            [BRAIN_STALE_REASON.VISUAL_REFERENCE_CHANGED],
          );
        }
        const latestAssets = normalizeProjectAssets(assetsMetadataRef.current);
        const analysisBySourceDocumentId = new Map(
          (latestAssets.strategy.visualReferenceAnalysis?.analyses ?? [])
            .filter((analysis) => analysis.sourceKind === "knowledge_document")
            .map((analysis) => [analysis.sourceAssetId, analysis]),
        );
        const list = dedupeVisualDnaSlotsBySourceDocument(latestAssets.strategy.visualDnaSlots ?? []);
        const liveBefore = latestAssets.strategy.visualDnaSlots ?? [];
        if (normalizeVisualDnaSlots(liveBefore).length !== list.length) {
          patch((a) => ({
            ...a,
            strategy: {
              ...a.strategy,
              visualDnaSlots: dedupeVisualDnaSlotsBySourceDocument(a.strategy.visualDnaSlots ?? []),
            },
          }));
        }
        const nowMs = Date.now();
        for (const s of list) {
          const hasMosaic = Boolean(s.mosaic?.imageUrl?.trim() || s.mosaic?.s3Path?.trim());
          if (hasMosaic) {
            if (s.status !== "ready" && !slotMosaicBusyRef.current.has(s.id)) {
              patch((a) => ({
                ...a,
                strategy: {
                  ...a.strategy,
                  visualDnaSlots: updateVisualDnaSlot(a.strategy.visualDnaSlots ?? [], s.id, {
                    status: "ready",
                    lastError: undefined,
                    updatedAt: new Date().toISOString(),
                  }),
                },
              }));
            }
            continue;
          }
          const analysis = s.sourceDocumentId ? analysisBySourceDocumentId.get(s.sourceDocumentId) : undefined;
          const analysisStatus = analysis?.analysisStatus ?? (analysis ? "analyzed" : undefined);
          const analysisReady = analysisStatus === "analyzed";
          const sourceDoc = s.sourceDocumentId
            ? latestAssets.knowledge.documents.find((doc) => doc.id === s.sourceDocumentId)
            : undefined;
          const canUseSourceOnlyMosaic =
            Boolean(sourceDoc && resolveBrainSourceScope(sourceDoc) === "capsule") &&
            Boolean(s.sourceImageUrl?.trim() || sourceDoc?.dataUrl?.trim() || sourceDoc?.originalSourceUrl?.trim() || sourceDoc?.s3Path?.trim());
          if (s.status === "generating" && !slotMosaicBusyRef.current.has(s.id)) {
            if (!analysisReady && !canUseSourceOnlyMosaic) {
              patch((a) => ({
                ...a,
                strategy: {
                  ...a.strategy,
                  visualDnaSlots: updateVisualDnaSlot(a.strategy.visualDnaSlots ?? [], s.id, {
                    status: "pending",
                    lastError: undefined,
                    updatedAt: new Date().toISOString(),
                  }),
                },
              }));
              continue;
            }
            if (isVisualDnaSlotGeneratingStale(s, nowMs)) {
              patch((a) => ({
                ...a,
                strategy: {
                  ...a.strategy,
                  visualDnaSlots: updateVisualDnaSlot(a.strategy.visualDnaSlots ?? [], s.id, {
                    status: "failed",
                    lastError: "Generación interrumpida. Pulsa Regenerar para reintentar.",
                    updatedAt: new Date().toISOString(),
                  }),
                },
              }));
              continue;
            }
          }
          if (s.status !== "pending") continue;
          const canAutoGenerateSourceOnly = canUseSourceOnlyMosaic && !analysisReady;
          const canAutoGenerate =
            autoSourceIds.has(VISUAL_DNA_SYNC_AUTO_ALL) ||
            Boolean(s.sourceDocumentId && autoSourceIds.has(s.sourceDocumentId)) ||
            canAutoGenerateSourceOnly;
          if (canAutoGenerate && !analysisReady && !canUseSourceOnlyMosaic) {
            if (s.sourceDocumentId) syncVisualDnaSlotsAutoSourceIdsRef.current.add(s.sourceDocumentId);
            continue;
          }
          if (!canAutoGenerate) continue;
          await runSingleVisualDnaSlotMosaic(s.id);
        }
      } while (syncVisualDnaSlotsRerunRef.current);
    } finally {
      syncVisualDnaSlotsRunningRef.current = false;
    }
  }, [patch, runSingleVisualDnaSlotMosaic]);

  const visualDnaSlotsNorm = useMemo(
    () => dedupeVisualDnaSlotsBySourceDocument(normalizeVisualDnaSlots(assets.strategy.visualDnaSlots)),
    [assets.strategy.visualDnaSlots],
  );
  const visualDnaSlotsDisplay = useMemo(() => {
    const docsById = new Map(assets.knowledge.documents.map((doc) => [doc.id, doc]));
    return visualDnaSlotsNorm.map((slot) => {
      const doc = slot.sourceDocumentId ? docsById.get(slot.sourceDocumentId) : undefined;
      const sourceS3Path =
        slot.sourceS3Path?.trim() ||
        doc?.s3Path?.trim() ||
        tryExtractKnowledgeFilesKeyFromUrl(slot.sourceImageUrl ?? "") ||
        undefined;
      const sourceImageUrl = slot.sourceImageUrl?.trim() || doc?.dataUrl?.trim() || doc?.originalSourceUrl?.trim() || undefined;
      const mosaicS3Path =
        slot.mosaic.s3Path?.trim() || tryExtractKnowledgeFilesKeyFromUrl(slot.mosaic.imageUrl ?? "") || undefined;
      if (
        sourceS3Path === slot.sourceS3Path &&
        sourceImageUrl === slot.sourceImageUrl &&
        mosaicS3Path === slot.mosaic.s3Path
      ) {
        return slot;
      }
      return (
        normalizeVisualDnaSlots([
          {
            ...slot,
            ...(sourceImageUrl ? { sourceImageUrl } : {}),
            ...(sourceS3Path ? { sourceS3Path } : {}),
            mosaic: {
              ...slot.mosaic,
              ...(mosaicS3Path ? { s3Path: mosaicS3Path } : {}),
            },
          },
        ])[0] ?? slot
      );
    });
  }, [assets.knowledge.documents, visualDnaSlotsNorm]);

  useEffect(() => {
    const slotsWithMosaicButNotReady = visualDnaSlotsNorm.filter(
      (slot) =>
        !slotMosaicBusyRef.current.has(slot.id) &&
        slot.status !== "ready" &&
        Boolean(slot.mosaic?.imageUrl?.trim() || slot.mosaic?.s3Path?.trim()),
    );
    if (!slotsWithMosaicButNotReady.length) return;
    patch((a) => ({
      ...a,
      strategy: {
        ...a.strategy,
        visualDnaSlots: slotsWithMosaicButNotReady.reduce(
          (acc, slot) =>
            updateVisualDnaSlot(acc, slot.id, {
              status: "ready",
              lastError: undefined,
              updatedAt: new Date().toISOString(),
            }),
          a.strategy.visualDnaSlots ?? [],
        ),
      },
    }));
  }, [patch, visualDnaSlotsNorm]);

  const analysisStatusBySourceDocumentId = useMemo(() => {
    const out: Record<string, "queued" | "pending" | "analyzing" | "analyzed" | "failed" | undefined> = {};
    for (const row of assets.strategy.visualReferenceAnalysis?.analyses ?? []) {
      if (row.sourceKind !== "knowledge_document") continue;
      out[row.sourceAssetId] = row.analysisStatus;
    }
    return out;
  }, [assets.strategy.visualReferenceAnalysis?.analyses]);

  /** Clave estable para sync de slots (evita bucles al cambiar solo `visualDnaSlots`). */
  const visualSlotSyncKey = useMemo(() => {
    const imgDocs = assets.knowledge.documents
      .filter((d) => d.mime.startsWith("image/") || d.type === "image" || d.format === "image")
      .map((d) => `${d.id}:${resolveBrainSourceScope(d)}:${d.s3Path ? "s3" : ""}:${d.dataUrl ? "d" : ""}:${d.originalSourceUrl ? "u" : ""}`);
    const ax = assets.strategy.visualReferenceAnalysis?.analyses ?? [];
    const axSig = ax.map((a) => `${a.sourceAssetId}:${a.analysisStatus ?? ""}`).join(",");
    return `${imgDocs.join(",")}|${axSig}`;
  }, [assets.knowledge.documents, assets.strategy.visualReferenceAnalysis?.analyses]);

  const visualCapsuleSyncKey = useMemo(() => {
    const capsuleDocs = assets.knowledge.documents
      .filter((d) => isKnowledgeImageDoc(d) && resolveBrainSourceScope(d) === "capsule")
      .map((d) => `${d.id}:${d.name}:${d.uploadedAt ?? ""}:${d.dataUrl ? "d" : ""}:${d.originalSourceUrl ?? ""}`)
      .join("|");
    const slots = normalizeVisualDnaSlots(assets.strategy.visualDnaSlots)
      .map((s) => `${s.id}:${s.sourceDocumentId ?? ""}:${s.status}:${s.updatedAt ?? ""}:${s.mosaic?.imageUrl ? "m" : ""}`)
      .join("|");
    return `${capsuleDocs}::${slots}`;
  }, [assets.knowledge.documents, assets.strategy.visualDnaSlots]);

  const visualCapsuleLastAppliedRef = useRef<string>("");
  useEffect(() => {
    const nextCapsules = reconcileVisualCapsulesFromAssets(assets);
    const current = JSON.stringify(assets.strategy.visualCapsules ?? []);
    const next = JSON.stringify(nextCapsules);
    if (current === next) return;
    const applyKey = `${visualCapsuleSyncKey}::${next}`;
    if (visualCapsuleLastAppliedRef.current === applyKey) return;
    visualCapsuleLastAppliedRef.current = applyKey;
    patch((a) => ({
      ...a,
      strategy: {
        ...a.strategy,
        visualCapsules: nextCapsules.length ? nextCapsules : undefined,
      },
    }));
  }, [assets, patch, visualCapsuleSyncKey]);

  const handleRegenerateVisualDnaSlot = useCallback(
    (slotId: string) => void runSingleVisualDnaSlotMosaic(slotId, { force: true }),
    [runSingleVisualDnaSlotMosaic],
  );

  const handleDeleteVisualDnaSlot = useCallback(
    (slotId: string) => {
      let keysToDelete: string[] = [];
      patch((a) => {
        const slots = normalizeVisualDnaSlots(a.strategy.visualDnaSlots ?? []);
        const victim = slots.find((s) => s.id === slotId);
        const docId = victim?.sourceDocumentId?.trim();
        const doc = docId ? a.knowledge.documents.find((d) => d.id === docId) : undefined;
        const deletesCapsuleSource = Boolean(doc && resolveBrainSourceScope(doc) === "capsule");
        if (victim) {
          const maybeKeys = [
            deletesCapsuleSource ? doc?.s3Path : undefined,
            victim.mosaic?.s3Path,
            victim.people?.same?.s3Path,
            victim.people?.similar?.s3Path,
            victim.objects?.same?.s3Path,
            victim.objects?.similar?.s3Path,
            victim.environments?.same?.s3Path,
            victim.environments?.similar?.s3Path,
            victim.textures?.same?.s3Path,
            victim.textures?.similar?.s3Path,
          ];
          keysToDelete = [...new Set(maybeKeys.filter((k): k is string => typeof k === "string" && k.startsWith("knowledge-files/")))];
        }
        const nextDocuments = deletesCapsuleSource && docId
          ? a.knowledge.documents.filter((d) => d.id !== docId)
          : a.knowledge.documents;
        const nextAnalyses =
          docId && a.strategy.visualReferenceAnalysis
            ? a.strategy.visualReferenceAnalysis.analyses.filter((row) => row.sourceAssetId !== docId)
            : undefined;
        const nextVisualReferenceAnalysis =
          nextAnalyses && a.strategy.visualReferenceAnalysis
            ? {
                ...a.strategy.visualReferenceAnalysis,
                analyses: nextAnalyses,
                aggregated: aggregateVisualPatterns(nextAnalyses),
                lastAnalyzedAt: new Date().toISOString(),
              }
            : a.strategy.visualReferenceAnalysis;
        const knowledgeDocIds = new Set(nextDocuments.map((d) => d.id));
        const prevSup = normalizeVisualDnaSlotSuppressedSourceIds(
          a.strategy.visualDnaSlotSuppressedSourceIds,
          knowledgeDocIds,
        );
        const nextSup =
          !deletesCapsuleSource && docId && knowledgeDocIds.has(docId) && !prevSup.includes(docId)
            ? [...prevSup, docId]
            : prevSup;
        return {
          ...a,
          knowledge: {
            ...a.knowledge,
            documents: nextDocuments,
          },
          strategy: {
            ...a.strategy,
            visualDnaSlots: removeVisualDnaSlot(slots, slotId),
            visualReferenceAnalysis: nextVisualReferenceAnalysis,
            visualCapsules:
              deletesCapsuleSource && docId
                ? (a.strategy.visualCapsules ?? []).filter((capsule) => capsule.sourceImageId !== docId)
                : a.strategy.visualCapsules,
            visualDnaSlotSuppressedSourceIds: nextSup.length > 0 ? nextSup : undefined,
          },
        };
      });
      if (keysToDelete.length) fireAndForgetDeleteS3Keys(keysToDelete);
    },
    [patch],
  );

  const handleRenameVisualDnaSlot = useCallback(
    (slotId: string, label: string) => {
      patch((a) => ({
        ...a,
        strategy: {
          ...a.strategy,
          visualDnaSlots: updateVisualDnaSlot(a.strategy.visualDnaSlots ?? [], slotId, {
            label: label.slice(0, 240),
            updatedAt: new Date().toISOString(),
          }),
        },
      }));
    },
    [patch],
  );

  /** Slots ADN por imagen: sincronizar al cambiar el inventario visual (no hace falta abrir la pestaña de referencias). */
  useEffect(() => {
    const t = window.setTimeout(() => {
      void syncVisualDnaSlotsAndGenerateMosaics();
    }, 1000);
    return () => window.clearTimeout(t);
  }, [visualSlotSyncKey, syncVisualDnaSlotsAndGenerateMosaics]);

  const pendingVisualAnalysisCount = useMemo(() => {
    const refIds = new Set(collectVisualImageAssetRefs(assets).map((r) => r.id));
    const analyzed = new Set(assets.strategy.visualReferenceAnalysis?.analyses.map((a) => a.sourceAssetId) ?? []);
    return [...refIds].filter((id) => !analyzed.has(id)).length;
  }, [assets]);

  const isVisualMockAnalyzer = useMemo(() => {
    const lp = visualLayer?.lastVisionProviderId;
    if (lp === "mock") return true;
    if (lp === "openai-vision" || lp === "gemini-vision") return false;
    const v = (visualLayer?.analyzerVersion ?? "").toLowerCase();
    return v.length === 0 || v.startsWith("mock");
  }, [visualLayer?.analyzerVersion, visualLayer?.lastVisionProviderId]);

  const patchVisualAnalysisOverride = useCallback(
    (sourceAssetId: string, override: BrainVisualImageUserOverride | undefined) => {
      onVisualReferenceAnalysisDirty?.();
      patch(
        (a) => {
          const layer = a.strategy.visualReferenceAnalysis ?? { analyses: [] };
          const list = layer.analyses.map((row) => {
            if (row.sourceAssetId !== sourceAssetId) return row;
            if (override === undefined) {
              const rest = { ...row };
              delete rest.userVisualOverride;
              return rest as BrainVisualImageAnalysis;
            }
            return { ...row, userVisualOverride: override };
          });
          const aggregated = aggregateVisualPatterns(list);
          return {
            ...a,
            strategy: {
              ...a.strategy,
              visualReferenceAnalysis: {
                ...layer,
                analyses: list,
                aggregated,
              },
            },
          };
        },
        [BRAIN_STALE_REASON.VISUAL_REFERENCE_CHANGED],
      );
    },
    [patch, onVisualReferenceAnalysisDirty],
  );

  const removeVisualReferenceFromGeneralLook = useCallback(
    (sourceAssetId: string) => {
      onVisualReferenceAnalysisDirty?.();
      patch(
        (a) => {
          const layer = a.strategy.visualReferenceAnalysis ?? { analyses: [] };
          const list = layer.analyses.map((row) =>
            row.sourceAssetId === sourceAssetId ? { ...row, userVisualOverride: "EXCLUDED" as const } : row,
          );
          const prevGeneral = a.strategy.visualGeneralLook ?? {};
          const excluded = Array.from(
            new Set([...(prevGeneral.excludedReferenceSourceAssetIds ?? []), sourceAssetId].filter(Boolean)),
          );
          return {
            ...a,
            strategy: {
              ...a.strategy,
              visualReferenceAnalysis: {
                ...layer,
                analyses: list,
                aggregated: aggregateVisualPatterns(list),
              },
              visualGeneralLook: {
                ...prevGeneral,
                excludedReferenceSourceAssetIds: excluded,
                updatedAt: new Date().toISOString(),
              },
            },
          };
        },
        [BRAIN_STALE_REASON.VISUAL_REFERENCE_CHANGED],
      );
      showToast("Referencia retirada del LOOK general.", "success");
    },
    [onVisualReferenceAnalysisDirty, patch, showToast],
  );

  const removeDiscoveredBrandAsset = useCallback(
    (assetId: string) => {
      patch(
        (a) => {
          const prevGeneral = a.strategy.visualGeneralLook ?? {};
          const excluded = Array.from(
            new Set([...(prevGeneral.excludedDiscoveredBrandAssetIds ?? []), assetId].filter(Boolean)),
          );
          return {
            ...a,
            strategy: {
              ...a.strategy,
              visualGeneralLook: {
                ...prevGeneral,
                discoveredBrandAssets: (prevGeneral.discoveredBrandAssets ?? []).filter((asset) => asset.id !== assetId),
                excludedDiscoveredBrandAssetIds: excluded,
                updatedAt: new Date().toISOString(),
              },
            },
          };
        },
        [BRAIN_STALE_REASON.BRAND_PALETTE_CHANGED, BRAIN_STALE_REASON.VISUAL_REFERENCE_CHANGED],
      );
      onVisualReferenceAnalysisDirty?.();
      showToast("Activo descubierto retirado del LOOK general.", "success");
    },
    [onVisualReferenceAnalysisDirty, patch, showToast],
  );

  const handleRegenerateGeneralLookMosaic = useCallback(async () => {
    if (visualGeneralMosaicBusy) return;
    const baseRaw = normalizeProjectAssets(assetsMetadataRef.current);
    let hydrated = baseRaw;
    try {
      hydrated = await hydrateKnowledgeImageDocumentsWithViewUrlsClient(baseRaw);
    } catch {
      hydrated = baseRaw;
    }
    const refs = collectVisualImageAssetRefs(hydrated);
    const byId = new Map((hydrated.strategy.visualReferenceAnalysis?.analyses ?? []).map((a) => [a.sourceAssetId, a]));
    const rows = refs
      .map((ref) => ({ ref, analysis: byId.get(ref.id) ?? null }))
      .filter((row) => isGeneralLookEligibleReference(hydrated, row.ref.id))
      .filter((row) => !isVisualReferenceExcludedFromGeneralLook(hydrated, row.ref.id, row.analysis));
    const withImages = rows.filter((row) => row.ref.imageUrlForVision?.trim());
    const textualVisualSignals = hydrated.knowledge.documents
      .filter((doc) => resolveBrainSourceScope(doc) !== "capsule")
      .filter((doc) => !hydrated.strategy.visualGeneralLook?.excludedReferenceSourceAssetIds?.includes(doc.id))
      .map((doc) => ({ doc, signals: readDocumentVisualSignals(doc) }))
      .filter((row): row is { doc: KnowledgeDocumentEntry; signals: { summary: string; colors: string[] } } => Boolean(row.signals))
      .slice(0, 10);
    if (!withImages.length && !textualVisualSignals.length) {
      showToast("No hay referencias visuales ni señales de documento para regenerar el LOOK general.", "info");
      return;
    }

    setVisualGeneralMosaicBusy(true);
    try {
      const analyses = rows.map((row) => row.analysis).filter((a): a is BrainVisualImageAnalysis => Boolean(a));
      const aggregated = analyses.length ? aggregateVisualPatterns(analyses) : null;
      const payload = buildNanoBananaBrainVisualDnaCollagePayload({ rows, aggregated });
      const discovered = deriveDiscoveredBrandAssets(hydrated, rows);
      const activeDiscovered = discovered.filter(
        (asset) => !(hydrated.strategy.visualGeneralLook?.excludedDiscoveredBrandAssetIds ?? []).includes(asset.id),
      );
      const brandBlock = activeDiscovered.length
        ? [
            "IMAGEN DE MARCA DESCUBIERTA (integrar de forma abstracta, sin inventar texto):",
            ...activeDiscovered.slice(0, 16).map((asset) =>
              asset.kind === "color"
                ? `- Color ${asset.hex ?? asset.value} desde ${asset.sourceName ?? asset.label}.`
                : `- Logo/forma de marca desde ${asset.sourceName ?? asset.label}; no redibujes texto pequeño ilegible.`,
            ),
          ].join("\n")
        : "";
      const textualSignalsBlock = textualVisualSignals.length
        ? [
            "SEÑALES VISUALES EXTRAÍDAS DE DOCUMENTOS/PDFS/BRAND BOOKS (también cuentan para el LOOK general):",
            ...textualVisualSignals.map(({ doc, signals }) =>
              `- ${doc.name}: ${signals.summary || "sin resumen textual"}${signals.colors.length ? ` · colores ${signals.colors.join(", ")}` : ""}`,
            ),
          ].join("\n")
        : "";
      const prompt = [
        "Modo LOOK general: sintetiza todas las referencias visuales incluidas en una dirección global.",
        "Debe verse como un mosaico ADN global con héroe, personas, objetos, texturas, entornos y paleta.",
        brandBlock,
        textualSignalsBlock,
        payload.prompt,
      ]
        .filter(Boolean)
        .join("\n\n");
      const json = await geminiGenerateWithServerProgress(
        {
          prompt,
          images: payload.images,
          aspect_ratio: "1:1",
          resolution: "1k",
          model: "flash31",
          thinking: false,
          geminiClientContext: "brain_visual_dna_collage",
        },
        () => {},
      );
      const output = json.output?.trim();
      if (!output) throw new Error("Salida vacía del generador");
      const fingerprint = [
        computeBrainVisualDnaCollageFingerprint(rows),
        ...textualVisualSignals.map(({ doc, signals }) => `${doc.id}:${doc.analyzedAt ?? ""}:${signals.summary}:${signals.colors.join(",")}`),
      ].join("|docSignals:");
      patch(
        (a) => {
          const layer = a.strategy.visualReferenceAnalysis ?? { analyses: [] };
          const prevGeneral = a.strategy.visualGeneralLook ?? {};
          return {
            ...a,
            strategy: {
              ...a.strategy,
              visualReferenceAnalysis: {
                ...layer,
                aggregated: aggregateVisualPatterns(layer.analyses ?? []),
                dnaCollageImageDataUrl: output,
                dnaCollageSourceFingerprint: fingerprint,
                dnaCollageGeneratedAt: new Date().toISOString(),
              },
              visualGeneralLook: {
                ...prevGeneral,
                discoveredBrandAssets: activeDiscovered,
                updatedAt: new Date().toISOString(),
              },
            },
          };
        },
        [BRAIN_STALE_REASON.VISUAL_REFERENCE_CHANGED],
      );
      onVisualReferenceAnalysisDirty?.();
      showToast("Mosaico de LOOK general regenerado.", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "No se pudo regenerar el LOOK general.", "error");
    } finally {
      setVisualGeneralMosaicBusy(false);
    }
  }, [onVisualReferenceAnalysisDirty, patch, showToast, visualGeneralMosaicBusy]);

  const runVisualReferenceReanalysis = useCallback(
    (
      baseAssets: ReturnType<typeof normalizeProjectAssets>,
      extraStaleReasons?: string[],
    ) => {
      const pid = (projectId?.trim() || "__local__").trim();
      const nextLayer = reanalyzeVisualReferences(pid, baseAssets);
      setStrategy(
        { visualReferenceAnalysis: nextLayer },
        [BRAIN_STALE_REASON.VISUAL_REFERENCE_CHANGED, ...(extraStaleReasons ?? [])],
      );
      return nextLayer;
    },
    [projectId, setStrategy],
  );

  const handleReanalyzeVisualRefs = useCallback(async (opts?: {
    assetsSnapshot?: ProjectAssetsMetadata;
    autoGenerateSourceDocumentIds?: string[];
  }) => {
    setVisualReanalyzing(true);
    setVisualReanalyzeDiagnostics([]);
    const requestAssetsRaw = opts?.assetsSnapshot ?? assetsMetadataRef.current;
    const base = normalizeProjectAssets(requestAssetsRaw);
    try {
      const pid = (projectId?.trim() || "__local__").trim();
      const debug = process.env.NODE_ENV === "development";
      const res = await fetch("/api/spaces/brain/visual/reanalyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: pid, assets: compactAssetsForVisualRequest(base), debug }),
      });
      const json = (await readResponseJson<{
        visualReferenceAnalysis?: ProjectAssetsMetadata["strategy"]["visualReferenceAnalysis"];
        brandVisualDna?: ProjectAssetsMetadata["strategy"]["brandVisualDna"];
        provider?: string;
        brandWriteBlocked?: boolean;
        diagnostics?: VisualReanalyzeDiagnosticRow[];
        batch?: { candidatesCreated?: number };
        error?: string;
      }>(res, "brain/visual/reanalyze")) ?? { error: "Sin respuesta JSON" };
      if (res.ok && json.visualReferenceAnalysis) {
        const nextVisualLayer = json.visualReferenceAnalysis;
        patch((a) => {
          const canMergeBrandVisualDna = canWriteBrainScope("brand", a);
          const derived = buildVisualStyleFromVisionAnalyses(nextVisualLayer.analyses ?? []);
          const visualStyle = derived
            ? mergeVisualStyleWithVisionDerivedDescriptions(a.strategy.visualStyle, derived)
            : a.strategy.visualStyle;
          let meta = touchBrainMetaAfterVisualAnalysis(a.brainMeta, {
            synthesizedBrandVisualDna: Boolean(json.brandVisualDna && canMergeBrandVisualDna),
          });
          if (json.provider === "mock") {
            meta = markBrainStale(meta, [BRAIN_STALE_REASON.REMOTE_ANALYSIS_FAILED_FALLBACK_USED]);
          }
          return {
            ...a,
            strategy: {
              ...a.strategy,
              visualReferenceAnalysis: preserveGeneratedVisualCollage(nextVisualLayer, a.strategy.visualReferenceAnalysis),
              visualStyle,
              ...(json.brandVisualDna && canMergeBrandVisualDna ? { brandVisualDna: json.brandVisualDna } : {}),
            },
            brainMeta: meta,
          };
        });
        onVisualReferenceAnalysisDirty?.();
        if (json.brandWriteBlocked || (brandLocked && json.brandVisualDna)) {
          showToast(BRAIN_BRAND_LOCKED_MESSAGE, "info");
        }
        if (json.provider === "mock" || json.provider === "gemini-vision" || json.provider === "openai-vision") {
          setServerVisionProviderId(json.provider);
          setServerVisionProbeDone(true);
        }
        if (debug && Array.isArray(json.diagnostics)) {
          setVisualReanalyzeDiagnostics(json.diagnostics);
        }
        if (json.provider === "mock") {
          showToast("Análisis simulado. Conecta Gemini/OpenAI Vision para análisis real.", "info");
        } else if (json.provider === "openai-vision" || json.provider === "gemini-vision") {
          const n = json.visualReferenceAnalysis.analyses?.filter(
            (a) => a.fallbackUsed || a.visionProviderId === "mock" || a.analysisStatus === "failed",
          ).length;
          const total = json.visualReferenceAnalysis.analyses?.length ?? 0;
          if (n && total) {
            showToast(
              `Visión remota conectada. ${n} de ${total} imagen${total === 1 ? "" : "es"} usaron mock o fallback; revisa cada fila.`,
              "info",
            );
          } else {
            showToast("Análisis visual real conectado con Gemini/OpenAI.", "success");
          }
        } else {
          showToast("Análisis visual actualizado.", "success");
        }
        return;
      }
      runVisualReferenceReanalysis(base, [BRAIN_STALE_REASON.REMOTE_ANALYSIS_FAILED_FALLBACK_USED]);
      onVisualReferenceAnalysisDirty?.();
      showToast(
        json.error
          ? `${json.error} · Análisis simulado. Conecta Gemini/OpenAI Vision para análisis real.`
          : "Visión remota no disponible; análisis simulado. Conecta Gemini/OpenAI Vision para análisis real.",
        "info",
      );
    } catch {
      try {
        runVisualReferenceReanalysis(base, [BRAIN_STALE_REASON.REMOTE_ANALYSIS_FAILED_FALLBACK_USED]);
        onVisualReferenceAnalysisDirty?.();
      } catch {
        /* ignore */
      }
      showToast(
        "No se pudo reanalizar con el servidor; análisis simulado. Conecta Gemini/OpenAI Vision para análisis real.",
        "error",
      );
    } finally {
      setVisualReanalyzing(false);
      void syncVisualDnaSlotsAndGenerateMosaics({
        autoGenerate: Boolean(opts?.autoGenerateSourceDocumentIds?.length),
        sourceDocumentIds: opts?.autoGenerateSourceDocumentIds,
      });
    }
  }, [brandLocked, projectId, runVisualReferenceReanalysis, showToast, onVisualReferenceAnalysisDirty, patch, syncVisualDnaSlotsAndGenerateMosaics]);

  const handleSaveVisualAnalysis = useCallback(async () => {
    if (!onSaveProjectFromBrain) {
      showToast("Usa «Guardar proyecto» en la barra del espacio para persistir el análisis.", "info");
      return;
    }
    const ok = await onSaveProjectFromBrain();
    if (ok) showToast("Proyecto guardado; el análisis visual quedó persistido.", "success");
    else showToast("No se pudo guardar el proyecto.", "error");
  }, [onSaveProjectFromBrain, showToast]);

  const handleQueueVisualLearnings = useCallback(async () => {
    if (!projectId?.trim()) {
      showToast("Guarda el proyecto con sesión iniciada para enviar aprendizajes a revisión.", "error");
      return;
    }
    const base = normalizeProjectAssets(assetsMetadataRef.current);
    let layer = base.strategy.visualReferenceAnalysis;
    if (!layer?.analyses?.length) {
      layer = reanalyzeVisualReferences(projectId.trim(), base);
      setStrategy({ visualReferenceAnalysis: layer }, [BRAIN_STALE_REASON.VISUAL_REFERENCE_CHANGED]);
      onVisualReferenceAnalysisDirty?.();
    }
    const analyses = layer.analyses;
    const agg = aggregateVisualPatterns(analyses);
    const candidates = createVisualLearningCandidates(projectId.trim(), analyses, agg);
    if (!candidates.length) {
      showToast("No hay candidatos visuales que encolar.", "info");
      return;
    }
    setVisualQueueBusy(true);
    try {
      const res = await fetch("/api/spaces/brain/learning/candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: projectId.trim(),
          workspaceId: workspaceId?.trim() || undefined,
          candidates,
          brainVersion: getBrainVersion(base.brainMeta),
          sourceAnalysisId: base.strategy.visualReferenceAnalysis?.lastAnalyzedAt,
          createdFromAnalysisVersion: base.strategy.visualReferenceAnalysis?.analyzerVersion,
        }),
      });
      const json = await readResponseJson<{ error?: string }>(res, "brain/learning/candidates");
      if (!res.ok) {
        showToast(json?.error ?? "No se pudieron crear las sugerencias.", "error");
        return;
      }
      await loadPendingLearningsStable();
      setActiveTab("review");
      showToast("Aprendizajes visuales enviados a «Por revisar».", "success");
    } catch {
      showToast("No se pudieron crear las sugerencias.", "error");
    } finally {
      setVisualQueueBusy(false);
    }
  }, [projectId, workspaceId, showToast, setStrategy, loadPendingLearningsStable, onVisualReferenceAnalysisDirty]);

  const filteredFactsForGeneration = useMemo(
    () =>
      assets.strategy.factsAndEvidence.filter((f) => {
        const verificationOk =
          factsVerificationFilter === "all" ||
          (factsVerificationFilter === "verified" && f.verified) ||
          (factsVerificationFilter === "interpreted" && f.interpreted);
        const strengthOk = factsStrengthFilter === "all" || f.strength === factsStrengthFilter;
        return verificationOk && strengthOk;
      }),
    [assets.strategy.factsAndEvidence, factsStrengthFilter, factsVerificationFilter],
  );

  const onLogoPick = useCallback(
    async (slot: LogoSlotId, file: File) => {
      if (!file.type.startsWith("image/")) {
        showToast("Usa una imagen (PNG, JPG, WebP o SVG).", "error");
        return;
      }
      try {
        const dataUrl = await readFileDataUrl(file, MAX_LOGO_BYTES);
        setBrand(slot === "positive" ? { logoPositive: dataUrl } : { logoNegative: dataUrl });
      } catch (e) {
        if ((e as Error).message === "FILE_TOO_LARGE") {
          showToast(`El logo supera ${Math.round(MAX_LOGO_BYTES / 1024 / 1024)} MB.`, "error");
        } else {
          showToast("No se pudo leer el archivo.", "error");
        }
      }
    },
    [setBrand, showToast],
  );

  const onLogoClear = useCallback(
    (slot: LogoSlotId) => {
      setBrand(slot === "positive" ? { logoPositive: null } : { logoNegative: null });
    },
    [setBrand],
  );

  const runKnowledgeIngestPump = useCallback(async () => {
    if (knowledgeIngestPumpRunningRef.current) return;
    knowledgeIngestPumpRunningRef.current = true;
    setKnowledgePipelineBusy(true);
    setMessage({ text: "", type: "" });
    setKnowledgePipelineDetail("");
    try {
      while (knowledgeIngestQueueRef.current.length > 0) {
        setKnowledgePipelineQueued(knowledgeIngestQueueRef.current.length);
        const job = knowledgeIngestQueueRef.current.shift()!;
        setKnowledgePipelineQueued(knowledgeIngestQueueRef.current.length);
        try {
          if (job.kind === "upload") {
            const nFiles = job.files.length;
            const nImages = job.files.filter((f) => f.type.startsWith("image/")).length;
            const semanticScope = job.brainSourceScope ?? (job.scope === "core" ? "brand" : "project");
            const blocked = getBrainScopeWriteBlockReason(semanticScope, normalizeProjectAssets(assetsMetadataRef.current));
            if (blocked) {
              setKnowledgePipelineDetail(blocked);
              showToast(blocked, "info");
              continue;
            }
            const scopeLabel =
              semanticScope === "brand"
                ? "Marca"
                : semanticScope === "capsule"
                  ? "Looks visuales"
                  : "Proyecto";
            const imgHint = nImages > 0 ? ` · ${nImages} imagen${nImages === 1 ? "" : "es"}` : "";
            setKnowledgePipelineDetail(
              `Subiendo ${nFiles} archivo${nFiles === 1 ? "" : "s"} al pozo de ${scopeLabel}${imgHint}…`,
            );
            const formData = new FormData();
            job.files.forEach((f) => formData.append("file", f));
            formData.append("scope", job.scope);
            if (job.scope === "context") formData.append("contextKind", "general");
            const response = await fetch("/api/spaces/brain/knowledge/upload", {
              method: "POST",
              body: formData,
            });
            const data = await readResponseJson<{
              message?: string;
              documents?: KnowledgeDocumentEntry[];
              rejected?: Array<{ name?: string; reason?: string }>;
              pdfVisualDiagnostics?: Array<{
                name?: string;
                pageRenderCount?: number;
                extractedImageCount?: number;
                uploadedVisualCount?: number;
                renderError?: string;
              }>;
              error?: string;
            }>(response, "POST /api/spaces/brain/knowledge/upload");
            if (!response.ok) throw new Error(data?.error || "Error subiendo archivos");
            const pdfDiagnostics = data?.pdfVisualDiagnostics ?? [];
            const pdfRenderFailed = pdfDiagnostics.find(
              (row) => (row.pageRenderCount ?? 0) === 0 && (row.extractedImageCount ?? 0) > 0,
            );
            const added = (data?.documents || []).map((doc) => ({
              ...doc,
              brainSourceScope: semanticScope,
              scope: semanticScope === "brand" ? "core" : "context",
              contextKind: semanticScope === "project" || semanticScope === "capsule" ? "referencia" : doc.contextKind,
            })) satisfies KnowledgeDocumentEntry[];
            if (added.length) {
              const pdfSummary = pdfDiagnostics.length
                ? ` · PDF visual: ${pdfDiagnostics
                    .map((row) => `${row.pageRenderCount ?? 0} pág. + ${row.extractedImageCount ?? 0} img.`)
                    .join(", ")}`
                : "";
              setKnowledgePipelineDetail(
                `Servidor aceptó ${added.length} documento(s)${pdfSummary}. Guardando en el pozo y enlazando con el proyecto…`,
              );
            }
            const meta = normalizeProjectAssets(assetsMetadataRef.current);
            const nextDocs = [...meta.knowledge.documents, ...added];
            const addedImages = added.some((d) => (d.mime || "").toLowerCase().startsWith("image/"));
            let assetsForVisualIngest: ProjectAssetsMetadata | null = null;
            if (addedImages) {
              setKnowledgePipelineDetail(
                "Hay imágenes nuevas: actualizando inventario visual y referencias locales antes del análisis…",
              );
              patch(
                (a) => {
                  const mergedDocs = [...a.knowledge.documents, ...added];
                  const temp: ProjectAssetsMetadata = { ...a, knowledge: { ...a.knowledge, documents: mergedDocs } };
                  const pid = (projectId?.trim() || "__local__").trim();
                  const nextBase = {
                    ...a,
                    knowledge: { ...a.knowledge, documents: mergedDocs },
                    strategy: {
                      ...a.strategy,
                      visualReferenceAnalysis: reanalyzeVisualReferences(pid, temp),
                    },
                  };
                  const capsuleSlots =
                    semanticScope === "capsule"
                      ? appendPendingCapsuleImageVisualDnaSlots(normalizeProjectAssets(nextBase)).nextSlots
                      : nextBase.strategy.visualDnaSlots;
                  const nextBaseWithSlots = normalizeProjectAssets({
                    ...nextBase,
                    strategy: { ...nextBase.strategy, visualDnaSlots: capsuleSlots },
                  });
                  const nextAssets = normalizeProjectAssets({
                    ...nextBaseWithSlots,
                    strategy: {
                      ...nextBaseWithSlots.strategy,
                      visualCapsules:
                        semanticScope === "capsule"
                          ? reconcileVisualCapsulesFromAssets(nextBaseWithSlots)
                          : nextBaseWithSlots.strategy.visualCapsules,
                    },
                  });
                  assetsForVisualIngest = nextAssets;
                  return nextAssets;
                },
                [BRAIN_STALE_REASON.NEW_IMAGE_UPLOADED, BRAIN_STALE_REASON.VISUAL_REFERENCE_CHANGED],
              );
            } else {
              setKnowledge({ documents: nextDocs }, [BRAIN_STALE_REASON.NEW_DOCUMENT_UPLOADED]);
            }
            const skipped = data?.rejected?.length || 0;
            if ((data?.documents?.length || 0) === 0 && skipped > 0) {
              showToast(`Ningún archivo compatible. ${skipped} omitido(s).`, "error");
            } else if (skipped > 0) {
              showToast(`${data?.message || "Archivos subidos"} (${skipped} omitido(s)).`, "info");
            } else {
              showToast(data?.message || "Archivos subidos", "success");
            }
            if (pdfRenderFailed) {
              showToast(
                `PDF subido, pero no se han renderizado páginas visuales${
                  pdfRenderFailed.renderError ? `: ${pdfRenderFailed.renderError}` : "."
                }`,
                "error",
              );
            }
            if (added.length > 0) {
              if (semanticScope === "capsule" && addedImages) {
                setKnowledgePipelineDetail("Looks visuales: analizando cápsula visual con visión remota…");
                try {
                  await handleReanalyzeVisualRefs({
                    assetsSnapshot:
                      assetsForVisualIngest ??
                      normalizeProjectAssets({
                        ...meta,
                        knowledge: { ...meta.knowledge, documents: nextDocs },
                      }),
                    autoGenerateSourceDocumentIds: added.map((doc) => doc.id),
                  });
                  setKnowledgePipelineDetail("Looks visuales actualizados.");
                } catch {
                  setKnowledgePipelineDetail("No se pudo completar el análisis visual. Puedes reintentarlo con Regenerar.");
                }
              } else {
                if (addedImages) visionAfterKnowledgeIngestRef.current = true;
                knowledgeIngestQueueRef.current.push({ kind: "analyze" });
                setKnowledgePipelineQueued(knowledgeIngestQueueRef.current.length);
                const q = knowledgeIngestQueueRef.current.length;
                setKnowledgePipelineDetail(
                  `Encolando análisis de contenido (quedan ${q} paso${q === 1 ? "" : "s"} en esta cola)…`,
                );
              }
            } else if (skipped > 0) {
              setKnowledgePipelineDetail("Ningún archivo entró al pozo (formato o tamaño). Revisa el aviso.");
            } else {
              setKnowledgePipelineDetail("Subida completada: no hay documentos nuevos que analizar.");
            }
          } else if (job.kind === "url") {
            const snap = normalizeProjectAssets(assetsMetadataRef.current);
            if (snap.knowledge.urls.includes(job.url)) {
              setKnowledgePipelineDetail("Esa URL ya está en el pozo; se omite.");
              showToast("Esa URL ya está en la lista.", "info");
              continue;
            }
            const host = (() => {
              try {
                return new URL(job.url).hostname;
              } catch {
                return "URL";
              }
            })();
            setKnowledgePipelineDetail(
              `Extrayendo contenido de ${host} (${job.scope === "core" ? "Marca" : "Proyecto"})…`,
            );
            const semanticScope = job.brainSourceScope ?? (job.scope === "core" ? "brand" : "project");
            const blocked = getBrainScopeWriteBlockReason(semanticScope, normalizeProjectAssets(assetsMetadataRef.current));
            if (blocked) {
              setKnowledgePipelineDetail(blocked);
              showToast(blocked, "info");
              continue;
            }
            const response = await fetch("/api/spaces/brain/knowledge/url", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                url: job.url,
                scope: job.scope,
                contextKind: job.scope === "context" ? "general" : undefined,
              }),
            });
            const data = await readResponseJson<{ error?: string; document?: KnowledgeDocumentEntry; documents?: KnowledgeDocumentEntry[] }>(
              response,
              "POST /api/spaces/brain/knowledge/url",
            );
            if (!response.ok) throw new Error(data?.error || "Error al procesar URL");
            const rawUrlDocs = data?.documents?.length ? data.documents : data?.document ? [data.document] : [];
            const urlDocs = rawUrlDocs.map((doc) =>
              ({
                  ...doc,
                  brainSourceScope: semanticScope,
                  scope: semanticScope === "brand" ? "core" : "context",
                  contextKind: semanticScope === "project" ? "referencia" : doc.contextKind,
                } satisfies KnowledgeDocumentEntry),
            );
            const urlIsImage =
              urlDocs.some((doc) =>
                String(doc.mime || "").toLowerCase().startsWith("image/") ||
                doc.format === "image" ||
                doc.type === "image",
              );
            setKnowledge(
              {
                urls: [...snap.knowledge.urls, job.url],
                documents: urlDocs.length ? [...snap.knowledge.documents, ...urlDocs] : snap.knowledge.documents,
              },
              [
                BRAIN_STALE_REASON.URL_ADDED,
                ...(urlIsImage ? [BRAIN_STALE_REASON.NEW_IMAGE_UPLOADED] : []),
              ],
            );
            if (job.scope === "core") setUrlDraftCore("");
            else setUrlDraftContext("");
            showToast("URL añadida con éxito", "success");
            if (urlIsImage) visionAfterKnowledgeIngestRef.current = true;
            knowledgeIngestQueueRef.current.push({ kind: "analyze" });
            setKnowledgePipelineQueued(knowledgeIngestQueueRef.current.length);
            const qAfterUrl = knowledgeIngestQueueRef.current.length;
            setKnowledgePipelineDetail(
              `URL integrada. Encolando análisis del pozo (${qAfterUrl} paso${qAfterUrl === 1 ? "" : "s"})…`,
            );
            if (urlIsImage && urlDocs.length) {
              const pid = (projectId?.trim() || "__local__").trim();
              patch(
                (a) => {
                  const temp: ProjectAssetsMetadata = normalizeProjectAssets(a);
                  const nextBase = {
                    ...a,
                    strategy: {
                      ...a.strategy,
                      visualReferenceAnalysis: reanalyzeVisualReferences(pid, temp),
                    },
                  };
                  return {
                    ...nextBase,
                    strategy: {
                      ...nextBase.strategy,
                      visualCapsules:
                        semanticScope === "capsule"
                          ? reconcileVisualCapsulesFromAssets(normalizeProjectAssets(nextBase))
                          : nextBase.strategy.visualCapsules,
                    },
                  };
                },
                [BRAIN_STALE_REASON.NEW_IMAGE_UPLOADED, BRAIN_STALE_REASON.VISUAL_REFERENCE_CHANGED],
              );
              void syncVisualDnaSlotsAndGenerateMosaics();
            }
          } else {
            const runVisionAfter = visionAfterKnowledgeIngestRef.current;
            const snap = normalizeProjectAssets(assetsMetadataRef.current);
            const pendingDocs = snap.knowledge.documents.filter((d) => d.status !== "Analizado").length;
            setKnowledgePipelineDetail(
              `Analizando conocimiento con IA: ${snap.knowledge.documents.length} documento(s) en pozo · ${pendingDocs} pendiente(s) de “Analizado”…`,
            );
            let mergedForVision: ProjectAssetsMetadata = snap;
            try {
              const response = await fetch("/api/spaces/brain/knowledge/analyze", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  documents: snap.knowledge.documents.map(compactBrainDocumentForKnowledgeAnalyze),
                  strategy: compactStrategyForBrainApi(snap.strategy),
                  brainMeta: snap.brainMeta,
                }),
              });
              const data = await readResponseJson<{
                error?: string;
                message?: string;
                documents?: KnowledgeDocumentEntry[];
                corporateContext?: string;
                strategy?: ProjectAssetsMetadata["strategy"];
                brainMeta?: ProjectAssetsMetadata["brainMeta"];
              }>(response, "POST /api/spaces/brain/knowledge/analyze");
              if (!response.ok) throw new Error(data?.error || "Error analizando documentos");
              setKnowledgePipelineDetail(
                "Fusionando resultados con tu estrategia (voz, hechos, ADN editorial, reglas seguras)…",
              );
              const mergedDocs = data?.documents || snap.knowledge.documents;
              const mergedCc = data?.corporateContext || "";
              setKnowledge({
                documents: mergedDocs,
                corporateContext: mergedCc,
              });
              if (data?.strategy) {
                const canMergeStrategy = canWriteBrainScope("brand", snap);
                const derived = buildVisualStyleFromVisionAnalyses(snap.strategy.visualReferenceAnalysis?.analyses);
                const baseVs = data.strategy.visualStyle ?? defaultBrainVisualStyle();
                const visualStyle = derived ? mergeVisualStyleWithVisionDerivedDescriptions(baseVs, derived) : baseVs;
                const liveForStrategy = normalizeProjectAssets(assetsMetadataRef.current);
                const strategyForApply = mergeKnowledgeStrategyPreservingVisualPipelines(
                  { ...data.strategy, visualStyle },
                  liveForStrategy.strategy,
                );
                if (canMergeStrategy) {
                  setStrategy(strategyForApply);
                } else {
                  showToast(BRAIN_BRAND_LOCKED_MESSAGE, "info");
                }
                mergedForVision = normalizeProjectAssets({
                  ...snap,
                  knowledge: { ...snap.knowledge, documents: mergedDocs, corporateContext: mergedCc },
                  strategy: canMergeStrategy ? strategyForApply : liveForStrategy.strategy,
                  ...(data.brainMeta
                    ? { brainMeta: normalizeBrainMeta({ ...data.brainMeta, brandLocked: Boolean(snap.brainMeta?.brandLocked) }) }
                    : {}),
                });
                if (data.brainMeta) {
                  patch((a) => ({
                    ...a,
                    brainMeta: normalizeBrainMeta({ ...data.brainMeta, brandLocked: a.brainMeta?.brandLocked }),
                  }));
                }
                if (!briefPersonaId && data.strategy.personas[0]?.id) {
                  setBriefPersonaId(data.strategy.personas[0].id);
                }
              } else {
                mergedForVision = normalizeProjectAssets({
                  ...snap,
                  knowledge: { ...snap.knowledge, documents: mergedDocs, corporateContext: mergedCc },
                  ...(data?.brainMeta
                    ? { brainMeta: normalizeBrainMeta({ ...data.brainMeta, brandLocked: Boolean(snap.brainMeta?.brandLocked) }) }
                    : {}),
                });
                if (data?.brainMeta) {
                  patch((a) => ({
                    ...a,
                    brainMeta: normalizeBrainMeta({ ...data.brainMeta, brandLocked: a.brainMeta?.brandLocked }),
                  }));
                }
              }
              showToast(data?.message || "Análisis completado", "success");
            } finally {
              if (runVisionAfter) {
                visionAfterKnowledgeIngestRef.current = false;
                setKnowledgePipelineDetail(
                  "Imágenes en el pozo: analizando referencias con visión remota (Gemini/OpenAI o simulado si no hay API)…",
                );
                await handleReanalyzeVisualRefs({ assetsSnapshot: mergedForVision });
                setKnowledgePipelineDetail("Referencias visuales actualizadas.");
              }
            }
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          showToast(msg, "error");
          setMessage({ text: msg, type: "error" });
        }
      }
    } finally {
      knowledgeIngestPumpRunningRef.current = false;
      setKnowledgePipelineBusy(false);
      setKnowledgePipelineQueued(0);
      setKnowledgePipelineDetail("");
    }
  }, [
    briefPersonaId,
    handleReanalyzeVisualRefs,
    patch,
    projectId,
    setBriefPersonaId,
    setKnowledge,
    setStrategy,
    setUrlDraftContext,
    setUrlDraftCore,
    showToast,
    syncVisualDnaSlotsAndGenerateMosaics,
  ]);

  const enqueueKnowledgeUpload = useCallback(
    (scope: "core" | "context", files: File[], brainSourceScope?: KnowledgeDocumentEntry["brainSourceScope"]) => {
      if (!files.length) return;
      knowledgeIngestQueueRef.current.push({ kind: "upload", scope, files: [...files], brainSourceScope });
      setKnowledgePipelineQueued(knowledgeIngestQueueRef.current.length);
      void runKnowledgeIngestPump();
    },
    [runKnowledgeIngestPump],
  );

  const handleAddUrl = useCallback(
    (scope: "core" | "context", brainSourceScope?: KnowledgeDocumentEntry["brainSourceScope"]) => {
      const draft = scope === "core" ? urlDraftCore : urlDraftContext;
      const normalized = tryNormalizeUrl(draft);
      if (!normalized) {
        showToast("Introduce una URL válida (https://…)", "error");
        return;
      }
      knowledgeIngestQueueRef.current.push({ kind: "url", scope, url: normalized, brainSourceScope });
      setKnowledgePipelineQueued(knowledgeIngestQueueRef.current.length);
      void runKnowledgeIngestPump();
    },
    [runKnowledgeIngestPump, showToast, urlDraftContext, urlDraftCore],
  );

  /** Encola análisis del pozo (p. ej. tras borrar o vaciar); la UI ya no expone botón manual. */
  const enqueueKnowledgeAnalyzeJob = useCallback(() => {
    knowledgeIngestQueueRef.current.push({ kind: "analyze" });
    setKnowledgePipelineQueued(knowledgeIngestQueueRef.current.length);
    void runKnowledgeIngestPump();
  }, [runKnowledgeIngestPump]);

  const handleOpenOriginal = useCallback(
    async (doc: KnowledgeDocumentEntry) => {
      if (doc.format === "url" && doc.originalSourceUrl) {
        window.open(doc.originalSourceUrl, "_blank");
        return;
      }
      if (!doc.s3Path) {
        showToast("Documento legacy sin ruta S3", "error");
        return;
      }
      try {
        const resp = await fetch(`/api/spaces/brain/knowledge/view?key=${encodeURIComponent(doc.s3Path)}`);
        if (!resp.ok) throw new Error("Error generating view URL");
        const parsed = await readResponseJson<{ url?: string }>(resp, "GET /api/spaces/brain/knowledge/view");
        if (!parsed?.url) throw new Error("Error generating view URL");
        window.open(parsed.url, "_blank");
      } catch {
        showToast("No se pudo abrir el archivo original", "error");
      }
    },
    [showToast],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      const doc = assets.knowledge.documents.find((d) => d.id === id);
      if (doc && resolveBrainSourceScope(doc) === "brand" && !guardBrandWrite("No se puede eliminar una fuente de Marca.")) {
        return;
      }
      if (!confirm("¿Seguro que quieres eliminar este documento?")) return;
      setIsDeleting(id);
      try {
        if (doc?.s3Path) fireAndForgetDeleteS3Keys([doc.s3Path]);
        const remaining = assets.knowledge.documents.filter((d) => d.id !== id);
        const isImg = (d: KnowledgeDocumentEntry) =>
          d.type === "image" ||
          d.format === "image" ||
          (typeof d.mime === "string" && d.mime.toLowerCase().startsWith("image/"));
        const deletedWasImage = doc ? isImg(doc) : false;
        const anyRemainingImage = remaining.some(isImg);
        setKnowledge({ documents: remaining }, [BRAIN_STALE_REASON.NEW_DOCUMENT_UPLOADED]);
        if (deletedWasImage || anyRemainingImage) visionAfterKnowledgeIngestRef.current = true;
        enqueueKnowledgeAnalyzeJob();
        showToast("Documento eliminado; actualizando conocimiento…", "success");
      } catch {
        showToast("No se pudo eliminar el documento", "error");
      } finally {
        setIsDeleting(null);
      }
    },
    [assets.knowledge.documents, enqueueKnowledgeAnalyzeJob, guardBrandWrite, setKnowledge, showToast],
  );

  const handleClearKnowledgeSources = useCallback(() => {
    if (!guardBrandWrite("No se puede vaciar el pozo mientras Marca esté bloqueada.")) return;
    if (
      !confirm(
        "Se vaciará la bandeja de fuentes: se borrarán todos los documentos e imágenes subidos, los enlaces guardados y el resumen corporativo extraído. El ADN visual persistido no se borra aquí. ¿Continuar?",
      )
    ) {
      return;
    }
    const keys = assets.knowledge.documents.map((d) => d.s3Path).filter((k): k is string => Boolean(k?.trim()));
    if (keys.length) fireAndForgetDeleteS3Keys(keys);
    const hadImages = assets.knowledge.documents.some(
      (d) =>
        d.type === "image" ||
        d.format === "image" ||
        (typeof d.mime === "string" && d.mime.toLowerCase().startsWith("image/")),
    );
    setKnowledge({ documents: [], urls: [], corporateContext: "" }, [BRAIN_STALE_REASON.BRAIN_RESET]);
    if (hadImages) visionAfterKnowledgeIngestRef.current = true;
    enqueueKnowledgeAnalyzeJob();
    showToast("Pozo vaciado; actualizando conocimiento…", "success");
  }, [assets.knowledge.documents, enqueueKnowledgeAnalyzeJob, guardBrandWrite, setKnowledge, showToast]);

  const handleResetBrainCompletely = useCallback(() => {
    if (!guardBrandWrite("No se puede reiniciar Brain completo mientras Marca esté bloqueada.")) return;
    if (knowledgeIngestLocked) {
      showToast("Espera a que termine la cola de ingesta antes de reiniciar.", "info");
      return;
    }
    if (
      !confirm(
        "Esto reiniciará marca, documentos, referencias visuales, estrategia y chat local del Brain. Los aprendizajes pendientes asociados al proyecto pueden seguir existiendo en el servidor hasta que se revisen o eliminen desde «Aprendizajes». Se intentarán eliminar los archivos de la bandeja en almacenamiento. No hay deshacer. ¿Continuar?",
      )
    ) {
      return;
    }
    const keys = assets.knowledge.documents.map((d) => d.s3Path).filter((k): k is string => Boolean(k?.trim()));
    if (keys.length) fireAndForgetDeleteS3Keys(keys);
    knowledgeIngestQueueRef.current = [];
    visionAfterKnowledgeIngestRef.current = false;
    knowledgeIngestPumpRunningRef.current = false;
    setKnowledgePipelineBusy(false);
    setKnowledgePipelineQueued(0);
    const cleared = defaultProjectAssets();
    onAssetsMetadataChange({
      ...cleared,
      brainMeta: { ...normalizeBrainMeta(cleared.brainMeta), lastResetAt: new Date().toISOString() },
    });
    onBrainAssetsFullReset?.();
    setChatMessages([
      {
        id: "brain-chat-welcome",
        role: "assistant",
        text:
          "Soy Brain Copilot. Preguntame sobre el contenido que hayas subido y analizado. Si falta contexto, te sugerire que documentos o URLs subir.",
      },
    ]);
    setExpandedDocs(new Set());
    setEditingDocId(null);
    setVisualReanalyzeDiagnostics([]);
    setMessage({ text: "", type: "" });
    showToast("Brain reiniciado en memoria. Guarda el proyecto en el espacio para persistir.", "success");
  }, [
    assets.knowledge.documents,
    guardBrandWrite,
    knowledgeIngestLocked,
    onAssetsMetadataChange,
    onBrainAssetsFullReset,
    showToast,
  ]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedDocs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const startEditing = useCallback((doc: KnowledgeDocumentEntry) => {
    setEditingDocId(doc.id);
    try {
      setEditForm(JSON.parse(doc.extractedContext || "{}"));
    } catch {
      setEditForm({ raw: doc.extractedContext || "" });
    }
  }, []);

  const handleSaveAdn = useCallback(
    async (docId: string) => {
      try {
        const doc = assets.knowledge.documents.find((d) => d.id === docId);
        if (doc && resolveBrainSourceScope(doc) === "brand" && !guardBrandWrite("No se puede editar una fuente de Marca.")) {
          return;
        }
        const response = await fetch("/api/spaces/brain/knowledge/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: docId, context: editForm, documents: assets.knowledge.documents }),
        });
        const data = await readResponseJson<{
          error?: string;
          documents?: KnowledgeDocumentEntry[];
          corporateContext?: string;
        }>(response, "POST /api/spaces/brain/knowledge/update");
        if (!response.ok) throw new Error(data?.error || "No se pudo guardar ADN");
        setKnowledge(
          {
            documents: data?.documents || assets.knowledge.documents,
            corporateContext: data?.corporateContext || assets.knowledge.corporateContext || "",
          },
          [BRAIN_STALE_REASON.STRATEGY_MANUALLY_CHANGED],
        );
        setEditingDocId(null);
        showToast("Cerebro corporativo actualizado", "success");
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Error guardando ADN", "error");
      }
    },
    [assets.knowledge.corporateContext, assets.knowledge.documents, editForm, guardBrandWrite, setKnowledge, showToast],
  );

  const submitChatQuestion = useCallback(async () => {
    const question = chatInput.trim();
    if (!question || chatLoading) return;

    const userMsg: BrainChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      text: question,
    };
    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput("");
    setChatLoading(true);

    try {
      const response = await fetch("/api/spaces/brain/knowledge/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, documents: assets.knowledge.documents }),
      });

      const data = await readResponseJson<{
        error?: string;
        answer?: string;
        sources?: Array<{ id: string; name: string; score: number }>;
        suggestedUploads?: string[];
      }>(response, "POST /api/spaces/brain/knowledge/chat");

      if (!response.ok) throw new Error(data?.error || "No se pudo responder la pregunta.");

      const aiMsg: BrainChatMessage = {
        id: `a-${Date.now()}`,
        role: "assistant",
        text: data?.answer || "No pude responder con el contexto actual.",
        sources: data?.sources || [],
        suggestedUploads: data?.suggestedUploads || [],
      };
      setChatMessages((prev) => [...prev, aiMsg]);
    } catch (error) {
      const aiErr: BrainChatMessage = {
        id: `a-err-${Date.now()}`,
        role: "assistant",
        text:
          error instanceof Error ? error.message : "No pude completar la respuesta. Intenta de nuevo.",
      };
      setChatMessages((prev) => [...prev, aiErr]);
    } finally {
      setChatLoading(false);
    }
  }, [assets.knowledge.documents, chatInput, chatLoading]);

  const addVoiceExample = useCallback(() => {
    if (!guardBrandWrite("No se puede editar voz de Marca.")) return;
    const text = voiceText.trim();
    if (!text) return;
    const next: BrainVoiceExample = {
      id: crypto.randomUUID(),
      kind: voiceKind,
      text,
      label:
        voiceKind === "approved_voice"
          ? "Aprobado"
          : voiceKind === "forbidden_voice"
          ? "Prohibido"
          : undefined,
    };
    setStrategy({ voiceExamples: [...assets.strategy.voiceExamples, next] }, [BRAIN_STALE_REASON.BRAND_VOICE_CHANGED]);
    setVoiceText("");
  }, [assets.strategy.voiceExamples, guardBrandWrite, setStrategy, voiceKind, voiceText]);

  const removeVoiceExample = useCallback(
    (id: string) => {
      if (!guardBrandWrite("No se puede editar voz de Marca.")) return;
      setStrategy({ voiceExamples: assets.strategy.voiceExamples.filter((v) => v.id !== id) }, [
        BRAIN_STALE_REASON.BRAND_VOICE_CHANGED,
      ]);
    },
    [assets.strategy.voiceExamples, guardBrandWrite, setStrategy],
  );

  const addTagItem = useCallback(
    (kind: "taboo" | "approved", value: string) => {
      if (!guardBrandWrite("No se pueden editar frases de Marca.")) return;
      const text = value.trim();
      if (!text) return;
      if (kind === "taboo") {
        if (assets.strategy.tabooPhrases.includes(text)) return;
        setStrategy({ tabooPhrases: [...assets.strategy.tabooPhrases, text] }, [BRAIN_STALE_REASON.BRAND_VOICE_CHANGED]);
      } else {
        if (assets.strategy.approvedPhrases.includes(text)) return;
        setStrategy({ approvedPhrases: [...assets.strategy.approvedPhrases, text] }, [
          BRAIN_STALE_REASON.BRAND_VOICE_CHANGED,
        ]);
      }
    },
    [assets.strategy.approvedPhrases, assets.strategy.tabooPhrases, guardBrandWrite, setStrategy],
  );

  const removeTagItem = useCallback(
    (kind: "taboo" | "approved", idx: number) => {
      if (!guardBrandWrite("No se pueden editar frases de Marca.")) return;
      if (kind === "taboo") {
        setStrategy({ tabooPhrases: assets.strategy.tabooPhrases.filter((_, i) => i !== idx) }, [
          BRAIN_STALE_REASON.BRAND_VOICE_CHANGED,
        ]);
      } else {
        setStrategy({ approvedPhrases: assets.strategy.approvedPhrases.filter((_, i) => i !== idx) }, [
          BRAIN_STALE_REASON.BRAND_VOICE_CHANGED,
        ]);
      }
    },
    [assets.strategy.approvedPhrases, assets.strategy.tabooPhrases, guardBrandWrite, setStrategy],
  );

  const addStringListItem = useCallback(
    (kind: "languageTraits" | "syntaxPatterns" | "preferredTerms" | "forbiddenTerms", value: string) => {
      if (!guardBrandWrite("No se pueden editar términos o rasgos de Marca.")) return;
      const text = value.trim();
      if (!text) return;
      const current = assets.strategy[kind] || [];
      if (current.includes(text)) return;
      setStrategy({ [kind]: [...current, text] }, [BRAIN_STALE_REASON.STRATEGY_MANUALLY_CHANGED]);
    },
    [assets.strategy, guardBrandWrite, setStrategy],
  );

  const removeStringListItem = useCallback(
    (kind: "languageTraits" | "syntaxPatterns" | "preferredTerms" | "forbiddenTerms", idx: number) => {
      if (!guardBrandWrite("No se pueden editar términos o rasgos de Marca.")) return;
      const current = assets.strategy[kind] || [];
      setStrategy({ [kind]: current.filter((_, i) => i !== idx) }, [BRAIN_STALE_REASON.STRATEGY_MANUALLY_CHANGED]);
    },
    [assets.strategy, guardBrandWrite, setStrategy],
  );

  const addChannelIntensity = useCallback(() => {
    if (!guardBrandWrite("No se puede editar intensidad de Marca.")) return;
    const channel = channelIntensityName.trim();
    if (!channel) return;
    const intensity = Math.max(0, Math.min(100, Number(channelIntensityValue) || 0));
    const others = (assets.strategy.channelIntensity || []).filter(
      (x) => x.channel.toLowerCase() !== channel.toLowerCase(),
    );
    setStrategy({ channelIntensity: [...others, { channel, intensity }] }, [BRAIN_STALE_REASON.STRATEGY_MANUALLY_CHANGED]);
    setChannelIntensityName("");
    setChannelIntensityValue(60);
  }, [assets.strategy.channelIntensity, channelIntensityName, channelIntensityValue, guardBrandWrite, setStrategy]);

  const removeChannelIntensity = useCallback(
    (idx: number) => {
      if (!guardBrandWrite("No se puede editar intensidad de Marca.")) return;
      setStrategy({ channelIntensity: assets.strategy.channelIntensity.filter((_, i) => i !== idx) }, [
        BRAIN_STALE_REASON.STRATEGY_MANUALLY_CHANGED,
      ]);
    },
    [assets.strategy.channelIntensity, guardBrandWrite, setStrategy],
  );

  const addPersona = useCallback(() => {
    if (!guardBrandWrite("No se pueden editar personas de Marca.")) return;
    if (!personaName.trim()) return;
    const persona: BrainPersona = {
      id: crypto.randomUUID(),
      name: personaName.trim(),
      pain: personaPain.trim(),
      channel: personaChannel.trim(),
      sophistication: personaSophistication.trim(),
      tags: personaTags
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean),
      objections: personaObjections.split(",").map((x) => x.trim()).filter(Boolean),
      proofNeeded: personaProofNeeded.split(",").map((x) => x.trim()).filter(Boolean),
      attentionTriggers: personaAttentionTriggers.split(",").map((x) => x.trim()).filter(Boolean),
      marketSophistication: personaMarketSophistication.trim() || undefined,
    };
    setStrategy({ personas: [...assets.strategy.personas, persona] }, [BRAIN_STALE_REASON.STRATEGY_MANUALLY_CHANGED]);
    setPersonaName("");
    setPersonaPain("");
    setPersonaChannel("");
    setPersonaSophistication("");
    setPersonaTags("");
    setPersonaObjections("");
    setPersonaProofNeeded("");
    setPersonaAttentionTriggers("");
    setPersonaMarketSophistication("");
  }, [
    assets.strategy.personas,
    personaChannel,
    personaName,
    personaPain,
    personaObjections,
    personaProofNeeded,
    personaAttentionTriggers,
    personaMarketSophistication,
    personaSophistication,
    personaTags,
    guardBrandWrite,
    setStrategy,
  ]);

  const addCatalogPersona = useCallback(
    (persona: BrainPersona) => {
      if (!guardBrandWrite("No se pueden editar personas de Marca.")) return;
      if (assets.strategy.personas.some((p) => p.id === persona.id)) return;
      setStrategy({ personas: [...assets.strategy.personas, persona] }, [BRAIN_STALE_REASON.STRATEGY_MANUALLY_CHANGED]);
      if (!briefPersonaId) setBriefPersonaId(persona.id);
    },
    [assets.strategy.personas, briefPersonaId, guardBrandWrite, setStrategy],
  );

  const removePersona = useCallback(
    (id: string) => {
      if (!guardBrandWrite("No se pueden editar personas de Marca.")) return;
      setStrategy({ personas: assets.strategy.personas.filter((p) => p.id !== id) }, [
        BRAIN_STALE_REASON.STRATEGY_MANUALLY_CHANGED,
      ]);
      if (briefPersonaId === id) setBriefPersonaId("");
    },
    [assets.strategy.personas, briefPersonaId, guardBrandWrite, setStrategy],
  );

  const addFunnelMessage = useCallback(() => {
    if (!guardBrandWrite("No se pueden editar mensajes de Marca.")) return;
    const text = funnelTextDraft.trim();
    if (!text) return;
    setStrategy(
      {
        funnelMessages: [
          ...assets.strategy.funnelMessages,
          { id: crypto.randomUUID(), stage: funnelStageDraft, text },
        ],
      },
      [BRAIN_STALE_REASON.STRATEGY_MANUALLY_CHANGED],
    );
    setFunnelTextDraft("");
  }, [assets.strategy.funnelMessages, funnelStageDraft, funnelTextDraft, guardBrandWrite, setStrategy]);

  const removeFunnelMessage = useCallback(
    (id: string) => {
      if (!guardBrandWrite("No se pueden editar mensajes de Marca.")) return;
      setStrategy({ funnelMessages: assets.strategy.funnelMessages.filter((m) => m.id !== id) }, [
        BRAIN_STALE_REASON.STRATEGY_MANUALLY_CHANGED,
      ]);
    },
    [assets.strategy.funnelMessages, guardBrandWrite, setStrategy],
  );

  const addMessageBlueprint = useCallback(() => {
    if (!guardBrandWrite("No se pueden editar claims de Marca.")) return;
    const claim = messageClaimDraft.trim();
    if (!claim) return;
    setStrategy(
      {
        messageBlueprints: [
          ...assets.strategy.messageBlueprints,
          {
            id: crypto.randomUUID(),
            claim,
            support: messageSupportDraft.trim(),
            audience: messageAudienceDraft.trim(),
            channel: messageChannelDraft.trim(),
            stage: funnelStageDraft,
            cta: messageCtaDraft.trim(),
            evidence: messageEvidenceDraft
              .split(",")
              .map((x) => x.trim())
              .filter(Boolean),
          },
        ],
      },
      [BRAIN_STALE_REASON.STRATEGY_MANUALLY_CHANGED],
    );
    setMessageClaimDraft("");
    setMessageSupportDraft("");
    setMessageAudienceDraft("");
    setMessageChannelDraft("");
    setMessageCtaDraft("");
    setMessageEvidenceDraft("");
  }, [
    assets.strategy.messageBlueprints,
    funnelStageDraft,
    messageAudienceDraft,
    messageChannelDraft,
    messageClaimDraft,
    messageCtaDraft,
    messageEvidenceDraft,
    messageSupportDraft,
    guardBrandWrite,
    setStrategy,
  ]);

  const removeMessageBlueprint = useCallback(
    (id: string) => {
      if (!guardBrandWrite("No se pueden editar claims de Marca.")) return;
      setStrategy(
        {
          messageBlueprints: assets.strategy.messageBlueprints.filter((m) => m.id !== id),
        },
        [BRAIN_STALE_REASON.STRATEGY_MANUALLY_CHANGED],
      );
    },
    [assets.strategy.messageBlueprints, guardBrandWrite, setStrategy],
  );

  const generateWithBriefing = useCallback(async () => {
    if (!briefObjective.trim() || !briefChannel.trim() || !briefPersonaId || !briefFunnel) {
      showToast("Completa objetivo, canal, persona y etapa del funnel.", "error");
      return;
    }
    setGeneratingPiece(true);
    try {
      const res = await fetch("/api/spaces/brain/content/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          briefing: {
            objective: briefObjective,
            channel: briefChannel,
            personaId: briefPersonaId,
            funnelStage: briefFunnel,
            ask: briefAsk,
          },
          documents: assets.knowledge.documents,
          strategy: assets.strategy,
          officialFacts: filteredFactsForGeneration,
        }),
      });
      const data = await readResponseJson<{
        error?: string;
        internalPrompt?: string;
        draft?: string;
        critique?: string;
        score?: number;
        issues?: string[];
        revised?: string;
        sources?: { core: Array<{ id: string; name: string }>; context: Array<{ id: string; name: string }> };
      }>(res, "POST /api/spaces/brain/content/generate");
      if (!res.ok) throw new Error(data?.error || "No se pudo generar la pieza");
      setGeneratedPreview({
        internalPrompt: data?.internalPrompt || "",
        draft: data?.draft || "",
        critique: data?.critique || "",
        score: typeof data?.score === "number" ? data.score : 50,
        issues: data?.issues || [],
        revised: data?.revised || data?.draft || "",
        sources: data?.sources || { core: [], context: [] },
      });
      showToast("Pieza generada y evaluada por modo crítico.", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error generando pieza", "error");
    } finally {
      setGeneratingPiece(false);
    }
  }, [
    assets.knowledge.documents,
    assets.strategy,
    briefAsk,
    briefChannel,
    briefFunnel,
    briefObjective,
    briefPersonaId,
    filteredFactsForGeneration,
    showToast,
  ]);

  const registerLearning = useCallback(
    (decision: "approved" | "rejected") => {
      if (!guardBrandWrite("No se pueden registrar aprendizajes de Marca.")) return;
      if (!generatedPreview) return;
      const piece: BrainGeneratedPiece = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        objective: briefObjective,
        channel: briefChannel,
        personaId: briefPersonaId,
        funnelStage: briefFunnel,
        prompt: generatedPreview.internalPrompt,
        draft: generatedPreview.draft,
        critique: generatedPreview.critique,
        revised: generatedPreview.revised,
        status: decision,
        notes: pieceFeedbackNote || undefined,
      };
      const approvedPatterns = [...assets.strategy.approvedPatterns];
      const rejectedPatterns = [...assets.strategy.rejectedPatterns];

      const firstLine = (generatedPreview.revised || generatedPreview.draft).split("\n").find((x) => x.trim()) || "";
      const normalized = firstLine.trim().slice(0, 160);
      if (decision === "approved" && normalized) {
        approvedPatterns.push(normalized);
      }
      if (decision === "rejected" && normalized) {
        rejectedPatterns.push(normalized);
      }

      const voiceExamples = [...assets.strategy.voiceExamples];
      voiceExamples.push({
        id: crypto.randomUUID(),
        kind: decision === "approved" ? "good_piece" : "bad_piece",
        text: (generatedPreview.revised || generatedPreview.draft).slice(0, 600),
        label: decision === "approved" ? "Pieza aprobada" : "Pieza rechazada",
      });

      setStrategy(
        {
          generatedPieces: [piece, ...assets.strategy.generatedPieces].slice(0, 60),
          approvedPatterns: [...new Set(approvedPatterns)].slice(0, 120),
          rejectedPatterns: [...new Set(rejectedPatterns)].slice(0, 120),
          voiceExamples,
        },
        [BRAIN_STALE_REASON.STRATEGY_MANUALLY_CHANGED, BRAIN_STALE_REASON.BRAND_VOICE_CHANGED],
      );

      setPieceFeedbackNote("");
      showToast(
        decision === "approved"
          ? "Aprendizaje registrado: patrón aprobado"
          : "Aprendizaje registrado: patrón a evitar",
        "success",
      );
    },
    [
      assets.strategy.approvedPatterns,
      assets.strategy.generatedPieces,
      assets.strategy.rejectedPatterns,
      assets.strategy.voiceExamples,
      guardBrandWrite,
      briefChannel,
      briefFunnel,
      briefObjective,
      briefPersonaId,
      generatedPreview,
      pieceFeedbackNote,
      setStrategy,
      showToast,
    ],
  );

  useEffect(() => {
    if (!open) return;
    document.body.classList.add("nb-studio-open");
    return () => document.body.classList.remove("nb-studio-open");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (personaModalOpen) {
        setPersonaModalOpen(false);
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, personaModalOpen]);

  function renderPendingReviewArticle(row: StoredLearningCandidate) {
    const c = row.candidate;
    const pendingTrace = normalizeBrainDecisionTrace(row.decisionTrace);
    const anchor = resolveLearningPendingAnchorNodeId(row);
    const provUi = getPendingLearningProvenanceUi(row);
    const origin = !anchor
      ? "Sin nodo asignado · revisa la evidencia antes de promover"
      : row.telemetryNodeType
        ? `${labelForBrainNodeSource(row.telemetryNodeType)} · información recibida`
        : "Flujo creativo general";
    const visualNodeBundle = hasVisualLearningReviewBundle(c.evidence.eventCounts);
    const chip = visualNodeBundle ? "Visual / Imagen" : labelForLearningCard(c.type);
    const busy = reviewResolvingId === row.id;
    const whyOpen = reviewEvidenceOpenId === row.id;
    const reasoningOpen = reviewReasoningOpenId === row.id;
    const strength = c.confidence >= 0.75 ? "Fuerte" : c.confidence >= 0.45 ? "Media" : "Débil";
    const example = c.evidence.examples?.[0] ? formatLearningReviewExample(c.evidence.examples[0]) : undefined;
    const suggestedScope = resolveLearningCandidateBrainScope(row);
    const suggestedScopeLabel =
      suggestedScope === "brand" ? "Marca" : suggestedScope === "capsule" ? "Cápsula" : "Proyecto";
    const promoteDisabled = busy || (brandLocked && suggestedScope === "brand");
    return (
      <article
        key={row.id}
        className="flex flex-col gap-3 rounded-[5px] border border-zinc-200 bg-white p-5 shadow-sm"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-800">
            {chip}
          </span>
          <span
            title={provUi.tooltip}
            className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-sky-900"
          >
            {provUi.badge}
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Origen · {origin}</span>
          <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-600">
            Fuerza · {strength}
          </span>
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800">
            Destino sugerido · {suggestedScopeLabel}
          </span>
          {brandLocked && suggestedScope === "brand" ? (
            <span className="rounded-full border border-zinc-300 bg-zinc-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-700">
              Marca bloqueada
            </span>
          ) : null}
          {(c.conflictWithDNA || c.type === "CONTRADICTION") && (
            <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900">
              Revisar con el ADN
            </span>
          )}
        </div>
        <p className="text-[16px] font-semibold leading-snug text-zinc-900">{formatLearningReviewCardHeadline(c.value)}</p>
        {example && (
          <p className="text-[11px] text-zinc-600">
            {example.startsWith("Basado en:") ? (
              <>
                <span className="font-bold text-zinc-800">Basado en:</span>{" "}
                {example.slice("Basado en:".length).trim().length > 220
                  ? `${example.slice("Basado en:".length).trim().slice(0, 217)}…`
                  : example.slice("Basado en:".length).trim()}
              </>
            ) : (
              <>
                <span className="font-bold text-zinc-800">Ejemplo:</span> «
                {example.length > 220 ? `${example.slice(0, 217)}…` : example}»
              </>
            )}
          </p>
        )}
        <button
          type="button"
          onClick={() => setReviewReasoningOpenId(reasoningOpen ? null : row.id)}
          className="flex w-fit items-center gap-1 text-[11px] font-semibold text-zinc-600 hover:text-zinc-900"
        >
          {reasoningOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          {reasoningOpen ? "Ocultar razonamiento" : "Ver razonamiento"}
        </button>
        {reasoningOpen && (
          <p className="rounded-[5px] border border-zinc-100 bg-zinc-50 px-3 py-2 text-[11px] leading-relaxed text-zinc-700">
            {formatLearningReviewReasoning(c.reasoning)}
          </p>
        )}
        <button
          type="button"
          onClick={() => setReviewEvidenceOpenId(whyOpen ? null : row.id)}
          className="flex w-fit items-center gap-1 text-[11px] font-semibold text-violet-700 hover:text-violet-900"
        >
          {whyOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          Ver por qué
        </button>
        {whyOpen && (
          <ul className="list-disc space-y-1 pl-4 text-[11px] leading-snug text-zinc-600">
            {learningReviewDiagnosticBullets(row, {
              visualAnalyses: assets.strategy.visualReferenceAnalysis?.analyses,
            }).map((line, i) => (
              <li key={`${row.id}-why-${i}`}>{line}</li>
            ))}
          </ul>
        )}
        {pendingTrace ? (
          <details className="rounded-[5px] border border-sky-200/80 bg-sky-50/60 px-3 py-2">
            <summary className="cursor-pointer text-[11px] font-semibold text-sky-900">
              Por qué Brain propone esto
            </summary>
            <div className="mt-2 space-y-2 text-[11px] leading-snug text-zinc-700">
              <p>
                <span className="font-semibold text-zinc-900">Tipo:</span> {traceKindLabel(pendingTrace.kind)} ·{" "}
                <span className="font-semibold text-zinc-900">Confianza:</span>{" "}
                {Math.round((pendingTrace.confidence ?? 0) * 100)}%
              </p>
              {pendingTrace.persistenceIntent ? (
                <p className="text-[10px] text-zinc-500">
                  Persistencia: {tracePersistenceIntentLabel(pendingTrace.persistenceIntent)}
                </p>
              ) : null}
              <p>{formatDecisionTraceSummary(pendingTrace.outputSummary.summary)}</p>
              {pendingTrace.inputs.length > 0 ? (
                <p>
                  <span className="font-semibold text-zinc-900">Inputs principales:</span>{" "}
                  {pendingTrace.inputs
                    .slice(0, 6)
                    .map((x) => formatDecisionTraceInputLabel(x.label))
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              ) : null}
              {pendingTrace.outputSummary.warnings?.length ? (
                <p>
                  <span className="font-semibold text-zinc-900">Warnings:</span>{" "}
                  {pendingTrace.outputSummary.warnings.slice(0, 6).join(" · ")}
                </p>
              ) : null}
              {pendingTrace.conflicts?.length ? (
                <p>
                  <span className="font-semibold text-zinc-900">Conflictos:</span>{" "}
                  {pendingTrace.conflicts
                    .slice(0, 4)
                    .map((conflict) => `${conflict.left} vs ${conflict.right} -> ${conflict.resolution}`)
                    .join(" · ")}
                </p>
              ) : null}
              {pendingTrace.discardedSignals?.length ? (
                <p>
                  <span className="font-semibold text-zinc-900">Señales descartadas:</span>{" "}
                  {pendingTrace.discardedSignals
                    .slice(0, 4)
                    .map((signal) => `${signal.summary} (${signal.reason})`)
                    .join(" · ")}
                </p>
              ) : null}
            </div>
          </details>
        ) : null}
        <div className="mt-1 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={promoteDisabled}
            onClick={() => void resolvePendingItem(row, "PROMOTE_TO_DNA")}
            className="rounded-[5px] border border-violet-600 bg-violet-600 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wide text-white disabled:opacity-50"
            title={brandLocked && suggestedScope === "brand" ? "Marca bloqueada: guarda en Proyecto o desbloquea Marca." : undefined}
          >
            {visualNodeBundle ? "Guardar en ADN visual" : "Guardar en ADN"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void resolvePendingItem(row, "KEEP_IN_PROJECT")}
            className="rounded-[5px] border border-zinc-300 bg-white px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wide text-zinc-800 disabled:opacity-50"
          >
            Solo este proyecto
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void resolvePendingItem(row, "SAVE_AS_CONTEXT")}
            className="rounded-[5px] border border-zinc-300 bg-white px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wide text-zinc-800 disabled:opacity-50"
          >
            {visualNodeBundle ? "Guardar como contexto visual" : "Guardar como contexto puntual"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void resolvePendingItem(row, "DISMISS")}
            className="rounded-[5px] border border-zinc-200 bg-zinc-100 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wide text-zinc-600 disabled:opacity-50"
          >
            Descartar
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setActiveTab("voice");
              showToast("Edita en Voz / Mensajes y vuelve aquí para confirmar.", "info");
            }}
            className="rounded-[5px] border border-zinc-300 bg-white px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wide text-zinc-800 disabled:opacity-50"
          >
            Editar antes de guardar
          </button>
        </div>
      </article>
    );
  }

  const existingFormats = Array.from(new Set(assets.knowledge.documents.map((d) => d.format).filter(Boolean)));
  const filterTabs = ["all", "core", "context", ...existingFormats] as string[];
  const docsFiltered = assets.knowledge.documents.filter((d) => {
    if (activeFilter === "all") return true;
    if (activeFilter === "core") return d.scope !== "context";
    if (activeFilter === "context") return d.scope === "context";
    return d.format === activeFilter;
  });

  const analyzedCount = assets.knowledge.documents.filter((d) => d.status === "Analizado").length;
  const selectedPersonaIds = new Set(assets.strategy.personas.map((p) => p.id));
  const personaCatalogRemaining = AUDIENCE_PERSONA_CATALOG.filter((p) => !selectedPersonaIds.has(p.id));

  const skinIdentityScore = computeVisualIdentityScore(assets);
  const skinVisualRefScore = computeVisualRefsHealthScore(
    visualDisposition.realRemoteAnalyzed,
    visualImageRefCount || 0,
  );
  const skinFactsScore = computeFactsSignalsScore(assets);
  const skinNodeLearningScore = computeNodeLearningScore(
    pendingLearnings.length,
    assets.strategy.generatedPieces.length,
  );
  const imageKnowledgeDocs = assets.knowledge.documents.filter(
    (d) =>
      String(d.mime || "")
        .toLowerCase()
        .startsWith("image/") ||
      d.format === "image" ||
      d.type === "image",
  );
  const imageDocCount = imageKnowledgeDocs.length;
  const imageKnowledgeAnalyzed = imageKnowledgeDocs.filter((d) => d.status === "Analizado").length;
  const visualPendingProposals = pendingLearnings.filter(
    (p) => p.candidate.evidence.evidenceSource === "visual_reference",
  ).length;
  const brandSourceDocs = assets.knowledge.documents.filter((d) => resolveBrainSourceScope(d) === "brand");
  const projectSourceDocs = assets.knowledge.documents.filter((d) => resolveBrainSourceScope(d) === "project");
  const capsuleSourceDocs = assets.knowledge.documents.filter((d) => resolveBrainSourceScope(d) === "capsule");
  const visualCapsules = useMemo(() => assets.strategy.visualCapsules ?? [], [assets.strategy.visualCapsules]);
  const resolveBrainVisualImageUrl = useCallback(
    (rawUrl?: string | null) => displayBrainVisualImageUrl(rawUrl),
    [],
  );
  const resolveKnowledgeDocumentPreviewUrl = useCallback(
    (doc: KnowledgeDocumentEntry) => {
      if (!isKnowledgeImageDoc(doc)) return null;
      return (
        resolveBrainVisualImageUrl(doc.dataUrl) ||
        resolveBrainVisualImageUrl(doc.originalSourceUrl) ||
        resolveBrainVisualImageUrl(doc.s3Path) ||
        getKnowledgeDocumentPreviewUrl(doc)
      );
    },
    [resolveBrainVisualImageUrl],
  );
  const archivedVisualCapsules = visualCapsules.filter((c) => c.status === "archived").length;
  const capsuleMetaBySourceDocumentId = useMemo(
    () =>
      Object.fromEntries(
        visualCapsules.map((capsule) => [
          capsule.sourceImageId,
          {
            id: capsule.id,
            status: capsule.status,
            analysisStatus: capsule.analysisStatus,
            lastError: capsule.lastError,
          },
        ]),
      ),
    [visualCapsules],
  );

  const toggleBrandLocked = useCallback(() => {
    patch((a) => ({
      ...a,
      brainMeta: {
        ...normalizeBrainMeta(a.brainMeta),
        brandLocked: !Boolean(a.brainMeta?.brandLocked),
      },
    }));
  }, [patch]);

  const openScopedFilePicker = useCallback(
    (semanticScope: NonNullable<KnowledgeDocumentEntry["brainSourceScope"]>) => {
      if (knowledgeIngestLocked) return;
      if (semanticScope === "brand" && brandLocked) {
        showToast("Marca bloqueada. Puedes usarla, pero no añadir nuevas fuentes.", "info");
        return;
      }
      const input = document.createElement("input");
      input.type = "file";
      input.multiple = true;
      input.accept =
        semanticScope === "capsule"
          ? ".jpg,.jpeg,.png,.webp"
          : ".pdf,.docx,.txt,.md,.rtf,.jpg,.jpeg,.png,.webp";
      input.onchange = () => {
        const files = Array.from(input.files ?? []);
        if (!files.length) return;
        const picked =
          semanticScope === "capsule"
            ? files.filter((file) => file.type.startsWith("image/"))
            : files;
        if (semanticScope === "capsule" && picked.length !== files.length) {
          showToast("Looks visuales solo acepta imágenes.", "info");
        }
        if (!picked.length) return;
        enqueueKnowledgeUpload(semanticScope === "brand" ? "core" : "context", picked, semanticScope);
      };
      input.click();
    },
    [brandLocked, enqueueKnowledgeUpload, knowledgeIngestLocked, showToast],
  );

  const handleDropScopedFiles = useCallback(
    (
      ev: React.DragEvent<HTMLElement>,
      semanticScope: NonNullable<KnowledgeDocumentEntry["brainSourceScope"]>,
    ) => {
      ev.preventDefault();
      setIsDraggingCoreFiles(false);
      setIsDraggingContextFiles(false);
      if (knowledgeIngestLocked) return;
      if (semanticScope === "brand" && brandLocked) {
        showToast("Marca bloqueada. Puedes usarla, pero no añadir nuevas fuentes.", "info");
        return;
      }
      const files = Array.from(ev.dataTransfer.files ?? []);
      const picked =
        semanticScope === "capsule" ? files.filter((file) => file.type.startsWith("image/")) : files;
      if (semanticScope === "capsule" && picked.length !== files.length) {
        showToast("Looks visuales solo acepta imágenes.", "info");
      }
      if (!picked.length) return;
      enqueueKnowledgeUpload(semanticScope === "brand" ? "core" : "context", picked, semanticScope);
    },
    [brandLocked, enqueueKnowledgeUpload, knowledgeIngestLocked, showToast],
  );

  const setVisualCapsuleStatus = useCallback(
    (capsuleId: string, status: VisualCapsuleStatus) => {
      patch((a) => ({
        ...a,
        strategy: {
          ...a.strategy,
          visualCapsules: (a.strategy.visualCapsules ?? []).map((c) =>
            c.id === capsuleId ? { ...c, status, updatedAt: new Date().toISOString() } : c,
          ),
        },
      }));
    },
    [patch],
  );

  if (!open) return null;

  const isAtmosphereMode = activeTab === "overview";
  const brandRecord = assets.brand as Record<string, unknown>;
  const stringFromBrand = (key: string): string | null => {
    const value = brandRecord[key];
    return typeof value === "string" && value.trim() ? value.trim() : null;
  };
  const projectDisplayName =
    stringFromBrand("name") ??
    stringFromBrand("title") ??
    stringFromBrand("brandName") ??
    stringFromBrand("claim") ??
    "Proyecto activo";
  const brandClaim =
    stringFromBrand("claim") ??
    stringFromBrand("descriptor") ??
    stringFromBrand("tagline") ??
    "Atmósfera creativa viva";
  const readyVisualCapsules = visualCapsules.filter((c) => c.analysisStatus === "ready" && c.status !== "archived");
  const partialVisualCapsules = visualCapsules.filter((c) => c.analysisStatus !== "ready" && c.status !== "archived");
  const activePalette = Array.from(
    new Set(
      [
        assets.brand.colorPrimary,
        assets.brand.colorSecondary,
        assets.brand.colorAccent,
      ].filter((hex): hex is string => typeof hex === "string" && /^#?[0-9a-f]{3,8}$/i.test(hex.trim())),
    ),
  )
    .map((hex) => (hex.startsWith("#") ? hex : `#${hex}`))
    .slice(0, 7);
  const paletteForCanvas = activePalette.length
    ? activePalette
    : ["#4f46e5", "#8b5cf6", "#f8fafc", "#111827", "#f59e0b"];
  const recognizedPaletteForCanvas = Array.from(
    new Set(
      [
        ...paletteForCanvas,
        ...activeDiscoveredBrandAssets.map((asset) => asset.hex ?? asset.value),
      ]
        .map(normalizeCanvasHex)
        .filter((hex): hex is string => Boolean(hex)),
    ),
  ).slice(0, 12);
  const brandPrimaryForCanvas =
    typeof assets.brand.colorPrimary === "string" && /^#?[0-9a-f]{3,8}$/i.test(assets.brand.colorPrimary.trim())
      ? assets.brand.colorPrimary.startsWith("#")
        ? assets.brand.colorPrimary
        : `#${assets.brand.colorPrimary}`
      : paletteForCanvas[0];
  const brandBackgroundForCanvas = pickAtmosphereBackgroundColor(recognizedPaletteForCanvas, brandPrimaryForCanvas);
  const brandMosaicUrl = resolveBrainVisualImageUrl(visualLayer?.dnaCollageImageDataUrl);
  const brandLogoUrl = resolveBrainVisualImageUrl(assets.brand.logoPositive) || resolveBrainVisualImageUrl(assets.brand.logoNegative);
  const acceptedTextBubbles = [
    ...assets.strategy.approvedPhrases,
    ...assets.strategy.generatedPieces
      .filter((piece) => piece.status === "approved")
      .map((piece) => piece.revised || piece.draft || piece.objective),
    ...assets.strategy.funnelMessages.map((messageItem) => messageItem.text),
  ]
    .map((text) => text.trim())
    .filter(Boolean)
    .slice(0, 4);
  const canvasTextBubbles = [
    "Mantener consistencia de marca",
    "Escalar producción creativa",
    ...acceptedTextBubbles,
  ].slice(0, 4);
  const toneChips = [
    ...assets.strategy.languageTraits,
    ...assets.strategy.preferredTerms,
  ]
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 6);
  const canvasToneChips = toneChips.length ? toneChips : ["PREMIUM", "EDITORIAL", "HUMANO", "TECNOLÓGICO", "CLARO", "SOBRIO"];
  const connectedLearningLabel =
    brainClients.length > 0
      ? `Aprendiendo de ${brainClients.length} nodo${brainClients.length === 1 ? "" : "s"}: ${brainClients
          .slice(0, 3)
          .map((c) => c.label)
          .join(", ")}${brainClients.length > 3 ? ` +${brainClients.length - 3}` : ""}`
      : "Listo para aprender de Designer y Photoroom";
  const sectionTitleByTab: Record<BrainMainSection, string> = {
    overview: "Atmósfera",
    sources: "Fuentes",
    dna: "ADN activo",
    looks: "Looks visuales",
    visual_refs: "Visual",
    brand_visual_dna: "Síntesis visual",
    knowledge: "Fuentes analizadas",
    connected_nodes: "Nodos conectados",
    review: "Aprendizajes",
    diagnostics: "Diagnóstico",
    voice: "Voz",
    personas: "Audiencias",
    messages: "Mensajes",
    facts: "Hechos",
  };

  const renderBrainAtmosphereCanvas = (compact = false) => (
    <aside className={`relative min-h-0 shrink-0 ${compact ? "w-[23%] min-w-[250px]" : "w-[min(62%,960px)]"}`}>
      <div className={`${compact ? "p-3" : "p-5 lg:p-7"} flex h-full min-h-0 flex-col gap-4`}>
        <div className="flex shrink-0 items-start justify-between gap-3">
          <div className="inline-flex rounded-full border border-white/20 bg-white/10 p-1 text-[10px] font-black uppercase tracking-wide text-white/70 shadow-[0_18px_55px_rgba(0,0,0,0.18)] backdrop-blur-xl">
            {(
              [
                ["fusion", "Fusión activa"],
                ["project", "Proyecto"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setAtmosphereCanvasMode(id)}
                className={`rounded-full px-3 py-1.5 transition ${
                  atmosphereCanvasMode === id ? "bg-white text-zinc-950 shadow-sm" : "hover:bg-white/10 hover:text-white"
                }`}
              >
                {compact ? label.replace("Fusión activa", "Fusión") : label}
              </button>
            ))}
          </div>
          <div title={BRAIN_ADN_COMPLETENESS_TOOLTIP_ES} className="rounded-full border border-white/18 bg-white/10 px-4 py-2 text-right text-white shadow-[0_18px_55px_rgba(0,0,0,0.16)] backdrop-blur-xl">
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/54">ADN activo</p>
            <p className={`${compact ? "text-xl" : "text-3xl"} font-black tabular-nums text-white`}>{adn.total}/100</p>
          </div>
        </div>

        <section className="relative min-h-0 flex-1 overflow-hidden rounded-[32px] border border-white/14 bg-white/[0.055] shadow-[0_28px_90px_rgba(0,0,0,0.26)] backdrop-blur-xl">
          {brandMosaicUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brandMosaicUrl} alt="Mosaico de marca" className="absolute inset-0 h-full w-full object-cover opacity-90" />
          ) : (
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_28%_24%,rgba(255,255,255,0.14),transparent_30%),linear-gradient(135deg,rgba(255,255,255,0.12),rgba(255,255,255,0.02))]" />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-black/22 via-black/8 to-black/56" />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(0deg,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:54px_54px] opacity-20" />

          <div className="relative z-10 flex h-full min-h-0 flex-col justify-between p-4 sm:p-5 lg:p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 rounded-[26px] border border-white/18 bg-black/22 p-3 text-white shadow-[0_20px_60px_rgba(0,0,0,0.22)] backdrop-blur-2xl">
                <div className="flex items-center gap-3">
                  <div className={`${compact ? "h-12 w-12" : "h-16 w-16"} shrink-0 overflow-hidden rounded-[20px] border border-white/30 bg-white shadow-lg`}>
                    {brandLogoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={brandLogoUrl} alt="" className="h-full w-full object-contain p-2" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xl font-black text-zinc-950">
                        {projectDisplayName.slice(0, 1).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className={`${compact ? "text-base" : "text-2xl"} line-clamp-1 font-black tracking-tight text-white`}>{projectDisplayName}</p>
                    <p className="mt-0.5 line-clamp-1 text-[11px] leading-snug text-white/62">{brandClaim}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {recognizedPaletteForCanvas.map((hex) => (
                        <span key={hex} title={hex} className={`${compact ? "h-4 w-4" : "h-5 w-5"} rounded-full border border-white/45 shadow-sm`} style={{ backgroundColor: hex }} />
                      ))}
                      <button
                        type="button"
                        onClick={() => setBrainIdentityEditorOpen((openEditor) => !openEditor)}
                        className="ml-1 inline-flex h-6 items-center gap-1 rounded-full border border-white/20 bg-white/12 px-2 text-[8px] font-black uppercase tracking-wide text-white/86 hover:bg-white/20"
                      >
                        <Edit3 className="h-3 w-3" aria-hidden />
                        Editar
                      </button>
                    </div>
                  </div>
                </div>
                {brainIdentityEditorOpen ? (
                  <div className="mt-3 rounded-[20px] border border-white/18 bg-white/92 p-3 text-zinc-900">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <LogoDropSlot compact label="Logo +" description="Fondos claros" dataUrl={assets.brand.logoPositive} slotId="positive" onPick={onLogoPick} onClear={onLogoClear} />
                      <LogoDropSlot compact label="Logo -" description="Fondos oscuros" dataUrl={assets.brand.logoNegative} slotId="negative" onPick={onLogoPick} onClear={onLogoClear} />
                    </div>
                    <div className="mt-3 grid gap-2">
                      <ColorField compact label="Primario" value={assets.brand.colorPrimary} onChange={(h) => setBrand({ colorPrimary: h })} />
                      <ColorField compact label="Secundario" value={assets.brand.colorSecondary} onChange={(h) => setBrand({ colorSecondary: h })} />
                      <ColorField compact label="Acento" value={assets.brand.colorAccent} onChange={(h) => setBrand({ colorAccent: h })} />
                    </div>
                  </div>
                ) : null}
              </div>

              {!compact ? (
                <button
                  type="button"
                  onClick={() => void handleRegenerateGeneralLookMosaic()}
                  disabled={visualGeneralMosaicBusy}
                  className="inline-flex shrink-0 items-center gap-2 rounded-full border border-white/18 bg-white/12 px-3 py-2 text-[9px] font-black uppercase tracking-wide text-white/82 shadow-[0_18px_50px_rgba(0,0,0,0.18)] backdrop-blur-xl transition hover:bg-white/20 disabled:opacity-50"
                >
                  {visualGeneralMosaicBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden />}
                  Mosaico marca
                </button>
              ) : null}
            </div>

            <div className="grid items-end gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(240px,0.42fr)]">
              <div className="min-w-0">
                <p className="text-[9px] font-black uppercase tracking-[0.22em] text-white/48">LOOK general de marca</p>
                <p className={`${compact ? "text-xl" : "text-4xl"} mt-1 max-w-2xl font-black leading-[0.96] tracking-tight text-white`}>
                  {brandMosaicUrl ? "Mosaico visual activo" : "Mosaico pendiente"}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {canvasTextBubbles.slice(0, compact ? 2 : 3).map((text, idx) => (
                    <span key={`${text}-${idx}`} className="rounded-full border border-white/18 bg-white/12 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-white/78 backdrop-blur-xl">
                      {text}
                    </span>
                  ))}
                </div>
              </div>
              {!compact ? (
                <div className="flex flex-wrap justify-end gap-1.5">
                  {canvasToneChips.slice(0, 6).map((chip) => (
                    <span key={chip} className="rounded-full border border-white/18 bg-black/18 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.14em] text-white/70 backdrop-blur">
                      {chip}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </section>

        {!compact ? (
          <div className="grid shrink-0 gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
            <div className="flex min-w-0 items-center gap-2 overflow-hidden rounded-[24px] border border-white/12 bg-white/[0.06] p-2 backdrop-blur-xl">
              {visualCapsules.slice(0, 4).map((capsule) => {
                const src = resolveBrainVisualImageUrl(capsule.mosaicImageUrl) ?? resolveBrainVisualImageUrl(capsule.sourceImageUrl);
                return (
                  <button
                    key={capsule.id}
                    type="button"
                    onClick={() => setActiveTab("looks")}
                    className="h-16 min-w-[132px] flex-1 overflow-hidden rounded-[18px] border border-white/12 bg-white/10"
                  >
                    {src ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={src} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full items-center justify-center text-[9px] font-black uppercase tracking-wide text-white/40">Look pendiente</span>
                    )}
                  </button>
                );
              })}
              {visualCapsules.length === 0 ? (
                <button
                  type="button"
                  onClick={() => setActiveTab("looks")}
                  className="flex h-16 w-full items-center justify-center rounded-[18px] border border-dashed border-white/18 text-[10px] font-black uppercase tracking-wide text-white/54"
                >
                  Añadir primer look visual
                </button>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => setActiveTab("looks")}
              className="rounded-full border border-white/18 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-wide text-zinc-950 shadow-sm transition hover:bg-white/90"
            >
              Añadir look
            </button>
          </div>
        ) : null}
      </div>
    </aside>
  );

  const brainControlModules: Array<{
    id: string;
    title: string;
    summary: string;
    subtext: string;
    action: string;
    tab: BrainMainSection;
    icon: typeof Brain;
    active: boolean;
    complete?: boolean;
  }> = [
    {
      id: "activeDna",
      title: "ADN ACTIVO",
      summary: `Marca · Proyecto · ${readyVisualCapsules.length} Looks`,
      subtext: "Snapshot de lo que reciben los nodos creativos.",
      action: "Ver snapshot",
      tab: "dna",
      icon: Sparkles,
      active: resolveBrainPrimarySection(activeTab) === "dna" && !["voice", "messages", "personas", "facts"].includes(activeTab),
      complete: adn.total >= 70,
    },
    {
      id: "looks",
      title: "LOOKS VISUALES",
      summary: `${readyVisualCapsules.length} ready · ${partialVisualCapsules.length} parcial · ${archivedVisualCapsules} archivados`,
      subtext: "Cápsulas visuales activas.",
      action: "Ver biblioteca",
      tab: "looks",
      icon: ImageIcon,
      active: activeTab === "looks",
      complete: readyVisualCapsules.length > 0,
    },
    {
      id: "voice",
      title: "VOZ",
      summary: canvasToneChips.slice(0, 3).join(" · "),
      subtext: "Tono, reglas y palabras clave.",
      action: "Ver detalles",
      tab: "voice",
      icon: MessageSquareText,
      active: activeTab === "voice",
      complete: assets.strategy.languageTraits.length > 0 || assets.strategy.voiceExamples.length > 0,
    },
    {
      id: "messages",
      title: "MENSAJES",
      summary: `${assets.strategy.approvedPhrases.length} aceptados · ${assets.strategy.funnelMessages.length} mensajes`,
      subtext: "Claims, mensajes clave y CTA.",
      action: "Revisar",
      tab: "messages",
      icon: Send,
      active: activeTab === "messages",
      complete: assets.strategy.approvedPhrases.length > 0 || assets.strategy.funnelMessages.length > 0,
    },
    {
      id: "sources",
      title: "FUENTES",
      summary: `${assets.knowledge.documents.length} documentos · ${imageDocCount} imágenes · ${assets.knowledge.urls.length} enlaces`,
      subtext: "Todo el conocimiento del proyecto.",
      action: "Ver listado",
      tab: "knowledge",
      icon: BookOpen,
      active: activeTab === "sources" || activeTab === "knowledge",
      complete: assets.knowledge.documents.length > 0 || assets.knowledge.urls.length > 0,
    },
    {
      id: "learnings",
      title: "APRENDIZAJES",
      summary: `${assets.strategy.generatedPieces.length} guardados · ${pendingLearnings.length} por revisar`,
      subtext: visualPendingProposals > 0 ? `${visualPendingProposals} propuesta(s) visuales pendientes.` : "Lo que Brain ha aprendido.",
      action: "Revisar",
      tab: "review",
      icon: Network,
      active: activeTab === "review",
      complete: pendingLearnings.length === 0 && assets.strategy.generatedPieces.length > 0,
    },
    {
      id: "diagnostic",
      title: "DIAGNÓSTICO",
      summary: `ADN ${adn.total}/100 · Visual ${skinVisualRefScore}%`,
      subtext:
        visualImageRefCount > 0
          ? `Identidad ${skinIdentityScore}% · Hechos ${skinFactsScore}% · Nodos ${skinNodeLearningScore}%.`
          : getBrainFreshnessSummary(assets.brainMeta),
      action: "Ver desglose",
      tab: "diagnostics",
      icon: CircleHelp,
      active: resolveBrainPrimarySection(activeTab) === "diagnostics",
      complete: adn.total >= 70,
    },
  ];

  const renderBrainControlPanel = (compact = false) => (
    <aside
      className={`min-h-0 shrink-0 overflow-y-auto overscroll-y-contain p-3 ${
        compact ? "w-[25%] min-w-[270px]" : "w-[35%] min-w-[330px]"
      }`}
    >
      <div className="mb-3 flex items-center justify-between gap-3 px-1">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">Brain Control Panel</p>
          <p className="mt-0.5 text-[12px] font-semibold text-zinc-800">
            {isAtmosphereMode ? "Módulos del ADN vivo" : sectionTitleByTab[activeTab]}
          </p>
        </div>
        {!isAtmosphereMode ? (
          <button
            type="button"
            onClick={() => setActiveTab("overview")}
            className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-zinc-700 hover:bg-zinc-100"
          >
            Atmósfera
          </button>
        ) : null}
      </div>
      <div className="space-y-2">
        {brainControlModules.map((module) => {
          const Icon = module.icon;
          return (
            <button
              key={module.id}
              type="button"
              onClick={() => setActiveTab(module.tab)}
              className={`group w-full rounded-[18px] border px-3 py-2.5 text-left transition hover:-translate-y-0.5 hover:shadow-md ${
                module.active ? "border-violet-200 bg-violet-50/80 shadow-sm" : "border-zinc-200 bg-white hover:border-violet-100"
              }`}
            >
              <div className="flex items-start gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[13px] bg-violet-100 text-violet-700">
                  <Icon className="h-4 w-4" strokeWidth={2} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-900">{module.title}</span>
                    {module.complete ? <span className="h-2 w-2 rounded-full bg-emerald-500" /> : null}
                  </span>
                  <span className="mt-0.5 block line-clamp-1 text-[12px] font-bold text-zinc-800">{module.summary}</span>
                  <span className="mt-0.5 block line-clamp-1 text-[10px] leading-snug text-zinc-500">{module.subtext}</span>
                  <span className="mt-1.5 inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wide text-violet-700">
                    {module.action}
                    <ChevronDown className="-rotate-90 h-3 w-3 transition group-hover:translate-x-0.5" aria-hidden />
                  </span>
                </span>
              </div>
            </button>
          );
        })}
      </div>
      {activeTab === "review" ? (
        <div className="mt-3 rounded-[20px] border border-zinc-200 bg-zinc-50/80 p-3">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">Filtrar aprendizajes</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(
              [
                ["all", "Todos"],
                ["visual", "Visual"],
                ["designer", "Designer"],
                ["photoroom", "Photoroom"],
                ["article", "Artículos"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setReviewSourceFilter(id)}
                className={`rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-wide ${
                  reviewSourceFilter === id
                    ? "border-violet-700 bg-violet-700 text-white"
                    : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-100"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[10px] leading-snug text-zinc-500">
            {pendingFiltered.length} de {pendingLearnings.length} visibles.
          </p>
        </div>
      ) : null}
    </aside>
  );

  const shell = (
    <div
      className="fixed inset-0 z-[100080] flex flex-col bg-zinc-100"
      role="dialog"
      aria-modal="true"
      aria-labelledby="project-brain-title"
    >
      <header className="flex h-[68px] shrink-0 items-center justify-between gap-3 border-b border-zinc-200/80 bg-white/95 px-5 backdrop-blur-sm supports-[backdrop-filter]:bg-white/82">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-violet-200/80 bg-violet-50 shadow-sm">
            <Brain className="h-5 w-5 text-violet-700" strokeWidth={1.75} aria-hidden />
          </span>
          <div className="min-w-0 leading-tight">
            <h1 id="project-brain-title" className="text-[16px] font-black tracking-tight text-zinc-950">
              Brain
            </h1>
            <p className="truncate text-[11px] font-medium text-zinc-500">Atmósfera · {projectDisplayName}</p>
          </div>
        </div>
        <div className="hidden min-w-0 flex-1 items-center justify-center gap-2 text-[11px] font-bold text-zinc-600 md:flex">
          <span
            className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-zinc-800 shadow-sm"
          >
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Conectado
          </span>
          <span className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-zinc-700 shadow-sm">
            {connectedLearningLabel}
          </span>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("sources")}
            className="inline-flex items-center gap-2 rounded-full border border-violet-700 bg-violet-700 px-4 py-2 text-[11px] font-black uppercase tracking-wide text-white shadow-sm transition hover:bg-violet-800"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
            Añadir conocimiento
          </button>
          <button
            type="button"
            disabled={knowledgeIngestLocked || brandLocked}
            onClick={() => handleResetBrainCompletely()}
            title={
              knowledgeIngestLocked
                ? "Espera a que termine la ingesta"
                : brandLocked
                  ? "Marca bloqueada: desbloquéala antes de reiniciar Brain"
                : "Borra marca, pozo, estrategia y todo análisis (memoria local hasta guardar)"
            }
            className="hidden items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-rose-700 shadow-sm transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50 lg:inline-flex"
          >
            <Trash2 className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} aria-hidden />
            Reiniciar
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("diagnostics")}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-white text-[18px] font-black leading-none text-zinc-700 shadow-sm transition hover:bg-zinc-50"
            aria-label="Más opciones"
          >
            …
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-2 text-[11px] font-bold text-zinc-800 shadow-sm transition hover:bg-zinc-50"
          >
            <X className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            Cerrar
          </button>
        </div>
      </header>

      {message.text && (
        <div
          role="status"
          className={`fixed left-1/2 top-14 z-[100090] max-w-[min(460px,92vw)] -translate-x-1/2 rounded-[5px] border px-3 py-2 text-center text-[11px] font-medium shadow-lg ${
            message.type === "error"
              ? "border-rose-200 bg-rose-50 text-rose-700"
              : message.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-amber-200 bg-amber-50 text-amber-700"
          }`}
        >
          {message.text}
        </div>
      )}

      <div
        className="relative min-h-0 flex-1 overflow-hidden px-3 pb-3 pt-2.5 sm:px-4"
        onMouseMove={handleBrainAtmosphereMouseMove}
        style={{
          backgroundColor: brandBackgroundForCanvas,
        }}
      >
        <div ref={brainAtmosphereBackdropRef} className="pointer-events-none absolute inset-0 overflow-hidden">
          <div
            className="absolute -inset-12 opacity-60 transition-transform duration-700 ease-out"
            style={{
              transform: "translate3d(var(--brain-parallax-x-soft, 0px), var(--brain-parallax-y-soft, 0px), 0)",
              background:
                "radial-gradient(circle at 18% 24%, rgba(255,255,255,0.16), transparent 22%), radial-gradient(circle at 78% 18%, rgba(124,58,237,0.18), transparent 24%), radial-gradient(circle at 55% 92%, rgba(255,255,255,0.1), transparent 28%)",
            }}
          />
          <svg
            className="absolute inset-0 h-full w-full opacity-[0.18] transition-transform duration-700 ease-out"
            style={{ transform: "translate3d(var(--brain-parallax-x, 0px), var(--brain-parallax-y, 0px), 0)" }}
            viewBox="0 0 1200 760"
            preserveAspectRatio="none"
            aria-hidden
          >
            <g fill="none" stroke="rgba(255,255,255,0.46)" strokeWidth="1">
              <path d="M72 126 L205 86 L344 158 L488 96 L642 154 L820 88 L1015 146 L1140 104" />
              <path d="M95 386 L260 322 L426 398 L610 314 L790 382 L970 312 L1134 370" />
              <path d="M168 628 L326 548 L520 610 L720 526 L910 610 L1098 538" />
              <path d="M344 158 L426 398 L520 610" />
              <path d="M642 154 L610 314 L720 526" />
              <path d="M1015 146 L970 312 L910 610" />
            </g>
            <g fill="rgba(255,255,255,0.88)">
              {[
                [72, 126], [205, 86], [344, 158], [488, 96], [642, 154], [820, 88], [1015, 146], [1140, 104],
                [95, 386], [260, 322], [426, 398], [610, 314], [790, 382], [970, 312], [1134, 370],
                [168, 628], [326, 548], [520, 610], [720, 526], [910, 610], [1098, 538],
              ].map(([cx, cy]) => (
                <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="3.5" />
              ))}
            </g>
          </svg>
        </div>
        <div className="relative z-10 flex h-full min-h-0 gap-3 overflow-hidden sm:gap-4">
        {renderBrainAtmosphereCanvas(!isAtmosphereMode)}

        <main className={`${isAtmosphereMode ? "hidden" : "flex"} min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overscroll-y-contain rounded-[28px] border border-white/20 bg-white/94 p-3 shadow-sm backdrop-blur-xl sm:p-4`}>
          <div className="hidden">
            <div className="flex min-w-0 flex-wrap items-center gap-1">
              {(
                [
                  ["overview", "Inicio", LayoutDashboard],
                  ["sources", "Fuentes", BookOpen],
                  ["dna", "ADN", Sparkles],
                  ["looks", "Looks visuales", ImageIcon],
                  ["review", "Aprendizajes", MessageSquareText],
                  ["diagnostics", "Diagnóstico", Network],
                ] as const
              ).map(([id, label, Icon]) => (
                <button
                  key={id}
                  type="button"
                  data-testid={
                    id === "review"
                      ? "brain-tab-review"
                      : id === "overview"
                        ? "brain-tab-overview"
                        : id === "sources"
                          ? "brain-tab-sources"
                          : undefined
                  }
                  onClick={() => setActiveTab(id)}
                  className={`inline-flex items-center gap-1 rounded-[5px] border px-2 py-1 text-[9px] font-semibold uppercase tracking-wide ${
                    resolveBrainPrimarySection(activeTab) === id
                      ? "border-violet-600 bg-violet-600 text-white"
                      : "border-transparent bg-zinc-50 text-zinc-600 hover:bg-zinc-100"
                  }`}
                >
                  <Icon className="h-3 w-3 opacity-80" aria-hidden />
                  {label}
                </button>
              ))}
            </div>
            {resolveBrainPrimarySection(activeTab) === "sources" ? (
              <div className="flex flex-wrap items-center gap-1">
                {(
                  [
                    ["sources", "Bandejas"],
                    ["knowledge", "Fuentes analizadas"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    data-testid={id === "knowledge" ? "brain-subtab-knowledge" : undefined}
                    onClick={() => setActiveTab(id)}
                    className={`rounded-[5px] border px-2 py-1 text-[9px] font-semibold uppercase tracking-wide ${
                      activeTab === id
                        ? "border-zinc-800 bg-zinc-800 text-white"
                        : "border-transparent bg-zinc-50 text-zinc-600 hover:bg-zinc-100"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : null}
            {resolveBrainPrimarySection(activeTab) === "dna" ? (
              <div className="flex flex-wrap items-center gap-1">
                {(
                  [
                    ["dna", "Resumen"],
                    ["visual_refs", "Visual"],
                    ["brand_visual_dna", "Síntesis visual"],
                    ["voice", "Voz"],
                    ["messages", "Mensajes"],
                    ["personas", "Audiencias"],
                    ["facts", "Hechos"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setActiveTab(id)}
                    className={`rounded-[5px] border px-2 py-1 text-[9px] font-semibold uppercase tracking-wide ${
                      activeTab === id
                        ? "border-zinc-800 bg-zinc-800 text-white"
                        : "border-transparent bg-zinc-50 text-zinc-600 hover:bg-zinc-100"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : null}
            {resolveBrainPrimarySection(activeTab) === "diagnostics" ? (
              <div className="flex flex-wrap items-center gap-1">
                {(
                  [
                    ["diagnostics", "Trazas"],
                    ["connected_nodes", "Nodos conectados"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setActiveTab(id)}
                    className={`rounded-[5px] border px-2 py-1 text-[9px] font-semibold uppercase tracking-wide ${
                      activeTab === id
                        ? "border-zinc-800 bg-zinc-800 text-white"
                        : "border-transparent bg-zinc-50 text-zinc-600 hover:bg-zinc-100"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {resolveBrainPrimarySection(activeTab) === "sources" ? (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[5px] border border-zinc-200 bg-zinc-50/80 px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">Fuentes</p>
                <p className="mt-0.5 text-[12px] font-semibold text-zinc-800">
                  {assets.knowledge.documents.length} documentos · {assets.knowledge.urls.length} urls · {imageDocCount} imágenes
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    ["sources", "Añadir fuentes"],
                    ["knowledge", "Fuentes analizadas"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    data-testid={id === "knowledge" ? "brain-subtab-knowledge-visible" : undefined}
                    onClick={() => setActiveTab(id)}
                    className={`rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-wide ${
                      activeTab === id
                        ? "border-violet-700 bg-violet-700 text-white shadow-sm"
                        : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-100"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

            {activeTab === "sources" && (
              <div className="space-y-4">
                {knowledgeIngestLocked ? (
                  <div className="rounded-[5px] border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-snug text-amber-950">
                    <span className="font-bold">Procesando fuentes</span>
                    {knowledgePipelineQueued > 0 ? ` · ${knowledgePipelineQueued} tareas en cola` : ""}.
                    {knowledgePipelineDetail.trim() ? (
                      <span className="ml-1">{knowledgePipelineDetail.trim()}</span>
                    ) : null}
                  </div>
                ) : null}

                <div className="grid gap-3 xl:grid-cols-[1fr_260px]">
                  <div className="space-y-3">
                    <section
                      className={`rounded-[5px] border p-4 shadow-sm ${
                        brandLocked
                          ? "border-zinc-200 bg-zinc-50/80 opacity-80"
                          : "border-sky-200 bg-gradient-to-b from-sky-50/70 to-white"
                      }`}
                      onDragOver={(e) => {
                        e.preventDefault();
                        if (!knowledgeIngestLocked && !brandLocked) setIsDraggingCoreFiles(true);
                      }}
                      onDragLeave={() => setIsDraggingCoreFiles(false)}
                      onDrop={(e) => handleDropScopedFiles(e, "brand")}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="text-[12px] font-black uppercase tracking-[0.14em] text-zinc-900">Marca</h2>
                            <span
                              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wide ${
                                brandLocked
                                  ? "border-zinc-300 bg-white text-zinc-700"
                                  : "border-emerald-200 bg-emerald-50 text-emerald-800"
                              }`}
                            >
                              {brandLocked ? <Lock className="h-3 w-3" aria-hidden /> : <Unlock className="h-3 w-3" aria-hidden />}
                              {brandLocked ? "Bloqueada" : "Editable"}
                            </span>
                          </div>
                          <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-zinc-600">
                            Sube aquí lo que debe mantenerse entre proyectos: logo, colores, tono, claims, manuales y referencias oficiales.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={toggleBrandLocked}
                          className="rounded-[5px] border border-zinc-300 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-zinc-800 hover:bg-zinc-50"
                        >
                          {brandLocked ? "Desbloquear marca" : "Bloquear marca"}
                        </button>
                      </div>
                      <div
                        className={`mt-3 rounded-[5px] border-2 border-dashed px-4 py-5 text-center ${
                          isDraggingCoreFiles
                            ? "border-sky-400 bg-sky-100/70"
                            : brandLocked
                              ? "border-zinc-200 bg-white/60"
                              : "border-sky-200 bg-white/75 hover:border-sky-300"
                        } ${brandLocked || knowledgeIngestLocked ? "cursor-not-allowed" : "cursor-pointer"}`}
                        onClick={() => openScopedFilePicker("brand")}
                      >
                        <Plus className="mx-auto mb-1.5 h-5 w-5 text-sky-600" aria-hidden />
                        <p className="text-[12px] font-bold text-zinc-800">
                          {brandLocked ? "Marca bloqueada. Puedes usarla, pero no añadir fuentes." : "Arrastra o pulsa para añadir fuentes de marca"}
                        </p>
                        <p className="mt-1 text-[10px] text-zinc-500">PDF, DOCX, TXT/MD, URLs, imágenes, logos y brand books.</p>
                      </div>
                      <div className="mt-3 flex gap-2">
                        <input
                          value={urlDraftCore}
                          onChange={(e) => setUrlDraftCore(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && !knowledgeIngestLocked && !brandLocked && (e.preventDefault(), handleAddUrl("core", "brand"))}
                          disabled={knowledgeIngestLocked || brandLocked}
                          placeholder="URL oficial de marca…"
                          className="min-w-0 flex-1 rounded-[5px] border border-zinc-200 bg-white px-2 py-1.5 text-[12px] disabled:opacity-50"
                        />
                        <button
                          type="button"
                          onClick={() => handleAddUrl("core", "brand")}
                          disabled={!urlDraftCore.trim() || knowledgeIngestLocked || brandLocked}
                          className="rounded-[5px] border border-sky-500/50 bg-sky-50 px-2.5 py-1.5 text-[10px] font-bold uppercase text-sky-800 disabled:opacity-50"
                        >
                          Añadir
                        </button>
                      </div>
                      <p className="mt-2 text-[10px] text-zinc-500">{brandSourceDocs.length} fuente(s) de Marca.</p>
                    </section>

                    <section
                      className="rounded-[5px] border border-amber-200 bg-gradient-to-b from-amber-50/70 to-white p-4 shadow-sm"
                      onDragOver={(e) => {
                        e.preventDefault();
                        if (!knowledgeIngestLocked) setIsDraggingContextFiles(true);
                      }}
                      onDragLeave={() => setIsDraggingContextFiles(false)}
                      onDrop={(e) => handleDropScopedFiles(e, "project")}
                    >
                      <h2 className="text-[12px] font-black uppercase tracking-[0.14em] text-zinc-900">Proyecto</h2>
                      <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-zinc-600">
                        Sube aquí lo que solo pertenece a este trabajo: briefing, referencias, documentos, URLs, imágenes y moodboards del proyecto.
                      </p>
                      <div
                        className={`mt-3 rounded-[5px] border-2 border-dashed px-4 py-5 text-center ${
                          isDraggingContextFiles ? "border-amber-400 bg-amber-100/70" : "border-amber-200 bg-white/75 hover:border-amber-300"
                        } ${knowledgeIngestLocked ? "cursor-not-allowed" : "cursor-pointer"}`}
                        onClick={() => openScopedFilePicker("project")}
                      >
                        <Plus className="mx-auto mb-1.5 h-5 w-5 text-amber-600" aria-hidden />
                        <p className="text-[12px] font-bold text-zinc-800">Arrastra o pulsa para añadir contexto del proyecto</p>
                        <p className="mt-1 text-[10px] text-zinc-500">Briefing, moodboards, referencias de cliente, campaña y URLs.</p>
                      </div>
                      <div className="mt-3 flex gap-2">
                        <input
                          value={urlDraftContext}
                          onChange={(e) => setUrlDraftContext(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && !knowledgeIngestLocked && (e.preventDefault(), handleAddUrl("context", "project"))}
                          disabled={knowledgeIngestLocked}
                          placeholder="URL del proyecto…"
                          className="min-w-0 flex-1 rounded-[5px] border border-zinc-200 bg-white px-2 py-1.5 text-[12px] disabled:opacity-50"
                        />
                        <button
                          type="button"
                          onClick={() => handleAddUrl("context", "project")}
                          disabled={!urlDraftContext.trim() || knowledgeIngestLocked}
                          className="rounded-[5px] border border-amber-500/50 bg-amber-50 px-2.5 py-1.5 text-[10px] font-bold uppercase text-amber-800 disabled:opacity-50"
                        >
                          Añadir
                        </button>
                      </div>
                      <p className="mt-2 text-[10px] text-zinc-500">{projectSourceDocs.length} fuente(s) de Proyecto.</p>
                    </section>

                    <section
                      className="rounded-[5px] border border-violet-200 bg-gradient-to-b from-violet-50/70 to-white p-4 shadow-sm"
                      onDragOver={(e) => {
                        e.preventDefault();
                        if (!knowledgeIngestLocked) setIsDraggingContextFiles(true);
                      }}
                      onDragLeave={() => setIsDraggingContextFiles(false)}
                      onDrop={(e) => handleDropScopedFiles(e, "capsule")}
                    >
                      <h2 className="text-[12px] font-black uppercase tracking-[0.14em] text-zinc-900">Looks visuales</h2>
                      <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-zinc-600">
                        Sube imágenes para crear cápsulas visuales reutilizables con paleta, personas, objetos, texturas y entornos.
                      </p>
                      <div
                        className={`mt-3 rounded-[5px] border-2 border-dashed px-4 py-5 text-center ${
                          knowledgeIngestLocked ? "cursor-not-allowed" : "cursor-pointer"
                        } border-violet-200 bg-white/75 hover:border-violet-300`}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (!knowledgeIngestLocked) setIsDraggingContextFiles(true);
                        }}
                        onDragLeave={() => setIsDraggingContextFiles(false)}
                        onDrop={(e) => {
                          e.stopPropagation();
                          handleDropScopedFiles(e, "capsule");
                        }}
                        onClick={() => openScopedFilePicker("capsule")}
                      >
                        <ImageIcon className="mx-auto mb-1.5 h-5 w-5 text-violet-700" aria-hidden />
                        <p className="text-[12px] font-bold text-zinc-800">Arrastra o pulsa para crear cápsulas visuales</p>
                        <p className="mt-1 text-[10px] text-zinc-500">Solo imágenes: JPG, PNG, WebP y formatos visuales ya soportados.</p>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] text-zinc-500">
                        <span>{capsuleSourceDocs.length} imagen(es) fuente.</span>
                        <span>{visualCapsules.length} cápsula(s).</span>
                        <span>{archivedVisualCapsules} archivada(s).</span>
                      </div>
                    </section>

                    <div className="rounded-[5px] border border-zinc-200/90 bg-white/90 px-3 py-2.5">
                      <p className="text-[10px] font-black uppercase tracking-[0.12em] text-zinc-600">Fuentes recibidas</p>
                      <p className="mt-1 text-[11px] text-zinc-700">
                        {assets.knowledge.documents.length} archivo(s) · {assets.knowledge.urls.length} enlace(s) · {imageKnowledgeAnalyzed}/{imageDocCount} imagen(es) analizadas.
                      </p>
                      <button
                        type="button"
                        onClick={handleClearKnowledgeSources}
                        disabled={brandLocked || knowledgeIngestLocked || (assets.knowledge.documents.length === 0 && assets.knowledge.urls.length === 0)}
                        title={brandLocked ? "Marca bloqueada: desbloquéala antes de vaciar el pozo completo." : undefined}
                        className="mt-2 rounded-[5px] border border-rose-200 bg-rose-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-rose-900 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Vaciar pozo
                      </button>
                    </div>

                    <div className="rounded-[5px] border border-violet-200 bg-violet-50/70 p-4">
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-violet-900">
                        Biblioteca de Looks visuales
                      </p>
                      <p className="mt-1 text-[11px] leading-relaxed text-violet-950/80">
                        La gestión de cápsulas vive ahora en su propia sección para evitar duplicidades visuales.
                        Cada imagen conserva su mosaico independiente.
                      </p>
                      <button
                        type="button"
                        onClick={() => setActiveTab("looks")}
                        className="mt-3 rounded-[5px] border border-violet-600 bg-violet-600 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-white hover:bg-violet-700"
                      >
                        Abrir Looks visuales
                      </button>
                    </div>
                  </div>

                  <aside className="space-y-3 rounded-[5px] border border-zinc-200 bg-zinc-50/80 p-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">Ayuda</p>
                      <p className="mt-1 text-[12px] leading-relaxed text-zinc-700">
                        Marca es identidad reutilizable. Proyecto es contexto temporal. Looks visuales son cápsulas generativas independientes.
                      </p>
                    </div>
                    <div className="rounded-[5px] border border-white bg-white p-3">
                      <p className="text-[10px] font-black uppercase tracking-wide text-violet-800">¿Qué son los Looks visuales?</p>
                      <p className="mt-1 text-[11px] leading-relaxed text-zinc-600">
                        Cada imagen subida conserva su propio mosaico y no modifica Marca ni Proyecto automáticamente.
                      </p>
                    </div>
                  </aside>
                </div>
              </div>
            )}

            {activeTab === "looks" && (
              <div className="space-y-4">
                <div className="rounded-[5px] border border-zinc-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-sm font-black uppercase tracking-[0.12em] text-zinc-950">
                        LOOK general
                      </h2>
                      <p className="mt-1 max-w-3xl text-[12px] leading-relaxed text-zinc-600">
                        Síntesis global de las fuentes visuales de Marca y Proyecto: paleta, héroe, personas,
                        objetos, texturas y entornos. Puedes retirar referencias sin borrar el documento original.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-[10px] text-zinc-700">
                      <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-1">
                        {visualGeneralLookActiveRows.length + visualSignalDocumentsForGeneralLook.length} referencia(s) activas
                      </span>
                      <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-1">
                        {(visualLayer?.aggregated?.excludedFromVisualDnaCount ?? 0) +
                          (assets.strategy.visualGeneralLook?.excludedReferenceSourceAssetIds?.length ?? 0)} retiradas
                      </span>
                      {visualGeneralLookNeedsRegeneration ? (
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 font-bold text-amber-800">
                          mosaico pendiente
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-4 grid gap-4 lg:grid-cols-12">
                    <section className="lg:col-span-5">
                      <div className="overflow-hidden rounded-[5px] border border-zinc-200 bg-zinc-50">
                        {resolveBrainVisualImageUrl(visualLayer?.dnaCollageImageDataUrl) ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={resolveBrainVisualImageUrl(visualLayer?.dnaCollageImageDataUrl) || ""} alt="Mosaico LOOK general" className="w-full object-contain" />
                        ) : visualLayer?.dnaCollageImageDataUrl ? (
                          <div className="flex aspect-square flex-col items-center justify-center gap-2 px-4 text-center text-[12px] text-zinc-500">
                            <Loader2 className="h-7 w-7 animate-spin text-violet-500" aria-hidden />
                            <span>Renovando enlace del mosaico…</span>
                          </div>
                        ) : (
                          <div className="flex aspect-square flex-col items-center justify-center gap-2 px-4 text-center text-[12px] text-zinc-500">
                            <ImageIcon className="h-7 w-7 text-zinc-400" aria-hidden />
                            <span>Sin mosaico general generado.</span>
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleRegenerateGeneralLookMosaic()}
                        disabled={visualGeneralMosaicBusy || (visualGeneralLookActiveRows.length === 0 && visualSignalDocumentsForGeneralLook.length === 0)}
                        className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-[5px] border border-zinc-900 bg-zinc-900 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <RefreshCw className={`h-3.5 w-3.5 ${visualGeneralMosaicBusy ? "animate-spin" : ""}`} aria-hidden />
                        {visualGeneralMosaicBusy ? "Regenerando…" : "Regenerar mosaico general"}
                      </button>
                      {visualLayer?.dnaCollageGeneratedAt ? (
                        <p className="mt-1 text-[10px] text-zinc-500">
                          Última generación: {new Date(visualLayer.dnaCollageGeneratedAt).toLocaleString("es")}
                        </p>
                      ) : null}
                    </section>

                    <section className="space-y-3 lg:col-span-7">
                      <div className="rounded-[5px] border border-zinc-200 bg-zinc-50/70 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-zinc-700">
                            Imagen de marca descubierta
                          </p>
                          <span className="text-[10px] text-zinc-500">{activeDiscoveredBrandAssets.length} activo(s)</span>
                        </div>
                        {activeDiscoveredBrandAssets.length === 0 ? (
                          <p className="mt-2 rounded-[5px] border border-dashed border-zinc-200 bg-white px-3 py-3 text-[11px] text-zinc-500">
                            Aún no hay logos o colores detectados. Reanaliza referencias visuales o añade fuentes de Marca con logo/paleta.
                          </p>
                        ) : (
                          <div className="mt-2 grid gap-2 sm:grid-cols-2">
                            {activeDiscoveredBrandAssets.slice(0, 12).map((asset) => (
                              <article key={asset.id} className="flex min-w-0 items-center gap-2 rounded-[5px] border border-zinc-200 bg-white p-2">
                                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-[4px] border border-zinc-200 bg-zinc-50">
                                  {asset.kind === "logo" && resolveBrainVisualImageUrl(asset.imageUrl) ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={resolveBrainVisualImageUrl(asset.imageUrl) || ""} alt="" className="h-full w-full object-contain p-1" />
                                  ) : asset.hex ? (
                                    <span className="h-full w-full" style={{ backgroundColor: asset.hex }} />
                                  ) : (
                                    <ImageIcon className="h-4 w-4 text-zinc-400" aria-hidden />
                                  )}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-[11px] font-bold text-zinc-900">{asset.label}</p>
                                  <p className="truncate text-[10px] text-zinc-500">
                                    {asset.kind === "color" ? asset.hex ?? asset.value : asset.sourceName ?? "logo"} ·{" "}
                                    {typeof asset.confidence === "number" ? `${Math.round(asset.confidence * 100)}%` : "auto"}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => removeDiscoveredBrandAsset(asset.id)}
                                  className="rounded-[4px] border border-rose-200 bg-rose-50 px-2 py-1 text-[9px] font-black uppercase text-rose-900 hover:bg-rose-100"
                                >
                                  Eliminar
                                </button>
                              </article>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="rounded-[5px] border border-zinc-200 bg-zinc-50/70 p-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.12em] text-zinc-700">
                          Referencias visuales usadas
                        </p>
                        {visualGeneralLookActiveRows.length === 0 && visualSignalDocumentsForGeneralLook.length === 0 ? (
                          <p className="mt-2 rounded-[5px] border border-dashed border-zinc-200 bg-white px-3 py-3 text-[11px] text-zinc-500">
                            No hay referencias activas para LOOK general.
                          </p>
                        ) : (
                          <div className="mt-2 grid max-h-[420px] gap-2 overflow-auto pr-1 sm:grid-cols-2">
                            {visualGeneralLookActiveRows.map((row) => {
                              const doc = assets.knowledge.documents.find((d) => d.id === row.ref.id);
                              const preview =
                                resolveBrainVisualImageUrl(row.ref.imageUrlForVision) ||
                                (doc ? resolveKnowledgeDocumentPreviewUrl(doc) : null);
                              const colors = [
                                ...(row.analysis?.colorPalette?.dominant ?? []),
                                ...(row.analysis?.colorPalette?.secondary ?? []),
                              ]
                                .map(normalizeHexCandidate)
                                .filter((x): x is string => Boolean(x))
                                .slice(0, 4);
                              return (
                                <article key={row.ref.id} className="rounded-[5px] border border-zinc-200 bg-white p-2">
                                  <div className="flex gap-2">
                                    <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-[4px] border border-zinc-200 bg-zinc-50">
                                      {preview ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={preview} alt="" className="h-full w-full object-cover" />
                                      ) : (
                                        <ImageIcon className="h-4 w-4 text-zinc-400" aria-hidden />
                                      )}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                      <p className="truncate text-[11px] font-bold text-zinc-900">{row.ref.name}</p>
                                      <p className="mt-0.5 text-[9px] font-black uppercase tracking-wide text-zinc-500">
                                        {visualSourceKindLabel(row.ref.sourceKind)} · {doc ? resolveBrainSourceScope(doc) : "brand"}
                                      </p>
                                      <p className="mt-1 line-clamp-2 text-[10px] leading-snug text-zinc-600">
                                        {row.analysis?.subjectTags?.slice(0, 4).join(" · ") ||
                                          row.analysis?.visualStyle?.slice(0, 3).join(" · ") ||
                                          row.analysis?.subject ||
                                          "Pendiente de análisis visual."}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex gap-1">
                                      {colors.map((hex) => (
                                        <span key={hex} className="h-4 w-4 rounded-sm border border-zinc-200" style={{ backgroundColor: hex }} title={hex} />
                                      ))}
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => removeVisualReferenceFromGeneralLook(row.ref.id)}
                                      className="rounded-[4px] border border-rose-200 bg-rose-50 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-rose-900 hover:bg-rose-100"
                                    >
                                      Eliminar
                                    </button>
                                  </div>
                                </article>
                              );
                            })}
                            {visualSignalDocumentsForGeneralLook.map(({ doc, signals }) => (
                              <article key={`doc-signals-${doc.id}`} className="rounded-[5px] border border-zinc-200 bg-white p-2">
                                <div className="flex gap-2">
                                  <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] border border-zinc-200 bg-zinc-50">
                                    <FileText className="h-4 w-4 text-zinc-400" aria-hidden />
                                  </span>
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-[11px] font-bold text-zinc-900">{doc.name}</p>
                                    <p className="mt-0.5 text-[9px] font-black uppercase tracking-wide text-zinc-500">
                                      Señales visuales · {resolveBrainSourceScope(doc)}
                                    </p>
                                    <p className="mt-1 line-clamp-2 text-[10px] leading-snug text-zinc-600">
                                      {signals.summary || "Colores y señales visuales extraídas del documento."}
                                    </p>
                                  </div>
                                </div>
                                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex gap-1">
                                    {signals.colors.slice(0, 4).map((hex) => (
                                      <span key={hex} className="h-4 w-4 rounded-sm border border-zinc-200" style={{ backgroundColor: hex }} title={hex} />
                                    ))}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => removeVisualReferenceFromGeneralLook(doc.id)}
                                    className="rounded-[4px] border border-rose-200 bg-rose-50 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-rose-900 hover:bg-rose-100"
                                  >
                                    Eliminar
                                  </button>
                                </div>
                              </article>
                            ))}
                          </div>
                        )}
                      </div>
                    </section>
                  </div>
                </div>

                <div className="rounded-[5px] border border-violet-200 bg-violet-50/70 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-sm font-black uppercase tracking-[0.12em] text-violet-950">
                        LOOK Encapsulado
                      </h2>
                      <p className="mt-1 max-w-3xl text-[12px] leading-relaxed text-violet-950/80">
                        Cada imagen crea una cápsula visual independiente. No modifica Marca ni Proyecto
                        automáticamente.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-[10px] text-violet-950/80">
                      <span className="rounded-full border border-white/80 bg-white/75 px-2 py-1">
                        {visualCapsules.length} cápsula(s)
                      </span>
                      <span className="rounded-full border border-white/80 bg-white/75 px-2 py-1">
                        {archivedVisualCapsules} archivada(s)
                      </span>
                    </div>
                  </div>
                  <div
                    className={`mt-4 rounded-[5px] border-2 border-dashed px-4 py-6 text-center ${
                      knowledgeIngestLocked ? "cursor-not-allowed opacity-70" : "cursor-pointer"
                    } border-violet-200 bg-white/80 hover:border-violet-300`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (!knowledgeIngestLocked) setIsDraggingContextFiles(true);
                    }}
                    onDragLeave={() => setIsDraggingContextFiles(false)}
                    onDrop={(e) => {
                      e.stopPropagation();
                      handleDropScopedFiles(e, "capsule");
                    }}
                    onClick={() => openScopedFilePicker("capsule")}
                  >
                    <ImageIcon className="mx-auto mb-1.5 h-5 w-5 text-violet-700" aria-hidden />
                    <p className="text-[12px] font-bold text-zinc-800">
                      Arrastra o pulsa para crear una cápsula visual
                    </p>
                    <p className="mt-1 text-[10px] text-zinc-500">
                      Solo imágenes. Ver ADN abre el mosaico de esa imagen: fuente, paleta, héroe, personas, entornos,
                      texturas y objetos.
                    </p>
                  </div>
                </div>

                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!knowledgeIngestLocked) setIsDraggingContextFiles(true);
                  }}
                  onDragLeave={() => setIsDraggingContextFiles(false)}
                  onDrop={(e) => {
                    e.stopPropagation();
                    handleDropScopedFiles(e, "capsule");
                  }}
                >
                  <VisualDnaSlotsLibrary
                    slots={visualDnaSlotsDisplay.filter((slot) => {
                      const doc = slot.sourceDocumentId
                        ? assets.knowledge.documents.find((d) => d.id === slot.sourceDocumentId)
                        : undefined;
                      return doc ? resolveBrainSourceScope(doc) === "capsule" : false;
                    })}
                    busySlotIds={visualDnaSlotBusy}
                    analysisStatusBySourceDocumentId={analysisStatusBySourceDocumentId}
                    capsuleMetaBySourceDocumentId={capsuleMetaBySourceDocumentId}
                    onSetCapsuleStatus={setVisualCapsuleStatus}
                    onRegenerate={handleRegenerateVisualDnaSlot}
                    onDelete={handleDeleteVisualDnaSlot}
                    onRename={handleRenameVisualDnaSlot}
                  />
                </div>
              </div>
            )}

            {activeTab === "diagnostics" && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-sm font-black uppercase tracking-[0.12em] text-zinc-900">Diagnóstico</h2>
                  <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-zinc-600">
                    Trazabilidad, telemetría y detalles técnicos. Esta sección no cambia el ADN ni las fuentes.
                  </p>
                </div>
                <section className="rounded-[5px] border border-zinc-200 bg-white p-4 shadow-sm">
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">Decision Trace</p>
                  {decisionTraces.length > 0 ? (
                    <div className="mt-3 space-y-2">
                      {decisionTraces.slice(0, 12).map((trace) => (
                        <details key={trace.id} className="rounded-[5px] border border-zinc-200 bg-zinc-50/70 p-2.5">
                          <summary className="cursor-pointer list-none">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-[11px] font-black text-zinc-900">
                                  {traceKindLabel(trace.kind)}
                                  {trace.targetNodeType ? ` · ${trace.targetNodeType}` : ""}
                                </p>
                                <p className="text-[10px] text-zinc-500">{formatTraceDate(trace.createdAt)}</p>
                              </div>
                              <span className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[9px] font-black text-zinc-700">
                                conf {Math.round((trace.confidence ?? 0) * 100)}%
                              </span>
                            </div>
                            <p className="mt-1 text-[11px] leading-relaxed text-zinc-700">{trace.outputSummary.summary}</p>
                          </summary>
                          {trace.inputs.length > 0 ? (
                            <p className="mt-2 text-[11px] text-zinc-700">
                              <span className="font-semibold text-zinc-900">Inputs:</span>{" "}
                              {trace.inputs.slice(0, 8).map((x) => x.label).filter(Boolean).join(" · ")}
                            </p>
                          ) : null}
                        </details>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 rounded-[5px] border border-dashed border-zinc-200 bg-zinc-50 px-3 py-4 text-[11px] text-zinc-500">
                      Aún no hay trazas persistidas.
                    </p>
                  )}
                </section>
                <section className="rounded-[5px] border border-zinc-200 bg-zinc-50/80 p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">Estado técnico</p>
                  <ul className="mt-2 space-y-1 text-[11px] text-zinc-700">
                    <li>Brain version: {getBrainVersion(assets.brainMeta)}</li>
                    <li>Fuentes: {assets.knowledge.documents.length} documentos · {assets.knowledge.urls.length} URLs</li>
                    <li>Cápsulas visuales: {visualCapsules.length}</li>
                    <li>Visual slots: {visualDnaSlotsDisplay.length}</li>
                    <li>Aprendizajes pendientes: {pendingLearnings.length}</li>
                  </ul>
                </section>
              </div>
            )}

            {activeTab === "overview" && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="flex min-h-[120px] flex-col justify-between rounded-[5px] border border-violet-200 bg-white p-4 shadow-sm">
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">Marca</p>
                    <p className="mt-2 text-3xl font-black text-violet-800" title={BRAIN_ADN_COMPLETENESS_TOOLTIP_ES}>
                      {adn.total}
                      <span className="text-sm font-semibold text-zinc-500">/100</span>
                    </p>
                    <p className="mt-2 text-[11px] leading-snug text-zinc-600">
                      {brandSourceDocs.length} fuente(s) · {assets.brand.logoPositive || assets.brand.logoNegative ? "logo cargado" : "sin logo"} ·{" "}
                      {brandLocked ? "marca bloqueada" : "marca editable"}. Este score mide completitud de señales, no calidad creativa.
                    </p>
                    <button
                      type="button"
                      onClick={() => setActiveTab("sources")}
                      className="mt-3 w-fit text-[11px] font-bold text-violet-700 underline decoration-violet-300 underline-offset-2 hover:text-violet-900"
                    >
                      Ver fuentes
                    </button>
                  </div>
                  <div className="flex min-h-[120px] flex-col justify-between rounded-[5px] border border-amber-200 bg-white p-4 shadow-sm">
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">Proyecto</p>
                    <p className="mt-2 text-3xl font-black text-amber-800">{projectSourceDocs.length}</p>
                    <p className="mt-2 text-[11px] leading-snug text-zinc-600">
                      Fuente(s) de contexto temporal. Aquí entran briefings, moodboards, referencias y documentos de este trabajo.
                    </p>
                    <button
                      type="button"
                      onClick={() => setActiveTab("sources")}
                      className="mt-3 w-fit text-[11px] font-bold text-amber-700 underline decoration-amber-300 underline-offset-2 hover:text-amber-900"
                    >
                      Ver fuentes
                    </button>
                  </div>
                  <div className="flex min-h-[120px] flex-col justify-between rounded-[5px] border border-sky-200 bg-white p-4 shadow-sm">
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">Looks visuales</p>
                    <p className="mt-2 text-3xl font-black text-sky-800">{visualCapsules.length}</p>
                    <p className="mt-2 text-[11px] leading-snug text-zinc-600">
                      {visualCapsules.length === 0
                        ? "Aún no hay cápsulas. Sube imágenes para crear looks independientes."
                        : `${visualCapsules.filter((c) => c.analysisStatus === "ready").length} ready · ${visualCapsules.filter((c) => c.analysisStatus === "error").length} error · ${archivedVisualCapsules} archivadas.`}
                    </p>
                    <button
                      type="button"
                      onClick={() => setActiveTab("looks")}
                      className="mt-3 w-fit text-[11px] font-bold text-sky-700 underline decoration-sky-300 underline-offset-2 hover:text-sky-900"
                    >
                      Ver looks
                    </button>
                  </div>
                  <div className="flex min-h-[120px] flex-col justify-between rounded-[5px] border border-amber-200 bg-amber-50/50 p-4 shadow-sm">
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-amber-900">Aprendizajes</p>
                    <p className="mt-2 text-3xl font-black text-amber-900">{pendingLearnings.length}</p>
                    <p className="mt-2 text-[11px] leading-snug text-amber-950/80">
                      Nada cambia en el ADN hasta que confirmes cada aprendizaje.
                    </p>
                    <button
                      type="button"
                      onClick={() => setActiveTab("review")}
                      className="mt-3 w-fit text-[11px] font-bold text-amber-900 underline decoration-amber-400 underline-offset-2"
                    >
                      Revisar
                    </button>
                  </div>
                </div>

                <div className="min-h-[120px] rounded-[5px] border border-zinc-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">Brain resume así tu marca</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => stripLegacyDemoStrategyCopy()}
                        className="rounded-[5px] border border-rose-300 bg-rose-50 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-rose-900 hover:bg-rose-100"
                      >
                        Quitar copy demo (embudo + tono EN)
                      </button>
                      {process.env.NODE_ENV === "development" ? (
                        <button
                          type="button"
                          title="Diagnóstico técnico JSON"
                          onClick={() => {
                            console.log("[Brain summary diagnostics]", brandSummary.diagnostics);
                            showToast("Diagnostics JSON en consola del navegador.", "info");
                          }}
                          className="rounded-[5px] border border-zinc-300 bg-zinc-50 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-zinc-600 hover:bg-zinc-100"
                        >
                          Log JSON (dev)
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <ul className="mt-3 space-y-3 text-[13px] leading-relaxed text-zinc-800">
                    {[
                      brandSummary.identityNarrative,
                      brandSummary.tone,
                      brandSummary.messages,
                      brandSummary.visualDirection,
                    ].map((sec) => (
                      <li key={sec.key} className="rounded-[5px] border border-transparent p-1">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <span className="inline-flex flex-wrap items-center gap-2">
                              <span className="font-bold text-zinc-900">{sec.labelEs}:</span>
                              <span
                                className={`rounded-[5px] border px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wide ${brandSummaryBadgeClass(sec.badge)}`}
                                title="Indicador de procedencia del resumen (cliente)."
                              >
                                {sec.badge}
                              </span>
                            </span>{" "}
                            <span className="text-zinc-800">{sec.value}</span>
                            {sec.warnings.length > 0 ? (
                              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] text-amber-900/90">
                                {sec.warnings.map((w, i) => (
                                  <li key={`${sec.key}-w-${i}`}>{w}</li>
                                ))}
                              </ul>
                            ) : null}
                          </div>
                          <button
                            type="button"
                            aria-expanded={brandSummarySectionSourcesKey === sec.key}
                            aria-controls={`brain-summary-sources-${sec.key}`}
                            id={`brain-summary-sources-trigger-${sec.key}`}
                            onClick={() =>
                              setBrandSummarySectionSourcesKey((k) => (k === sec.key ? null : sec.key))
                            }
                            className="nodrag flex shrink-0 items-center gap-1 rounded-[5px] border border-zinc-200 bg-white px-2 py-1 text-[9px] font-black uppercase tracking-wide text-zinc-700 shadow-sm hover:border-violet-300 hover:bg-violet-50 hover:text-violet-900"
                          >
                            <CircleHelp className="h-3.5 w-3.5" aria-hidden />
                            Fuentes
                          </button>
                        </div>
                        {brandSummarySectionSourcesKey === sec.key ? (
                          <div id={`brain-summary-sources-${sec.key}`} role="region" className="nodrag">
                            <BrandSummarySourcesPanel
                              section={sec}
                              diagnostics={brandSummary.diagnostics}
                              fieldProvenance={assets.strategy.fieldProvenance}
                              pendingLearningsCount={pendingLearnings.length}
                              lastRestudyCompletedIso={lastRestudyCompletedIso}
                              onNavigate={(tab: BrandSummaryNavTab) => {
                                setActiveTab(tab);
                                setBrandSummarySectionSourcesKey(null);
                              }}
                              onStripLegacyDemo={() => {
                                stripLegacyDemoStrategyCopy();
                                setBrandSummarySectionSourcesKey(null);
                              }}
                            />
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-[5px] border border-zinc-200 bg-zinc-50/80 p-5">
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">Señales recientes por nodo</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-zinc-600">
                    Información recibida desde el lienzo, agrupada por nodo a partir de señales recientes en el servidor.
                  </p>
                  <ul className="mt-3 space-y-2 text-[12px] text-zinc-800">
                    {brainClients.map((c) => {
                      const tel = telemetryByNodeId[c.id];
                      const pendN = pendingByNodeId.get(c.id) ?? 0;
                      const { signalsLine, pendingLine, lastSignalLine } = connectedNodeSignalsCopy({
                        summaryLine: tel?.summaryLine ?? null,
                        lastAt: tel?.lastAt ?? null,
                        pendingCount: pendN,
                        expanded: true,
                      });
                      return (
                        <li key={c.id} className="flex gap-2">
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-500" aria-hidden />
                          <span>
                            <span className="font-semibold text-zinc-900">{c.label}</span>
                            <span className="text-zinc-500"> · {labelForBrainNodeSource(c.brainNodeType)}</span>
                            <br />
                            <span className="text-[11px] text-zinc-800">{signalsLine}</span>
                            {pendingLine ? (
                              <>
                                <br />
                                <span className="text-[11px] text-zinc-700">{pendingLine}</span>
                              </>
                            ) : null}
                            {lastSignalLine ? (
                              <>
                                <br />
                                <span className="text-[11px] text-zinc-500">{lastSignalLine}</span>
                              </>
                            ) : null}
                          </span>
                        </li>
                      );
                    })}
                    <li className="flex gap-2">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-400" aria-hidden />
                      <span>
                        Fuentes analizadas · {analyzedCount} de {assets.knowledge.documents.length} activas.
                      </span>
                    </li>
                    <li className="flex gap-2">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500" aria-hidden />
                      <span>
                        Inventario visual · {visualImageRefCount} en memoria
                        {pendingVisualAnalysisCount > 0 ? ` · ${pendingVisualAnalysisCount} pendientes de capa visual` : ""}.
                      </span>
                    </li>
                    {pendingLearnings.length > 0 && (
                      <li className="flex gap-2">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden />
                        <span>
                          Hay {pendingLearnings.length}{" "}
                          {pendingLearnings.length === 1 ? "aprendizaje en revisión" : "aprendizajes en revisión"} en
                          «Aprendizajes».
                        </span>
                      </li>
                    )}
                  </ul>
                  {process.env.NODE_ENV === "development" ? (
                    <p className="mt-3 text-[10px] leading-snug text-zinc-400">{BRAIN_TELEMETRY_EPHEMERAL_DEV_NOTE_ES}</p>
                  ) : null}
                </div>

                {decisionTraces.length > 0 ? (
                  <div className="rounded-[5px] border border-zinc-200 bg-white p-5 shadow-sm">
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">
                      Decision Trace
                    </p>
                    <p className="mt-1 text-[11px] leading-relaxed text-zinc-600">
                      Por qué Brain decidió esto (diagnóstico avanzado). Se guardan las trazas más recientes con resumen ligero.
                    </p>
                    <div className="mt-3 space-y-2">
                      {decisionTraces.slice(0, 8).map((trace) => (
                        <details
                          key={trace.id}
                          className="rounded-[5px] border border-zinc-200 bg-zinc-50/60 p-2.5"
                        >
                          <summary className="cursor-pointer list-none">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-[11px] font-black text-zinc-900">
                                  {traceKindLabel(trace.kind)}
                                  {trace.targetNodeType ? ` · ${trace.targetNodeType}` : ""}
                                  {trace.targetNodeId ? ` · ${trace.targetNodeId}` : ""}
                                </p>
                                <p className="text-[10px] text-zinc-500">{formatTraceDate(trace.createdAt)}</p>
                                {trace.persistenceIntent ? (
                                  <p className="text-[9px] text-zinc-400">
                                    {tracePersistenceIntentLabel(trace.persistenceIntent)}
                                  </p>
                                ) : null}
                              </div>
                              <span className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[9px] font-black text-zinc-700">
                                conf {Math.round((trace.confidence ?? 0) * 100)}%
                              </span>
                            </div>
                            <p className="mt-1 text-[11px] leading-relaxed text-zinc-700">
                              {trace.outputSummary.summary}
                            </p>
                          </summary>
                          {trace.outputSummary.warnings?.length ? (
                            <div className="mt-2 rounded-[5px] border border-amber-200 bg-amber-50 px-2 py-1.5 text-[10px] text-amber-900">
                              Warnings: {trace.outputSummary.warnings.join(" · ")}
                            </div>
                          ) : null}
                          {trace.inputs.length > 0 ? (
                            <div className="mt-2">
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                                Inputs principales
                              </p>
                              <p className="mt-1 text-[11px] text-zinc-700">
                                {trace.inputs
                                  .slice(0, 6)
                                  .map((x) => x.label)
                                  .filter(Boolean)
                                  .join(" · ")}
                              </p>
                            </div>
                          ) : null}
                          {trace.conflicts?.length ? (
                            <div className="mt-2">
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                                Conflictos
                              </p>
                              <p className="mt-1 text-[11px] text-zinc-700">
                                {trace.conflicts
                                  .slice(0, 4)
                                  .map((c) => `${c.left} vs ${c.right} -> ${c.resolution}`)
                                  .join(" · ")}
                              </p>
                            </div>
                          ) : null}
                          {trace.discardedSignals?.length ? (
                            <div className="mt-2">
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                                Señales descartadas
                              </p>
                              <p className="mt-1 text-[11px] text-zinc-700">
                                {trace.discardedSignals
                                  .slice(0, 4)
                                  .map((d) => `${d.summary} (${d.reason})`)
                                  .join(" · ")}
                              </p>
                            </div>
                          ) : null}
                        </details>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            {activeTab === "dna" && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-sm font-black uppercase tracking-[0.12em] text-zinc-900">ADN de marca</h2>
                  <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-zinc-600">
                    Solo lo que consideras base reutilizable. Los aprendizajes pendientes viven en «Aprendizajes». Las
                    tarjetas leen los mismos datos guardados que el resumen; el texto demo/seed se filtra igual que en
                    «Resumen» para no confundir con tu marca real.
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  {(
                    [
                      {
                        title: "Contexto de marca",
                        status: assets.knowledge.corporateContext?.trim() ? "Confirmado" : "Incompleto",
                        body:
                          assets.knowledge.corporateContext?.trim() ||
                          "Sube fuentes de Marca en Fuentes (se analizan al soltar o elegir archivos), o resume la marca en Fuentes analizadas.",
                        tab: "knowledge" as BrainMainSection,
                        footnote: null as string | null,
                      },
                      {
                        title: "Tono y rasgos",
                        status: dnaTabPreview.toneStatus,
                        body: dnaTabPreview.toneBody,
                        tab: "voice",
                        footnote: dnaTabPreview.toneFootnote,
                      },
                      {
                        title: "Mensajes y claims",
                        status: dnaTabPreview.messagesStatus,
                        body: dnaTabPreview.messagesBody,
                        tab: "messages",
                        footnote: dnaTabPreview.messagesFootnote,
                      },
                      {
                        title: "Audiencia (personas)",
                        status: assets.strategy.personas.length > 0 ? "Confirmado" : "Incompleto",
                        body:
                          assets.strategy.personas
                            .slice(0, 3)
                            .map((p) => p.name)
                            .join(" · ") || "Añade al menos una persona.",
                        tab: "personas",
                        footnote: null as string | null,
                      },
                      {
                        title: "Colores de marca",
                        status:
                          [assets.brand.colorPrimary, assets.brand.colorSecondary, assets.brand.colorAccent].some(
                            (c) => typeof c === "string" && /^#[0-9A-Fa-f]{6}$/i.test(c.trim()),
                          )
                            ? "Confirmado"
                            : "Incompleto",
                        body:
                          [assets.brand.colorPrimary, assets.brand.colorSecondary, assets.brand.colorAccent]
                            .filter((c): c is string => typeof c === "string" && c.trim().length > 0)
                            .join(" · ") || "Sin colores definidos.",
                        tab: "knowledge",
                        footnote: null as string | null,
                      },
                      {
                        title: "Hechos y pruebas",
                        status: assets.strategy.factsAndEvidence.length > 0 ? "Detectado" : "Incompleto",
                        body: `${assets.strategy.factsAndEvidence.length} piezas en memoria de verdad.`,
                        tab: "facts",
                        footnote: null as string | null,
                      },
                      {
                        title: "Qué evitar",
                        status: assets.strategy.tabooPhrases.length > 0 ? "Bloqueado" : "Incompleto",
                        body: assets.strategy.tabooPhrases.slice(0, 5).join(" · ") || "Añade frases prohibidas en Voz.",
                        tab: "voice",
                        footnote: null as string | null,
                      },
                      {
                        title: "Reglas de claims absolutos",
                        status: assets.strategy.allowAbsoluteClaims ? "Detectado" : "Bloqueado",
                        body: assets.strategy.allowAbsoluteClaims
                          ? "Permites claims fuertes: revisa con hechos verificados."
                          : "Claims absolutos restringidos (marca más conservadora).",
                        tab: "facts",
                        footnote: null as string | null,
                      },
                    ] as const
                  ).map((card) => {
                    const isBrandContextCard = card.title === "Contexto de marca";
                    const bodyFull = card.body;
                    const brandContextPreviewChars = 200;
                    const brandContextNeedsMore =
                      isBrandContextCard &&
                      typeof bodyFull === "string" &&
                      bodyFull.trim().length > brandContextPreviewChars;
                    const bodyDisplay =
                      brandContextNeedsMore && !dnaBrandContextExpanded
                        ? `${bodyFull.slice(0, brandContextPreviewChars).trimEnd()}…`
                        : bodyFull;

                    return (
                      <article
                        key={card.title}
                        className="flex min-h-[120px] flex-col rounded-[5px] border border-zinc-200 bg-white p-4 shadow-sm"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-[11px] font-black uppercase tracking-wide text-zinc-900">{card.title}</p>
                          <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-zinc-600">
                            {card.status}
                          </span>
                        </div>
                        <p className="mt-2 flex-1 text-[12px] leading-relaxed text-zinc-700">{bodyDisplay}</p>
                        {isBrandContextCard && brandContextNeedsMore ? (
                          <button
                            type="button"
                            onClick={() => setDnaBrandContextExpanded((v) => !v)}
                            className="mt-1.5 w-fit text-left text-[11px] font-semibold text-violet-700 underline decoration-violet-300 underline-offset-2 hover:text-violet-900"
                          >
                            {dnaBrandContextExpanded ? "Ver menos" : "Ver más"}
                          </button>
                        ) : null}
                        {card.footnote ? (
                          <p className="mt-2 text-[10px] leading-snug text-amber-900/90">{card.footnote}</p>
                        ) : null}
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => setActiveTab(card.tab)}
                            className="rounded-[5px] border border-zinc-300 bg-white px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wide text-zinc-800 hover:bg-zinc-100"
                          >
                            Editar
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            )}

            {activeTab === "connected_nodes" && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-sm font-black uppercase tracking-[0.12em] text-zinc-900">Nodos conectados</h2>
                  <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-zinc-600">
                    Brain recibe señales recientes e información desde el lienzo por cada nodo conectado. Nada entra al
                    ADN hasta que revises las propuestas en «Por revisar».
                  </p>
                </div>
                {brainClients.length === 0 ? (
                  <p className="rounded-[5px] border border-dashed border-zinc-300 bg-zinc-50 px-4 py-8 text-center text-[12px] leading-relaxed text-zinc-600">
                    Aún no hay nodos enlazados. En el lienzo, conecta la salida Brain de este nodo al puerto Brain de
                    Designer, Photoroom u otros creativos.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    {brainClients.map((client) => {
                      const tel = telemetryByNodeId[client.id];
                      const pendN = pendingByNodeId.get(client.id) ?? 0;
                      const { signalsLine, pendingLine, lastSignalLine } = connectedNodeSignalsCopy({
                        summaryLine: tel?.summaryLine ?? null,
                        lastAt: tel?.lastAt ?? null,
                        pendingCount: pendN,
                        expanded: true,
                      });
                      const pendingForNode = pendingLearnings.filter((row) =>
                        learningRowMatchesCanvasNode(row, client.id, client.brainNodeType),
                      );
                      const accent =
                        client.brainNodeType === "DESIGNER"
                          ? "border-sky-200 bg-sky-50/50 ring-1 ring-sky-100"
                          : client.brainNodeType === "PHOTOROOM"
                            ? "border-fuchsia-200 bg-fuchsia-50/40 ring-1 ring-fuchsia-100"
                            : client.brainNodeType === "ARTICLE_WRITER"
                              ? "border-emerald-200 bg-emerald-50/40 ring-1 ring-emerald-100"
                              : "border-zinc-200 bg-zinc-50/80 ring-1 ring-zinc-100";
                      return (
                        <article
                          key={client.id}
                          className={`flex min-h-[320px] flex-col rounded-[5px] border p-5 shadow-sm ${accent}`}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">
                                {labelForBrainNodeSource(client.brainNodeType)}
                              </p>
                              <p className="text-lg font-black text-zinc-900">{client.label}</p>
                              <p className="mt-1 text-[11px] text-zinc-600">
                                Señales recientes e información recibida desde este nodo hacia Brain.
                              </p>
                            </div>
                            <span className="rounded-full border border-white/80 bg-white/80 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-zinc-600">
                              {client.canvasType}
                            </span>
                          </div>
                          <div className="mt-4 rounded-[5px] border border-zinc-200/80 bg-white/70 p-3">
                            <p className="text-[10px] font-black uppercase tracking-wide text-zinc-500">
                              Señales recientes (resumen)
                            </p>
                            <p className="mt-2 text-[12px] font-semibold text-zinc-900">{signalsLine}</p>
                            {lastSignalLine ? (
                              <p className="mt-1 text-[11px] text-zinc-500">{lastSignalLine}</p>
                            ) : null}
                          </div>
                          <div className="mt-3 rounded-[5px] border border-zinc-200/80 bg-white/70 p-3">
                            <p className="text-[10px] font-black uppercase tracking-wide text-zinc-500">
                              Aprendizajes en revisión
                            </p>
                            {pendingLine ? (
                              <p className="mt-2 text-[12px] font-semibold text-zinc-900">{pendingLine}</p>
                            ) : (
                              <p className="mt-2 text-[12px] text-zinc-600">Ninguno pendiente de este nodo.</p>
                            )}
                            {pendingForNode.length > 0 ? (
                              <ul className="mt-2 space-y-1 text-[11px] text-zinc-700">
                                {pendingForNode.slice(0, 5).map((row) => {
                                  const snippet = stripLearningValueUiPrefixes(row.candidate.value).trim();
                                  return (
                                    <li key={row.id} className="leading-snug">
                                      · {snippet.slice(0, 140)}
                                      {snippet.length > 140 ? "…" : ""}
                                    </li>
                                  );
                                })}
                              </ul>
                            ) : null}
                          </div>
                          <div className="mt-auto flex flex-wrap gap-2 pt-4">
                            <button
                              type="button"
                              onClick={() => setSignalModalClient(client)}
                              className="rounded-[5px] border border-zinc-800 bg-zinc-900 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-white hover:bg-black"
                            >
                              Ver señales
                            </button>
                            <button
                              type="button"
                              onClick={() => showToast("Próximamente: pausar solo este nodo.", "info")}
                              className="rounded-[5px] border border-zinc-300 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-wide text-zinc-700 hover:bg-zinc-100"
                            >
                              Pausar aprendizaje
                            </button>
                            <button
                              type="button"
                              onClick={() => void refreshConnectedSignals()}
                              className="rounded-[5px] border border-zinc-300 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-wide text-zinc-700 hover:bg-zinc-100"
                            >
                              Refrescar señales
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                showToast("Desconecta el cable Brain en el lienzo para dejar de recibir señales.", "info")
                              }
                              className="rounded-[5px] border border-rose-200 bg-rose-50 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-rose-800 hover:bg-rose-100"
                            >
                              Cómo desconectar
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
                {process.env.NODE_ENV === "development" ? (
                  <p className="text-[10px] leading-snug text-zinc-400">{BRAIN_TELEMETRY_EPHEMERAL_DEV_NOTE_ES}</p>
                ) : null}
              </div>
            )}

            {activeTab === "review" && (
              <div className="space-y-4">
                <div className="rounded-[5px] border border-violet-200 bg-violet-50/60 p-4">
                  <h2 className="text-sm font-black uppercase tracking-[0.12em] text-violet-900">Aprendizajes</h2>
                  <p className="mt-1 text-[12px] leading-relaxed text-violet-950/80">
                    Propuestas a partir de señales recientes e información recibida en el lienzo. Nada cambia en la
                    marca hasta que elijas una acción.
                  </p>
                </div>
                {!projectId?.trim() ? (
                  <p className="rounded-[5px] border border-dashed border-zinc-200 bg-zinc-50 px-4 py-6 text-center text-[12px] text-zinc-500">
                    Guarda el proyecto con sesión iniciada para ver pendientes aquí.
                  </p>
                ) : pendingLoading ? (
                  <p className="text-center text-[12px] text-zinc-500">Cargando…</p>
                ) : pendingLearnings.length === 0 ? (
                  <p className="rounded-[5px] border border-dashed border-zinc-200 bg-zinc-50 px-4 py-6 text-center text-[12px] text-zinc-500">
                    Brain está al día. No hay aprendizajes pendientes por revisar.
                  </p>
                ) : pendingFiltered.length === 0 ? (
                  <p className="rounded-[5px] border border-dashed border-amber-200 bg-amber-50/60 px-4 py-6 text-center text-[12px] text-amber-950">
                    No hay elementos con este filtro. Cambia el filtro en el panel derecho o vuelve a «Todos».
                  </p>
                ) : (
                  <div className="space-y-4">
                    {pendingReviewSplit.anchored.length === 0 && pendingReviewSplit.orphans.length > 0 ? (
                      <p className="rounded-[5px] border border-amber-200 bg-amber-50/70 px-4 py-3 text-[11px] leading-relaxed text-amber-950">
                        No hay pendientes con nodo de lienzo anclado para este filtro. Los que siguen carecen de un{" "}
                        <code className="rounded-[5px] bg-amber-100 px-1">nodeId</code> fiable; no deben mostrarse dentro de
                        tarjetas Photoroom/Designer hasta corregir la evidencia.
                      </p>
                    ) : null}
                    <div className="grid grid-cols-1 gap-3">
                      {pendingReviewSplit.anchored.map((row) => renderPendingReviewArticle(row))}
                    </div>
                    {pendingReviewSplit.orphans.length > 0 ? (
                      <div className="space-y-3">
                        <h3 className="text-[11px] font-black uppercase tracking-[0.14em] text-zinc-600">
                          Aprendizajes sin nodo asignado
                        </h3>
                        <div className="grid grid-cols-1 gap-3">
                          {pendingReviewSplit.orphans.map((row) => renderPendingReviewArticle(row))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            )}

            {activeTab === "visual_refs" && (
              <div className="space-y-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <h2 className="text-sm font-black uppercase tracking-[0.12em] text-zinc-900">Referencias visuales</h2>
                    <p className="mt-0.5 max-w-2xl text-[11px] leading-snug text-zinc-600">
                      Mood board 1024×1024 (Nano Banana), inventario de visión y señales agregadas por referencia. La
                      ingesta de PDF/imágenes de Marca o Proyecto está en Fuentes.
                    </p>
                  </div>
                  <div
                    className={`shrink-0 rounded-[5px] border px-2.5 py-1.5 text-[10px] leading-snug ${
                      !serverVisionProbeDone
                        ? "border-sky-200 bg-sky-50 text-sky-950"
                        : serverVisionProviderId === null
                          ? "border-amber-200 bg-amber-50 text-amber-950"
                          : serverVisionProviderId === "mock"
                            ? "border-amber-200 bg-amber-50 text-amber-950"
                            : "border-emerald-200 bg-emerald-50/90 text-emerald-950"
                    }`}
                  >
                    {!serverVisionProbeDone ? (
                      <span className="font-semibold">Comprobando visión en servidor…</span>
                    ) : serverVisionProviderId === null ? (
                      <span className="font-semibold">No se pudo comprobar visión (sesión o red).</span>
                    ) : serverVisionProviderId === "mock" ? (
                      <span>
                        <span className="font-semibold">Visión remota inactiva (mock).</span> Configura{" "}
                        <code className="rounded-[5px] bg-amber-100 px-1">GEMINI_API_KEY</code> /{" "}
                        <code className="rounded-[5px] bg-amber-100 px-1">OPENAI_API_KEY</code>; al subir o cambiar
                        imágenes en el pozo se intentará de nuevo solo.
                      </span>
                    ) : (
                      <span>
                        <span className="font-semibold">
                          Visión remota:{" "}
                          {serverVisionProviderId === "gemini-vision"
                            ? "Gemini"
                            : serverVisionProviderId === "openai-vision"
                              ? "OpenAI"
                              : "—"}
                        </span>
                        {isVisualMockAnalyzer ? (
                          <span className="mt-0.5 block text-[9px] font-semibold text-amber-900">
                            Metadatos aún mock: se alinearán al siguiente ciclo de ingesta o guardando el proyecto.
                          </span>
                        ) : (
                          <span className="mt-0.5 block text-[9px] text-emerald-900/90">
                            Filas con fallback se marcan en la tabla inferior.
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                </div>
                {visualReferenceAnalysisDirty ? (
                  <div className="rounded-[5px] border border-sky-400 bg-sky-50 px-4 py-3 text-[11px] leading-relaxed text-sky-950">
                    <p className="font-semibold text-sky-950">
                      Análisis visual actualizado. Guarda el proyecto para conservarlo.
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={isSavingProject}
                        onClick={() => void handleSaveVisualAnalysis()}
                        className="inline-flex items-center gap-2 rounded-[5px] border border-sky-800 bg-sky-800 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-white disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isSavingProject ? (
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden />
                        ) : (
                          <Save className="h-3.5 w-3.5" aria-hidden />
                        )}
                        Guardar análisis
                      </button>
                      <span className="text-[10px] text-sky-900/90">Mismo efecto que «Guardar proyecto» en el lienzo.</span>
                    </div>
                  </div>
                ) : null}
                {process.env.NODE_ENV === "development" && projectId?.trim() ? (
                  <div className="rounded-[5px] border border-zinc-300 bg-zinc-100/90 px-4 py-3 text-[10px] leading-relaxed text-zinc-800">
                    <p className="font-black uppercase tracking-[0.1em] text-zinc-600">Herramientas dev · pendientes</p>
                    <p className="mt-1 text-zinc-600">
                      Limpia la cola en memoria del servidor para este proyecto (no afecta assets guardados).
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void devClearPendingLearnings("all")}
                        className="rounded-[5px] border border-zinc-400 bg-white px-3 py-1.5 text-[9px] font-black uppercase tracking-wide text-zinc-800 hover:bg-zinc-50"
                      >
                        Limpiar todos los pendientes
                      </button>
                      <button
                        type="button"
                        onClick={() => void devClearPendingLearnings("orphan")}
                        className="rounded-[5px] border border-amber-400 bg-amber-50 px-3 py-1.5 text-[9px] font-black uppercase tracking-wide text-amber-950 hover:bg-amber-100"
                      >
                        Limpiar sin nodo
                      </button>
                      <button
                        type="button"
                        onClick={() => void devClearPendingLearnings("visual_reference")}
                        className="rounded-[5px] border border-violet-400 bg-violet-50 px-3 py-1.5 text-[9px] font-black uppercase tracking-wide text-violet-950 hover:bg-violet-100"
                      >
                        Limpiar cola referencias visuales
                      </button>
                      <button
                        type="button"
                        disabled={restudyBusy}
                        onClick={() => void handleBrainRestudy()}
                        className="rounded-[5px] border border-emerald-500 bg-emerald-600 px-3 py-1.5 text-[9px] font-black uppercase tracking-wide text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {restudyBusy ? "Re-estudiando…" : "Reestudiar Brain completo"}
                      </button>
                    </div>
                    {restudyLast ? (
                      <div className="mt-3 space-y-2 rounded-[5px] border border-zinc-200 bg-white p-3 text-[10px] text-zinc-800">
                        <p className="font-black uppercase tracking-wide text-zinc-600">Último re-estudio</p>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <div>
                            <span className="font-semibold text-zinc-600">Visión remota:</span>{" "}
                            {restudyLast.visual.analyzedReal} / {restudyLast.visual.totalImages} · fallback{" "}
                            {restudyLast.visual.fallback} · fallidas {restudyLast.visual.failed} · demasiado genéricas{" "}
                            {restudyLast.visual.tooGeneric} · proveedor {restudyLast.visual.provider}
                          </div>
                          <div>
                            <span className="font-semibold text-zinc-600">Documentos CORE:</span>{" "}
                            {restudyLast.documents.analyzed} analizados / {restudyLast.documents.totalCoreDocuments} ·
                            errores {restudyLast.documents.failed}
                          </div>
                          <div>
                            <span className="font-semibold text-zinc-600">Candidatos creados:</span>{" "}
                            {restudyLast.candidatesCreated}
                          </div>
                          <div>
                            <span className="font-semibold text-zinc-600">Confianza resumen:</span>{" "}
                            {(restudyLast.summary.confidence * 100).toFixed(0)}%
                          </div>
                        </div>
                        {restudyLast.devValidation?.samples?.length ? (
                          <div className="rounded-[5px] border border-amber-100 bg-amber-50/80 p-2 text-[9px] text-amber-950">
                            <p className="font-semibold">Validación 3 imágenes (dev)</p>
                            <p className="mt-1">
                              {restudyLast.devValidation.passed ? "OK: al menos una muestra no genérica." : restudyLast.devValidation.warning ?? "Muestra genérica."}
                            </p>
                            <ul className="mt-1 list-inside list-disc">
                              {restudyLast.devValidation.samples.map((s) => (
                                <li key={s.sourceAssetId}>
                                  {s.sourceAssetId}: calidad {s.quality} · tags {s.subjectTags.slice(0, 6).join(", ")}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                        {restudyLast.warnings.length ? (
                          <div className="max-h-28 overflow-y-auto rounded-[5px] border border-amber-200 bg-amber-50/90 p-2 text-[9px] text-amber-950">
                            {restudyLast.warnings.slice(0, 12).map((w, i) => (
                              <p key={i}>{w}</p>
                            ))}
                          </div>
                        ) : null}
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => setRestudyTraceOpen(true)}
                            className="rounded-[5px] border border-zinc-400 bg-zinc-50 px-3 py-1.5 text-[9px] font-black uppercase tracking-wide text-zinc-800 hover:bg-zinc-100"
                          >
                            Ver trazabilidad del resumen
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {restudyTraceOpen && restudyLast ? (
                  <div
                    className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4"
                    role="dialog"
                    aria-modal="true"
                  >
                    <div className="max-h-[85vh] w-full max-w-3xl overflow-hidden rounded-[5px] border border-zinc-200 bg-white shadow-xl">
                      <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
                        <p className="text-[12px] font-black uppercase tracking-wide text-zinc-800">
                          Trazabilidad del resumen (re-estudio)
                        </p>
                        <button
                          type="button"
                          onClick={() => setRestudyTraceOpen(false)}
                          className="rounded-[5px] border border-zinc-200 px-2 py-1 text-[10px] font-bold text-zinc-700 hover:bg-zinc-50"
                        >
                          Cerrar
                        </button>
                      </div>
                      <pre className="max-h-[calc(85vh-52px)] overflow-auto p-4 text-[10px] leading-relaxed text-zinc-800">
                        {JSON.stringify(restudyLast.traceability, null, 2)}
                      </pre>
                    </div>
                  </div>
                ) : null}
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                  <div
                    className="rounded-[5px] border border-violet-200 bg-white p-4 shadow-sm"
                    title="Imágenes detectadas en el proyecto como referencia o recurso visual (inventario)."
                  >
                    <p className="text-[10px] font-black uppercase tracking-[0.12em] text-zinc-500">Referencias totales</p>
                    <p className="mt-1 text-2xl font-black text-violet-800">{visualImageRefCount}</p>
                    <p className="mt-1 text-[10px] text-zinc-500">Inventario en Brain</p>
                  </div>
                  <div
                    className="rounded-[5px] border border-emerald-200 bg-emerald-50/40 p-4 shadow-sm"
                    title="Filas con Gemini u OpenAI sin mock ni fallback (según metadatos guardados)."
                  >
                    <p className="text-[10px] font-black uppercase tracking-[0.12em] text-emerald-900">Visión remota</p>
                    <p className="mt-1 text-2xl font-black text-emerald-900">{visualDisposition.realRemoteAnalyzed}</p>
                    <p className="mt-1 text-[10px] text-emerald-900/90">Analizadas con API de visión</p>
                  </div>
                  <div
                    className="rounded-[5px] border border-sky-200 bg-sky-50/50 p-4 shadow-sm"
                    title="Análisis simulado, fallback heurístico o metadatos que no cuentan como visión remota fiable."
                  >
                    <p className="text-[10px] font-black uppercase tracking-[0.12em] text-sky-900">Mock / fallback</p>
                    <p className="mt-1 text-2xl font-black text-sky-900">{visualDisposition.fallbackOrMockAnalyzed}</p>
                    <p className="mt-1 text-[10px] text-sky-900/85">Heurística o simulado</p>
                  </div>
                  <div
                    className="rounded-[5px] border border-rose-200 bg-rose-50/50 p-4 shadow-sm"
                    title="Filas cuyo último intento de análisis quedó en error."
                  >
                    <p className="text-[10px] font-black uppercase tracking-[0.12em] text-rose-900">Errores</p>
                    <p className="mt-1 text-2xl font-black text-rose-900">{visualDisposition.failed}</p>
                    <p className="mt-1 text-[10px] text-rose-900/85">Estado fallido</p>
                  </div>
                  <div
                    className="rounded-[5px] border border-amber-200 bg-amber-50/50 p-4 shadow-sm"
                    title="Referencias del inventario sin fila en la capa de análisis; suele resolverse al procesar el pozo o al guardar."
                  >
                    <p className="text-[10px] font-black uppercase tracking-[0.12em] text-amber-800">Sin capa aún</p>
                    <p className="mt-1 text-2xl font-black text-amber-900">{pendingVisualAnalysisCount}</p>
                    <p className="mt-1 text-[10px] text-amber-900/80">Sin fila de análisis</p>
                  </div>
                </div>
                <p className="text-[10px] leading-snug text-zinc-500">
                  Filas en capa (cualquier estado): {visualAnalyzedCount}. Excluidas del agregado ADN visual:{" "}
                  {visualAggregatedResolved?.excludedFromVisualDnaCount ?? 0}.
                </p>
                {visualAggregatedResolved && visualAnalyzedCount > 0 ? (
                  <>
                    <div className="rounded-[5px] border border-zinc-200 bg-zinc-50/80 p-4">
                      <p className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">
                        Resumen Core / contexto / raw
                      </p>
                      <div className="flex flex-wrap gap-2 text-[11px] text-zinc-800">
                        <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 font-semibold">
                          CORE {visualAggregatedResolved.countsByClassification.CORE_VISUAL_DNA ?? 0}
                        </span>
                        <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 font-semibold">
                          Proyecto {visualAggregatedResolved.countsByClassification.PROJECT_VISUAL_REFERENCE ?? 0}
                        </span>
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 font-semibold">
                          Contexto {visualAggregatedResolved.countsByClassification.CONTEXTUAL_VISUAL_MEMORY ?? 0}
                        </span>
                        <span className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 font-semibold">
                          RAW {visualAggregatedResolved.countsByClassification.RAW_ASSET_ONLY ?? 0}
                        </span>
                      </div>
                    </div>
                    <div className="grid gap-4 lg:grid-cols-2">
                      <div className="space-y-3">
                        <div className="rounded-[5px] border border-zinc-200 bg-white p-4">
                          <p className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">
                            Estilo y mood
                          </p>
                          <p className="text-[11px] text-zinc-700">
                            <span className="font-semibold text-zinc-900">Estilo:</span>{" "}
                            {visualAggregatedResolved.recurringStyles.length
                              ? visualAggregatedResolved.recurringStyles.join(", ")
                              : "—"}
                          </p>
                          <p className="mt-1 text-[11px] text-zinc-700">
                            <span className="font-semibold text-zinc-900">Mood:</span>{" "}
                            {visualAggregatedResolved.dominantMoods.length
                              ? visualAggregatedResolved.dominantMoods.join(", ")
                              : "—"}
                          </p>
                        </div>
                        <div className="rounded-[5px] border border-zinc-200 bg-white p-4">
                          <p className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">
                            Composición y sujetos
                          </p>
                          <p className="text-[11px] text-zinc-700">
                            {visualAggregatedResolved.compositionNotes.length
                              ? visualAggregatedResolved.compositionNotes.join(" · ")
                              : "—"}
                          </p>
                          <p className="mt-2 text-[11px] text-zinc-600">
                            <span className="font-semibold text-zinc-800">Sujetos:</span>{" "}
                            {visualAggregatedResolved.frequentSubjects.length
                              ? visualAggregatedResolved.frequentSubjects.join(", ")
                              : "—"}
                          </p>
                        </div>
                        <div className="rounded-[5px] border border-zinc-200 bg-white p-4">
                          <p className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">
                            Personas y ropa / styling
                          </p>
                          <p className="text-[11px] leading-relaxed text-zinc-700">
                            {visualAggregatedResolved.peopleClothingNotes.length
                              ? visualAggregatedResolved.peopleClothingNotes.join(" · ")
                              : "—"}
                          </p>
                        </div>
                      </div>
                      <div className="space-y-3">
                        <div className="rounded-[5px] border border-zinc-200 bg-white p-4">
                          <p className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">
                            Paleta dominante y secundaria
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {visualAggregatedResolved.dominantPalette.slice(0, 10).map((hex) => (
                              <span
                                key={`d-${hex}`}
                                title={hex}
                                className="inline-flex h-9 w-9 rounded-full border border-zinc-200 shadow-inner"
                                style={{ backgroundColor: hex }}
                              />
                            ))}
                          </div>
                          <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                            Secundarios
                          </p>
                          <div className="mt-1 flex flex-wrap gap-2">
                            {(visualAggregatedResolved.dominantSecondaryPalette ?? []).slice(0, 8).map((hex) => (
                              <span
                                key={`s-${hex}`}
                                title={hex}
                                className="inline-flex h-7 w-7 rounded-full border border-zinc-200 shadow-inner"
                                style={{ backgroundColor: hex }}
                              />
                            ))}
                            {(visualAggregatedResolved.dominantSecondaryPalette ?? []).length === 0 ? (
                              <span className="text-[11px] text-zinc-500">—</span>
                            ) : null}
                          </div>
                        </div>
                        <div className="rounded-[5px] border border-zinc-200 bg-white p-4">
                          <p className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">
                            Estilo gráfico
                          </p>
                          <p className="text-[11px] text-zinc-700">
                            {(visualAggregatedResolved.graphicStyleNotes ?? []).length
                              ? (visualAggregatedResolved.graphicStyleNotes ?? []).join(" · ")
                              : "—"}
                          </p>
                        </div>
                        <div className="rounded-[5px] border border-violet-100 bg-violet-50/60 p-4">
                          <p className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-violet-900">
                            Mensaje implícito de marca
                          </p>
                          <p className="text-[11px] leading-relaxed text-violet-950/90">
                            {(visualAggregatedResolved.implicitBrandMessages ?? []).length
                              ? (visualAggregatedResolved.implicitBrandMessages ?? []).join(" ")
                              : visualAggregatedResolved.narrativeSummary || "—"}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-[5px] border border-zinc-200 bg-white p-4">
                      <p className="mb-3 text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">
                        Cada referencia
                      </p>
                      <div className="max-h-[340px] space-y-2 overflow-y-auto pr-1">
                        {visualRefInventoryRows.map(({ ref, analysis }) => {
                          const diag = visualDiagnosticByAssetId.get(ref.id);
                          const rowMeta = visualReferenceRowMeta(analysis, visualLayer);
                          const status = !analysis
                            ? {
                                label: rowMeta.estadoLabel,
                                klass: "border-amber-200 bg-amber-50 text-amber-900",
                              }
                            : isExcludedFromVisualDna(analysis)
                              ? {
                                  label: "Excluida del ADN visual",
                                  klass: "border-zinc-300 bg-zinc-100 text-zinc-700",
                                }
                              : analysis.userVisualOverride && analysis.userVisualOverride !== "EXCLUDED"
                                ? {
                                    label: "Clasificación manual",
                                    klass: "border-violet-200 bg-violet-50 text-violet-900",
                                  }
                              : rowMeta.estadoLabel.startsWith("Error")
                                ? {
                                    label: rowMeta.estadoLabel,
                                    klass: "border-rose-200 bg-rose-50 text-rose-900",
                                  }
                                : rowMeta.estadoLabel.includes("simulado")
                                  ? {
                                      label: rowMeta.estadoLabel,
                                      klass: "border-sky-200 bg-sky-50 text-sky-900",
                                    }
                                  : rowMeta.estadoLabel === "Pendiente"
                                    ? {
                                        label: rowMeta.estadoLabel,
                                        klass: "border-amber-200 bg-amber-50 text-amber-900",
                                      }
                                    : {
                                        label: rowMeta.estadoLabel,
                                        klass: "border-emerald-200 bg-emerald-50 text-emerald-900",
                                      };
                          const eff = analysis ? getEffectiveClassification(analysis) : null;
                          const dnaHint =
                            analysis &&
                            !isExcludedFromVisualDna(analysis) &&
                            getEffectiveClassification(analysis) === "CORE_VISUAL_DNA";
                          return (
                            <div
                              key={ref.id}
                              className="flex flex-col gap-2 rounded-[5px] border border-zinc-200 bg-zinc-50/80 p-3 sm:flex-row sm:items-start sm:justify-between"
                            >
                              <div className="flex min-w-0 flex-1 gap-3">
                                <BrainSourcePreview
                                  src={resolveBrainVisualImageUrl(ref.imageUrlForVision) ?? null}
                                  label={ref.label ?? ref.name}
                                  className="h-14 w-14"
                                />
                                <div className="min-w-0 flex-1">
                                <p className="text-[10px] text-zinc-500">
                                  {ref.sourceKind.replace(/_/g, " ")} ·{" "}
                                  <span className="font-mono text-zinc-600">id={ref.id}</span>
                                </p>
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                  <span className={`rounded-full border px-2 py-0.5 text-[9px] font-black ${status.klass}`}>
                                    {status.label}
                                  </span>
                                  {dnaHint ? (
                                    <span className="rounded-full border border-violet-300 bg-violet-100 px-2 py-0.5 text-[9px] font-black text-violet-900">
                                      Usada para ADN visual
                                    </span>
                                  ) : null}
                                </div>
                                <p className="mt-1.5 text-[9px] leading-snug text-zinc-500">
                                  <span className="font-semibold text-zinc-600">Estado:</span> {rowMeta.estadoLabel}
                                  <span className="text-zinc-400"> · </span>
                                  <span className="font-semibold text-zinc-600">Proveedor:</span> {rowMeta.proveedorLabel}
                                  <span className="text-zinc-400"> · </span>
                                  <span className="font-semibold text-zinc-600">Versión:</span> {rowMeta.versionLabel}
                                  <span className="text-zinc-400"> · </span>
                                  <span className="font-semibold text-zinc-600">Imagen para visión:</span>{" "}
                                  {rowMeta.imageUrlLine}
                                  {analysis?.fallbackUsed ? (
                                    <>
                                      <span className="text-zinc-400"> · </span>
                                      <span className="font-semibold text-zinc-600">Fallback:</span> sí
                                    </>
                                  ) : analysis && analysis.fallbackUsed === false ? (
                                    <>
                                      <span className="text-zinc-400"> · </span>
                                      <span className="font-semibold text-zinc-600">Fallback:</span> no
                                    </>
                                  ) : null}
                                </p>
                                {rowMeta.fallbackNote ? (
                                  <p className="mt-1 text-[9px] font-semibold leading-snug text-rose-800">
                                    {rowMeta.fallbackNote}
                                  </p>
                                ) : null}
                                {process.env.NODE_ENV === "development" && diag ? (
                                  <details className="mt-2 rounded-[5px] border border-zinc-200 bg-white px-2 py-1.5">
                                    <summary className="cursor-pointer text-[9px] font-black uppercase tracking-wide text-zinc-600">
                                      Ver diagnóstico (dev)
                                    </summary>
                                    <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all text-[8px] leading-snug text-zinc-700">
                                      {JSON.stringify(diag, null, 2)}
                                    </pre>
                                  </details>
                                ) : null}
                                {analysis ? (
                                  <p className="mt-2 text-[10px] text-zinc-600">
                                    Modelo: {labelVisualClassification(analysis.classification)}
                                    {analysis.userVisualOverride ? (
                                      <>
                                        {" "}
                                        · Manual:{" "}
                                        {analysis.userVisualOverride === "EXCLUDED"
                                          ? "EXCLUIDA"
                                          : labelVisualClassification(analysis.userVisualOverride)}
                                      </>
                                    ) : null}
                                    {eff ? (
                                      <>
                                        {" "}
                                        · Efectiva: {labelVisualClassification(eff)}
                                      </>
                                    ) : null}
                                  </p>
                                ) : null}
                                {(() => {
                                  const subjectTags = brainAnalysisTextArray(analysis?.subjectTags);
                                  return subjectTags.length ? (
                                    <p className="mt-1 text-[10px] leading-snug text-zinc-600">
                                      <span className="font-semibold text-zinc-800">Sujetos:</span>{" "}
                                      {subjectTags.slice(0, 10).join(" · ")}
                                    </p>
                                  ) : null;
                                })()}
                                {(() => {
                                  const styles = brainAnalysisTextArray(analysis?.visualStyle);
                                  return styles.length ? (
                                    <p className="mt-1 text-[10px] leading-snug text-zinc-600">
                                      <span className="font-semibold text-zinc-800">Estilo:</span>{" "}
                                      {styles.slice(0, 8).join(" · ")}
                                    </p>
                                  ) : null;
                                })()}
                                {(() => {
                                  const moods = brainAnalysisTextArray(analysis?.mood);
                                  return moods.length ? (
                                    <p className="mt-1 text-[10px] leading-snug text-zinc-600">
                                      <span className="font-semibold text-zinc-800">Mood:</span>{" "}
                                      {moods.slice(0, 10).join(" · ")}
                                    </p>
                                  ) : null;
                                })()}
                                {(() => {
                                  const comp = brainAnalysisTextArray(analysis?.composition);
                                  return comp.length ? (
                                    <p className="mt-1 text-[10px] leading-snug text-zinc-600">
                                      <span className="font-semibold text-zinc-800">Composición:</span>{" "}
                                      {comp.slice(0, 10).join(" · ")}
                                    </p>
                                  ) : null;
                                })()}
                                {(() => {
                                  const dom = brainAnalysisTextArray(analysis?.colorPalette?.dominant);
                                  return dom.length ? (
                                    <p className="mt-1 text-[10px] leading-snug text-zinc-600">
                                      <span className="font-semibold text-zinc-800">Paleta dominante:</span>{" "}
                                      {dom.slice(0, 12).join(", ")}
                                    </p>
                                  ) : null;
                                })()}
                                {(() => {
                                  const msgs = brainAnalysisTextArray(analysis?.visualMessage);
                                  return msgs.length ? (
                                    <p className="mt-1 text-[10px] leading-snug text-zinc-600">
                                      <span className="font-semibold text-zinc-800">Mensaje visual:</span>{" "}
                                      {msgs.slice(0, 5).join(" · ")}
                                    </p>
                                  ) : null;
                                })()}
                                </div>
                              </div>
                              <div className="flex flex-shrink-0 flex-wrap gap-1.5 sm:justify-end">
                                <button
                                  type="button"
                                  disabled={!analysis}
                                  onClick={() => patchVisualAnalysisOverride(ref.id, "CORE_VISUAL_DNA")}
                                  className="rounded-[5px] border border-violet-500 bg-violet-600 px-2 py-1 text-[9px] font-black uppercase text-white disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  Core
                                </button>
                                <button
                                  type="button"
                                  disabled={!analysis}
                                  onClick={() => patchVisualAnalysisOverride(ref.id, "PROJECT_VISUAL_REFERENCE")}
                                  className="rounded-[5px] border border-sky-300 bg-sky-50 px-2 py-1 text-[9px] font-black uppercase text-sky-900 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  Proyecto
                                </button>
                                <button
                                  type="button"
                                  disabled={!analysis}
                                  onClick={() => patchVisualAnalysisOverride(ref.id, "CONTEXTUAL_VISUAL_MEMORY")}
                                  className="rounded-[5px] border border-amber-300 bg-amber-50 px-2 py-1 text-[9px] font-black uppercase text-amber-900 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  Contexto
                                </button>
                                <button
                                  type="button"
                                  disabled={!analysis}
                                  onClick={() => patchVisualAnalysisOverride(ref.id, "EXCLUDED")}
                                  className="rounded-[5px] border border-zinc-300 bg-white px-2 py-1 text-[9px] font-black uppercase text-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  Excluir
                                </button>
                                <button
                                  type="button"
                                  disabled={!analysis || !analysis.userVisualOverride}
                                  onClick={() => patchVisualAnalysisOverride(ref.id, undefined)}
                                  className="rounded-[5px] border border-zinc-200 bg-zinc-100 px-2 py-1 text-[9px] font-black uppercase text-zinc-600 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  Reset
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="rounded-[5px] border border-dashed border-zinc-200 bg-zinc-50 px-4 py-6 text-center text-[12px] text-zinc-500">
                    Sube imágenes desde Fuentes o Looks visuales: al terminar el análisis de la bandeja se actualiza la
                    visión remota sola cuando haga falta.
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab("knowledge")}
                    className="rounded-[5px] border border-zinc-300 bg-white px-4 py-2 text-[11px] font-black uppercase tracking-wide text-zinc-800 hover:bg-zinc-50"
                  >
                    Fuentes analizadas
                  </button>
                  <button
                    type="button"
                    disabled={visualQueueBusy || visualImageRefCount === 0}
                    onClick={() => void handleQueueVisualLearnings()}
                    className="rounded-[5px] border border-zinc-800 bg-zinc-900 px-4 py-2 text-[11px] font-black uppercase tracking-wide text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {visualQueueBusy ? "Enviando…" : "Revisar aprendizajes visuales"}
                  </button>
                </div>
              </div>
            )}

            {activeTab === "brand_visual_dna" && (
              <BrandVisualDnaPanel
                assets={assets}
                projectId={projectId ?? null}
                savedBundle={visualLayer?.brandVisualDnaBundle}
                onSaveBundleToBrain={saveBrandVisualDnaBundle}
                onDirty={() => onVisualReferenceAnalysisDirty?.()}
              />
            )}

            {activeTab === "knowledge" && (
              <>
                <p className="mb-4 rounded-[5px] border border-zinc-200 bg-zinc-50/80 px-3 py-2.5 text-[11px] leading-relaxed text-zinc-700">
                  La bandeja de <strong>ingesta y el resumen recibido</strong> están fijas arriba del panel
                  (visibles en todas las pestañas). Aquí gestionas cada archivo, su ADN extraído y el chat con Brain.
                </p>

                <section className="mt-5 rounded-[5px] border border-zinc-200 bg-white p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-[12px] font-black uppercase tracking-[0.12em] text-zinc-900">Inventario de sabiduría · {assets.knowledge.documents.length} activos</h3>
                    <div className="flex flex-wrap gap-2">
                      {filterTabs.map((f) => (
                        <button key={f} onClick={() => setActiveFilter(f)} className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-wide ${activeFilter === f ? "border-violet-700 bg-violet-700 text-white" : "border-zinc-200 bg-zinc-50 text-zinc-600"}`}>
                          {f}
                        </button>
                      ))}
                    </div>
                  </div>
                  {docsFiltered.length === 0 ? (
                    <p className="rounded-[5px] border border-dashed border-zinc-200 bg-zinc-50 px-3 py-8 text-center text-[12px] text-zinc-500">Bandeja vacía.</p>
                  ) : (
                    <ul className="space-y-3">
                      {docsFiltered.map((doc) => {
                        const previewUrl = resolveKnowledgeDocumentPreviewUrl(doc);
                        return (
                        <li key={doc.id} className="rounded-[5px] border border-zinc-200 bg-zinc-50 p-3">
                          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                            <div className="flex min-w-0 items-center gap-3">
                              {isKnowledgeImageDoc(doc) ? (
                                <BrainSourcePreview src={previewUrl} label={doc.name} />
                              ) : doc.format === "url" ? (
                                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[5px] border border-zinc-200 bg-white text-zinc-500">
                                  <Globe className="h-4 w-4" aria-hidden />
                                </span>
                              ) : (
                                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[5px] border border-zinc-200 bg-white text-zinc-500">
                                  <FileText className="h-4 w-4" aria-hidden />
                                </span>
                              )}
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  {!isKnowledgeImageDoc(doc) ? (
                                    <p className="truncate text-[12px] font-semibold text-zinc-900">{doc.name}</p>
                                  ) : null}
                                  <span className="rounded-[5px] border border-zinc-200 bg-white px-1.5 py-0.5 text-[9px] font-black uppercase text-zinc-500">{doc.format || "doc"}</span>
                                  <span className={`rounded-[5px] border px-1.5 py-0.5 text-[9px] font-black uppercase ${doc.scope === "context" ? "border-amber-200 bg-amber-50 text-amber-700" : "border-sky-200 bg-sky-50 text-sky-700"}`}>{doc.scope === "context" ? "Proyecto" : "Marca"}</span>
                                </div>
                                <p className="mt-1 text-[10px] text-zinc-500">{doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleDateString("es-ES") : "sin fecha"} · {formatSize(doc.size)} · status: {doc.status || "Subido"}</p>
                                {doc.errorMessage && <p className="mt-1 text-[10px] text-rose-600">{doc.errorMessage}</p>}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button onClick={() => void handleOpenOriginal(doc)} className="rounded-[5px] border border-zinc-200 bg-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-zinc-700 hover:bg-zinc-100"><span className="inline-flex items-center gap-1"><ExternalLink className="h-3.5 w-3.5" />Original</span></button>
                              {doc.status === "Analizado" && doc.extractedContext && (
                                <button onClick={() => toggleExpand(doc.id)} className="rounded-[5px] border border-zinc-200 bg-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-zinc-700 hover:bg-zinc-100"><span className="inline-flex items-center gap-1">{expandedDocs.has(doc.id) ? <>Colapsar ADN <ChevronUp className="h-3.5 w-3.5" /></> : <>Ver ADN <ChevronDown className="h-3.5 w-3.5" /></>}</span></button>
                              )}
                              <button onClick={() => void handleDelete(doc.id)} disabled={isDeleting === doc.id} className="rounded-[5px] border border-zinc-200 bg-white p-1.5 text-zinc-600 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50" aria-label="Eliminar">{isDeleting === doc.id ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}</button>
                            </div>
                          </div>
                          {doc.status === "Analizado" && doc.extractedContext && expandedDocs.has(doc.id) && (
                            <div className="mt-3 border-t border-zinc-200 pt-3">
                              {editingDocId === doc.id ? (
                                <div className="space-y-3">
                                  <div className="flex items-center justify-between">
                                    <p className="text-[10px] font-black uppercase tracking-wide text-zinc-600">Editando ADN</p>
                                    <div className="flex gap-2">
                                      <button onClick={() => setEditingDocId(null)} className="rounded-[5px] border border-zinc-200 bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-zinc-600 hover:bg-zinc-100"><span className="inline-flex items-center gap-1"><XIcon className="h-3.5 w-3.5" />Cancelar</span></button>
                                      <button onClick={() => void handleSaveAdn(doc.id)} className="rounded-[5px] border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white hover:bg-black"><span className="inline-flex items-center gap-1"><Save className="h-3.5 w-3.5" />Guardar</span></button>
                                    </div>
                                  </div>
                                  <textarea value={JSON.stringify(editForm, null, 2)} onChange={(e) => { try { setEditForm(JSON.parse(e.target.value)); } catch { setEditForm({ raw: e.target.value }); } }} className="h-56 w-full rounded-[5px] border border-zinc-200 bg-white p-3 font-mono text-[12px] text-zinc-900 outline-none focus:border-sky-500" />
                                </div>
                              ) : (
                                <div>
                                  <div className="mb-2 flex justify-end">
                                    <button onClick={() => startEditing(doc)} className="rounded-[5px] border border-zinc-200 bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-zinc-600 hover:bg-zinc-100"><span className="inline-flex items-center gap-1"><Edit3 className="h-3.5 w-3.5" />Editar matriz</span></button>
                                  </div>
                                  {doc.insights && (
                                    <div className="mb-3 grid grid-cols-1 gap-2 lg:grid-cols-2">
                                      <article className="rounded-[5px] border border-zinc-200 bg-white p-2.5">
                                        <p className="text-[10px] font-black uppercase tracking-wide text-zinc-500">Claims extraídos</p>
                                        <div className="mt-1 flex flex-wrap gap-1">
                                          {doc.insights.claims.length === 0 && <span className="text-[10px] text-zinc-500">Sin claims</span>}
                                          {doc.insights.claims.map((x, i) => <span key={`${doc.id}-c-${i}`} className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] text-sky-800">{x}</span>)}
                                        </div>
                                      </article>
                                      <article className="rounded-[5px] border border-zinc-200 bg-white p-2.5">
                                        <p className="text-[10px] font-black uppercase tracking-wide text-zinc-500">Métricas detectadas</p>
                                        <div className="mt-1 flex flex-wrap gap-1">
                                          {doc.insights.metrics.length === 0 && <span className="text-[10px] text-zinc-500">Sin métricas</span>}
                                          {doc.insights.metrics.map((x, i) => <span key={`${doc.id}-m-${i}`} className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-800">{x}</span>)}
                                        </div>
                                      </article>
                                      <article className="rounded-[5px] border border-zinc-200 bg-white p-2.5 lg:col-span-2">
                                        <p className="text-[10px] font-black uppercase tracking-wide text-zinc-500">Uso potencial · frescura · fiabilidad · piezas usadas</p>
                                        <p className="mt-1 text-[11px] text-zinc-700">
                                          Uso: {(doc.insights.potentialUse || []).join(" · ") || "No definido"}.
                                          Frescura: {doc.insights.freshness || "sin fecha"}.
                                          Fiabilidad: {doc.insights.reliability || 0}/100.
                                          Piezas: {(doc.insights.usedInPieces || []).length}.
                                        </p>
                                      </article>
                                    </div>
                                  )}
                                  <p className="mb-1 text-[10px] font-black uppercase tracking-wide text-zinc-500">JSON ADN</p>
                                  <pre className="whitespace-pre-wrap rounded-[5px] border border-zinc-200 bg-white p-3 font-mono text-[11px] leading-relaxed text-zinc-800">{doc.extractedContext}</pre>
                                </div>
                              )}
                            </div>
                          )}
                        </li>
                        );
                      })}
                    </ul>
                  )}
                </section>

                <section className="mt-5 rounded-[5px] border border-zinc-200 bg-white p-4">
                  <div className="mb-3 flex items-start gap-2">
                    <span className="mt-0.5 rounded-[5px] border border-zinc-200 bg-zinc-50 p-1.5 text-zinc-600"><MessageSquareText className="h-4 w-4" /></span>
                    <div>
                      <h3 className="text-[12px] font-black uppercase tracking-[0.12em] text-zinc-900">Conversar con Brain</h3>
                      <p className="mt-1 text-[11px] text-zinc-600">Responde solo con contenido subido y analizado.</p>
                    </div>
                  </div>

                  <div className="max-h-[300px] space-y-2 overflow-auto rounded-[5px] border border-zinc-200 bg-zinc-50 p-3">
                    {chatMessages.map((m) => (
                      <article key={m.id} className={`rounded-[5px] border px-3 py-2 ${m.role === "user" ? "ml-8 border-sky-200 bg-sky-50" : "mr-8 border-zinc-200 bg-white"}`}>
                        <p className="text-[11px] font-black uppercase tracking-wide text-zinc-500">{m.role === "user" ? "Tú" : "Brain"}</p>
                        <p className="mt-1 whitespace-pre-wrap text-[12px] leading-relaxed text-zinc-800">{m.text}</p>
                        {m.sources && m.sources.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{m.sources.map((s) => <span key={`${m.id}-${s.id}`} className="rounded-[5px] border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[9px] font-semibold text-zinc-600">{s.name}</span>)}</div>}
                        {m.suggestedUploads && m.suggestedUploads.length > 0 && <div className="mt-2"><p className="text-[10px] font-black uppercase tracking-wide text-zinc-500">Ideas para subir más</p><div className="mt-1 flex flex-wrap gap-1.5">{m.suggestedUploads.map((s, idx) => <span key={`${m.id}-${idx}`} className="rounded-[5px] border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700">{s}</span>)}</div></div>}
                      </article>
                    ))}
                    {chatLoading && <article className="mr-8 rounded-[5px] border border-zinc-200 bg-white px-3 py-2"><p className="text-[11px] font-black uppercase tracking-wide text-zinc-500">Brain</p><p className="mt-1 inline-flex items-center gap-2 text-[12px] text-zinc-700"><RefreshCw className="h-3.5 w-3.5 animate-spin" />Pensando...</p></article>}
                  </div>

                  <div className="mt-3 flex gap-2">
                    <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), void submitChatQuestion())} placeholder="Pregunta sobre el contenido de Brain..." className="min-w-0 flex-1 rounded-[5px] border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-[13px]" />
                    <button onClick={() => void submitChatQuestion()} disabled={chatLoading || !chatInput.trim()} className="inline-flex items-center gap-1.5 rounded-[5px] border border-zinc-800 bg-zinc-900 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-white disabled:opacity-50"><Send className="h-3.5 w-3.5" />Enviar</button>
                  </div>
                </section>
              </>
            )}

            {activeTab === "voice" && (
              <div className="space-y-5">
                <section className="rounded-[5px] border border-zinc-200 bg-white p-4">
                  <h3 className="text-[13px] font-black uppercase tracking-[0.12em] text-zinc-900">Ejemplos reales de voz</h3>
                  <p className="mt-1 text-[12px] text-zinc-600">El modelo aprende por analogía: ejemplos aprobados/prohibidos y piezas reales.</p>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <select value={voiceKind} onChange={(e) => setVoiceKind(e.target.value as BrainVoiceExample["kind"])} className="rounded-[5px] border border-zinc-200 bg-zinc-50 px-3 py-2 text-[12px]">
                      <option value="approved_voice">Voz aprobada</option>
                      <option value="forbidden_voice">Voz prohibida</option>
                      <option value="good_piece">Pieza que sí suena</option>
                      <option value="bad_piece">Pieza que NO suena</option>
                    </select>
                    <input value={voiceText} onChange={(e) => setVoiceText(e.target.value)} placeholder="Añade frase o ejemplo real" className="min-w-0 flex-1 rounded-[5px] border border-zinc-200 bg-zinc-50 px-3 py-2 text-[12px]" />
                    <button onClick={addVoiceExample} className="rounded-[5px] border border-zinc-800 bg-zinc-900 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-white">Añadir</button>
                  </div>
                  <div className="mt-3 space-y-2">
                    {assets.strategy.voiceExamples.length === 0 && <p className="text-[12px] text-zinc-500">Aún no hay ejemplos guardados.</p>}
                    {assets.strategy.voiceExamples.map((v) => (
                      <div key={v.id} className="rounded-[5px] border border-zinc-200 bg-zinc-50 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-[10px] font-black uppercase tracking-wide text-zinc-500">{v.kind}</span>
                          <button onClick={() => removeVoiceExample(v.id)} className="rounded p-1 text-zinc-500 hover:bg-zinc-200 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                        <p className="mt-1 text-[12px] leading-relaxed text-zinc-800">{v.text}</p>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="rounded-[5px] border border-zinc-200 bg-white p-4">
                  <h3 className="text-[13px] font-black uppercase tracking-[0.12em] text-zinc-900">Tabús y frases aprobadas</h3>
                  <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <div>
                      <p className="mb-2 text-[11px] font-black uppercase tracking-wide text-zinc-600">Tabú de marca</p>
                      <div className="flex gap-2">
                        <input value={newTaboo} onChange={(e) => setNewTaboo(e.target.value)} placeholder="frase a evitar" className="min-w-0 flex-1 rounded-[5px] border border-zinc-200 bg-zinc-50 px-3 py-2 text-[12px]" />
                        <button onClick={() => { addTagItem("taboo", newTaboo); setNewTaboo(""); }} className="rounded-[5px] border border-zinc-800 bg-zinc-900 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-white">Añadir</button>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">{assets.strategy.tabooPhrases.map((x, i) => <button key={`${x}-${i}`} onClick={() => removeTagItem("taboo", i)} className="rounded-full border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] font-semibold text-rose-700">{x} ×</button>)}</div>
                    </div>
                    <div>
                      <p className="mb-2 text-[11px] font-black uppercase tracking-wide text-zinc-600">Frases aprobadas</p>
                      <div className="flex gap-2">
                        <input value={newApprovedPhrase} onChange={(e) => setNewApprovedPhrase(e.target.value)} placeholder="frase aprobada" className="min-w-0 flex-1 rounded-[5px] border border-zinc-200 bg-zinc-50 px-3 py-2 text-[12px]" />
                        <button onClick={() => { addTagItem("approved", newApprovedPhrase); setNewApprovedPhrase(""); }} className="rounded-[5px] border border-zinc-800 bg-zinc-900 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-white">Añadir</button>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">{assets.strategy.approvedPhrases.map((x, i) => <button key={`${x}-${i}`} onClick={() => removeTagItem("approved", i)} className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">{x} ×</button>)}</div>
                    </div>
                  </div>
                </section>

                <section className="rounded-[5px] border border-zinc-200 bg-white p-4">
                  <h3 className="text-[13px] font-black uppercase tracking-[0.12em] text-zinc-900">Ingeniería de voz (funcional)</h3>
                  <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <div>
                      <p className="mb-2 text-[11px] font-black uppercase tracking-wide text-zinc-600">Rasgos de lenguaje</p>
                      <div className="flex gap-2">
                        <input value={newLanguageTrait} onChange={(e) => setNewLanguageTrait(e.target.value)} placeholder="ej: directo, preciso, anti-humo" className="min-w-0 flex-1 rounded-[5px] border border-zinc-200 bg-zinc-50 px-3 py-2 text-[12px]" />
                        <button onClick={() => { addStringListItem("languageTraits", newLanguageTrait); setNewLanguageTrait(""); }} className="rounded-[5px] border border-zinc-800 bg-zinc-900 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-white">Añadir</button>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">{assets.strategy.languageTraits.map((x, i) => <button key={`${x}-${i}`} onClick={() => removeStringListItem("languageTraits", i)} className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-1 text-[10px] text-indigo-700">{x} ×</button>)}</div>
                    </div>
                    <div>
                      <p className="mb-2 text-[11px] font-black uppercase tracking-wide text-zinc-600">Patrones de sintaxis</p>
                      <div className="flex gap-2">
                        <input value={newSyntaxPattern} onChange={(e) => setNewSyntaxPattern(e.target.value)} placeholder="ej: frases cortas + cierre accionable" className="min-w-0 flex-1 rounded-[5px] border border-zinc-200 bg-zinc-50 px-3 py-2 text-[12px]" />
                        <button onClick={() => { addStringListItem("syntaxPatterns", newSyntaxPattern); setNewSyntaxPattern(""); }} className="rounded-[5px] border border-zinc-800 bg-zinc-900 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-white">Añadir</button>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">{assets.strategy.syntaxPatterns.map((x, i) => <button key={`${x}-${i}`} onClick={() => removeStringListItem("syntaxPatterns", i)} className="rounded-full border border-blue-200 bg-blue-50 px-2 py-1 text-[10px] text-blue-700">{x} ×</button>)}</div>
                    </div>
                    <div>
                      <p className="mb-2 text-[11px] font-black uppercase tracking-wide text-zinc-600">Términos preferidos</p>
                      <div className="flex gap-2">
                        <input value={newPreferredTerm} onChange={(e) => setNewPreferredTerm(e.target.value)} placeholder="ej: control creativo, flujo unificado" className="min-w-0 flex-1 rounded-[5px] border border-zinc-200 bg-zinc-50 px-3 py-2 text-[12px]" />
                        <button onClick={() => { addStringListItem("preferredTerms", newPreferredTerm); setNewPreferredTerm(""); }} className="rounded-[5px] border border-zinc-800 bg-zinc-900 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-white">Añadir</button>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">{assets.strategy.preferredTerms.map((x, i) => <button key={`${x}-${i}`} onClick={() => removeStringListItem("preferredTerms", i)} className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] text-emerald-700">{x} ×</button>)}</div>
                    </div>
                    <div>
                      <p className="mb-2 text-[11px] font-black uppercase tracking-wide text-zinc-600">Términos prohibidos</p>
                      <div className="flex gap-2">
                        <input value={newForbiddenTerm} onChange={(e) => setNewForbiddenTerm(e.target.value)} placeholder="ej: mejor del mundo, garantía total" className="min-w-0 flex-1 rounded-[5px] border border-zinc-200 bg-zinc-50 px-3 py-2 text-[12px]" />
                        <button onClick={() => { addStringListItem("forbiddenTerms", newForbiddenTerm); setNewForbiddenTerm(""); }} className="rounded-[5px] border border-zinc-800 bg-zinc-900 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-white">Añadir</button>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">{assets.strategy.forbiddenTerms.map((x, i) => <button key={`${x}-${i}`} onClick={() => removeStringListItem("forbiddenTerms", i)} className="rounded-full border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] text-rose-700">{x} ×</button>)}</div>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
                    <div className="rounded-[5px] border border-zinc-200 bg-zinc-50 p-3">
                      <p className="text-[11px] font-black uppercase tracking-wide text-zinc-600">Intensidad por canal</p>
                      <div className="mt-2 flex items-center gap-2">
                        <input value={channelIntensityName} onChange={(e) => setChannelIntensityName(e.target.value)} placeholder="LinkedIn, Email, Instagram..." className="min-w-0 flex-1 rounded-[5px] border border-zinc-200 bg-white px-3 py-2 text-[12px]" />
                        <input type="number" min={0} max={100} value={channelIntensityValue} onChange={(e) => setChannelIntensityValue(Number(e.target.value) || 0)} className="w-20 rounded-[5px] border border-zinc-200 bg-white px-2 py-2 text-[12px]" />
                        <button onClick={addChannelIntensity} className="rounded-[5px] border border-zinc-800 bg-zinc-900 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-white">Añadir</button>
                      </div>
                      <div className="mt-2 space-y-1.5">
                        {assets.strategy.channelIntensity.map((x, i) => (
                          <div key={`${x.channel}-${i}`} className="flex items-center justify-between rounded-[5px] border border-zinc-200 bg-white px-2 py-1.5 text-[11px]">
                            <span>{x.channel}</span>
                            <span className="inline-flex items-center gap-2"><strong>{x.intensity}%</strong><button onClick={() => removeChannelIntensity(i)} className="text-rose-600">×</button></span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-[5px] border border-zinc-200 bg-zinc-50 p-3">
                      <p className="text-[11px] font-black uppercase tracking-wide text-zinc-600">Claims absolutos</p>
                      <div className="mt-2 flex items-center justify-between rounded-[5px] border border-zinc-200 bg-white px-3 py-2">
                        <span className="text-[12px] text-zinc-700">Permitir absolutos (“el mejor”, “siempre”)</span>
                        <button
                          onClick={() => {
                            if (!guardBrandWrite("No se pueden editar reglas de Marca.")) return;
                            setStrategy({ allowAbsoluteClaims: !assets.strategy.allowAbsoluteClaims }, [
                              BRAIN_STALE_REASON.STRATEGY_MANUALLY_CHANGED,
                            ]);
                          }}
                          className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase ${assets.strategy.allowAbsoluteClaims ? "border-emerald-300 bg-emerald-100 text-emerald-700" : "border-zinc-300 bg-zinc-100 text-zinc-700"}`}
                        >
                          {assets.strategy.allowAbsoluteClaims ? "Permitidos" : "Bloqueados"}
                        </button>
                      </div>
                    </div>
                  </div>
                </section>
              </div>
            )}

            {activeTab === "personas" && (
              <div className="space-y-5">
                <section className="rounded-[5px] border border-zinc-200 bg-white p-4">
                  <h3 className="text-[13px] font-black uppercase tracking-[0.12em] text-zinc-900">Personas de audiencia</h3>
                  <p className="mt-1 text-[12px] text-zinc-600">Mostramos solo las personas relevantes para este proyecto. El resto está en “+ Nueva persona”.</p>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {assets.strategy.personas.length === 0 && <p className="text-[12px] text-zinc-500">No hay personas aún.</p>}
                    {assets.strategy.personas.map((p) => (
                      <article key={p.id} className="rounded-[5px] border border-zinc-200 bg-zinc-50 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="text-[13px] font-black text-zinc-900">{p.name}</h4>
                          <button onClick={() => removePersona(p.id)} className="rounded p-1 text-zinc-500 hover:bg-zinc-200 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                        <p className="mt-1 text-[11px] text-zinc-600">Dolor: {p.pain || "-"}</p>
                        <p className="mt-1 text-[11px] text-zinc-600">Canal: {p.channel || "-"}</p>
                        <p className="mt-1 text-[11px] text-zinc-600">Sofisticación: {p.sophistication || "-"}</p>
                        <p className="mt-1 text-[11px] text-zinc-600">Objeciones: {(p.objections || []).slice(0, 2).join(" · ") || "-"}</p>
                        <p className="mt-1 text-[11px] text-zinc-600">Prueba necesaria: {(p.proofNeeded || []).slice(0, 2).join(" · ") || "-"}</p>
                        <p className="mt-1 text-[11px] text-zinc-600">Disparadores: {(p.attentionTriggers || []).slice(0, 2).join(" · ") || "-"}</p>
                        <p className="mt-1 text-[11px] text-zinc-600">Sofisticación mercado: {p.marketSophistication || "-"}</p>
                        <div className="mt-2 flex flex-wrap gap-1.5">{p.tags.map((t, i) => <span key={`${p.id}-${t}-${i}`} className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[10px] text-zinc-600">{t}</span>)}</div>
                      </article>
                    ))}
                    <button
                      type="button"
                      onClick={() => setPersonaModalOpen(true)}
                      className="flex min-h-[182px] items-center justify-center rounded-[5px] border-2 border-dashed border-zinc-300 bg-zinc-50 text-lg font-semibold text-zinc-500 transition hover:border-zinc-400 hover:text-zinc-700"
                    >
                      + Nueva persona
                    </button>
                  </div>
                </section>

                {personaModalOpen && (
                  <div className="fixed inset-0 z-[100120] flex items-center justify-center bg-black/40 p-4">
                    <div className="max-h-[85vh] w-full max-w-5xl overflow-auto rounded-[5px] border border-zinc-200 bg-white p-4 sm:p-5">
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <div>
                          <h4 className="text-sm font-black uppercase tracking-[0.12em] text-zinc-900">Añadir Nueva Persona</h4>
                          <p className="mt-1 text-[12px] text-zinc-600">Selecciona del catálogo restante o crea una persona manual.</p>
                        </div>
                        <button onClick={() => setPersonaModalOpen(false)} className="rounded-[5px] border border-zinc-200 bg-white p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700">
                          <XIcon className="h-4 w-4" />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {personaCatalogRemaining.length === 0 && (
                          <p className="text-[12px] text-zinc-500">No quedan perfiles predefinidos por adjuntar.</p>
                        )}
                        {personaCatalogRemaining.map((persona) => (
                          <article key={persona.id} className="rounded-[5px] border border-zinc-200 bg-zinc-50 p-3">
                            <div className="flex items-start justify-between gap-2">
                              <h5 className="text-[13px] font-black text-zinc-900">{persona.name}</h5>
                              <button
                                onClick={() => addCatalogPersona(persona)}
                                className="rounded-[5px] border border-zinc-300 bg-white px-2 py-1 text-[10px] font-black uppercase tracking-wide text-zinc-700 hover:bg-zinc-100"
                              >
                                Adjuntar
                              </button>
                            </div>
                            <p className="mt-1 text-[11px] text-zinc-600">{persona.pain}</p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {[...persona.tags, persona.channel].slice(0, 4).map((tag, i) => (
                                <span key={`${persona.id}-${tag}-${i}`} className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[10px] text-zinc-600">
                                  {tag}
                                </span>
                              ))}
                            </div>
                          </article>
                        ))}
                      </div>

                      <section className="mt-5 rounded-[5px] border border-zinc-200 bg-zinc-50 p-3">
                        <h5 className="text-[12px] font-black uppercase tracking-[0.12em] text-zinc-900">Creación manual (opción B)</h5>
                        <div className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-2">
                          <input value={personaName} onChange={(e) => setPersonaName(e.target.value)} placeholder="Nombre persona" className="rounded-[5px] border border-zinc-200 bg-white px-3 py-2 text-[12px]" />
                          <input value={personaPain} onChange={(e) => setPersonaPain(e.target.value)} placeholder="Dolor principal" className="rounded-[5px] border border-zinc-200 bg-white px-3 py-2 text-[12px]" />
                          <input value={personaChannel} onChange={(e) => setPersonaChannel(e.target.value)} placeholder="Canal principal" className="rounded-[5px] border border-zinc-200 bg-white px-3 py-2 text-[12px]" />
                          <input value={personaSophistication} onChange={(e) => setPersonaSophistication(e.target.value)} placeholder="Nivel de sofisticación" className="rounded-[5px] border border-zinc-200 bg-white px-3 py-2 text-[12px]" />
                          <input value={personaMarketSophistication} onChange={(e) => setPersonaMarketSophistication(e.target.value)} placeholder="Sofisticación del mercado" className="rounded-[5px] border border-zinc-200 bg-white px-3 py-2 text-[12px]" />
                          <input value={personaTags} onChange={(e) => setPersonaTags(e.target.value)} placeholder="Tags (coma separada)" className="rounded-[5px] border border-zinc-200 bg-white px-3 py-2 text-[12px] lg:col-span-2" />
                          <input value={personaObjections} onChange={(e) => setPersonaObjections(e.target.value)} placeholder="Objeciones (coma separada)" className="rounded-[5px] border border-zinc-200 bg-white px-3 py-2 text-[12px] lg:col-span-2" />
                          <input value={personaProofNeeded} onChange={(e) => setPersonaProofNeeded(e.target.value)} placeholder="Prueba que necesita (coma separada)" className="rounded-[5px] border border-zinc-200 bg-white px-3 py-2 text-[12px] lg:col-span-2" />
                          <input value={personaAttentionTriggers} onChange={(e) => setPersonaAttentionTriggers(e.target.value)} placeholder="Disparadores de atención (coma separada)" className="rounded-[5px] border border-zinc-200 bg-white px-3 py-2 text-[12px] lg:col-span-2" />
                        </div>
                        <div className="mt-3 flex justify-end">
                          <button onClick={addPersona} className="rounded-[5px] border border-zinc-800 bg-zinc-900 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-white">Añadir persona manual</button>
                        </div>
                      </section>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === "messages" && (
              <div className="space-y-5">
                <section className="rounded-[5px] border border-zinc-200 bg-white p-4">
                  <h3 className="text-[13px] font-black uppercase tracking-[0.12em] text-zinc-900">Matriz de mensajes (claim + soporte)</h3>
                  <div className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-2">
                    <input value={messageClaimDraft} onChange={(e) => setMessageClaimDraft(e.target.value)} placeholder="Claim" className="rounded-[5px] border border-zinc-200 bg-zinc-50 px-3 py-2 text-[12px]" />
                    <input value={messageSupportDraft} onChange={(e) => setMessageSupportDraft(e.target.value)} placeholder="Soporte" className="rounded-[5px] border border-zinc-200 bg-zinc-50 px-3 py-2 text-[12px]" />
                    <input value={messageAudienceDraft} onChange={(e) => setMessageAudienceDraft(e.target.value)} placeholder="Audiencia" className="rounded-[5px] border border-zinc-200 bg-zinc-50 px-3 py-2 text-[12px]" />
                    <input value={messageChannelDraft} onChange={(e) => setMessageChannelDraft(e.target.value)} placeholder="Canal" className="rounded-[5px] border border-zinc-200 bg-zinc-50 px-3 py-2 text-[12px]" />
                    <select value={funnelStageDraft} onChange={(e) => setFunnelStageDraft(e.target.value as "awareness" | "consideration" | "conversion" | "retention")} className="rounded-[5px] border border-zinc-200 bg-zinc-50 px-3 py-2 text-[12px]">
                      <option value="awareness">Awareness</option>
                      <option value="consideration">Consideración</option>
                      <option value="conversion">Conversión</option>
                      <option value="retention">Retención</option>
                    </select>
                    <input value={messageCtaDraft} onChange={(e) => setMessageCtaDraft(e.target.value)} placeholder="CTA" className="rounded-[5px] border border-zinc-200 bg-zinc-50 px-3 py-2 text-[12px]" />
                    <input value={messageEvidenceDraft} onChange={(e) => setMessageEvidenceDraft(e.target.value)} placeholder="Evidencia asociada (coma separada)" className="rounded-[5px] border border-zinc-200 bg-zinc-50 px-3 py-2 text-[12px] lg:col-span-2" />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button onClick={addMessageBlueprint} className="rounded-[5px] border border-zinc-800 bg-zinc-900 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-white">Añadir fila de matriz</button>
                    <button onClick={addFunnelMessage} className="rounded-[5px] border border-zinc-300 bg-white px-3 py-2 text-[11px] font-black uppercase tracking-wide text-zinc-700">Añadir mensaje simple</button>
                  </div>
                  <div className="mt-3 space-y-2">
                    {assets.strategy.messageBlueprints.map((m) => (
                      <div key={m.id} className="rounded-[5px] border border-zinc-200 bg-zinc-50 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase text-zinc-600">{m.stage}</span>
                          <button onClick={() => removeMessageBlueprint(m.id)} className="rounded p-1 text-zinc-500 hover:bg-zinc-200 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                        <p className="mt-1 text-[12px] text-zinc-900"><strong>Claim:</strong> {m.claim}</p>
                        <p className="mt-1 text-[11px] text-zinc-700"><strong>Soporte:</strong> {m.support || "-"}</p>
                        <p className="mt-1 text-[11px] text-zinc-700"><strong>Audiencia:</strong> {m.audience || "-"} · <strong>Canal:</strong> {m.channel || "-"}</p>
                        <p className="mt-1 text-[11px] text-zinc-700"><strong>CTA:</strong> {m.cta || "-"}</p>
                        <p className="mt-1 text-[11px] text-zinc-700"><strong>Evidencia:</strong> {(m.evidence || []).join(" | ") || "-"}</p>
                      </div>
                    ))}
                    {assets.strategy.funnelMessages.length > 0 && (
                      <details className="rounded-[5px] border border-zinc-200 bg-white p-2.5">
                        <summary className="cursor-pointer text-[11px] font-semibold text-zinc-700">Mensajes simples legacy ({assets.strategy.funnelMessages.length})</summary>
                        <div className="mt-2 space-y-2">
                          {assets.strategy.funnelMessages.map((m) => (
                            <div key={m.id} className="rounded-[5px] border border-zinc-200 bg-zinc-50 p-2">
                              <div className="flex items-center justify-between gap-2">
                                <span className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase text-zinc-600">{m.stage}</span>
                                <button onClick={() => removeFunnelMessage(m.id)} className="rounded p-1 text-zinc-500 hover:bg-zinc-200 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>
                              </div>
                              <p className="mt-1 text-[12px] text-zinc-800">{m.text}</p>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                </section>

                <section className="rounded-[5px] border border-zinc-200 bg-white p-4">
                  <h3 className="text-[13px] font-black uppercase tracking-[0.12em] text-zinc-900">Briefing estructurado (antes de generar)</h3>
                  <p className="mt-1 text-[11px] text-zinc-600">
                    Fuentes oficiales activas para generación: {filteredFactsForGeneration.length} (según filtros de “Hechos y pruebas”).
                  </p>
                  <div className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-2">
                    <input value={briefObjective} onChange={(e) => setBriefObjective(e.target.value)} placeholder="Objetivo de la pieza" className="rounded-[5px] border border-zinc-200 bg-zinc-50 px-3 py-2 text-[12px]" />
                    <input value={briefChannel} onChange={(e) => setBriefChannel(e.target.value)} placeholder="Canal (LinkedIn, blog, etc.)" className="rounded-[5px] border border-zinc-200 bg-zinc-50 px-3 py-2 text-[12px]" />
                    <select value={briefPersonaId} onChange={(e) => setBriefPersonaId(e.target.value)} className="rounded-[5px] border border-zinc-200 bg-zinc-50 px-3 py-2 text-[12px]">
                      <option value="">Selecciona persona</option>
                      {assets.strategy.personas.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                    <select value={briefFunnel} onChange={(e) => setBriefFunnel(e.target.value as "awareness" | "consideration" | "conversion" | "retention")} className="rounded-[5px] border border-zinc-200 bg-zinc-50 px-3 py-2 text-[12px]">
                      <option value="awareness">Awareness</option>
                      <option value="consideration">Consideración</option>
                      <option value="conversion">Conversión</option>
                      <option value="retention">Retención</option>
                    </select>
                    <textarea value={briefAsk} onChange={(e) => setBriefAsk(e.target.value)} placeholder="Instrucción adicional (opcional)" className="rounded-[5px] border border-zinc-200 bg-zinc-50 px-3 py-2 text-[12px] lg:col-span-2" rows={3} />
                  </div>
                  <button onClick={() => void generateWithBriefing()} disabled={generatingPiece} className="mt-3 rounded-[5px] border border-zinc-800 bg-zinc-900 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-white disabled:opacity-50">{generatingPiece ? "Generando..." : "Crear pieza con este ADN"}</button>
                </section>

                {generatedPreview && (
                  <section className="rounded-[5px] border border-zinc-200 bg-white p-4">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <h3 className="text-[13px] font-black uppercase tracking-[0.12em] text-zinc-900">Modo crítico automático</h3>
                      <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[10px] font-semibold text-zinc-600">Score {generatedPreview.score}/100</span>
                    </div>
                    {generatedPreview.issues.length > 0 && <div className="mb-2 flex flex-wrap gap-1.5">{generatedPreview.issues.map((i, idx) => <span key={`${i}-${idx}`} className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] text-amber-700">{i}</span>)}</div>}
                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                      <article className="rounded-[5px] border border-zinc-200 bg-zinc-50 p-3">
                        <p className="mb-1 text-[10px] font-black uppercase tracking-wide text-zinc-500">Borrador inicial</p>
                        <pre className="whitespace-pre-wrap text-[12px] leading-relaxed text-zinc-800">{generatedPreview.draft}</pre>
                      </article>
                      <article className="rounded-[5px] border border-zinc-200 bg-zinc-50 p-3">
                        <p className="mb-1 text-[10px] font-black uppercase tracking-wide text-zinc-500">Versión revisada</p>
                        <pre className="whitespace-pre-wrap text-[12px] leading-relaxed text-zinc-800">{generatedPreview.revised}</pre>
                      </article>
                    </div>
                    <article className="mt-3 rounded-[5px] border border-zinc-200 bg-zinc-50 p-3">
                      <p className="mb-1 text-[10px] font-black uppercase tracking-wide text-zinc-500">Crítica</p>
                      <p className="text-[12px] leading-relaxed text-zinc-800">{generatedPreview.critique}</p>
                    </article>
                    <div className="mt-3">
                      <textarea value={pieceFeedbackNote} onChange={(e) => setPieceFeedbackNote(e.target.value)} placeholder="Nota del equipo (opcional)" className="w-full rounded-[5px] border border-zinc-200 bg-zinc-50 px-3 py-2 text-[12px]" rows={2} />
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button onClick={() => registerLearning("approved")} className="rounded-[5px] border border-emerald-600 bg-emerald-600 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-white">Aprobar y aprender</button>
                        <button onClick={() => registerLearning("rejected")} className="rounded-[5px] border border-rose-600 bg-rose-600 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-white">Rechazar y aprender</button>
                      </div>
                    </div>
                  </section>
                )}

                <section className="rounded-[5px] border border-zinc-200 bg-white p-4">
                  <h3 className="text-[13px] font-black uppercase tracking-[0.12em] text-zinc-900">Bucle de aprendizaje</h3>
                  <p className="mt-1 text-[12px] text-zinc-600">Lo aprobado y rechazado vuelve al ADN para afinar futuras piezas.</p>
                  <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
                    <article className="rounded-[5px] border border-zinc-200 bg-zinc-50 p-3">
                      <p className="text-[10px] font-black uppercase tracking-wide text-zinc-500">Patrones aprobados</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">{assets.strategy.approvedPatterns.slice(0, 20).map((p, i) => <span key={`${p}-${i}`} className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-700">{p}</span>)}</div>
                    </article>
                    <article className="rounded-[5px] border border-zinc-200 bg-zinc-50 p-3">
                      <p className="text-[10px] font-black uppercase tracking-wide text-zinc-500">Patrones a evitar</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">{assets.strategy.rejectedPatterns.slice(0, 20).map((p, i) => <span key={`${p}-${i}`} className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] text-rose-700">{p}</span>)}</div>
                    </article>
                  </div>
                  <div className="mt-3 space-y-2">
                    {assets.strategy.generatedPieces.slice(0, 8).map((g) => (
                      <article key={g.id} className="rounded-[5px] border border-zinc-200 bg-zinc-50 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[11px] font-semibold text-zinc-800">{g.objective || "Pieza"}</p>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${g.status === "approved" ? "border border-emerald-200 bg-emerald-50 text-emerald-700" : g.status === "rejected" ? "border border-rose-200 bg-rose-50 text-rose-700" : "border border-zinc-200 bg-white text-zinc-600"}`}>{g.status}</span>
                        </div>
                        <p className="mt-1 text-[10px] text-zinc-500">{new Date(g.createdAt).toLocaleString("es-ES")} · {g.channel} · {g.funnelStage}</p>
                      </article>
                    ))}
                  </div>
                </section>
              </div>
            )}

            {activeTab === "facts" && (
              <div className="space-y-5">
                <section className="rounded-[5px] border border-zinc-200 bg-white p-4">
                  <h3 className="text-[13px] font-black uppercase tracking-[0.12em] text-zinc-900">Hechos y pruebas</h3>
                  <p className="mt-1 text-[12px] text-zinc-600">
                    Este módulo separa afirmaciones verificadas vs interpretadas y muestra el respaldo documental.
                  </p>
                  <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
                    <select
                      value={factsVerificationFilter}
                      onChange={(e) => setFactsVerificationFilter(e.target.value as "all" | "verified" | "interpreted")}
                      className="rounded-[5px] border border-zinc-200 bg-zinc-50 px-3 py-2 text-[12px]"
                    >
                      <option value="all">Verificación: Todas</option>
                      <option value="verified">Verificación: Solo verificadas</option>
                      <option value="interpreted">Verificación: Solo interpretadas</option>
                    </select>
                    <select
                      value={factsStrengthFilter}
                      onChange={(e) => setFactsStrengthFilter(e.target.value as "all" | "fuerte" | "media" | "debil")}
                      className="rounded-[5px] border border-zinc-200 bg-zinc-50 px-3 py-2 text-[12px]"
                    >
                      <option value="all">Fuerza: Todas</option>
                      <option value="fuerte">Fuerza: Fuerte</option>
                      <option value="media">Fuerza: Media</option>
                      <option value="debil">Fuerza: Débil</option>
                    </select>
                    <button
                      onClick={() => { setFactsVerificationFilter("verified"); setFactsStrengthFilter("fuerte"); }}
                      className="rounded-[5px] border border-zinc-300 bg-white px-3 py-2 text-[11px] font-black uppercase tracking-wide text-zinc-700"
                    >
                      Reset recomendado
                    </button>
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-3">
                    {filteredFactsForGeneration.length === 0 && (
                      <p className="rounded-[5px] border border-dashed border-zinc-200 bg-zinc-50 px-3 py-6 text-center text-[12px] text-zinc-500">
                        Aún no hay hechos detectados. Sube fuentes desde la bandeja superior (se procesan solas).
                      </p>
                    )}
                    {filteredFactsForGeneration.map((f) => (
                      <article key={f.id} className="rounded-[5px] border border-zinc-200 bg-zinc-50 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${f.verified ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
                            {f.verified ? "Verificado" : "Interpretado"}
                          </span>
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${f.strength === "fuerte" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : f.strength === "media" ? "border-amber-200 bg-amber-50 text-amber-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}>
                            Fuerza: {f.strength}
                          </span>
                        </div>
                        <p className="mt-2 text-[12px] font-semibold text-zinc-900">{f.claim}</p>
                        <p className="mt-1 text-[11px] text-zinc-700">
                          Evidencia: {f.evidence.length > 0 ? f.evidence.join(" | ") : "Sin evidencia explícita"}
                        </p>
                        <p className="mt-1 text-[10px] text-zinc-500">
                          Fuentes: {f.sourceDocIds.length > 0 ? f.sourceDocIds.join(", ") : "sin fuente id"}
                        </p>
                      </article>
                    ))}
                  </div>
                </section>
              </div>
            )}
        </main>

        {renderBrainControlPanel(!isAtmosphereMode)}

        {signalModalClient && (
          <div
            className="fixed inset-0 z-[100110] flex items-end justify-center bg-black/45 p-4 pb-8 backdrop-blur-[2px] sm:items-center sm:pb-4"
            role="presentation"
            onClick={() => setSignalModalClient(null)}
            onKeyDown={(e) => e.key === "Escape" && setSignalModalClient(null)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="brain-signals-title"
              className="max-h-[min(520px,86vh)] w-full max-w-lg overflow-y-auto rounded-[5px] border border-zinc-200 bg-white p-5 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p id="brain-signals-title" className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">
                    Señales recibidas
                  </p>
                  <p className="text-lg font-black text-zinc-900">{signalModalClient.label}</p>
                  <p className="text-[11px] text-zinc-500">{labelForBrainNodeSource(signalModalClient.brainNodeType)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSignalModalClient(null)}
                  className="rounded-[5px] border border-zinc-200 p-2 text-zinc-600 hover:bg-zinc-100"
                  aria-label="Cerrar"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              {(() => {
                const tel = telemetryByNodeId[signalModalClient.id];
                const pendN = pendingByNodeId.get(signalModalClient.id) ?? 0;
                const { signalsLine, pendingLine, lastSignalLine } = connectedNodeSignalsCopy({
                  summaryLine: tel?.summaryLine ?? null,
                  lastAt: tel?.lastAt ?? null,
                  pendingCount: pendN,
                  expanded: true,
                });
                const pendingForNode = pendingLearnings.filter((row) =>
                  learningRowMatchesCanvasNode(row, signalModalClient.id, signalModalClient.brainNodeType),
                );
                return (
                  <div className="mt-4 space-y-4 text-[12px] text-zinc-800">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-wide text-zinc-500">Señales recientes</p>
                      <p className="mt-1 font-semibold text-zinc-900">{signalsLine}</p>
                      {lastSignalLine ? <p className="mt-1 text-[11px] text-zinc-500">{lastSignalLine}</p> : null}
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-wide text-zinc-500">
                        Aprendizajes en revisión
                      </p>
                      {pendingLine ? (
                        <p className="mt-1 font-semibold text-zinc-900">{pendingLine}</p>
                      ) : (
                        <p className="mt-1 text-zinc-600">Ninguno pendiente de este nodo.</p>
                      )}
                      {pendingForNode.length > 0 ? (
                        <ul className="mt-2 space-y-1 text-[11px] text-zinc-700">
                          {pendingForNode.slice(0, 6).map((row) => (
                            <li key={row.id} className="leading-snug">
                              · {row.candidate.value.trim().slice(0, 160)}
                              {row.candidate.value.trim().length > 160 ? "…" : ""}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSignalModalClient(null);
                        setActiveTab("review");
                      }}
                      className="w-full rounded-[5px] border border-violet-600 bg-violet-600 py-2.5 text-[11px] font-black uppercase tracking-wide text-white hover:bg-violet-700"
                    >
                      Ir a Aprendizajes
                    </button>
                    {process.env.NODE_ENV === "development" ? (
                      <p className="text-[10px] leading-snug text-zinc-400">{BRAIN_TELEMETRY_EPHEMERAL_DEV_NOTE_ES}</p>
                    ) : null}
                    <p className="text-[10px] text-zinc-400">
                      Nodo en lienzo · {signalModalClient.id}
                      {projectId?.trim() ? ` · Proyecto ${projectId.trim()}` : ""}
                    </p>
                  </div>
                );
              })()}
            </div>
          </div>
        )}
      </div>
      </div>

      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-zinc-200/80 bg-white px-3 py-2 text-[10px] text-zinc-500 sm:px-4">
        <p className="flex items-center gap-1.5">
          <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden />
          <span>
            {analyzedCount} analizados · guardar proyecto persiste Brain
          </span>
        </p>
      </footer>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(shell, document.body);
}
