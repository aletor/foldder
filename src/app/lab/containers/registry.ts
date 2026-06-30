import { VerticalCarousel3DContainer } from "./VerticalCarousel3DContainer";

/** Contenedores de layout reutilizables por tipo de nodo en studio mode. */
export const LAB_STUDIO_CONTAINERS = {
  "vertical-carousel-3d": VerticalCarousel3DContainer,
} as const;

export type LabStudioContainerKind = keyof typeof LAB_STUDIO_CONTAINERS;
