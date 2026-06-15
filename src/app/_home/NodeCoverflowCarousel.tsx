"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type MotionValue,
} from "motion/react";
import { buildHomeV2NodeCards, type HomeV2NodeCard } from "./home-v2-nodes";

const ITEM_WIDTH = 360;
const ITEM_HEIGHT = Math.round((ITEM_WIDTH * 3) / 4);
const GAP = 10;
const STEP = ITEM_WIDTH + GAP;
const AUTOPLAY_MS = 3500;

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
  reducedMotion: boolean | null;
  selectedIndex: number;
  onSelect: (index: number) => void;
};

function CoverflowItem({
  card,
  index,
  scrollX,
  viewportWidth,
  reducedMotion,
  selectedIndex,
  onSelect,
}: CoverflowItemProps) {
  const offset = useTransform(scrollX, (x) => {
    if (viewportWidth <= 0) return 0;
    const pad = viewportWidth / 2 - ITEM_WIDTH / 2;
    const itemCenter = pad + index * STEP + ITEM_WIDTH / 2 + x;
    return itemCenter - viewportWidth / 2;
  });

  const rotateY = useTransform(offset, [-200, 0, 200], [20, 0, -20]);
  const scale = useTransform(offset, [-200, 0, 200], [0.7, 1, 0.7]);
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
      style={{ width: ITEM_WIDTH, height: ITEM_HEIGHT, zIndex }}
    >
      <motion.button
        type="button"
        data-home-v2-coverflow-item-inner
        aria-label={`Seleccionar ${card.label}`}
        aria-current={selectedIndex === index ? "true" : undefined}
        style={{
          x: parallaxX,
          rotateY,
          scale,
          filter,
          transformPerspective: 500,
        }}
        onClick={(event) => {
          event.stopPropagation();
          onSelect(index);
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={card.imageSrc} alt="" draggable={false} />
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

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const updateWidth = () => setViewportWidth(viewport.clientWidth);
    updateWidth();

    const observer = new ResizeObserver(updateWidth);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  const scrollToIndex = useCallback(
    (index: number) => {
      const normalized = ((index % cards.length) + cards.length) % cards.length;
      const target = -normalized * STEP;

      if (reducedMotion) {
        scrollX.set(target);
      } else {
        animate(scrollX, target, { type: "spring", stiffness: 200, damping: 40 });
      }

      activeIndexRef.current = normalized;
      setSelectedIndex(normalized);
      onActiveIndexChange?.(normalized);
    },
    [cards.length, onActiveIndexChange, reducedMotion, scrollX],
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

  const paddingLeft = viewportWidth > 0 ? viewportWidth / 2 - ITEM_WIDTH / 2 : 0;

  return (
    <div data-home-v2-coverflow-wrap>
      <div
        ref={viewportRef}
        data-home-v2-coverflow-viewport
        onPointerEnter={() => {
          pauseAutoplayRef.current = true;
        }}
        onPointerLeave={() => {
          if (!autoplayLockedRef.current) pauseAutoplayRef.current = false;
        }}
      >
        <motion.ul
          data-home-v2-coverflow-track
          style={{ x: scrollX, paddingLeft, gap: GAP }}
          drag="x"
          dragElastic={0.06}
          dragMomentum={false}
          onDragStart={() => {
            trackDraggedRef.current = true;
            pauseAutoplayRef.current = true;
          }}
          onDragEnd={() => {
            const nearest = Math.round(-scrollX.get() / STEP);
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
              reducedMotion={reducedMotion}
              selectedIndex={selectedIndex}
              onSelect={selectCard}
            />
          ))}
        </motion.ul>
      </div>
    </div>
  );
  },
);
