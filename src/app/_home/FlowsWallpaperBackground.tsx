"use client";

import { useEffect, useMemo, useState } from "react";
import { CanvasWallpaperTransition } from "@/app/spaces/CanvasWallpaperTransition";
import { CANVAS_BACKGROUNDS, type CanvasBackgroundOption } from "@/app/spaces/canvas-backgrounds";

const FLOWS_WALLPAPER_IDS = [
  "local-night-hills",
  "local-pastel-gradient",
  "unsplash-city-night",
  "local-purple-gradient",
  "geometric-mid-century",
] as const;

const ROTATE_MS = 8000;

export function FlowsWallpaperBackground() {
  const [index, setIndex] = useState(0);

  const options = useMemo(
    () =>
      FLOWS_WALLPAPER_IDS.map((id) => CANVAS_BACKGROUNDS.find((bg) => bg.id === id)).filter(
        (bg): bg is CanvasBackgroundOption => Boolean(bg),
      ),
    [],
  );

  useEffect(() => {
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % FLOWS_WALLPAPER_IDS.length);
    }, ROTATE_MS);
    return () => window.clearInterval(timer);
  }, []);

  const activeId = FLOWS_WALLPAPER_IDS[index];

  return (
    <div className="flows-demo-wallpaper" aria-hidden>
      <CanvasWallpaperTransition activeId={activeId} options={options} />
    </div>
  );
}
