"use client";

import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type MotionValue,
} from "motion/react";
import { buildHomeV2NodeCards, type HomeV2NodeCard } from "./home-v2-nodes";

const DESKTOP_ITEM_WIDTH = 504;
const DESKTOP_ITEM_HEIGHT = 284;
const MOBILE_ITEM_WIDTH = 368;
const MOBILE_ITEM_HEIGHT = 208;
const OVERLAY_SIZE_RATIO = 0.2;
const AUTOPLAY_MS = 3500;
const FLOAT_VARIANTS = ["a", "b", "c"] as const;
/** Center-to-center distance as a fraction of card width — lower = tighter stack, ~5 visible on desktop */
const COVERFLOW_STEP_RATIO = 0.33;

function getCoverflowMotionRanges(itemWidth: number, isMobile: boolean) {
  return {
    rotateAmount: isMobile ? 16 : 20,
    parallaxShift: Math.round(itemWidth * 0.025),
  };
}

type CoverflowMetrics = {
  itemWidth: number;
  itemHeight: number;
  gap: number;
  step: number;
};

function getCoverflowMetrics(viewportWidth: number): CoverflowMetrics {
  if (viewportWidth > 0 && viewportWidth < 640) {
    const itemWidth = MOBILE_ITEM_WIDTH;
    const step = Math.round(itemWidth * COVERFLOW_STEP_RATIO);
    return {
      itemWidth,
      itemHeight: MOBILE_ITEM_HEIGHT,
      gap: step - itemWidth,
      step,
    };
  }

  const itemWidth = DESKTOP_ITEM_WIDTH;
  const step = Math.round(itemWidth * COVERFLOW_STEP_RATIO);
  return {
    itemWidth,
    itemHeight: DESKTOP_ITEM_HEIGHT,
    gap: step - itemWidth,
    step,
  };
}

function pickCoverflowIndex(clientX: number, clientY: number): number | null {
  const hits = document.elementsFromPoint(clientX, clientY);
  let bestIndex: number | null = null;
  let bestZ = -Infinity;

  for (const el of hits) {
    if (!(el instanceof Element)) continue;
    const button = el.closest("[data-home-v2-coverflow-item-inner]");
    if (!button) continue;
    const raw = button.getAttribute("data-coverflow-index");
    if (raw === null) continue;
    const index = Number(raw);
    if (!Number.isFinite(index)) continue;

    const item = button.closest("[data-home-v2-coverflow-item]");
    const z = item ? Number(getComputedStyle(item).zIndex) || 0 : 0;
    if (z >= bestZ) {
      bestZ = z;
      bestIndex = index;
    }
  }

  return bestIndex;
}

function coverflowIconFloatStyle(index: number): CSSProperties {
  const shift = `${(2.5 + (index % 7) * 0.38).toFixed(2)}px`;
  const duration = `${(6.2 + (index % 6) * 0.75).toFixed(2)}s`;
  const delay = `${(-(index * 0.61) % 5.5).toFixed(2)}s`;
  const variant = FLOAT_VARIANTS[index % FLOAT_VARIANTS.length]!;

  return {
    ["--home-v2-icon-float-shift" as string]: shift,
    animationDuration: duration,
    animationDelay: delay,
    animationName: `home-v2-coverflow-icon-float-${variant}`,
  };
}

type NodeCoverflowCarouselProps = {
  onActiveIndexChange?: (index: number) => void;
};

export type NodeCoverflowCarouselHandle = {
  goNext: () => void;
  goPrev: () => void;
  goToIndex: (index: number) => void;
};

type CoverflowItemProps = {
  card: HomeV2NodeCard;
  index: number;
  scrollX: MotionValue<number>;
  viewportWidth: number;
  metrics: CoverflowMetrics;
  reducedMotion: boolean | null;
  selectedIndex: number;
};

function CoverflowItem({
  card,
  index,
  scrollX,
  viewportWidth,
  metrics,
  selectedIndex,
}: CoverflowItemProps) {
  const { itemWidth, itemHeight, step } = metrics;
  const overlaySize = Math.round(itemWidth * OVERLAY_SIZE_RATIO);
  const isMobile = viewportWidth > 0 && viewportWidth < 640;
  const { rotateAmount, parallaxShift } = getCoverflowMotionRanges(itemWidth, isMobile);
  const itemOverlap = step - itemWidth;

  const offset = useTransform(scrollX, (x) => {
    if (viewportWidth <= 0) return 0;
    const pad = viewportWidth / 2 - itemWidth / 2;
    const itemCenter = pad + index * step + itemWidth / 2 + x;
    return itemCenter - viewportWidth / 2;
  });

  const oneStep = step;
  const twoSteps = step * 2;
  const halfStep = step * 0.45;

  const rotateY = useTransform(
    offset,
    [-twoSteps, -oneStep, 0, oneStep, twoSteps],
    [rotateAmount, rotateAmount * 0.55, 0, -rotateAmount * 0.55, -rotateAmount],
  );
  const scale = useTransform(
    offset,
    [-twoSteps, -oneStep, 0, oneStep, twoSteps],
    [0.72, 0.86, 1, 0.86, 0.72],
  );
  const translateZ = useTransform(
    offset,
    [-twoSteps, -oneStep, 0, oneStep, twoSteps],
    [-220, -110, 0, -110, -220],
  );
  const parallaxX = useTransform(
    offset,
    [-oneStep, -halfStep, halfStep, oneStep],
    [-parallaxShift, 0, 0, parallaxShift],
  );
  const zIndex = useTransform(offset, (value) =>
    Math.max(0, Math.round(1000 - (Math.abs(value) / oneStep) * 120)),
  );

  return (
    <motion.li
      data-home-v2-coverflow-item
      data-selected={selectedIndex === index ? "true" : undefined}
      style={{ width: itemWidth, height: itemHeight, zIndex, marginRight: itemOverlap }}
    >
      <motion.button
        type="button"
        data-home-v2-coverflow-item-inner
        data-coverflow-index={index}
        aria-label={`Seleccionar ${card.label}`}
        aria-current={selectedIndex === index ? "true" : undefined}
        style={{
          x: parallaxX,
          rotateY,
          scale,
          z: translateZ,
          transformPerspective: 900,
        }}
        onPointerDown={(event) => {
          event.stopPropagation();
        }}
      >
        <div data-home-v2-coverflow-item-media>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            data-home-v2-coverflow-item-screenshot
            src={card.detailImageSrc}
            alt=""
            draggable={false}
            decoding="async"
            loading="lazy"
          />
        </div>
        <span
          data-home-v2-coverflow-item-overlay-slot
          style={{
            ...coverflowIconFloatStyle(index),
            width: overlaySize,
            height: overlaySize,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            data-home-v2-coverflow-item-overlay
            src={card.imageSrc}
            alt=""
            draggable={false}
            decoding="async"
            loading="lazy"
          />
        </span>
      </motion.button>
    </motion.li>
  );
}

const MemoCoverflowItem = memo(CoverflowItem);

export const NodeCoverflowCarousel = forwardRef<NodeCoverflowCarouselHandle, NodeCoverflowCarouselProps>(
  function NodeCoverflowCarousel({ onActiveIndexChange }, ref) {
  const cards = useMemo(() => buildHomeV2NodeCards(), []);
  const scrollX = useMotionValue(0);
  const viewportRef = useRef<HTMLDivElement>(null);
  const pauseAutoplayRef = useRef(false);
  const autoplayLockedRef = useRef(false);
  const trackDraggedRef = useRef(false);
  const activeIndexRef = useRef(0);
  const reducedMotion = useReducedMotion();
  const [viewportWidth, setViewportWidth] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const metrics = useMemo(() => getCoverflowMetrics(viewportWidth), [viewportWidth]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const updateWidth = () => setViewportWidth(viewport.clientWidth);
    updateWidth();

    const observer = new ResizeObserver(updateWidth);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (viewportWidth <= 0) return;
    scrollX.set(-activeIndexRef.current * metrics.step);
  }, [metrics.step, scrollX, viewportWidth]);

  const scrollToIndex = useCallback(
    (index: number) => {
      const normalized = ((index % cards.length) + cards.length) % cards.length;
      const target = -normalized * metrics.step;

      if (reducedMotion) {
        scrollX.set(target);
      } else {
        animate(scrollX, target, {
          type: "spring",
          stiffness: 320,
          damping: 36,
          mass: 0.85,
          restDelta: 0.5,
        });
      }

      activeIndexRef.current = normalized;
      setSelectedIndex(normalized);
      onActiveIndexChange?.(normalized);
    },
    [cards.length, metrics.step, onActiveIndexChange, reducedMotion, scrollX],
  );

  const selectCard = useCallback(
    (index: number) => {
      if (trackDraggedRef.current) return;
      autoplayLockedRef.current = true;
      pauseAutoplayRef.current = true;
      scrollToIndex(index);
    },
    [scrollToIndex],
  );

  const lockAutoplay = useCallback(() => {
    autoplayLockedRef.current = true;
    pauseAutoplayRef.current = true;
  }, []);

  const goToIndex = useCallback(
    (index: number) => {
      lockAutoplay();
      scrollToIndex(index);
    },
    [lockAutoplay, scrollToIndex],
  );

  const goNext = useCallback(() => {
    goToIndex(activeIndexRef.current + 1);
  }, [goToIndex]);

  const goPrev = useCallback(() => {
    goToIndex(activeIndexRef.current - 1);
  }, [goToIndex]);

  useImperativeHandle(ref, () => ({ goNext, goPrev, goToIndex }), [goNext, goPrev, goToIndex]);

  useEffect(() => {
    if (reducedMotion) return;

    const timer = window.setInterval(() => {
      if (pauseAutoplayRef.current || autoplayLockedRef.current) return;
      scrollToIndex((activeIndexRef.current + 1) % cards.length);
    }, AUTOPLAY_MS);

    return () => window.clearInterval(timer);
  }, [cards.length, reducedMotion, scrollToIndex]);

  const paddingLeft = viewportWidth > 0 ? viewportWidth / 2 - metrics.itemWidth / 2 : 0;

  const handleViewportClickCapture = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (trackDraggedRef.current) return;
      const index = pickCoverflowIndex(event.clientX, event.clientY);
      if (index === null) return;
      event.preventDefault();
      event.stopPropagation();
      selectCard(index);
    },
    [selectCard],
  );

  const handleViewportKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (
        event.key !== "ArrowLeft" &&
        event.key !== "ArrowRight" &&
        event.key !== "Left" &&
        event.key !== "Right"
      ) {
        return;
      }

      event.preventDefault();
      if (event.key === "ArrowRight" || event.key === "Right") goNext();
      else goPrev();
    },
    [goNext, goPrev],
  );

  return (
    <div data-home-v2-coverflow-wrap>
      <div
        ref={viewportRef}
        data-home-v2-coverflow-viewport
        role="group"
        aria-roledescription="carousel"
        aria-label="Galería de nodos"
        tabIndex={0}
        onKeyDown={handleViewportKeyDown}
        onClickCapture={handleViewportClickCapture}
        onPointerEnter={() => {
          pauseAutoplayRef.current = true;
          viewportRef.current?.focus({ preventScroll: true });
        }}
        onPointerLeave={() => {
          if (!autoplayLockedRef.current) pauseAutoplayRef.current = false;
        }}
      >
        <motion.ul
          data-home-v2-coverflow-track
          style={{ x: scrollX, paddingLeft }}
          drag="x"
          dragElastic={0.04}
          dragMomentum={false}
          dragTransition={{ power: 0.2, timeConstant: 200 }}
          onDragStart={() => {
            trackDraggedRef.current = false;
            pauseAutoplayRef.current = true;
          }}
          onDrag={(_, info) => {
            if (Math.abs(info.offset.x) > 6) trackDraggedRef.current = true;
          }}
          onDragEnd={() => {
            const nearest = Math.round(-scrollX.get() / metrics.step);
            scrollToIndex(nearest);
            if (!autoplayLockedRef.current) pauseAutoplayRef.current = false;
            window.setTimeout(() => {
              trackDraggedRef.current = false;
            }, 0);
          }}
        >
          {cards.map((card, index) => (
            <MemoCoverflowItem
              key={card.type}
              card={card}
              index={index}
              scrollX={scrollX}
              viewportWidth={viewportWidth}
              metrics={metrics}
              reducedMotion={reducedMotion}
              selectedIndex={selectedIndex}
            />
          ))}
        </motion.ul>
      </div>
    </div>
  );
  },
);
