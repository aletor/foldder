"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const BRAND_KIT_STUDIO_ROOT_SELECTOR = "[data-foldder-brandkit-studio]";

export function BrandKitLogoAdjustPortal({ children }: { children: React.ReactNode }) {
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setPortalRoot(document.querySelector<HTMLElement>(BRAND_KIT_STUDIO_ROOT_SELECTOR));
  }, []);

  const overlay = <div className="brandKit-v2-logo-adjust-overlay">{children}</div>;

  if (portalRoot) return createPortal(overlay, portalRoot);
  return overlay;
}
