"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { CanvasWallpaperTransition } from "@/app/spaces/CanvasWallpaperTransition";
import { CANVAS_BACKGROUNDS, resolveCanvasBackgroundSelection, type CanvasBackgroundOption } from "@/app/spaces/canvas-backgrounds";
import { useHomeV2DeviceProfile } from "./home-v2-device";

const FLOWS_WALLPAPER_IDS = [
  "local-night-hills",
  "local-pastel-gradient",
  "unsplash-city-night",
  "local-purple-gradient",
  "geometric-mid-century",
] as const;

const ROTATE_MS = 8000;

function flowsWallpaperCoverStyle(url: string): CSSProperties {
  return {
    backgroundColor: "#f8fafc",
    backgroundImage: url ? `url("${url}")` : undefined,
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
  };
}

export function FlowsWallpaperBackground() {
  const { perfMode } = useHomeV2DeviceProfile();
  const [index, setIndex] = useState(0);

  const options = useMemo(
    () =>
      FLOWS_WALLPAPER_IDS.map((id) => CANVAS_BACKGROUNDS.find((bg) => bg.id === id)).filter(
        (bg): bg is CanvasBackgroundOption => Boolean(bg),
      ),
    [],
  );

  useEffect(() => {
    if (perfMode) return;

    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % FLOWS_WALLPAPER_IDS.length);
    }, ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [perfMode]);

  const activeId = FLOWS_WALLPAPER_IDS[index];

  if (perfMode) {
    const selection = resolveCanvasBackgroundSelection(FLOWS_WALLPAPER_IDS[0], "", options);
    if (selection.kind === "color") {
      return (
        <div className="flows-demo-wallpaper pointer-events-none absolute inset-0 z-0 isolate" aria-hidden style={{ backgroundColor: selection.color }} />
      );
    }

    return (
      <div
        className="flows-demo-wallpaper pointer-events-none absolute inset-0 z-0 isolate bg-[#f8fafc] foldder-canvas-wallpaper-layer"
        aria-hidden
        style={flowsWallpaperCoverStyle(selection.url)}
      />
    );
  }

  return (
    <div className="flows-demo-wallpaper" aria-hidden>
      <CanvasWallpaperTransition activeId={activeId} options={options} />
    </div>
  );
}
