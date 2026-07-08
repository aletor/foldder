"use client";

import {
  ProjectBrainFullscreen,
  type ProjectBrainFullscreenProps,
} from "@/app/spaces/ProjectBrainFullscreen";

/** Punto de entrada Brand Board v1: landing Board + profundidad vía menú ···. */
export function BrandBoardStudio(props: ProjectBrainFullscreenProps) {
  return <ProjectBrainFullscreen {...props} presentation="brand-board-landing" />;
}
