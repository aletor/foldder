"use client";

import { useEffect, useMemo, useRef } from "react";
import gsap from "gsap";
import { buildHomeV2NodeCards } from "./home-v2-nodes";

type LetterImageSwapHeadlineProps = {
  text: string;
};

type LetterSlot = {
  el: HTMLSpanElement;
  charEl: HTMLSpanElement;
  mediaEl: HTMLSpanElement;
  interactive: boolean;
};

const SPREAD_FACTOR = 0.42;
const IMAGE_EM = 2.65;

function isInteractiveChar(char: string): boolean {
  return /\p{L}|\p{N}/u.test(char);
}

export function LetterImageSwapHeadline({ text }: LetterImageSwapHeadlineProps) {
  const rootRef = useRef<HTMLSpanElement>(null);
  const mediasRef = useRef<HTMLDivElement>(null);

  const imageSources = useMemo(
    () => [...new Set(buildHomeV2NodeCards().map((card) => card.imageSrc))],
    [],
  );

  const characters = useMemo(() => [...text], [text]);

  useEffect(() => {
    const root = rootRef.current;
    const mediasRoot = mediasRef.current;
    if (!root || !mediasRoot) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) return;

    const slots: LetterSlot[] = [];
    root.querySelectorAll<HTMLSpanElement>("[data-home-v2-letter-swap-char]").forEach((el) => {
      const charEl = el.querySelector<HTMLSpanElement>("[data-home-v2-letter-swap-char-text]");
      const mediaEl = el.querySelector<HTMLSpanElement>("[data-home-v2-letter-swap-media]");
      if (!charEl || !mediaEl) return;

      slots.push({
        el,
        charEl,
        mediaEl,
        interactive: el.dataset.interactive === "true",
      });
    });

    if (!slots.some((slot) => slot.interactive)) return;

    const mediaImages = [...mediasRoot.querySelectorAll<HTMLImageElement>("img")];
    let activeIndex = -1;
    let leaveTimer: gsap.core.Tween | null = null;

    const killLeaveTimer = () => {
      leaveTimer?.kill();
      leaveTimer = null;
    };

    const resetAll = () => {
      activeIndex = -1;
      slots.forEach((slot) => {
        gsap.killTweensOf([slot.el, slot.charEl, slot.mediaEl]);
        gsap.to(slot.el, { x: 0, duration: 0.72, ease: "elastic.out(1, 0.62)" });
        gsap.to(slot.charEl, { autoAlpha: 1, duration: 0.2, ease: "power2.out" });
        gsap.to(slot.mediaEl, {
          autoAlpha: 0,
          scale: 0.82,
          duration: 0.28,
          ease: "power2.inOut",
        });
      });
    };

    const activate = (index: number) => {
      killLeaveTimer();
      if (activeIndex === index) return;

      const slot = slots[index];
      if (!slot?.interactive) return;

      activeIndex = index;

      const letterWidth = slot.el.offsetWidth || 16;
      const spreadPx = letterWidth * SPREAD_FACTOR;
      const gapPx = letterWidth * IMAGE_EM * 0.34;

      slots.forEach((entry, j) => {
        gsap.killTweensOf([entry.el, entry.charEl, entry.mediaEl]);

        if (j === index) {
          gsap.to(entry.charEl, { autoAlpha: 0, duration: 0.16, ease: "power2.out" });
          gsap.fromTo(
            entry.mediaEl,
            { autoAlpha: 0, scale: 0.72 },
            { autoAlpha: 1, scale: 1, duration: 0.38, ease: "back.out(1.6)" },
          );
          gsap.to(entry.el, { x: 0, duration: 0.42, ease: "power3.out" });
          return;
        }

        const dist = j - index;
        const direction = Math.sign(dist) || 1;
        const proximityBoost = Math.abs(dist) <= 2 ? direction * gapPx : 0;
        const x = dist * spreadPx + proximityBoost;

        gsap.to(entry.el, { x, duration: 0.46, ease: "power3.out" });
        gsap.to(entry.charEl, { autoAlpha: 1, duration: 0.16 });
        gsap.to(entry.mediaEl, { autoAlpha: 0, scale: 0.82, duration: 0.2 });
      });

      const image = mediaImages[index % mediaImages.length];
      const targetImg = slot.mediaEl.querySelector<HTMLImageElement>("img");
      if (image && targetImg) {
        targetImg.src = image.currentSrc || image.src;
      }
    };

    const scheduleReset = () => {
      killLeaveTimer();
      leaveTimer = gsap.delayedCall(0.05, resetAll);
    };

    const onPointerEnter = (index: number) => () => activate(index);
    const onPointerLeave = () => scheduleReset();

    const cleanups: Array<() => void> = [];

    slots.forEach((slot, index) => {
      if (!slot.interactive) return;

      const enter = onPointerEnter(index);
      slot.el.addEventListener("pointerenter", enter);
      slot.el.addEventListener("pointerleave", onPointerLeave);
      cleanups.push(() => {
        slot.el.removeEventListener("pointerenter", enter);
        slot.el.removeEventListener("pointerleave", onPointerLeave);
      });
    });

    const onRootLeave = () => scheduleReset();
    root.addEventListener("pointerleave", onRootLeave);
    cleanups.push(() => root.removeEventListener("pointerleave", onRootLeave));

    const coarsePointer = window.matchMedia("(hover: none), (pointer: coarse)").matches;
    if (coarsePointer) {
      const onTap = (event: PointerEvent) => {
        const target = (event.target as HTMLElement | null)?.closest<HTMLSpanElement>(
          "[data-home-v2-letter-swap-char][data-interactive='true']",
        );
        if (!target) {
          resetAll();
          return;
        }

        const index = slots.findIndex((slot) => slot.el === target);
        if (index >= 0) activate(index);
      };

      root.addEventListener("pointerdown", onTap);
      cleanups.push(() => root.removeEventListener("pointerdown", onTap));
    }

    slots.forEach((slot) => {
      gsap.set(slot.mediaEl, { autoAlpha: 0, scale: 0.82, transformOrigin: "50% 50%" });
      gsap.set(slot.charEl, { autoAlpha: 1 });
      gsap.set(slot.el, { x: 0 });
    });

    return () => {
      killLeaveTimer();
      cleanups.forEach((cleanup) => cleanup());
      slots.forEach((slot) => gsap.killTweensOf([slot.el, slot.charEl, slot.mediaEl]));
    };
  }, [characters, imageSources]);

  return (
    <span ref={rootRef} data-home-v2-letter-swap>
      <span data-home-v2-letter-swap-word>
        {characters.map((char, index) => {
          const interactive = isInteractiveChar(char);
          const imageSrc = imageSources[index % imageSources.length] ?? imageSources[0];

          return (
            <span
              key={`${char}-${index}`}
              data-home-v2-letter-swap-char
              data-interactive={interactive ? "true" : "false"}
              aria-hidden={char === " " ? true : undefined}
            >
              <span data-home-v2-letter-swap-char-text>{char === " " ? "\u00a0" : char}</span>
              {interactive ? (
                <span data-home-v2-letter-swap-media aria-hidden="true">
                  {imageSrc ? <img src={imageSrc} alt="" decoding="async" draggable={false} /> : null}
                </span>
              ) : null}
            </span>
          );
        })}
      </span>
      <div ref={mediasRef} data-home-v2-letter-swap-preload aria-hidden="true">
        {imageSources.map((src) => (
          <img key={src} src={src} alt="" decoding="async" draggable={false} />
        ))}
      </div>
    </span>
  );
}
