"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
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

const DESKTOP_ITEM_WIDTH = 360;
const AUTOPLAY_MS = 3500;
const ICON_SIZE_RATIO = 0.4;
const FLOAT_VARIANTS = ["a", "b", "c"] as const;

type CoverflowMetrics = {
  itemWidth: number;
  itemHeight: number;
  gap: number;
  step: number;
};

function getCoverflowMetrics(viewportWidth: number): CoverflowMetrics {
  const itemWidth =
    viewportWidth <= 0
      ? DESKTOP_ITEM_WIDTH
      : viewportWidth < 640
        ? Math.min(292, Math.max(232, Math.round(viewportWidth * 0.76)))
        : DESKTOP_ITEM_WIDTH;
  const itemHeight = Math.round((itemWidth * 3) / 4);
  const gap = viewportWidth > 0 && viewportWidth < 640 ? 8 : 10;

  return {
    itemWidth,
    itemHeight,
    gap,
    step: itemWidth + gap,
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
  reducedMotion,
  selectedIndex,
}: CoverflowItemProps) {
  const { itemWidth, itemHeight, step } = metrics;

  const offset = useTransform(scrollX, (x) => {
    if (viewportWidth <= 0) return 0;
    const pad = viewportWidth / 2 - itemWidth / 2;
    const itemCenter = pad + index * step + itemWidth / 2 + x;
    return itemCenter - viewportWidth / 2;
  });

  const rotateRange = viewportWidth < 640 ? 140 : 200;
  const rotateAmount = viewportWidth < 640 ? 14 : 20;
  const rotateY = useTransform(offset, [-rotateRange, 0, rotateRange], [rotateAmount, 0, -rotateAmount]);
  const scale = useTransform(offset, [-rotateRange, 0, rotateRange], [0.76, 1, 0.76]);
  const parallaxX = useTransform(offset, [-800, -200, 200, 800], ["100%", "0%", "0%", "-100%"]);
  const zIndex = useTransform(offset, (value) => Math.max(0, Math.round(1000 - Math.abs(value))));
  const blur = useTransform(offset, (value) => {
    if (reducedMotion) return 0;
    const distance = Math.abs(value);
    if (distance <= 28) return 0;
    return Math.min(1, ((distance - 28) / 210) * 1);
  });
  const filter = useTransform(blur, (amount) => `blur(${amount.toFixed(2)}px)`);

  return (
    <motion.li
      data-home-v2-coverflow-item
      data-selected={selectedIndex === index ? "true" : undefined}
      style={{ width: itemWidth, height: itemHeight, zIndex }}
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
          filter,
          transformPerspective: 500,
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
          />
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          data-home-v2-coverflow-item-overlay
          src={card.imageSrc}
          alt=""
          draggable={false}
          style={coverflowIconFloatStyle(index)}
        />
        <div data-home-v2-coverflow-item-copy>
          <p data-home-v2-coverflow-item-title>{card.label}</p>
          <p data-home-v2-coverflow-item-desc>{card.description}</p>
        </div>
      </motion.button>
    </motion.li>
  );
}

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
        animate(scrollX, target, { type: "spring", stiffness: 200, damping: 40 });
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
  const iconOverhangPx = Math.round(metrics.itemWidth * ICON_SIZE_RATIO * 0.5);
  const viewportStyle = {
    ["--home-v2-coverflow-icon-overhang" as string]: `${iconOverhangPx}px`,
    ["--home-v2-coverflow-card-w" as string]: `${metrics.itemWidth}px`,
    ["--home-v2-coverflow-card-h" as string]: `${metrics.itemHeight}px`,
  } satisfies CSSProperties;

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

  return (
    <div data-home-v2-coverflow-wrap>
      <div
        ref={viewportRef}
        data-home-v2-coverflow-viewport
        style={viewportStyle}
        onClickCapture={handleViewportClickCapture}
        onPointerEnter={() => {
          pauseAutoplayRef.current = true;
        }}
        onPointerLeave={() => {
          if (!autoplayLockedRef.current) pauseAutoplayRef.current = false;
        }}
      >
        <motion.ul
          data-home-v2-coverflow-track
          style={{ x: scrollX, paddingLeft, gap: metrics.gap }}
          drag="x"
          dragElastic={0.06}
          dragMomentum={false}
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
            <CoverflowItem
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
