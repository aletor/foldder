"use client";

import { useEffect, useState } from "react";

function isStudioCanvasOpen(): boolean {
  if (typeof document === "undefined") return false;
  return Boolean(document.querySelector("[data-foldder-studio-canvas]"));
}

/** True while PhotoRoom / Designer full-screen studio is mounted. */
export function useStudioCanvasOpen(): boolean {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const sync = () => setOpen(isStudioCanvasOpen());
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(document.body, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, []);

  return open;
}
