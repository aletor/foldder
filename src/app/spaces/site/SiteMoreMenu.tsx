"use client";

import React, { useEffect, useRef, useState } from "react";
import type { Block } from "@/lib/site/site-types";
import type { SiteAdvancedInspectorContext } from "./site-editor-ui-types";

export type SiteMoreMenuActionId =
  | "advanced-content"
  | "change-source"
  | "advanced-motion"
  | "advanced-layout"
  | "advanced-collection"
  | "open-inspector"
  | "save-library"
  | "open-structure"
  | "duplicate"
  | "remove";

export function buildMoreMenuActions({
  block,
  isSectionRoot,
  hasLibrary,
}: {
  block: Block;
  isSectionRoot: boolean;
  hasLibrary?: boolean;
}): Array<{ id: SiteMoreMenuActionId; label: string; danger?: boolean; separatorBefore?: boolean }> {
  const items: Array<{ id: SiteMoreMenuActionId; label: string; danger?: boolean; separatorBefore?: boolean }> = [];

  if (block.type === "text") {
    items.push({ id: "advanced-content", label: "Editar contenido avanzado" });
    items.push({ id: "change-source", label: "Cambiar fuente" });
  } else if (block.type === "media") {
    items.push({ id: "advanced-content", label: "Editar media avanzado" });
  } else if (block.type === "button") {
    items.push({ id: "advanced-content", label: "Configurar destino" });
  } else if (block.type === "collection") {
    items.push({ id: "advanced-collection", label: "Editar colección" });
    items.push({ id: "change-source", label: "Configurar Dataset" });
  }

  if (isSectionRoot) {
    items.push({ id: "open-structure", label: "Reordenar sección" });
    if (hasLibrary) items.push({ id: "save-library", label: "Guardar en librería" });
  }

  items.push({ id: "advanced-motion", label: "Ajustes de movimiento" });
  items.push({ id: "open-inspector", label: "Abrir inspector avanzado" });

  if (isSectionRoot) {
    items.push({ id: "duplicate", label: "Duplicar sección", separatorBefore: true });
    items.push({ id: "remove", label: "Eliminar sección", danger: true });
  } else {
    items.push({ id: "duplicate", label: "Duplicar bloque", separatorBefore: true });
  }

  return items;
}

export function moreActionToInspectorContext(action: SiteMoreMenuActionId): SiteAdvancedInspectorContext {
  switch (action) {
    case "change-source":
      return { mode: "focused", tab: "content", part: "source" };
    case "advanced-content":
      return { mode: "focused", tab: "content", part: "body" };
    case "advanced-motion":
      return { mode: "focused", tab: "motion", part: "motion" };
    case "advanced-layout":
    case "advanced-collection":
      return { mode: "focused", tab: "layout", part: "layout" };
    default:
      return { mode: "full" };
  }
}

export function SiteMoreMenu({
  open,
  anchorEl,
  items,
  onSelect,
  onClose,
}: {
  open: boolean;
  anchorEl: HTMLElement | null;
  items: ReturnType<typeof buildMoreMenuActions>;
  onSelect: (action: SiteMoreMenuActionId) => void;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({ visibility: "hidden" });

  useEffect(() => {
    if (!open || !anchorEl) return;
    const rect = anchorEl.getBoundingClientRect();
    const width = 220;
    const left = Math.min(Math.max(8, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - 8);
    setStyle({
      position: "fixed",
      left,
      bottom: window.innerHeight - rect.top + 8,
      width,
      zIndex: 45,
      visibility: "visible",
    });
  }, [anchorEl, open]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target)) return;
      if (anchorEl?.contains(target)) return;
      onClose();
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [anchorEl, onClose, open]);

  if (!open) return null;

  return (
    <div ref={menuRef} className="site-more-menu" style={style} role="menu">
      {items.map((item) => (
        <React.Fragment key={item.id}>
          {item.separatorBefore ? <div className="site-more-menu__sep" role="separator" /> : null}
          <button
            type="button"
            role="menuitem"
            className={`site-more-menu__item${item.danger ? " is-danger" : ""}`}
            onClick={() => {
              onSelect(item.id);
              onClose();
            }}
          >
            {item.label}
          </button>
        </React.Fragment>
      ))}
    </div>
  );
}
