"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { BrandKitDocument } from "@/lib/brandkit/brand-kit-types";
import { BRAND_KIT_SLOT_IDS } from "@/lib/brandkit/brand-kit-types";
import { brandKitLocaleEs } from "@/lib/brandkit/brand-kit-locale.es";
import { SLOT_LABELS_ES } from "@/lib/brandkit/studio/sidebar-slot-nav";
import { MoreHorizontal, Plus, Star } from "lucide-react";
import { scrollToBrandKitBoardSlot } from "./board-v2/brand-kit-board-scroll";

type BrandKitSource = BrandKitDocument["sources"][number];

type BrandKitSidebarSourcesProps = {
  doc: BrandKitDocument;
  onSetAuthoritativeSource?: (sourceRef: string, authoritative: boolean) => void;
  onReanalyzeSource?: (sourceRef: string) => void;
  onAddSource?: () => void;
  compact?: boolean;
};

function sourceDisplayName(ref: string): string {
  if (ref.length <= 42) return ref;
  try {
    const url = new URL(ref.includes("://") ? ref : `https://${ref}`);
    return url.hostname.replace(/^www\./, "") || ref;
  } catch {
    return ref.length > 42 ? `${ref.slice(0, 20)}…${ref.slice(-12)}` : ref;
  }
}

function sourceKindLabel(kind: string, authoritative?: boolean): string {
  const base = kind === "url" ? "Web" : "PDF";
  return authoritative ? `${base} oficial · Autoritativa` : `${base} · Fuente`;
}

function sourceContributions(doc: BrandKitDocument, sourceRef: string): string[] {
  const hits: string[] = [];
  for (const slotId of BRAND_KIT_SLOT_IDS) {
    const slot = doc.slots[slotId];
    if (!slot || slot.status === "empty") continue;
    const detail = slot.provenance?.detail ?? "";
    if (detail.includes(sourceRef) || detail.includes(sourceDisplayName(sourceRef))) {
      hits.push(SLOT_LABELS_ES[slotId]);
    }
  }
  return hits;
}

function SourceMenu({
  source,
  doc,
  onSetAuthoritativeSource,
  onReanalyzeSource,
  onViewContributions,
}: {
  source: BrandKitSource;
  doc: BrandKitDocument;
  onSetAuthoritativeSource?: (sourceRef: string, authoritative: boolean) => void;
  onReanalyzeSource?: (sourceRef: string) => void;
  onViewContributions?: (sourceRef: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const contributions = useMemo(() => sourceContributions(doc, source.ref), [doc, source.ref]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onPointer);
    return () => window.removeEventListener("mousedown", onPointer);
  }, [open]);

  return (
    <div className="brandKit-sidebar-sources__menu" ref={menuRef}>
      <button
        type="button"
        className={`brandKit-sidebar-sources__star${source.authoritative ? " is-active" : ""}`}
        aria-label={source.authoritative ? brandKitLocaleEs.unmarkAuthoritative : brandKitLocaleEs.markAuthoritative}
        onClick={() => onSetAuthoritativeSource?.(source.ref, !source.authoritative)}
      >
        <Star size={12} fill={source.authoritative ? "currentColor" : "none"} />
      </button>
      <button
        type="button"
        className="brandKit-sidebar-sources__more"
        aria-label="Opciones de fuente"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <MoreHorizontal size={14} />
      </button>
      {open ? (
        <div className="brandKit-sidebar-sources__dropdown" role="menu">
          <button
            type="button"
            role="menuitem"
            className="brandKit-sidebar-sources__dropdown-item"
            onClick={() => {
              setDetailOpen(true);
              setOpen(false);
            }}
          >
            {brandKitLocaleEs.sourceViewDetail}
          </button>
          {onSetAuthoritativeSource ? (
            <button
              type="button"
              role="menuitem"
              className="brandKit-sidebar-sources__dropdown-item"
              onClick={() => {
                onSetAuthoritativeSource(source.ref, !source.authoritative);
                setOpen(false);
              }}
            >
              {source.authoritative ? brandKitLocaleEs.unmarkAuthoritative : brandKitLocaleEs.markAuthoritative}
            </button>
          ) : null}
          {onReanalyzeSource && source.kind === "url" ? (
            <button
              type="button"
              role="menuitem"
              className="brandKit-sidebar-sources__dropdown-item"
              onClick={() => {
                onReanalyzeSource(source.ref);
                setOpen(false);
              }}
            >
              {brandKitLocaleEs.sourceReanalyze}
            </button>
          ) : null}
          {contributions.length ? (
            <button
              type="button"
              role="menuitem"
              className="brandKit-sidebar-sources__dropdown-item"
              onClick={() => {
                onViewContributions?.(source.ref);
                setOpen(false);
              }}
            >
              {brandKitLocaleEs.sourceViewContributions}
            </button>
          ) : null}
        </div>
      ) : null}
      {detailOpen ? (
        <div className="brandKit-sidebar-sources__detail" role="dialog" aria-label={brandKitLocaleEs.sourceDetailTitle}>
          <p className="brandKit-sidebar-sources__detail-title">{brandKitLocaleEs.sourceDetailTitle}</p>
          <p className="brandKit-sidebar-sources__name" title={source.ref}>
            {source.ref}
          </p>
          <p className="brandKit-sidebar-sources__meta">{sourceKindLabel(source.kind, source.authoritative)}</p>
          {contributions.length ? (
            <p className="brandKit-sidebar-sources__meta">
              {brandKitLocaleEs.sourceContributionsHint}: {contributions.join(" · ")}
            </p>
          ) : null}
          <button type="button" className="brandKit-sidebar-sources__detail-close" onClick={() => setDetailOpen(false)}>
            Cerrar
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function BrandKitSidebarSources({
  doc,
  onSetAuthoritativeSource,
  onReanalyzeSource,
  onAddSource,
  compact = false,
}: BrandKitSidebarSourcesProps) {
  const sourcesCount = doc.sources.length;
  if (!sourcesCount) return null;

  const primary = doc.sources[0];

  const scrollToFirstContribution = (sourceRef: string) => {
    for (const slotId of BRAND_KIT_SLOT_IDS) {
      const slot = doc.slots[slotId];
      if (!slot || slot.status === "empty") continue;
      const detail = slot.provenance?.detail ?? "";
      if (detail.includes(sourceRef) || detail.includes(sourceDisplayName(sourceRef))) {
        scrollToBrandKitBoardSlot(slotId);
        return;
      }
    }
  };

  if (compact) {
    return (
      <div className="brandKit-sidebar-sources brandKit-sidebar-sources--rail" title={`${sourcesCount} fuente(s)`}>
        <span>{sourcesCount}</span>
      </div>
    );
  }

  return (
    <section className="brandKit-sidebar-sources" aria-label={brandKitLocaleEs.sidebarSourcesLabel}>
      <div className="brandKit-sidebar-sources__head">
        <p className="brandKit-sidebar-sources__legend">{brandKitLocaleEs.sidebarSourcesLabel}</p>
        <span className="brandKit-sidebar-sources__count">{sourcesCount}</span>
      </div>

      {primary ? (
        <article className="brandKit-sidebar-sources__primary">
          <div className="brandKit-sidebar-sources__row-main">
            <p className="brandKit-sidebar-sources__name" title={primary.ref}>
              {sourceDisplayName(primary.ref)}
            </p>
            <p className="brandKit-sidebar-sources__meta">
              {sourceKindLabel(primary.kind, primary.authoritative)}
            </p>
          </div>
          <SourceMenu
            source={primary}
            doc={doc}
            onSetAuthoritativeSource={onSetAuthoritativeSource}
            onReanalyzeSource={onReanalyzeSource}
            onViewContributions={scrollToFirstContribution}
          />
        </article>
      ) : null}

      {doc.sources.length > 1 ? (
        <ul className="brandKit-sidebar-sources__list">
          {doc.sources.slice(1).map((source, index) => (
            <li key={`${source.ref}-${source.ts}-${index}`} className="brandKit-sidebar-sources__row">
              <div className="brandKit-sidebar-sources__row-main">
                <p className="brandKit-sidebar-sources__name" title={source.ref}>
                  {sourceDisplayName(source.ref)}
                </p>
                <p className="brandKit-sidebar-sources__meta">{sourceKindLabel(source.kind, source.authoritative)}</p>
              </div>
              <SourceMenu
                source={source}
                doc={doc}
                onSetAuthoritativeSource={onSetAuthoritativeSource}
                onReanalyzeSource={onReanalyzeSource}
                onViewContributions={scrollToFirstContribution}
              />
            </li>
          ))}
        </ul>
      ) : null}

      <button type="button" className="brandKit-sidebar-sources__add" onClick={onAddSource}>
        <Plus size={14} aria-hidden />
        {brandKitLocaleEs.addSource}
      </button>
    </section>
  );
}
