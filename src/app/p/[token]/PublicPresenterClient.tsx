"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getPageDimensions } from "@/app/spaces/indesign/page-formats";
import { PresenterSlideStage, resolveIncomingTransition } from "@/app/spaces/presenter/PresenterSlideStage";
import type { PlayRevealState } from "@/app/spaces/presenter/DesignerPageCanvasView";
import {
  mergeStepsWithPage,
  PRESENTER_GROUP_ENTER_ANIM_MS,
  presenterStepKey,
} from "@/app/spaces/presenter/presenter-group-animations";
import { buildPresenterPlaybackImageVideoBinding } from "@/app/spaces/presenter/presenter-playback-image-video";
import type { SlideTransitionId } from "@/app/spaces/presenter/slide-transition-types";
import type { PublicPresenterShareRecord } from "@/lib/presenter-share-types";
import {
  firstPlayableIndex,
  isPresenterSlideSkipped,
  lastPlayableIndex,
  nextPlayableIndex,
  prevPlayableIndex,
} from "@/app/spaces/presenter/presenter-skip-slide";

type PendingAnim = {
  from: number;
  to: number;
  transition: SlideTransitionId;
  dir: 1 | -1;
};

type Props = {
  initial: PublicPresenterShareRecord;
};

export function PublicPresenterClient({ initial }: Props) {
  const pages = initial.payload.pages;
  const transitionsByPageId = useMemo(
    () => initial.payload.transitionsByPageId ?? {},
    [initial.payload.transitionsByPageId],
  );
  const imageVideoPlacements = useMemo(
    () => initial.payload.imageVideoPlacements ?? [],
    [initial.payload.imageVideoPlacements],
  );

  const [gatePass, setGatePass] = useState(() => !initial.options.requirePasscode);
  const [passInput, setPassInput] = useState("");
  const [passError, setPassError] = useState("");
  const [isVerifyingPass, setIsVerifyingPass] = useState(false);
  const [gateEmail, setGateEmail] = useState(() => !initial.options.requireVisitorEmail);
  const [emailInput, setEmailInput] = useState("");

  const [activeIdx, setActiveIdx] = useState(() => firstPlayableIndex(pages) ?? 0);
  const [pendingAnim, setPendingAnim] = useState<PendingAnim | null>(null);
  const [playRevealCount, setPlayRevealCount] = useState(0);
  const [animateEnterTargetKey, setAnimateEnterTargetKey] = useState<string | null>(null);
  const playAnimTimerRef = useRef<number | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    void fetch("/api/presenter-share/visit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: initial.token }),
    });
  }, [initial.token]);

  const maxIdx = Math.max(0, pages.length - 1);

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

  useEffect(() => {
    setPlayRevealCount(0);
    setAnimateEnterTargetKey(null);
  }, [activeIdx]);

  const playRevealComputed = useMemo((): PlayRevealState | null => {
    const pg = pages[activeIdx];
    if (!pg) return null;
    const steps = mergeStepsWithPage(pg);
    if (!steps.length) return null;
    return { revealCount: playRevealCount, steps };
  }, [pages, activeIdx, playRevealCount]);

  const playableIndices = useMemo(
    () => pages.map((_, i) => i).filter((i) => !isPresenterSlideSkipped(pages[i])),
    [pages],
  );

  const stageFocusIdx = pendingAnim ? pendingAnim.to : activeIdx;

  const slideCountLabel = useMemo(() => {
    if (playableIndices.length === 0) return "—";
    const pos = playableIndices.indexOf(stageFocusIdx);
    if (pos < 0) return `${stageFocusIdx + 1} / ${pages.length}`;
    return `${pos + 1} / ${playableIndices.length}`;
  }, [playableIndices, stageFocusIdx, pages.length]);

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

  const jumpToPlaySlide = useCallback(
    (idx: number) => {
      if (pendingAnim) return;
      goToIdx(idx);
      setPlayRevealCount(0);
      setAnimateEnterTargetKey(null);
    },
    [goToIdx, pendingAnim],
  );

  const canGoPlayPrev = useMemo(() => {
    if (pendingAnim) return false;
    if (playRevealCount > 0) return true;
    return prevPlayableIndex(pages, activeIdx) !== null;
  }, [pendingAnim, playRevealCount, pages, activeIdx]);

  const canGoPlayNext = useMemo(() => {
    if (pendingAnim) return false;
    const page = pages[activeIdx];
    if (!page) return false;
    const steps = mergeStepsWithPage(page);
    if (steps.length > 0 && playRevealCount < steps.length) return true;
    return nextPlayableIndex(pages, activeIdx) !== null;
  }, [pendingAnim, pages, activeIdx, playRevealCount]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!gatePass || !gateEmail) return;
      if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") {
        e.preventDefault();
        playAdvanceRight();
      }
      if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        playAdvanceLeft();
      }
      if (e.key === "Home") {
        e.preventDefault();
        const f = firstPlayableIndex(pages);
        if (f !== null) jumpToPlaySlide(f);
      }
      if (e.key === "End") {
        e.preventDefault();
        const la = lastPlayableIndex(pages);
        if (la !== null) jumpToPlaySlide(la);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [gateEmail, gatePass, playAdvanceRight, playAdvanceLeft, jumpToPlaySlide, pages]);

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.changedTouches[0];
    if (!t) return;
    touchStartRef.current = { x: t.clientX, y: t.clientY };
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    const t = e.changedTouches[0];
    if (!start || !t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy)) return;
    if (dx < 0) playAdvanceRight();
    else playAdvanceLeft();
  };

  const tryPass = async () => {
    if (!initial.options.requirePasscode) {
      setGatePass(true);
      return;
    }

    if (!passInput.trim() || isVerifyingPass) {
      return;
    }

    setPassError("");
    setIsVerifyingPass(true);

    try {
      const response = await fetch("/api/presenter-share/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: initial.token,
          passcode: passInput,
        }),
      });

      if (response.ok) {
        setGatePass(true);
        return;
      }

      setPassError("Codigo incorrecto");
    } catch {
      setPassError("No se pudo verificar el codigo");
    } finally {
      setIsVerifyingPass(false);
    }
  };

  const tryEmail = () => {
    if (!initial.options.requireVisitorEmail) {
      setGateEmail(true);
      return;
    }
    if (emailInput.includes("@")) setGateEmail(true);
  };

  const canvasPageId = pages[activeIdx]?.id ?? "";
  const presenterImageVideo = useMemo(
    () => buildPresenterPlaybackImageVideoBinding(canvasPageId, imageVideoPlacements),
    [canvasPageId, imageVideoPlacements],
  );

  if (!gatePass) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#0b0d10] px-4 text-white">
        <p className="text-sm font-semibold">Este enlace requiere código de acceso</p>
        <input
          type="password"
          value={passInput}
          onChange={(e) => {
            setPassInput(e.target.value);
            if (passError) setPassError("");
          }}
          className="w-full max-w-xs rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500/50"
          placeholder="Código"
        />
        {passError ? <p className="text-xs text-rose-400">{passError}</p> : null}
        <button
          type="button"
          onClick={() => void tryPass()}
          disabled={isVerifyingPass}
          className="rounded-xl bg-violet-600 px-5 py-2 text-sm font-bold text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isVerifyingPass ? "Verificando..." : "Continuar"}
        </button>
      </div>
    );
  }

  if (!gateEmail) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#0b0d10] px-4 text-white">
        <p className="text-sm font-semibold">Introduce tu email para continuar</p>
        <input
          type="email"
          value={emailInput}
          onChange={(e) => setEmailInput(e.target.value)}
          className="w-full max-w-xs rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500/50"
          placeholder="nombre@ejemplo.com"
        />
        <button
          type="button"
          onClick={tryEmail}
          className="rounded-xl bg-violet-600 px-5 py-2 text-sm font-bold text-white hover:bg-violet-500"
        >
          Continuar
        </button>
      </div>
    );
  }

  const page = pages[activeIdx];
  const dims = page ? getPageDimensions(page) : { width: 16, height: 9 };
  const stepsLen = page ? mergeStepsWithPage(page).length : 0;

  return (
    <div
      className="relative flex min-h-screen w-full flex-col bg-black"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div
        className="flex min-h-0 flex-1 cursor-pointer items-center justify-center p-0"
        onClick={() => playAdvanceRight()}
        title="Clic o desliza para avanzar · flechas: pasos y slides"
      >
        <div
          className="relative w-full max-w-[min(96vw,calc(85vh*16/9))] overflow-hidden bg-black"
          style={{
            aspectRatio: `${Math.max(1, dims.width)} / ${Math.max(1, dims.height)}`,
          }}
        >
          <PresenterSlideStage
            pages={pages}
            activeIdx={activeIdx}
            pendingAnim={pendingAnim}
            onAnimationEnd={onAnimationEnd}
            playReveal={playRevealComputed}
            animateEnterTargetKey={animateEnterTargetKey}
            showPresentationBounds={false}
            presenterImageVideo={presenterImageVideo}
          />
        </div>
      </div>

      <footer
        className="flex h-[52px] shrink-0 items-center gap-3 border-t border-white/[0.08] bg-[#0a0a0c] px-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={playAdvanceLeft}
            disabled={!canGoPlayPrev}
            className="rounded-lg p-2 text-white transition-colors hover:bg-white/10 disabled:pointer-events-none disabled:opacity-35"
            aria-label="Slide anterior"
          >
            <ChevronLeft size={22} strokeWidth={2} aria-hidden />
          </button>
          <span className="min-w-[3.5rem] text-center text-[13px] font-medium tabular-nums text-white/90">
            {slideCountLabel}
          </span>
          <button
            type="button"
            onClick={playAdvanceRight}
            disabled={!canGoPlayNext}
            className="rounded-lg p-2 text-white transition-colors hover:bg-white/10 disabled:pointer-events-none disabled:opacity-35"
            aria-label="Slide siguiente"
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
              />
            );
          })}
        </div>

        {stepsLen > 0 ? (
          <span className="shrink-0 text-[10px] font-medium tabular-nums text-white/60">
            Paso {playRevealCount}/{stepsLen}
          </span>
        ) : null}
      </footer>
    </div>
  );
}
