"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { buildHomeV2NodeCards } from "./home-v2-nodes";
import { BrainLightningOverlay } from "./BrainLightningOverlay";
import { BrainSphereWebGLBackground } from "./BrainSphereWebGLBackground";

const BRAIN_FIGURE_WIDTH = 1024;
const BRAIN_FIGURE_HEIGHT = 576;
const CAPSULE_RADIUS = 40;

const CAROUSEL_MS = 4000;

const GRAPH_CENTER = { x: 50, y: 50 };

const CAPSULES = [
  {
    label: "WRITE",
    nodeType: "guionista",
    angle: -90,
    message: "Brain aplica tono, claims y contexto de marca a cada texto que generas.",
  },
  {
    label: "IMAGE",
    nodeType: "nanoBanana",
    angle: -30,
    message: "Brain guía estilo visual, paleta, referencias y elementos a evitar en cada imagen.",
  },
  {
    label: "DESIGN",
    nodeType: "designer",
    angle: 30,
    message: "Brain lleva tu identidad a layouts, piezas gráficas, documentos y presentaciones.",
  },
  {
    label: "VIDEO",
    nodeType: "geminiVideo",
    angle: 90,
    message: "Brain traduce tu marca en atmósfera, ritmo, estilo visual y dirección de cámara.",
  },
  {
    label: "CINEMA",
    nodeType: "cine",
    angle: 150,
    message: "Brain mantiene coherencia entre guion, personajes, escenas, fondos y frames.",
  },
  {
    label: "PRESENT",
    nodeType: "presenter",
    angle: -150,
    message: "Brain convierte tu contenido y diseño en una presentación alineada con tu marca.",
  },
] as const;

type CapsuleLabel = (typeof CAPSULES)[number]["label"];

function polar(angleDeg: number, radius: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: GRAPH_CENTER.x + radius * Math.sin(rad),
    y: GRAPH_CENTER.y - radius * Math.cos(rad),
  };
}

export function BrainSectionVisual() {
  const stageRef = useRef<HTMLDivElement>(null);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [hoveredCapsule, setHoveredCapsule] = useState<CapsuleLabel | null>(null);
  const reducedMotion = useReducedMotion();

  const nodeBackgrounds = useMemo(() => {
    const map = new Map<string, string>();
    for (const card of buildHomeV2NodeCards()) {
      map.set(card.type, card.imageSrc);
    }
    return map;
  }, []);

  const layout = useMemo(
    () =>
      CAPSULES.map((capsule, index) => {
        const anchor = polar(capsule.angle, CAPSULE_RADIUS);

        return {
          ...capsule,
          anchor,
          floatDelay: index * 0.55,
          backgroundSrc: nodeBackgrounds.get(capsule.nodeType) ?? "/assets/nodes/brain-empty.jpg",
        };
      }),
    [nodeBackgrounds],
  );

  const focusedCapsule = hoveredCapsule ?? CAPSULES[carouselIndex].label;

  useEffect(() => {
    if (reducedMotion || hoveredCapsule) return;

    const timer = window.setInterval(() => {
      setCarouselIndex((index) => (index + 1) % CAPSULES.length);
    }, CAROUSEL_MS);

    return () => window.clearInterval(timer);
  }, [hoveredCapsule, reducedMotion]);

  return (
    <div
      data-home-v2-brain-visual
      data-carousel-paused={hoveredCapsule ? "true" : undefined}
      onPointerLeave={() => setHoveredCapsule(null)}
      onBlur={(event) => {
        const next = event.relatedTarget as Node | null;
        if (!event.currentTarget.contains(next)) setHoveredCapsule(null);
      }}
    >
      <div ref={stageRef} data-home-v2-brain-visual-stage>
        <BrainSphereWebGLBackground />

        {layout.map((capsule) => {
          const isActive = focusedCapsule === capsule.label;
          const isDimmed = Boolean(focusedCapsule) && !isActive;

          return (
            <motion.div
              key={capsule.label}
              data-home-v2-brain-capsule-wrap
              data-capsule={capsule.label}
              data-active={isActive ? "true" : "false"}
              style={{
                left: `${capsule.anchor.x}%`,
                top: `${capsule.anchor.y}%`,
                x: "-50%",
                y: "-50%",
              }}
              initial={false}
              animate={{
                scale: isActive ? 1.05 : 1,
                opacity: isDimmed ? 0.72 : 1,
              }}
              transition={
                reducedMotion
                  ? { duration: 0.2 }
                  : {
                      type: "spring",
                      stiffness: 280,
                      damping: 32,
                      bounce: 0,
                    }
              }
            >
              <motion.div
                data-home-v2-brain-capsule-float
                initial={false}
                animate={{ y: reducedMotion ? 0 : [0, -3, 0] }}
                transition={
                  reducedMotion
                    ? { duration: 0 }
                    : {
                        duration: 5.2,
                        repeat: Infinity,
                        ease: "easeInOut",
                        delay: capsule.floatDelay,
                      }
                }
              >
                <button
                  type="button"
                  data-home-v2-brain-capsule
                  onPointerEnter={() => setHoveredCapsule(capsule.label)}
                  onFocus={() => setHoveredCapsule(capsule.label)}
                  aria-label={capsule.message}
                  aria-expanded={isActive}
                >
                  <span
                    data-home-v2-brain-capsule-thumb
                    aria-hidden="true"
                    style={{ backgroundImage: `url(${capsule.backgroundSrc})` }}
                  />
                  <span data-home-v2-brain-capsule-label>{capsule.label}</span>
                </button>
              </motion.div>

              <AnimatePresence initial={false}>
                {isActive ? (
                  <motion.p
                    key={`${capsule.label}-caption`}
                    data-home-v2-brain-capsule-caption
                    aria-live="polite"
                    initial={reducedMotion ? false : { opacity: 0, y: 6, scale: 0.98 }}
                    animate={
                      reducedMotion
                        ? { opacity: 1, y: 0, scale: 1 }
                        : {
                            opacity: 1,
                            y: 0,
                            scale: 1,
                            transition: {
                              type: "spring",
                              stiffness: 320,
                              damping: 26,
                              mass: 0.92,
                            },
                          }
                    }
                    exit={
                      reducedMotion
                        ? { opacity: 0 }
                        : {
                            opacity: 0,
                            y: 4,
                            scale: 0.99,
                            transition: {
                              duration: 0.62,
                              ease: [0.22, 1.08, 0.36, 1],
                            },
                          }
                    }
                  >
                    {capsule.message}
                  </motion.p>
                ) : null}
              </AnimatePresence>
            </motion.div>
          );
        })}

        <div data-home-v2-brain-figure-wrap>
          <div data-home-v2-brain-figure-glow />
          <div data-home-v2-brain-figure-mask>
            <Image
              src="/home-v2/brain-figure.png"
              alt=""
              width={BRAIN_FIGURE_WIDTH}
              height={BRAIN_FIGURE_HEIGHT}
              sizes="(max-width: 640px) 168px, 216px"
              priority={false}
            />
          </div>
        </div>

        <BrainLightningOverlay
          stageRef={stageRef}
          activeCapsule={focusedCapsule}
          enabled={!reducedMotion}
        />
      </div>
    </div>
  );
}
