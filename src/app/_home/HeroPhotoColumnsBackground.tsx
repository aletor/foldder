"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { readHomeV2DeviceProfile } from "./home-v2-device";
import { buildHomeV2NodeCards, type HomeV2NodeCard } from "./home-v2-nodes";

const BOX_WIDTH = 480;
const BOX_HEIGHT = 640;
const SCENE_WIDTH = 1440;
const SCENE_HEIGHT = 880;
const BOX_RADIUS = 20;

const COLUMN_CONFIG = [
  { x: 72, yFrom: -575, yTo: 800, duration: 40 },
  { x: 336, yFrom: 800, yTo: -575, duration: 35 },
  { x: 600, yFrom: 800, yTo: -575, duration: 26 },
] as const;

const BOX_COUNT = 12;
const BASE_SCALE = 0.5;
const HOVER_SCALE = 0.62;
const DIM_OPACITY = 0.33;

type PhotoCard = {
  scrollEl: HTMLDivElement;
  box: HTMLDivElement;
  videoEl: HTMLVideoElement | null;
  columnIndex: number;
  boxIndex: number;
  scrollTl?: gsap.core.Timeline;
};

function playHeroVideo(video: HTMLVideoElement | null) {
  if (!video) return;
  void video.play().catch(() => {
    /* autoplay puede bloquearse hasta interacción */
  });
}

function createHeroVideo(card: HomeV2NodeCard, autoplay: boolean): HTMLVideoElement | null {
  if (!card.heroVideoSrc) return null;

  const { perfMode } = readHomeV2DeviceProfile();
  const video = document.createElement("video");
  video.dataset.homeV2HeroPhotoVideo = "true";
  video.src = card.heroVideoSrc;
  video.poster = card.imageSrc;
  video.muted = true;
  video.loop = true;
  video.autoplay = autoplay;
  video.playsInline = true;
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");
  video.preload = perfMode ? "metadata" : "auto";
  return video;
}

function createScrollTimeline(card: PhotoCard, progress: number) {
  card.scrollTl?.kill();
  const col = COLUMN_CONFIG[card.columnIndex];
  const tl = gsap
    .timeline({ repeat: -1 })
    .fromTo(
      card.scrollEl,
      { y: col.yFrom, rotation: -0.05 },
      { duration: col.duration, y: col.yTo, rotation: 0.05, ease: "none" },
    );
  tl.progress(progress);
  card.scrollTl = tl;
  return tl;
}

function createPhotoCard(
  card: HomeV2NodeCard,
  columnIndex: number,
  withHeroVideo = false,
  autoplayVideo = true,
): PhotoCard {
  const scrollEl = document.createElement("div");
  scrollEl.dataset.homeV2HeroPhotoScroll = "true";

  const box = document.createElement("div");
  box.dataset.homeV2HeroPhotoBox = "true";

  const videoEl = withHeroVideo ? createHeroVideo(card, autoplayVideo) : null;
  if (videoEl) {
    box.dataset.hasVideo = "true";
    box.setAttribute("role", "button");
    box.setAttribute("aria-label", card.label);
  } else {
    box.setAttribute("aria-hidden", "true");
  }
  if (videoEl) box.appendChild(videoEl);
  scrollEl.appendChild(box);

  gsap.set(box, {
    width: "100%",
    height: "100%",
    backgroundImage: videoEl ? "none" : `url(${card.imageSrc})`,
    backgroundColor: videoEl ? "#09090b" : "transparent",
    backgroundSize: "cover",
    backgroundPosition: "center",
    borderRadius: BOX_RADIUS,
    overflow: "hidden",
    scale: BASE_SCALE,
    transformOrigin: "50% 50%",
  });

  if (autoplayVideo) playHeroVideo(videoEl);

  return { scrollEl, box, videoEl, columnIndex, boxIndex: 0 };
}

function syncHeroVideos(cards: PhotoCard[], heroVisible: boolean, currentCard: PhotoCard | null, perfMode: boolean) {
  cards.forEach((card) => {
    if (!card.videoEl) return;

    if (!heroVisible) {
      card.videoEl.pause();
      return;
    }

    if (perfMode) {
      if (currentCard === card) playHeroVideo(card.videoEl);
      else card.videoEl.pause();
      return;
    }

    playHeroVideo(card.videoEl);
  });
}

function pickCardAt(clientX: number, clientY: number, cards: PhotoCard[]): PhotoCard | null {
  for (const el of document.elementsFromPoint(clientX, clientY)) {
    if (!(el instanceof Element)) continue;
    const match = el.closest("[data-home-v2-hero-photo-box]");
    if (!match) continue;
    const card = cards.find((c) => c.box === match || c.scrollEl.contains(match));
    if (card?.videoEl) return card;
  }
  return null;
}

export function HeroPhotoColumnsBackground() {
  const rootRef = useRef<HTMLDivElement>(null);
  const boxesRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const boxesEl = boxesRef.current;
    const closeBtn = closeRef.current;
    if (!root || !boxesEl || !closeBtn) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const { isTouch, perfMode } = readHomeV2DeviceProfile();
    const staticHero = reducedMotion || perfMode;
    const nodeCards = buildHomeV2NodeCards();

    const cards: PhotoCard[] = [];
    const savedCardState = new WeakMap<
      PhotoCard,
      { x: number; y: number; rotation: number; tlProgress: number }
    >();
    let currentCard: PhotoCard | null = null;
    let zooming = false;
    let hoveredCard: PhotoCard | null = null;
    let leaveTimer: gsap.core.Tween | null = null;

    gsap.set(root, { perspective: perfMode ? 0 : 800 });
    gsap.set(boxesEl, {
      position: "absolute",
      top: "50%",
      left: "75%",
      xPercent: -50,
      yPercent: -50,
      width: SCENE_WIDTH,
      height: SCENE_HEIGHT,
      rotationX: perfMode ? 0 : 14,
      rotationY: perfMode ? 0 : -15,
      rotationZ: perfMode ? 0 : 10,
      transformStyle: perfMode ? "flat" : "preserve-3d",
    });

    gsap.set(closeBtn, { autoAlpha: 0, pointerEvents: "none" });

    const playAllColumns = () => {
      cards.forEach((card) => {
        if (!card.scrollTl) return;
        card.scrollTl.play();
        gsap.to(card.scrollTl, { timeScale: 1, duration: 0.4, ease: "sine.in", overwrite: true });
      });
    };

    const pauseAllColumns = () => {
      cards.forEach((card) => card.scrollTl?.pause());
    };

    const resumeCardScroll = (card: PhotoCard) => {
      const saved = savedCardState.get(card);
      if (!saved) return;

      gsap.killTweensOf(card.scrollEl);
      gsap.set(card.scrollEl, {
        x: COLUMN_CONFIG[card.columnIndex].x,
        width: BOX_WIDTH,
        height: BOX_HEIGHT,
        clearProps: "zIndex",
      });

      if (staticHero) {
        const col = COLUMN_CONFIG[card.columnIndex];
        gsap.set(card.scrollEl, { y: (col.yFrom + col.yTo) / 2, rotation: 0 });
        return;
      }

      createScrollTimeline(card, saved.tlProgress);
      card.scrollTl!.play();
      gsap.set(card.scrollTl!, { timeScale: 1 });
    };

    const resetHoverState = () => {
      hoveredCard = null;
      cards.forEach((card) => {
        gsap.to(card.box, { scale: BASE_SCALE, duration: 0.3, overwrite: "auto" });
        gsap.to(card.scrollEl, { opacity: 1, duration: 0.3, overwrite: "auto" });
        gsap.set(card.scrollEl, { zIndex: 1 });
      });
    };

    const applyHover = (card: PhotoCard) => {
      if (zooming || currentCard || isTouch) return;
      if (leaveTimer) {
        leaveTimer.kill();
        leaveTimer = null;
      }
      if (hoveredCard === card) return;

      hoveredCard = card;

      cards.forEach((other) => {
        const active = other === card;
        gsap.to(other.box, {
          scale: active ? HOVER_SCALE : BASE_SCALE,
          duration: 0.25,
          overwrite: "auto",
          ease: "power2.out",
        });
        gsap.to(other.scrollEl, {
          opacity: active ? 1 : DIM_OPACITY,
          duration: 0.25,
          overwrite: "auto",
        });
        gsap.set(other.scrollEl, { zIndex: active ? 30 : 1 });
      });
    };

    const scheduleHoverReset = () => {
      if (zooming || currentCard || isTouch) return;
      if (leaveTimer) leaveTimer.kill();
      leaveTimer = gsap.delayedCall(0.08, () => {
        leaveTimer = null;
        if (currentCard || zooming) return;
        hoveredCard = null;
        resetHoverState();
      });
    };

    const hideCloseButton = () => {
      gsap.to(closeBtn, {
        autoAlpha: 0,
        duration: 0.2,
        onComplete: () => {
          closeBtn.hidden = true;
          closeBtn.style.pointerEvents = "none";
        },
      });
    };

    const showCloseButton = () => {
      closeBtn.hidden = false;
      if (isTouch) gsap.set(closeBtn, { clearProps: "x,y" });
      gsap.to(closeBtn, { autoAlpha: 1, duration: 0.25 });
      closeBtn.style.pointerEvents = "auto";
    };

    const fitSceneScale = () =>
      Math.max(0.35, Math.min(root.clientWidth / SCENE_WIDTH, root.clientHeight / SCENE_HEIGHT, 1.15));

    const getExpandedMetrics = () => {
      const sceneScale = currentCard ? 1 : fitSceneScale();
      const targetW = root.clientWidth / sceneScale;
      const targetH = root.clientHeight / sceneScale;
      return {
        targetW,
        targetH,
        targetX: SCENE_WIDTH / 2 - targetW / 2,
        targetY: SCENE_HEIGHT / 2 - targetH / 2,
      };
    };

    const collapseExpanded = () => {
      if (!currentCard || zooming) return;
      zooming = true;
      const card = currentCard;
      const saved = savedCardState.get(card);

      hideCloseButton();
      root.removeAttribute("data-expanded");

      const duration = reducedMotion ? 0.01 : 0.55;
      const sceneScale = fitSceneScale();

      gsap.to(card.scrollEl, {
        duration,
        width: BOX_WIDTH,
        height: BOX_HEIGHT,
        x: saved?.x ?? COLUMN_CONFIG[card.columnIndex].x,
        y: saved?.y ?? 0,
        rotation: saved?.rotation ?? 0,
        ease: "power3.inOut",
        overwrite: "auto",
        onComplete: () => {
          gsap.set(card.box, { borderRadius: BOX_RADIUS, scale: BASE_SCALE });
          card.scrollEl.removeAttribute("data-expanded");
          card.box.removeAttribute("data-expanded");
          currentCard = null;
          zooming = false;
          resumeCardScroll(card);
          playAllColumns();
          syncHeroVideos(cards, heroVisible, currentCard, perfMode);
        },
      });

      gsap.to(card.box, {
        duration,
        borderRadius: BOX_RADIUS,
        scale: BASE_SCALE,
        ease: "power3.inOut",
        overwrite: "auto",
      });

      gsap.to(boxesEl, {
        duration,
        rotationX: perfMode ? 0 : 14,
        rotationY: perfMode ? 0 : -15,
        rotationZ: perfMode ? 0 : 10,
        scale: sceneScale,
        ease: "power3.inOut",
        overwrite: "auto",
      });

      cards.forEach((other) => {
        gsap.to(other.scrollEl, { opacity: 1, duration: duration * 0.4, overwrite: "auto" });
      });
    };

    const expandCard = (card: PhotoCard) => {
      if (zooming || !card.videoEl) return;
      zooming = true;
      currentCard = card;
      hoveredCard = null;
      if (leaveTimer) {
        leaveTimer.kill();
        leaveTimer = null;
      }

      pauseAllColumns();
      savedCardState.set(card, {
        x: Number(gsap.getProperty(card.scrollEl, "x")),
        y: Number(gsap.getProperty(card.scrollEl, "y")),
        rotation: Number(gsap.getProperty(card.scrollEl, "rotation")),
        tlProgress: card.scrollTl?.progress() ?? 0,
      });

      root.setAttribute("data-expanded", "true");
      card.scrollEl.setAttribute("data-expanded", "true");
      card.box.setAttribute("data-expanded", "true");

      const duration = reducedMotion ? 0.01 : 0.65;
      const { targetW, targetH, targetX, targetY } = getExpandedMetrics();

      showCloseButton();

      cards.forEach((other) => {
        gsap.to(other.scrollEl, {
          opacity: other === card ? 1 : 0,
          duration: duration * 0.35,
          overwrite: "auto",
        });
      });

      gsap.to(boxesEl, {
        duration,
        rotationX: 0,
        rotationY: 0,
        rotationZ: 0,
        scale: 1,
        ease: "power3.inOut",
        overwrite: "auto",
      });

      gsap.to(card.scrollEl, {
        duration,
        width: targetW,
        height: targetH,
        rotation: 0,
        x: targetX,
        y: targetY,
        zIndex: 50,
        ease: "power3.inOut",
        overwrite: "auto",
      });

      gsap.to(card.box, {
        duration,
        borderRadius: 0,
        scale: 1,
        ease: "power3.inOut",
        overwrite: "auto",
        onComplete: () => {
          zooming = false;
          playHeroVideo(card.videoEl);
          syncHeroVideos(cards, heroVisible, currentCard, perfMode);
        },
      });
    };

    const onScenePointerMove = (event: PointerEvent) => {
      if (currentCard && !isTouch) {
        const rootRect = root.getBoundingClientRect();
        gsap.to(closeBtn, {
          x: event.clientX - rootRect.left,
          y: event.clientY - rootRect.top,
          duration: 0.35,
          ease: "power3.out",
          overwrite: "auto",
        });
      }

      if (zooming || currentCard || isTouch) return;

      const target = pickCardAt(event.clientX, event.clientY, cards);
      if (target) applyHover(target);
      else if (hoveredCard) scheduleHoverReset();
    };

    const onScenePointerLeave = () => {
      if (zooming || currentCard || isTouch) return;
      scheduleHoverReset();
    };

    const onSceneClick = (event: MouseEvent) => {
      if (zooming) return;
      const target = pickCardAt(event.clientX, event.clientY, cards);
      if (!target) return;

      event.stopPropagation();
      if (currentCard === target) {
        collapseExpanded();
        return;
      }
      if (currentCard) return;
      expandCard(target);
    };

    const onCloseClick = (event: MouseEvent) => {
      event.stopPropagation();
      collapseExpanded();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && currentCard) collapseExpanded();
    };

    let heroVisible = true;

    const heroVisibilityObserver = new IntersectionObserver(
      ([entry]) => {
        heroVisible = entry?.isIntersecting ?? true;
        syncHeroVideos(cards, heroVisible, currentCard, perfMode);
        if (!heroVisible) pauseAllColumns();
        else if (!currentCard && !staticHero) playAllColumns();
      },
      { threshold: 0.12 },
    );
    heroVisibilityObserver.observe(root);

    closeBtn.addEventListener("click", onCloseClick);
    root.addEventListener("pointermove", onScenePointerMove);
    root.addEventListener("pointerleave", onScenePointerLeave);
    root.addEventListener("click", onSceneClick);
    window.addEventListener("keydown", onKeyDown);

    const heroVideoTypes = new Set<string>();

    for (let i = 0; i < BOX_COUNT; i++) {
      const column = Math.floor(i / 4);
      const col = COLUMN_CONFIG[column];
      const baseCard = nodeCards[i % nodeCards.length]!;
      const nodeCard = baseCard;
      const useHeroVideo = Boolean(nodeCard.heroVideoSrc) && !heroVideoTypes.has(nodeCard.type);
      if (useHeroVideo) heroVideoTypes.add(nodeCard.type);
      const card = createPhotoCard(nodeCard, column, useHeroVideo, !perfMode);
      card.boxIndex = i;
      const isInteractive = Boolean(card.videoEl);
      if (isInteractive) {
        card.box.setAttribute("tabindex", reducedMotion ? "-1" : "0");
      }
      boxesEl.appendChild(card.scrollEl);
      cards.push(card);

      gsap.set(card.scrollEl, {
        position: "absolute",
        overflow: "visible",
        cursor: isInteractive && !reducedMotion && !isTouch ? "pointer" : "default",
        x: col.x,
        width: BOX_WIDTH,
        height: BOX_HEIGHT,
        zIndex: 1,
        opacity: reducedMotion ? 0.75 : 0,
      });

      if (staticHero) {
        gsap.set(card.scrollEl, { y: (col.yFrom + col.yTo) / 2, rotation: 0, opacity: reducedMotion ? 0.75 : 1 });
        continue;
      }

      const tl = createScrollTimeline(card, (i % 4) / 4);
      tl.play();

      if (isInteractive) {
        card.box.addEventListener("keydown", (event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          if (zooming) return;
          if (currentCard === card) {
            collapseExpanded();
            return;
          }
          if (currentCard) return;
          expandCard(card);
        });
      }
    }

    if (!reducedMotion && !staticHero) {
      gsap.to(
        cards.map((c) => c.scrollEl),
        { opacity: 1, duration: 0.6, ease: "power2.inOut" },
      );
    }

    const fitScene = () => {
      const sceneScale = fitSceneScale();
      if (!currentCard) gsap.set(boxesEl, { scale: sceneScale });
    };

    fitScene();
    const observer = new ResizeObserver(() => {
      fitScene();
      if (currentCard && !zooming) {
        const { targetW, targetH, targetX, targetY } = getExpandedMetrics();
        gsap.set(currentCard.scrollEl, { width: targetW, height: targetH, x: targetX, y: targetY });
      }
    });
    observer.observe(root);

    return () => {
      heroVisibilityObserver.disconnect();
      observer.disconnect();
      if (leaveTimer) leaveTimer.kill();
      closeBtn.removeEventListener("click", onCloseClick);
      root.removeEventListener("pointermove", onScenePointerMove);
      root.removeEventListener("pointerleave", onScenePointerLeave);
      root.removeEventListener("click", onSceneClick);
      window.removeEventListener("keydown", onKeyDown);
      cards.forEach((card) => card.scrollTl?.kill());
      cards.forEach((card) => {
        if (!card.videoEl) return;
        card.videoEl.pause();
        card.videoEl.removeAttribute("src");
        card.videoEl.load();
      });
      gsap.killTweensOf([
        ...cards.map((c) => c.scrollEl),
        ...cards.map((c) => c.box),
        boxesEl,
        root,
        closeBtn,
      ]);
      cards.forEach((card) => card.scrollEl.remove());
    };
  }, []);

  return (
    <div ref={rootRef} data-home-v2-hero-photo-bg>
      <div ref={boxesRef} data-home-v2-hero-photo-boxes />
      <button
        ref={closeRef}
        type="button"
        data-home-v2-hero-photo-close
        aria-label="Cerrar tarjeta"
        hidden
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            d="M6 6l12 12M18 6L6 18"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
}
