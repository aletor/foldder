"use client";

import React from "react";
import { X } from "lucide-react";
import type { SitePage, PublishState } from "@/lib/site/site-types";

export function SiteSettingsPopover({
  pages,
  activePageId,
  slug,
  publish,
  previewLocale,
  onClose,
  onSelectSitePage,
  onAddSitePage,
  onPatchSlug,
  onOpenFullSettings,
}: {
  pages: SitePage[];
  activePageId: string;
  slug: string;
  publish: PublishState;
  previewLocale: string;
  onClose: () => void;
  onSelectSitePage: (pageId: string) => void;
  onAddSitePage: () => void;
  onPatchSlug: (slug: string) => void;
  onOpenFullSettings: () => void;
}) {
  const activePage = pages.find((page) => page.id === activePageId) ?? pages[0];

  return (
    <div className="site-editor-popover site-editor-popover--settings" role="dialog" aria-label="Ajustes del sitio">
      <header className="site-editor-popover__head">
        <h2 className="site-editor-popover__title">Ajustes del sitio</h2>
        <button type="button" className="site-editor-popover__close" onClick={onClose} aria-label="Cerrar">
          <X size={16} />
        </button>
      </header>

      <div className="site-editor-popover__body">
        <label className="site-editor-popover__field">
          <span>Página activa</span>
          <select
            className="site-editor-popover__input"
            value={activePageId}
            onChange={(event) => onSelectSitePage(event.target.value)}
          >
            {pages.map((page, index) => (
              <option key={page.id} value={page.id}>
                {page.seo.title.trim() || `Página ${index + 1}`}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="site-editor-popover__link-btn" onClick={onAddSitePage}>
          + Nueva página
        </button>

        <label className="site-editor-popover__field">
          <span>Slug URL</span>
          <input
            className="site-editor-popover__input"
            value={slug}
            onChange={(event) => onPatchSlug(event.target.value)}
          />
        </label>

        {activePage ? (
          <>
            <label className="site-editor-popover__field">
              <span>Título SEO</span>
              <input className="site-editor-popover__input" value={activePage.seo.title} readOnly />
            </label>
            <p className="site-editor-popover__hint">Locale preview: {previewLocale}</p>
          </>
        ) : null}

        {publish.publicUrl ? (
          <p className="site-editor-popover__value">
            Publicado:{" "}
            <a href={publish.publicUrl} target="_blank" rel="noopener noreferrer">
              {publish.publicUrl.replace(/^https?:\/\//, "")}
            </a>
          </p>
        ) : null}

        <button type="button" className="site-editor-popover__action" onClick={onOpenFullSettings}>
          Ajustes completos (SEO, dominio, leads…)
        </button>
      </div>
    </div>
  );
}
