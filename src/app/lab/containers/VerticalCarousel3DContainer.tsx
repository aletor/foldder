"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import gsap from "gsap";
import type { VerticalCarouselContainerProps } from "./types";
import "./vertical-carousel-3d.css";

const CAROUSEL_RADIUS = 278;
const MIN_DEPTH = 0.18;
const AUTOPLAY_DURATION = 0.95;
const MANUAL_STEP_DURATION = 0.42;

function exactRotationForIndex(index: number, nearRotation: number, total: number) {
  const step = 360 / total;
  const cycle = Math.round((nearRotation - index * step) / 360);
  return index * step + cycle * 360;
}

function shortestSteps(fromIndex: number, targetIndex: number, total: number) {
  const forward = (targetIndex - fromIndex + total) % total;
  if (forward === 0) return 0;
  if (forward > total / 2) return forward - total;
  return forward;
}

function layoutForAngle(angleDeg: number) {
  const angleRad = (angleDeg * Math.PI) / 180;
  const y = Math.sin(angleRad) * CAROUSEL_RADIUS;
  const z = Math.cos(angleRad) * CAROUSEL_RADIUS - CAROUSEL_RADIUS;
  const rotateX = -angleDeg;
  const depth = (z + CAROUSEL_RADIUS * 2) / (CAROUSEL_RADIUS * 2);
  const visible = depth > MIN_DEPTH;
  const scale = 0.56 + depth * 0.44;
  const opacity = visible ? 0.22 + depth * 0.78 : 0;

  return {
    y,
    z,
    rotateX,
    scale: visible ? scale : scale * 0.6,
    autoAlpha: visible ? opacity : 0,
  };
}

export function VerticalCarousel3DContainer({
  slides,
  intervalMs = 2000,
  defaultAutoplay = true,
}: VerticalCarouselContainerProps) {
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const slidesRef = useRef(slides);
  const drumRef = useRef({ rotation: 0 });
  const tweenRef = useRef<gsap.core.Tween | null>(null);
  const activeIndexRef = useRef(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [autoplay, setAutoplay] = useState(defaultAutoplay);
  const slidesSignature = slides.map((slide) => slide.id).join("|");

  slidesRef.current = slides;
  activeIndexRef.current = activeIndex;

  const indexAtRotation = useCallback((rotation: number, total: number) => {
    const step = 360 / total;
    return (Math.floor(rotation / step + 1e-6) % total + total) % total;
  }, []);

  const applyDrumRotation = useCallback((drumRotation: number) => {
    const list = slidesRef.current;
    const total = list.length;
    if (total === 0) return;

    const stepDeg = 360 / total;

    list.forEach((slide, index) => {
      const node = cardRefs.current.get(slide.id);
      if (!node) return;

      const angleDeg = index * stepDeg - drumRotation;
      const layout = layoutForAngle(angleDeg);

      gsap.set(node, {
        y: layout.y,
        z: layout.z,
        rotateX: layout.rotateX,
        scale: layout.scale,
        autoAlpha: layout.autoAlpha,
        transformOrigin: "50% 50%",
        force3D: true,
      });
    });
  }, []);

  const killTween = useCallback(() => {
    if (!tweenRef.current) return;
    tweenRef.current.kill();
    tweenRef.current = null;
    const total = slidesRef.current.length;
    if (total > 0) {
      const synced = indexAtRotation(drumRef.current.rotation, total);
      const snapped = exactRotationForIndex(synced, drumRef.current.rotation, total);
      drumRef.current.rotation = snapped;
      applyDrumRotation(snapped);
      activeIndexRef.current = synced;
      setActiveIndex(synced);
    }
  }, [applyDrumRotation, indexAtRotation]);

  const rotateDrumBySteps = useCallback(
    (steps: number, duration: number, targetIndex?: number) => {
      const total = slidesRef.current.length;
      if (total <= 1 || steps === 0) return;

      killTween();
      const stepDeg = 360 / total;
      const fromIndex = indexAtRotation(drumRef.current.rotation, total);
      const nextIndex =
        targetIndex ?? (((fromIndex + steps) % total) + total) % total;
      const target = drumRef.current.rotation + steps * stepDeg;

      tweenRef.current = gsap.to(drumRef.current, {
        rotation: target,
        duration,
        ease: "power2.inOut",
        overwrite: true,
        onUpdate: () => applyDrumRotation(drumRef.current.rotation),
        onComplete: () => {
          const snapped = exactRotationForIndex(nextIndex, drumRef.current.rotation, total);
          drumRef.current.rotation = snapped;
          applyDrumRotation(snapped);
          activeIndexRef.current = nextIndex;
          setActiveIndex(nextIndex);
          tweenRef.current = null;
        },
      });
    },
    [applyDrumRotation, indexAtRotation, killTween],
  );

  const advanceDrum = useCallback(() => {
    rotateDrumBySteps(1, AUTOPLAY_DURATION);
  }, [rotateDrumBySteps]);

  const goToIndex = useCallback(
    (targetIndex: number) => {
      const total = slidesRef.current.length;
      if (total <= 1) return;

      setAutoplay(false);

      const fromIndex = tweenRef.current
        ? indexAtRotation(drumRef.current.rotation, total)
        : activeIndexRef.current;
      const steps = shortestSteps(fromIndex, targetIndex, total);
      if (steps === 0) {
        const snapped = exactRotationForIndex(targetIndex, drumRef.current.rotation, total);
        drumRef.current.rotation = snapped;
        applyDrumRotation(snapped);
        activeIndexRef.current = targetIndex;
        setActiveIndex(targetIndex);
        return;
      }

      const duration = MANUAL_STEP_DURATION * Math.abs(steps);
      rotateDrumBySteps(steps, duration, targetIndex);
    },
    [applyDrumRotation, indexAtRotation, rotateDrumBySteps],
  );

  useEffect(() => {
    killTween();
    drumRef.current.rotation = 0;
    activeIndexRef.current = 0;
    setActiveIndex(0);
    requestAnimationFrame(() => applyDrumRotation(0));
  }, [slidesSignature, applyDrumRotation, killTween]);

  useEffect(() => {
    if (!autoplay || slides.length <= 1) return undefined;

    const timer = window.setInterval(advanceDrum, intervalMs);
    return () => window.clearInterval(timer);
  }, [autoplay, slides.length, intervalMs, advanceDrum]);

  useEffect(() => killTween, [killTween]);

  if (slides.length === 0) {
    return (
      <div className="vc3d vc3d--empty">
        <p className="vc3d-hint">Sin slides.</p>
      </div>
    );
  }

  return (
    <div className="vc3d">
      <div className="vc3d-controls">
        <div className="vc3d-items" role="tablist" aria-label="Ir a slide">
          {slides.map((slide, index) => (
            <button
              key={slide.id}
              type="button"
              role="tab"
              aria-selected={index === activeIndex}
              className={`vc3d-item-btn ${index === activeIndex ? "is-active" : ""}`}
              onClick={() => goToIndex(index)}
            >
              {slide.label}
            </button>
          ))}
        </div>
      </div>

      <div className="vc3d-viewport">
        <div className="vc3d-stage">
          {slides.map((slide, index) => (
            <div
              key={slide.id}
              ref={(node) => {
                if (node) cardRefs.current.set(slide.id, node);
                else cardRefs.current.delete(slide.id);
              }}
              className={`vc3d-card ${index === activeIndex ? "is-active" : ""}`}
            >
              <div className="vc3d-card-surface">{slide.content}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
