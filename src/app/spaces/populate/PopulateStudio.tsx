"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ChevronDown, Copy, ImageIcon, Sparkles, Type, Users } from "lucide-react";
import { FoldderStudioHeader } from "../FoldderStudioHeader";
import type { Dataset } from "@/app/spaces/dataset/dataset-types";
import type { PopulateDesignerTemplateConfig } from "./populate-designer-template";
import { datasetListRowLabel } from "@/app/spaces/loop/loop-row-label";
import {
  groupPendingFieldsIntoEntities,
  imageColumnsInSchema,
} from "./populate-entity-groups";
import { patchEntityPoseColumn, setEntityManualMode } from "./populate-designer-binding";
import type { PopulateTemplateBinding } from "./populate-types";
import { derivePopulateForm } from "./populate-designer-form";
import {
  PopulatePoseGrid,
  PopulateRecordGrid,
} from "./PopulateEntityPickers";
import { poseOptionsVisual, recordThumbFromValues } from "./populate-row-preview";
import {
  PopulateRasterizePagesFn,
  PopulateStudioTemplatePreview,
} from "./PopulateStudioTemplatePreview";

const ACCENT = "#9B5DE5";

export interface PopulateStudioProps {
  nodeLabel: string;
  dataset: Dataset | null;
  listId: string;
  templates: PopulateDesignerTemplateConfig[];
  activeTemplate: PopulateDesignerTemplateConfig;
  activeTemplateNodeId: string;
  onSelectTemplate: (templateNodeId: string) => void;
  binding: PopulateTemplateBinding;
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
}: PopulateStudioProps) {
  const list = dataset?.lists.find((l) => l.id === listId);
  const schema = list?.schema ?? [];
  const textCols = useMemo(() => schema.filter((f) => f.type === "text"), [schema]);
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
  const [manualValues, setManualValues] = useState<Record<string, string>>({});
  const [configOpen, setConfigOpen] = useState(false);

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
    if (binding.entityPoseColumnFieldId) {
      setPreviewPickedPoses((prev) => ({ ...binding.entityPoseColumnFieldId, ...prev }));
    }
  }, [binding.entityPoseColumnFieldId]);

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
    });
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
          <ul className="populate-studio-template-list">
            {templates.map((t) => (
              <li key={t.templateNodeId}>
                <button
                  type="button"
                  className={`populate-studio-template-chip nodrag${t.templateNodeId === activeTemplateNodeId ? " is-active" : ""}`}
                  onClick={() => onSelectTemplate(t.templateNodeId)}
                >
                  <Sparkles size={14} />
                  {t.templateLabel}
                </button>
              </li>
            ))}
          </ul>

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
          />
        ) : (
          <div className="populate-studio-preview-stage">
            <p className="populate-studio-preview-stage__empty">Conecta un Dataset para previsualizar.</p>
          </div>
        )}

        <aside className="populate-studio-controls nodrag" onPointerDown={(e) => e.stopPropagation()}>
          <p className="populate-studio-sidebar__title">Datos de prueba</p>
          <p className="populate-studio-hint">
            Lo que elijas aquí alimenta la vista previa central al instante.
          </p>

          {entities.length === 0 ? (
            <p className="populate-studio-hint">
              Marca capas dinámicas en el Designer con el mismo ID (Modo 2).
            </p>
          ) : (
            <ul className="populate-studio-control-entities">
              {entities.map((entity) => {
                const pick =
                  binding.picks.find((p) => p.entityId === entity.entityId) ?? binding.picks[0];
                const manual = isEntityManual(binding, entity.entityId, entity.facets);
                const formEntity = formModel?.entities.find((e) => e.entityId === entity.entityId);
                const pickedCardId = pick?.id ? previewPickedRows[pick.id] ?? "" : "";
                const imageFacets = entity.facets.filter((f) => f.kind === "image");
                const poseFieldId =
                  previewPickedPoses[entity.entityId] ??
                  binding.entityPoseColumnFieldId?.[entity.entityId] ??
                  binding.slotColumns[imageFacets[0]?.slotKey ?? ""]?.fieldId ??
                  imageCols[0]?.id ??
                  "";

                return (
                  <li key={entity.entityId} className="populate-studio-control-entity">
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
                    ) : formEntity && formEntity.options.length > 0 ? (
                      <>
                        <PopulateRecordGrid
                          label="Jugador"
                          options={formEntity.options}
                          value={pickedCardId}
                          onChange={(cardId) => {
                            if (!pick?.id) return;
                            setPreviewPickedRows((rows) => ({ ...rows, [pick.id]: cardId }));
                          }}
                          thumbForOption={thumbForPreview}
                          variant="studio"
                        />

                        {pickedCardId && imageFacets.length > 0 && imageCols.length > 1 && dataset ? (
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
                    ) : null}
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
              Configuración de columnas
            </button>
            {configOpen ? (
              <div className="populate-studio-config__body">
                <label className="populate-studio-config__field">
                  <span>Etiqueta en desplegables</span>
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

                {entities.map((entity) => {
                  const manual = isEntityManual(binding, entity.entityId, entity.facets);
                  if (manual) return null;
                  const textFacets = entity.facets.filter((f) => f.kind === "text");
                  if (textFacets.length === 0) return null;
                  return (
                    <div key={entity.entityId} className="populate-studio-config__entity">
                      <span className="populate-studio-config__entity-name">{entity.label}</span>
                      {textFacets.map((facet) => {
                        const col = binding.slotColumns[facet.slotKey];
                        const fieldId = col?.fieldId ?? textCols[0]?.id ?? "";
                        const singleTextCol = textCols.length === 1 ? textCols[0] : undefined;
                        return (
                          <label key={facet.slotKey} className="populate-studio-config__field">
                            <Type size={12} aria-hidden />
                            <span>{facet.label}</span>
                            {singleTextCol ? (
                              <span className="populate-studio-map-row__col">{singleTextCol.label}</span>
                            ) : (
                              <select
                                className="populate-studio-select"
                                value={fieldId}
                                onChange={(e) => patchFacetColumn(facet.slotKey, e.target.value)}
                              >
                                {textCols.map((f) => (
                                  <option key={f.id} value={f.id}>
                                    {f.label}
                                  </option>
                                ))}
                              </select>
                            )}
                          </label>
                        );
                      })}
                      {entity.facets.some((f) => f.kind === "image") && imageCols.length === 1 ? (
                        <label className="populate-studio-config__field">
                          <ImageIcon size={12} aria-hidden />
                          <span>Imagen</span>
                          <span className="populate-studio-map-row__col">{imageCols[0]!.label}</span>
                        </label>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}
