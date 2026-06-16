import { useEffect } from "react";

const SCROLL_DURATION_MS = 820;
const WHEEL_THRESHOLD = 6;
const GESTURE_RESET_MS = 140;
const SWIPE_THRESHOLD_PX = 52;
const ROOT_SELECTOR = "[data-foldder-home-v2]";
const SECTION_SELECTOR = "[data-home-v2-module]";

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2;
}

function getSections(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLElement>(SECTION_SELECTOR));
}

function getSectionTop(section: HTMLElement) {
  return section.getBoundingClientRect().top + window.scrollY;
}

function getMaxScrollY() {
  return Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
}

function getSectionScrollOffset(section: HTMLElement) {
  const raw = section.getAttribute("data-home-v2-scroll-offset");
  if (!raw) return 0;
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : 0;
}

function getSectionScrollTarget(section: HTMLElement) {
  const viewportHeight = window.innerHeight;
  const align = section.getAttribute("data-home-v2-scroll-align");
  const anchor = section.querySelector<HTMLElement>("[data-home-v2-scroll-anchor]");

  if (align === "start") {
    const top = anchor ? getSectionTop(anchor) : getSectionTop(section);
    return Math.max(0, Math.min(top - getSectionScrollOffset(section), getMaxScrollY()));
  }

  if (align === "anchor" && anchor) {
    const anchorTop = getSectionTop(anchor);
    const centeredY = anchorTop + anchor.offsetHeight / 2 - viewportHeight / 2;
    return Math.max(0, Math.min(centeredY - getSectionScrollOffset(section), getMaxScrollY()));
  }

  const sectionTop = getSectionTop(section);
  const centeredY = sectionTop + section.offsetHeight / 2 - viewportHeight / 2;
  return Math.max(0, Math.min(centeredY - getSectionScrollOffset(section), getMaxScrollY()));
}

function getActiveSectionIndex(sections: HTMLElement[]) {
  const viewportCenter = window.scrollY + window.innerHeight / 2;

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const top = getSectionTop(section);
    const bottom = top + section.offsetHeight;
    if (viewportCenter >= top && viewportCenter < bottom) return i;
  }

  const viewportTop = window.scrollY;
  const viewportBottom = viewportTop + window.innerHeight;
  let bestIndex = 0;
  let bestVisible = 0;

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const top = getSectionTop(section);
    const bottom = top + section.offsetHeight;
    const visible = Math.max(0, Math.min(bottom, viewportBottom) - Math.max(top, viewportTop));

    if (visible > bestVisible) {
      bestVisible = visible;
      bestIndex = i;
    }
  }

  return bestIndex;
}

function shouldBypassSnap(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;

  return Boolean(
    target.closest("[data-home-v2-hero-photo-bg][data-expanded]") ||
      target.closest("textarea, input, select, [contenteditable='true']"),
  );
}

function isVerticalWheel(event: WheelEvent) {
  return Math.abs(event.deltaY) >= Math.abs(event.deltaX);
}

type ScrollState = {
  animating: boolean;
  gestureLocked: boolean;
  wheelAccum: number;
  wheelResetTimer: ReturnType<typeof setTimeout> | null;
  gestureUnlockTimer: ReturnType<typeof setTimeout> | null;
  rafId: number;
};

function cancelScrollAnimation(state: ScrollState) {
  if (state.rafId) cancelAnimationFrame(state.rafId);
  state.rafId = 0;
  state.animating = false;
}

function animateScrollTo(state: ScrollState, targetY: number, startY: number, reducedMotion: boolean) {
  cancelScrollAnimation(state);
  window.scrollTo(0, startY);

  if (reducedMotion) {
    window.scrollTo(0, targetY);
    return;
  }

  state.animating = true;
  const delta = targetY - startY;
  const startTime = performance.now();

  const frame = (now: number) => {
    const progress = Math.min(1, (now - startTime) / SCROLL_DURATION_MS);
    window.scrollTo(0, startY + delta * easeInOutCubic(progress));

    if (progress < 1) {
      state.rafId = requestAnimationFrame(frame);
      return;
    }

    state.rafId = 0;
    state.animating = false;
  };

  state.rafId = requestAnimationFrame(frame);
}

export function scrollHomeToSection(id: string) {
  const root = document.querySelector<HTMLElement>(ROOT_SELECTOR);
  const section = document.getElementById(id);
  if (!root || !section) return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const state: ScrollState = {
    animating: false,
    gestureLocked: false,
    wheelAccum: 0,
    wheelResetTimer: null,
    gestureUnlockTimer: null,
    rafId: 0,
  };

  animateScrollTo(state, getSectionScrollTarget(section), window.scrollY, reducedMotion);
}

export function useHomeSectionScroll() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(ROOT_SELECTOR);
    if (!root) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) return;

    const state: ScrollState = {
      animating: false,
      gestureLocked: false,
      wheelAccum: 0,
      wheelResetTimer: null,
      gestureUnlockTimer: null,
      rafId: 0,
    };

    const lockGesture = () => {
      state.gestureLocked = true;
      if (state.gestureUnlockTimer) clearTimeout(state.gestureUnlockTimer);
      state.gestureUnlockTimer = setTimeout(() => {
        state.gestureLocked = false;
        state.gestureUnlockTimer = null;
      }, SCROLL_DURATION_MS + 80);
    };

    const goToIndex = (index: number, startY: number) => {
      const sections = getSections(root);
      const section = sections[index];
      if (!section) return;

      lockGesture();
      animateScrollTo(state, getSectionScrollTarget(section), startY, false);
    };

    const onWheel = (event: WheelEvent) => {
      if (shouldBypassSnap(event.target) || event.ctrlKey || !isVerticalWheel(event)) return;

      const sections = getSections(root);
      if (sections.length < 2) return;

      if (state.animating || state.gestureLocked) {
        event.preventDefault();
        window.scrollTo(0, window.scrollY);
        return;
      }

      const current = getActiveSectionIndex(sections);
      const direction = event.deltaY > 0 ? 1 : -1;
      const next = current + direction;
      const atEdge =
        (direction < 0 && current === 0) || (direction > 0 && current === sections.length - 1);

      if (atEdge) return;

      event.preventDefault();

      state.wheelAccum += event.deltaY;
      if (state.wheelResetTimer) clearTimeout(state.wheelResetTimer);
      state.wheelResetTimer = setTimeout(() => {
        state.wheelAccum = 0;
        state.wheelResetTimer = null;
      }, GESTURE_RESET_MS);

      if (Math.abs(state.wheelAccum) < WHEEL_THRESHOLD) return;

      const lockedY = window.scrollY;
      state.wheelAccum = 0;
      if (state.wheelResetTimer) {
        clearTimeout(state.wheelResetTimer);
        state.wheelResetTimer = null;
      }

      goToIndex(next, lockedY);
    };

    let touchStartY = 0;

    const onTouchStart = (event: TouchEvent) => {
      touchStartY = event.touches[0]?.clientY ?? 0;
    };

    const onTouchMove = (event: TouchEvent) => {
      if (state.animating || state.gestureLocked) event.preventDefault();
    };

    const onTouchEnd = (event: TouchEvent) => {
      if (animatingOrLocked(state) || shouldBypassSnap(event.target)) return;

      const endY = event.changedTouches[0]?.clientY ?? touchStartY;
      const delta = touchStartY - endY;
      if (Math.abs(delta) < SWIPE_THRESHOLD_PX) return;

      const sections = getSections(root);
      if (sections.length < 2) return;

      const direction = delta > 0 ? 1 : -1;
      const current = getActiveSectionIndex(sections);
      const next = current + direction;

      if (next < 0 || next >= sections.length) return;

      goToIndex(next, window.scrollY);
    };

    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      if (state.wheelResetTimer) clearTimeout(state.wheelResetTimer);
      if (state.gestureUnlockTimer) clearTimeout(state.gestureUnlockTimer);
      cancelScrollAnimation(state);
      state.gestureLocked = false;
    };
  }, []);
}

function animatingOrLocked(state: ScrollState) {
  return state.animating || state.gestureLocked;
}
