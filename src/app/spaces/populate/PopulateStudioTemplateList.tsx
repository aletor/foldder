"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { freezePopulateTemplatePages } from "./populate-slot-layout";
import { bindingForTemplate } from "./populate-designer-binding";
import type { PopulateDesignerTemplateConfig } from "./populate-designer-template";
import { populateStudioTemplateMenuLabel } from "./populate-designer-template";
import { derivePopulateForm, resolvePopulateSlotValues } from "./populate-designer-form";
import type { PopulateTemplateBinding } from "./populate-types";
import type { Dataset } from "@/app/spaces/dataset/dataset-types";
import type { PopulateRasterizePagesFn } from "./PopulateStudioTemplatePreview";

function rasterInstanceKeyForTemplate(templateNodeId: string): string {
  return `pop_tpl_${templateNodeId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

function templatePreviewCacheKey(template: PopulateDesignerTemplateConfig): string {
  return `${template.templateNodeId}:${template.pages.map((p) => p.id).join(",")}`;
}

function defaultPickedRowsForTemplate(
  binding: PopulateTemplateBinding,
  template: PopulateDesignerTemplateConfig,
  dataset: Dataset,
  listId: string,
): Record<string, string> {
  const form = derivePopulateForm({
    binding,
    dynamicFields: template.dynamicFields,
    dataset,
    listId,
    slideCount: template.pages.length,
  });
  const pickedRows: Record<string, string> = {};
  for (const entity of form.entities) {
    const cardId = entity.options[0]?.cardId;
    if (cardId && entity.pickId) pickedRows[entity.pickId] = cardId;
  }
  return pickedRows;
}

export function PopulateStudioTemplateList({
  templates,
  bindings,
  dataset,
  listId,
  activeTemplateNodeId,
  onSelectTemplate,
  rasterizePages,
  rasterBusy = false,
}: {
  templates: PopulateDesignerTemplateConfig[];
  bindings: PopulateTemplateBinding[];
  dataset: Dataset | null;
  listId: string;
  activeTemplateNodeId: string;
  onSelectTemplate: (templateNodeId: string) => void;
  rasterizePages: PopulateRasterizePagesFn;
  /** Evita competir con la rasterización de Generar (un solo portal headless). */
  rasterBusy?: boolean;
}) {
  const [slideUrlsByTemplate, setSlideUrlsByTemplate] = useState<Record<string, string[]>>({});
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  const cacheKeyRef = useRef<Record<string, string>>({});

  const templatesSig = useMemo(
    () =>
      templates
        .map((t) => `${t.templateNodeId}|${t.pages.map((p) => p.id).join(",")}`)
        .join("||"),
    [templates],
  );

  const bindingsSig = useMemo(
    () =>
      bindings
        .map((b) => {
          const slots = Object.entries(b.slotColumns)
            .map(([k, v]) => `${k}:${v.fieldId}`)
            .sort()
            .join(",");
          return `${b.templateNodeId}|${slots}`;
        })
        .sort()
        .join("||"),
    [bindings],
  );

  useEffect(() => {
    if (!dataset || !listId || rasterBusy) return;
    let cancelled = false;

    const orderedTemplates = [
      ...templates.filter((t) => t.templateNodeId === activeTemplateNodeId),
      ...templates.filter((t) => t.templateNodeId !== activeTemplateNodeId),
    ];

    const load = async () => {
      for (const template of orderedTemplates) {
        if (cancelled) return;
        const binding = bindingForTemplate(bindings, template.templateNodeId);
        if (!binding || template.pages.length === 0) continue;

        const cacheKey = templatePreviewCacheKey(template);
        if (cacheKeyRef.current[template.templateNodeId] === cacheKey) continue;

        setLoadingIds((prev) => new Set(prev).add(template.templateNodeId));
        try {
          const pickedRows = defaultPickedRowsForTemplate(binding, template, dataset, listId);
          const slotValues = resolvePopulateSlotValues({
            binding,
            dataset,
            listId,
            pickedRows,
            manualValues: {},
            pickedPoses: binding.entityPoseColumnFieldId,
          });
          const pages = freezePopulateTemplatePages(
            template.pages,
            slotValues,
            binding.slotLayoutOverrides,
          );
          const rasterAllSlides = template.templateNodeId === activeTemplateNodeId;
          const pageIds = rasterAllSlides
            ? pages.map((p) => p.id)
            : pages.slice(0, 1).map((p) => p.id);
          const urls = await rasterizePages(
            pages,
            pageIds,
            rasterInstanceKeyForTemplate(template.templateNodeId),
          );
          if (cancelled) return;
          const ordered = pageIds.map((pid) => urls[pid]).filter((u): u is string => Boolean(u));
          if (ordered.length === 0) continue;
          cacheKeyRef.current[template.templateNodeId] = cacheKey;
          setSlideUrlsByTemplate((prev) => ({ ...prev, [template.templateNodeId]: ordered }));
        } catch {
          /* preview opcional */
        } finally {
          if (!cancelled) {
            setLoadingIds((prev) => {
              const next = new Set(prev);
              next.delete(template.templateNodeId);
              return next;
            });
          }
        }
      }
    };

    const deferTimer = window.setTimeout(() => {
      void load();
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(deferTimer);
    };
  }, [activeTemplateNodeId, bindingsSig, dataset, listId, rasterBusy, rasterizePages, templatesSig]);

  return (
    <ul className="populate-studio-template-list">
      {templates.map((t, index) => {
        const active = t.templateNodeId === activeTemplateNodeId;
        const slides = slideUrlsByTemplate[t.templateNodeId] ?? [];
        const loading = loadingIds.has(t.templateNodeId);
        const slideCount = Math.max(1, t.pages.length);
        const menuLabel = populateStudioTemplateMenuLabel(index, t);

        return (
          <li key={t.templateNodeId}>
            <button
              type="button"
              className={`populate-studio-template-chip nodrag${active ? " is-active" : ""}`}
              onClick={() => onSelectTemplate(t.templateNodeId)}
              title={menuLabel}
            >
              <span className="populate-studio-template-chip__preview" aria-hidden>
                {loading && slides.length === 0 ? (
                  <span className="populate-studio-template-chip__loading">
                    <Loader2 size={16} className="animate-spin" />
                  </span>
                ) : slides.length > 0 ? (
                  slides.map((url, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={`${t.templateNodeId}-${i}`}
                      src={url}
                      alt=""
                      className="populate-studio-template-chip__slide"
                      draggable={false}
                    />
                  ))
                ) : (
                  Array.from({ length: slideCount }, (_, i) => (
                    <span key={i} className="populate-studio-template-chip__slide populate-studio-template-chip__slide--empty" />
                  ))
                )}
              </span>
              <span className="populate-studio-template-chip__body">
                <span className="populate-studio-template-chip__label">{menuLabel}</span>
                {t.pages.length > 1 ? (
                  <span className="populate-studio-template-chip__count">{t.pages.length} slides</span>
                ) : null}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
