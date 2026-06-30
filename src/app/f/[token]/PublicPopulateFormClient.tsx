"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ChevronLeft, ChevronRight, Download, Loader2, Sparkles, X } from "lucide-react";
import type { PublicPopulateShareRecord } from "@/lib/populate-share-types";
import { normalizePopulateShareTemplates } from "@/lib/populate-share-types";
import type { PopulateGalleryItem } from "@/lib/populate-live-export-types";
import { freezePopulateTemplatePages } from "@/app/spaces/populate/populate-slot-layout";
import {
  resolvePopulateSlotValuesFromSnapshot,
  resolvePublicPopulateEntities,
  type PopulateFormEntity,
} from "@/app/spaces/populate/populate-designer-form";
import { PopulatePoseGrid, PopulateRecordGrid } from "@/app/spaces/populate/PopulateEntityPickers";
import { poseOptionsVisual, recordThumbFromValues } from "@/app/spaces/populate/populate-row-preview";
import {
  resolvePopulateShareDefaults,
  POPULATE_PUBLIC_LIVE_PREVIEW_MAX_SIDE,
} from "@/app/spaces/populate/populate-share-defaults";
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

type Screen = "pick-template" | "form";

function PublicPopulatePreview({
  displayUrl,
  loading,
  hasLive,
  backLabel,
  onBack,
  slideCount = 1,
  activeSlideIndex = 0,
  onSlideChange,
}: {
  displayUrl: string | null;
  loading: boolean;
  hasLive: boolean;
  backLabel?: string;
  onBack?: () => void;
  slideCount?: number;
  activeSlideIndex?: number;
  onSlideChange?: (index: number) => void;
}) {
  return (
    <div className="populate-public-preview-stage" aria-label="Resultado final">
      {onBack ? (
        <button type="button" className="populate-public-preview-stage__back" onClick={onBack}>
          <ArrowLeft size={12} aria-hidden />
          {backLabel ?? "Volver"}
        </button>
      ) : null}
      {displayUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={displayUrl}
          alt=""
          className={`populate-public-preview-stage__img${
            loading && !hasLive ? " is-loading" : ""
          }`}
        />
      ) : (
        <div className="populate-public-preview-stage__empty">
          {loading ? <Loader2 size={22} className="animate-spin" aria-hidden /> : null}
        </div>
      )}
      {loading ? (
        <span className="populate-public-preview-stage__badge">
          <Loader2 size={10} className="animate-spin" aria-hidden />
        </span>
      ) : null}
      {slideCount > 1 && onSlideChange ? (
        <div className="populate-public-preview-slides">
          <button
            type="button"
            className="populate-public-preview-slides__btn"
            disabled={activeSlideIndex <= 0}
            onClick={() => onSlideChange(activeSlideIndex - 1)}
            aria-label="Slide anterior"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="populate-public-preview-slides__label">
            Slide {activeSlideIndex + 1} / {slideCount}
          </span>
          <button
            type="button"
            className="populate-public-preview-slides__btn"
            disabled={activeSlideIndex >= slideCount - 1}
            onClick={() => onSlideChange(activeSlideIndex + 1)}
            aria-label="Slide siguiente"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      ) : null}
    </div>
  );
}

function PublicPopulateResultsModal({
  open,
  results,
  onClose,
}: {
  open: boolean;
  results: ResultItem[];
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, open]);

  if (!open || results.length === 0 || typeof document === "undefined") return null;

  return createPortal(
    <div className="populate-public-modal" role="dialog" aria-modal="true" aria-label="Resultado">
      <button
        type="button"
        className="populate-public-modal__backdrop"
        aria-label="Cerrar"
        onClick={onClose}
      />
      <div className="populate-public-modal__panel">
        <div className="populate-public-modal__head">
          <h2>Listo · {results.length} imagen{results.length === 1 ? "" : "es"}</h2>
          <button
            type="button"
            className="populate-public-modal__close"
            onClick={onClose}
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>
        <div className="populate-public-results__grid">
          {results.map((item) => (
            <div key={item.key} className="populate-public-result populate-public-result--modal">
              {item.name ? (
                <span className="populate-public-result__name">{item.name}</span>
              ) : null}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.previewUrl} alt="" />
              <a href={item.downloadUrl} download className="populate-public-result__download">
                <Download size={12} /> PNG
              </a>
            </div>
          ))}
        </div>
        <button type="button" className="populate-public-modal__done" onClick={onClose}>
          Cerrar
        </button>
      </div>
    </div>,
    document.body,
  );
}

function PublicPopulateEntitySlot({
  entity,
  rowsSnapshot,
  pickedRows,
  pickedPoses,
  manualValues,
  manualOpen,
  onToggleManual,
  onPickRow,
  onPickPose,
  onManualChange,
  thumbForCard,
}: {
  entity: PopulateFormEntity;
  rowsSnapshot: Array<{
    cardId: string;
    label: string;
    values: Record<string, import("@/app/spaces/dataset/dataset-types").FieldValue>;
  }>;
  pickedRows: Record<string, string>;
  pickedPoses: Record<string, string>;
  manualValues: Record<string, string>;
  manualOpen: boolean;
  onToggleManual: () => void;
  onPickRow: (cardId: string) => void;
  onPickPose: (fieldId: string) => void;
  onManualChange: (slotKey: string, value: string) => void;
  thumbForCard: (cardId: string) => string | undefined;
}) {
  const manualFacets = entity.facets.filter((f) => f.sourceKind === "manual");
  const datasetFacets = entity.facets.filter((f) => f.sourceKind === "dataset");
  const pickedCardId = pickedRows[entity.pickId] ?? "";
  const poseFieldId =
    pickedPoses[entity.entityId] ??
    entity.poseFieldId ??
    entity.poseOptions[0]?.fieldId ??
    "";
  const poseLabels = Object.fromEntries(entity.poseOptions.map((o) => [o.fieldId, o.label]));
  const poseOptions = poseOptionsVisual({
    schema: [],
    imageFieldIds: entity.poseOptions.map((o) => o.fieldId),
    cardId: pickedCardId,
    rowsSnapshot,
    fieldLabels: poseLabels,
  });
  const hasManualExtras =
    manualFacets.length > 0 || (pickedCardId && entity.poseOptions.length > 1);
  const manualOnly = datasetFacets.length === 0 && manualFacets.length > 0;

  return (
    <div
      className={`populate-public-slot${manualOnly ? " populate-public-slot--manual-only" : ""}`}
    >
      <h3 className="populate-public-slot__title">{entity.label}</h3>

      {datasetFacets.length > 0 ? (
        <PopulateRecordGrid
          label="Elige jugador"
          variant="studio"
          layout="dropdown"
          options={entity.options}
          value={pickedCardId}
          onChange={onPickRow}
          thumbForOption={thumbForCard}
        />
      ) : null}

      {hasManualExtras ? (
        <button
          type="button"
          className={`populate-public-slot__manual-btn${manualOpen ? " is-open" : ""}`}
          onClick={onToggleManual}
        >
          {manualOpen ? "Ocultar manual" : "Editar manual"}
        </button>
      ) : null}

      {(manualOpen || manualOnly) && (
        <div className="populate-public-slot__expand">
          {pickedCardId && entity.poseOptions.length > 1 ? (
            <PopulatePoseGrid
              label="Pose"
              variant="studio"
              value={poseFieldId}
              onChange={onPickPose}
              options={poseOptions}
            />
          ) : null}
          {manualFacets.map((f) => (
            <label key={f.slotKey} className="populate-public-manual-field">
              <span className="populate-public-manual-field__label">{f.label}</span>
              <input
                className="populate-public-input"
                value={manualValues[f.slotKey] ?? ""}
                onChange={(e) => onManualChange(f.slotKey, e.target.value)}
              />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export function PublicPopulateFormClient({ initial }: Props) {
  const templates = useMemo(
    () => normalizePopulateShareTemplates(initial.payload),
    [initial.payload],
  );
  const [screen, setScreen] = useState<Screen>(templates.length > 1 ? "pick-template" : "form");
  const [activeTemplateId, setActiveTemplateId] = useState(templates[0]?.templateNodeId ?? "");
  const activeEntry = templates.find((t) => t.templateNodeId === activeTemplateId) ?? templates[0];

  const [pickedRows, setPickedRows] = useState<Record<string, string>>({});
  const [pickedPoses, setPickedPoses] = useState<Record<string, string>>({});
  const [manualValues, setManualValues] = useState<Record<string, string>>({});
  const [manualOpenByEntity, setManualOpenByEntity] = useState<Record<string, boolean>>({});
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resultsOpen, setResultsOpen] = useState(false);
  const [results, setResults] = useState<ResultItem[]>([]);
  const [gallery, setGallery] = useState<PopulateGalleryItem[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [livePreviewUrl, setLivePreviewUrl] = useState<string | null>(null);
  const [livePreviewBusy, setLivePreviewBusy] = useState(false);
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [rasterReq, setRasterReq] = useState<DesignerHeadlessRasterRequest | null>(null);
  const previewCacheRef = useRef<Map<string, string>>(new Map());
  const rasterRef = React.useRef<{
    resolve: (m: Record<string, string>) => void;
    reject: (e: Error) => void;
    collected: Record<string, string>;
  } | null>(null);

  const formModel = activeEntry?.formModel;
  const rowsSnapshot = initial.payload.rowsSnapshot;
  const matchLabel = initial.matchLabel?.trim() || initial.payload.title;

  const hydrateFromEntry = useCallback((entry: (typeof templates)[number]) => {
    const defaults = resolvePopulateShareDefaults(entry);
    setPickedRows(defaults.pickedRows);
    setPickedPoses(defaults.pickedPoses);
    setManualValues(defaults.manualValues);
    setManualOpenByEntity({});
    setLivePreviewUrl(null);
  }, []);

  useEffect(() => {
    if (templates.length === 1 && templates[0]) {
      hydrateFromEntry(templates[0]);
    }
  }, [hydrateFromEntry, templates]);

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
      /* ignore */
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
    (
      pages: DesignerHeadlessRasterRequest["pages"],
      pageIds: string[],
      key: string,
      opts?: { maxSide?: number; fullResolution?: boolean },
    ) =>
      new Promise<Record<string, string>>((resolve, reject) => {
        if (rasterRef.current) {
          rasterRef.current.reject(new Error("Raster superseded"));
        }
        rasterRef.current = { resolve, reject, collected: {} };
        setRasterReq({
          requestId: Date.now(),
          instanceKey: `pub_pop_${initial.token}_${key}`,
          pages,
          targetPageIds: pageIds,
          maxSide: opts?.maxSide,
          fullResolution: opts?.fullResolution,
        });
      }),
    [initial.token],
  );

  useEffect(() => {
    setActiveSlideIndex(0);
    setLivePreviewUrl(null);
  }, [activeTemplateId]);

  const slideCount = activeEntry?.pages.length ?? 1;

  useEffect(() => {
    if (activeSlideIndex >= slideCount) {
      setActiveSlideIndex(Math.max(0, slideCount - 1));
    }
  }, [activeSlideIndex, slideCount]);

  const frozenHeroUrl =
    activeEntry?.previewHeroUrl ?? activeEntry?.previewThumbUrl ?? null;
  const displayPreviewUrl = livePreviewUrl ?? frozenHeroUrl;

  useEffect(() => {
    if (screen !== "form" || !activeEntry || busy) return;

    const cacheKey = JSON.stringify({
      templateNodeId: activeEntry.templateNodeId,
      activeSlideIndex,
      pickedRows,
      pickedPoses,
      manualValues,
    });
    const cached = previewCacheRef.current.get(cacheKey);
    if (cached) {
      setLivePreviewUrl(cached);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        setLivePreviewBusy(true);
        try {
          const resolved = resolvePopulateSlotValuesFromSnapshot({
            binding: activeEntry.binding,
            listId: initial.payload.listId,
            rowsSnapshot,
            pickedRows,
            manualValues,
            pickedPoses,
          });
          const pages = freezePopulateTemplatePages(
            activeEntry.pages,
            resolved,
            activeEntry.binding.slotLayoutOverrides,
          );
          const safeIndex = Math.min(activeSlideIndex, Math.max(0, pages.length - 1));
          const pageId = pages[safeIndex]?.id ?? pages[0]?.id;
          if (!pageId || cancelled) return;
          const urls = await rasterize(
            pages,
            [pageId],
            `preview_${activeEntry.templateNodeId}_${safeIndex}`,
            { maxSide: POPULATE_PUBLIC_LIVE_PREVIEW_MAX_SIDE },
          );
          if (cancelled) return;
          const url = urls[pageId];
          if (url) {
            previewCacheRef.current.set(cacheKey, url);
            setLivePreviewUrl(url);
          }
        } catch {
          /* preview opcional */
        } finally {
          if (!cancelled) setLivePreviewBusy(false);
        }
      })();
    }, 400);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    activeEntry,
    activeSlideIndex,
    busy,
    initial.payload.listId,
    manualValues,
    pickedPoses,
    pickedRows,
    rasterize,
    rowsSnapshot,
    screen,
  ]);

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
      const pages = freezePopulateTemplatePages(
        entry.pages,
        resolved,
        entry.binding.slotLayoutOverrides,
      );
      const urls = await rasterize(pages, pages.map((p) => p.id), entry.templateNodeId, {
        fullResolution: true,
      });
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
      setResultsOpen(true);
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
      setResultsOpen(true);
      if (persistError) setError(persistError);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al generar");
    } finally {
      setBusy(false);
    }
  }, [generateOne, persistSlides, templates]);

  const selectTemplate = useCallback(
    (templateNodeId: string) => {
      const entry = templates.find((t) => t.templateNodeId === templateNodeId);
      if (!entry) return;
      setActiveTemplateId(templateNodeId);
      hydrateFromEntry(entry);
      setScreen("form");
    },
    [hydrateFromEntry, templates],
  );

  if (!activeEntry || !formModel) {
    return <div className="populate-public-empty">Formulario no configurado.</div>;
  }

  const entities = resolvePublicPopulateEntities(formModel);

  if (screen === "pick-template") {
    return (
      <div className="populate-public populate-public--editor" data-foldder-i18n-ignore>
        <div className="populate-public-pick">
          <p className="populate-public-preview-stage__empty">{matchLabel}</p>
          <div className="populate-public-template-grid">
            {templates.map((t) => (
              <button
                key={t.templateNodeId}
                type="button"
                className="populate-public-template-card"
                onClick={() => selectTemplate(t.templateNodeId)}
              >
                <span className="populate-public-template-card__preview">
                  {t.previewThumbUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.previewThumbUrl} alt="" draggable={false} />
                  ) : (
                    <span className="populate-public-template-card__body">{t.templateLabel}</span>
                  )}
                </span>
                <span className="populate-public-template-card__body">{t.templateLabel}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="populate-public populate-public--editor" data-foldder-i18n-ignore>
      <div className="populate-public-preview-dock">
        <PublicPopulatePreview
          displayUrl={displayPreviewUrl}
          loading={livePreviewBusy}
          hasLive={Boolean(livePreviewUrl)}
          backLabel="Plantillas"
          onBack={templates.length > 1 ? () => setScreen("pick-template") : undefined}
          slideCount={slideCount}
          activeSlideIndex={activeSlideIndex}
          onSlideChange={setActiveSlideIndex}
        />
      </div>

      <div className="populate-public-dock">
        <div className="populate-public-slots">
          {entities.map((entity) => (
            <PublicPopulateEntitySlot
              key={entity.entityId}
              entity={entity}
              rowsSnapshot={rowsSnapshot}
              pickedRows={pickedRows}
              pickedPoses={pickedPoses}
              manualValues={manualValues}
              manualOpen={Boolean(manualOpenByEntity[entity.entityId])}
              onToggleManual={() =>
                setManualOpenByEntity((prev) => ({
                  ...prev,
                  [entity.entityId]: !prev[entity.entityId],
                }))
              }
              onPickRow={(cardId) =>
                setPickedRows((p) => ({ ...p, [entity.pickId]: cardId }))
              }
              onPickPose={(fieldId) =>
                setPickedPoses((p) => ({ ...p, [entity.entityId]: fieldId }))
              }
              onManualChange={(slotKey, value) =>
                setManualValues((m) => ({ ...m, [slotKey]: value }))
              }
              thumbForCard={thumbForCard}
            />
          ))}
        </div>

        {gallery.length > 0 ? (
          <section className="populate-public-gallery">
            <button
              type="button"
              className="populate-public-gallery__toggle"
              onClick={() => setGalleryOpen((o) => !o)}
            >
              {galleryOpen ? "Ocultar galería" : `Galería (${gallery.length})`}
              {galleryLoading ? " …" : ""}
            </button>
            {galleryOpen ? (
              <div className="populate-public-gallery__grid">
                {gallery.map((item) => (
                  <div key={item.exportId} className="populate-public-result">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.thumbUrl ?? item.viewUrl} alt="" />
                    <a href={item.viewUrl} download className="populate-public-result__download">
                      PNG
                    </a>
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        {error ? <p className="populate-public-error">{error}</p> : null}

        <footer className="populate-public-footer">
          <button
            type="button"
            disabled={busy}
            onClick={() => void onGenerate()}
            className="populate-public-footer__generate"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            Generar
          </button>
          {templates.length > 1 ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void onGenerateAll()}
              className="populate-public-footer__secondary"
            >
              Todas
            </button>
          ) : null}
        </footer>
      </div>

      <PublicPopulateResultsModal
        open={resultsOpen}
        results={results}
        onClose={() => setResultsOpen(false)}
      />

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
