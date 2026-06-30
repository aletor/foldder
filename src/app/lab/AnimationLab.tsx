"use client";

import { VerticalCarousel3DContainer } from "./containers/VerticalCarousel3DContainer";
import { STUDIO_POPULATE_CAROUSEL_SLIDES } from "./studio/StudioPopulatePanelDemo";

export function AnimationLab() {
  return (
    <div className="lab-root">
      <header className="lab-header">
        <div className="lab-brand">
          <strong>Foldder Lab</strong>
          <span>Studio mode · preview de contenedores</span>
        </div>
        <div className="lab-badge">Experimental</div>
      </header>

      <main className="lab-main">
        <aside className="lab-carousel-dock" aria-label="Contenedor studio">
          <VerticalCarousel3DContainer
            slides={STUDIO_POPULATE_CAROUSEL_SLIDES}
            intervalMs={2000}
          />
        </aside>
      </main>
    </div>
  );
}
