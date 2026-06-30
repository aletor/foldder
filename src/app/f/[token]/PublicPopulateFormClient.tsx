"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Loader2, Sparkles, Users } from "lucide-react";
import type { PublicPopulateShareRecord } from "@/lib/populate-share-types";
import { normalizePopulateShareTemplates } from "@/lib/populate-share-types";
import type { PopulateGalleryItem } from "@/lib/populate-live-export-types";
import { freezeDesignerPagesForForm } from "@/app/spaces/loop/loop-designer-form";
import {
  resolvePopulateSlotValuesFromSnapshot,
  resolvePublicPopulateEntities,
} from "@/app/spaces/populate/populate-designer-form";
import {
  PopulatePoseGrid,
  PopulateRecordGrid,
  PopulateTextPreviews,
} from "@/app/spaces/populate/PopulateEntityPickers";
import {
  fieldImageUrl,
  poseOptionsVisual,
  recordThumbFromValues,
  textAtSnapshotRow,
} from "@/app/spaces/populate/populate-row-preview";
import {
  DesignerHeadlessRasterPortal,
  type DesignerHeadlessRasterRequest,
} from "@/app/spaces/designer/DesignerHeadlessRasterPortal";
import "../populate-public-form.css";

type Props = { initial: PublicPopulateShareRecord };

type GeneratedSlide = {
  pageId: string;
  slideIndex: number;
  dataUrl: string;
  templateNodeId: string;
  templateLabel: string;
};

type ResultItem = {
  key: string;
  previewUrl: string;
  downloadUrl: string;
  name?: string;
};

export function PublicPopulateFormClient({ initial }: Props) {
  const templates = useMemo(
    () => normalizePopulateShareTemplates(initial.payload),
    [initial.payload],
  );
  const [activeTemplateId, setActiveTemplateId] = useState(templates[0]?.templateNodeId ?? "");
  const activeEntry = templates.find((t) => t.templateNodeId === activeTemplateId) ?? templates[0];

  const [pickedRows, setPickedRows] = useState<Record<string, string>>({});
  const [pickedPoses, setPickedPoses] = useState<Record<string, string>>({});
  const [manualValues, setManualValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<ResultItem[]>([]);
  const [gallery, setGallery] = useState<PopulateGalleryItem[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rasterReq, setRasterReq] = useState<DesignerHeadlessRasterRequest | null>(null);
  const rasterRef = React.useRef<{
    resolve: (m: Record<string, string>) => void;
    reject: (e: Error) => void;
    collected: Record<string, string>;
  } | null>(null);

  const formModel = activeEntry?.formModel;
  const rowsSnapshot = initial.payload.rowsSnapshot;
  const matchLabel = initial.matchLabel?.trim() || initial.payload.title;

  const thumbForCard = useCallback(
    (cardId: string) => {
      const row = rowsSnapshot.find((r) => r.cardId === cardId);
      return recordThumbFromValues(row?.values, []);
    },
    [rowsSnapshot],
  );

  const refreshGallery = useCallback(async () => {
    setGalleryLoading(true);
    try {
      const res = await fetch(`/api/populate-share/${initial.token}/gallery`);
      if (res.status === 410 || res.status === 404) {
        setGallery([]);
        return;
      }
      if (!res.ok) return;
      const data = (await res.json()) as { items?: PopulateGalleryItem[] };
      if (Array.isArray(data.items)) setGallery(data.items);
    } catch {
      /* ignore poll errors */
    } finally {
      setGalleryLoading(false);
    }
  }, [initial.token]);

  useEffect(() => {
    if (templates.length && !templates.some((t) => t.templateNodeId === activeTemplateId)) {
      setActiveTemplateId(templates[0]!.templateNodeId);
    }
  }, [activeTemplateId, templates]);

  useEffect(() => {
    void fetch("/api/populate-share/visit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: initial.token }),
    });
  }, [initial.token]);

  useEffect(() => {
    void refreshGallery();
    const id = window.setInterval(() => void refreshGallery(), 12_000);
    return () => window.clearInterval(id);
  }, [refreshGallery]);

  const rasterize = useCallback(
    (pages: DesignerHeadlessRasterRequest["pages"], pageIds: string[], key: string) =>
      new Promise<Record<string, string>>((resolve, reject) => {
        rasterRef.current = { resolve, reject, collected: {} };
        setRasterReq({
          requestId: Date.now(),
          instanceKey: `pub_pop_${initial.token}_${key}`,
          pages,
          targetPageIds: pageIds,
        });
      }),
    [initial.token],
  );

  const emitSlide = useCallback(
    async (slide: GeneratedSlide) => {
      const res = await fetch(`/api/populate-share/${initial.token}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dataUrl: slide.dataUrl,
          provenance: {
            templateNodeId: slide.templateNodeId,
            templateLabel: slide.templateLabel,
            pageId: slide.pageId,
            slideIndex: slide.slideIndex,
            pickedRows,
            pickedPoses,
            manualValues,
          },
        }),
      });
      const data = (await res.json()) as { item?: PopulateGalleryItem; error?: string };
      if (!res.ok) {
        throw new Error(data.error?.trim() || `Error al guardar (${res.status})`);
      }
      return data.item;
    },
    [initial.token, manualValues, pickedPoses, pickedRows],
  );

  const generateOne = useCallback(
    async (entry: (typeof templates)[number]): Promise<GeneratedSlide[]> => {
      const resolved = resolvePopulateSlotValuesFromSnapshot({
        binding: entry.binding,
        listId: initial.payload.listId,
        rowsSnapshot,
        pickedRows,
        manualValues,
        pickedPoses,
      });
      const pages = freezeDesignerPagesForForm(entry.pages, resolved);
      const urls = await rasterize(pages, pages.map((p) => p.id), entry.templateNodeId);
      return pages
        .map((page, slideIndex) => ({
          pageId: page.id,
          slideIndex,
          dataUrl: urls[page.id] ?? "",
          templateNodeId: entry.templateNodeId,
          templateLabel: entry.templateLabel,
        }))
        .filter((slide) => slide.dataUrl.length > 0);
    },
    [initial.payload.listId, manualValues, pickedPoses, pickedRows, rasterize, rowsSnapshot],
  );

  const persistSlides = useCallback(
    async (slides: GeneratedSlide[]): Promise<{ items: ResultItem[]; error?: string }> => {
      const out: ResultItem[] = [];
      let lastError: string | undefined;
      for (const slide of slides) {
        const fallbackKey = `${slide.templateNodeId}_${slide.pageId}_${slide.slideIndex}`;
        out.push({
          key: fallbackKey,
          previewUrl: slide.dataUrl,
          downloadUrl: slide.dataUrl,
          name: slide.templateLabel,
        });
        try {
          const item = await emitSlide(slide);
          if (item?.viewUrl) {
            out[out.length - 1] = {
              key: item.exportId,
              previewUrl: item.thumbUrl ?? item.viewUrl,
              downloadUrl: item.viewUrl,
              name: item.name,
            };
          }
        } catch (e) {
          lastError = e instanceof Error ? e.message : "No se pudo guardar la pieza";
        }
      }
      await refreshGallery();
      return { items: out, error: lastError };
    },
    [emitSlide, refreshGallery],
  );

  const onGenerate = useCallback(async () => {
    if (!activeEntry) return;
    setBusy(true);
    setError(null);
    setResults([]);
    try {
      const slides = await generateOne(activeEntry);
      const { items, error: persistError } = await persistSlides(slides);
      setResults(items);
      if (persistError) setError(persistError);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al generar");
    } finally {
      setBusy(false);
    }
  }, [activeEntry, generateOne, persistSlides]);

  const onGenerateAll = useCallback(async () => {
    setBusy(true);
    setError(null);
    setResults([]);
    try {
      const allSlides: GeneratedSlide[] = [];
      for (const entry of templates) {
        allSlides.push(...(await generateOne(entry)));
      }
      const { items, error: persistError } = await persistSlides(allSlides);
      setResults(items);
      if (persistError) setError(persistError);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al generar");
    } finally {
      setBusy(false);
    }
  }, [generateOne, persistSlides, templates]);

  if (!activeEntry || !formModel) {
    return <div className="populate-public-empty">Formulario no configurado.</div>;
  }

  const entities = resolvePublicPopulateEntities(formModel);
  const binding = activeEntry.binding;

  return (
    <div className="populate-public">
      <div className="populate-public__inner">
        <header className="populate-public__header">
          <h1>{initial.payload.title}</h1>
          <p className="populate-public__lead">
            {matchLabel ? (
              <>
                <span className="populate-public__match">{matchLabel}</span>
                {" · "}
              </>
            ) : null}
            Elige cada jugador — verás su nombre e imágenes reales del Dataset.
          </p>
        </header>

        {templates.length > 1 ? (
          <div className="populate-public-templates">
            {templates.map((t) => (
              <button
                key={t.templateNodeId}
                type="button"
                className={`populate-public-template-chip${
                  t.templateNodeId === activeTemplateId ? " is-active" : ""
                }`}
                onClick={() => setActiveTemplateId(t.templateNodeId)}
              >
                {t.templateLabel}
              </button>
            ))}
          </div>
        ) : null}

        <ul className="populate-public-entities">
          {entities.map((entity) => {
            const manualFacets = entity.facets.filter((f) => f.sourceKind === "manual");
            const datasetFacets = entity.facets.filter((f) => f.sourceKind === "dataset");
            const pickedCardId = pickedRows[entity.pickId] ?? "";
            const poseFieldId =
              pickedPoses[entity.entityId] ??
              entity.poseFieldId ??
              entity.poseOptions[0]?.fieldId ??
              "";

            const textPreviewItems = datasetFacets
              .filter((f) => f.kind === "text")
              .map((facet) => {
                const src = binding.sources[facet.slotKey];
                const fieldId =
                  binding.slotColumns[facet.slotKey]?.fieldId ??
                  (src?.kind === "dataset" ? src.columnFieldId : undefined);
                return {
                  label: facet.label,
                  text: pickedCardId && fieldId ? textAtSnapshotRow(rowsSnapshot, pickedCardId, fieldId) : "",
                };
              });

            const poseLabels = Object.fromEntries(
              entity.poseOptions.map((o) => [o.fieldId, o.label]),
            );

            return (
              <li key={entity.entityId} className="populate-public-entity">
                <div className="populate-public-entity__head">
                  <Users size={16} className="populate-public-entity__icon" aria-hidden />
                  <h2 className="populate-public-entity__title">{entity.label}</h2>
                </div>

                {datasetFacets.length > 0 ? (
                  <>
                    <PopulateRecordGrid
                      label="Jugador"
                      variant="public"
                      options={entity.options}
                      value={pickedCardId}
                      onChange={(cardId) =>
                        setPickedRows((p) => ({ ...p, [entity.pickId]: cardId }))
                      }
                      thumbForOption={thumbForCard}
                    />

                    {pickedCardId ? (
                      <>
                        <PopulateTextPreviews variant="public" items={textPreviewItems} />
                        <PopulatePoseGrid
                          label="Pose / imagen"
                          variant="public"
                          value={poseFieldId}
                          onChange={(fieldId) =>
                            setPickedPoses((p) => ({ ...p, [entity.entityId]: fieldId }))
                          }
                          options={poseOptionsVisual({
                            schema: [],
                            imageFieldIds: entity.poseOptions.map((o) => o.fieldId),
                            cardId: pickedCardId,
                            rowsSnapshot,
                            fieldLabels: poseLabels,
                          })}
                        />
                        {entity.poseOptions.length <= 1 && poseFieldId ? (
                          <div className="populate-public-single-image">
                            {(() => {
                              const row = rowsSnapshot.find((r) => r.cardId === pickedCardId);
                              const url = fieldImageUrl(row?.values[poseFieldId]);
                              return url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={url} alt="" className="populate-public-single-image__img" />
                              ) : null;
                            })()}
                          </div>
                        ) : null}
                      </>
                    ) : null}
                  </>
                ) : null}

                {manualFacets.map((f) => (
                  <label key={f.slotKey} className="populate-public-field">
                    <span className="populate-public-field__label">
                      {f.label} ({f.kind})
                    </span>
                    <input
                      className="populate-public-input"
                      value={manualValues[f.slotKey] ?? ""}
                      onChange={(e) => setManualValues((m) => ({ ...m, [f.slotKey]: e.target.value }))}
                    />
                  </label>
                ))}
              </li>
            );
          })}
        </ul>

        {error ? <p className="populate-public-error">{error}</p> : null}

        <div className="populate-public-actions">
          <button
            type="button"
            disabled={busy}
            onClick={() => void onGenerate()}
            className="populate-public-btn populate-public-btn--primary"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {templates.length > 1 ? `Generar · ${activeEntry.templateLabel}` : "Generar"}
          </button>
          {templates.length > 1 ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void onGenerateAll()}
              className="populate-public-btn populate-public-btn--secondary"
            >
              Generar todas
            </button>
          ) : null}
        </div>

        {results.length > 0 ? (
          <section className="populate-public-results">
            <h2 className="populate-public-results__title">Recién generado</h2>
            <div className="populate-public-results__grid">
              {results.map((item) => (
                <div key={item.key} className="populate-public-result">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.previewUrl} alt="" />
                  <a href={item.downloadUrl} download className="populate-public-result__download">
                    <Download size={12} /> PNG
                  </a>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className="populate-public-gallery">
          <div className="populate-public-gallery__head">
            <h2 className="populate-public-gallery__title">Galería · {matchLabel}</h2>
            {galleryLoading ? <Loader2 size={14} className="animate-spin" aria-hidden /> : null}
          </div>
          {gallery.length === 0 ? (
            <p className="populate-public-gallery__empty">Aún no hay piezas en esta galería.</p>
          ) : (
            <div className="populate-public-gallery__grid">
              {gallery.map((item) => (
                <div key={item.exportId} className="populate-public-result">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.thumbUrl ?? item.viewUrl} alt="" />
                  <a href={item.viewUrl} download className="populate-public-result__download">
                    <Download size={12} /> PNG
                  </a>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {rasterReq ? (
        <DesignerHeadlessRasterPortal
          request={rasterReq}
          onPage={(pageId, dataUrl) => {
            if (rasterRef.current) rasterRef.current.collected[pageId] = dataUrl;
          }}
          onDone={() => {
            const ref = rasterRef.current;
            rasterRef.current = null;
            setRasterReq(null);
            ref?.resolve(ref.collected);
          }}
          onError={(err) => {
            const ref = rasterRef.current;
            rasterRef.current = null;
            setRasterReq(null);
            ref?.reject(err);
          }}
        />
      ) : null}
    </div>
  );
}
