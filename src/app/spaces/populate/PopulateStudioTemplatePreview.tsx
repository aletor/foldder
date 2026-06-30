"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { freezePopulateTemplatePages } from "./populate-slot-layout";
import { resolvePopulateSlotValues } from "./populate-designer-form";
import type { PopulateDesignerTemplateConfig } from "./populate-designer-template";
import type { PopulateTemplateBinding } from "./populate-types";
import type { Dataset } from "@/app/spaces/dataset/dataset-types";
import { PopulateStudioEntityCanvas } from "./PopulateStudioEntityCanvas";

export type PopulateRasterizePagesFn = (
  pages: import("@/app/spaces/designer/DesignerNode").DesignerPageState[],
  pageIds: string[],
  instanceKey: string,
) => Promise<Record<string, string>>;

export function PopulateStudioTemplatePreview({
  template,
  binding,
  dataset,
  listId,
  previewPickedRows,
  previewPickedPoses,
  manualValues,
  selectedEntityId,
  onSelectEntity,
  entityLabels,
  suppressEntityAnimations = false,
}: {
  template: PopulateDesignerTemplateConfig;
  binding: PopulateTemplateBinding;
  dataset: Dataset;
  listId: string;
  previewPickedRows: Record<string, string>;
  previewPickedPoses: Record<string, string>;
  manualValues: Record<string, string>;
  rasterizePages?: PopulateRasterizePagesFn;
  selectedEntityId: string | null;
  onSelectEntity: (entityId: string | null) => void;
  entityLabels: Map<string, string>;
  suppressEntityAnimations?: boolean;
}) {
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);

  const frozenPages = useMemo(() => {
    const slotValues = resolvePopulateSlotValues({
      binding,
      dataset,
      listId,
      pickedRows: previewPickedRows,
      manualValues,
      pickedPoses: previewPickedPoses,
    });
    return freezePopulateTemplatePages(
      template.pages,
      slotValues,
      binding.slotLayoutOverrides,
    );
  }, [
    binding,
    dataset,
    listId,
    manualValues,
    previewPickedPoses,
    previewPickedRows,
    template.pages,
  ]);

  const slideCount = frozenPages.length;
  const activePage = frozenPages[activeSlideIndex] ?? frozenPages[0];

  useEffect(() => {
    if (activeSlideIndex >= slideCount && slideCount > 0) {
      setActiveSlideIndex(0);
    }
  }, [activeSlideIndex, slideCount, template.templateNodeId]);

  if (slideCount === 0) {
    return (
      <div className="populate-studio-preview">
        <p className="populate-studio-center__empty">La plantilla no tiene slides.</p>
      </div>
    );
  }

  return (
    <div className="populate-studio-preview nodrag" onPointerDown={(e) => e.stopPropagation()}>
      <div className="populate-studio-col__head populate-studio-preview__head">
        <div>
          <span className="populate-studio-col__title">{template.templateLabel}</span>
          <span className="populate-studio-col__hint">
            Haz clic en una carpeta de la plantilla para editarla
          </span>
        </div>
        {slideCount > 1 ? (
          <div className="populate-studio-preview-stage__pager">
            <button
              type="button"
              className="populate-studio-preview-stage__pager-btn"
              disabled={activeSlideIndex <= 0}
              onClick={() => setActiveSlideIndex((i) => Math.max(0, i - 1))}
              aria-label="Slide anterior"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="populate-studio-preview-stage__pager-label">
              Slide {activeSlideIndex + 1} / {slideCount}
            </span>
            <button
              type="button"
              className="populate-studio-preview-stage__pager-btn"
              disabled={activeSlideIndex >= slideCount - 1}
              onClick={() => setActiveSlideIndex((i) => Math.min(slideCount - 1, i + 1))}
              aria-label="Slide siguiente"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        ) : null}
      </div>

      <div className="populate-studio-preview__canvas populate-studio-preview__canvas--interactive">
        {activePage ? (
          <PopulateStudioEntityCanvas
            page={activePage}
            entityLabels={entityLabels}
            selectedEntityId={selectedEntityId}
            onSelectEntity={onSelectEntity}
            suppressEntityAnimations={suppressEntityAnimations}
          />
        ) : (
          <p className="populate-studio-center__empty">
            Elige un jugador en el panel derecho para ver la plantilla.
          </p>
        )}
      </div>

      {slideCount > 1 ? (
        <ul className="populate-studio-preview-stage__dots">
          {frozenPages.map((page, i) => (
            <li key={page.id}>
              <button
                type="button"
                className={`populate-studio-preview-stage__dot${i === activeSlideIndex ? " is-active" : ""}`}
                onClick={() => setActiveSlideIndex(i)}
                aria-label={`Ir al slide ${i + 1}`}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
