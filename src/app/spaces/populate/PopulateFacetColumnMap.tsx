"use client";

import React from "react";
import { ImageIcon, Type } from "lucide-react";
import type { Dataset, FieldDef } from "@/app/spaces/dataset/dataset-types";
import {
  facetQualifiedLabel,
  type PopulateEntityGroup,
} from "./populate-entity-groups";
import { PopulateImageColumnMosaic } from "./PopulateImageColumnMosaic";
import type { PopulateTemplateBinding } from "./populate-types";

export interface PopulateFacetColumnMapProps {
  entity: PopulateEntityGroup;
  binding: PopulateTemplateBinding;
  textCols: FieldDef[];
  imageCols: FieldDef[];
  onPatchColumn: (slotKey: string, fieldId: string) => void;
  disabled?: boolean;
  dataset?: Dataset;
  listId?: string;
  pickedCardId?: string;
}

export function PopulateFacetColumnMap({
  entity,
  binding,
  textCols,
  imageCols,
  onPatchColumn,
  disabled = false,
  dataset,
  listId,
  pickedCardId = "",
}: PopulateFacetColumnMapProps) {
  const facets = entity.facets;
  if (facets.length === 0) return null;

  return (
    <div className="populate-studio-facet-map">
      <p className="populate-studio-facet-map__title">Conexión al Dataset</p>
      <p className="populate-studio-facet-map__hint">
        Cada hueco del diseño usa una columna de la fila elegida abajo.
      </p>
      <ul className="populate-studio-facet-map__list">
        {facets.map((facet) => {
          const cols = facet.kind === "image" ? imageCols : textCols;
          const col = binding.slotColumns[facet.slotKey];
          const fieldId = col?.fieldId ?? cols[0]?.id ?? "";
          const qualified = facetQualifiedLabel(entity, facet);
          const Icon = facet.kind === "image" ? ImageIcon : Type;

          return (
            <li key={facet.slotKey} className="populate-studio-facet-map__row">
              <span className="populate-studio-facet-map__slot" title={facet.slotKey}>
                <Icon size={12} aria-hidden />
                <code>{qualified}</code>
              </span>
              {cols.length === 0 ? (
                <span className="populate-studio-facet-map__empty">
                  Sin columnas {facet.kind === "image" ? "imagen" : "texto"}
                </span>
              ) : facet.kind === "image" && dataset && listId ? (
                <PopulateImageColumnMosaic
                  columns={cols}
                  valueFieldId={fieldId}
                  onPick={(id) => onPatchColumn(facet.slotKey, id)}
                  dataset={dataset}
                  listId={listId}
                  pickedCardId={pickedCardId}
                />
              ) : (
                <select
                  className="populate-studio-select populate-studio-facet-map__select"
                  value={fieldId}
                  disabled={disabled}
                  onChange={(e) => onPatchColumn(facet.slotKey, e.target.value)}
                >
                  {cols.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </select>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
