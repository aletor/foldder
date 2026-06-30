"use client";

import { VerticalCarousel3D, type CarouselItem } from "./VerticalCarousel3D";

const CAROUSEL_ITEMS: CarouselItem[] = [
  { id: "b1", label: "Hero", hue: 42 },
  { id: "b2", label: "Media", hue: 210 },
  { id: "b3", label: "Copy", hue: 150 },
  { id: "b4", label: "CTA", hue: 12 },
];

export function AnimationLab() {
  return (
    <div className="lab-root">
      <header className="lab-header">
        <div className="lab-brand">
          <strong>Foldder Lab</strong>
          <span>Sandbox de animaciones · no conectado a producción</span>
        </div>
        <div className="lab-badge">Experimental</div>
      </header>

      <main className="lab-main">
        <aside className="lab-carousel-dock" aria-label="Carrusel 3D">
          <VerticalCarousel3D items={CAROUSEL_ITEMS} intervalMs={2000} />
        </aside>
      </main>
    </div>
  );
}
