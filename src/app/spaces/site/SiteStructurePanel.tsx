"use client";

import React, { useEffect, useRef, useState } from "react";
import { Bookmark, Eye, EyeOff, GripVertical, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { SITE_FACTORY_PRESETS } from "@/lib/site/site-presets";
import { siteSectionPreviewLine } from "@/lib/site/site-section-preview";
import type { Block, SiteFactoryPresetId, SitePage, SiteSectionLibraryEntry } from "@/lib/site/site-types";

function SectionMenu({
  sectionId,
  inNav,
  onRename,
  onDuplicate,
  onSaveLibrary,
  onToggleNav,
  onRemove,
}: {
  sectionId: string;
  inNav: boolean;
  onRename: () => void;
  onDuplicate: () => void;
  onSaveLibrary: () => void;
  onToggleNav: () => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="site-editor-section-menu" ref={ref}>
      <button
        type="button"
        className="site-editor-section-menu__trigger"
        aria-label="Más acciones"
        onClick={() => setOpen((v) => !v)}
      >
        <MoreHorizontal size={14} />
      </button>
      {open ? (
        <div className="site-editor-section-menu__dropdown" role="menu">
          <button type="button" role="menuitem" onClick={() => { setOpen(false); onRename(); }}>
            Renombrar
          </button>
          <button type="button" role="menuitem" onClick={() => { setOpen(false); onDuplicate(); }}>
            Duplicar
          </button>
          <button type="button" role="menuitem" onClick={() => { setOpen(false); onSaveLibrary(); }}>
            Guardar en librería
          </button>
          <button type="button" role="menuitem" onClick={() => { setOpen(false); onToggleNav(); }}>
            {inNav ? "Ocultar del nav" : "Mostrar en nav"}
          </button>
          <button type="button" role="menuitem" className="is-danger" onClick={() => { setOpen(false); onRemove(); }}>
            Eliminar
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function SiteStructurePanel({
  pages,
  activePageId,
  sections,
  sectionLabels,
  navInclude,
  selectedSectionId,
  sectionLibrary,
  onClose,
  onSelectSitePage,
  onAddSitePage,
  onRemoveSitePage,
  onSelectSection,
  onAddSection,
  onDuplicateSection,
  onRemoveSection,
  onToggleNav,
  onRenameSection,
  onReorderSections,
  onSaveSectionToLibrary,
  onAddSectionFromLibrary,
  onRemoveLibraryEntry,
  onSelectPageSettings,
}: {
  pages: SitePage[];
  activePageId: string;
  sections: Block[];
  sectionLabels: Record<string, string>;
  navInclude: string[];
  selectedSectionId: string | null;
  sectionLibrary: SiteSectionLibraryEntry[];
  onClose: () => void;
  onSelectSitePage: (pageId: string) => void;
  onAddSitePage: () => void;
  onRemoveSitePage: (pageId: string) => void;
  onSelectSection: (id: string) => void;
  onAddSection: (presetId: SiteFactoryPresetId) => void;
  onDuplicateSection: (id: string) => void;
  onRemoveSection: (id: string) => void;
  onToggleNav: (id: string) => void;
  onRenameSection: (id: string, label: string) => void;
  onReorderSections: (dragId: string, dropId: string) => void;
  onSaveSectionToLibrary: (sectionId: string) => void;
  onAddSectionFromLibrary: (entryId: string) => void;
  onRemoveLibraryEntry: (entryId: string) => void;
  onSelectPageSettings: () => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [dragSectionId, setDragSectionId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!selectedSectionId || !listRef.current) return;
    listRef.current.querySelector(`[data-section-row-id="${selectedSectionId}"]`)?.scrollIntoView({
      block: "nearest",
      behavior: "smooth",
    });
  }, [selectedSectionId]);

  const pageLabel = (page: SitePage, index: number) => page.seo.title.trim() || `Página ${index + 1}`;

  return (
    <>
      <button type="button" className="site-editor-overlay-backdrop" aria-label="Cerrar estructura" onClick={onClose} />
      <aside className="site-editor-structure-panel" data-foldder-studio-panel aria-label="Estructura">
        <header className="site-editor-structure-panel__head">
          <h2 className="site-editor-structure-panel__title">Estructura</h2>
          <button type="button" className="site-editor-structure-panel__close" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </header>

        <div className="site-editor-structure-panel__pages">
          <select
            className="site-editor-popover__input"
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
          <button type="button" className="site-editor-structure-panel__mini-btn" title="Nueva página" onClick={onAddSitePage}>
            <Plus size={14} />
          </button>
          {pages.length > 1 ? (
            <button
              type="button"
              className="site-editor-structure-panel__mini-btn is-danger"
              title="Eliminar página"
              onClick={() => onRemoveSitePage(activePageId)}
            >
              <Trash2 size={14} />
            </button>
          ) : null}
          <button type="button" className="site-editor-structure-panel__mini-btn" title="Ajustes de página" onClick={onSelectPageSettings}>
            ⚙
          </button>
        </div>

        <div className="site-editor-structure-panel__list" ref={listRef}>
          {sections.length === 0 ? (
            <p className="site-editor-structure-panel__empty">Añade una sección para componer la página.</p>
          ) : (
            sections.map((section, index) => {
              const label = sectionLabels[section.id] ?? `Sección ${index + 1}`;
              const inNav = navInclude.includes(section.id);
              const isSelected = selectedSectionId === section.id;
              const previewLine = siteSectionPreviewLine(section);
              return (
                <div
                  key={section.id}
                  data-section-row-id={section.id}
                  className={`site-editor-structure-row${isSelected ? " is-selected" : ""}${dragSectionId === section.id ? " is-dragging" : ""}`}
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
                  <span
                    className="site-editor-structure-row__grip"
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData("text/site-section-id", section.id);
                      setDragSectionId(section.id);
                    }}
                    onDragEnd={() => setDragSectionId(null)}
                    title="Arrastrar"
                  >
                    <GripVertical size={14} />
                  </span>
                  <button
                    type="button"
                    className="site-editor-structure-row__main"
                    onClick={() => onSelectSection(section.id)}
                  >
                    <span className="site-editor-structure-row__thumb" aria-hidden>
                      {previewLine.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="site-editor-structure-row__meta">
                      {renamingId === section.id ? (
                        <input
                          autoFocus
                          className="site-editor-structure-row__name-input"
                          defaultValue={label}
                          onBlur={(event) => {
                            onRenameSection(section.id, event.target.value);
                            setRenamingId(null);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") (event.target as HTMLInputElement).blur();
                            if (event.key === "Escape") setRenamingId(null);
                          }}
                          onClick={(event) => event.stopPropagation()}
                        />
                      ) : (
                        <span className="site-editor-structure-row__name">{label}</span>
                      )}
                      <span className="site-editor-structure-row__type">{section.type}</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className={`site-editor-structure-row__vis${inNav ? " is-visible" : ""}`}
                    title={inNav ? "Visible en nav" : "Oculta en nav"}
                    onClick={() => onToggleNav(section.id)}
                  >
                    {inNav ? <Eye size={14} /> : <EyeOff size={14} />}
                  </button>
                  <SectionMenu
                    sectionId={section.id}
                    inNav={inNav}
                    onRename={() => setRenamingId(section.id)}
                    onDuplicate={() => onDuplicateSection(section.id)}
                    onSaveLibrary={() => onSaveSectionToLibrary(section.id)}
                    onToggleNav={() => onToggleNav(section.id)}
                    onRemove={() => onRemoveSection(section.id)}
                  />
                </div>
              );
            })
          )}
        </div>

        <footer className="site-editor-structure-panel__foot">
          <div className="site-editor-structure-panel__add-wrap">
            <button type="button" className="site-editor-structure-panel__add" onClick={() => setPickerOpen((v) => !v)}>
              <Plus size={14} />
              Añadir sección
            </button>
            {pickerOpen ? (
              <div className="site-editor-structure-panel__picker" role="menu">
                {SITE_FACTORY_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    role="menuitem"
                    className="site-editor-structure-panel__picker-item"
                    onClick={() => {
                      onAddSection(preset.id);
                      setPickerOpen(false);
                    }}
                  >
                    <span className="site-editor-structure-panel__picker-label">{preset.label}</span>
                    <span className="site-editor-structure-panel__picker-desc">{preset.description}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <button type="button" className="site-editor-structure-panel__secondary" onClick={() => setLibraryOpen((v) => !v)}>
            <Bookmark size={14} />
            Librería
          </button>
          {libraryOpen ? (
            <div className="site-editor-structure-panel__library">
              {(sectionLibrary ?? []).length === 0 ? (
                <p className="site-editor-structure-panel__empty">Sin secciones guardadas.</p>
              ) : (
                sectionLibrary.map((entry) => (
                  <div key={entry.id} className="site-editor-structure-panel__library-row">
                    <button type="button" onClick={() => onAddSectionFromLibrary(entry.id)}>
                      {entry.label}
                    </button>
                    <button type="button" className="is-danger" onClick={() => onRemoveLibraryEntry(entry.id)}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))
              )}
            </div>
          ) : null}
        </footer>
      </aside>
    </>
  );
}

export function SiteStructureRail({
  sections,
  selectedSectionId,
  structureOpen,
  onToggleStructure,
  onSelectSection,
  onAddSectionQuick,
}: {
  sections: Block[];
  selectedSectionId: string | null;
  structureOpen: boolean;
  onToggleStructure: () => void;
  onSelectSection: (id: string) => void;
  onAddSectionQuick: () => void;
}) {
  return (
    <nav className="site-editor-rail" aria-label="Estructura rápida">
      <button
        type="button"
        className={`site-editor-rail__btn${structureOpen ? " is-active" : ""}`}
        title="Estructura"
        onClick={onToggleStructure}
      >
        ☰
      </button>
      <div className="site-editor-rail__dots" aria-hidden>
        {sections.map((section) => (
          <button
            key={section.id}
            type="button"
            className={`site-editor-rail__dot${selectedSectionId === section.id ? " is-active" : ""}`}
            title={`Sección ${section.type}`}
            onClick={() => onSelectSection(section.id)}
          />
        ))}
      </div>
      <button type="button" className="site-editor-rail__btn site-editor-rail__btn--add" title="Añadir sección" onClick={onAddSectionQuick}>
        <Plus size={16} />
      </button>
    </nav>
  );
}
