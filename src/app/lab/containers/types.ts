import type { ReactNode } from "react";

/** Slide de un contenedor vertical 3D (p. ej. paneles de studio por nodo). */
export type VerticalCarouselSlide = {
  id: string;
  label: string;
  content: ReactNode;
};

export type VerticalCarouselContainerProps = {
  slides: VerticalCarouselSlide[];
  intervalMs?: number;
  defaultAutoplay?: boolean;
};
