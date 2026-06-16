"use client";

import { useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { NodeCoverflowCarousel, type NodeCoverflowCarouselHandle } from "./NodeCoverflowCarousel";
import { NodeCoverflowDetail } from "./NodeCoverflowDetail";
import { buildHomeV2NodeCards } from "./home-v2-nodes";

export function NodePerspectiveGallery() {
  const cards = useMemo(() => buildHomeV2NodeCards(), []);
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
              aria-label="Nodo anterior"
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
              aria-label="Nodo siguiente"
              onClick={() => handleNavigate(1)}
            >
              <ChevronRight strokeWidth={1.5} aria-hidden="true" />
            </button>
          </div>
          <div data-home-v2-node-gallery-mobile-nav role="group" aria-label="Navegación de nodos">
            <button type="button" aria-label="Nodo anterior" onClick={() => handleNavigate(-1)}>
              <ChevronLeft strokeWidth={1.75} />
            </button>
            <span>
              {String(activeIndex + 1).padStart(2, "0")} / {String(cards.length).padStart(2, "0")}
            </span>
            <button type="button" aria-label="Nodo siguiente" onClick={() => handleNavigate(1)}>
              <ChevronRight strokeWidth={1.75} />
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
