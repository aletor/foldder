"use client";

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsDown,
  ChevronsUp,
  EyeOff,
  Maximize2,
  Minimize2,
  Play,
  Presentation,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import { PresenterShareModal } from "./PresenterShareModal";
import { getPageDimensions } from "../indesign/page-formats";
import type { DesignerPageState } from "../designer/DesignerNode";
import { PresenterAnimationsPanel } from "./PresenterAnimationsPanel";
import {
  mergeStepsWithPage,
  parsePresenterStepKey,
  PRESENTER_GROUP_ENTER_ANIM_MS,
  presenterStepKey,
} from "./presenter-group-animations";
import {
  applySoftGroupIdToObjects,
  newPresenterSoftGroupId,
  objectIdsForSoftGroup,
  presenterStepKeysToReplaceForIds,
  stripSoftGroupIdFromObjects,
} from "./presenter-soft-group";
import type { PickPointerModifiers, PlayRevealState } from "./DesignerPageCanvasView";
import type { PresenterGroupEnterId, PresenterRevealStep } from "./presenter-group-animations";
import { DesignerPageCanvasView } from "./DesignerPageCanvasView";
import { PresenterSlideStage, resolveIncomingTransition } from "./PresenterSlideStage";
import {
  DEFAULT_SLIDE_TRANSITION,
  SLIDE_TRANSITION_OPTIONS,
  type SlideTransitionId,
} from "./slide-transition-types";
import { TRANSITION_THUMB_BY_ID } from "./PresenterTransitionIcons";
import {
  firstPlayableIndex,
  isPresenterSlideSkipped,
  nextPlayableIndex,
  prevPlayableIndex,
} from "./presenter-skip-slide";
import type { PresenterImageVideoCanvasBinding, PresenterImageVideoPlacement } from "./presenter-image-video-types";
import { collectPresenterImageTargets } from "./presenter-image-video-collect";
import { PresenterVideoPropertiesPanel } from "./PresenterVideoPropertiesPanel";
import { findVideoPlacementForCanvasSelection } from "./presenter-video-selection";
import {
  FoldderStudioHeader,
  foldderStudioHeaderActionClassName,
} from "../FoldderStudioHeader";

/** Pausa entre pasos encadenados en la vista previa del panel (tras `PRESENTER_GROUP_ENTER_ANIM_MS`). */
const PRESENTER_EDITOR_PREVIEW_GAP_MS = 72;
const PRESENTER_ONBOARDING_KEY = "foldder-presenter-studio-onboarding-dismissed";

type ShareContext = {
  deckKey: string;
  deckTitle: string;
};

type Props = {
  pages: DesignerPageState[];
  onClose: () => void;
  shareContext: ShareContext;
  /** Persistir pasos de animación por página en el nodo Designer. */
  onPresenterPagePatch?: (pageId: string, patch: Partial<DesignerPageState>) => void;
  /** Vídeos en imágenes (solo nodo Presenter). */
  imageVideoPlacements?: PresenterImageVideoPlacement[];
  onImageVideoPlacementsChange?: (next: PresenterImageVideoPlacement[]) => void;
  /** Transiciones entre slides (persistidas en el nodo Presenter). */
  initialTransitionsByPageId?: Record<string, SlideTransitionId>;
  onTransitionsByPageIdChange?: (next: Record<string, SlideTransitionId>) => void;
};

type PendingAnim = {
  from: number;
  to: number;
  transition: SlideTransitionId;
  dir: 1 | -1;
};

function initTransitions(pages: DesignerPageState[]): Record<string, SlideTransitionId> {
  const o: Record<string, SlideTransitionId> = {};
  for (const p of pages) o[p.id] = DEFAULT_SLIDE_TRANSITION;
  return o;
}

export function PresenterStudio({
  pages,
  onClose,
  shareContext,
  onPresenterPagePatch,
  imageVideoPlacements = [],
  onImageVideoPlacementsChange,
  initialTransitionsByPageId,
  onTransitionsByPageIdChange,
}: Props) {
  const [shareOpen, setShareOpen] = useState(false);
  /** Panel lateral derecho: propiedades de vídeo · animaciones (iconos siempre visibles). */
  const [rightPanelTab, setRightPanelTab] = useState<"properties" | "animations" | null>("animations");
  const [playMode, setPlayMode] = useState(false);
  const playShellRef = useRef<HTMLDivElement | null>(null);
  const playAnimTimerRef = useRef<number | null>(null);
  const editorPreviewTimersRef = useRef<number[]>([]);
  const [playRevealCount, setPlayRevealCount] = useState(0);
  const [animateEnterTargetKey, setAnimateEnterTargetKey] = useState<string | null>(null);
  /** Vista previa al asignar un preset en el panel (solo lienzo del editor). */
  const [previewPlayReveal, setPreviewPlayReveal] = useState<PlayRevealState | null>(null);
  const [previewAnimateKey, setPreviewAnimateKey] = useState<string | null>(null);
  /** Barra inferior del modo Play (portal): ocultar módulo sin salir de presentación. */
  const [playBarHidden, setPlayBarHidden] = useState(false);
  const [playShellIsFullscreen, setPlayShellIsFullscreen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [pendingAnim, setPendingAnim] = useState<PendingAnim | null>(null);
  const [transitionsByPageId, setTransitionsByPageId] = useState<Record<string, SlideTransitionId>>(() => {
    const base = initialTransitionsByPageId ?? initTransitions(pages);
    const next = { ...base };
    for (const p of pages) {
      if (next[p.id] === undefined) next[p.id] = DEFAULT_SLIDE_TRANSITION;
    }
    return next;
  });
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [pickerPreviewTransition, setPickerPreviewTransition] = useState<SlideTransitionId | null>(null);

  /** Picker anclado al botón de transición (portal fijo). */
  const [picker, setPicker] = useState<{ pageId: string; rect: DOMRect } | null>(null);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const [videoUploadKey, setVideoUploadKey] = useState<string | null>(null);

  useEffect(() => {
    setTransitionsByPageId((prev) => {
      const next = { ...prev };
      for (const p of pages) {
        if (next[p.id] === undefined) next[p.id] = DEFAULT_SLIDE_TRANSITION;
      }
      return next;
    });
  }, [pages]);

  useEffect(() => {
    try {
      if (localStorage.getItem(PRESENTER_ONBOARDING_KEY) !== "1") setShowOnboarding(true);
    } catch {
      setShowOnboarding(true);
    }
  }, []);

  useEffect(() => {
    document.body.classList.add("nb-studio-open", "foldder-studio-flush");
    return () => document.body.classList.remove("nb-studio-open", "foldder-studio-flush");
  }, []);

  useEffect(() => {
    if (!picker) return;
    const onDown = (e: MouseEvent) => {
      const el = pickerRef.current;
      if (el && !el.contains(e.target as Node)) setPicker(null);
    };
    document.addEventListener("mousedown", onDown, true);
    return () => document.removeEventListener("mousedown", onDown, true);
  }, [picker]);

  const maxIdx = Math.max(0, pages.length - 1);
  const railFocusIdx = pendingAnim ? pendingAnim.to : activeIdx;
  const safeRailIdx = Math.min(Math.max(0, railFocusIdx), maxIdx);

  const onAnimationEnd = useCallback(() => {
    setPendingAnim((p) => {
      if (!p) return null;
      setActiveIdx(p.to);
      return null;
    });
  }, []);

  const goToIdx = useCallback(
    (nextIdx: number) => {
      if (pendingAnim) return;
      const safe = Math.min(Math.max(0, nextIdx), maxIdx);
      if (safe === activeIdx) return;
      const incomingT = resolveIncomingTransition(pages, safe, transitionsByPageId);
      const dir: 1 | -1 = safe > activeIdx ? 1 : -1;
      if (incomingT === "none") {
        setActiveIdx(safe);
        return;
      }
      setPendingAnim({ from: activeIdx, to: safe, transition: incomingT, dir });
    },
    [activeIdx, maxIdx, pages, pendingAnim, transitionsByPageId],
  );

  const setTransitionForPage = useCallback(
    (pageId: string, id: SlideTransitionId) => {
      setTransitionsByPageId((prev) => {
        const next = { ...prev, [pageId]: id };
        onTransitionsByPageIdChange?.(next);
        return next;
      });
    },
    [onTransitionsByPageIdChange],
  );

  const openPicker = useCallback((pageId: string, el: HTMLButtonElement | null) => {
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPicker({ pageId, rect });
  }, []);

  const togglePresenterSkipSlide = useCallback(
    (pageId: string) => {
      if (!onPresenterPagePatch) return;
      const p = pages.find((x) => x.id === pageId);
      if (!p) return;
      onPresenterPagePatch(pageId, { presenterSkipSlide: !p.presenterSkipSlide });
    },
    [onPresenterPagePatch, pages],
  );

  const currentPage = pages[safeRailIdx] ?? null;

  /** Alineado con el slide que pinta `PresenterSlideStage` (una sola capa). */
  const canvasPageId = pages[activeIdx]?.id ?? "";

  const onVideoUploadBusy = useCallback((key: string | null) => {
    setVideoUploadKey(key);
  }, []);

  const onVideoUpsert = useCallback(
    (p: PresenterImageVideoPlacement) => {
      if (!onImageVideoPlacementsChange) return;
      const rest = imageVideoPlacements.filter(
        (x) => !(x.pageId === p.pageId && x.imageObjectId === p.imageObjectId),
      );
      onImageVideoPlacementsChange([...rest, p]);
    },
    [imageVideoPlacements, onImageVideoPlacementsChange],
  );

  const onVideoPatch = useCallback(
    (
      placementId: string,
      patch: Partial<
        Pick<
          PresenterImageVideoPlacement,
          | "rel"
          | "autoplay"
          | "loop"
          | "mute"
          | "posterTimeSec"
          | "videoFittingMode"
          | "videoContentAlignment"
        >
      >,
    ) => {
      if (!onImageVideoPlacementsChange) return;
      onImageVideoPlacementsChange(
        imageVideoPlacements.map((x) => (x.id === placementId ? { ...x, ...patch } : x)),
      );
    },
    [imageVideoPlacements, onImageVideoPlacementsChange],
  );

  const onVideoRemove = useCallback(
    (placementId: string) => {
      if (!onImageVideoPlacementsChange) return;
      onImageVideoPlacementsChange(imageVideoPlacements.filter((x) => x.id !== placementId));
    },
    [imageVideoPlacements, onImageVideoPlacementsChange],
  );

  const placementsForCanvasPage = useMemo(
    () => imageVideoPlacements.filter((p) => p.pageId === canvasPageId),
    [imageVideoPlacements, canvasPageId],
  );

  const presenterImageVideoBinding = useMemo((): PresenterImageVideoCanvasBinding | null => {
    if (!onImageVideoPlacementsChange || !canvasPageId) return null;
    return {
      pageId: canvasPageId,
      placements: placementsForCanvasPage,
      uiMode: playMode ? "playback" : "edit",
      uploadingKey: videoUploadKey,
      onUploadBusy: onVideoUploadBusy,
      onUpsert: onVideoUpsert,
      onPatch: onVideoPatch,
      onRemove: onVideoRemove,
    };
  }, [
    onImageVideoPlacementsChange,
    canvasPageId,
    placementsForCanvasPage,
    playMode,
    videoUploadKey,
    onVideoUploadBusy,
    onVideoUpsert,
    onVideoPatch,
    onVideoRemove,
  ]);

  const [animationSelectedKeys, setAnimationSelectedKeys] = useState<string[]>([]);

  useLayoutEffect(() => {
    if (!currentPage) return;
    const steps = mergeStepsWithPage(currentPage);
    setAnimationSelectedKeys(steps[0] ? [presenterStepKey(steps[0])] : []);
  }, [currentPage?.id]);

  const handlePickKey = useCallback((key: string | null, mods: PickPointerModifiers) => {
    const multi = mods.ctrlKey || mods.metaKey;
    setAnimationSelectedKeys((prev) => {
      if (!key) return multi ? prev : [];
      if (!multi) return [key];
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return Array.from(next);
    });
  }, []);

  const handleMarqueeSelect = useCallback((keys: string[], mods: PickPointerModifiers) => {
    const multi = mods.ctrlKey || mods.metaKey;
    setAnimationSelectedKeys((prev) => {
      if (multi) {
        if (keys.length === 0) return prev;
        return Array.from(new Set([...prev, ...keys]));
      }
      return keys;
    });
  }, []);

  const handleAnimationsRowPick = useCallback((stepKey: string, mods: PickPointerModifiers) => {
    const multi = mods.ctrlKey || mods.metaKey;
    setAnimationSelectedKeys((prev) => {
      if (!multi) return [stepKey];
      const next = new Set(prev);
      if (next.has(stepKey)) next.delete(stepKey);
      else next.add(stepKey);
      return Array.from(next);
    });
  }, []);

  const canvasPageState = pages[activeIdx] ?? null;
  const selectedVideoPlacement = useMemo(
    () => findVideoPlacementForCanvasSelection(canvasPageState, animationSelectedKeys, placementsForCanvasPage),
    [canvasPageState, animationSelectedKeys, placementsForCanvasPage],
  );

  const presenterImageVideoForStage = useMemo((): PresenterImageVideoCanvasBinding | null => {
    if (pendingAnim || !presenterImageVideoBinding) return null;
    return {
      ...presenterImageVideoBinding,
      videoTransformHandlesObjectId: selectedVideoPlacement?.imageObjectId ?? null,
      highlightPickKeys: animationSelectedKeys,
    };
  }, [pendingAnim, presenterImageVideoBinding, selectedVideoPlacement?.imageObjectId, animationSelectedKeys]);

  const videoFrameImageTarget = useMemo(() => {
    if (!selectedVideoPlacement || !canvasPageState?.objects?.length) return null;
    const targets = collectPresenterImageTargets(canvasPageState.objects);
    return targets.find((t) => t.id === selectedVideoPlacement.imageObjectId) ?? null;
  }, [selectedVideoPlacement, canvasPageState?.objects]);

  const commitGroupSteps = useCallback(
    (nextSteps: PresenterRevealStep[]) => {
      if (!currentPage?.id) return;
      const prevSteps = mergeStepsWithPage(currentPage);
      const prevGroupIds = new Set(
        prevSteps.filter((s): s is PresenterRevealStep & { kind: "group" } => s.kind === "group").map((s) => s.groupId),
      );
      const nextGroupIds = new Set(
        nextSteps.filter((s): s is PresenterRevealStep & { kind: "group" } => s.kind === "group").map((s) => s.groupId),
      );
      const removedGroupIds = [...prevGroupIds].filter((id) => !nextGroupIds.has(id));

      let objects = currentPage.objects ?? [];
      for (const gid of removedGroupIds) {
        objects = stripSoftGroupIdFromObjects(objects, gid);
      }

      const patch: Partial<DesignerPageState> = { presenterGroupSteps: nextSteps };
      if (removedGroupIds.length > 0) {
        patch.objects = objects;
      }
      onPresenterPagePatch?.(currentPage.id, patch);
    },
    [currentPage, onPresenterPagePatch],
  );

  const clearEditorEnterPreview = useCallback(() => {
    for (const t of editorPreviewTimersRef.current) window.clearTimeout(t);
    editorPreviewTimersRef.current = [];
    setPreviewPlayReveal(null);
    setPreviewAnimateKey(null);
  }, []);

  const runPreviewAfterAssignEnter = useCallback(
    (next: PresenterRevealStep[], selectedKeys: string[], enter: PresenterGroupEnterId) => {
      if (enter === "none" || enter === "instant") return;
      clearEditorEnterPreview();
      const targets = selectedKeys
        .map((k) => {
          const idx = next.findIndex((s) => presenterStepKey(s) === k);
          return idx >= 0 ? { k, idx } : null;
        })
        .filter((x): x is { k: string; idx: number } => x !== null)
        .sort((a, b) => a.idx - b.idx);
      if (targets.length === 0) return;

      let seq = 0;
      const runOne = () => {
        if (seq >= targets.length) {
          clearEditorEnterPreview();
          return;
        }
        const { k, idx } = targets[seq]!;
        setPreviewPlayReveal({ revealCount: idx + 1, steps: next });
        setPreviewAnimateKey(k);
        const t1 = window.setTimeout(() => {
          setPreviewAnimateKey(null);
          setPreviewPlayReveal(null);
          seq += 1;
          const t2 = window.setTimeout(runOne, PRESENTER_EDITOR_PREVIEW_GAP_MS);
          editorPreviewTimersRef.current.push(t2);
        }, PRESENTER_GROUP_ENTER_ANIM_MS);
        editorPreviewTimersRef.current.push(t1);
      };
      runOne();
    },
    [clearEditorEnterPreview],
  );

  /** Vista previa al pasar el ratón por un preset (solo 1 elemento/grupo; no oculta el resto del slide). */
  const handlePreviewPresetHover = useCallback(
    (enter: PresenterGroupEnterId | null) => {
      if (enter === null) {
        clearEditorEnterPreview();
        return;
      }
      if (!currentPage || animationSelectedKeys.length !== 1) {
        clearEditorEnterPreview();
        return;
      }
      if (enter === "none" || enter === "instant") {
        clearEditorEnterPreview();
        return;
      }
      clearEditorEnterPreview();
      const sel = animationSelectedKeys[0]!;
      const steps = mergeStepsWithPage(currentPage);
      const next = [...steps];
      const idx = next.findIndex((s) => presenterStepKey(s) === sel);
      if (idx >= 0) {
        next[idx] = { ...next[idx], enter };
      } else {
        const p = parsePresenterStepKey(sel);
        if (!p) return;
        if (p.kind === "group") {
          next.push({ kind: "group", groupId: p.groupId, enter, exit: "none" });
        } else {
          next.push({ kind: "object", objectId: p.objectId, enter, exit: "none" });
        }
      }
      setPreviewPlayReveal({ revealCount: next.length, steps: next });
      setPreviewAnimateKey(sel);
      const t = window.setTimeout(() => {
        clearEditorEnterPreview();
      }, PRESENTER_GROUP_ENTER_ANIM_MS);
      editorPreviewTimersRef.current.push(t);
    },
    [animationSelectedKeys, currentPage, clearEditorEnterPreview],
  );

  const applyEnterToMultiSelection = useCallback(
    (selectedKeys: string[], enter: PresenterGroupEnterId) => {
      if (!currentPage || !onPresenterPagePatch) return;
      const objects = currentPage.objects ?? [];
      const ids = objectIdsForSoftGroup(selectedKeys, objects);
      if (ids.size < 2) return;
      const keysToReplace = presenterStepKeysToReplaceForIds(objects, ids);
      const newGid = newPresenterSoftGroupId();
      const nextObjects = applySoftGroupIdToObjects(objects, ids, newGid);
      const prev = mergeStepsWithPage(currentPage);
      const filtered = prev.filter((s) => !keysToReplace.has(presenterStepKey(s)));
      const nextSteps: PresenterRevealStep[] = [
        ...filtered,
        { kind: "group", groupId: newGid, enter, exit: "none" },
      ];
      onPresenterPagePatch(currentPage.id, {
        objects: nextObjects,
        presenterGroupSteps: nextSteps,
      });
      const newKey = `group:${newGid}`;
      setAnimationSelectedKeys([newKey]);
      runPreviewAfterAssignEnter(nextSteps, [newKey], enter);
    },
    [currentPage, onPresenterPagePatch, runPreviewAfterAssignEnter],
  );

  useEffect(() => {
    return () => clearEditorEnterPreview();
  }, [clearEditorEnterPreview]);

  useEffect(() => {
    clearEditorEnterPreview();
  }, [currentPage?.id, clearEditorEnterPreview]);

  useEffect(() => {
    if (playMode) clearEditorEnterPreview();
  }, [playMode, clearEditorEnterPreview]);

  const playRevealForOverlay = useMemo((): PlayRevealState | null => {
    if (!playMode || !currentPage) return null;
    const steps = mergeStepsWithPage(currentPage);
    if (!steps.length) return null;
    return { revealCount: playRevealCount, steps };
  }, [playMode, currentPage, playRevealCount]);

  useEffect(() => {
    if (!playMode) return;
    setPlayRevealCount(0);
    setAnimateEnterTargetKey(null);
  }, [activeIdx, playMode]);

  const playAdvanceRight = useCallback(() => {
    if (pendingAnim) return;
    const page = pages[activeIdx];
    if (!page) return;
    const steps = mergeStepsWithPage(page);
    if (steps.length > 0 && playRevealCount < steps.length) {
      const next = playRevealCount + 1;
      const step = steps[next - 1];
      const k = step ? presenterStepKey(step) : null;
      setPlayRevealCount(next);
      if (playAnimTimerRef.current) clearTimeout(playAnimTimerRef.current);
      setAnimateEnterTargetKey(k);
      playAnimTimerRef.current = window.setTimeout(
        () => setAnimateEnterTargetKey(null),
        PRESENTER_GROUP_ENTER_ANIM_MS,
      );
      return;
    }
    const nextI = nextPlayableIndex(pages, activeIdx);
    if (nextI !== null) {
      goToIdx(nextI);
      setPlayRevealCount(0);
      setAnimateEnterTargetKey(null);
    }
  }, [activeIdx, pages, playRevealCount, goToIdx, pendingAnim]);

  const playAdvanceLeft = useCallback(() => {
    if (pendingAnim) return;
    if (playRevealCount > 0) {
      setPlayRevealCount((c) => c - 1);
      setAnimateEnterTargetKey(null);
      return;
    }
    const prevI = prevPlayableIndex(pages, activeIdx);
    if (prevI !== null) goToIdx(prevI);
  }, [playRevealCount, activeIdx, pages, goToIdx, pendingAnim]);

  const canGoPlayPrev = useMemo(() => {
    if (pendingAnim) return false;
    if (playRevealCount > 0) return true;
    return prevPlayableIndex(pages, activeIdx) !== null;
  }, [pendingAnim, playRevealCount, activeIdx, pages]);

  const canGoPlayNext = useMemo(() => {
    if (pendingAnim) return false;
    const page = pages[activeIdx];
    if (!page) return false;
    const steps = mergeStepsWithPage(page);
    if (steps.length > 0 && playRevealCount < steps.length) return true;
    return nextPlayableIndex(pages, activeIdx) !== null;
  }, [pendingAnim, pages, activeIdx, playRevealCount]);

  const jumpToPlaySlide = useCallback(
    (i: number) => {
      if (pendingAnim) return;
      if (i === activeIdx) return;
      if (playMode && isPresenterSlideSkipped(pages[i])) return;
      goToIdx(i);
    },
    [pendingAnim, activeIdx, goToIdx, playMode, pages],
  );

  useLayoutEffect(() => {
    if (!picker) return;
    const onScroll = () => setPicker(null);
    window.addEventListener("scroll", onScroll, true);
    return () => window.removeEventListener("scroll", onScroll, true);
  }, [picker]);

  const exitPlay = useCallback(() => {
    setPlayMode(false);
    setPlayBarHidden(false);
    if (typeof document !== "undefined" && document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    }
  }, []);

  const enterPlay = useCallback(() => {
    setPicker(null);
    setPlayRevealCount(0);
    setAnimateEnterTargetKey(null);
    setPlayBarHidden(false);
    setPlayMode(true);
  }, []);

  const wasPlayModeRef = useRef(false);
  useEffect(() => {
    if (playMode && !wasPlayModeRef.current) {
      const cur = pages[activeIdx];
      if (cur && isPresenterSlideSkipped(cur)) {
        const first = firstPlayableIndex(pages);
        if (first !== null) {
          setPendingAnim(null);
          setActiveIdx(first);
          setPlayRevealCount(0);
          setAnimateEnterTargetKey(null);
        }
      }
    }
    wasPlayModeRef.current = playMode;
  }, [playMode, pages, activeIdx]);

  const togglePlayFullscreen = useCallback(() => {
    const el = playShellRef.current;
    if (!el) return;
    if (document.fullscreenElement === el) {
      void document.exitFullscreen().catch(() => undefined);
    } else {
      void el.requestFullscreen?.().catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    if (!playMode) return;
    const syncFs = () => {
      const el = playShellRef.current;
      setPlayShellIsFullscreen(Boolean(el && document.fullscreenElement === el));
    };
    document.addEventListener("fullscreenchange", syncFs);
    syncFs();
    return () => document.removeEventListener("fullscreenchange", syncFs);
  }, [playMode]);

  /** P: entrar / salir del modo Play. Captura para no disparar el atajo global del lienzo (Prompt). */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (shareOpen) return;
      const el = e.target as HTMLElement | null;
      if (el?.closest("input, textarea, select, [contenteditable]")) return;
      if (e.key !== "p" && e.key !== "P") return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault();
      e.stopPropagation();
      if (playMode) exitPlay();
      else enterPlay();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [shareOpen, playMode, enterPlay, exitPlay]);

  /** En Play: flechas = revelar grupos (orden del panel) y luego siguiente slide. */
  useEffect(() => {
    if (!playMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        exitPlay();
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        e.stopPropagation();
        playAdvanceRight();
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        e.stopPropagation();
        playAdvanceLeft();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [playMode, playAdvanceRight, playAdvanceLeft, exitPlay]);

  const stageFocusIdx = pendingAnim ? pendingAnim.to : activeIdx;

  const playableIndices = useMemo(
    () => pages.map((_, i) => i).filter((i) => !isPresenterSlideSkipped(pages[i])),
    [pages],
  );
  const playModeCounterText = useMemo(() => {
    if (!playMode) return null;
    if (playableIndices.length === 0) return "—";
    const pos = playableIndices.indexOf(stageFocusIdx);
    if (pos < 0) return `${stageFocusIdx + 1} / ${pages.length}`;
    return `${pos + 1} / ${playableIndices.length}`;
  }, [playMode, playableIndices, stageFocusIdx, pages.length]);

  return (
    <div
      className="fixed inset-0 z-[100010] flex flex-col bg-[#0b0d10] text-white"
      role="dialog"
      aria-modal="true"
      aria-labelledby="presenter-studio-title"
      data-foldder-studio-canvas=""
      data-foldder-studio-flush=""
      data-foldder-presenter-studio=""
      style={{ ["--foldder-studio-accent" as string]: "#f5b91b" }}
    >
      <FoldderStudioHeader
        nodeType="presenter"
        nodeLabel="Presenter"
        subtitle={`${pages.length} ${pages.length === 1 ? "diapositiva" : "diapositivas"}`}
        onClose={onClose}
        actions={
          <>
            <button
              type="button"
              onClick={enterPlay}
              className={foldderStudioHeaderActionClassName()}
              title="Modo presentación (P)"
            >
              <Play className="h-3.5 w-3.5 shrink-0 fill-current" strokeWidth={0} aria-hidden />
              Reproducir
            </button>
            <button
              type="button"
              onClick={() => setShareOpen(true)}
              className={foldderStudioHeaderActionClassName("bg-[#f5b91b]/95 text-black hover:bg-[#f5b91b]")}
            >
              Compartir
            </button>
          </>
        }
      />

      <div className="flex min-h-0 flex-1 flex-row border-t border-white/[0.08]">
        <aside className="flex w-[7.25rem] shrink-0 flex-col gap-0 overflow-y-auto border-r border-white/[0.08] bg-[#0a0c0f]">
          {pages.map((p, i) => {
            const d = getPageDimensions(p);
            const selected = i === safeRailIdx;
            const nextPage = i < pages.length - 1 ? pages[i + 1] : null;
            const nextTid = nextPage
              ? transitionsByPageId[nextPage.id] ?? DEFAULT_SLIDE_TRANSITION
              : DEFAULT_SLIDE_TRANSITION;
            const NextThumb = TRANSITION_THUMB_BY_ID[nextTid] ?? TRANSITION_THUMB_BY_ID.fade;

            const skipped = isPresenterSlideSkipped(p);
            return (
              <div
                key={p.id}
                className={`relative flex w-full min-w-0 shrink-0 flex-col overflow-hidden border-b border-white/[0.06] transition-colors ${
                  nextPage ? "pb-0" : ""
                } ${
                  selected
                    ? "bg-[#f5b91b]/[0.12]"
                    : "bg-transparent hover:bg-white/[0.03]"
                }`}
              >
                <div className="relative z-10 flex items-center justify-center gap-0.5 px-1 py-1">
                  <span className="min-w-0 flex-1 text-center text-[9px] font-semibold tabular-nums leading-none text-zinc-500">
                    {i + 1}
                  </span>
                  <button
                    type="button"
                    title={
                      skipped
                        ? "Incluir este slide en Play"
                        : "Omitir en Play (miniatura atenuada)"
                    }
                    aria-pressed={skipped}
                    aria-label={skipped ? "Incluir slide en presentación" : "Omitir slide en presentación"}
                    disabled={!onPresenterPagePatch}
                    className={`shrink-0 rounded-[3px] border p-0.5 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                      skipped
                        ? "border-amber-500/45 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25"
                        : "border-white/12 bg-[#0e1014]/90 text-zinc-500 hover:bg-white/10 hover:text-zinc-300"
                    }`}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      togglePresenterSkipSlide(p.id);
                    }}
                  >
                    <EyeOff size={11} strokeWidth={2} aria-hidden />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => goToIdx(i)}
                  className="w-full min-w-0 px-1 pb-1 text-left"
                  aria-current={selected ? "true" : undefined}
                  aria-label={`Diapositiva ${i + 1}`}
                >
                  <div
                    className={`w-full overflow-hidden border border-black/[0.08] bg-[#fafafa] ${
                      selected ? "ring-1 ring-[#f5b91b]/70" : ""
                    }`}
                    style={{
                      aspectRatio: `${Math.max(1, d.width)} / ${Math.max(1, d.height)}`,
                      opacity: skipped ? 0.05 : 1,
                    }}
                  >
                    <DesignerPageCanvasView objects={p.objects ?? []} pageWidth={d.width} pageHeight={d.height} />
                  </div>
                </button>

                {nextPage && (
                  <button
                    type="button"
                    title={`Transición al entrar en slide ${i + 2}: ${SLIDE_TRANSITION_OPTIONS.find((o) => o.id === nextTid)?.label ?? nextTid}. Clic para cambiar.`}
                    className={`-mx-0 flex h-5 w-full shrink-0 items-center justify-center border-t transition-colors ${
                      picker?.pageId === nextPage.id
                        ? "border-t-[#f5b91b]/40 bg-[#f5b91b]/10 text-[#f5b91b]"
                        : "border-white/[0.08] bg-white/[0.03] text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-300"
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      openPicker(nextPage.id, e.currentTarget);
                    }}
                    aria-label={`Animación de entrada al slide ${i + 2}`}
                  >
                    <NextThumb size={12} className="text-current" />
                  </button>
                )}
              </div>
            );
          })}
        </aside>

        <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#0b0d10]">
          <div className="flex shrink-0 items-center border-b border-white/[0.08] px-3 py-1.5">
            <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-zinc-500">
              Diapositiva {safeRailIdx + 1} / {pages.length}
            </p>
          </div>
          <div className="relative min-h-0 flex-1 overflow-hidden bg-[#fafafa]">
            <PresenterSlideStage
              pages={pages}
              activeIdx={activeIdx}
              pendingAnim={pendingAnim}
              onAnimationEnd={onAnimationEnd}
              playReveal={previewPlayReveal}
              animateEnterTargetKey={previewAnimateKey}
              allowPickDuringReveal={Boolean(previewPlayReveal)}
              showPresentationBounds={!playMode}
              presenterImageVideo={presenterImageVideoForStage}
              pickInteraction={
                playMode
                  ? null
                  : {
                      highlightKeys: animationSelectedKeys,
                      onPick: handlePickKey,
                      onMarqueeSelect: handleMarqueeSelect,
                    }
              }
            />
          </div>
        </main>

        <div className="flex min-h-0 max-h-full shrink-0 flex-row items-stretch overflow-hidden">
          {rightPanelTab === "properties" && (
            <PresenterVideoPropertiesPanel
              placement={selectedVideoPlacement}
              imageTarget={videoFrameImageTarget}
              onPatch={onVideoPatch}
            />
          )}
          {rightPanelTab === "animations" && currentPage && (
            <PresenterAnimationsPanel
              key={currentPage.id}
              page={currentPage}
              selectedStepKeys={animationSelectedKeys}
              onSelectStepKey={handleAnimationsRowPick}
              onReplaceStepSelection={setAnimationSelectedKeys}
              onChangeSteps={commitGroupSteps}
              onApplyEnterToMultiSelection={applyEnterToMultiSelection}
              onPreviewPresetHover={handlePreviewPresetHover}
              onClose={() => setRightPanelTab(null)}
            />
          )}
          <nav
            className="flex w-11 shrink-0 flex-col gap-0 border-l border-white/[0.08] bg-[#0a0c0f] py-0"
            aria-label="Paneles del presenter"
          >
            <button
              type="button"
              title="Propiedades (vídeo)"
              aria-pressed={rightPanelTab === "properties"}
              onClick={() => setRightPanelTab((t) => (t === "properties" ? null : "properties"))}
              className={`flex h-11 w-full items-center justify-center border-b border-white/[0.08] transition-colors ${
                rightPanelTab === "properties"
                  ? "bg-[#f5b91b]/15 text-[#f5b91b]"
                  : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
              }`}
            >
              <SlidersHorizontal className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
            </button>
            <button
              type="button"
              title="Animaciones"
              aria-pressed={rightPanelTab === "animations"}
              onClick={() => setRightPanelTab((t) => (t === "animations" ? null : "animations"))}
              className={`flex h-11 w-full items-center justify-center transition-colors ${
                rightPanelTab === "animations"
                  ? "bg-[#f5b91b]/15 text-[#f5b91b]"
                  : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
              }`}
            >
              <Sparkles className="h-4 w-4 shrink-0" aria-hidden />
            </button>
          </nav>
        </div>
      </div>

      {picker &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={pickerRef}
            role="dialog"
            aria-label="Elegir transición de slide"
            className="fixed z-[100020] w-[min(280px,calc(100vw-24px))] rounded-md border border-white/20 bg-[#161a22] p-2.5 shadow-xl shadow-black/40 backdrop-blur-xl"
            style={{
              top: Math.min(picker.rect.bottom + 8, window.innerHeight - 320),
              left: Math.max(
                12,
                Math.min(picker.rect.left + picker.rect.width / 2 - 140, window.innerWidth - 280 - 12),
              ),
            }}
          >
            <p className="mb-2 text-center text-[11px] font-bold tracking-tight text-white">Transición de slide</p>
            <div className="mb-2 flex h-14 items-center justify-center overflow-hidden rounded-md border border-white/10 bg-[#0e1014]">
              <div
                key={pickerPreviewTransition ?? transitionsByPageId[picker.pageId] ?? DEFAULT_SLIDE_TRANSITION}
                className={`presenter-transition-preview presenter-transition-preview--${
                  pickerPreviewTransition ?? transitionsByPageId[picker.pageId] ?? DEFAULT_SLIDE_TRANSITION
                } h-8 w-12 rounded-sm bg-sky-500/80`}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              {SLIDE_TRANSITION_OPTIONS.map((opt) => {
                const G = TRANSITION_THUMB_BY_ID[opt.id];
                const cur = transitionsByPageId[picker.pageId] ?? DEFAULT_SLIDE_TRANSITION;
                const isSel = cur === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onMouseEnter={() => setPickerPreviewTransition(opt.id)}
                    onMouseLeave={() => setPickerPreviewTransition(null)}
                    onFocus={() => setPickerPreviewTransition(opt.id)}
                    onBlur={() => setPickerPreviewTransition(null)}
                    onClick={() => {
                      setTransitionForPage(picker.pageId, opt.id);
                      setPicker(null);
                    }}
                    className={`flex flex-col items-center gap-1 rounded-[6px] border px-2 py-2 transition-colors ${
                      isSel
                        ? "border-[#f5b91b]/60 bg-[#f5b91b]/12"
                        : "border-white/10 bg-white/[0.04] hover:border-white/20 hover:bg-white/[0.07]"
                    }`}
                  >
                    <div className="flex h-11 w-full items-center justify-center text-zinc-300">
                      <G size={40} className="text-current" />
                    </div>
                    <span className="text-[9px] font-semibold uppercase tracking-wide text-zinc-400">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>,
          document.body,
        )}

      {playMode &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={playShellRef}
            className="fixed inset-0 z-[100025] flex flex-col bg-black"
            role="application"
            aria-label="Modo presentación"
          >
            <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center p-0">
              <div className="relative h-full min-h-0 w-full min-w-0 overflow-hidden bg-black">
                <PresenterSlideStage
                  pages={pages}
                  activeIdx={activeIdx}
                  pendingAnim={pendingAnim}
                  onAnimationEnd={onAnimationEnd}
                  playReveal={playRevealForOverlay}
                  animateEnterTargetKey={animateEnterTargetKey}
                  showPresentationBounds={false}
                  presenterImageVideo={presenterImageVideoForStage}
                />
              </div>
            </div>

            {!playBarHidden && (
              <footer className="flex h-[52px] shrink-0 items-center gap-3 border-t border-white/[0.08] bg-[#0a0a0c] px-3">
                <div className="flex shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    onClick={playAdvanceLeft}
                    disabled={!canGoPlayPrev}
                    className="rounded-lg p-2 text-white transition-colors hover:bg-white/10 disabled:pointer-events-none disabled:opacity-35"
                    aria-label="Slide anterior"
                    title="Anterior"
                  >
                    <ChevronLeft size={22} strokeWidth={2} aria-hidden />
                  </button>
                  <span className="min-w-[3.5rem] text-center text-[13px] font-medium tabular-nums text-white/90">
                    {playModeCounterText ?? `${stageFocusIdx + 1} / ${pages.length}`}
                  </span>
                  <button
                    type="button"
                    onClick={playAdvanceRight}
                    disabled={!canGoPlayNext}
                    className="rounded-lg p-2 text-white transition-colors hover:bg-white/10 disabled:pointer-events-none disabled:opacity-35"
                    aria-label="Slide siguiente"
                    title="Siguiente"
                  >
                    <ChevronRight size={22} strokeWidth={2} aria-hidden />
                  </button>
                </div>

                <div className="flex min-h-[6px] min-w-0 flex-1 items-center gap-[3px] px-1">
                  {playableIndices.map((i) => {
                    const p = pages[i];
                    if (!p) return null;
                    const isCurrent = i === stageFocusIdx;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => jumpToPlaySlide(i)}
                        disabled={pendingAnim !== null}
                        className={`h-[5px] min-w-0 flex-1 rounded-[1px] transition-colors ${
                          isCurrent ? "bg-white" : "bg-white/22 hover:bg-white/35"
                        } disabled:pointer-events-none disabled:opacity-50`}
                        aria-label={`Ir al slide ${i + 1}`}
                        title={`Slide ${i + 1}`}
                      />
                    );
                  })}
                </div>

                <div className="flex shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    onClick={togglePlayFullscreen}
                    className="rounded-lg p-2 text-white transition-colors hover:bg-white/10"
                    aria-label={playShellIsFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
                    title={playShellIsFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
                  >
                    {playShellIsFullscreen ? (
                      <Minimize2 size={20} strokeWidth={2} aria-hidden />
                    ) : (
                      <Maximize2 size={20} strokeWidth={2} aria-hidden />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPlayBarHidden(true)}
                    className="rounded-lg p-2 text-white transition-colors hover:bg-white/10"
                    aria-label="Ocultar barra de controles"
                    title="Ocultar barra"
                  >
                    <ChevronsDown size={20} strokeWidth={2} aria-hidden />
                  </button>
                </div>
              </footer>
            )}

            {playBarHidden && (
              <button
                type="button"
                onClick={() => setPlayBarHidden(false)}
                className="fixed bottom-5 left-1/2 z-[100026] flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/15 bg-[#1a1d24] px-4 py-2.5 text-[12px] font-medium text-white shadow-lg shadow-black/40 transition-colors hover:bg-white/10"
                aria-label="Mostrar barra de controles"
                title="Mostrar barra"
              >
                <ChevronsUp size={18} strokeWidth={2} aria-hidden />
                Controles
              </button>
            )}

            <p className="sr-only">
              Flechas: revelar cada paso en orden y avanzar slide al final. Escape o P para salir.
            </p>
          </div>,
          document.body,
        )}

      <PresenterShareModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        deckKey={shareContext.deckKey}
        deckTitle={shareContext.deckTitle}
        pages={pages}
        transitionsByPageId={transitionsByPageId}
        imageVideoPlacements={imageVideoPlacements}
      />

      {showOnboarding ? (
        <div className="pointer-events-none absolute inset-0 z-[100015] flex items-center justify-center p-4">
          <div className="pointer-events-auto max-w-md rounded-md border border-white/15 bg-[#12151a]/95 px-4 py-3 shadow-2xl backdrop-blur-md">
            <p className="text-[12px] font-bold text-white">Primeros pasos en Presenter</p>
            <ol className="mt-2 list-decimal space-y-1 pl-4 text-[10px] leading-snug text-zinc-300">
              <li>Elige slides en la columna izquierda.</li>
              <li>Haz clic en objetos del lienzo para definir pasos de animación.</li>
              <li>Asigna un preset en el panel Animaciones.</li>
              <li>Pulsa <span className="font-semibold text-white">Reproducir</span> (tecla P) para previsualizar.</li>
            </ol>
            <button
              type="button"
              className="mt-3 w-full rounded-md bg-sky-600 py-1.5 text-[10px] font-semibold text-white hover:bg-sky-500"
              onClick={() => {
                setShowOnboarding(false);
                try {
                  localStorage.setItem(PRESENTER_ONBOARDING_KEY, "1");
                } catch {
                  /* ignore */
                }
              }}
            >
              Entendido
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
