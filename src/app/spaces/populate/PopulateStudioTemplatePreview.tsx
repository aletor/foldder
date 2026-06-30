"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import type { DesignerPageState } from "@/app/spaces/designer/DesignerNode";
import { freezeDesignerPagesForForm } from "@/app/spaces/loop/loop-designer-form";
import { resolvePopulateSlotValues } from "./populate-designer-form";
import type { PopulateDesignerTemplateConfig } from "./populate-designer-template";
import type { PopulateTemplateBinding } from "./populate-types";
import type { Dataset } from "@/app/spaces/dataset/dataset-types";

export type PopulateRasterizePagesFn = (
  pages: DesignerPageState[],
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
  rasterizePages,
}: {
  template: PopulateDesignerTemplateConfig;
  binding: PopulateTemplateBinding;
  dataset: Dataset;
  listId: string;
  previewPickedRows: Record<string, string>;
  previewPickedPoses: Record<string, string>;
  manualValues: Record<string, string>;
  rasterizePages: PopulateRasterizePagesFn;
}) {
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const frozenPages = useMemo(() => {
    const slotValues = resolvePopulateSlotValues({
      binding,
      dataset,
      listId,
      pickedRows: previewPickedRows,
      manualValues,
      pickedPoses: previewPickedPoses,
    });
    return freezeDesignerPagesForForm(template.pages, slotValues);
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

  React.useEffect(() => {
    if (activeSlideIndex >= slideCount && slideCount > 0) {
      setActiveSlideIndex(0);
    }
  }, [activeSlideIndex, slideCount, template.templateNodeId]);

  const previewRevision = useMemo(
    () =>
      JSON.stringify({
        templateNodeId: template.templateNodeId,
        previewPickedRows,
        previewPickedPoses,
        manualValues,
        slotColumns: binding.slotColumns,
        sources: binding.sources,
        labelColumnFieldId: binding.labelColumnFieldId,
        entityPoseColumnFieldId: binding.entityPoseColumnFieldId,
      }),
    [
      binding.entityPoseColumnFieldId,
      binding.labelColumnFieldId,
      binding.slotColumns,
      binding.sources,
      manualValues,
      previewPickedPoses,
      previewPickedRows,
      template.templateNodeId,
    ],
  );

  useEffect(() => {
    if (!activePage) {
      setPreviewUrl(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      void rasterizePages(
        frozenPages,
        [activePage.id],
        `populate-studio-preview:${template.templateNodeId}:${activeSlideIndex}:${previewRevision}`,
      )
        .then((urls) => {
          if (cancelled) return;
          setPreviewUrl(urls[activePage.id] ?? null);
        })
        .catch((err) => {
          if (cancelled) return;
          setPreviewUrl(null);
          setError(err instanceof Error ? err.message : "No se pudo rasterizar la vista previa");
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 320);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      setLoading(false);
    };
  }, [
    activePage,
    activeSlideIndex,
    frozenPages,
    previewRevision,
    rasterizePages,
    template.templateNodeId,
  ]);

  if (slideCount === 0) {
    return (
      <div className="populate-studio-preview-stage">
        <p className="populate-studio-preview-stage__empty">La plantilla no tiene slides.</p>
      </div>
    );
  }

  return (
    <div className="populate-studio-preview-stage nodrag" onPointerDown={(e) => e.stopPropagation()}>
      <div className="populate-studio-preview-stage__head">
        <div>
          <h2 className="populate-studio-preview-stage__title">{template.templateLabel}</h2>
          <p className="populate-studio-preview-stage__subtitle">
            Vista previa en vivo · cambia jugador o pose a la derecha
          </p>
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

      <div className="populate-studio-preview-stage__canvas">
        {loading && !previewUrl ? (
          <div className="populate-studio-preview-stage__loading">
            <Loader2 size={32} className="animate-spin" aria-hidden />
            <span>Actualizando plantilla…</span>
          </div>
        ) : previewUrl ? (
          <>
            {loading ? (
              <div className="populate-studio-preview-stage__loading populate-studio-preview-stage__loading--overlay">
                <Loader2 size={24} className="animate-spin" aria-hidden />
              </div>
            ) : null}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt={`${template.templateLabel} slide ${activeSlideIndex + 1}`}
              className="populate-studio-preview-stage__img"
              draggable={false}
            />
          </>
        ) : (
          <p className="populate-studio-preview-stage__empty">
            {error ?? "Elige un jugador en el panel derecho para ver la plantilla."}
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
