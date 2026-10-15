"use client";

import { useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { NodeCoverflowCarousel, type NodeCoverflowCarouselHandle } from "./NodeCoverflowCarousel";
import { NodeCoverflowDetail } from "./NodeCoverflowDetail";
import { HOME_COPY } from "./home-copy";
import { useHomeLocale } from "./home-locale";
import { buildHomeV2NodeCards } from "./home-v2-nodes";

export function NodePerspectiveGallery() {
  const locale = useHomeLocale();
  const copy = HOME_COPY[locale];
  const cards = useMemo(() => buildHomeV2NodeCards(locale), [locale]);
  const carouselRef = useRef<NodeCoverflowCarouselHandle>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const activeCard = cards[activeIndex] ?? cards[0];

  const handleNavigate = (direction: 1 | -1) => {
    if (direction === 1) carouselRef.current?.goNext();
    else carouselRef.current?.goPrev();
  };

  return (
    <div data-home-v2-node-gallery className="w-full px-0">
      <NodeCoverflowCarousel ref={carouselRef} onActiveIndexChange={setActiveIndex} />
      {activeCard ? (
        <>
          <div data-home-v2-node-gallery-stage>
            <button
              type="button"
              data-home-v2-node-gallery-nav
              data-direction="prev"
              aria-label={copy.previousNode}
              onClick={() => handleNavigate(-1)}
            >
              <ChevronLeft strokeWidth={1.5} aria-hidden="true" />
            </button>
            <NodeCoverflowDetail
              card={activeCard}
              activeIndex={activeIndex}
              totalCount={cards.length}
              onNavigate={handleNavigate}
            />
            <button
              type="button"
              data-home-v2-node-gallery-nav
              data-direction="next"
              aria-label={copy.nextNode}
              onClick={() => handleNavigate(1)}
            >
              <ChevronRight strokeWidth={1.5} aria-hidden="true" />
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
