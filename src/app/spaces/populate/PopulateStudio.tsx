"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ChevronDown, Copy, Image as ImageIcon, Loader2, Sparkles } from "lucide-react";
import { FoldderStudioHeader, foldderStudioHeaderActionClassName } from "../FoldderStudioHeader";
import type { Dataset } from "@/app/spaces/dataset/dataset-types";
import {
  populateStudioTemplateMenuLabel,
  type PopulateDesignerTemplateConfig,
} from "./populate-designer-template";
import {
  groupPendingFieldsIntoEntities,
  imageColumnsInSchema,
  populateEntityUsesLegacyPosePicker,
  populateSlotKeyIsFolderScoped,
  textLikeColumnsInSchema,
} from "./populate-entity-groups";
import { patchEntityPoseColumn, setEntityManualMode } from "./populate-designer-binding";
import { patchSlotLayoutOverride } from "./populate-slot-layout";
import type { PopulateTemplateBinding, PopulateSlotLayoutOverride } from "./populate-types";
import { derivePopulateForm } from "./populate-designer-form";
import { PopulateFacetColumnMap } from "./PopulateFacetColumnMap";
import { PopulateManualFacetFields } from "./PopulateManualFacetFields";
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
import { getStudioAccentColor } from "../node-card-palette";

const ACCENT = getStudioAccentColor("populate");

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
  onShare?: (preview: PopulateStudioGeneratePreview) => void;
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
  const [layoutEditingSlotKey, setLayoutEditingSlotKey] = useState<string | null>(null);

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

  useEffect(() => {
    setLayoutEditingSlotKey(null);
  }, [selectedEntityId, activeTemplateNodeId]);

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

  const patchFacetColumns = (slotKeys: string[], fieldId: string) => {
    const f = schema.find((x) => x.id === fieldId);
    if (!f || !list) return;

    const nextSlotColumns = { ...binding.slotColumns };
    const nextSources = { ...binding.sources };
    let nextPoseMap = { ...(binding.entityPoseColumnFieldId ?? {}) };

    for (const slotKey of slotKeys) {
      const src = nextSources[slotKey];
      const pick =
        src?.kind === "dataset"
          ? binding.picks.find((p) => p.id === src.pickId)
          : undefined;
      const entityId = pick?.entityId;
      const entity = entityId ? entities.find((e) => e.entityId === entityId) : undefined;
      const usesLegacyPose =
        entity && populateEntityUsesLegacyPosePicker(entity, imageCols.length);

      if (entityId && !usesLegacyPose && !populateSlotKeyIsFolderScoped(slotKey)) {
        delete nextPoseMap[entityId];
      }
      if (entityId && usesLegacyPose && slotKey.endsWith("::image")) {
        nextPoseMap[entityId] = fieldId;
      }

      nextSlotColumns[slotKey] = {
        listId,
        listKey: list.key,
        fieldId: f.id,
        fieldKey: f.key,
      };
      nextSources[slotKey] =
        nextSources[slotKey]?.kind === "dataset"
          ? {
              ...nextSources[slotKey],
              columnFieldId: f.id,
              columnFieldKey: f.key,
            }
          : (nextSources[slotKey] ?? { kind: "manual" });
    }

    onChangeBinding({
      ...binding,
      slotColumns: nextSlotColumns,
      sources: nextSources,
      entityPoseColumnFieldId:
        Object.keys(nextPoseMap).length > 0 ? nextPoseMap : undefined,
    });

    for (const slotKey of slotKeys) {
      const src = binding.sources[slotKey];
      if (src?.kind !== "dataset") continue;
      const pick = binding.picks.find((p) => p.id === src.pickId);
      const entityId = pick?.entityId;
      const entity = entityId ? entities.find((e) => e.entityId === entityId) : undefined;
      const usesLegacyPose =
        entity && populateEntityUsesLegacyPosePicker(entity, imageCols.length);
      if (entityId && !usesLegacyPose) {
        setPreviewPickedPoses((prev) => {
          if (!prev[entityId]) return prev;
          const next = { ...prev };
          delete next[entityId];
          return next;
        });
      }
    }
  };

  const patchFacetLayout = (slotKey: string, patch: Partial<PopulateSlotLayoutOverride>) => {
    onChangeBinding({
      ...binding,
      slotLayoutOverrides: patchSlotLayoutOverride(binding.slotLayoutOverrides, slotKey, patch),
    });
  };

  return (
    <div
      className="populate-studio-root"
      data-foldder-studio-panel
      data-foldder-studio-canvas
      data-foldder-populate-studio
      style={
        {
          "--populate-accent": ACCENT,
          "--foldder-studio-accent": ACCENT,
        } as React.CSSProperties
      }
    >
      <FoldderStudioHeader
        nodeType="populate"
        nodeLabel={nodeLabel}
        subtitle="Plantilla · formulario · generación"
        onClose={onClose}
        actions={
          onShare ? (
            <button
              type="button"
              className={foldderStudioHeaderActionClassName("nodrag")}
              disabled={shareBusy || busy}
              onClick={() =>
                onShare?.({
                  templateNodeId: activeTemplateNodeId,
                  pickedRows: previewPickedRows,
                  pickedPoses: previewPickedPoses,
                  manualValues,
                  createEditables: createEditablesOnGenerate,
                })
              }
            >
              {shareBusy ? "…" : "Compartir formulario"}
            </button>
          ) : null
        }
      />

      <div className="populate-studio-body">
        <aside className="populate-studio-col populate-studio-col--left">
          <div className="populate-studio-col__head">
            <span className="populate-studio-col__title">Plantillas</span>
            <span className="populate-studio-col__hint">
              {templates.length}/8 conectada{templates.length === 1 ? "" : "s"}
            </span>
          </div>
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
              {templates.map((t, index) => {
                const menuLabel = populateStudioTemplateMenuLabel(index, t);
                return (
                <li key={t.templateNodeId}>
                  <button
                    type="button"
                    className={`populate-studio-template-chip nodrag${t.templateNodeId === activeTemplateNodeId ? " is-active" : ""}`}
                    onClick={() => onSelectTemplate(t.templateNodeId)}
                    title={menuLabel}
                  >
                    <span className="populate-studio-template-chip__body">
                      <span className="populate-studio-template-chip__label">{menuLabel}</span>
                    </span>
                  </button>
                </li>
              );
              })}
            </ul>
          )}

          {onShareMatchLabelChange ? (
            <div className="populate-studio-share-match nodrag">
              <p className="populate-studio-col__section-label">Partido</p>
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
              <p className="populate-studio-col__section-label">Enlace público</p>
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
          <main className="populate-studio-col populate-studio-col--center">
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
              suppressEntityAnimations={layoutEditingSlotKey != null}
            />
          </main>
        ) : (
          <main className="populate-studio-col populate-studio-col--center">
            <p className="populate-studio-center__empty">Conecta un Dataset para previsualizar.</p>
          </main>
        )}

        <aside className="populate-studio-col populate-studio-col--right nodrag" onPointerDown={(e) => e.stopPropagation()}>
          <div className="populate-studio-col__scroll">
            <div className="populate-studio-col__head populate-studio-col__head--compact">
              <span className="populate-studio-col__title">Formulario</span>
            </div>

          {entities.length > 1 ? (
            <div className="populate-studio-entity-tabs nodrag" role="group" aria-label="Entidades">
              {entities.map((entity) => (
                <button
                  key={entity.entityId}
                  type="button"
                  className={`populate-studio-entity-tab${selectedEntityId === entity.entityId ? " is-active" : ""}`}
                  onClick={() => setSelectedEntityId(entity.entityId)}
                >
                  {entity.label}
                </button>
              ))}
            </div>
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
                  <li key={entity.entityId} className="populate-studio-control-entity">
                    <header className="populate-studio-control-entity__head">
                      <input
                        className="populate-studio-input populate-studio-control-entity__label"
                        value={pick?.label ?? entity.label}
                        placeholder="Etiqueta"
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
                      <PopulateManualFacetFields
                        entity={entity}
                        manualValues={manualValues}
                        onManualChange={(slotKey, value) =>
                          setManualValues((m) => ({ ...m, [slotKey]: value }))
                        }
                        templatePages={activeTemplate.pages}
                        binding={binding}
                        onPatchLayout={patchFacetLayout}
                        layoutEditingSlotKey={layoutEditingSlotKey}
                        onLayoutEditingChange={setLayoutEditingSlotKey}
                      />
                    ) : (
                      <>
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
                            layout="dropdown"
                          />
                        ) : null}

                        <PopulateFacetColumnMap
                          entity={entity}
                          entities={entities}
                          binding={binding}
                          templatePages={activeTemplate.pages}
                          textCols={textCols}
                          imageCols={imageCols}
                          onPatchColumn={patchFacetColumns}
                          onPatchLayout={patchFacetLayout}
                          onLayoutEditingChange={setLayoutEditingSlotKey}
                          layoutEditingSlotKey={layoutEditingSlotKey}
                          kindFilter="text"
                          compact
                        />

                        <PopulateFacetColumnMap
                          entity={entity}
                          entities={entities}
                          binding={binding}
                          templatePages={activeTemplate.pages}
                          textCols={textCols}
                          imageCols={imageCols}
                          onPatchColumn={patchFacetColumns}
                          onPatchLayout={patchFacetLayout}
                          onLayoutEditingChange={setLayoutEditingSlotKey}
                          layoutEditingSlotKey={layoutEditingSlotKey}
                          dataset={dataset ?? undefined}
                          listId={listId}
                          pickedCardId={pickedCardId}
                          kindFilter="image"
                          compact
                        />

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

          </div>
        </aside>
      </div>

      <footer className="populate-studio-footer nodrag" onPointerDown={(e) => e.stopPropagation()}>
        <div className="populate-studio-footer__toolbar">
          <button
            type="button"
            className="populate-studio-footer__config-toggle"
            onClick={() => setConfigOpen((o) => !o)}
            aria-expanded={configOpen}
          >
            <ChevronDown
              size={14}
              className={`populate-studio-config__chevron${configOpen ? " is-open" : ""}`}
            />
            Opciones
          </button>

          {configOpen ? (
            <label className="populate-studio-footer__field">
              <span>Etiqueta pública</span>
              <select
                className="populate-studio-select populate-studio-footer__select"
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
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="populate-studio-footer__checkbox">
            <input
              type="checkbox"
              checked={createEditablesOnGenerate}
              onChange={(e) => onCreateEditablesOnGenerateChange?.(e.target.checked)}
              disabled={busy}
            />
            <span>Crear editables</span>
          </label>

          <button
            type="button"
            className="populate-studio-footer__generate"
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
          >
            {busy && progress ? (
              <>
                <Loader2 size={14} className="animate-spin" aria-hidden />
                {progress.done}/{progress.total}
              </>
            ) : (
              <>
                <Sparkles size={14} strokeWidth={2.2} aria-hidden />
                Generar · {slideLabel}
              </>
            )}
          </button>
        </div>

        {busy && progress ? (
          <div className="populate-studio-footer__progress">
            <div
              className="populate-studio-footer__progress-bar"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        ) : null}

        {generateError ? (
          <p className="populate-studio-footer__error">{generateError}</p>
        ) : null}

        {generateResults.length > 0 ? (
          <div className="populate-studio-footer__results">
            <span className="populate-studio-footer__results-label">
              <ImageIcon size={13} strokeWidth={1.75} aria-hidden />
              {generateResults.length} imagen{generateResults.length === 1 ? "" : "es"}
            </span>
            <div className="populate-studio-footer__results-strip">
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
      </footer>
    </div>
  );
}
