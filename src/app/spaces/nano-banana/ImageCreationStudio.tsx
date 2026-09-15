"use client";

import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { Check, ChevronLeft, Download, Eraser, Eye, Layers, Loader2, Pencil, Plus, RotateCcw, Sparkles, Trash2, X } from "lucide-react";
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
  foldderStudioHeaderActionClassName,
} from "../FoldderStudioHeader";
import {
  coerceNanoBananaAspect,
  coerceNanoBananaResolution,
  nanoBananaAspectSelectOptions,
  type NanoBananaAspectRatio,
  type NanoBananaImageProvider,
  type NanoBananaResolution,
} from "./nano-banana-output-options";
import { isValidClosedLasso, rasterizeLassoToPaintData } from "./lasso-to-paint-data";
import { StudioFoldderImagePicker, StudioRefSourceButtons } from "./StudioFoldderImagePicker";
import { canStudioPrimaryGenerate, describeStudioGenerateImageOrder, shouldRunAnalyzeAreas, type StudioGenerateSlotKind } from "./studio-generate-payload";
import { mergeStudioCardReferences, planStudioIncomingUrls, STUDIO_SCENE_DEST } from "./studio-foldder-images";
import { prepareStudioGenerateCall } from "./studio-prepare-generate";
import { preserveComposeEligibility, runPreserveCompose, summarizeComposeOutcome } from "./studio-preserve-compose";
import { downloadExport6kFile, runExport6k } from "./studio-export-6k";
import { clientPointToImagePoint, lassoAnchorPercent, STUDIO_VIEWER_PAN_GAIN, wheelZoomFactor, zoomTowardPoint } from "./studio-overlay-coords";
import {
  emptyDraft,
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
  cardHasStartedChange,
  cardHasZonePaint,
  createStudioCard,
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

function studioSetupLabel(
  modelKey: string,
  resolution: string,
  aspect: string,
  openai: boolean,
): string {
  const model = openai ? "GPT" : modelKey === "pro3" ? "Pro" : modelKey === "flash25" ? "NB 1" : "NB 2";
  return `${model} · ${resolution.toUpperCase()} · ${aspect}`;
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
    return `Zonas sin cambios conservadas de la original${pct}${dropped}.`;
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
  const settingsCanChange = aspectCanChange;
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

  const previewBrief = useMemo(
    () => (historyPreviewUrl ? hydratedBriefs.find((b) => b.outputUrl === historyPreviewUrl) ?? null : null),
    [hydratedBriefs, historyPreviewUrl],
  );
  const readOnly = Boolean(historyPreviewUrl);
  const displayImage = previewBrief
    ? previewBrief.baseUrl || previewBrief.outputUrl
    : historyPreviewUrl || currentImage;
  const displayCards = previewBrief ? previewBrief.cards : cards;
  const visibleCards = displayCards.filter((card) => card.id === draftCard?.id || cardHasStartedChange(card));
  const displayGlobal = previewBrief ? previewBrief.global : global;
  const popoverCard = !readOnly
    ? displayCards.find((card) => card.id === (selectedCardId || draftCard?.id) && card.lassoPoints.length > 2) ?? null
    : null;
  const popoverAnchor = popoverCard ? lassoAnchorPercent(popoverCard.lassoPoints, { width: imgNat.w, height: imgNat.h }) : null;

  const vZoom = useRef(1);
  const vPan = useRef({ x: 0, y: 0 });
  const vIsDragging = useRef(false);
  const vDragStart = useRef({ mx: 0, my: 0, px: 0, py: 0 });
  const zoomWrapRef = useRef<HTMLDivElement>(null);
  const applyViewTransform = () => {
    if (!zoomWrapRef.current) return;
    zoomWrapRef.current.style.transform = `translate(${vPan.current.x}px,${vPan.current.y}px) scale(${vZoom.current})`;
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

  const useConnectedRef = useCallback(
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
    Boolean(lastGenerated) || generationHistory.length > 0 || genStatus === "success";

  const onGenerate = useCallback(async () => {
    if (readOnly || inspectingCall) return;
    const canGo = canStudioPrimaryGenerate(cards, global, {
      nodePrompt,
      hasGeneratedOutput:
        Boolean(lastGenerated) || generationHistory.length > 0 || genStatus === "success",
    });
    if (!canGo) return;
    setGenStatus("running");
    setGenError(null);
    setProgress(0);
    setComposeNotice(null);
    setShowComposeMask(false);
    let okFinish = false;
    let failMessage: string | null = null;
    try {
      const ok = await runAiJobWithNotification({ nodeId, label: "Image Creation Studio" }, async () => {
        try {
          const scenePrompt = global.promptDraft;
          const frameWidth = imgNat.w || workingFrameSize(studioAspect).width;
          const frameHeight = imgNat.h || workingFrameSize(studioAspect).height;
          const prepared = await prepareStudioGenerateCall({
            baseImage: currentImage,
            cards,
            frameHeight,
            frameWidth,
            global: { promptDraft: scenePrompt, schemaData: global.schemaData, text: global.text },
          });
          const merged = mergePromptWithBrain(
            composeBrainImageGeneratorPrompt,
            onBrainImageGeneratorDiagnostics,
            scenePrompt,
            prepared.prompt,
          );
          const generate = isOpenAi ? openaiGenerateWithServerProgress : geminiGenerateWithServerProgress;
          const json = await generate(
            {
              prompt: merged,
              images: prepared.imageList,
              aspect_ratio: studioAspect,
              resolution: effectiveStudioResolution,
              model: studioModelKey,
              thinking: thinking && isPro && !isOpenAi,
            },
            (pct) => {
              setProgress(pct);
              aiHudNanoBananaJobProgress(nodeId, pct);
            },
          );
          const prev = currentImageRef.current;
          let out = json.output;
          let outKey = typeof json.key === "string" ? json.key : undefined;
          let rawOutputUrl: string | null = null;
          let composeSummary: StudioComposeSummary | null = null;
          let composeMaskPreview: string | null = null;

          // "Conservar zonas sin cambios": la generación ya está pagada y subida; este paso es
          // solo CPU en servidor y, si falla, se conserva la generación cruda.
          if (preserveUnchanged && prev) {
            const eligibility = preserveComposeEligibility({
              baseImage: prev,
              cards,
              global: { promptDraft: scenePrompt, schemaData: global.schemaData, text: global.text },
            });
            if (eligibility.ok) {
              setComposeStage("Integrando cambios sobre la original…");
              try {
                const outcome = await runPreserveCompose({
                  baseImage: prev,
                  generatedOutput: json.output,
                  generatedKey: outKey ?? null,
                  cards,
                  frame: { width: frameWidth, height: frameHeight },
                });
                composeSummary = summarizeComposeOutcome(outcome);
                composeMaskPreview = outcome.maskPreview;
                if (outcome.composed && outcome.output) {
                  rawOutputUrl = json.output;
                  out = outcome.output;
                  outKey = outcome.key ?? undefined;
                }
              } catch (error) {
                console.error("[ImageCreationStudio] preserve-compose:", error);
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
            } else if (cards.some(cardHasZonePaint)) {
              // Solo avisamos si el usuario usó el lazo; en ediciones globales no hay nada que integrar.
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

          onGenerationHistoryChange((h) => {
            const next = [...h];
            if (prev && prev !== out && !next.includes(prev)) next.push(prev);
            if (!next.includes(out)) next.push(out);
            return next;
          });
          const brief: StudioHistoryBrief = {
            outputUrl: out,
            baseUrl: prev,
            cards,
            global,
            rawOutputUrl,
            compose: composeSummary,
            composeMaskPreview,
          };
          persistStudioMedia(nodeId, emptyDraft(), [...hydratedBriefs.filter((b) => b.outputUrl !== out), brief]);
          setBriefs((prevBriefs) => [
            ...prevBriefs.filter((b) => b.outputUrl !== out).map(stripBriefForNode),
            stripBriefForNode(brief),
          ]);
          currentImageRef.current = out;
          setShowingOriginal(false);
          setSessionImage(out);
          if (composeSummary) setComposeNotice({ summary: composeSummary, maskPreview: composeMaskPreview });
          onGenerated(out, outKey);
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
      if (okFinish) {
        flushSync(() => {
          clearEdits();
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
    clearEdits,
    composeBrainImageGeneratorPrompt,
    currentImage,
    effectiveStudioResolution,
    global,
    hydratedBriefs,
    imgNat.h,
    imgNat.w,
    inspectingCall,
    isOpenAi,
    isPro,
    lastGenerated,
    generationHistory.length,
    genStatus,
    nodeId,
    onBrainImageGeneratorDiagnostics,
    onGenerated,
    onGenerationHistoryChange,
    preserveUnchanged,
    prompt,
    nodePrompt,
    readOnly,
    setBriefs,
    studioAspect,
    studioModelKey,
    thinking,
  ]);

  const onInspectCall = useCallback(async () => {
    if (readOnly || genStatus === "running" || inspectingCall) return;
    setInspectError(null);
    setInspectingCall(true);
    try {
      const scenePrompt = global.promptDraft;
      const prepared = await prepareStudioGenerateCall({
        baseImage: currentImage,
        cards,
        frameHeight: imgNat.h || workingFrameSize(studioAspect).height,
        frameWidth: imgNat.w || workingFrameSize(studioAspect).width,
        global: { promptDraft: scenePrompt, schemaData: global.schemaData, text: global.text },
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
        global: { promptDraft: scenePrompt, schemaData: global.schemaData, text: global.text },
      });
      const preserveNote = !preserveUnchanged
        ? "Conservar original: desactivado."
        : eligibility.ok
          ? "Conservar original: tras generar se compararán base y resultado y solo las zonas realmente modificadas se superpondrán a la base."
          : `Conservar original: no se aplicará. ${eligibility.reason}`;
      setCallPreview({
        analyzeError: prepared.analyzeError,
        images: order.kinds.map((kind, index) => ({ kind, src: prepared.imageList[index] ?? "" })).filter((item) => item.src),
        preserveNote,
        prompt: merged,
        ranAnalyzeAreas: prepared.ranAnalyzeAreas,
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

  const showGenerate =
    !readOnly &&
    genStatus !== "running" &&
    !drawingLasso &&
    canStudioPrimaryGenerate(cards, global, { nodePrompt, hasGeneratedOutput });
  const canToggleOriginal = Boolean(initialImage && sessionImage && initialImage !== sessionImage) && !readOnly;

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
      className="nb-studio-root fixed inset-0 z-[100090] flex flex-col bg-[#07080b] text-white"
      data-foldder-studio-panel
      data-foldder-studio-canvas
      data-foldder-nano-banana-studio
      data-foldder-i18n-ignore
    >
      <FoldderStudioHeader
        nodeType="nanoBanana"
        nodeLabel={nodeLabel}
        subtitle={settingsCanChange ? "" : studioSetupLabel(studioModelKey, effectiveStudioResolution, studioAspect, isOpenAi)}
        onClose={topBarCloseMode === "default" ? handleClose : undefined}
        actions={
          <>
            {(["gemini", "openai"] as const).map((provider) => (
              <button
                key={provider}
                type="button"
                aria-pressed={studioProvider === provider}
                disabled={readOnly || !settingsCanChange || inspectingCall}
                onClick={() => applyStudioProvider(provider)}
                className={foldderStudioHeaderActionClassName(
                  studioProvider === provider ? "bg-white text-slate-950 hover:bg-white hover:text-slate-950" : "",
                )}
              >
                {provider === "gemini" ? "Gemini" : "ChatGPT"}
              </button>
            ))}
            <button
              type="button"
              aria-pressed={preserveUnchanged}
              disabled={readOnly || genStatus === "running" || inspectingCall || exporting6k}
              onClick={() => {
                const next = !preserveUnchanged;
                setPreserveUnchanged(next);
                onPreserveUnchangedChange?.(next);
              }}
              className={foldderStudioHeaderActionClassName(
                preserveUnchanged ? "bg-white text-slate-950 hover:bg-white hover:text-slate-950" : "",
              )}
              title="Tras generar un cambio local, conserva de la imagen original todo lo que el modelo no modificó (sin coste de API)"
            >
              Conservar original
            </button>
            <button
              type="button"
              disabled={exporting6k}
              onClick={() => setExport6kFormat((prev) => (prev === "png" ? "jpeg" : "png"))}
              className={foldderStudioHeaderActionClassName()}
              title={
                export6kFormat === "png"
                  ? "Formato actual: PNG sin pérdida. Clic para JPEG q96"
                  : "Formato actual: JPEG q96. Clic para PNG sin pérdida"
              }
            >
              {export6kFormat === "png" ? "PNG" : "JPG"}
            </button>
            <button
              type="button"
              disabled={
                !(historyPreviewUrl || sessionImage || currentImage) ||
                genStatus === "running" ||
                inspectingCall ||
                exporting6k
              }
              onClick={() => void onExport6k()}
              className={foldderStudioHeaderActionClassName()}
              title="Reescala local a 6K (lado largo 6144) y descarga · sin IA ni coste de API. Para máxima calidad genera en 4K"
            >
              {exporting6k ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
              Exportar 6K
            </button>
            <button
              type="button"
              disabled={readOnly || genStatus === "running" || inspectingCall || exporting6k}
              onClick={() => void onInspectCall()}
              className={foldderStudioHeaderActionClassName()}
              title="Testing: analiza zonas y muestra el prompt e imágenes que se mandarían"
            >
              {inspectingCall ? <Loader2 size={12} className="animate-spin" /> : null}
              Ver llamada
            </button>
            {topBarCloseMode !== "default" ? (
              <button type="button" onClick={handleClose} className={foldderStudioHeaderActionClassName()}>
                <ChevronLeft size={14} strokeWidth={2.5} />
              </button>
            ) : null}
          </>
        }
      />

      {settingsCanChange ? (
      <div className="flex h-8 shrink-0 items-stretch divide-x divide-white/10 border-b border-white/10 bg-white/[0.04]">
        {!isOpenAi
          ? [
              { key: "flash25", label: "NB 1" },
              { key: "flash31", label: "NB 2" },
              { key: "pro3", label: "Pro" },
            ].map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => {
              setStudioModelKey(m.key);
              onModelKeyChange?.(m.key);
            }}
            className={`px-3 text-[8px] font-black uppercase tracking-[0.08em] ${
              studioModelKey === m.key ? "bg-white text-slate-950" : "text-white/40"
            }`}
          >
            {m.label}
          </button>
            ))
          : (
              <span className="flex items-center px-3 text-[8px] font-black uppercase tracking-[0.08em] text-white/40">
                GPT Image
              </span>
            )}
        {!lockFlash25Res
          ? (["1k", "2k", "4k"] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => {
                  setStudioResolution(r);
                  onResolutionChange?.(r);
                }}
                className={`px-3 text-[8px] font-black uppercase ${
                  effectiveStudioResolution === r ? "bg-white text-slate-950" : "text-white/35"
                }`}
              >
                {r}
              </button>
            ))
          : null}
        {nanoBananaAspectSelectOptions().map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => {
              setStudioAspect(option.value);
              onAspectRatioChange?.(option.value);
            }}
            className={`px-3 text-[8px] font-black ${
              studioAspect === option.value ? "bg-white text-slate-950" : "text-white/35"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
      ) : null}

      {genError && !readOnly ? (
        <div
          className="flex h-auto min-h-7 shrink-0 items-start gap-2 border-b border-rose-400/25 bg-rose-500/15 px-3 py-1.5 text-[10px] font-medium text-rose-100"
          data-foldder-i18n-ignore
          role="alert"
        >
          <span className="min-w-0 flex-1 leading-snug">{genError}</span>
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

      {composeNotice && !readOnly ? (
        <div
          className={`flex h-7 shrink-0 items-center gap-3 border-b border-white/10 px-3 text-[10px] font-medium ${
            composeNotice.summary.composed ? "bg-emerald-500/10 text-emerald-100" : "bg-amber-500/10 text-amber-100"
          }`}
          data-foldder-i18n-ignore
        >
          <span className="min-w-0 flex-1 truncate" title={composeNoticeText(composeNotice.summary)}>
            {composeNoticeText(composeNotice.summary)}
          </span>
          {composeNotice.maskPreview ? (
            <button
              type="button"
              aria-pressed={showComposeMask}
              onClick={() => setShowComposeMask((v) => !v)}
              className={`flex h-5 items-center gap-1 px-2 text-[9px] font-black uppercase tracking-widest ${
                showComposeMask ? "bg-white text-slate-950" : "bg-white/10 text-white/80 hover:bg-white/20"
              }`}
              title="Testing: resalta las zonas que se tomaron de la generación"
            >
              <Eye size={11} />
              Zonas
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setComposeNotice(null);
              setShowComposeMask(false);
            }}
            className="flex h-5 w-5 items-center justify-center text-white/50 hover:text-white"
            aria-label="Cerrar aviso"
          >
            <X size={12} />
          </button>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        {generationHistory.length > 0 ? (
          <div className="flex w-12 shrink-0 flex-col gap-1 overflow-y-auto border-r border-white/10 p-1.5">
            {generationHistory.map((url) => {
              const current = url === currentImage;
              const previewing = url === historyPreviewUrl;
              return (
                <button
                  key={url}
                  type="button"
                  onClick={() => {
                    if (previewing) {
                      setHistoryPreviewUrl(null);
                      return;
                    }
                    setHistoryPreviewUrl(url);
                  }}
                  className={`relative overflow-hidden border ${
                    previewing ? "border-yellow-300" : current ? "border-white" : "border-white/15"
                  }`}
                >
                  <img src={url} alt="" className="h-10 w-full object-cover" />
                  {current ? <span className="absolute bottom-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-white" /> : null}
                </button>
              );
            })}
          </div>
        ) : null}

        <section
          ref={containerRef}
          className="relative min-w-0 flex-1 bg-[#07080b]"
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
                  className="flex h-full w-full flex-col items-center justify-center border border-dashed border-white/25 bg-white/[0.03]"
                >
                  <StudioRefSourceButtons
                    size="lg"
                    disabled={readOnly || genStatus === "running"}
                    onPc={() => openPcSource(STUDIO_SCENE_DEST)}
                    onFoldder={() => openFoldderSource(STUDIO_SCENE_DEST)}
                  />
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
                {visibleCards.map((card) =>
                  card.lassoPoints.length > 2 ? (
                    <polygon
                      key={card.id}
                      points={polygonPoints(card.lassoPoints)}
                      fill={card.id === selectedCardId ? `${card.assignedColor.hex}66` : `${card.assignedColor.hex}2e`}
                      stroke={card.assignedColor.hex}
                      strokeWidth={imgNat.w * (card.id === selectedCardId ? 0.0035 : 0.002)}
                      style={{ pointerEvents: drawingLasso ? "none" : "auto", cursor: "pointer" }}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        setSelectedCardId(card.id);
                      }}
                    />
                  ) : null,
                )}
                {drawingLasso && lassoPoints.length > 1 ? (
                  <polyline
                    points={polygonPoints(lassoPoints)}
                    fill="none"
                    stroke="#f8fafc"
                    strokeWidth={imgNat.w * 0.002}
                  />
                ) : null}
              </svg>

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

              {popoverCard && popoverAnchor ? (
                <div
                  data-studio-overlay-ui
                  className="absolute z-20 w-56 border border-white/15 bg-[#0c0d11]/95 p-2 shadow-xl"
                  style={{ left: `${popoverAnchor.left}%`, top: `${popoverAnchor.top}%`, transform: "translate(8px, -8px)" }}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <textarea
                    ref={draftTextRef}
                    value={popoverCard.description}
                    rows={2}
                    onChange={(e) =>
                      setCards((prev) =>
                        prev.map((c) => (c.id === popoverCard.id ? { ...c, description: e.target.value } : c)),
                      )
                    }
                    className="w-full resize-none bg-transparent text-[12px] text-zinc-200 outline-none"
                  />
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    {popoverCard.references.map((src, index) => (
                      <button
                        key={`${popoverCard.id}-pop-${index}`}
                        type="button"
                        onClick={() =>
                          setCards((prev) =>
                            prev.map((c) =>
                              c.id === popoverCard.id
                                ? { ...c, references: c.references.filter((_, i) => i !== index) }
                                : c,
                            ),
                          )
                        }
                        className="h-7 w-7 overflow-hidden border border-white/10"
                      >
                        <img src={src} alt="" className="h-full w-full object-cover" />
                      </button>
                    ))}
                    {popoverCard.references.length < STUDIO_MAX_REFS_PER_CARD ? (
                      <StudioRefSourceButtons
                        disabled={readOnly || genStatus === "running"}
                        onPc={() => openPcSource(popoverCard.id)}
                        onFoldder={() => openFoldderSource(popoverCard.id)}
                      />
                    ) : null}
                    <button
                      type="button"
                      onClick={() => removeCard(popoverCard.id)}
                      className="ml-auto text-white/30 hover:text-white"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
            </div>
          </div>

          {canToggleOriginal && initialImage && sessionImage ? (
            <div data-studio-overlay-ui className="absolute left-4 top-4 z-10 flex gap-1">
              <button
                type="button"
                onClick={() => setShowingOriginal(true)}
                className={`h-10 w-10 overflow-hidden border ${showingOriginal ? "border-white" : "border-white/20"}`}
              >
                <img src={initialImage} alt="" className="h-full w-full object-cover" />
              </button>
              <button
                type="button"
                onClick={() => setShowingOriginal(false)}
                className={`h-10 w-10 overflow-hidden border ${!showingOriginal ? "border-white" : "border-white/20"}`}
              >
                <img src={sessionImage} alt="" className="h-full w-full object-cover" />
              </button>
            </div>
          ) : null}

          {readOnly && previewBrief?.compose ? (
            <div
              data-foldder-i18n-ignore
              className="pointer-events-none absolute left-1/2 top-6 z-10 max-w-[70%] -translate-x-1/2 truncate bg-black/60 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-white/80"
            >
              {composeNoticeText(previewBrief.compose)}
            </div>
          ) : null}

          {readOnly ? (
            <div data-studio-overlay-ui className="absolute bottom-6 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2">
              <button
                type="button"
                onClick={() => setHistoryPreviewUrl(null)}
                className="flex h-10 w-10 items-center justify-center bg-white/10"
              >
                <X size={16} />
              </button>
              {historyPreviewUrl ? (
                <button
                  type="button"
                  onClick={() => adoptHistoryAsBase(historyPreviewUrl)}
                  className="flex h-10 w-10 items-center justify-center bg-white text-zinc-950"
                  title={previewBrief?.compose?.composed ? "Usar esta versión (integrada sobre la original)" : "Usar esta versión"}
                >
                  <Check size={16} />
                </button>
              ) : null}
              {previewBrief?.rawOutputUrl && previewBrief.rawOutputUrl !== previewBrief.outputUrl ? (
                <button
                  type="button"
                  onClick={() => adoptHistoryAsBase(previewBrief.rawOutputUrl!)}
                  className="flex h-10 items-center gap-2 bg-white/10 px-3 text-[9px] font-black uppercase tracking-widest text-white/80 hover:bg-white/20"
                  title="Usar la generación tal cual la devolvió el modelo, sin integrar sobre la original"
                >
                  <Layers size={14} />
                  Sin integrar
                </button>
              ) : null}
            </div>
          ) : (
            <div data-studio-overlay-ui className="absolute bottom-6 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2">
              <button
                type="button"
                onClick={startAdd}
                disabled={genStatus === "running"}
                className="flex h-10 w-10 items-center justify-center bg-white text-zinc-950 disabled:opacity-30"
              >
                <Plus size={18} />
              </button>
              {schemaMode ? (
                <>
                  <button
                    type="button"
                    onClick={() => setSchemaTool("draw")}
                    className={`flex h-10 w-10 items-center justify-center ${schemaTool === "draw" ? "bg-white text-zinc-950" : "bg-white/10"}`}
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setSchemaTool("erase")}
                    className={`flex h-10 w-10 items-center justify-center ${schemaTool === "erase" ? "bg-white text-zinc-950" : "bg-white/10"}`}
                  >
                    <Eraser size={15} />
                  </button>
                  {global.schemaData ? (
                    <button
                      type="button"
                      onClick={clearSchemaDrawing}
                      className="flex h-10 w-10 items-center justify-center bg-white/10 text-white/80 hover:bg-white/20"
                    >
                      <Trash2 size={15} />
                    </button>
                  ) : null}
                </>
              ) : null}
              {showGenerate ? (
                <button
                  type="button"
                  disabled={inspectingCall}
                  onClick={() => void onGenerate()}
                  className="flex h-10 items-center gap-2 bg-[#6C5CE7] px-5 disabled:opacity-40"
                >
                  <Sparkles size={16} />
                </button>
              ) : null}
            </div>
          )}

          {genStatus === "running" && progress < 100 ? (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/50">
              <div className="h-full bg-[#6C5CE7]" style={{ width: `${progress}%` }} />
            </div>
          ) : null}
          {genStatus === "running" || exporting6k ? (
            <div className="pointer-events-none absolute left-1/2 top-6 -translate-x-1/2 whitespace-nowrap text-[10px] font-black uppercase tracking-widest text-violet-200">
              <Loader2 size={12} className="mr-2 inline animate-spin" />
              {exporting6k ? "Exportando 6K…" : composeStage}
            </div>
          ) : null}
        </section>

        <aside className="flex w-[280px] shrink-0 flex-col gap-2 overflow-y-auto border-l border-white/10 bg-[#0c0d11] p-3">
            {nodeRefs.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {nodeRefs.map((src) => (
                  <button
                    key={src}
                    type="button"
                    disabled={readOnly}
                    onClick={() => useConnectedRef(src)}
                    className={`h-10 w-10 overflow-hidden border ${
                      src === currentImage ? "border-white" : "border-white/15"
                    }`}
                  >
                    <img src={src} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            ) : null}
            <div className="flex items-start gap-2 border border-white/10 bg-white/[0.03] p-2">
              <textarea
                ref={scenePromptRef}
                value={readOnly ? displayGlobal.promptDraft ?? "" : global.promptDraft}
                onChange={(e) => setGlobal((prev) => ({ ...prev, promptDraft: e.target.value }))}
                disabled={readOnly}
                rows={3}
                className="min-w-0 flex-1 resize-none bg-transparent text-[12px] text-zinc-200 outline-none"
              />
              {!readOnly && nodePrompt && global.promptDraft !== nodePrompt ? (
                <button
                  type="button"
                  onClick={() => setGlobal((prev) => ({ ...prev, promptDraft: nodePrompt }))}
                  className="flex h-8 w-8 shrink-0 items-center justify-center text-white/35 hover:text-white"
                >
                  <RotateCcw size={13} />
                </button>
              ) : null}
              <button
                type="button"
                disabled={readOnly}
                onClick={() => {
                  setSchemaMode((v) => !v);
                  setSchemaTool("draw");
                  setDrawingLasso(false);
                }}
                className={`flex h-8 w-8 shrink-0 items-center justify-center ${schemaMode || global.schemaData ? "bg-white text-zinc-950" : "bg-white/10"}`}
              >
                <Pencil size={13} />
              </button>
            </div>

            {visibleCards.map((card) => (
              <div
                key={card.id}
                ref={(el) => {
                  cardElsRef.current[card.id] = el;
                }}
                onClick={() => setSelectedCardId(card.id)}
                onDragOver={(e) => {
                  e.preventDefault();
                  dropCardIdRef.current = card.id;
                }}
                className={`border p-2 ${selectedCardId === card.id ? "border-white/50 bg-white/[0.08]" : "border-white/10"}`}
                style={selectedCardId === card.id ? { boxShadow: `inset 2px 0 0 ${card.assignedColor.hex}` } : undefined}
              >
                <div className="flex gap-2">
                  {card.references[0] ? (
                    <div className="h-12 w-14 shrink-0 overflow-hidden bg-black/40">
                      <img src={card.references[0]} alt="" className="h-full w-full object-cover" />
                    </div>
                  ) : null}
                  <textarea
                    ref={card.id === draftCard?.id && !popoverCard ? draftTextRef : undefined}
                    value={card.description}
                    disabled={readOnly}
                    onChange={(e) =>
                      setCards((prev) => prev.map((c) => (c.id === card.id ? { ...c, description: e.target.value } : c)))
                    }
                    rows={2}
                    className="min-w-0 flex-1 resize-none bg-transparent text-[12px] text-zinc-200 outline-none"
                  />
                  {!readOnly ? (
                    <button type="button" onClick={() => removeCard(card.id)} className="text-white/30 hover:text-white">
                      <X size={14} />
                    </button>
                  ) : null}
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {card.references.map((src, index) => (
                    <button
                      key={`${card.id}-${index}`}
                      type="button"
                      disabled={readOnly}
                      onClick={() =>
                        setCards((prev) =>
                          prev.map((c) =>
                            c.id === card.id ? { ...c, references: c.references.filter((_, i) => i !== index) } : c,
                          ),
                        )
                      }
                      className="h-7 w-7 overflow-hidden border border-white/10"
                    >
                      <img src={src} alt="" className="h-full w-full object-cover" />
                    </button>
                  ))}
                  {!readOnly && card.references.length < STUDIO_MAX_REFS_PER_CARD ? (
                    <StudioRefSourceButtons
                      disabled={genStatus === "running"}
                      onPc={() => openPcSource(card.id)}
                      onFoldder={() => openFoldderSource(card.id)}
                    />
                  ) : null}
                </div>
              </div>
            ))}
            <input
              ref={cardFileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                const dest = dropCardIdRef.current || selectedCardId;
                dropCardIdRef.current = null;
                const files = e.target.files ? Array.from(e.target.files) : [];
                e.target.value = "";
                if (files.length === 0) return;
                if (dest === STUDIO_SCENE_DEST || (!dest && !currentImageRef.current)) {
                  void readFilesAsDataUrls(files).then((urls) => applyIncomingUrls(urls, STUDIO_SCENE_DEST));
                  return;
                }
                if (dest) void attachRefsToCard(dest, files);
              }}
            />
          </aside>
      </div>
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
      {callPreview ? (
        <div className="absolute inset-0 z-[100110] flex items-center justify-center bg-black/75 p-4 sm:p-8" onClick={() => setCallPreview(null)}>
          <div
            className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden border border-white/15 bg-[#0c0d11]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex h-10 shrink-0 items-center justify-between border-b border-white/10 px-3">
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-white/80">Ver llamada</p>
              <div className="flex items-stretch">
                <button
                  type="button"
                  className="px-3 text-[9px] font-black uppercase tracking-widest text-white/50 hover:text-white"
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
              <p className="mb-3 text-[10px] font-medium text-white/45">
                {callPreview.ranAnalyzeAreas
                  ? "Prompt final de analyze-areas (misma llamada que usa Generar)."
                  : callPreview.usedAnalyzeAreas
                    ? `Análisis falló; prompt local de respaldo.${callPreview.analyzeError ? ` ${callPreview.analyzeError}` : ""}`
                    : "Sin analyze-areas: no hay zona con texto. Prompt local."}
              </p>
              <p className="mb-3 text-[10px] font-medium text-white/45">{callPreview.preserveNote}</p>
              <pre className="mb-4 whitespace-pre-wrap break-words bg-black/40 p-3 text-[11px] leading-5 text-zinc-200">
                {callPreview.prompt}
              </pre>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {callPreview.images.map((image) => (
                  <figure key={image.kind} className="border border-white/10 bg-black/30">
                    <figcaption className="border-b border-white/10 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-white/50">
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
