"use client";

import React, { useEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { BrandKitFoldderButton } from "./BrandKitFoldderButton";

export type BrandKitCellMenuItem = {
  id: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
};

export function BrandKitCellContextMenu({
  items,
  ariaLabel = "Más acciones",
}: {
  items: BrandKitCellMenuItem[];
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const visible = items.filter((item) => !item.disabled);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onPointer);
    return () => window.removeEventListener("mousedown", onPointer);
  }, [open]);

  if (!visible.length) return null;

  return (
    <div className="brandKit-cell-context-menu" ref={rootRef}>
      <BrandKitFoldderButton
        variant="ghost"
        compact
        iconOnly
        icon={MoreHorizontal}
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      />
      {open ? (
        <div className="brandKit-cell-context-menu__dropdown" role="menu">
          {visible.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              className="brandKit-cell-context-menu__item"
              onClick={() => {
                item.onClick();
                setOpen(false);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
