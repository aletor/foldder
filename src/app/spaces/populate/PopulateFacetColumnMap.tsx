"use client";

import React, { useState } from "react";
import { ImageIcon, Pencil, Type } from "lucide-react";
import type { DesignerPageState } from "@/app/spaces/designer/DesignerNode";
import type { Dataset, FieldDef } from "@/app/spaces/dataset/dataset-types";
import {
  facetQualifiedLabel,
  type PopulateEntityGroup,
} from "./populate-entity-groups";
import {
  facetSlotDisplayName,
  hasMatchingFacetsElsewhere,
  matchingFacetSlotKeys,
} from "./populate-facet-scope";
import { PopulateFacetLayoutControls } from "./PopulateFacetLayoutControls";
import { PopulateImageColumnMosaic } from "./PopulateImageColumnMosaic";
import type { PopulateSlotLayoutOverride, PopulateTemplateBinding } from "./populate-types";

export type PopulateFacetColumnScope = "entity" | "all";

export interface PopulateFacetColumnMapProps {
  entity: PopulateEntityGroup;
  entities: PopulateEntityGroup[];
  binding: PopulateTemplateBinding;
  templatePages: DesignerPageState[];
  textCols: FieldDef[];
  imageCols: FieldDef[];
  onPatchColumn: (slotKeys: string[], fieldId: string) => void;
  onPatchLayout: (slotKey: string, patch: Partial<PopulateSlotLayoutOverride>) => void;
  onLayoutEditingChange?: (slotKey: string | null) => void;
  layoutEditingSlotKey?: string | null;
  disabled?: boolean;
  dataset?: Dataset;
  listId?: string;
  pickedCardId?: string;
  kindFilter?: "text" | "image";
  compact?: boolean;
}

type PendingColumnChange = {
  slotKey: string;
  fieldId: string;
  facetLabel: string;
  entityLabel: string;
};

export function PopulateFacetColumnMap({
  entity,
  entities,
  binding,
  templatePages,
  textCols,
  imageCols,
  onPatchColumn,
  onPatchLayout,
  onLayoutEditingChange,
  layoutEditingSlotKey = null,
  disabled = false,
  dataset,
  listId,
  pickedCardId = "",
  kindFilter,
  compact = false,
}: PopulateFacetColumnMapProps) {
  const facets = entity.facets.filter((f) => !kindFilter || f.kind === kindFilter);
  const [pendingChange, setPendingChange] = useState<PendingColumnChange | null>(null);

  if (facets.length === 0) return null;

  const requestColumnChange = (facet: (typeof facets)[number], fieldId: string) => {
    const currentId = binding.slotColumns[facet.slotKey]?.fieldId ?? "";
    if (fieldId === currentId) return;

    const hasSiblings = hasMatchingFacetsElsewhere(entities, entity.entityId, facet);
    if (!hasSiblings) {
      onPatchColumn([facet.slotKey], fieldId);
      return;
    }
    setPendingChange({
      slotKey: facet.slotKey,
      fieldId,
      facetLabel: facetSlotDisplayName(facet),
      entityLabel: entity.label,
    });
  };

  const applyPending = (scope: PopulateFacetColumnScope) => {
    if (!pendingChange) return;
    const facet = facets.find((f) => f.slotKey === pendingChange.slotKey);
    if (!facet) {
      setPendingChange(null);
      return;
    }
    const slotKeys =
      scope === "all" ? matchingFacetSlotKeys(entities, facet) : [pendingChange.slotKey];
    onPatchColumn(slotKeys, pendingChange.fieldId);
    setPendingChange(null);
  };

  return (
    <div
      className={`populate-studio-facet-map${compact ? " populate-studio-facet-map--compact" : ""}${kindFilter === "image" ? " populate-studio-facet-map--image-section" : ""}${kindFilter === "text" ? " populate-studio-facet-map--text-section" : ""}`}
    >
      {!compact ? (
        <>
          <p className="populate-studio-facet-map__title">Conexión al Dataset</p>
          <p className="populate-studio-facet-map__hint">
            Cada hueco del diseño usa una columna de la fila elegida abajo.
          </p>
        </>
      ) : null}
      <ul className="populate-studio-facet-map__list">
        {facets.map((facet) => {
          const cols = facet.kind === "image" ? imageCols : textCols;
          const col = binding.slotColumns[facet.slotKey];
          const fieldId = col?.fieldId ?? cols[0]?.id ?? "";
          const qualified = facetQualifiedLabel(entity, facet);
          const Icon = facet.kind === "image" ? ImageIcon : Type;
          const isEditing = layoutEditingSlotKey === facet.slotKey;
          const showPending = pendingChange?.slotKey === facet.slotKey;

          return (
            <li
              key={facet.slotKey}
              className={`populate-studio-facet-map__block${facet.kind === "text" ? " populate-studio-facet-map__block--text" : ""}`}
            >
              <div
                className={
                  facet.kind === "text"
                    ? "populate-studio-facet-map__toolbar populate-studio-facet-map__toolbar--text"
                    : "populate-studio-facet-map__toolbar populate-studio-facet-map__toolbar--image"
                }
              >
                <span className="populate-studio-facet-map__slot" title={facet.slotKey}>
                  <Icon size={11} aria-hidden className="populate-studio-facet-map__icon" />
                  <code>{qualified}</code>
                </span>

                {cols.length === 0 && facet.kind === "text" ? (
                  <span className="populate-studio-facet-map__empty populate-studio-facet-map__empty--inline">
                    Sin columnas texto
                  </span>
                ) : facet.kind === "text" && cols.length > 0 ? (
                  <select
                    className="populate-studio-select populate-studio-facet-map__select populate-studio-facet-map__select--toolbar"
                    value={fieldId}
                    disabled={disabled}
                    onChange={(e) => requestColumnChange(facet, e.target.value)}
                  >
                    {cols.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                ) : null}

                <button
                  type="button"
                  className={`populate-studio-facet-map__edit${isEditing ? " is-active" : ""}`}
                  aria-label={`Editar posición de ${qualified}`}
                  aria-pressed={isEditing}
                  onClick={() => {
                    const next = isEditing ? null : facet.slotKey;
                    onLayoutEditingChange?.(next);
                  }}
                >
                  <Pencil size={11} strokeWidth={2} />
                </button>
              </div>

              {facet.kind === "image" && cols.length === 0 ? (
                <p className="populate-studio-facet-map__empty">Sin columnas imagen</p>
              ) : null}

              {facet.kind === "image" && cols.length > 0 && dataset && listId ? (
                <PopulateImageColumnMosaic
                  columns={cols}
                  valueFieldId={fieldId}
                  onPick={(id) => requestColumnChange(facet, id)}
                  dataset={dataset}
                  listId={listId}
                  pickedCardId={pickedCardId}
                />
              ) : null}

              {showPending ? (
                <div className="populate-studio-facet-scope nodrag">
                  <p className="populate-studio-facet-scope__label">¿Aplicar columna a…?</p>
                  <div className="populate-studio-facet-scope__actions">
                    <button
                      type="button"
                      className="populate-studio-facet-scope__btn populate-studio-facet-scope__btn--all"
                      onClick={() => applyPending("all")}
                    >
                      Todos · {pendingChange.facetLabel}
                    </button>
                    <button
                      type="button"
                      className="populate-studio-facet-scope__btn"
                      onClick={() => applyPending("entity")}
                    >
                      Solo · {pendingChange.entityLabel}
                    </button>
                  </div>
                </div>
              ) : null}

              {isEditing ? (
                <PopulateFacetLayoutControls
                  slotKey={facet.slotKey}
                  kind={facet.kind}
                  templatePages={templatePages}
                  override={binding.slotLayoutOverrides?.[facet.slotKey]}
                  onPatch={(patch) => onPatchLayout(facet.slotKey, patch)}
                />
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
