"use client";

import React from "react";
import { ArrowDown, ArrowUp, Copy, Eye, EyeOff, FileText, GripVertical, Plus, Trash2 } from "lucide-react";
import { SITE_FACTORY_PRESETS } from "@/lib/site/site-presets";
import type { Block, SiteFactoryPresetId, SitePage } from "@/lib/site/site-types";

export function SiteCompositionRail({
  pages,
  activePageId,
  sections,
  sectionLabels,
  navInclude,
  selectedSectionId,
  pageSelected,
  onSelectPage,
  onSelectSitePage,
  onAddSitePage,
  onRemoveSitePage,
  onSelectSection,
  onAddSection,
  onDuplicateSection,
  onRemoveSection,
  onToggleNav,
  onRenameSection,
  onMoveSection,
  onReorderSections,
}: {
  pages: SitePage[];
  activePageId: string;
  sections: Block[];
  sectionLabels: Record<string, string>;
  navInclude: string[];
  selectedSectionId: string | null;
  pageSelected: boolean;
  onSelectPage: () => void;
  onSelectSitePage: (pageId: string) => void;
  onAddSitePage: () => void;
  onRemoveSitePage: (pageId: string) => void;
  onSelectSection: (id: string) => void;
  onAddSection: (presetId: SiteFactoryPresetId) => void;
  onDuplicateSection: (id: string) => void;
  onRemoveSection: (id: string) => void;
  onToggleNav: (id: string) => void;
  onRenameSection: (id: string, label: string) => void;
  onMoveSection: (id: string, direction: "up" | "down") => void;
  onReorderSections: (dragId: string, dropId: string) => void;
}) {
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [dragSectionId, setDragSectionId] = React.useState<string | null>(null);
  const listRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!selectedSectionId || !listRef.current) return;
    const card = listRef.current.querySelector(`[data-section-card-id="${selectedSectionId}"]`);
    card?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedSectionId]);

  const pageLabel = (page: SitePage, index: number) =>
    page.seo.title.trim() || `Página ${index + 1}`;

  return (
    <aside className="site-studio__rail" data-foldder-studio-panel aria-label="Composición">
      <header className="site-studio__rail-head">
        <span className="site-studio__micro-label">Composición</span>
        <span className="site-studio__rail-count">{sections.length} secciones</span>
      </header>

      <div className="site-studio__page-switcher">
        <select
          className="site-studio__field-input site-studio__page-select"
          value={activePageId}
          onChange={(event) => onSelectSitePage(event.target.value)}
          aria-label="Página activa"
        >
          {pages.map((page, index) => (
            <option key={page.id} value={page.id}>
              {pageLabel(page, index)}
            </option>
          ))}
        </select>
        <button type="button" className="site-studio__icon-btn" title="Nueva página" onClick={onAddSitePage}>
          <Plus size={13} />
        </button>
        {pages.length > 1 ? (
          <button
            type="button"
            className="site-studio__icon-btn site-studio__icon-btn--danger"
            title="Eliminar página activa"
            onClick={() => onRemoveSitePage(activePageId)}
          >
            <Trash2 size={13} />
          </button>
        ) : null}
      </div>

      <div className="site-studio__section-list" ref={listRef}>
        {sections.length === 0 ? (
          <p className="site-studio__empty-hint">Añade una sección para empezar a componer tu página.</p>
        ) : (
          sections.map((section, index) => {
            const label = sectionLabels[section.id] ?? `Sección ${index + 1}`;
            const inNav = navInclude.includes(section.id);
            const isSelected = selectedSectionId === section.id;
            const isDragging = dragSectionId === section.id;
            return (
              <div
                key={section.id}
                data-section-card-id={section.id}
                className={`site-studio__section-card${isSelected ? " is-selected" : ""}${isDragging ? " is-dragging" : ""}`}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const dragId = event.dataTransfer.getData("text/site-section-id") || dragSectionId;
                  if (dragId && dragId !== section.id) onReorderSections(dragId, section.id);
                  setDragSectionId(null);
                }}
              >
                <button
                  type="button"
                  className="site-studio__section-card-main"
                  onClick={() => onSelectSection(section.id)}
                >
                  <span
                    className="site-studio__section-grip"
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData("text/site-section-id", section.id);
                      event.dataTransfer.effectAllowed = "move";
                      setDragSectionId(section.id);
                    }}
                    onDragEnd={() => setDragSectionId(null)}
                    title="Arrastrar para reordenar"
                  >
                    <GripVertical size={14} aria-hidden />
                  </span>
                  <span className="site-studio__section-thumb" aria-hidden>
                    <span className="site-studio__section-thumb-inner" />
                  </span>
                  <span className="site-studio__section-meta">
                    <input
                      className="site-studio__section-name"
                      value={label}
                      onChange={(event) => onRenameSection(section.id, event.target.value)}
                      onClick={(event) => event.stopPropagation()}
                      aria-label="Nombre de sección"
                    />
                    <span className="site-studio__section-type">{section.type}</span>
                  </span>
                </button>
                <div className="site-studio__section-actions">
                  <button
                    type="button"
                    className="site-studio__icon-btn"
                    title="Subir"
                    disabled={index === 0}
                    onClick={() => onMoveSection(section.id, "up")}
                  >
                    <ArrowUp size={13} />
                  </button>
                  <button
                    type="button"
                    className="site-studio__icon-btn"
                    title="Bajar"
                    disabled={index === sections.length - 1}
                    onClick={() => onMoveSection(section.id, "down")}
                  >
                    <ArrowDown size={13} />
                  </button>
                  <button
                    type="button"
                    className="site-studio__icon-btn"
                    title={inNav ? "Ocultar de nav" : "Mostrar en nav"}
                    onClick={() => onToggleNav(section.id)}
                  >
                    {inNav ? <Eye size={13} /> : <EyeOff size={13} />}
                  </button>
                  <button
                    type="button"
                    className="site-studio__icon-btn"
                    title="Duplicar"
                    onClick={() => onDuplicateSection(section.id)}
                  >
                    <Copy size={13} />
                  </button>
                  <button
                    type="button"
                    className="site-studio__icon-btn site-studio__icon-btn--danger"
                    title="Eliminar"
                    onClick={() => onRemoveSection(section.id)}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="site-studio__rail-foot">
        <button
          type="button"
          className={`site-studio__page-btn${pageSelected ? " is-selected" : ""}`}
          onClick={onSelectPage}
        >
          <FileText size={14} aria-hidden />
          Página
        </button>
        <button
          type="button"
          className="site-studio__add-btn"
          onClick={() => setPickerOpen((open) => !open)}
          aria-expanded={pickerOpen}
        >
          <Plus size={14} aria-hidden />
          Sección
        </button>
        {pickerOpen ? (
          <div className="site-studio__preset-picker" role="menu">
            {SITE_FACTORY_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                role="menuitem"
                className="site-studio__preset-option"
                onClick={() => {
                  onAddSection(preset.id);
                  setPickerOpen(false);
                }}
              >
                <span className="site-studio__preset-label">{preset.label}</span>
                <span className="site-studio__preset-desc">{preset.description}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </aside>
  );
}
