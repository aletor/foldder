"use client";

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

function DetailCopy({ card }: { card: HomeV2NodeCard }) {
  if (card.detailContent) {
    const { intro, features } = card.detailContent;

    return (
      <div data-home-v2-coverflow-detail-columns>
        <p data-home-v2-coverflow-detail-label>{card.label}</p>
        <p data-home-v2-coverflow-detail-intro>{intro}</p>
        <ul data-home-v2-coverflow-detail-features>
          {features.map((feature) => {
            const Icon = FEATURE_ICONS[feature.icon];

            return (
              <li key={feature.title} data-home-v2-coverflow-detail-feature>
                <span data-home-v2-coverflow-detail-feature-icon aria-hidden="true">
                  <Icon strokeWidth={2.1} />
                </span>
                <p data-home-v2-coverflow-detail-feature-title>{feature.title}</p>
                <p data-home-v2-coverflow-detail-feature-desc>{feature.description}</p>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  return (
    <div data-home-v2-coverflow-detail-columns data-home-v2-coverflow-detail-columns--simple>
      <p data-home-v2-coverflow-detail-label>{card.label}</p>
      <p data-home-v2-coverflow-detail-desc>{card.description}</p>
    </div>
  );
}

export function NodeCoverflowDetail({ card, activeIndex, totalCount, onNavigate }: NodeCoverflowDetailProps) {
  const reducedMotion = useReducedMotion();

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
            drag={reducedMotion ? false : "x"}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.16}
            dragMomentum={false}
            onDragEnd={handleDragEnd}
            initial={reducedMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0, x: 0 }}
            exit={reducedMotion ? undefined : { opacity: 0, y: -8 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          >
            <div
              data-home-v2-coverflow-detail-copy
              data-rich={card.detailContent ? "true" : undefined}
              style={{ ["--node-accent" as string]: card.tabColor }}
            >
              <DetailCopy card={card} />
            </div>
          </motion.article>
        </AnimatePresence>
      </div>
    </div>
  );
}
