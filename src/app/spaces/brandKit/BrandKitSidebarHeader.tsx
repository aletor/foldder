"use client";

import React from "react";
import type { BrandKitDocument } from "@/lib/brandkit/brand-kit-types";
import { computeBrandKitCompleteness } from "@/lib/brandkit/brand-kit-defaults";
import {
  countConfirmedSlots,
  resolveBrandKitSidebarStatus,
} from "@/lib/brandkit/studio/sidebar-slot-nav";
import { PanelLeftClose } from "lucide-react";

type BrandKitSidebarHeaderProps = {
  doc: BrandKitDocument;
  isAnalyzing?: boolean;
  canExport?: boolean;
  kitTitle?: string;
  onBrandNameChange?: (name: string) => void;
  onKitTitleChange?: (title: string) => void;
  onCollapse?: () => void;
  collapsed?: boolean;
};

export function BrandKitSidebarHeader({
  doc,
  isAnalyzing = false,
  canExport = false,
  kitTitle,
  onBrandNameChange,
  onKitTitleChange,
  onCollapse,
  collapsed = false,
}: BrandKitSidebarHeaderProps) {
  const completeness = computeBrandKitCompleteness(doc);
  const confirmed = countConfirmedSlots(doc);
  const brandEyebrow = doc.brandName?.value?.trim() || "Marca";
  const title = kitTitle?.trim() || brandEyebrow;
  const status = resolveBrandKitSidebarStatus(doc, isAnalyzing, completeness.percent, canExport);

  return (
    <header className="brandKit-sidebar-header">
      <div className="brandKit-sidebar-header__top">
        {!collapsed ? (
          <div className="brandKit-sidebar-header__identity">
            {onBrandNameChange ? (
              <input
                className="brandKit-sidebar-header__eyebrow-input"
                value={brandEyebrow}
                aria-label="Nombre de marca"
                onChange={(event) => onBrandNameChange(event.target.value)}
              />
            ) : (
              <p className="brandKit-sidebar-header__eyebrow">{brandEyebrow}</p>
            )}
            {onKitTitleChange ? (
              <input
                className="brandKit-sidebar-header__title-input"
                value={title}
                aria-label="Título del BrandKit"
                onChange={(event) => onKitTitleChange(event.target.value)}
              />
            ) : (
              <h2 className="brandKit-sidebar-header__title">{title}</h2>
            )}
          </div>
        ) : (
          <p className="brandKit-sidebar-header__rail-brand" title={title}>
            {brandEyebrow.slice(0, 3).toUpperCase()}
          </p>
        )}
        {onCollapse ? (
          <button
            type="button"
            className="brandKit-sidebar-header__collapse"
            onClick={onCollapse}
            aria-label="Colapsar panel"
          >
            <PanelLeftClose size={15} strokeWidth={1.75} aria-hidden />
          </button>
        ) : null}
      </div>

      {!collapsed ? (
        <>
          <p className="brandKit-sidebar-header__stats">
            <span>{completeness.percent}% ADN</span>
            <span className="brandKit-sidebar-header__stats-sep">·</span>
            <span>
              {confirmed}/7 confirmados
            </span>
          </p>
          <p className={`brandKit-sidebar-header__status brandKit-sidebar-header__status--${status.tone}`}>
            <span className="brandKit-sidebar-header__status-dot" aria-hidden />
            {status.label}
          </p>
        </>
      ) : (
        <p className="brandKit-sidebar-header__rail-pct">{completeness.percent}%</p>
      )}
    </header>
  );
}
