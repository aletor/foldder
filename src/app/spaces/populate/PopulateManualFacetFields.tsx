"use client";

import React from "react";
import { ImageIcon, Pencil, Type } from "lucide-react";
import type { DesignerPageState } from "@/app/spaces/designer/DesignerNode";
import {
  facetQualifiedLabel,
  type PopulateEntityFacet,
  type PopulateEntityGroup,
} from "./populate-entity-groups";
import { PopulateFacetLayoutControls } from "./PopulateFacetLayoutControls";
import type { PopulateSlotLayoutOverride, PopulateTemplateBinding } from "./populate-types";

export function PopulateManualFacetFields({
  entity,
  manualValues,
  onManualChange,
  templatePages,
  binding,
  onPatchLayout,
  layoutEditingSlotKey,
  onLayoutEditingChange,
}: {
  entity: PopulateEntityGroup;
  manualValues: Record<string, string>;
  onManualChange: (slotKey: string, value: string) => void;
  templatePages: DesignerPageState[];
  binding: PopulateTemplateBinding;
  onPatchLayout: (slotKey: string, patch: Partial<PopulateSlotLayoutOverride>) => void;
  layoutEditingSlotKey: string | null;
  onLayoutEditingChange: (slotKey: string | null) => void;
}) {
  const textFacets = entity.facets.filter((f) => f.kind === "text");
  const imageFacets = entity.facets.filter((f) => f.kind === "image");

  const renderFacet = (facet: PopulateEntityFacet) => {
    const qualified = facetQualifiedLabel(entity, facet);
    const Icon = facet.kind === "image" ? ImageIcon : Type;
    const isEditing = layoutEditingSlotKey === facet.slotKey;

    return (
      <li key={facet.slotKey} className="populate-studio-facet-map__block">
        <div
          className={`populate-studio-facet-map__toolbar populate-studio-facet-map__toolbar--manual${facet.kind === "text" ? " populate-studio-facet-map__toolbar--text" : " populate-studio-facet-map__toolbar--image"}`}
        >
          <span className="populate-studio-facet-map__slot" title={facet.slotKey}>
            <Icon size={11} aria-hidden className="populate-studio-facet-map__icon" />
            <code>{qualified}</code>
          </span>

          <input
            className="populate-studio-input populate-studio-facet-map__manual-input"
            value={manualValues[facet.slotKey] ?? ""}
            placeholder={facet.kind === "image" ? "URL imagen…" : "Texto…"}
            onChange={(e) => onManualChange(facet.slotKey, e.target.value)}
          />

          <button
            type="button"
            className={`populate-studio-facet-map__edit${isEditing ? " is-active" : ""}`}
            aria-label={`Editar posición de ${qualified}`}
            aria-pressed={isEditing}
            onClick={() => onLayoutEditingChange(isEditing ? null : facet.slotKey)}
          >
            <Pencil size={11} strokeWidth={2} />
          </button>
        </div>

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
  };

  if (entity.facets.length === 0) return null;

  return (
    <div className="populate-studio-facet-map populate-studio-facet-map--compact populate-studio-facet-map--manual">
      {textFacets.length > 0 ? (
        <div className="populate-studio-facet-map--text-section">
          <ul className="populate-studio-facet-map__list">
            {textFacets.map((facet) => renderFacet(facet))}
          </ul>
        </div>
      ) : null}
      {imageFacets.length > 0 ? (
        <div className="populate-studio-facet-map--image-section">
          <ul className="populate-studio-facet-map__list">
            {imageFacets.map((facet) => renderFacet(facet))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
