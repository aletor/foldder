"use client";

import React from "react";
import { Check } from "lucide-react";
import type { FieldDef } from "@/app/spaces/dataset/dataset-types";
import { imageAtCard } from "./populate-row-preview";

export function PopulateImageColumnMosaic({
  columns,
  valueFieldId,
  onPick,
  dataset,
  listId,
  pickedCardId,
}: {
  columns: FieldDef[];
  valueFieldId: string;
  onPick: (fieldId: string) => void;
  dataset: import("@/app/spaces/dataset/dataset-types").Dataset;
  listId: string;
  pickedCardId: string;
}) {
  if (columns.length === 0) {
    return <span className="populate-studio-facet-map__empty">Sin columnas imagen</span>;
  }

  return (
    <ul className="populate-image-column-mosaic nodrag" onPointerDown={(e) => e.stopPropagation()}>
      {columns.map((f) => {
        const selected = valueFieldId === f.id;
        const url = pickedCardId
          ? imageAtCard({ dataset, listId, cardId: pickedCardId, fieldId: f.id })
          : undefined;
        return (
          <li key={f.id}>
            <button
              type="button"
              className={`populate-image-column-mosaic__item${selected ? " is-selected" : ""}`}
              onClick={() => onPick(f.id)}
              title={f.label}
            >
              {url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={url} alt="" className="populate-image-column-mosaic__thumb" draggable={false} />
              ) : (
                <span className="populate-image-column-mosaic__thumb populate-image-column-mosaic__thumb--empty" />
              )}
              <span className="populate-image-column-mosaic__name">{f.label}</span>
              {selected ? <Check size={11} className="populate-image-column-mosaic__check" aria-hidden /> : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
