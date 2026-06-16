"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Brain,
  Brush,
  Camera,
  Clapperboard,
  Download,
  Eye,
  GanttChart,
  Images,
  Layers,
  LayoutGrid,
  PenTool,
  Presentation,
  Scissors,
  ScanText,
  SlidersHorizontal,
  Sparkles,
  WandSparkles,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import type { HomeV2NodeDetailFeatureIcon } from "./home-v2-node-details";
import type { HomeV2NodeCard } from "./home-v2-nodes";

type NodeCoverflowDetailProps = {
  card: HomeV2NodeCard;
  activeIndex: number;
  totalCount: number;
  onNavigate: (direction: 1 | -1) => void;
};

const FEATURE_ICONS: Record<HomeV2NodeDetailFeatureIcon, LucideIcon> = {
  layers: Layers,
  brush: Brush,
  sparkles: Sparkles,
  layout: LayoutGrid,
  pen: PenTool,
  presentation: Presentation,
  clapperboard: Clapperboard,
  camera: Camera,
  scissors: Scissors,
  timeline: GanttChart,
  sliders: SlidersHorizontal,
  download: Download,
  wand: WandSparkles,
  images: Images,
  brain: Brain,
  scanText: ScanText,
  eye: Eye,
  workflow: Workflow,
};

const DETAIL_EASE = [0.16, 1, 0.3, 1] as const;

const detailStaggerContainer = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.055,
      delayChildren: 0.03,
    },
  },
};

const detailStaggerItem = {
  hidden: { opacity: 0, y: 14 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.34, ease: DETAIL_EASE },
  },
};

function useMobileDetailLayout() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 639px)");
    const sync = () => setIsMobile(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  return isMobile;
}

function FormattedText({
  text,
  dataAttr,
}: {
  text: string;
  dataAttr: "intro" | "desc" | "feature-line";
}) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  const content = parts.map((part, index) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={index}>{part.slice(2, -2)}</strong>
    ) : (
      part
    ),
  );

  if (dataAttr === "intro") {
    return <p data-home-v2-coverflow-detail-intro>{content}</p>;
  }

  if (dataAttr === "desc") {
    return <p data-home-v2-coverflow-detail-desc>{content}</p>;
  }

  return <span data-home-v2-coverflow-detail-feature-line>{content}</span>;
}

function DetailCopy({
  card,
  animateCopy,
}: {
  card: HomeV2NodeCard;
  animateCopy: boolean;
}) {
  const motionProps = animateCopy
    ? {
        variants: detailStaggerContainer,
        initial: "hidden" as const,
        animate: "show" as const,
      }
    : {};
  const itemVariants = animateCopy ? detailStaggerItem : undefined;

  if (card.detailContent) {
    const { intro, features } = card.detailContent;

    return (
      <motion.div data-home-v2-coverflow-detail-columns {...motionProps}>
        <motion.p data-home-v2-coverflow-detail-label variants={itemVariants}>
          {card.label}
        </motion.p>
        <motion.div variants={itemVariants}>
          <FormattedText text={intro} dataAttr="intro" />
        </motion.div>
        <motion.ul data-home-v2-coverflow-detail-features>
          {features.map((feature) => {
            const Icon = FEATURE_ICONS[feature.icon];

            return (
              <motion.li
                key={feature.id}
                data-home-v2-coverflow-detail-feature
                variants={itemVariants}
              >
                <span data-home-v2-coverflow-detail-feature-icon aria-hidden="true">
                  <Icon strokeWidth={2.1} />
                </span>
                <FormattedText text={feature.line} dataAttr="feature-line" />
              </motion.li>
            );
          })}
        </motion.ul>
      </motion.div>
    );
  }

  return (
    <motion.div
      data-home-v2-coverflow-detail-columns
      data-home-v2-coverflow-detail-columns--simple
      {...motionProps}
    >
      <motion.p data-home-v2-coverflow-detail-label variants={itemVariants}>
        {card.label}
      </motion.p>
      <motion.div variants={itemVariants}>
        <FormattedText text={card.description} dataAttr="desc" />
      </motion.div>
    </motion.div>
  );
}

export function NodeCoverflowDetail({ card, activeIndex, totalCount, onNavigate }: NodeCoverflowDetailProps) {
  const reducedMotion = useReducedMotion();
  const isMobile = useMobileDetailLayout();
  const animateCopy = !reducedMotion && !isMobile;

  const handleDragEnd = (_: unknown, info: { offset: { x: number }; velocity: { x: number } }) => {
    const swipedNext = info.offset.x < -48 || info.velocity.x < -280;
    const swipedPrev = info.offset.x > 48 || info.velocity.x > 280;

    if (swipedNext) onNavigate(1);
    else if (swipedPrev) onNavigate(-1);
  };

  return (
    <div
      data-home-v2-coverflow-detail
      aria-live="polite"
      aria-roledescription="carousel"
      aria-label={`Detalle del nodo ${activeIndex + 1} de ${totalCount}`}
    >
      <div data-home-v2-coverflow-detail-slot>
        <AnimatePresence mode="wait" initial={false}>
          <motion.article
            key={card.type}
            data-home-v2-coverflow-detail-panel
            drag={!isMobile && !reducedMotion ? "x" : false}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.16}
            dragMomentum={false}
            onDragEnd={handleDragEnd}
            initial={animateCopy ? { opacity: 0 } : false}
            animate={{ opacity: 1, x: 0 }}
            exit={animateCopy ? { opacity: 0 } : undefined}
            transition={{ duration: 0.2, ease: DETAIL_EASE }}
          >
            <div
              data-home-v2-coverflow-detail-copy
              data-rich={card.detailContent ? "true" : undefined}
              style={{ ["--node-accent" as string]: card.tabColor }}
            >
              <DetailCopy card={card} animateCopy={animateCopy} />
            </div>
          </motion.article>
        </AnimatePresence>
      </div>
    </div>
  );
}
