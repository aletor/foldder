"use client";

import React from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from "lucide-react";
import type { DesignerPageState } from "@/app/spaces/designer/DesignerNode";
import {
  LAYOUT_STEP_PX,
  readPopulateSlotLayoutDefaults,
  type PopulateSlotLayoutDefaults,
} from "./populate-slot-layout";
import type { PopulateSlotLayoutOverride } from "./populate-types";

export function PopulateFacetLayoutControls({
  slotKey,
  kind,
  templatePages,
  override,
  onPatch,
}: {
  slotKey: string;
  kind: "text" | "image";
  templatePages: DesignerPageState[];
  override?: PopulateSlotLayoutOverride;
  onPatch: (patch: Partial<PopulateSlotLayoutOverride>) => void;
}) {
  const defaults = React.useMemo(
    () => readPopulateSlotLayoutDefaults(templatePages, slotKey),
    [slotKey, templatePages],
  );

  if (!defaults) return null;

  const offsetX = override?.offsetX ?? 0;
  const offsetY = override?.offsetY ?? 0;
  const fontSize = override?.fontSize ?? defaults.fontSize ?? 24;

  const nudge = (dx: number, dy: number) => {
    onPatch({
      offsetX: offsetX + dx,
      offsetY: offsetY + dy,
    });
  };

  return (
    <div className="populate-studio-facet-layout nodrag" onPointerDown={(e) => e.stopPropagation()}>
      {kind === "text" ? (
        <label className="populate-studio-facet-layout__slider">
          <span>Tamaño</span>
          <input
            type="range"
            min={Math.max(8, Math.round((defaults.fontSize ?? 24) * 0.4))}
            max={Math.round((defaults.fontSize ?? 24) * 2.5)}
            step={1}
            value={fontSize}
            onChange={(e) => onPatch({ fontSize: Number(e.target.value) })}
          />
          <span className="populate-studio-facet-layout__value">{Math.round(fontSize)}px</span>
        </label>
      ) : null}

      <div className="populate-studio-facet-layout__move">
        <span className="populate-studio-facet-layout__move-label">Posición</span>
        <div className="populate-studio-facet-layout__arrows">
          <button
            type="button"
            className="populate-studio-facet-layout__arrow"
            aria-label="Subir"
            onClick={(e) => {
              e.stopPropagation();
              nudge(0, -LAYOUT_STEP_PX);
            }}
          >
            <ArrowUp size={14} />
          </button>
          <div className="populate-studio-facet-layout__arrows-mid">
            <button
              type="button"
              className="populate-studio-facet-layout__arrow"
              aria-label="Izquierda"
              onClick={(e) => {
                e.stopPropagation();
                nudge(-LAYOUT_STEP_PX, 0);
              }}
            >
              <ArrowLeft size={14} />
            </button>
            <span className="populate-studio-facet-layout__coords">
              {offsetX},{offsetY}
            </span>
            <button
              type="button"
              className="populate-studio-facet-layout__arrow"
              aria-label="Derecha"
              onClick={(e) => {
                e.stopPropagation();
                nudge(LAYOUT_STEP_PX, 0);
              }}
            >
              <ArrowRight size={14} />
            </button>
          </div>
          <button
            type="button"
            className="populate-studio-facet-layout__arrow"
            aria-label="Bajar"
            onClick={(e) => {
              e.stopPropagation();
              nudge(0, LAYOUT_STEP_PX);
            }}
          >
            <ArrowDown size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

export type { PopulateSlotLayoutDefaults };
