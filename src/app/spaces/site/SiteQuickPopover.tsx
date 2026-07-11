"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";

export function SiteQuickPopover({
  open,
  anchorEl,
  onClose,
  children,
  width = 260,
  label,
}: {
  open: boolean;
  anchorEl: HTMLElement | null;
  onClose: () => void;
  children: React.ReactNode;
  width?: number;
  label?: string;
}) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({ visibility: "hidden" });

  useLayoutEffect(() => {
    if (!open || !anchorEl) return;
    const rect = anchorEl.getBoundingClientRect();
    const popoverEl = popoverRef.current;
    const popoverHeight = popoverEl?.offsetHeight ?? 160;
    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;
    const placeAbove = spaceAbove >= popoverHeight + 10 || spaceAbove > spaceBelow;
    const left = Math.min(
      Math.max(8, rect.left + rect.width / 2 - width / 2),
      window.innerWidth - width - 8,
    );

    setStyle({
      position: "fixed",
      left,
      width,
      zIndex: 45,
      visibility: "visible",
      ...(placeAbove
        ? { bottom: window.innerHeight - rect.top + 8 }
        : { top: rect.bottom + 8 }),
    });
  }, [anchorEl, open, width, children]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (popoverRef.current?.contains(target)) return;
      if (anchorEl?.contains(target)) return;
      onClose();
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [anchorEl, onClose, open]);

  if (!open) return null;

  return (
    <div
      ref={popoverRef}
      className="site-quick-popover"
      style={style}
      role="dialog"
      aria-label={label}
      onMouseDown={(event) => event.stopPropagation()}
    >
      {children}
    </div>
  );
}
