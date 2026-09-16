"use client";

/* eslint-disable @next/next/no-img-element */

import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Eraser,
  Eye,
  EyeOff,
  FolderOpen,
  History,
  ImagePlus,
  Layers,
  Loader2,
  Maximize2,
  Minus,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Scan,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  Undo2,
  Upload,
  X,
  ZoomIn,
} from "lucide-react";
import { runAiJobWithNotification } from "@/lib/ai-job-notifications";
import { sanitizeUserFacingErrorMessage } from "@/lib/read-response-json";
import { aiHudNanoBananaJobProgress } from "@/lib/ai-hud-generation-progress";
import { geminiGenerateWithServerProgress } from "@/lib/gemini-generate-stream-client";
import { openaiGenerateWithServerProgress } from "@/lib/openai-generate-stream-client";
import { tryExtractKnowledgeFilesKeyFromUrl } from "@/lib/s3-media-hydrate";
import { usePreventBrowserPinchZoom } from "@/lib/use-prevent-browser-pinch-zoom";
import { useInputMode } from "../input-mode-context";
import { useNanoBananaViewerTouch } from "./nano-banana-viewer-touch";
import type { BrainImageGeneratorPromptDiagnostics } from "@/lib/brain/build-brain-visual-prompt-context";
import {
  FoldderStudioHeader,
} from "../FoldderStudioHeader";
import {
  coerceNanoBananaAspect,
  coerceNanoBananaResolution,
  isNanoBananaResolutionEnabled,
  nanoBananaAspectSelectOptions,
  nanoBananaModelLabel,
  NANO_BANANA_GEMINI_MODELS,
  type NanoBananaAspectRatio,
  type NanoBananaImageProvider,
  type NanoBananaResolution,
} from "./nano-banana-output-options";
import { isValidClosedLasso, rasterizeLassoToPaintData } from "./lasso-to-paint-data";
import { StudioFoldderImagePicker } from "./StudioFoldderImagePicker";
import { canStudioPrimaryGenerate, describeStudioGenerateImageOrder, shouldRunAnalyzeAreas, type StudioGenerateSlotKind } from "./studio-generate-payload";
import type { ChangeMaskSensitivity } from "@/lib/nano-banana/preserve-compose/analyze-change-mask";
import { mergeStudioCardReferences, planStudioIncomingUrls, STUDIO_SCENE_DEST } from "./studio-foldder-images";
import { prepareStudioGenerateCallCached } from "./studio-prepare-cache";
import { prepareStudioGenerateCall } from "./studio-prepare-generate";
import { preserveComposeEligibility, runPreserveCompose, summarizeComposeOutcome } from "./studio-preserve-compose";
import {
  cropBaseImageDataUrl,
  cropCardsToRect,
  describeContextCrop,
  planStudioContextCrop,
  type StudioContextCrop,
} from "./studio-context-crop";
import { downloadExport6kFile, runExport6k } from "./studio-export-6k";
import { estimateStudioJobUsd, formatStudioUsd } from "./studio-cost";
import { buildOpenAiEditMaskDataUrl } from "./studio-openai-mask";
import { buildStudioGenerateImageSlots } from "./studio-generate-payload";
import { clientPointToImagePoint, STUDIO_VIEWER_PAN_GAIN, wheelZoomFactor, zoomTowardPoint } from "./studio-overlay-coords";
import {
  hydrateCardPaint,
  mergeStudioMedia,
  persistStudioMedia,
  coerceStudioDraft,
  stripBriefForNode,
  stripDraftForNode,
  type StudioDraftState,
} from "./studio-persist";
import {
  STUDIO_MAX_REFS_PER_CARD,
  acceptedStudioHistory,
  cardHasStartedChange,
  cardHasZonePaint,
  createStudioCard,
  findStudioHistoryBrief,
  studioAssetsEqual,
  studioBriefChangeCards,
  type StudioCard,
  type StudioComposeSummary,
  type StudioGlobal,
  type StudioHistoryBrief,
  type StudioPoint,
} from "./studio-types";

export type ImageCreationStudioProps = {
  nodeId: string;
  nodeLabel?: string;
  initialImage: string | null;
  lastGenerated: string | null;
  modelKey: string;
  aspectRatio: string;
  resolution: string;
  imageProvider?: NanoBananaImageProvider;
  thinking: boolean;
  prompt: string;
  externalPromptIgnored?: boolean;
  composeBrainImageGeneratorPrompt?: (
    userThemePrompt: string,
  ) => { prompt: string; diagnostics: BrainImageGeneratorPromptDiagnostics } | null;
  onBrainImageGeneratorDiagnostics?: (d: BrainImageGeneratorPromptDiagnostics | null) => void;
  topBarCloseMode?: "default" | "returnCine" | "returnDesigner";
  onClose: () => void;
  onGenerated: (dataUrl: string, s3Key?: string) => void;
  onResolutionChange?: (resolution: NanoBananaResolution) => void;
  onAspectRatioChange?: (aspectRatio: NanoBananaAspectRatio) => void;
  onModelKeyChange?: (modelKey: string) => void;
  onImageProviderChange?: (provider: NanoBananaImageProvider) => void;
  onThinkingChange?: (thinking: boolean) => void;
  /** "Conservar zonas sin cambios": compone la generación sobre la base (por defecto activo). */
  preserveUnchanged?: boolean;
  onPreserveUnchangedChange?: (enabled: boolean) => void;
  generationHistory: string[];
  onGenerationHistoryChange: React.Dispatch<React.SetStateAction<string[]>>;
  generationBriefs?: StudioHistoryBrief[];
  onGenerationBriefsChange?: React.Dispatch<React.SetStateAction<StudioHistoryBrief[]>>;
  studioDraft?: StudioDraftState;
  onStudioDraftChange?: (draft: StudioDraftState) => void;
  connectedImages?: (string | null)[];
};

function mergePromptWithBrain(
  compose: ImageCreationStudioProps["composeBrainImageGeneratorPrompt"],
  onDiag: ImageCreationStudioProps["onBrainImageGeneratorDiagnostics"],
  userTheme: string,
  body: string,
): string {
  const theme = userTheme.trim();
  const studio = body.trim();
  if (!compose) return [theme, studio].filter(Boolean).join("\n\n");
  const pack = compose(theme || "Generación en Image Creation Studio.");
  if (!pack) {
    onDiag?.(null);
    return [theme, studio].filter(Boolean).join("\n\n");
  }
  onDiag?.(pack.diagnostics);
  return `${pack.prompt}\n\n--- ENCARGOS ---\n${studio || theme}`.trim();
}

function readFilesAsDataUrls(files: FileList | File[]): Promise<string[]> {
  const images = Array.from(files).filter((file) => file.type.startsWith("image/"));
  return Promise.all(
    images.map(
      (file) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ""));
          reader.onerror = () => reject(new Error("No se pudo leer la imagen."));
          reader.readAsDataURL(file);
        }),
    ),
  );
}

function aspectBox(aspect: NanoBananaAspectRatio, maxW: number, maxH: number): { w: number; h: number } {
  const [aw, ah] = aspect.split(":").map(Number) as [number, number];
  const scale = Math.min(maxW / aw, maxH / ah);
  return { w: Math.max(160, aw * scale), h: Math.max(160, ah * scale) };
}

function workingFrameSize(aspect: NanoBananaAspectRatio): { width: number; height: number } {
  switch (aspect) {
    case "9:16":
      return { width: 720, height: 1280 };
    case "4:3":
      return { width: 1024, height: 768 };
    case "3:4":
      return { width: 768, height: 1024 };
    case "1:1":
      return { width: 1024, height: 1024 };
    default:
      return { width: 1280, height: 720 };
  }
}

function polygonPoints(points: StudioPoint[]): string {
  return points.map((p) => `${p.x},${p.y}`).join(" ");
}

function polygonCenter(points: StudioPoint[]): StudioPoint {
  if (points.length === 0) return { x: 0, y: 0 };
  const total = points.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), { x: 0, y: 0 });
  return { x: total.x / points.length, y: total.y / points.length };
}

function studioSetupLabel(
  modelKey: string,
  resolution: string,
  aspect: string,
  openai: boolean,
): string {
  return `${nanoBananaModelLabel(modelKey, openai)} · ${resolution.toUpperCase()} · ${aspect}`;
}

const CALL_SLOT_LABEL: Record<StudioGenerateSlotKind, string> = {
  base: "Base",
  zoneMap: "Mapa de zonas",
  referenceGrid: "Referencias",
  schema: "Esquema",
};

type StudioCallPreview = {
  analyzeError: string | null;
  images: Array<{ kind: StudioGenerateSlotKind; src: string }>;
  preserveNote: string;
  prompt: string;
  ranAnalyzeAreas: boolean;
  usedAnalyzeAreas: boolean;
};

type StudioComposeNotice = {
  maskPreview: string | null;
  summary: StudioComposeSummary;
};

function composeNoticeText(summary: StudioComposeSummary): string {
  if (summary.composed) {
    const pct = summary.changedPct != null ? ` · ${summary.changedPct} % modificado` : "";
    const dropped = summary.componentsDropped ? ` · ${summary.componentsDropped} cambio(s) lejano(s) descartado(s)` : "";
    const crop = summary.contextCrop ? " · generado sobre un recorte ampliado y pegado de vuelta" : "";
    const blur = summary.blurSigmaPx ? ` · desenfoque igualado al fondo (σ ${summary.blurSigmaPx} px)` : "";
    const grain = summary.grainAdded ? ` · grano igualado (${summary.grainAdded})` : "";
    const fallback = summary.usedPriorFallback ? " · pegado por el lazo (el detector no confirmó el cambio)" : "";
    return `Zonas sin cambios conservadas de la original${pct}${dropped}${crop}${blur}${grain}${fallback}.`;
  }
  const reason = summary.reason ? ` ${summary.reason}` : "";
  switch (summary.decision) {
    case "skip-global":
      return `Sin integrar: cambio global.${reason}`;
    case "skip-no-change":
      return `Sin integrar: el modelo apenas modificó la imagen.${reason}`;
    case "skip-shift":
    case "aspect-mismatch":
      return `Sin integrar: el modelo reencuadró la imagen.${reason}`;
    case "not-eligible":
      return `Sin integrar (no es un cambio local).${reason}`;
    case "error":
      return `No se pudo integrar sobre la original; se usa la generación tal cual.${reason}`;
    default:
      return `Sin integrar.${reason}`;
  }
}

const STUDIO_ICON_BUTTON =
  "flex h-9 w-9 shrink-0 items-center justify-center border border-white/10 bg-white/[0.05] text-white/75 transition hover:border-white/25 hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:opacity-30";

const STUDIO_TEXT_BUTTON =
  "flex h-9 shrink-0 items-center justify-center gap-2 border border-white/10 bg-white/[0.05] px-3 text-[12px] font-semibold text-white/80 transition hover:border-white/25 hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:opacity-30";

function studioChangeLabel(card: StudioCard, index: number): string {
  return card.description.trim() || (card.lassoPoints.length > 2 || card.paintData ? `Zona ${index + 1}` : `Cambio ${index + 1}`);
}

export const ImageCreationStudio = memo(function ImageCreationStudio({
  nodeId,
  nodeLabel = "Image Creation",
  initialImage,
  lastGenerated,
  modelKey,
  aspectRatio,
  resolution,
  imageProvider = "gemini",
  thinking,
  prompt,
  composeBrainImageGeneratorPrompt,
  onBrainImageGeneratorDiagnostics,
  topBarCloseMode = "default",
  onClose,
  onGenerated,
  onResolutionChange,
  onAspectRatioChange,
  onModelKeyChange,
  onImageProviderChange,
  onThinkingChange,
  preserveUnchanged: preserveUnchangedProp = true,
  onPreserveUnchangedChange,
  generationHistory,
  onGenerationHistoryChange,
  generationBriefs = [],
  onGenerationBriefsChange,
  studioDraft,
  onStudioDraftChange,
  connectedImages = [],
}: ImageCreationStudioProps) {
  const { isTouchUI } = useInputMode();
  const boot = useMemo(
    () => mergeStudioMedia(nodeId, coerceStudioDraft(studioDraft), generationBriefs),
    // Mount-only: reopen Studio with the last unsaved panel + session media.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodeId],
  );

  const [genStatus, setGenStatus] = useState<"idle" | "running" | "success" | "error">("idle");
  const [genError, setGenError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [inspectingCall, setInspectingCall] = useState(false);
  const [callPreview, setCallPreview] = useState<StudioCallPreview | null>(null);
  const [inspectError, setInspectError] = useState<string | null>(null);
  const [preserveUnchanged, setPreserveUnchanged] = useState(preserveUnchangedProp);
  useEffect(() => setPreserveUnchanged(preserveUnchangedProp), [preserveUnchangedProp]);
  const [composeStage, setComposeStage] = useState<string | null>(null);
  const [composeNotice, setComposeNotice] = useState<StudioComposeNotice | null>(null);
  const [showComposeMask, setShowComposeMask] = useState(false);
  const [exporting6k, setExporting6k] = useState(false);
  const [export6kError, setExport6kError] = useState<string | null>(null);
  const [export6kFormat, setExport6kFormat] = useState<"png" | "jpeg">("png");
  const [composeSensitivity, setComposeSensitivity] = useState<ChangeMaskSensitivity>("auto");
  const [variantCount, setVariantCount] = useState<1 | 2 | 3>(1);
  const [variantPicks, setVariantPicks] = useState<Array<{ output: string; key?: string; crop?: StudioContextCrop | null }>>([]);
  const [genStage, setGenStage] = useState<string | null>(null);
  const [holdingCompare, setHoldingCompare] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [changesOpen, setChangesOpen] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [sceneOpen, setSceneOpen] = useState(() => !initialImage);
  const [showZoneOutlines, setShowZoneOutlines] = useState(true);
  const [zoomPercent, setZoomPercent] = useState(100);
  const [canUndo, setCanUndo] = useState(false);
  const undoSnapRef = useRef<{
    sessionImage: string | null;
    cards: StudioCard[];
    global: StudioGlobal;
  } | null>(null);
  const [sessionImage, setSessionImage] = useState<string | null>(lastGenerated || initialImage);
  const [showingOriginal, setShowingOriginal] = useState(false);
  const currentImage = showingOriginal && initialImage ? initialImage : sessionImage;
  const currentImageRef = useRef<string | null>(null);
  currentImageRef.current = currentImage;

  const [studioProvider, setStudioProvider] = useState<NanoBananaImageProvider>(imageProvider);
  const [studioModelKey, setStudioModelKey] = useState(modelKey);
  const [studioResolution, setStudioResolution] = useState(() =>
    coerceNanoBananaResolution(imageProvider, modelKey, resolution),
  );
  const [studioAspect, setStudioAspect] = useState(() => coerceNanoBananaAspect(aspectRatio));
  useEffect(() => setStudioProvider(imageProvider), [imageProvider]);
  useEffect(() => setStudioModelKey(modelKey), [modelKey]);
  useEffect(() => {
    setStudioResolution(coerceNanoBananaResolution(studioProvider, studioModelKey, resolution));
  }, [resolution, studioModelKey, studioProvider]);
  useEffect(() => setStudioAspect(coerceNanoBananaAspect(aspectRatio)), [aspectRatio]);

  const isOpenAi = studioProvider === "openai";
  const isPro = studioModelKey === "pro3";
  const lockFlash25Res = !isOpenAi && studioModelKey === "flash25";
  const effectiveStudioResolution = lockFlash25Res ? "1k" : studioResolution;
  const aspectCanChange =
    !lastGenerated && generationHistory.length === 0 && genStatus !== "running" && genStatus !== "success";
  const settingsBusy = genStatus === "running" || inspectingCall || exporting6k;
  const applyStudioProvider = useCallback(
    (next: NanoBananaImageProvider) => {
      setStudioProvider(next);
      onImageProviderChange?.(next);
      const nextRes = coerceNanoBananaResolution(next, studioModelKey, studioResolution);
      if (nextRes !== studioResolution) {
        setStudioResolution(nextRes);
        onResolutionChange?.(nextRes);
      }
    },
    [onImageProviderChange, onResolutionChange, studioModelKey, studioResolution],
  );

  const [cards, setCards] = useState<StudioCard[]>(() => boot.draft.cards.filter(cardHasStartedChange));
  const [global, setGlobal] = useState<StudioGlobal>(() => {
    const seeded = boot.draft.global;
    const connected = String(prompt ?? "").trim();
    const savedPrompt = studioDraft?.global?.promptDraft;
    const hasSavedPrompt = typeof savedPrompt === "string";
    const caption =
      !hasSavedPrompt && seeded.text.trim() && seeded.text.trim() === connected ? "" : seeded.text;
    return {
      promptDraft: hasSavedPrompt ? savedPrompt : connected,
      schemaData: seeded.schemaData,
      text: caption,
    };
  });
  const [localBriefs, setLocalBriefs] = useState<StudioHistoryBrief[]>(boot.briefs);
  const briefs = onGenerationBriefsChange ? generationBriefs : localBriefs;
  const setBriefs = onGenerationBriefsChange ?? setLocalBriefs;
  const hydratedBriefs = useMemo(
    () => mergeStudioMedia(nodeId, { cards, global }, briefs).briefs,
    [briefs, cards, global, nodeId],
  );

  const [drawingLasso, setDrawingLasso] = useState(false);
  const [lassoPoints, setLassoPoints] = useState<StudioPoint[]>([]);
  const [draftCard, setDraftCard] = useState<StudioCard | null>(null);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [foldderPickerDest, setFoldderPickerDest] = useState<string | null>(null);
  const [schemaMode, setSchemaMode] = useState(false);
  const [schemaTool, setSchemaTool] = useState<"draw" | "erase">("draw");
  const [historyPreviewUrl, setHistoryPreviewUrl] = useState<string | null>(null);
  const [imgNat, setImgNat] = useState(() => {
    const frame = workingFrameSize(coerceNanoBananaAspect(aspectRatio));
    return { w: frame.width, h: frame.height };
  });
  const [fitSize, setFitSize] = useState({ w: 480, h: 270 });
  const nodeRefs = useMemo(
    () => connectedImages.filter((src): src is string => Boolean(src && src.trim())),
    [connectedImages],
  );
  const nodePrompt = String(prompt ?? "").trim();

  const containerRef = useRef<HTMLDivElement>(null);
  const studioRootRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const schemaCanvasRef = useRef<HTMLCanvasElement>(null);
  const schemaDrawing = useRef(false);
  const schemaToolRef = useRef(schemaTool);
  schemaToolRef.current = schemaTool;
  const draftTextRef = useRef<HTMLTextAreaElement>(null);
  const scenePromptRef = useRef<HTMLTextAreaElement>(null);
  const schemaCaptionRef = useRef<HTMLTextAreaElement>(null);
  const focusedSchemaCaption = useRef(false);
  const cardFileRef = useRef<HTMLInputElement>(null);
  const dropCardIdRef = useRef<string | null>(null);
  const draftPersistRef = useRef({ briefs: hydratedBriefs, cards, global });
  draftPersistRef.current = { briefs: hydratedBriefs, cards, global };

  usePreventBrowserPinchZoom(containerRef);
  useEffect(() => {
    document.body.classList.add("nb-studio-open");
    return () => document.body.classList.remove("nb-studio-open");
  }, []);

  const flushDraft = useCallback(() => {
    const snapshot = draftPersistRef.current;
    persistStudioMedia(nodeId, { cards: snapshot.cards, global: snapshot.global }, snapshot.briefs);
    onStudioDraftChange?.(stripDraftForNode({ cards: snapshot.cards, global: snapshot.global }));
  }, [nodeId, onStudioDraftChange]);

  useEffect(() => {
    const timer = window.setTimeout(flushDraft, 400);
    return () => window.clearTimeout(timer);
  }, [cards, flushDraft, global, hydratedBriefs]);

  useEffect(() => () => flushDraft(), [flushDraft]);

  const acceptedHistory = useMemo(
    () =>
      acceptedStudioHistory({
        history: generationHistory,
        briefs: hydratedBriefs,
        initialImage,
        currentImage: sessionImage,
      }),
    [generationHistory, hydratedBriefs, initialImage, sessionImage],
  );
  const previewBrief = useMemo(
    () => findStudioHistoryBrief(hydratedBriefs, historyPreviewUrl),
    [hydratedBriefs, historyPreviewUrl],
  );
  const readOnly = Boolean(historyPreviewUrl);
  const viewedImage = historyPreviewUrl || sessionImage;
  const viewedBrief = useMemo(
    () => findStudioHistoryBrief(hydratedBriefs, viewedImage),
    [hydratedBriefs, viewedImage],
  );
  const compareHoldUrl =
    viewedBrief?.baseUrl && !studioAssetsEqual(viewedBrief.baseUrl, viewedImage)
      ? viewedBrief.baseUrl
      : null;
  const displayImage = holdingCompare && compareHoldUrl
    ? compareHoldUrl
    : historyPreviewUrl || currentImage;
  const displayCards = previewBrief ? previewBrief.cards : cards;
  const visibleCards = displayCards.filter((card) =>
    readOnly ? cardHasStartedChange(card) : card.id === draftCard?.id || cardHasStartedChange(card),
  );
  const activeDraftCard = draftCard ? cards.find((card) => card.id === draftCard.id) ?? null : null;
  const displayGlobal = previewBrief ? previewBrief.global : global;
  const vZoom = useRef(1);
  const vPan = useRef({ x: 0, y: 0 });
  const vIsDragging = useRef(false);
  const vDragStart = useRef({ mx: 0, my: 0, px: 0, py: 0 });
  const zoomWrapRef = useRef<HTMLDivElement>(null);
  const applyViewTransform = () => {
    if (!zoomWrapRef.current) return;
    zoomWrapRef.current.style.transform = `translate(${vPan.current.x}px,${vPan.current.y}px) scale(${vZoom.current})`;
    setZoomPercent(Math.round(vZoom.current * 100));
  };
  const drawingLassoRef = useRef(false);
  drawingLassoRef.current = drawingLasso;
  const schemaModeRef = useRef(false);
  schemaModeRef.current = schemaMode;

  const getViewerTransform = useCallback(
    () => ({ pan: { ...vPan.current }, zoom: vZoom.current }),
    [],
  );
  const touchViewerHandlers = useNanoBananaViewerTouch({
    enabled: isTouchUI,
    containerRef,
    canInteract: () => !drawingLassoRef.current && !schemaModeRef.current,
    getView: getViewerTransform,
    setView: (view) => {
      vPan.current = view.pan;
      vZoom.current = view.zoom;
      applyViewTransform();
    },
  });

  const recalcFit = useCallback(() => {
    const wrap = containerRef.current;
    if (!wrap) return;
    const boxW = Math.max(1, wrap.clientWidth);
    const boxH = Math.max(1, wrap.clientHeight);
    if (displayImage && imgNat.w > 1 && imgNat.h > 1) {
      const scale = Math.min(boxW / imgNat.w, boxH / imgNat.h);
      setFitSize({ w: Math.max(1, imgNat.w * scale), h: Math.max(1, imgNat.h * scale) });
      return;
    }
    setFitSize(aspectBox(studioAspect, boxW * 0.86, boxH * 0.86));
  }, [displayImage, imgNat.h, imgNat.w, studioAspect]);

  useEffect(() => {
    if (displayImage) return;
    const frame = workingFrameSize(studioAspect);
    setImgNat({ w: frame.width, h: frame.height });
  }, [displayImage, studioAspect]);

  useEffect(() => {
    recalcFit();
    const wrap = containerRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver(() => recalcFit());
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [recalcFit]);

  const resetViewer = useCallback(() => {
    vZoom.current = 1;
    vPan.current = { x: 0, y: 0 };
    applyViewTransform();
  }, []);

  const zoomViewer = useCallback((factor: number) => {
    const wrap = containerRef.current;
    if (!wrap) return;
    const next = zoomTowardPoint(
      { pan: vPan.current, zoom: vZoom.current },
      { x: wrap.clientWidth / 2, y: wrap.clientHeight / 2 },
      vZoom.current * factor,
    );
    vZoom.current = next.zoom;
    vPan.current = next.pan;
    applyViewTransform();
  }, []);

  useEffect(() => {
    if (imgNat.w < 1) return;
    setCards((prev) => {
      let changed = false;
      const next = prev.map((card) => {
        const hydrated = hydrateCardPaint(card, { width: imgNat.w, height: imgNat.h });
        if (hydrated !== card) changed = true;
        return hydrated;
      });
      return changed ? next : prev;
    });
  }, [imgNat.h, imgNat.w]);

  useLayoutEffect(() => {
    const list = generationHistory;
    if (!Array.isArray(list) || list.length === 0) return;
    const keysList = list.map((u) => (typeof u === "string" ? tryExtractKnowledgeFilesKeyFromUrl(u) : null));
    if (!keysList.some(Boolean)) return;
    let cancelled = false;
    void (async () => {
      const keys = [...new Set(keysList.filter((k): k is string => Boolean(k)))];
      try {
        const res = await fetch("/api/spaces/s3-presign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keys }),
        });
        if (!res.ok || cancelled) return;
        const payload = (await res.json()) as { urls?: Record<string, string> };
        const urls = payload.urls;
        if (!urls || cancelled) return;
        const next = list.map((item) => {
          const kk = tryExtractKnowledgeFilesKeyFromUrl(item);
          return kk && urls[kk] ? urls[kk] : item;
        });
        if (next.some((u, i) => u !== list[i])) onGenerationHistoryChange(next);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [generationHistory, onGenerationHistoryChange]);

  const toImagePoint = useCallback((clientX: number, clientY: number): StudioPoint | null => {
    const overlay = overlayRef.current;
    if (!overlay || imgNat.w < 1) return null;
    const rect = overlay.getBoundingClientRect();
    return clientPointToImagePoint(
      clientX,
      clientY,
      { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      { width: imgNat.w, height: imgNat.h },
    );
  }, [imgNat.h, imgNat.w]);

  const startAdd = useCallback(() => {
    if (readOnly || genStatus === "running") return;
    if (displayImage) {
      setDrawingLasso(true);
      setLassoPoints([]);
      setDraftCard(null);
      setSchemaMode(false);
      return;
    }
    scenePromptRef.current?.focus();
  }, [displayImage, genStatus, readOnly]);

  const confirmLasso = useCallback(() => {
    if (!isValidClosedLasso(lassoPoints) || !imgNat.w) {
      setDrawingLasso(false);
      setLassoPoints([]);
      return;
    }
    const paintData = rasterizeLassoToPaintData(lassoPoints, imgNat.w, imgNat.h);
    setCards((prev) => {
      const next = {
        ...createStudioCard(prev.length),
        lassoPoints,
        paintData,
      };
      setDraftCard(next);
      setSelectedCardId(next.id);
      return [...prev, next];
    });
    setDrawingLasso(false);
    setLassoPoints([]);
    setChangesOpen(false);
    requestAnimationFrame(() => draftTextRef.current?.focus());
  }, [imgNat.h, imgNat.w, lassoPoints]);

  const applyIncomingUrls = useCallback((urls: string[], dest: string | null) => {
    const plan = planStudioIncomingUrls({
      urls,
      dest,
      hasScene: Boolean(currentImageRef.current),
      maxRefs: STUDIO_MAX_REFS_PER_CARD,
    });
    if (plan.sessionImage) {
      setSessionImage(plan.sessionImage);
      setShowingOriginal(false);
    }
    if (plan.cardUpdate) {
      const { cardId, add } = plan.cardUpdate;
      setCards((prev) =>
        prev.map((card) =>
          card.id === cardId ? { ...card, references: mergeStudioCardReferences(card.references, add, STUDIO_MAX_REFS_PER_CARD) } : card,
        ),
      );
      setDraftCard((current) =>
        current && current.id === cardId
          ? { ...current, references: mergeStudioCardReferences(current.references, add, STUDIO_MAX_REFS_PER_CARD) }
          : current,
      );
    }
    const newCardRefs = plan.extraCard?.references ?? plan.newCard?.references;
    if (newCardRefs?.length) {
      const asDraft = Boolean(plan.newCard);
      setCards((prev) => {
        const next = { ...createStudioCard(prev.length), references: newCardRefs };
        setSelectedCardId(next.id);
        if (asDraft) setDraftCard(next);
        return [...prev, next];
      });
    }
  }, []);

  const attachRefsToCard = useCallback(
    async (cardId: string, files: FileList | File[]) => {
      const urls = await readFilesAsDataUrls(files);
      applyIncomingUrls(urls, cardId);
    },
    [applyIncomingUrls],
  );

  const attachUrlToCard = useCallback(
    (cardId: string, url: string) => {
      applyIncomingUrls([url], cardId);
    },
    [applyIncomingUrls],
  );

  const openPcSource = useCallback(
    (dest: string) => {
      if (readOnly || genStatus === "running") return;
      dropCardIdRef.current = dest;
      cardFileRef.current?.click();
    },
    [genStatus, readOnly],
  );

  const openFoldderSource = useCallback(
    (dest: string) => {
      if (readOnly || genStatus === "running") return;
      setFoldderPickerDest(dest);
    },
    [genStatus, readOnly],
  );

  const attachConnectedRef = useCallback(
    (url: string) => {
      if (readOnly || genStatus === "running") return;
      if (!currentImageRef.current) {
        applyIncomingUrls([url], STUDIO_SCENE_DEST);
        return;
      }
      if (selectedCardId) {
        attachUrlToCard(selectedCardId, url);
        return;
      }
      applyIncomingUrls([url], null);
    },
    [applyIncomingUrls, attachUrlToCard, genStatus, readOnly, selectedCardId],
  );

  const removeCard = useCallback((cardId: string) => {
    setCards((prev) => prev.filter((card) => card.id !== cardId));
    setDraftCard((current) => (current?.id === cardId ? null : current));
    setSelectedCardId((id) => (id === cardId ? null : id));
  }, []);

  const onDropOnCanvas = useCallback(
    async (event: React.DragEvent) => {
      event.preventDefault();
      if (readOnly) return;
      const files = event.dataTransfer.files;
      if (!files?.length) return;
      const dest = dropCardIdRef.current;
      dropCardIdRef.current = null;
      const urls = await readFilesAsDataUrls(files);
      if (dest && dest !== STUDIO_SCENE_DEST) {
        applyIncomingUrls(urls, dest);
        return;
      }
      applyIncomingUrls(urls, dest === STUDIO_SCENE_DEST || !currentImageRef.current ? STUDIO_SCENE_DEST : null);
    },
    [applyIncomingUrls, readOnly],
  );

  const clearEdits = useCallback(() => {
    setCards([]);
    setGlobal({ promptDraft: String(prompt ?? "").trim(), schemaData: null, text: "" });
    setDraftCard(null);
    setDrawingLasso(false);
    setLassoPoints([]);
    setSchemaMode(false);
    setSelectedCardId(null);
    focusedSchemaCaption.current = false;
  }, [prompt]);

  const adoptHistoryAsBase = useCallback(
    (url: string) => {
      setHistoryPreviewUrl(null);
      setShowingOriginal(false);
      setComposeNotice(null);
      setShowComposeMask(false);
      setSessionImage(url);
      onGenerated(url, tryExtractKnowledgeFilesKeyFromUrl(url) ?? undefined);
      clearEdits();
    },
    [clearEdits, onGenerated],
  );

  const hasGeneratedOutput =
    Boolean(lastGenerated) || acceptedHistory.length > 0 || genStatus === "success";

  const jobCost = useMemo(
    () =>
      estimateStudioJobUsd({
        provider: studioProvider,
        modelKey: studioModelKey,
        resolution: effectiveStudioResolution,
        aspectRatio: studioAspect,
        cards,
        hasBaseImage: Boolean(currentImage),
        variantCount: 1,
      }),
    [cards, currentImage, effectiveStudioResolution, studioAspect, studioModelKey, studioProvider],
  );

  /**
   * Recorte de contexto: solo con "Solo la zona marcada" activo, base presente y edición
   * puramente local (misma elegibilidad que preserve-compose). Sin recorte ⇒ null.
   */
  const resolveContextCrop = useCallback(
    (args: { base: string | null; cards: StudioCard[]; global: StudioGlobal; frame: { width: number; height: number } }) => {
      if (!preserveUnchanged || !args.base) return null;
      const eligibility = preserveComposeEligibility({ baseImage: args.base, cards: args.cards, global: args.global });
      if (!eligibility.ok) return null;
      return planStudioContextCrop({ cards: args.cards, global: args.global, frame: args.frame });
    },
    [preserveUnchanged],
  );

  const commitGeneratedOutput = useCallback(
    async (args: {
      output: string;
      key?: string;
      prev: string | null;
      cards: StudioCard[];
      global: StudioGlobal;
      frameWidth: number;
      frameHeight: number;
      /** Recorte de contexto con el que se generó `output`; obliga a pegar sobre la foto completa. */
      crop?: StudioContextCrop | null;
    }) => {
      let out = args.output;
      let outKey = args.key;
      let rawOutputUrl: string | null = null;
      let composeSummary: StudioComposeSummary | null = null;
      let composeMaskPreview: string | null = null;
      const crop = args.crop ?? null;

      if ((preserveUnchanged || crop) && args.prev) {
        const eligibility = preserveComposeEligibility({
          baseImage: args.prev,
          cards: args.cards,
          global: args.global,
        });
        if (eligibility.ok || crop) {
          setGenStage(crop ? "Pegando el recorte sobre la foto completa…" : "Integrando cambios sobre la original…");
          setComposeStage(crop ? "Pegando el recorte sobre la foto completa…" : "Integrando cambios sobre la original…");
          try {
            const outcome = await runPreserveCompose({
              baseImage: args.prev,
              generatedOutput: args.output,
              generatedKey: outKey ?? null,
              cards: args.cards,
              frame: { width: args.frameWidth, height: args.frameHeight },
              sensitivity: composeSensitivity,
              crop,
            });
            composeSummary = summarizeComposeOutcome(outcome);
            composeMaskPreview = outcome.maskPreview;
            if (outcome.composed && outcome.output) {
              rawOutputUrl = args.output;
              out = outcome.output;
              outKey = outcome.key ?? undefined;
            } else if (crop) {
              // Un recorte sin pegar no es una imagen válida: no se aplica y se informa.
              throw new Error(
                `El recorte generado no se pudo pegar sobre la foto completa (${outcome.reason || outcome.decision}). La generación no se ha aplicado.`,
              );
            }
          } catch (error) {
            console.error("[ImageCreationStudio] preserve-compose:", error);
            if (crop) {
              setComposeStage(null);
              throw error;
            }
            composeSummary = {
              composed: false,
              decision: "error",
              reason: error instanceof Error ? error.message : "Error desconocido.",
              changedPct: null,
              componentsKept: null,
              componentsDropped: null,
            };
          } finally {
            setComposeStage(null);
          }
        } else if (args.cards.some(cardHasZonePaint) || args.cards.some((card) => card.lassoPoints.length > 2)) {
          composeSummary = {
            composed: false,
            decision: "not-eligible",
            reason: eligibility.reason,
            changedPct: null,
            componentsKept: null,
            componentsDropped: null,
          };
        }
      }

      undoSnapRef.current = { sessionImage: args.prev, cards: args.cards, global: args.global };
      setCanUndo(true);
      onGenerationHistoryChange((h) => {
        const next = [...h];
        if (args.prev && !studioAssetsEqual(args.prev, out) && !next.some((url) => studioAssetsEqual(url, args.prev))) {
          next.push(args.prev);
        }
        if (!next.some((url) => studioAssetsEqual(url, out))) next.push(out);
        return next;
      });
      const brief: StudioHistoryBrief = {
        outputUrl: out,
        baseUrl: args.prev,
        cards: args.cards,
        global: args.global,
        rawOutputUrl,
        crop,
        compose: composeSummary,
        composeMaskPreview,
      };
      persistStudioMedia(
        nodeId,
        { cards: args.cards, global: args.global },
        [...hydratedBriefs.filter((b) => !studioAssetsEqual(b.outputUrl, out)), brief],
      );
      setBriefs((prevBriefs) => [
        ...prevBriefs.filter((b) => !studioAssetsEqual(b.outputUrl, out)).map(stripBriefForNode),
        stripBriefForNode(brief),
      ]);
      currentImageRef.current = out;
      setShowingOriginal(false);
      setSessionImage(out);
      if (composeSummary) setComposeNotice({ summary: composeSummary, maskPreview: composeMaskPreview });
      onGenerated(out, outKey);
    },
    [composeSensitivity, hydratedBriefs, nodeId, onGenerated, onGenerationHistoryChange, preserveUnchanged, setBriefs],
  );

  const onGenerate = useCallback(async (opts?: {
    resolution?: NanoBananaResolution;
    collectCandidate?: boolean;
  }) => {
    if (readOnly || inspectingCall || genStatus === "running" || exporting6k) return;
    const canGo = canStudioPrimaryGenerate(cards, global, {
      nodePrompt,
      hasGeneratedOutput:
        Boolean(lastGenerated) || acceptedHistory.length > 0 || genStatus === "success",
    });
    if (!canGo) return;
    const resolution = opts?.resolution
      ? coerceNanoBananaResolution(studioProvider, studioModelKey, opts.resolution)
      : effectiveStudioResolution;
    if (opts?.resolution && resolution !== studioResolution) {
      setStudioResolution(resolution);
      onResolutionChange?.(resolution);
    }
    const collectCandidate = opts?.collectCandidate ?? variantCount > 1;
    setGenStatus("running");
    setGenError(null);
    setProgress(0);
    setComposeNotice(null);
    setShowComposeMask(false);
    if (!opts?.collectCandidate) setVariantPicks([]);
    let okFinish = false;
    let failMessage: string | null = null;
    try {
      const ok = await runAiJobWithNotification({ nodeId, label: "Image Creation Studio" }, async () => {
        try {
          const scenePrompt = global.promptDraft;
          const frameWidth = imgNat.w || workingFrameSize(studioAspect).width;
          const frameHeight = imgNat.h || workingFrameSize(studioAspect).height;
          const genGlobal: StudioGlobal = { promptDraft: scenePrompt, schemaData: global.schemaData, text: global.text };

          // Recorte de contexto: zonas pequeñas sobre una base ⇒ el modelo trabaja sobre un recorte
          // ampliado (misma llamada de pago, muchos más píxeles para la zona) y se pega de vuelta.
          const plannedCrop = resolveContextCrop({ base: currentImage, cards, global: genGlobal, frame: { width: frameWidth, height: frameHeight } });
          let crop: StudioContextCrop | null = null;
          let genBase = currentImage;
          let genCards = cards;
          let genFrameWidth = frameWidth;
          let genFrameHeight = frameHeight;
          if (plannedCrop && currentImage) {
            setGenStage("Recortando el contexto de la zona…");
            const cropped = await cropBaseImageDataUrl(currentImage, plannedCrop, { width: frameWidth, height: frameHeight });
            if (cropped) {
              crop = plannedCrop;
              genBase = cropped;
              genCards = cropCardsToRect(cards, plannedCrop);
              genFrameWidth = plannedCrop.width;
              genFrameHeight = plannedCrop.height;
            }
          }

          if (shouldRunAnalyzeAreas(genCards) && genBase) setGenStage("Analizando zonas…");
          else {
            setGenStage(
              `Generando · ${nanoBananaModelLabel(studioModelKey, isOpenAi)} · ${resolution.toUpperCase()}`,
            );
          }
          const prepared = await prepareStudioGenerateCallCached({
            baseImage: genBase,
            cards: genCards,
            frameHeight: genFrameHeight,
            frameWidth: genFrameWidth,
            global: genGlobal,
            contextCrop: Boolean(crop),
          });
          const merged = mergePromptWithBrain(
            composeBrainImageGeneratorPrompt,
            onBrainImageGeneratorDiagnostics,
            scenePrompt,
            prepared.prompt,
          );
          const maskUrl = isOpenAi
            ? await buildOpenAiEditMaskDataUrl(genCards, { width: genFrameWidth, height: genFrameHeight })
            : null;
          const imageList = maskUrl
            ? buildStudioGenerateImageSlots({ ...prepared.images, zoneMapImage: null })
            : prepared.imageList;
          const generate = isOpenAi ? openaiGenerateWithServerProgress : geminiGenerateWithServerProgress;
          setGenStage(
            `Generando candidata · ${nanoBananaModelLabel(studioModelKey, isOpenAi)} · ${resolution.toUpperCase()}`,
          );
          const generated = await generate(
            {
              prompt: merged,
              images: imageList,
              aspect_ratio: studioAspect,
              resolution,
              model: studioModelKey,
              thinking: thinking && isPro && !isOpenAi,
              ...(maskUrl ? { mask: maskUrl } : {}),
            },
            (pct) => {
              setProgress(pct);
              aiHudNanoBananaJobProgress(nodeId, pct);
            },
          );
          const json = {
            output: generated.output,
            key: typeof generated.key === "string" ? generated.key : undefined,
            crop,
          };
          if (collectCandidate) {
            undoSnapRef.current = { sessionImage: currentImageRef.current, cards, global };
            setCanUndo(true);
            setVariantPicks((previous) =>
              previous.some((item) => studioAssetsEqual(item.output, json.output))
                ? previous
                : [...previous, json],
            );
            okFinish = true;
            return;
          }
          await commitGeneratedOutput({
            output: json.output,
            key: json.key,
            prev: currentImageRef.current,
            cards,
            global,
            frameWidth,
            frameHeight,
            crop,
          });
          okFinish = true;
        } catch (error) {
          failMessage = sanitizeUserFacingErrorMessage(
            error instanceof Error ? error.message : String(error),
          );
          throw error;
        }
      });
      if (!ok) {
        setGenStatus("error");
        setGenError(failMessage || "No se pudo generar la imagen.");
      }
    } catch (error) {
      console.error("[ImageCreationStudio] generate:", error);
      setGenStatus("error");
      setGenError(
        failMessage ||
          sanitizeUserFacingErrorMessage(error instanceof Error ? error.message : String(error)),
      );
    } finally {
      setGenStage(null);
      if (okFinish) {
        flushSync(() => {
          setProgress(100);
          setGenStatus("success");
          setGenError(null);
          aiHudNanoBananaJobProgress(nodeId, 100);
        });
      }
      setTimeout(() => setProgress(0), 1000);
    }
  }, [
    cards,
    commitGeneratedOutput,
    composeBrainImageGeneratorPrompt,
    currentImage,
    effectiveStudioResolution,
    exporting6k,
    global,
    imgNat.h,
    imgNat.w,
    inspectingCall,
    isOpenAi,
    isPro,
    lastGenerated,
    acceptedHistory.length,
    genStatus,
    nodeId,
    onBrainImageGeneratorDiagnostics,
    onResolutionChange,
    nodePrompt,
    readOnly,
    resolveContextCrop,
    studioAspect,
    studioModelKey,
    studioProvider,
    studioResolution,
    thinking,
    variantCount,
  ]);

  const onInspectCall = useCallback(async () => {
    if (readOnly || genStatus === "running" || inspectingCall) return;
    setInspectError(null);
    setInspectingCall(true);
    try {
      const scenePrompt = global.promptDraft;
      const genGlobal: StudioGlobal = { promptDraft: scenePrompt, schemaData: global.schemaData, text: global.text };
      const frame = { width: imgNat.w || workingFrameSize(studioAspect).width, height: imgNat.h || workingFrameSize(studioAspect).height };
      const plannedCrop = resolveContextCrop({ base: currentImage, cards, global: genGlobal, frame });
      const cropped = plannedCrop && currentImage ? await cropBaseImageDataUrl(currentImage, plannedCrop, frame) : null;
      const crop = cropped ? plannedCrop : null;
      const prepared = await prepareStudioGenerateCall({
        baseImage: crop ? cropped : currentImage,
        cards: crop ? cropCardsToRect(cards, crop) : cards,
        frameHeight: crop ? crop.height : frame.height,
        frameWidth: crop ? crop.width : frame.width,
        global: genGlobal,
        allowPaidAnalyze: false,
        contextCrop: Boolean(crop),
      });
      const merged = mergePromptWithBrain(
        composeBrainImageGeneratorPrompt,
        onBrainImageGeneratorDiagnostics,
        scenePrompt,
        prepared.prompt,
      );
      const order = describeStudioGenerateImageOrder(prepared.images);
      const eligibility = preserveComposeEligibility({
        baseImage: currentImage,
        cards,
        global: genGlobal,
      });
      const cropNote = crop ? ` ${describeContextCrop(crop, frame)}: el modelo recibe solo ese recorte y el resultado se pega de vuelta sobre la foto completa.` : "";
      const preserveNote = !preserveUnchanged
        ? "Conservar original: desactivado."
        : eligibility.ok
          ? `Conservar original: tras generar se compararán base y resultado y solo las zonas realmente modificadas se superpondrán a la base, igualando su desenfoque y grano al entorno.${cropNote}`
          : `Conservar original: no se aplicará. ${eligibility.reason}`;
      setCallPreview({
        analyzeError: prepared.analyzeError,
        images: order.kinds.map((kind, index) => ({ kind, src: prepared.imageList[index] ?? "" })).filter((item) => item.src),
        preserveNote,
        prompt: merged,
        ranAnalyzeAreas: false,
        usedAnalyzeAreas: shouldRunAnalyzeAreas(cards) && Boolean(currentImage),
      });
    } catch (error) {
      console.error("[ImageCreationStudio] ver llamada:", error);
      setInspectError(error instanceof Error ? error.message : "No se pudo armar la llamada.");
    } finally {
      setInspectingCall(false);
    }
  }, [
    cards,
    composeBrainImageGeneratorPrompt,
    currentImage,
    genStatus,
    global,
    imgNat.h,
    imgNat.w,
    inspectingCall,
    onBrainImageGeneratorDiagnostics,
    preserveUnchanged,
    readOnly,
    resolveContextCrop,
    studioAspect,
  ]);

  const onExport6k = useCallback(async () => {
    const src = historyPreviewUrl || sessionImage || currentImage;
    if (!src || exporting6k || genStatus === "running") return;
    setExport6kError(null);
    setExporting6k(true);
    try {
      const result = await runExport6k({ imageSrc: src, format: export6kFormat });
      const ext = result.format === "jpeg" ? "jpg" : "png";
      await downloadExport6kFile(result.output, `foldder-export-6k-${result.width}x${result.height}.${ext}`);
    } catch (error) {
      console.error("[ImageCreationStudio] export-6k:", error);
      setExport6kError(error instanceof Error ? error.message : "No se pudo exportar en 6K.");
    } finally {
      setExporting6k(false);
    }
  }, [currentImage, export6kFormat, exporting6k, genStatus, historyPreviewUrl, sessionImage]);

  const rehydrateBrief = useCallback(
    (brief: StudioHistoryBrief, asBase: "output" | "base") => {
      const url = asBase === "base" ? brief.baseUrl || brief.outputUrl : brief.outputUrl;
      flushSync(() => {
        setHistoryPreviewUrl(null);
        setShowingOriginal(false);
        setShowZoneOutlines(true);
        setCards(brief.cards.map((card) => ({ ...card })));
        setGlobal({ ...brief.global });
        setSceneOpen(Boolean(brief.global.promptDraft.trim() || brief.global.text.trim() || brief.global.schemaData));
        setSessionImage(url);
      });
      onGenerated(url, tryExtractKnowledgeFilesKeyFromUrl(url) ?? undefined);
    },
    [onGenerated],
  );

  const undoLastGenerate = useCallback(() => {
    const snap = undoSnapRef.current;
    if (!snap || genStatus === "running") return;
    setSessionImage(snap.sessionImage);
    setCards(snap.cards);
    setGlobal(snap.global);
    currentImageRef.current = snap.sessionImage;
    undoSnapRef.current = null;
    setCanUndo(false);
    setVariantPicks([]);
    setComposeNotice(null);
  }, [genStatus]);

  const onReintegrate = useCallback(async () => {
    const brief =
      findStudioHistoryBrief(hydratedBriefs, historyPreviewUrl || currentImage) ??
      hydratedBriefs[hydratedBriefs.length - 1];
    const raw = brief?.rawOutputUrl;
    const base = brief?.baseUrl;
    if (!raw || !base || genStatus === "running") return;
    setComposeStage("Integrando cambios sobre la original…");
    setGenStage("Integrando cambios sobre la original…");
    try {
      const outcome = await runPreserveCompose({
        baseImage: base,
        generatedOutput: raw,
        generatedKey: tryExtractKnowledgeFilesKeyFromUrl(raw),
        cards: brief.cards,
        frame: { width: imgNat.w, height: imgNat.h },
        sensitivity: composeSensitivity,
        crop: brief.crop ?? null,
      });
      const summary = summarizeComposeOutcome(outcome);
      setComposeNotice({ summary, maskPreview: outcome.maskPreview });
      if (outcome.composed && outcome.output) {
        setSessionImage(outcome.output);
        currentImageRef.current = outcome.output;
        onGenerated(outcome.output, outcome.key ?? undefined);
        onGenerationHistoryChange((h) =>
          h.some((url) => studioAssetsEqual(url, outcome.output)) ? h : [...h, outcome.output!],
        );
      }
    } catch (error) {
      setGenError(error instanceof Error ? error.message : "No se pudo reintegrar.");
    } finally {
      setComposeStage(null);
      setGenStage(null);
    }
  }, [composeSensitivity, currentImage, genStatus, historyPreviewUrl, hydratedBriefs, imgNat.h, imgNat.w, onGenerated, onGenerationHistoryChange]);

  const onPickVariant = useCallback(
    async (picked: { output: string; key?: string; crop?: StudioContextCrop | null }) => {
      setVariantPicks([]);
      const prev = currentImageRef.current;
      const frame = workingFrameSize(studioAspect);
      setGenStatus("running");
      setGenError(null);
      try {
        await commitGeneratedOutput({
          output: picked.output,
          key: picked.key,
          prev,
          cards,
          global,
          frameWidth: imgNat.w || frame.width,
          frameHeight: imgNat.h || frame.height,
          crop: picked.crop ?? null,
        });
        setGenStatus("success");
      } catch (error) {
        setGenStatus("error");
        setGenError(error instanceof Error ? error.message : "No se pudo integrar la variante.");
      } finally {
        setGenStage(null);
        setComposeStage(null);
      }
    },
    [cards, commitGeneratedOutput, global, imgNat.h, imgNat.w, studioAspect],
  );

  const compareBaseUrl = compareHoldUrl;

  useEffect(() => {
    const isTyping = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      return tag === "TEXTAREA" || tag === "INPUT" || el.isContentEditable;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const studios = document.querySelectorAll<HTMLElement>("[data-foldder-nano-banana-studio]");
      if (studios.length > 0 && studios.item(studios.length - 1) !== studioRootRef.current) return;
      if (event.key === "Escape") {
        if (settingsOpen || historyOpen || downloadOpen || moreOpen) {
          setSettingsOpen(false);
          setHistoryOpen(false);
          setDownloadOpen(false);
          setMoreOpen(false);
          event.preventDefault();
          return;
        }
        if (drawingLasso) {
          setDrawingLasso(false);
          setLassoPoints([]);
          event.preventDefault();
          return;
        }
        if (historyPreviewUrl) {
          setHistoryPreviewUrl(null);
          event.preventDefault();
        }
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        void onGenerate();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && (event.key === "z" || event.key === "Z") && !event.shiftKey) {
        if (isTyping(event.target)) return;
        event.preventDefault();
        undoLastGenerate();
        return;
      }
      if (isTyping(event.target) || genStatus === "running") return;
      if (event.key === " " && !event.repeat && compareBaseUrl) {
        event.preventDefault();
        setHoldingCompare(true);
        return;
      }
      if (readOnly) return;
      if (event.key === "l" || event.key === "L") {
        event.preventDefault();
        startAdd();
        return;
      }
      if (event.key === "Enter" && drawingLasso) {
        event.preventDefault();
        confirmLasso();
        return;
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === " ") setHoldingCompare(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [
    compareBaseUrl,
    confirmLasso,
    downloadOpen,
    drawingLasso,
    genStatus,
    historyOpen,
    historyPreviewUrl,
    moreOpen,
    onGenerate,
    readOnly,
    settingsOpen,
    startAdd,
    undoLastGenerate,
  ]);

  const showGenerate =
    !readOnly &&
    genStatus !== "running" &&
    !drawingLasso &&
    canStudioPrimaryGenerate(cards, global, { nodePrompt, hasGeneratedOutput });
  const paintSchema = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!schemaDrawing.current || event.buttons === 0) return;
    const canvas = schemaCanvasRef.current;
    if (!canvas || !schemaMode || readOnly) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((event.clientY - rect.top) / rect.height) * canvas.height;
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const beginSchemaStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0 || !schemaMode || readOnly) return;
    const canvas = schemaCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((event.clientY - rect.top) / rect.height) * canvas.height;
    const erase = schemaToolRef.current === "erase";
    ctx.globalCompositeOperation = erase ? "destination-out" : "source-over";
    ctx.strokeStyle = erase ? "rgba(0,0,0,1)" : "#f8fafc";
    ctx.lineWidth = Math.max(2, canvas.width * (erase ? 0.014 : 0.004));
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    schemaDrawing.current = true;
    ctx.beginPath();
    ctx.moveTo(x, y);
    canvas.setPointerCapture(event.pointerId);
  };

  const endSchemaStroke = () => {
    if (!schemaDrawing.current) return;
    schemaDrawing.current = false;
    const canvas = schemaCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.globalCompositeOperation = "source-over";
    setGlobal((prev) => ({ ...prev, schemaData: canvas.toDataURL("image/png") }));
    if (!focusedSchemaCaption.current) {
      focusedSchemaCaption.current = true;
      requestAnimationFrame(() => schemaCaptionRef.current?.focus());
    }
  };

  const clearSchemaDrawing = useCallback(() => {
    const canvas = schemaCanvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setGlobal((prev) => ({ ...prev, schemaData: null }));
    focusedSchemaCaption.current = false;
  }, []);

  useEffect(() => {
    const canvas = schemaCanvasRef.current;
    if (!canvas || !imgNat.w) return;
    canvas.width = imgNat.w;
    canvas.height = imgNat.h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!displayGlobal.schemaData) return;
    const img = new Image();
    img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    img.src = displayGlobal.schemaData;
  }, [displayGlobal.schemaData, imgNat.h, imgNat.w, historyPreviewUrl]);

  const cardElsRef = useRef<Record<string, HTMLDivElement | null>>({});
  useEffect(() => {
    if (!selectedCardId) return;
    cardElsRef.current[selectedCardId]?.scrollIntoView({ block: "nearest" });
  }, [selectedCardId]);

  const handleClose = () => {
    flushDraft();
    onClose();
  };

  return createPortal(
    <div
      ref={studioRootRef}
      className="nb-studio-root fixed inset-0 z-[100090] flex flex-col bg-[#07080b] text-white"
      data-foldder-studio-panel
      data-foldder-studio-canvas
      data-foldder-nano-banana-studio
      data-studio-node-id={nodeId}
      data-foldder-i18n-ignore
    >
      <FoldderStudioHeader
        nodeType="nanoBanana"
        nodeLabel={nodeLabel}
        subtitle={studioSetupLabel(studioModelKey, effectiveStudioResolution, studioAspect, isOpenAi)}
        onClose={topBarCloseMode === "default" ? handleClose : undefined}
        className="nb-image-studio-header"
        actions={
          <>
            <div className="flex items-center gap-1 px-1.5">
              {(["gemini", "openai"] as const).map((provider) => (
                <button
                  key={provider}
                  type="button"
                  aria-pressed={studioProvider === provider}
                  disabled={readOnly || settingsBusy}
                  onClick={() => applyStudioProvider(provider)}
                  className={`nb-studio-segment h-8 px-3 text-[12px] font-semibold transition disabled:opacity-30 ${
                    studioProvider === provider ? "nb-studio-segment--active" : "text-white/60 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {provider === "gemini" ? "Gemini" : "ChatGPT"}
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={!canUndo || genStatus === "running"}
              onClick={undoLastGenerate}
              className={STUDIO_ICON_BUTTON}
              aria-label="Deshacer última generación"
              title="Deshacer última generación"
            >
              <Undo2 size={16} />
            </button>
            <button
              type="button"
              disabled={!(historyPreviewUrl || sessionImage || currentImage) || genStatus === "running"}
              onClick={() => {
                setDownloadOpen((value) => !value);
                setSettingsOpen(false);
                setMoreOpen(false);
              }}
              className={STUDIO_ICON_BUTTON}
              aria-label="Descargar"
              title="Descargar"
            >
              <Download size={16} />
            </button>
            <button
              type="button"
              onClick={() => {
                setSettingsOpen((value) => !value);
                setDownloadOpen(false);
                setMoreOpen(false);
              }}
              className={`${STUDIO_ICON_BUTTON} ${settingsOpen ? "nb-studio-icon--active" : ""}`}
              aria-label="Ajustes"
              title="Ajustes"
            >
              <Settings2 size={16} />
            </button>
            <button
              type="button"
              onClick={() => {
                setMoreOpen((value) => !value);
                setSettingsOpen(false);
                setDownloadOpen(false);
              }}
              className={STUDIO_ICON_BUTTON}
              aria-label="Más opciones"
              title="Más opciones"
            >
              <MoreHorizontal size={17} />
            </button>
            {topBarCloseMode !== "default" ? (
              <button type="button" onClick={handleClose} className={STUDIO_ICON_BUTTON} aria-label="Volver">
                <ChevronLeft size={14} strokeWidth={2.5} />
              </button>
            ) : null}
          </>
        }
      />

      {genError && !readOnly ? (
        <div
          className="relative z-20 flex min-h-10 shrink-0 items-center gap-3 border-b border-rose-400/25 bg-rose-500/15 px-4 py-2 text-[13px] font-medium text-rose-100"
          data-foldder-i18n-ignore
          role="alert"
        >
          <span className="min-w-0 flex-1 leading-snug">{genError}</span>
          <button
            type="button"
            onClick={() => {
              setGenError(null);
              void onGenerate();
            }}
            className="shrink-0 font-semibold text-rose-100 hover:text-white"
            title="Nueva llamada de pago con el mismo encargo"
          >
            Reintentar
          </button>
          <button
            type="button"
            onClick={() => setGenError(null)}
            className="shrink-0 text-rose-100/70 hover:text-white"
            title="Cerrar"
          >
            <X size={12} />
          </button>
        </div>
      ) : null}

      {settingsOpen ? (
        <div className="absolute right-12 top-11 z-[100105] w-[340px] border border-white/15 bg-[#111318] p-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-[14px] font-semibold text-white">Ajustes de generación</p>
              <p className="mt-0.5 text-[12px] text-white/45">Modelo, tamaño y formato</p>
            </div>
            <button type="button" onClick={() => setSettingsOpen(false)} className={STUDIO_ICON_BUTTON} aria-label="Cerrar ajustes">
              <X size={16} />
            </button>
          </div>

          {!isOpenAi ? (
            <div className="mb-4">
              <p className="mb-2 text-[12px] font-medium text-white/55">Modelo</p>
              <div className="grid grid-cols-3 gap-1">
                {NANO_BANANA_GEMINI_MODELS.map((model) => (
                  <button
                    key={model.key}
                    type="button"
                    disabled={readOnly || settingsBusy}
                    onClick={() => {
                      setStudioModelKey(model.key);
                      onModelKeyChange?.(model.key);
                    }}
                    className={`nb-studio-choice h-9 px-2 text-[12px] font-semibold ${
                      studioModelKey === model.key ? "nb-studio-choice--active" : ""
                    }`}
                  >
                    {model.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mb-4">
            <p className="mb-2 text-[12px] font-medium text-white/55">Tamaño</p>
            <div className="grid grid-cols-3 gap-1">
              {(lockFlash25Res ? (["1k"] as const) : (["1k", "2k", "4k"] as const)).map((value) => (
                <button
                  key={value}
                  type="button"
                  disabled={readOnly || settingsBusy || !isNanoBananaResolutionEnabled(studioProvider, studioModelKey, value)}
                  onClick={() => {
                    setStudioResolution(value);
                    onResolutionChange?.(value);
                  }}
                  className={`nb-studio-choice h-9 text-[12px] font-semibold uppercase ${
                    effectiveStudioResolution === value ? "nb-studio-choice--active" : ""
                  }`}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[12px] font-medium text-white/55">Formato</p>
              {!aspectCanChange ? <span className="text-[11px] text-white/30">Bloqueado tras generar</span> : null}
            </div>
            <div className="grid grid-cols-5 gap-1">
              {nanoBananaAspectSelectOptions().map((option) => (
                <button
                  key={option.value}
                  type="button"
                  disabled={readOnly || settingsBusy || !aspectCanChange}
                  onClick={() => {
                    setStudioAspect(option.value);
                    onAspectRatioChange?.(option.value);
                  }}
                  className={`nb-studio-choice h-9 text-[11px] font-semibold ${
                    studioAspect === option.value ? "nb-studio-choice--active" : ""
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {isPro && !isOpenAi ? (
            <button
              type="button"
              aria-pressed={thinking}
              disabled={readOnly || settingsBusy}
              onClick={() => onThinkingChange?.(!thinking)}
              className={`mb-3 flex w-full items-center justify-between border px-3 py-2 text-left ${
                thinking ? "border-violet-400/50 bg-violet-500/15" : "border-white/10 bg-white/[0.03]"
              }`}
            >
              <span>
                <span className="block text-[13px] font-semibold text-white">Más razonamiento</span>
                <span className="block text-[11px] text-white/40">Solo Pro · más lento y más caro</span>
              </span>
              <span className={`h-5 w-9 p-0.5 ${thinking ? "bg-violet-400" : "bg-white/15"}`}>
                <span className={`block h-4 w-4 bg-white transition ${thinking ? "translate-x-4" : ""}`} />
              </span>
            </button>
          ) : null}

          <button
            type="button"
            aria-pressed={preserveUnchanged}
            disabled={readOnly || settingsBusy}
            onClick={() => {
              const next = !preserveUnchanged;
              setPreserveUnchanged(next);
              onPreserveUnchangedChange?.(next);
            }}
            className={`flex w-full items-center justify-between border px-3 py-2 text-left ${
              preserveUnchanged ? "border-emerald-400/40 bg-emerald-500/10" : "border-white/10 bg-white/[0.03]"
            }`}
          >
            <span className="flex min-w-0 items-center gap-2">
              <ShieldCheck size={17} className={preserveUnchanged ? "text-emerald-300" : "text-white/40"} />
              <span>
                <span className="block text-[13px] font-semibold text-white">Solo la zona marcada</span>
                <span className="block text-[11px] text-white/40">Protege el resto de la foto · sin coste</span>
              </span>
            </span>
            <span className={`h-5 w-9 shrink-0 p-0.5 ${preserveUnchanged ? "bg-emerald-400" : "bg-white/15"}`}>
              <span className={`block h-4 w-4 bg-white transition ${preserveUnchanged ? "translate-x-4" : ""}`} />
            </span>
          </button>

          {preserveUnchanged ? (
            <div className="mt-3">
              <p className="mb-2 text-[12px] font-medium text-white/55">Ajuste del borde</p>
              <div className="grid grid-cols-3 gap-1">
                {(["strict", "auto", "wide"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setComposeSensitivity(value)}
                    className={`nb-studio-choice h-9 text-[12px] ${
                      composeSensitivity === value ? "nb-studio-choice--active" : ""
                    }`}
                  >
                    {value === "strict" ? "Más justo" : value === "wide" ? "Más amplio" : "Automático"}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {downloadOpen ? (
        <div className="absolute right-12 top-11 z-[100105] w-[280px] border border-white/15 bg-[#111318] p-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-[14px] font-semibold text-white">Descargar imagen</p>
              <p className="mt-0.5 text-[12px] text-white/45">6K local · sin IA ni coste</p>
            </div>
            <button type="button" onClick={() => setDownloadOpen(false)} className={STUDIO_ICON_BUTTON} aria-label="Cerrar descarga">
              <X size={16} />
            </button>
          </div>
          <p className="mb-2 text-[12px] font-medium text-white/55">Formato</p>
          <div className="mb-4 grid grid-cols-2 gap-1">
            {(["png", "jpeg"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setExport6kFormat(value)}
                className={`nb-studio-choice h-9 text-[12px] font-semibold uppercase ${
                  export6kFormat === value ? "nb-studio-choice--active" : ""
                }`}
              >
                {value === "jpeg" ? "JPG" : "PNG"}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={exporting6k}
            onClick={() => void onExport6k()}
            className="flex h-11 w-full items-center justify-center gap-2 bg-white text-[13px] font-semibold !text-slate-950 hover:bg-white/90 disabled:opacity-40"
          >
            {exporting6k ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            {exporting6k ? "Preparando…" : "Descargar en 6K"}
          </button>
        </div>
      ) : null}

      {moreOpen ? (
        <div className="absolute right-10 top-11 z-[100105] w-[260px] border border-white/15 bg-[#111318] p-2">
          <button
            type="button"
            disabled={readOnly || genStatus === "running" || inspectingCall}
            onClick={() => {
              setMoreOpen(false);
              void onInspectCall();
            }}
            className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-[13px] text-white/75 hover:bg-white/[0.07] hover:text-white disabled:opacity-30"
          >
            {inspectingCall ? <Loader2 size={16} className="animate-spin" /> : <Eye size={16} />}
            <span>
              <span className="block font-semibold">Ver qué se enviará</span>
              <span className="block text-[11px] text-white/35">Vista local · nunca cobra</span>
            </span>
          </button>
          <div className="mt-1 border-t border-white/10 px-3 py-2 text-[11px] leading-5 text-white/35">
            <p>L · marcar zona</p>
            <p>Espacio · ver versión anterior</p>
            <p>⌘ ↵ · generar</p>
          </div>
        </div>
      ) : null}

      <div
        className={`absolute bottom-0 left-0 top-10 z-[100104] flex w-[320px] flex-col border-r border-white/15 bg-[#0f1116] shadow-2xl transition-transform duration-200 ease-out ${
          historyOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
          <button
            type="button"
            onClick={() => setHistoryOpen((value) => !value)}
            className="absolute left-full top-3 flex h-10 w-10 items-center justify-center border border-l-0 border-white/15 bg-[#151821] text-white/65 shadow-xl transition hover:bg-[#1b1f29] hover:text-white"
            aria-label={historyOpen ? "Plegar historial" : "Desplegar historial"}
            title={historyOpen ? "Plegar historial" : "Desplegar historial"}
          >
            {historyOpen ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
          </button>
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-white/10 px-3">
            <div className="flex items-center gap-2">
              <History size={17} />
              <span className="text-[14px] font-semibold">Versiones</span>
            </div>
            <button type="button" onClick={() => setHistoryOpen(false)} className={STUDIO_ICON_BUTTON} aria-label="Plegar historial">
              <ChevronLeft size={16} />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {acceptedHistory.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                <History size={24} className="mb-3 text-white/25" />
                <p className="text-[13px] font-medium text-white/60">Todavía no hay versiones</p>
                <p className="mt-1 text-[12px] text-white/35">Aparecerán después de generar.</p>
              </div>
            ) : (
              [...acceptedHistory].reverse().map((url, reverseIndex) => {
                const brief = findStudioHistoryBrief(hydratedBriefs, url);
                const changes = studioBriefChangeCards(brief);
                const versionNumber = acceptedHistory.length - reverseIndex;
                const selected = studioAssetsEqual(historyPreviewUrl, url);
                const current = !historyPreviewUrl && studioAssetsEqual(sessionImage, url);
                return (
                  <button
                    key={url}
                    type="button"
                    onClick={() => {
                      setHistoryPreviewUrl(url);
                      setShowZoneOutlines(true);
                      setChangesOpen(true);
                    }}
                    className={`mb-2 flex w-full gap-3 border p-2 text-left transition ${
                      selected || current ? "border-violet-400/70 bg-violet-500/10" : "border-white/10 hover:bg-white/[0.04]"
                    }`}
                  >
                    <img src={url} alt="" className="h-16 w-20 shrink-0 object-cover" />
                    <span className="min-w-0 flex-1 py-0.5">
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-[13px] font-semibold text-white">Versión {versionNumber}</span>
                        {current ? <span className="text-[10px] font-semibold text-emerald-300">Actual</span> : null}
                      </span>
                      <span className="mt-1 block truncate text-[12px] text-white/50">
                        {changes.length > 0
                          ? `${changes.length} ${changes.length === 1 ? "cambio" : "cambios"} · ${studioChangeLabel(changes[0]!, 0)}`
                          : "Imagen original"}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>

      <div className="relative z-0 flex min-h-0 flex-1 overflow-hidden">
        <section
          ref={containerRef}
          data-studio-viewer
          className="relative z-0 min-w-0 flex-1 overflow-hidden bg-[#07080b]"
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDropOnCanvas}
          onWheel={(e) => {
            e.preventDefault();
            const rect = containerRef.current?.getBoundingClientRect();
            if (!rect) return;
            const next = zoomTowardPoint(
              { pan: vPan.current, zoom: vZoom.current },
              { x: e.clientX - rect.left, y: e.clientY - rect.top },
              vZoom.current * wheelZoomFactor(e.deltaY),
            );
            vZoom.current = next.zoom;
            vPan.current = next.pan;
            applyViewTransform();
          }}
          onDoubleClick={(e) => {
            if ((e.target as HTMLElement).closest("[data-studio-overlay-ui]")) return;
            vZoom.current = 1;
            vPan.current = { x: 0, y: 0 };
            applyViewTransform();
          }}
          onPointerDown={(e) => {
            if (drawingLasso || schemaMode) return;
            if ((e.target as HTMLElement).closest("[data-studio-overlay-ui]")) return;
            if (isTouchUI && e.pointerType !== "mouse") {
              touchViewerHandlers.onPointerDown(e);
              return;
            }
            vIsDragging.current = true;
            vDragStart.current = { mx: e.clientX, my: e.clientY, px: vPan.current.x, py: vPan.current.y };
          }}
          onPointerMove={(e) => {
            if (drawingLasso || schemaMode) return;
            if (isTouchUI && e.pointerType !== "mouse") {
              touchViewerHandlers.onPointerMove(e);
              return;
            }
            if (!vIsDragging.current) return;
            vPan.current = {
              x: vDragStart.current.px + (e.clientX - vDragStart.current.mx) * STUDIO_VIEWER_PAN_GAIN,
              y: vDragStart.current.py + (e.clientY - vDragStart.current.my) * STUDIO_VIEWER_PAN_GAIN,
            };
            applyViewTransform();
          }}
          onPointerUp={(e) => {
            vIsDragging.current = false;
            if (isTouchUI && e.pointerType !== "mouse") touchViewerHandlers.onPointerUp(e);
          }}
          onPointerCancel={(e) => {
            vIsDragging.current = false;
            if (isTouchUI && e.pointerType !== "mouse") touchViewerHandlers.onPointerCancel(e);
          }}
        >
          <div
            ref={zoomWrapRef}
            className="absolute inset-0"
            style={{ transformOrigin: "0 0" }}
          >
            <div className="flex h-full w-full items-center justify-center">
            <div
              ref={overlayRef}
              className="relative shrink-0"
              style={{ width: fitSize.w, height: fitSize.h }}
            >
              {displayImage ? (
                <img
                  ref={imgRef}
                  src={displayImage}
                  alt=""
                  draggable={false}
                  onLoad={() => {
                    const img = imgRef.current;
                    if (!img?.naturalWidth) return;
                    setImgNat({ w: img.naturalWidth, h: img.naturalHeight });
                  }}
                  style={{ width: fitSize.w, height: fitSize.h, objectFit: "contain", display: "block" }}
                />
              ) : (
                <div
                  data-studio-overlay-ui
                  className="flex h-full w-full flex-col items-center justify-center border border-dashed border-white/20 bg-white/[0.025] px-6 text-center"
                >
                  <ImagePlus size={28} className="mb-3 text-white/35" />
                  <p className="text-[15px] font-semibold text-white/80">Añade una imagen</p>
                  <p className="mt-1 text-[13px] text-white/40">Arrástrala aquí o elige dónde buscarla</p>
                  <div className="mt-4 flex items-center gap-2">
                    <button
                      type="button"
                      disabled={readOnly || genStatus === "running"}
                      onClick={() => openPcSource(STUDIO_SCENE_DEST)}
                      className={STUDIO_TEXT_BUTTON}
                    >
                      <Upload size={16} />
                      Equipo
                    </button>
                    <button
                      type="button"
                      disabled={readOnly || genStatus === "running"}
                      onClick={() => openFoldderSource(STUDIO_SCENE_DEST)}
                      className={STUDIO_TEXT_BUTTON}
                    >
                      <FolderOpen size={16} />
                      Foldder
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSceneOpen(true);
                      requestAnimationFrame(() => scenePromptRef.current?.focus());
                    }}
                    className="mt-4 text-[12px] font-medium text-violet-300 hover:text-violet-200"
                  >
                    O describe una escena nueva
                  </button>
                </div>
              )}

              <svg
                className="absolute inset-0 h-full w-full overflow-visible"
                style={{
                  cursor: drawingLasso ? "crosshair" : "default",
                  pointerEvents: drawingLasso ? "auto" : "none",
                }}
                viewBox={`0 0 ${Math.max(1, imgNat.w)} ${Math.max(1, imgNat.h)}`}
                preserveAspectRatio="none"
                onPointerDown={(e) => {
                  if (!drawingLasso) return;
                  const pt = toImagePoint(e.clientX, e.clientY);
                  if (!pt) return;
                  setLassoPoints([pt]);
                  (e.target as Element).setPointerCapture(e.pointerId);
                }}
                onPointerMove={(e) => {
                  if (!drawingLasso || e.buttons === 0) return;
                  const pt = toImagePoint(e.clientX, e.clientY);
                  if (pt) setLassoPoints((prev) => [...prev, pt]);
                }}
                onPointerUp={() => {
                  if (drawingLasso) confirmLasso();
                }}
              >
                {showZoneOutlines
                  ? visibleCards.map((card, index) => {
                      if (card.lassoPoints.length <= 2) return null;
                      const center = polygonCenter(card.lassoPoints);
                      const radius = Math.max(15, imgNat.w * 0.012);
                      return (
                        <React.Fragment key={card.id}>
                          <polygon
                            points={polygonPoints(card.lassoPoints)}
                            fill={card.id === selectedCardId ? `${card.assignedColor.hex}66` : `${card.assignedColor.hex}2e`}
                            stroke={card.assignedColor.hex}
                            strokeWidth={imgNat.w * (card.id === selectedCardId ? 0.0035 : 0.002)}
                            style={{ pointerEvents: drawingLasso ? "none" : "auto", cursor: "pointer" }}
                            onPointerDown={(e) => {
                              e.stopPropagation();
                              setSelectedCardId(card.id);
                              if (!readOnly) setDraftCard(card);
                            }}
                          />
                          <circle cx={center.x} cy={center.y} r={radius} fill={card.assignedColor.hex} />
                          <text
                            x={center.x}
                            y={center.y}
                            dy="0.35em"
                            fill="#ffffff"
                            fontSize={radius * 1.15}
                            fontWeight="700"
                            textAnchor="middle"
                          >
                            {index + 1}
                          </text>
                        </React.Fragment>
                      );
                    })
                  : null}
                {drawingLasso && lassoPoints.length > 1 ? (
                  <polyline
                    points={polygonPoints(lassoPoints)}
                    fill="none"
                    stroke="#f8fafc"
                    strokeWidth={imgNat.w * 0.002}
                  />
                ) : null}
              </svg>

              {activeDraftCard && activeDraftCard.lassoPoints.length > 2 && !readOnly ? (() => {
                const center = polygonCenter(activeDraftCard.lassoPoints);
                const cardIndex = Math.max(0, cards.findIndex((card) => card.id === activeDraftCard.id));
                const placeLeft = center.x > imgNat.w * 0.58;
                return (
                  <div
                    data-studio-overlay-ui
                    className="absolute z-30 w-[280px] border border-white/20 bg-[#12151c]/95 p-3 shadow-2xl backdrop-blur-md"
                    style={{
                      left: `${(center.x / Math.max(1, imgNat.w)) * 100}%`,
                      top: `${(center.y / Math.max(1, imgNat.h)) * 100}%`,
                      transform: placeLeft
                        ? `translate(calc(-100% - 14px), -50%) scale(${100 / Math.max(1, zoomPercent)})`
                        : `translate(14px, -50%) scale(${100 / Math.max(1, zoomPercent)})`,
                      transformOrigin: placeLeft ? "right center" : "left center",
                    }}
                    onPointerDown={(event) => event.stopPropagation()}
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <span
                        className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold text-white"
                        style={{ backgroundColor: activeDraftCard.assignedColor.hex }}
                      >
                        {cardIndex + 1}
                      </span>
                      <span className="min-w-0 flex-1 text-[13px] font-semibold text-white">¿Qué debe cambiar aquí?</span>
                      <button
                        type="button"
                        onClick={() => setDraftCard(null)}
                        className="text-white/40 hover:text-white"
                        aria-label="Cerrar encargo"
                      >
                        <X size={15} />
                      </button>
                    </div>
                    <textarea
                      ref={draftTextRef}
                      value={activeDraftCard.description}
                      rows={3}
                      onChange={(event) => {
                        const description = event.target.value;
                        setCards((prev) =>
                          prev.map((card) => (card.id === activeDraftCard.id ? { ...card, description } : card)),
                        );
                      }}
                      placeholder="Ej.: cambia el jarrón por uno de cristal…"
                      className="w-full resize-none border border-white/12 bg-black/30 p-2 text-[13px] leading-5 text-white outline-none placeholder:text-white/25 focus:border-violet-300/60"
                    />
                    {activeDraftCard.references.length > 0 ? (
                      <div className="mt-2">
                        <p className="mb-1.5 text-[11px] font-medium text-white/45">
                          Referencias · {activeDraftCard.references.length}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {activeDraftCard.references.map((src, refIndex) => (
                            <button
                              key={`${activeDraftCard.id}-popover-ref-${refIndex}`}
                              type="button"
                              onClick={() =>
                                setCards((prev) =>
                                  prev.map((card) =>
                                    card.id === activeDraftCard.id
                                      ? {
                                          ...card,
                                          references: card.references.filter(
                                            (_, itemIndex) => itemIndex !== refIndex,
                                          ),
                                        }
                                      : card,
                                  ),
                                )
                              }
                              className="group relative h-12 w-12 overflow-hidden border border-white/20 bg-black/30"
                              title="Quitar referencia"
                            >
                              <img src={src} alt={`Referencia ${refIndex + 1}`} className="h-full w-full object-cover" />
                              <span className="absolute right-0 top-0 flex h-4 w-4 items-center justify-center bg-black/75 text-white/70 opacity-0 transition group-hover:opacity-100">
                                <X size={10} />
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    <div className="mt-2 flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => openPcSource(activeDraftCard.id)}
                        className={STUDIO_ICON_BUTTON}
                        aria-label="Añadir referencia desde equipo"
                        title="Añadir referencia desde equipo"
                      >
                        <Upload size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => openFoldderSource(activeDraftCard.id)}
                        className={STUDIO_ICON_BUTTON}
                        aria-label="Añadir referencia desde Foldder"
                        title="Añadir referencia desde Foldder"
                      >
                        <FolderOpen size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDraftCard(null)}
                        className="nb-studio-primary-action ml-auto h-9 px-3"
                      >
                        <Check size={15} />
                        Listo
                      </button>
                    </div>
                  </div>
                );
              })() : null}

              {showComposeMask && composeNotice?.maskPreview && !readOnly && !showingOriginal ? (
                <img
                  src={composeNotice.maskPreview}
                  alt=""
                  draggable={false}
                  className="pointer-events-none absolute inset-0 h-full w-full"
                  style={{ opacity: 0.55, mixBlendMode: "screen" }}
                />
              ) : null}

              <canvas
                ref={schemaCanvasRef}
                className="absolute inset-0 h-full w-full"
                style={{
                  pointerEvents: schemaMode && !readOnly ? "auto" : "none",
                  cursor: schemaMode ? (schemaTool === "erase" ? "cell" : "crosshair") : "default",
                  opacity: 0.9,
                }}
                onPointerDown={beginSchemaStroke}
                onPointerMove={paintSchema}
                onPointerUp={endSchemaStroke}
                onPointerCancel={endSchemaStroke}
              />

              {schemaMode || displayGlobal.schemaData || displayGlobal.text ? (
                <div
                  data-studio-overlay-ui
                  className="absolute inset-x-0 bottom-0 z-20 p-2"
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <div className="border border-white/20 bg-black/75 backdrop-blur-md">
                    <div className="h-px bg-gradient-to-r from-transparent via-white/50 to-transparent" />
                    <div className="flex items-end">
                    <textarea
                      ref={schemaCaptionRef}
                      value={readOnly ? displayGlobal.text : global.text}
                      disabled={readOnly}
                      rows={2}
                      onChange={(e) => setGlobal((prev) => ({ ...prev, text: e.target.value }))}
                      className="min-w-0 flex-1 resize-none bg-transparent px-3 py-2 text-[13px] leading-5 text-white outline-none"
                    />
                    {!readOnly && displayGlobal.schemaData ? (
                      <button
                        type="button"
                        onClick={clearSchemaDrawing}
                        className="mb-1 mr-1 flex h-8 w-8 shrink-0 items-center justify-center text-white/50 hover:text-white"
                      >
                        <Trash2 size={14} />
                      </button>
                    ) : null}
                    </div>
                  </div>
                </div>
              ) : null}

            </div>
            </div>
          </div>

          {(holdingCompare || readOnly) && displayImage ? (
            <div
              data-studio-overlay-ui
              className="pointer-events-none absolute left-3 top-3 z-10 border border-white/15 bg-black/65 px-2.5 py-1 text-[12px] font-semibold text-white/80"
            >
              {holdingCompare
                ? "Versión anterior"
                : `Versión ${Math.max(
                    1,
                    acceptedHistory.findIndex((url) => studioAssetsEqual(url, historyPreviewUrl)) + 1,
                  )}`}
            </div>
          ) : null}

          <div data-studio-overlay-ui className="absolute bottom-3 left-3 z-10 flex items-center gap-1">
            <button type="button" onClick={() => zoomViewer(0.85)} className={STUDIO_ICON_BUTTON} aria-label="Alejar" title="Alejar">
              <Minus size={16} />
            </button>
            <button type="button" onClick={resetViewer} className={`${STUDIO_TEXT_BUTTON} min-w-[68px] px-2`} title="Ajustar a pantalla">
              {zoomPercent} %
            </button>
            <button type="button" onClick={() => zoomViewer(1.15)} className={STUDIO_ICON_BUTTON} aria-label="Acercar" title="Acercar">
              <ZoomIn size={16} />
            </button>
            <button type="button" onClick={resetViewer} className={STUDIO_ICON_BUTTON} aria-label="Encajar imagen" title="Encajar imagen">
              <Maximize2 size={16} />
            </button>
          </div>

          {readOnly ? (
            <div data-studio-overlay-ui className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setHistoryPreviewUrl(null);
                  setShowZoneOutlines(true);
                }}
                className={STUDIO_TEXT_BUTTON}
              >
                <ChevronLeft size={16} />
                Volver
              </button>
              {historyPreviewUrl ? (
                <button type="button" onClick={() => adoptHistoryAsBase(historyPreviewUrl)} className="nb-studio-primary-action h-10 px-4">
                  <Check size={16} />
                  Usar versión
                </button>
              ) : null}
              {previewBrief ? (
                <button type="button" onClick={() => rehydrateBrief(previewBrief, "output")} className={STUDIO_TEXT_BUTTON}>
                  <Pencil size={15} />
                  Crear desde aquí
                </button>
              ) : null}
            </div>
          ) : (
            <div data-studio-overlay-ui className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2">
              {displayImage ? (
                <button
                  type="button"
                  onClick={startAdd}
                  disabled={genStatus === "running"}
                  className="nb-studio-primary-light h-10 px-4"
                >
                  <Scan size={17} />
                  Marcar zona
                </button>
              ) : null}
              {visibleCards.some((card) => card.lassoPoints.length > 2) ? (
                <button
                  type="button"
                  aria-pressed={showZoneOutlines}
                  onClick={() => setShowZoneOutlines((value) => !value)}
                  className={STUDIO_TEXT_BUTTON}
                  title={showZoneOutlines ? "Ocultar zonas" : "Mostrar zonas"}
                >
                  {showZoneOutlines ? <EyeOff size={16} /> : <Eye size={16} />}
                  <span className="hidden xl:inline">Zonas</span>
                </button>
              ) : null}
              {compareBaseUrl ? (
                <button
                  type="button"
                  onPointerDown={() => setHoldingCompare(true)}
                  onPointerUp={() => setHoldingCompare(false)}
                  onPointerLeave={() => setHoldingCompare(false)}
                  className={STUDIO_TEXT_BUTTON}
                  title="Mantén pulsado para ver la versión anterior"
                >
                  <Layers size={16} />
                  Ver anterior
                </button>
              ) : null}
              {schemaMode ? (
                <>
                  <button
                    type="button"
                    onClick={() => setSchemaTool("draw")}
                    className={`${STUDIO_ICON_BUTTON} ${schemaTool === "draw" ? "nb-studio-icon--active" : ""}`}
                    aria-label="Dibujar esquema"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setSchemaTool("erase")}
                    className={`${STUDIO_ICON_BUTTON} ${schemaTool === "erase" ? "nb-studio-icon--active" : ""}`}
                    aria-label="Borrar trazo"
                  >
                    <Eraser size={15} />
                  </button>
                </>
              ) : null}
            </div>
          )}

          {genStatus === "running" && progress < 100 ? (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/50">
              <div className="h-full bg-[#6C5CE7]" style={{ width: `${progress}%` }} />
            </div>
          ) : null}
          {genStatus === "running" || exporting6k ? (
            <div className="pointer-events-none absolute left-1/2 top-4 z-20 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap border border-white/10 bg-black/70 px-3 py-2 text-[13px] font-semibold text-white/85">
              <Loader2 size={15} className="animate-spin text-violet-300" />
              {exporting6k ? "Preparando descarga…" : genStage || composeStage || "Generando…"}
            </div>
          ) : null}
        </section>

        <div
          className={`absolute bottom-0 right-[320px] top-0 z-20 flex w-[320px] flex-col border-l border-white/15 bg-[#0f1116] shadow-2xl transition-transform duration-200 ease-out max-[1100px]:right-[290px] max-[1100px]:w-[290px] ${
            changesOpen ? "translate-x-0" : "translate-x-full pointer-events-none"
          }`}
        >
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 px-4">
            <div>
              <p className="text-[15px] font-semibold text-white">{readOnly ? "Cambios de esta versión" : "Cambios por zona"}</p>
              <p className="mt-0.5 text-[12px] text-white/40">
                {visibleCards.length} {visibleCards.length === 1 ? "cambio" : "cambios"}
              </p>
            </div>
            <button type="button" onClick={() => setChangesOpen(false)} className={STUDIO_ICON_BUTTON} aria-label="Plegar cambios">
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {visibleCards.length === 0 ? (
              <div className="flex flex-col items-center justify-center border border-dashed border-white/12 px-5 py-8 text-center">
                <Scan size={22} className="mb-2 text-white/25" />
                <p className="text-[13px] font-medium text-white/60">
                  {readOnly ? "Esta versión no guardó cambios por zona" : displayImage ? "Marca una zona para empezar" : "Añade una imagen o describe una escena"}
                </p>
                {!readOnly && displayImage ? (
                  <button type="button" onClick={startAdd} className="mt-3 text-[12px] font-semibold text-violet-300 hover:text-violet-200">
                    Marcar zona
                  </button>
                ) : null}
              </div>
            ) : null}
            <div className="space-y-2">
              {visibleCards.map((card, index) => (
                <div
                  key={card.id}
                  ref={(element) => {
                    cardElsRef.current[card.id] = element;
                  }}
                  onClick={() => setSelectedCardId(card.id)}
                  onDragOver={(event) => {
                    event.preventDefault();
                    dropCardIdRef.current = card.id;
                  }}
                  className={`border p-3 transition ${
                    selectedCardId === card.id ? "border-white/35 bg-white/[0.07]" : "border-white/10 bg-white/[0.025]"
                  }`}
                  style={selectedCardId === card.id ? { borderLeftColor: card.assignedColor.hex, borderLeftWidth: 3 } : undefined}
                >
                  <div className="mb-2 flex items-center gap-2">
                    <span
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                      style={{ backgroundColor: card.assignedColor.hex }}
                    >
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1 text-[12px] font-semibold text-white/70">Cambio {index + 1}</span>
                    <span className="text-[11px] text-white/30">
                      {card.lassoPoints.length > 2 || card.paintData ? "Zona marcada" : "Sin zona"}
                    </span>
                    {!readOnly ? (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          removeCard(card.id);
                        }}
                        className="text-white/25 hover:text-rose-300"
                        aria-label={`Eliminar cambio ${index + 1}`}
                        title="Eliminar cambio"
                      >
                        <Trash2 size={15} />
                      </button>
                    ) : null}
                  </div>
                  <textarea
                    value={card.description}
                    disabled={readOnly}
                    onChange={(event) =>
                      setCards((prev) => prev.map((item) => (item.id === card.id ? { ...item, description: event.target.value } : item)))
                    }
                    rows={2}
                    placeholder="Describe qué debe cambiar…"
                    className="w-full resize-none bg-transparent text-[13px] leading-5 text-white/80 outline-none placeholder:text-white/25"
                  />
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {card.references.map((src, refIndex) => (
                      <button
                        key={`${card.id}-${refIndex}`}
                        type="button"
                        disabled={readOnly}
                        onClick={(event) => {
                          event.stopPropagation();
                          setCards((prev) =>
                            prev.map((item) =>
                              item.id === card.id
                                ? { ...item, references: item.references.filter((_, itemIndex) => itemIndex !== refIndex) }
                                : item,
                            ),
                          );
                        }}
                        className="relative h-10 w-10 overflow-hidden border border-white/15"
                        title={readOnly ? "Referencia" : "Quitar referencia"}
                      >
                        <img src={src} alt="" className="h-full w-full object-cover" />
                      </button>
                    ))}
                    {!readOnly && card.references.length < STUDIO_MAX_REFS_PER_CARD ? (
                      <>
                        <button type="button" onClick={() => openPcSource(card.id)} className={STUDIO_ICON_BUTTON} aria-label="Referencia desde equipo" title="Añadir referencia desde equipo">
                          <Upload size={15} />
                        </button>
                        <button type="button" onClick={() => openFoldderSource(card.id)} className={STUDIO_ICON_BUTTON} aria-label="Referencia desde Foldder" title="Añadir referencia desde Foldder">
                          <FolderOpen size={15} />
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <aside className="relative z-30 flex w-[320px] shrink-0 flex-col border-l border-white/10 bg-[#0c0d11] max-[1100px]:w-[290px]">
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 px-4">
            <div>
              <p className="text-[15px] font-semibold text-white">{readOnly ? "Versión seleccionada" : "Imagen"}</p>
              <p className="mt-0.5 text-[12px] text-white/40">
                {readOnly ? "Consulta o reutiliza esta versión" : "Escena completa y generación"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setChangesOpen((value) => !value)}
              className={`${STUDIO_TEXT_BUTTON} ${changesOpen ? "nb-studio-icon--active" : ""}`}
              aria-label={changesOpen ? "Plegar cambios" : "Desplegar cambios"}
              title={changesOpen ? "Plegar cambios" : "Desplegar cambios"}
            >
              <Scan size={15} />
              <span>{visibleCards.length}</span>
              {changesOpen ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <div className="mb-3 border border-white/10 bg-white/[0.025]">
              <button
                type="button"
                onClick={() => setSceneOpen((value) => !value)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
              >
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold text-white/80">Escena completa</span>
                  {!sceneOpen ? (
                    <span className="mt-0.5 block truncate text-[11px] text-white/35">
                      {displayGlobal.promptDraft?.trim() || "Opcional"}
                    </span>
                  ) : null}
                </span>
                <ChevronDown size={16} className={`shrink-0 text-white/35 transition ${sceneOpen ? "rotate-180" : ""}`} />
              </button>

              {sceneOpen ? (
                <div className="border-t border-white/10 p-2.5">
                  <div className="flex items-start gap-1">
                    <textarea
                      ref={scenePromptRef}
                      value={readOnly ? displayGlobal.promptDraft ?? "" : global.promptDraft}
                      onChange={(event) => setGlobal((prev) => ({ ...prev, promptDraft: event.target.value }))}
                      disabled={readOnly}
                      rows={3}
                      placeholder="Describe la escena o un cambio para toda la imagen…"
                      className="min-w-0 flex-1 resize-none bg-transparent px-1 text-[13px] leading-5 text-white/80 outline-none placeholder:text-white/25"
                    />
                    {!readOnly && nodePrompt && global.promptDraft !== nodePrompt ? (
                      <button
                        type="button"
                        onClick={() => setGlobal((prev) => ({ ...prev, promptDraft: nodePrompt }))}
                        className={STUDIO_ICON_BUTTON}
                        aria-label="Restaurar texto"
                        title="Restaurar texto conectado"
                      >
                        <RotateCcw size={14} />
                      </button>
                    ) : null}
                  </div>
                  {!readOnly ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSchemaMode((value) => !value);
                        setSchemaTool("draw");
                        setDrawingLasso(false);
                      }}
                      className={`mt-2 ${STUDIO_TEXT_BUTTON} ${schemaMode || global.schemaData ? "nb-studio-icon--active" : ""}`}
                    >
                      <Pencil size={15} />
                      Composición
                    </button>
                  ) : null}
                  {(schemaMode || displayGlobal.schemaData) && !readOnly ? (
                    <textarea
                      ref={schemaCaptionRef}
                      value={global.text}
                      rows={2}
                      onChange={(event) => setGlobal((prev) => ({ ...prev, text: event.target.value }))}
                      placeholder="Explica cómo debe cambiar la composición…"
                      className="mt-2 w-full resize-none border border-white/10 bg-black/20 p-2 text-[12px] leading-5 text-white/75 outline-none placeholder:text-white/25"
                    />
                  ) : null}
                </div>
              ) : null}
            </div>

            {nodeRefs.length > 0 && !readOnly ? (
              <div className="mb-3">
                <p className="mb-2 text-[12px] font-medium text-white/45">Imágenes conectadas</p>
                <div className="flex flex-wrap gap-1.5">
                  {nodeRefs.map((src) => (
                    <button
                      key={src}
                      type="button"
                      onClick={() => attachConnectedRef(src)}
                      className={`h-11 w-11 overflow-hidden border ${src === currentImage ? "border-violet-300" : "border-white/15"}`}
                      title={selectedCardId ? "Añadir como referencia al cambio seleccionado" : "Usar imagen"}
                    >
                      <img src={src} alt="" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <input
              ref={cardFileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(event) => {
                const dest = dropCardIdRef.current || selectedCardId;
                dropCardIdRef.current = null;
                const files = event.target.files ? Array.from(event.target.files) : [];
                event.target.value = "";
                if (files.length === 0) return;
                if (dest === STUDIO_SCENE_DEST || (!dest && !currentImageRef.current)) {
                  void readFilesAsDataUrls(files).then((urls) => applyIncomingUrls(urls, STUDIO_SCENE_DEST));
                  return;
                }
                if (dest) void attachRefsToCard(dest, files);
              }}
            />
          </div>

          {!readOnly ? (
            <div className="shrink-0 border-t border-white/10 bg-[#101217] p-3">
              {cards.some((card) => card.lassoPoints.length > 2 || card.paintData) ? (
                <button
                  type="button"
                  aria-pressed={preserveUnchanged}
                  onClick={() => {
                    const next = !preserveUnchanged;
                    setPreserveUnchanged(next);
                    onPreserveUnchangedChange?.(next);
                  }}
                  className={`mb-2 flex h-9 w-full items-center gap-2 border px-2.5 text-left text-[12px] font-medium ${
                    preserveUnchanged
                      ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100"
                      : "border-white/10 text-white/45"
                  }`}
                  title="Conserva el resto de la foto al aplicar cambios locales"
                >
                  <ShieldCheck size={15} />
                  <span className="flex-1">Solo la zona marcada</span>
                  <span className="text-[11px] opacity-65">{preserveUnchanged ? "Sí" : "No"}</span>
                </button>
              ) : null}
              <div className="mb-2 flex items-center gap-2">
                <span className="text-[12px] text-white/40">Resultados</span>
                <div className="flex flex-1 gap-1">
                  {([1, 2, 3] as const).map((count) => (
                    <button
                      key={count}
                      type="button"
                      onClick={() => setVariantCount(count)}
                      className={`nb-studio-choice h-8 flex-1 text-[12px] ${
                        variantCount === count ? "nb-studio-choice--active" : ""
                      }`}
                      title={count === 1 ? "Generar y usar un resultado" : `${count} candidatas; cada una se confirma por separado`}
                    >
                      {count}
                    </button>
                  ))}
                </div>
              </div>
              <button
                type="button"
                disabled={!showGenerate || inspectingCall}
                onClick={() => void onGenerate()}
                className="nb-studio-primary-action min-h-11 w-full px-4"
                title={
                  showGenerate
                    ? "Una llamada de pago · confirmación de wallet"
                    : "Añade una imagen, una escena o un cambio"
                }
              >
                {genStatus === "running" ? <Loader2 size={17} className="animate-spin" /> : <Sparkles size={17} />}
                <span>{genStatus === "running" ? "Generando…" : showGenerate ? `${variantCount > 1 ? "Generar candidata" : "Generar"} · ${formatStudioUsd(jobCost.totalUsd)}` : "Describe un cambio"}</span>
              </button>
            </div>
          ) : null}
        </aside>
      </div>

      {(composeNotice && !readOnly) || (readOnly && previewBrief?.compose) ? (
        <div
          className={`relative z-20 flex min-h-11 shrink-0 items-center gap-3 border-t border-white/10 px-3 text-[12px] ${
            (readOnly ? previewBrief?.compose?.composed : composeNotice?.summary.composed)
              ? "bg-emerald-500/10 text-emerald-100"
              : "bg-amber-500/10 text-amber-100"
          }`}
          title={composeNoticeText((readOnly ? previewBrief?.compose : composeNotice?.summary)!)}
        >
          <ShieldCheck size={16} className="shrink-0" />
          <span className="min-w-0 flex-1 truncate">
            {(readOnly ? previewBrief?.compose?.composed : composeNotice?.summary.composed)
              ? "Se conservó el resto de la foto"
              : "No se pudo proteger completamente el resto"}
          </span>
          {composeNotice?.maskPreview && !readOnly ? (
            <button
              type="button"
              aria-pressed={showComposeMask}
              onClick={() => setShowComposeMask((value) => !value)}
              className={STUDIO_TEXT_BUTTON}
            >
              <Eye size={15} />
              Ver aplicación
            </button>
          ) : null}
          {!readOnly && composeNotice?.summary.composed ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setSettingsOpen(true);
                  setDownloadOpen(false);
                  setMoreOpen(false);
                }}
                className={STUDIO_TEXT_BUTTON}
              >
                Ajustar borde
              </button>
              <button
                type="button"
                disabled={!hydratedBriefs.some((brief) => Boolean(brief.rawOutputUrl && brief.baseUrl))}
                onClick={() => void onReintegrate()}
                className={STUDIO_TEXT_BUTTON}
                title="Vuelve a pegar el resultado sobre la original · sin nueva llamada"
              >
                Volver a pegar
              </button>
            </>
          ) : null}
          {!readOnly ? (
            <button
              type="button"
              onClick={() => {
                setComposeNotice(null);
                setShowComposeMask(false);
              }}
              className={STUDIO_ICON_BUTTON}
              aria-label="Cerrar estado"
            >
              <X size={15} />
            </button>
          ) : null}
        </div>
      ) : null}
      <StudioFoldderImagePicker
        open={Boolean(foldderPickerDest)}
        onClose={() => setFoldderPickerDest(null)}
        onPick={(url) => {
          const dest = foldderPickerDest;
          setFoldderPickerDest(null);
          applyIncomingUrls([url], dest);
        }}
      />
      {inspectError ? (
        <div className="absolute inset-0 z-[100110] flex items-center justify-center bg-black/70 p-6" onClick={() => setInspectError(null)}>
          <div
            className="max-w-lg border border-white/15 bg-[#0c0d11] p-4 text-[12px] text-red-200"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-3 font-black uppercase tracking-widest text-white/70">Ver llamada</p>
            <p>{inspectError}</p>
            <button type="button" className="mt-4 border border-white/20 px-3 py-1.5 text-[10px] font-black uppercase" onClick={() => setInspectError(null)}>
              Cerrar
            </button>
          </div>
        </div>
      ) : null}
      {export6kError ? (
        <div className="absolute inset-0 z-[100110] flex items-center justify-center bg-black/70 p-6" onClick={() => setExport6kError(null)}>
          <div
            className="max-w-lg border border-white/15 bg-[#0c0d11] p-4 text-[12px] text-red-200"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-3 font-black uppercase tracking-widest text-white/70">Exportar 6K</p>
            <p>{export6kError}</p>
            <button
              type="button"
              className="mt-4 border border-white/20 px-3 py-1.5 text-[10px] font-black uppercase"
              onClick={() => setExport6kError(null)}
            >
              Cerrar
            </button>
          </div>
        </div>
      ) : null}
      {variantPicks.length > 0 ? (
        <div className="absolute inset-0 z-[100110] flex items-center justify-center bg-black/75 p-4 sm:p-8">
          <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden border border-white/15 bg-[#0c0d11]">
            <div className="flex items-start justify-between gap-4 border-b border-white/10 px-4 py-3">
              <div>
                <p className="text-[16px] font-semibold text-white">Candidatas temporales · {variantPicks.length}/{variantCount}</p>
                <p className="mt-1 text-[12px] text-white/40">Solo la que elijas se guardará como versión.</p>
              </div>
              <button type="button" onClick={() => setVariantPicks([])} className={STUDIO_ICON_BUTTON} aria-label="Descartar candidatas" title="Descartar candidatas">
                <X size={16} />
              </button>
            </div>
            <div className={`grid gap-3 overflow-y-auto p-4 ${variantPicks.length === 1 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-2 sm:grid-cols-3"}`}>
              {variantPicks.map((row, index) => (
                <button
                  key={row.output}
                  type="button"
                  onClick={() => void onPickVariant(row)}
                  className="group overflow-hidden border border-white/15 bg-white/[0.025] text-left transition hover:border-violet-300"
                >
                  <div className="relative">
                    <img src={row.output} alt="" className="aspect-[3/4] w-full object-cover" />
                    <span className="absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-[12px] font-bold text-white">
                      {index + 1}
                    </span>
                  </div>
                  <span className="flex h-10 items-center justify-center gap-2 text-[13px] font-semibold text-white/70 group-hover:text-white">
                    <Check size={15} />
                    Usar resultado {index + 1}
                  </span>
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-white/10 px-4 py-3">
              <p className={`text-[11px] ${genError ? "text-rose-200" : "text-white/40"}`}>
                {genError || "Cada candidata adicional es una nueva llamada y muestra su propia confirmación de coste."}
              </p>
              {variantPicks.length < variantCount ? (
                <button
                  type="button"
                  disabled={genStatus === "running"}
                  onClick={() => void onGenerate({ collectCandidate: true })}
                  className="nb-studio-primary-action h-10 shrink-0 px-4"
                >
                  {genStatus === "running" ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
                  Generar otra · {formatStudioUsd(jobCost.totalUsd)}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
      {callPreview ? (
        <div className="absolute inset-0 z-[100110] flex items-center justify-center bg-black/75 p-4 sm:p-8" onClick={() => setCallPreview(null)}>
          <div
            className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden border border-white/15 bg-[#0c0d11]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex h-12 shrink-0 items-center justify-between border-b border-white/10 px-4">
              <div>
                <p className="text-[14px] font-semibold text-white/85">Qué se enviará</p>
                <p className="text-[11px] text-white/35">Vista local · abrirla nunca llama al proveedor</p>
              </div>
              <div className="flex items-stretch">
                <button
                  type="button"
                  className="px-3 text-[12px] font-semibold text-white/50 hover:text-white"
                  onClick={() => void navigator.clipboard?.writeText(callPreview.prompt)}
                >
                  Copiar prompt
                </button>
                <button
                  type="button"
                  className="flex h-10 w-10 items-center justify-center text-white/60 hover:text-white"
                  onClick={() => setCallPreview(null)}
                  aria-label="Cerrar"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {callPreview.usedAnalyzeAreas ? (
                <p className="mb-3 border border-white/10 bg-white/[0.03] p-2.5 text-[12px] text-white/50">
                  Al pulsar Generar se analizarán las zonas. Esta vista usa una preparación local y no realiza ese análisis.
                </p>
              ) : null}
              <p className="mb-3 text-[12px] font-medium text-white/45">{callPreview.preserveNote}</p>
              <pre className="mb-4 whitespace-pre-wrap break-words bg-black/40 p-3 text-[12px] leading-5 text-zinc-200">
                {callPreview.prompt}
              </pre>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {callPreview.images.map((image) => (
                  <figure key={image.kind} className="border border-white/10 bg-black/30">
                    <figcaption className="border-b border-white/10 px-2 py-1.5 text-[11px] font-semibold text-white/50">
                      {CALL_SLOT_LABEL[image.kind]}
                    </figcaption>
                    <img src={image.src} alt={CALL_SLOT_LABEL[image.kind]} className="max-h-64 w-full object-contain" />
                  </figure>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>,
    document.body,
  );
});

ImageCreationStudio.displayName = "ImageCreationStudio";

/** Drop-in name used by the canvas node. */
export const NanoBananaStudio = ImageCreationStudio;
