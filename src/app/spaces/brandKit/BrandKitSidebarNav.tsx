"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { BrandKitDocument, SlotId } from "@/lib/brandkit/brand-kit-types";
import { brandKitLocaleEs } from "@/lib/brandkit/brand-kit-locale.es";
import { buildSlotNavPreview } from "@/lib/brandkit/studio/brand-kit-slot-detail";
import {
  buildSidebarNavItems,
  type SidebarNavItem,
  type SidebarNavItemId,
} from "@/lib/brandkit/studio/sidebar-slot-nav";
import { scrollToBrandKitBoardSlot } from "./board-v2/brand-kit-board-scroll";
import { useBrandKitMosaicBoard } from "./board-v2/brand-kit-mosaic-context";
import type { BrandKitStudioMode } from "@/lib/brandkit/studio/brand-kit-studio-mode";
import { isPresentationMode } from "@/lib/brandkit/studio/brand-kit-studio-mode";

type BrandKitSidebarNavProps = {
  doc: BrandKitDocument;
  activeSlotId?: SlotId;
  selectedId?: SidebarNavItemId;
  onSelect?: (id: SidebarNavItemId) => void;
  compact?: boolean;
  studioMode?: BrandKitStudioMode;
};

function scrollToNavTarget(item: SidebarNavItem): void {
  if (item.scrollTarget === "applications") {
    document.querySelector(".banda-08")?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  scrollToBrandKitBoardSlot(item.scrollTarget as SlotId);
}

function NavHoverPreview({
  item,
  doc,
  anchorRef,
}: {
  item: SidebarNavItem;
  doc: BrandKitDocument;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  const updateCoords = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setCoords({ top: rect.top, left: rect.right + 8 });
  }, [anchorRef]);

  useEffect(() => {
    updateCoords();
    window.addEventListener("scroll", updateCoords, true);
    window.addEventListener("resize", updateCoords);
    return () => {
      window.removeEventListener("scroll", updateCoords, true);
      window.removeEventListener("resize", updateCoords);
    };
  }, [updateCoords]);

  if (item.id === "applications") return null;
  const preview = buildSlotNavPreview(doc, item.id);
  if (!preview || !coords) return null;

  return (
    <div
      className="brandKit-sidebar-nav__preview brandKit-sidebar-nav__preview--floating"
      style={{ top: coords.top, left: coords.left }}
      role="tooltip"
    >
      <p className="brandKit-sidebar-nav__preview-title">{preview.headline}</p>
      {preview.lines.map((line) => (
        <p key={line} className="brandKit-sidebar-nav__preview-line">
          {line}
        </p>
      ))}
    </div>
  );
}

function SidebarNavListItem({
  item,
  doc,
  selected,
  isLast,
  onClick,
  onHover,
  onLeave,
  isHovered,
}: {
  item: SidebarNavItem;
  doc: BrandKitDocument;
  selected: boolean;
  isLast: boolean;
  onClick: () => void;
  onHover: () => void;
  onLeave: () => void;
  isHovered: boolean;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);

  return (
    <li
      className={`brandKit-sidebar-nav__item${selected ? " is-selected" : ""}${isHovered ? " is-hovered" : ""}`}
    >
      <button
        ref={btnRef}
        type="button"
        className="brandKit-sidebar-nav__btn"
        onClick={onClick}
        onMouseEnter={onHover}
        onMouseLeave={onLeave}
      >
        <span className="brandKit-sidebar-nav__number">{item.number}</span>
        <span className="brandKit-sidebar-nav__label">{item.label}</span>
        <span
          className={`brandKit-sidebar-nav__status brandKit-sidebar-nav__status--${item.status}`}
          title={item.status}
          aria-hidden
        >
          {item.statusSymbol}
        </span>
      </button>
      {isHovered ? <NavHoverPreview item={item} doc={doc} anchorRef={btnRef} /> : null}
      {!isLast ? <span className="brandKit-sidebar-nav__connector" aria-hidden /> : null}
    </li>
  );
}

export function BrandKitSidebarNav({
  doc,
  activeSlotId,
  selectedId,
  onSelect,
  compact = false,
  studioMode = "presentation",
}: BrandKitSidebarNavProps) {
  const items = buildSidebarNavItems(doc, activeSlotId, {
    presentationOnly: isPresentationMode(studioMode),
  });
  const [hoveredId, setHoveredId] = useState<SidebarNavItemId | null>(null);
  const mosaicBoard = useBrandKitMosaicBoard();

  const handleClick = (item: SidebarNavItem) => {
    onSelect?.(item.id);
    mosaicBoard?.navigateToSlot(item.id);
    scrollToNavTarget(item);
    if (mosaicBoard?.studioMode === "edit") {
      mosaicBoard.selectSlot(item.id);
    }
  };

  if (compact) {
    return (
      <nav className="brandKit-sidebar-nav brandKit-sidebar-nav--rail" aria-label={brandKitLocaleEs.sidebarContentLabel}>
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`brandKit-sidebar-nav__rail-btn${selectedId === item.id ? " is-selected" : ""}`}
            title={`${item.number} — ${item.label}`}
            onClick={() => handleClick(item)}
          >
            <span className="brandKit-sidebar-nav__rail-num">{item.number}</span>
            {mosaicBoard?.studioMode === "edit" ? (
              <span
                className={`brandKit-sidebar-nav__rail-status brandKit-sidebar-nav__status--${item.status}`}
                aria-hidden
              >
                {item.statusSymbol}
              </span>
            ) : null}
          </button>
        ))}
      </nav>
    );
  }

  return (
    <nav className="brandKit-sidebar-nav" aria-label={brandKitLocaleEs.sidebarContentLabel}>
      <p className="brandKit-sidebar-nav__legend">{brandKitLocaleEs.sidebarContentLabel}</p>
      <ol className="brandKit-sidebar-nav__list">
        {items.map((item, index) => (
          <SidebarNavListItem
            key={item.id}
            item={item}
            doc={doc}
            selected={selectedId === item.id}
            isLast={index === items.length - 1}
            isHovered={hoveredId === item.id}
            onClick={() => handleClick(item)}
            onHover={() => setHoveredId(item.id)}
            onLeave={() => setHoveredId(null)}
          />
        ))}
      </ol>
    </nav>
  );
}
