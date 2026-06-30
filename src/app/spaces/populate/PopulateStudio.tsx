"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ChevronDown, Copy, Image as ImageIcon, Loader2, Sparkles, Users } from "lucide-react";
import { FoldderStudioHeader } from "../FoldderStudioHeader";
import type { Dataset } from "@/app/spaces/dataset/dataset-types";
import type { PopulateDesignerTemplateConfig } from "./populate-designer-template";
import {
  groupPendingFieldsIntoEntities,
  imageColumnsInSchema,
  populateEntityUsesLegacyPosePicker,
  populateSlotKeyIsFolderScoped,
  textLikeColumnsInSchema,
} from "./populate-entity-groups";
import { patchEntityPoseColumn, setEntityManualMode } from "./populate-designer-binding";
import type { PopulateTemplateBinding } from "./populate-types";
import { derivePopulateForm } from "./populate-designer-form";
import { PopulateFacetColumnMap } from "./PopulateFacetColumnMap";
import { PopulateStudioTemplateList } from "./PopulateStudioTemplateList";
import {
  PopulatePoseGrid,
  PopulateRecordGrid,
} from "./PopulateEntityPickers";
import { poseOptionsVisual, recordThumbFromValues } from "./populate-row-preview";
import {
  DesignerFormResultsLightbox,
  DesignerFormResultThumb,
} from "../loop/DesignerFormResultsLightbox";
import {
  PopulateRasterizePagesFn,
  PopulateStudioTemplatePreview,
} from "./PopulateStudioTemplatePreview";

const ACCENT = "#9B5DE5";

export interface PopulateStudioGeneratePreview {
  templateNodeId: string;
  pickedRows: Record<string, string>;
  pickedPoses: Record<string, string>;
  manualValues: Record<string, string>;
  /** Inyectar nested space con templates rellenos y editables (además de las PNG). */
  createEditables: boolean;
}

function downloadDataUrl(url: string, name: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export interface PopulateStudioProps {
  nodeLabel: string;
  dataset: Dataset | null;
  listId: string;
  templates: PopulateDesignerTemplateConfig[];
  activeTemplate: PopulateDesignerTemplateConfig;
  activeTemplateNodeId: string;
  onSelectTemplate: (templateNodeId: string) => void;
  binding: PopulateTemplateBinding;
  templateBindings: PopulateTemplateBinding[];
  onClose: () => void;
  onChangeBinding: (next: PopulateTemplateBinding) => void;
  rasterizePages: PopulateRasterizePagesFn;
  onShare?: () => void;
  shareBusy?: boolean;
  shareError?: string | null;
  shareUrl?: string | null;
  onCopyShareUrl?: () => void;
  shareMatchLabel?: string;
  onShareMatchLabelChange?: (value: string) => void;
  projectSaved?: boolean;
  canGenerate?: boolean;
  busy?: boolean;
  progress?: { done: number; total: number } | null;
  generateError?: string | null;
  generateResults?: string[];
  totalSlideCount?: number;
  createEditablesOnGenerate?: boolean;
  onCreateEditablesOnGenerateChange?: (value: boolean) => void;
  onGenerate?: (preview: PopulateStudioGeneratePreview) => void;
}

function isEntityManual(
  binding: PopulateTemplateBinding,
  entityId: string,
  facets: { slotKey: string }[],
): boolean {
  return facets.every((f) => binding.sources[f.slotKey]?.kind === "manual");
}

export function PopulateStudio({
  nodeLabel,
  dataset,
  listId,
  templates,
  activeTemplate,
  activeTemplateNodeId,
  onSelectTemplate,
  binding,
  templateBindings,
  onClose,
  onChangeBinding,
  rasterizePages,
  onShare,
  shareBusy,
  shareError,
  shareUrl,
  onCopyShareUrl,
  shareMatchLabel,
  onShareMatchLabelChange,
  projectSaved = true,
  canGenerate = false,
  busy = false,
  progress = null,
  generateError = null,
  generateResults = [],
  totalSlideCount = 0,
  createEditablesOnGenerate = false,
  onCreateEditablesOnGenerateChange,
  onGenerate,
}: PopulateStudioProps) {
  const list = dataset?.lists.find((l) => l.id === listId);
  const schema = list?.schema ?? [];
  const textCols = useMemo(() => textLikeColumnsInSchema(schema), [schema]);
  const imageCols = useMemo(() => imageColumnsInSchema(schema), [schema]);

  const entities = useMemo(
    () => groupPendingFieldsIntoEntities(activeTemplate.dynamicFields),
    [activeTemplate.dynamicFields],
  );

  const formModel = useMemo(
    () =>
      dataset && listId
        ? derivePopulateForm({
            binding,
            dynamicFields: activeTemplate.dynamicFields,
            dataset,
            listId,
            slideCount: activeTemplate.pages.length,
          })
        : null,
    [activeTemplate.dynamicFields, activeTemplate.pages.length, binding, dataset, listId],
  );

  const [previewPickedRows, setPreviewPickedRows] = useState<Record<string, string>>({});
  const [previewPickedPoses, setPreviewPickedPoses] = useState<Record<string, string>>({});
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [manualValues, setManualValues] = useState<Record<string, string>>({});
  const [configOpen, setConfigOpen] = useState(false);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);

  const entityLabels = useMemo(() => {
    const map = new Map<string, string>();
    for (const entity of entities) {
      map.set(entity.entityId, entity.label);
    }
    return map;
  }, [entities]);

  const visibleEntities = useMemo(
    () =>
      selectedEntityId
        ? entities.filter((entity) => entity.entityId === selectedEntityId)
        : [],
    [entities, selectedEntityId],
  );

  useEffect(() => {
    if (entities.length === 0) {
      setSelectedEntityId(null);
      return;
    }
    setSelectedEntityId((prev) =>
      prev && entities.some((entity) => entity.entityId === prev) ? prev : null,
    );
  }, [entities, activeTemplateNodeId]);

  const progressPct =
    progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  const slideLabel =
    totalSlideCount > 0
      ? `${totalSlideCount} slide${totalSlideCount === 1 ? "" : "s"}`
      : `${activeTemplate.pages.length} slide${activeTemplate.pages.length === 1 ? "" : "s"}`;

  useEffect(() => {
    if (!formModel) return;
    setPreviewPickedRows((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const entity of formModel.entities) {
        if (!next[entity.pickId] && entity.options[0]?.cardId) {
          next[entity.pickId] = entity.options[0]!.cardId;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [formModel, activeTemplateNodeId]);

  useEffect(() => {
    if (!binding.entityPoseColumnFieldId) return;
    setPreviewPickedPoses((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const entity of entities) {
        if (entity.folderLabel) continue;
        const pose = binding.entityPoseColumnFieldId?.[entity.entityId];
        if (pose && next[entity.entityId] !== pose) {
          next[entity.entityId] = pose;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [binding.entityPoseColumnFieldId, entities]);

  const thumbForPreview = useMemo(
    () => (cardId: string) => {
      const card = list?.cards.find((c) => c.id === cardId);
      return recordThumbFromValues(card?.values, schema);
    },
    [list?.cards, schema],
  );

  const patchFacetColumn = (slotKey: string, fieldId: string) => {
    const f = schema.find((x) => x.id === fieldId);
    if (!f || !list) return;
    const src = binding.sources[slotKey];
    const pick = src?.kind === "dataset" ? binding.picks.find((p) => p.id === src.pickId) : undefined;
    const entityId = pick?.entityId;
    const entity = entityId ? entities.find((e) => e.entityId === entityId) : undefined;
    const usesLegacyPose =
      entity && populateEntityUsesLegacyPosePicker(entity, imageCols.length);
    const nextPoseMap = { ...(binding.entityPoseColumnFieldId ?? {}) };
    if (entityId && !usesLegacyPose && !populateSlotKeyIsFolderScoped(slotKey)) {
      delete nextPoseMap[entityId];
    }
    if (entityId && usesLegacyPose && slotKey.endsWith("::image")) {
      nextPoseMap[entityId] = fieldId;
    }
    onChangeBinding({
      ...binding,
      slotColumns: {
        ...binding.slotColumns,
        [slotKey]: { listId, listKey: list.key, fieldId: f.id, fieldKey: f.key },
      },
      sources: {
        ...binding.sources,
        [slotKey]:
          binding.sources[slotKey]?.kind === "dataset"
            ? {
                ...binding.sources[slotKey],
                columnFieldId: f.id,
                columnFieldKey: f.key,
              }
            : (binding.sources[slotKey] ?? { kind: "manual" }),
      },
      entityPoseColumnFieldId:
        Object.keys(nextPoseMap).length > 0 ? nextPoseMap : undefined,
    });
    if (entityId && !usesLegacyPose) {
      setPreviewPickedPoses((prev) => {
        if (!prev[entityId]) return prev;
        const next = { ...prev };
        delete next[entityId];
        return next;
      });
    }
  };

  return (
    <div
      className="populate-studio-root"
      data-foldder-studio-panel
      style={{ "--populate-accent": ACCENT } as React.CSSProperties}
    >
      <FoldderStudioHeader
        nodeType="populate"
        nodeLabel={nodeLabel}
        subtitle="Previsualiza la plantilla real mientras configuras el formulario"
        onClose={onClose}
        actions={
          onShare ? (
            <button
              type="button"
              className="populate-studio-share nodrag"
              disabled={shareBusy}
              onClick={onShare}
            >
              {shareBusy ? "…" : "Compartir formulario"}
            </button>
          ) : null
        }
      />

      <div className="populate-studio-body">
        <aside className="populate-studio-sidebar">
          <p className="populate-studio-sidebar__title">Plantillas ({templates.length}/8)</p>
          {dataset && listId ? (
            <PopulateStudioTemplateList
              templates={templates}
              bindings={templateBindings}
              dataset={dataset}
              listId={listId}
              activeTemplateNodeId={activeTemplateNodeId}
              onSelectTemplate={onSelectTemplate}
              rasterizePages={rasterizePages}
              rasterBusy={busy}
            />
          ) : (
            <ul className="populate-studio-template-list">
              {templates.map((t) => (
                <li key={t.templateNodeId}>
                  <button
                    type="button"
                    className={`populate-studio-template-chip nodrag${t.templateNodeId === activeTemplateNodeId ? " is-active" : ""}`}
                    onClick={() => onSelectTemplate(t.templateNodeId)}
                  >
                    <span className="populate-studio-template-chip__label">{t.templateLabel}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {onShareMatchLabelChange ? (
            <div className="populate-studio-share-match nodrag">
              <p className="populate-studio-sidebar__title">Partido</p>
              <input
                className="populate-studio-input"
                value={shareMatchLabel ?? ""}
                placeholder="Ej. Partido 1 — Lakers vs Bulls"
                onChange={(e) => onShareMatchLabelChange(e.target.value)}
              />
              <p className="populate-studio-hint">
                Las piezas generadas se agrupan bajo este nombre en Foldder y en la galería pública.
              </p>
              {!projectSaved ? (
                <p className="populate-studio-share-error">Guarda el proyecto antes de compartir.</p>
              ) : null}
            </div>
          ) : null}

          {shareUrl ? (
            <div className="populate-studio-share-link nodrag">
              <p className="populate-studio-sidebar__title">Enlace público</p>
              <div className="populate-studio-share-link__row">
                <input
                  className="populate-studio-input"
                  readOnly
                  value={shareUrl}
                  onFocus={(e) => e.target.select()}
                />
                {onCopyShareUrl ? (
                  <button type="button" className="populate-studio-share-copy" onClick={onCopyShareUrl}>
                    <Copy size={14} />
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
          {shareError ? <p className="populate-studio-share-error">{shareError}</p> : null}
        </aside>

        {dataset && listId ? (
          <PopulateStudioTemplatePreview
            template={activeTemplate}
            binding={binding}
            dataset={dataset}
            listId={listId}
            previewPickedRows={previewPickedRows}
            previewPickedPoses={previewPickedPoses}
            manualValues={manualValues}
            rasterizePages={rasterizePages}
            selectedEntityId={selectedEntityId}
            onSelectEntity={setSelectedEntityId}
            entityLabels={entityLabels}
          />
        ) : (
          <div className="populate-studio-preview-stage">
            <p className="populate-studio-preview-stage__empty">Conecta un Dataset para previsualizar.</p>
          </div>
        )}

        <aside className="populate-studio-controls nodrag" onPointerDown={(e) => e.stopPropagation()}>
          <p className="populate-studio-sidebar__title">Formulario</p>
          <p className="populate-studio-hint">
            Haz clic en una carpeta de jugador en la plantilla o elige abajo. Solo verás el panel
            del elemento seleccionado.
          </p>

          {entities.length > 1 ? (
            <ul className="populate-studio-entity-tabs nodrag">
              {entities.map((entity) => (
                <li key={entity.entityId}>
                  <button
                    type="button"
                    className={`populate-studio-entity-tab${selectedEntityId === entity.entityId ? " is-active" : ""}`}
                    onClick={() => setSelectedEntityId(entity.entityId)}
                  >
                    {entity.label}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {entities.length === 0 ? (
            <p className="populate-studio-hint">
              Marca capas dinámicas en el Designer (Modo 2). Agrúpalas en carpetas de capas para
              varios campos de la misma fila (nombre, dorsal, foto…).
            </p>
          ) : !selectedEntityId ? (
            <p className="populate-studio-hint populate-studio-hint--pick">
              Elecciona un elemento
            </p>
          ) : (
            <ul className="populate-studio-control-entities">
              {visibleEntities.map((entity) => {
                const pick =
                  binding.picks.find((p) => p.entityId === entity.entityId) ?? binding.picks[0];
                const manual = isEntityManual(binding, entity.entityId, entity.facets);
                const formEntity = formModel?.entities.find((e) => e.entityId === entity.entityId);
                const pickedCardId = pick?.id ? previewPickedRows[pick.id] ?? "" : "";
                const imageFacets = entity.facets.filter((f) => f.kind === "image");
                const legacyPosePicker = populateEntityUsesLegacyPosePicker(entity, imageCols.length);
                const poseFieldId =
                  previewPickedPoses[entity.entityId] ??
                  binding.entityPoseColumnFieldId?.[entity.entityId] ??
                  binding.slotColumns[imageFacets[0]?.slotKey ?? ""]?.fieldId ??
                  imageCols[0]?.id ??
                  "";

                return (
                  <li
                    key={entity.entityId}
                    className={`populate-studio-control-entity${selectedEntityId === entity.entityId ? " is-selected" : ""}`}
                  >
                    <header className="populate-studio-control-entity__head">
                      <Users size={14} className="populate-studio-entity-card__icon" />
                      <input
                        className="populate-studio-input populate-studio-control-entity__label"
                        value={pick?.label ?? entity.label}
                        placeholder="Etiqueta en formulario"
                        onChange={(e) => {
                          if (!pick) return;
                          onChangeBinding({
                            ...binding,
                            picks: binding.picks.map((p) =>
                              p.id === pick.id ? { ...p, label: e.target.value } : p,
                            ),
                          });
                        }}
                      />
                      <label className="populate-studio-entity-card__manual">
                        <input
                          type="checkbox"
                          checked={manual}
                          onChange={(e) =>
                            onChangeBinding(
                              setEntityManualMode(
                                binding,
                                entity.entityId,
                                e.target.checked,
                                entities,
                              ),
                            )
                          }
                        />
                        Manual
                      </label>
                    </header>

                    {manual ? (
                      <>
                        {entity.facets.map((facet) => (
                          <label key={facet.slotKey} className="populate-studio-control-manual-field">
                            <span>{facet.label}</span>
                            <input
                              className="populate-studio-input"
                              value={manualValues[facet.slotKey] ?? ""}
                              placeholder={facet.kind === "image" ? "URL imagen…" : "Texto…"}
                              onChange={(e) =>
                                setManualValues((m) => ({ ...m, [facet.slotKey]: e.target.value }))
                              }
                            />
                          </label>
                        ))}
                      </>
                    ) : (
                      <>
                        <PopulateFacetColumnMap
                          entity={entity}
                          binding={binding}
                          textCols={textCols}
                          imageCols={imageCols}
                          onPatchColumn={patchFacetColumn}
                          dataset={dataset ?? undefined}
                          listId={listId}
                          pickedCardId={pickedCardId}
                        />

                        {formEntity && formEntity.options.length > 0 ? (
                          <PopulateRecordGrid
                            label="Elegir fila"
                            options={formEntity.options}
                            value={pickedCardId}
                            onChange={(cardId) => {
                              if (!pick?.id) return;
                              setPreviewPickedRows((rows) => ({ ...rows, [pick.id]: cardId }));
                            }}
                            thumbForOption={thumbForPreview}
                            variant="studio"
                            layout="compact"
                          />
                        ) : null}

                        {pickedCardId && legacyPosePicker && dataset ? (
                          <PopulatePoseGrid
                            label="Pose"
                            variant="studio"
                            value={poseFieldId}
                            onChange={(fieldId) => {
                              setPreviewPickedPoses((p) => ({ ...p, [entity.entityId]: fieldId }));
                              const f = schema.find((x) => x.id === fieldId);
                              if (!f || !list) return;
                              onChangeBinding(
                                patchEntityPoseColumn(
                                  binding,
                                  entity.entityId,
                                  f.id,
                                  listId,
                                  list.key,
                                  f.key,
                                  entities,
                                ),
                              );
                            }}
                            options={poseOptionsVisual({
                              schema,
                              imageFieldIds: imageCols.map((c) => c.id),
                              cardId: pickedCardId,
                              dataset,
                              listId,
                            })}
                          />
                        ) : null}
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <div className="populate-studio-config">
            <button
              type="button"
              className="populate-studio-config__toggle"
              onClick={() => setConfigOpen((o) => !o)}
              aria-expanded={configOpen}
            >
              <ChevronDown
                size={14}
                className={`populate-studio-config__chevron${configOpen ? " is-open" : ""}`}
              />
              Opciones del formulario
            </button>
            {configOpen ? (
              <div className="populate-studio-config__body">
                <label className="populate-studio-config__field">
                  <span>Etiqueta en desplegables del formulario público</span>
                  <select
                    className="populate-studio-select"
                    value={binding.labelColumnFieldId}
                    onChange={(e) => {
                      const field = schema.find((f) => f.id === e.target.value);
                      onChangeBinding({
                        ...binding,
                        labelColumnFieldId: e.target.value,
                        labelColumnFieldKey: field?.key,
                      });
                    }}
                  >
                    {schema.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.label} ({f.type})
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : null}
          </div>

          <div className="populate-studio-generate-section nodrag">
            <label className="populate-studio-generate-option">
              <input
                type="checkbox"
                checked={createEditablesOnGenerate}
                onChange={(e) => onCreateEditablesOnGenerateChange?.(e.target.checked)}
                disabled={busy}
              />
              <span className="populate-studio-generate-option__text">
                <span className="populate-studio-generate-option__label">
                  Inyectar contenido y crear editables
                </span>
                <span className="populate-studio-generate-option__hint">
                  Crea el space con las plantillas rellenas y editables. Si está desactivado, solo
                  genera las imágenes PNG.
                </span>
              </span>
            </label>
            <button
              type="button"
              className="populate-studio-generate"
              disabled={busy || !canGenerate || !onGenerate}
              onClick={(e) => {
                e.stopPropagation();
                onGenerate?.({
                  templateNodeId: activeTemplateNodeId,
                  pickedRows: previewPickedRows,
                  pickedPoses: previewPickedPoses,
                  manualValues,
                  createEditables: createEditablesOnGenerate,
                });
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              {busy && progress ? (
                <>
                  <Loader2 size={14} className="animate-spin" aria-hidden />
                  Rasterizando {progress.done}/{progress.total}
                </>
              ) : (
                <>
                  <Sparkles size={14} strokeWidth={2.2} aria-hidden />
                  Generar · {slideLabel}
                </>
              )}
            </button>
            {busy && progress ? (
              <div className="populate-studio-progress">
                <div
                  className="populate-studio-progress__bar"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            ) : null}
            {generateError ? (
              <p className="populate-studio-generate-error">{generateError}</p>
            ) : null}
            {generateResults.length > 0 ? (
              <div className="designer-form-results populate-studio-generate-results">
                <span className="designer-form-results__label">
                  <ImageIcon size={13} strokeWidth={1.75} aria-hidden />
                  {generateResults.length} imagen{generateResults.length === 1 ? "" : "es"}
                </span>
                <div className="designer-form-results__grid">
                  {generateResults.map((url, i) => (
                    <DesignerFormResultThumb
                      key={`${url.slice(0, 48)}-${i}`}
                      url={url}
                      alt={`Slide ${i + 1}`}
                      onOpen={() => setLightboxIndex(i)}
                      onDownload={(e) => {
                        e.stopPropagation();
                        downloadDataUrl(url, `populate-slide-${i + 1}.png`);
                      }}
                    />
                  ))}
                </div>
              </div>
            ) : null}
            {lightboxIndex != null && generateResults.length > 0 ? (
              <DesignerFormResultsLightbox
                urls={generateResults}
                index={lightboxIndex}
                onIndexChange={setLightboxIndex}
                onClose={() => setLightboxIndex(null)}
                filenamePrefix="populate-slide"
              />
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}
