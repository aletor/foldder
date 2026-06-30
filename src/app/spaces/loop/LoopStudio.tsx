"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  Braces,
  Check,
  CircleDollarSign,
  Eye,
  ImageIcon,
  Layers,
  Link2,
  Loader2,
  Pin,
  Repeat,
  Sparkles,
  Table2,
  Type,
  Users,
} from "lucide-react";
import type { Dataset, FieldDef } from "@/app/spaces/dataset/dataset-types";
import { fieldValueAsText, getListFieldValueAtRow } from "@/app/spaces/dataset/dataset-logic";
import { FoldderStudioHeader } from "../FoldderStudioHeader";
import type { ActiveImageRef } from "./loop-active-refs";
import { LoopFormPanel } from "./LoopFormPanel";
import type { LoopFormModel } from "./loop-form";
import type { LoopTemplateModel } from "./loop-generate";
import { LoopPromptEditor } from "./LoopPromptEditor";
import { DesignerFormPanel } from "./DesignerFormPanel";
import type { DesignerDynamicField } from "./loop-designer-fields";
import type { DesignerFormModel } from "./loop-designer-form";
import { groupPendingFieldsIntoEntities } from "../populate/populate-entity-groups";
import {
  buildLoopStudioSlots,
  buildLoopStudioSummary,
  type LoopStudioSlot,
  type LoopStudioSummary,
} from "./loop-studio-summary";
import { formatLoopRunErrorMessage } from "./loop-batch-finalize";
import { sampleColumnImageUrls } from "./loop-studio-images";
import { LoopDatasetOutputPanel } from "./LoopDatasetOutputPanel";
import {
  datasetFieldTypesForInputKind,
  type LoopBindings,
  type LoopDatasetOutputSettings,
  type LoopInputBinding,
  type LoopRunStatus,
} from "./loop-types";

const LOOP_ACCENT = "#FD52EB";

/** Un canal de salida (creador conectado a la plantilla) con su columna destino. */
export interface LoopStudioChannelOutput {
  channelId: string;
  label: string;
  /** Prompt del nodo Image Creator (identidad compartida; solo lectura en UI). */
  nodePrompt: string;
  /** Delta fijo de pose/variante, concatenado tras `nodePrompt`. */
  channelPrompt: string;
  settings: LoopDatasetOutputSettings;
}

export interface LoopStudioProps {
  nodeId: string;
  nodeLabel: string;
  mode: "batch" | "form";
  onModeChange: (mode: "batch" | "form") => void;
  onClose: () => void;

  templateLabel: string | null;
  promptText: string;
  promptLabel?: string;
  bindings: LoopBindings;
  activeImageRefs: ActiveImageRef[];
  model: LoopTemplateModel;
  onChangePrompt: (next: string) => void;
  onChangeBinding: (inputId: string, binding: LoopInputBinding) => void;

  /** Tokens del prompt marcados como manuales (clave de token → valor constante). */
  manualTokens?: Record<string, string>;
  /** Marca/edita un token manual; `value === null` lo devuelve a columna/constante. */
  onChangeManualToken?: (tokenKey: string, value: string | null) => void;

  schema: FieldDef[];
  constantFields: FieldDef[];
  listId: string | null;
  listName: string;
  rowCount: number;
  lists: { id: string; name: string; cards: unknown[] }[];
  onSelectList: (listId: string) => void;
  datasetConnected: boolean;
  datasetLoading: boolean;

  dataset: Dataset | null;

  formModel: LoopFormModel;
  formValues: Record<string, string>;
  formImageRows: Record<string, number>;
  onChangeFormText: (fieldKey: string, value: string) => void;
  onChangeFormImageRow: (inputId: string, rowIndex: number) => void;
  onAutofillForm: (rowIndex: number) => void;

  busy: boolean;
  progress: { done: number; total: number } | null;
  lastRunOutputs: string[];
  lastRunFailures?: Array<{ rowIndex: number; error: string }>;
  lastRunOkCount?: number;
  lastRunFailedCount?: number;
  runStatus?: LoopRunStatus;
  previewRowIndex: number;
  onPreviewRowChange: (rowIndex: number) => void;
  previewUrl: string | null;
  previewLoading: boolean;
  onPreview: () => void;
  onGenerateBatch: () => void;
  onGenerateForm: () => void;

  shareToken?: string | null;
  shareBusy?: boolean;
  shareError?: string | null;
  onShare: () => void;
  onCopyShareUrl: () => void;

  error: string | null;

  datasetOutput: LoopDatasetOutputSettings;
  onChangeDatasetOutput: (next: LoopDatasetOutputSettings) => void;
  /**
   * Multi-canal: cuando hay 2+ creadores conectados a la plantilla, una columna destino por canal.
   * Si tiene ≥2 entradas sustituye al panel de salida único.
   */
  channels?: LoopStudioChannelOutput[];
  onChangeChannelOutput?: (channelId: string, next: LoopDatasetOutputSettings) => void;
  onChangeChannelPrompt?: (channelId: string, next: string) => void;
  lastDatasetWriteSummary?: string | null;

  /**
   * Plantilla Designer (modo node-clone). Cuando está activo, el Studio sustituye los slots de
   * Image Creation (prompt / variables / refs) por los campos dinámicos del Designer y permite
   * mapear cada hueco pendiente a una columna del Dataset de Loop.
   */
  isDesignerTemplate?: boolean;
  designerFields?: DesignerDynamicField[];
  designerSlideCount?: number;
  designerSlotBindings?: Record<
    string,
    { listId: string; listKey: string; fieldId: string; fieldKey: string }
  >;
  onChangeDesignerSlotBinding?: (slotKey: string, fieldId: string) => void;

  /** Formulario Designer (modo "una pieza"): tantas imágenes como slides. */
  designerFormModel?: DesignerFormModel;
  designerFormValues?: Record<string, string>;
  designerFormResults?: string[];
  onChangeDesignerFormValue?: (slotKey: string, value: string) => void;
  onAutofillDesignerForm?: (rowIndex: number) => void;
  onGenerateDesignerForm?: () => void;
}

function slotIcon(slot: LoopStudioSlot) {
  if (slot.kind === "prompt") return <Type size={15} strokeWidth={1.75} />;
  if (slot.kind === "token") return <Braces size={15} strokeWidth={1.75} />;
  return <ImageIcon size={15} strokeWidth={1.75} />;
}

function StudioThumb({ url, alt, className }: { url: string; alt: string; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={alt} className={className} draggable={false} />
  );
}

function SummaryRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="loop-studio-summary-row">
      <Icon size={15} strokeWidth={1.75} className="loop-studio-summary-row__icon" aria-hidden />
      <div className="loop-studio-summary-row__body">
        <span className="loop-studio-summary-row__label">{label}</span>
        <span className="loop-studio-summary-row__value">{value}</span>
      </div>
    </div>
  );
}

function StudioSummaryPanel({ summary }: { summary: LoopStudioSummary }) {
  const promptValue =
    summary.tokenCount > 0
      ? `${summary.tokenCount} variable${summary.tokenCount === 1 ? "" : "s"} del Dataset`
      : "Texto fijo";

  let refsValue = "Sin referencias conectadas";
  if (summary.activeRefCount > 0) {
    refsValue =
      summary.dynamicRefCount > 0
        ? `${summary.activeRefCount} conectada${summary.activeRefCount === 1 ? "" : "s"} · ${summary.dynamicRefCount} dinámica${summary.dynamicRefCount === 1 ? "" : "s"}`
        : `${summary.activeRefCount} fija${summary.activeRefCount === 1 ? "" : "s"}`;
  }

  return (
    <div className="loop-studio-summary">
      <SummaryRow icon={Sparkles} label="Nodo" value={summary.templateLabel} />
      <SummaryRow
        icon={Table2}
        label="Listado"
        value={`${summary.listName} · ${summary.rowCount} fila${summary.rowCount === 1 ? "" : "s"}`}
      />
      <SummaryRow icon={Type} label="Prompt" value={promptValue} />
      <SummaryRow icon={ImageIcon} label="Referencias" value={refsValue} />
      <SummaryRow
        icon={Layers}
        label="Resultados"
        value={`${summary.rowCount} imagen${summary.rowCount === 1 ? "" : "es"}`}
      />
      <SummaryRow
        icon={CircleDollarSign}
        label="Coste estimado"
        value={`~$${summary.costTotalUsd.toFixed(2)} (${summary.rowCount} × ~$${summary.costPerImageUsd.toFixed(3)})`}
      />
    </div>
  );
}

function DesignerStudioSummaryPanel({
  templateLabel,
  listName,
  rowCount,
  slideCount,
  fields,
  entities,
  mappedCount,
  pendingCount,
}: {
  templateLabel: string;
  listName: string;
  rowCount: number;
  slideCount: number;
  fields: number;
  entities?: number;
  mappedCount: number;
  pendingCount: number;
}) {
  const fieldsValue =
    fields === 0
      ? "Ninguno marcado en el Designer"
      : `${mappedCount}/${fields} faceta${fields === 1 ? "" : "s"} asignada${mappedCount === 1 ? "" : "s"}` +
        (entities && entities > 0 ? ` · ${entities} entidad${entities === 1 ? "" : "es"}` : "") +
        (pendingCount > 0 ? ` · ${pendingCount} pendiente${pendingCount === 1 ? "" : "s"}` : "");

  return (
    <div className="loop-studio-summary">
      <SummaryRow icon={Sparkles} label="Plantilla" value={templateLabel} />
      <SummaryRow
        icon={Table2}
        label="Listado"
        value={`${listName} · ${rowCount} fila${rowCount === 1 ? "" : "s"}`}
      />
      <SummaryRow
        icon={Layers}
        label="Slides"
        value={`${slideCount} por instancia`}
      />
      <SummaryRow icon={Braces} label="Campos dinámicos" value={fieldsValue} />
      <SummaryRow
        icon={Layers}
        label="Resultados"
        value={`${rowCount} instancia${rowCount === 1 ? "" : "s"} · ${rowCount * slideCount} slide${
          rowCount * slideCount === 1 ? "" : "s"
        }`}
      />
    </div>
  );
}

function StudioSlotList({
  slots,
  selectedId,
  onSelect,
}: {
  slots: LoopStudioSlot[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <ul className="loop-studio-slots">
      {slots.map((slot) => (
        <li key={slot.id}>
          <button
            type="button"
            className={`loop-studio-slot${selectedId === slot.id ? " is-selected" : ""}${slot.ok ? "" : " is-warn"}`}
            onClick={() => onSelect(slot.id)}
          >
            <span className="loop-studio-slot__icon">{slotIcon(slot)}</span>
            <span className="loop-studio-slot__body">
              <span className="loop-studio-slot__label">{slot.label}</span>
              <span className="loop-studio-slot__status">{slot.status}</span>
              {slot.sourceLabel ? (
                <span className="loop-studio-slot__connected">
                  <Link2 size={11} strokeWidth={2} aria-hidden />
                  {slot.sourceLabel}
                </span>
              ) : null}
            </span>
            {slot.thumbUrl ? (
              <StudioThumb url={slot.thumbUrl} alt={slot.label} className="loop-studio-slot__thumb" />
            ) : null}
            {slot.ok ? (
              <Check size={14} strokeWidth={2} className="loop-studio-slot__check" aria-hidden />
            ) : (
              <AlertTriangle size={14} strokeWidth={2} className="loop-studio-slot__warn" aria-hidden />
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}

function ImageFieldPicker({
  fields,
  activeKey,
  onPick,
  emptyHint,
  dataset,
  listId,
  rowCount,
}: {
  fields: { id: string; key: string; label: string }[];
  activeKey?: string;
  onPick: (field: { id: string; key: string; label: string }) => void;
  emptyHint: string;
  dataset: Dataset | null;
  listId: string | null;
  rowCount: number;
}) {
  if (fields.length === 0) {
    return <p className="loop-studio-center__empty">{emptyHint}</p>;
  }
  return (
    <ul className="loop-studio-field-list">
      {fields.map((f) => {
        const samples = sampleColumnImageUrls(dataset, listId, f.id, rowCount, 4);
        return (
          <li key={f.id}>
            <button
              type="button"
              className={`loop-studio-field loop-studio-field--image${activeKey === f.key ? " is-active" : ""}`}
              onClick={() => onPick(f)}
            >
              <ImageIcon size={15} strokeWidth={1.75} className="loop-studio-field__icon" aria-hidden />
              <span className="loop-studio-field__body">
                <span className="loop-studio-field__label">{f.label}</span>
                <span className="loop-studio-field__key">{f.key}</span>
              </span>
              {samples.length > 0 ? (
                <span className="loop-studio-field__samples">
                  {samples.map((url, i) => (
                    <StudioThumb
                      key={`${f.id}-${i}`}
                      url={url}
                      alt={`${f.label} fila ${i + 1}`}
                      className="loop-studio-field__sample"
                    />
                  ))}
                </span>
              ) : null}
              {activeKey === f.key ? (
                <Check size={14} strokeWidth={2} className="loop-studio-field__check" aria-hidden />
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function FieldPicker({
  fields,
  activeKey,
  onPick,
  emptyHint,
  fieldIcon: FieldIcon = Type,
}: {
  fields: { id: string; key: string; label: string }[];
  activeKey?: string;
  onPick: (field: { id: string; key: string; label: string }) => void;
  emptyHint: string;
  fieldIcon?: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
}) {
  if (fields.length === 0) {
    return <p className="loop-studio-center__empty">{emptyHint}</p>;
  }
  return (
    <ul className="loop-studio-field-list">
      {fields.map((f) => (
        <li key={f.id}>
          <button
            type="button"
            className={`loop-studio-field${activeKey === f.key ? " is-active" : ""}`}
            onClick={() => onPick(f)}
          >
            <FieldIcon size={15} strokeWidth={1.75} className="loop-studio-field__icon" aria-hidden />
            <span className="loop-studio-field__body">
              <span className="loop-studio-field__label">{f.label}</span>
              <span className="loop-studio-field__key">{f.key}</span>
            </span>
            {activeKey === f.key ? (
              <Check size={14} strokeWidth={2} className="loop-studio-field__check" aria-hidden />
            ) : null}
          </button>
        </li>
      ))}
    </ul>
  );
}

export function LoopStudio(props: LoopStudioProps) {
  const {
    nodeLabel,
    mode,
    onModeChange,
    onClose,
    templateLabel,
    promptText,
    promptLabel = "Prompt",
    bindings,
    activeImageRefs,
    model,
    onChangePrompt,
    onChangeBinding,
    manualTokens,
    onChangeManualToken,
    schema,
    constantFields,
    listId,
    listName,
    rowCount,
    lists,
    onSelectList,
    datasetConnected,
    datasetLoading,
    dataset,
    formModel,
    formValues,
    formImageRows,
    onChangeFormText,
    onChangeFormImageRow,
    onAutofillForm,
    busy,
    progress,
    lastRunOutputs,
    lastRunFailures,
    lastRunOkCount,
    lastRunFailedCount,
    runStatus,
    previewRowIndex,
    onPreviewRowChange,
    previewUrl,
    previewLoading,
    onPreview,
    onGenerateBatch,
    onGenerateForm,
    shareToken,
    shareBusy,
    shareError,
    onShare,
    onCopyShareUrl,
    error,
    datasetOutput,
    onChangeDatasetOutput,
    channels,
    onChangeChannelOutput,
    onChangeChannelPrompt,
    lastDatasetWriteSummary,
    isDesignerTemplate = false,
    designerFields,
    designerSlideCount = 0,
    designerSlotBindings,
    onChangeDesignerSlotBinding,
    designerFormModel,
    designerFormValues,
    designerFormResults,
    onChangeDesignerFormValue,
    onAutofillDesignerForm,
    onGenerateDesignerForm,
  } = props;

  const slots = useMemo(
    () =>
      buildLoopStudioSlots({
        promptText,
        bindings,
        activeImageRefs,
        schema,
        constantFields,
        promptLabel,
      }),
    [promptText, bindings, activeImageRefs, schema, constantFields, promptLabel],
  );

  const summary = useMemo(
    () =>
      buildLoopStudioSummary({
        templateLabel: templateLabel ?? "—",
        listName,
        rowCount,
        promptText,
        bindings,
        activeImageRefs,
        schema,
        constantFields,
        model,
        datasetConnected,
        hasTemplate: Boolean(templateLabel),
      }),
    [
      templateLabel,
      listName,
      rowCount,
      promptText,
      bindings,
      activeImageRefs,
      schema,
      constantFields,
      model,
      datasetConnected,
    ],
  );

  /** Slots Designer: entidades (texto+imagen) + campos bound sueltos. */
  const designerEntityGroups = useMemo(
    () => groupPendingFieldsIntoEntities(designerFields ?? []),
    [designerFields],
  );

  const designerSlots = useMemo<LoopStudioSlot[]>(() => {
    if (!isDesignerTemplate) return [];
    const bound = (designerFields ?? [])
      .filter((f) => f.status === "bound")
      .map((f) => {
        const kind: LoopStudioSlot["kind"] = f.kind === "image" ? "ref" : "token";
        return {
          id: `dfield:${f.key}`,
          kind,
          label: f.label,
          status: "Enlazado en Designer",
          ok: true,
          sourceLabel: f.fieldKey ?? f.label,
        };
      });

    const entitySlots = designerEntityGroups.map((group) => {
      const mappedFacets = group.facets.filter((f) => designerSlotBindings?.[f.slotKey]);
      const allMapped =
        group.facets.length > 0 && mappedFacets.length === group.facets.length;
      const hasImage = group.facets.some((f) => f.kind === "image");
      const kind: LoopStudioSlot["kind"] = hasImage ? "ref" : "token";
      const mappedKeys = mappedFacets
        .map((f) => designerSlotBindings?.[f.slotKey]?.fieldKey)
        .filter(Boolean)
        .join(" · ");
      return {
        id: `dentity:${group.entityId}`,
        kind,
        label: group.label,
        status: allMapped ? mappedKeys || "Mapeado" : mappedFacets.length > 0 ? "Parcial" : "Sin asignar",
        ok: allMapped,
        fieldKey: mappedKeys || undefined,
        sourceLabel: group.facets.map((f) => f.kind).join(" + "),
      };
    });

    return [...entitySlots, ...bound];
  }, [designerEntityGroups, designerFields, designerSlotBindings, isDesignerTemplate]);

  const activeSlots = isDesignerTemplate ? designerSlots : slots;

  const [selectedId, setSelectedId] = useState("prompt");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Selección efectiva derivada en render (sin setState-en-effect): si el slot guardado ya no
  // existe (cambió la plantilla / los campos), cae al primero disponible.
  const effectiveSelectedId = activeSlots.some((s) => s.id === selectedId)
    ? selectedId
    : activeSlots[0]?.id ?? "prompt";
  const selected = activeSlots.find((s) => s.id === effectiveSelectedId) ?? activeSlots[0];

  const textFields = useMemo(() => {
    const allowed = datasetFieldTypesForInputKind("text");
    const fromList = schema.filter((f) => allowed.includes(f.type));
    const fromConst = constantFields.filter((f) => allowed.includes(f.type));
    return [...fromList, ...fromConst].map((f) => ({ id: f.id, key: f.key, label: f.label }));
  }, [schema, constantFields]);

  const imageFields = useMemo(() => {
    const allowed = datasetFieldTypesForInputKind("image");
    return schema.filter((f) => allowed.includes(f.type));
  }, [schema]);

  const validityFields = useMemo(
    () => [...schema, ...constantFields].map((f) => ({ key: f.key, label: f.label })),
    [schema, constantFields],
  );

  const insertableFields = textFields;

  const replaceTokenKey = useCallback(
    (oldKey: string, newKey: string) => {
      if (oldKey === newKey) return;
      const next = promptText.replace(new RegExp(`\\{${oldKey}\\}`, "g"), `{${newKey}}`);
      onChangePrompt(next);
    },
    [promptText, onChangePrompt],
  );

  const selectedRef = useMemo(() => {
    if (selected?.kind !== "ref" || !selected.inputId) return null;
    return activeImageRefs.find((r) => r.inputId === selected.inputId) ?? null;
  }, [selected, activeImageRefs]);

  // Derivados Designer (Modo 2): conteo de huecos pendientes y mapeados para el resumen/avisos.
  const designerPendingFields = useMemo(
    () => (designerFields ?? []).filter((f) => f.status === "pending"),
    [designerFields],
  );
  const designerMappedCount = useMemo(
    () => designerPendingFields.filter((f) => Boolean(designerSlotBindings?.[f.key])).length,
    [designerPendingFields, designerSlotBindings],
  );
  const designerUnmappedCount = designerPendingFields.length - designerMappedCount;

  const renderDesignerCenter = () => {
    if (!onChangeDesignerSlotBinding) return null;
    if ((designerFields ?? []).length === 0) {
      return (
        <p className="loop-studio-center__empty">
          Marca objetos como campo dinámico dentro del Designer (panel Dataset de cada objeto) para
          poder mapearlos aquí a las columnas del Dataset.
        </p>
      );
    }
    if (!selected) return null;

    if (selected.id.startsWith("dentity:")) {
      const entityId = selected.id.slice("dentity:".length);
      const group = designerEntityGroups.find((g) => g.entityId === entityId);
      if (!group || !onChangeDesignerSlotBinding) return null;

      return (
        <div className="loop-studio-center-panel">
          <p className="loop-studio-center__lead">
            Entidad{" "}
            <span className="loop-studio-center__name">{group.label}</span> — nombre e imagen salen
            del mismo registro. Asigna una columna por faceta.
          </p>
          <ul className="loop-studio-entity-facets">
            {group.facets.map((facet) => {
              const mapped = designerSlotBindings?.[facet.slotKey];
              const isImage = facet.kind === "image";
              const pickerFields = isImage
                ? imageFields.map((f) => ({ id: f.id, key: f.key, label: f.label }))
                : textFields;

              return (
                <li key={facet.slotKey} className="loop-studio-entity-facet-row">
                  <div className="loop-studio-entity-facet-row__head">
                    <Users size={14} aria-hidden className="loop-studio-entity-facet-row__icon" />
                    <span className="loop-studio-entity-facet-row__title">
                      {facet.label} · {isImage ? "imagen" : "texto"}
                    </span>
                    {mapped ? (
                      <span className="loop-studio-entity-facet-row__mapped">→ {mapped.fieldKey}</span>
                    ) : (
                      <span className="loop-studio-entity-facet-row__mapped loop-studio-entity-facet-row__mapped--warn">
                        Sin columna
                      </span>
                    )}
                  </div>
                  {isImage ? (
                    <ImageFieldPicker
                      fields={pickerFields}
                      activeKey={mapped?.fieldKey}
                      onPick={(f) => onChangeDesignerSlotBinding(facet.slotKey, f.id)}
                      emptyHint="No hay columnas de imagen en el listado activo."
                      dataset={dataset}
                      listId={listId}
                      rowCount={rowCount}
                    />
                  ) : (
                    <FieldPicker
                      fields={pickerFields}
                      activeKey={mapped?.fieldKey}
                      onPick={(f) => onChangeDesignerSlotBinding(facet.slotKey, f.id)}
                      emptyHint="No hay columnas de texto en el listado activo."
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      );
    }

    const field = (designerFields ?? []).find((f) => `dfield:${f.key}` === selected.id);
    if (!field) return null;

    if (field.status === "bound") {
      return (
        <div className="loop-studio-center-panel">
          <p className="loop-studio-center__lead">
            Campo <span className="loop-studio-center__name">{field.label}</span> ya está enlazado
            a la columna <span className="loop-studio-center__name">{field.fieldKey}</span> dentro
            del propio Designer (Modo 1). Se resuelve automáticamente; no necesita mapeo aquí.
          </p>
        </div>
      );
    }

    const mapped = designerSlotBindings?.[field.key];
    const isImage = field.kind === "image";
    const pickerFields = isImage
      ? imageFields.map((f) => ({ id: f.id, key: f.key, label: f.label }))
      : textFields;

    return (
      <div className="loop-studio-center-panel">
        <p className="loop-studio-center__lead">
          Campo dinámico <span className="loop-studio-center__name">{field.label}</span> (
          {isImage ? "imagen" : "texto"}) — elige la columna del Dataset que lo rellenará en cada
          instancia generada.
        </p>
        <ul className="loop-studio-field-list">
          <li>
            <button
              type="button"
              className={`loop-studio-field${!mapped ? " is-active" : ""}`}
              onClick={() => onChangeDesignerSlotBinding(field.key, "")}
            >
              <AlertTriangle size={15} strokeWidth={1.75} className="loop-studio-field__icon" aria-hidden />
              <span className="loop-studio-field__body">
                <span className="loop-studio-field__label">Sin asignar</span>
                <span className="loop-studio-field__key">El hueco queda fijo con el valor de la plantilla</span>
              </span>
              {!mapped ? (
                <Check size={14} strokeWidth={2} className="loop-studio-field__check" aria-hidden />
              ) : null}
            </button>
          </li>
        </ul>
        {isImage ? (
          <ImageFieldPicker
            fields={pickerFields}
            activeKey={mapped?.fieldKey}
            onPick={(f) => onChangeDesignerSlotBinding(field.key, f.id)}
            emptyHint="No hay columnas de imagen en el listado activo."
            dataset={dataset}
            listId={listId}
            rowCount={rowCount}
          />
        ) : (
          <FieldPicker
            fields={pickerFields}
            activeKey={mapped?.fieldKey}
            onPick={(f) => onChangeDesignerSlotBinding(field.key, f.id)}
            emptyHint="No hay columnas de texto en el listado activo."
          />
        )}
      </div>
    );
  };

  const renderCenter = () => {
    if (!templateLabel) {
      return (
        <p className="loop-studio-center__empty">
          Conecta Image Creation (salida Image out) al handle Plantilla de Loop.
        </p>
      );
    }

    if (isDesignerTemplate) {
      if (mode === "form") {
        if (!designerFormModel || !onChangeDesignerFormValue || !onGenerateDesignerForm) return null;
        return (
          <DesignerFormPanel
            model={designerFormModel}
            values={designerFormValues ?? {}}
            busy={busy}
            progress={progress}
            results={designerFormResults ?? []}
            canGenerate={!designerFormModel.empty}
            onChangeValue={onChangeDesignerFormValue}
            onAutofill={onAutofillDesignerForm}
            onGenerate={() => {
              onGenerateDesignerForm();
            }}
            shareToken={shareToken}
            shareBusy={shareBusy}
            shareError={shareError}
            onShare={onShare}
            onCopyShareUrl={onCopyShareUrl}
          />
        );
      }
      return renderDesignerCenter();
    }

    if (mode === "form") {
      return (
        <LoopFormPanel
          model={formModel}
          textValues={formValues}
          imageRows={formImageRows}
          busy={busy}
          canGenerate={!formModel.empty}
          onChangeText={onChangeFormText}
          onChangeImageRow={onChangeFormImageRow}
          onAutofill={onAutofillForm}
          onGenerate={() => {
            onClose();
            onGenerateForm();
          }}
          shareToken={shareToken}
          shareBusy={shareBusy}
          shareError={shareError}
          onShare={onShare}
          onCopyShareUrl={onCopyShareUrl}
        />
      );
    }

    if (!selected) return null;

    if (selected.kind === "prompt") {
      return (
        <div className="loop-studio-prompt-editor">
          <LoopPromptEditor
            value={promptText}
            fields={validityFields}
            insertableFields={insertableFields}
            label={promptLabel}
            placeholder="Escribe el prompt que se enviará al nodo creativo…"
            onChange={onChangePrompt}
          />
        </div>
      );
    }

    if (selected.kind === "token" && selected.fieldKey) {
      const tokenKey = selected.fieldKey;
      const isManual = !!manualTokens && tokenKey in manualTokens;
      const manualValue = manualTokens?.[tokenKey] ?? "";
      const matchField = schema.find((f) => f.key === tokenKey);
      const suggestions =
        matchField && dataset && listId && rowCount > 0
          ? (() => {
              const seen = new Set<string>();
              const out: string[] = [];
              for (let i = 0; i < rowCount; i += 1) {
                const text = fieldValueAsText(
                  getListFieldValueAtRow(dataset, listId, matchField.id, i) ?? undefined,
                ).trim();
                if (text && !seen.has(text)) {
                  seen.add(text);
                  out.push(text);
                }
                if (out.length >= 50) break;
              }
              return out;
            })()
          : [];
      const datalistId = `loop-token-suggest-${tokenKey}`;
      return (
        <div className="loop-studio-center-panel">
          <p className="loop-studio-center__lead">
            Variable <span className="loop-studio-center__name">{selected.label}</span> —{" "}
            {isManual
              ? "se rellena a mano antes de generar (igual para todas las filas)."
              : "elige la columna del Dataset que alimenta este campo en cada fila."}
          </p>
          {onChangeManualToken ? (
            <ul className="loop-studio-source-toggle">
              <li>
                <button
                  type="button"
                  className={`loop-studio-source-toggle__btn${!isManual ? " is-active" : ""}`}
                  onClick={() => onChangeManualToken(tokenKey, null)}
                >
                  <Table2 size={13} strokeWidth={1.9} aria-hidden /> Columna del Dataset
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className={`loop-studio-source-toggle__btn${isManual ? " is-active" : ""}`}
                  onClick={() => onChangeManualToken(tokenKey, manualValue)}
                  title="Rellenar antes de generar; constante en todas las filas"
                >
                  <Type size={13} strokeWidth={1.9} aria-hidden /> Manual
                </button>
              </li>
            </ul>
          ) : null}
          {isManual && onChangeManualToken ? (
            <div className="loop-studio-manual-field">
              <input
                type="text"
                className="loop-studio-manual-input nodrag"
                value={manualValue}
                list={suggestions.length > 0 ? datalistId : undefined}
                placeholder={`${selected.label}…`}
                onChange={(e) => onChangeManualToken(tokenKey, e.target.value)}
                onPointerDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              />
              {suggestions.length > 0 ? (
                <datalist id={datalistId}>
                  {suggestions.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              ) : null}
              <span className="loop-studio-manual-field__hint">
                Se usará este valor en todas las filas. Déjalo vacío para volver a la columna.
              </span>
            </div>
          ) : (
            <FieldPicker
              fields={textFields}
              activeKey={tokenKey}
              onPick={(f) => replaceTokenKey(tokenKey, f.key)}
              emptyHint="No hay columnas de texto en el listado activo."
            />
          )}
        </div>
      );
    }

    if (selected.kind === "ref" && selected.inputId) {
      const binding = bindings[selected.inputId];
      const activeFieldId = binding?.source === "column" ? binding.fieldId : undefined;
      const connectedUrl = selectedRef?.fixedUrl;
      return (
        <div className="loop-studio-center-panel">
          {connectedUrl ? (
            <div className="loop-studio-ref-preview">
              <span className="loop-studio-ref-preview__label">
                <ImageIcon size={14} strokeWidth={1.75} aria-hidden />
                Referencia conectada ahora
              </span>
              <div className="loop-studio-ref-preview__frame">
                <StudioThumb url={connectedUrl} alt={selected.label} className="loop-studio-ref-preview__img" />
              </div>
            </div>
          ) : null}
          <p className="loop-studio-center__lead">
            Referencia <span className="loop-studio-center__name">{selected.label}</span>
            {selected.sourceLabel ? (
              <>
                {" "}
                · conectada desde <span className="loop-studio-center__name">{selected.sourceLabel}</span>
              </>
            ) : null}
            . Mantén la imagen actual o enlázala a una columna del Dataset.
          </p>
          <ul className="loop-studio-field-list loop-studio-field-list--ref">
            <li>
              <button
                type="button"
                className={`loop-studio-field loop-studio-field--image${!binding || binding.source === "fixed" ? " is-active" : ""}`}
                onClick={() =>
                  onChangeBinding(selected.inputId!, { inputId: selected.inputId!, source: "fixed" })
                }
              >
                <Pin size={15} strokeWidth={1.75} className="loop-studio-field__icon" aria-hidden />
                <span className="loop-studio-field__body">
                  <span className="loop-studio-field__label">Imagen fija</span>
                  <span className="loop-studio-field__key">Usar la referencia conectada tal cual</span>
                </span>
                {connectedUrl ? (
                  <StudioThumb
                    url={connectedUrl}
                    alt={selected.label}
                    className="loop-studio-field__sample"
                  />
                ) : null}
                {!binding || binding.source === "fixed" ? (
                  <Check size={14} strokeWidth={2} className="loop-studio-field__check" aria-hidden />
                ) : null}
              </button>
            </li>
            <li>
              <button
                type="button"
                className={`loop-studio-field loop-studio-field--image${binding?.source === "manual" ? " is-active" : ""}`}
                onClick={() =>
                  onChangeBinding(selected.inputId!, {
                    inputId: selected.inputId!,
                    source: "manual",
                    manualValue: binding?.manualValue ?? "",
                  })
                }
              >
                <Pin size={15} strokeWidth={1.75} className="loop-studio-field__icon" aria-hidden />
                <span className="loop-studio-field__body">
                  <span className="loop-studio-field__label">Manual</span>
                  <span className="loop-studio-field__key">Rellenar antes de generar (URL de imagen)</span>
                </span>
                {binding?.source === "manual" ? (
                  <Check size={14} strokeWidth={2} className="loop-studio-field__check" aria-hidden />
                ) : null}
              </button>
            </li>
          </ul>
          {binding?.source === "manual" ? (
            <input
              type="text"
              className="loop-studio-manual-input nodrag"
              value={binding.manualValue ?? ""}
              placeholder="Pega una URL de imagen…"
              onChange={(e) =>
                onChangeBinding(selected.inputId!, {
                  inputId: selected.inputId!,
                  source: "manual",
                  manualValue: e.target.value,
                })
              }
              onPointerDown={(e) => e.stopPropagation()}
            />
          ) : null}
          <ImageFieldPicker
            fields={imageFields.map((f) => ({ id: f.id, key: f.key, label: f.label }))}
            activeKey={
              activeFieldId ? imageFields.find((f) => f.id === activeFieldId)?.key : undefined
            }
            onPick={(f) =>
              onChangeBinding(selected.inputId!, {
                inputId: selected.inputId!,
                source: "column",
                listId: listId ?? undefined,
                fieldId: f.id,
                fieldKey: f.key,
              })
            }
            emptyHint="No hay columnas de imagen en el listado activo."
            dataset={dataset}
            listId={listId}
            rowCount={rowCount}
          />
        </div>
      );
    }

    return null;
  };

  const handleGenerateBatch = () => {
    onGenerateBatch();
  };

  const okCount = lastRunOkCount ?? lastRunOutputs.length;
  const failedCount = lastRunFailedCount ?? lastRunFailures?.length ?? 0;
  const hasRunReport =
    busy ||
    runStatus === "partial" ||
    runStatus === "error" ||
    failedCount > 0 ||
    (runStatus === "done" && okCount > 0);

  const runSummaryMessage = useMemo(() => {
    if (error?.trim()) return error.trim();
    if (failedCount > 0 || runStatus === "partial" || runStatus === "error") {
      return formatLoopRunErrorMessage({
        okCount,
        failedCount,
        totalRows: rowCount,
        failures: lastRunFailures ?? [],
      });
    }
    return null;
  }, [error, failedCount, okCount, rowCount, lastRunFailures, runStatus]);

  const runReportTitle =
    runStatus === "error" && okCount === 0
      ? "Error en el lote"
      : failedCount > 0 || runStatus === "partial"
        ? "Ejecución parcial"
        : busy
          ? "Generando lote"
          : "Última ejecución";

  const canGenerate = isDesignerTemplate
    ? Boolean(templateLabel) && datasetConnected && rowCount > 0
    : summary.canGenerate;

  const progressPct =
    progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  const portal = (
    <div
      className="loop-studio-root"
      data-foldder-studio-panel
      data-foldder-studio-canvas
      data-foldder-loop-studio
      style={{ "--loop-accent": LOOP_ACCENT } as React.CSSProperties}
    >
      <FoldderStudioHeader
        nodeType="loop"
        nodeLabel={nodeLabel}
        subtitle="Dinamización por Dataset"
        onClose={onClose}
        actions={
          <div className="loop-studio-mode-toggle" role="group" aria-label="Modo de ejecución">
            <button
              type="button"
              className={mode === "batch" ? "is-active" : ""}
              onClick={() => onModeChange("batch")}
            >
              Lote
            </button>
            <button
              type="button"
              className={mode === "form" ? "is-active" : ""}
              onClick={() => onModeChange("form")}
            >
              Formulario
            </button>
          </div>
        }
      />

      {runSummaryMessage && (failedCount > 0 || runStatus === "error" || runStatus === "partial") ? (
        <div className="loop-studio-run-alert" role="alert">
          <AlertTriangle size={16} strokeWidth={2} aria-hidden />
          <div className="loop-studio-run-alert__body">
            <strong className="loop-studio-run-alert__title">{runReportTitle}</strong>
            <p className="loop-studio-run-alert__text">{runSummaryMessage}</p>
          </div>
        </div>
      ) : null}

      <div className="loop-studio-body">
        {mode === "batch" ? (
          <>
            <aside className="loop-studio-col loop-studio-col--left">
              <div className="loop-studio-col__head">
                <span className="loop-studio-col__title">
                  {isDesignerTemplate ? "Campos dinámicos" : "Dinamizar"}
                </span>
                <span className="loop-studio-col__hint">
                  {isDesignerTemplate ? "del Designer" : "elementos clicables"}
                </span>
              </div>
              {lists.length > 1 ? (
                <select
                  className="loop-studio-list-select"
                  value={listId ?? ""}
                  onChange={(e) => onSelectList(e.target.value)}
                >
                  {lists.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name} · {l.cards.length}
                    </option>
                  ))}
                </select>
              ) : null}
              {datasetLoading ? (
                <span className="loop-studio-loading">
                  <Loader2 size={14} className="animate-spin" /> Cargando Dataset…
                </span>
              ) : isDesignerTemplate ? (
                activeSlots.length > 0 ? (
                  <StudioSlotList
                    slots={activeSlots}
                    selectedId={effectiveSelectedId}
                    onSelect={setSelectedId}
                  />
                ) : (
                  <p className="loop-studio-center__empty">
                    Ningún objeto marcado como dinámico todavía.
                  </p>
                )
              ) : (
                <>
                  <StudioSlotList slots={slots} selectedId={effectiveSelectedId} onSelect={setSelectedId} />
                  {activeImageRefs.length > 0 ? (
                    <div className="loop-studio-ref-strip">
                      <span className="loop-studio-ref-strip__label">
                        <ImageIcon size={13} strokeWidth={1.75} aria-hidden />
                        Referencias conectadas
                      </span>
                      <div className="loop-studio-ref-strip__grid">
                        {activeImageRefs.map((ref) => (
                          <button
                            key={ref.inputId}
                            type="button"
                            className={`loop-studio-ref-strip__item${effectiveSelectedId === `ref:${ref.inputId}` ? " is-selected" : ""}`}
                            onClick={() => setSelectedId(`ref:${ref.inputId}`)}
                            title={ref.label}
                          >
                            <StudioThumb url={ref.fixedUrl} alt={ref.label} className="loop-studio-ref-strip__thumb" />
                            <span>{ref.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </>
              )}
            </aside>

            <main className="loop-studio-col loop-studio-col--center">{renderCenter()}</main>

            <aside className="loop-studio-col loop-studio-col--right">
              <div className="loop-studio-col__scroll">
                <div className="loop-studio-col__head">
                  <span className="loop-studio-col__title">Resumen</span>
                  <span className="loop-studio-col__hint">
                    {busy ? "en curso" : hasRunReport && okCount > 0 ? "última ejecución" : "antes de generar"}
                  </span>
                </div>
                <div className="loop-studio-summary">
                  {isDesignerTemplate ? (
                    <DesignerStudioSummaryPanel
                      templateLabel={templateLabel ?? "—"}
                      listName={listName}
                      rowCount={rowCount}
                      slideCount={designerSlideCount}
                      fields={designerPendingFields.length}
                      entities={designerEntityGroups.length}
                      mappedCount={designerMappedCount}
                      pendingCount={designerUnmappedCount}
                    />
                  ) : (
                    <StudioSummaryPanel summary={summary} />
                  )}
                </div>
                {isDesignerTemplate ? (
                  designerUnmappedCount > 0 ? (
                    <ul className="loop-studio-blockers">
                      <li>
                        <AlertTriangle size={14} strokeWidth={2} aria-hidden />
                        {designerUnmappedCount} campo{designerUnmappedCount === 1 ? "" : "s"} sin
                        columna: quedará{designerUnmappedCount === 1 ? "" : "n"} fijo
                        {designerUnmappedCount === 1 ? "" : "s"} con el valor de la plantilla.
                      </li>
                    </ul>
                  ) : null
                ) : summary.blockers.length > 0 ? (
                  <ul className="loop-studio-blockers">
                    {summary.blockers.map((b) => (
                      <li key={b}>
                        <AlertTriangle size={14} strokeWidth={2} aria-hidden />
                        {b}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {datasetConnected && listId ? (
                  channels && channels.length > 1 && !isDesignerTemplate ? (
                    <div className="loop-studio-channels">
                      <p className="loop-studio-channels__hint">
                        {channels.length} canales conectados. Cada creador genera su imagen y la
                        vuelca a su propia columna del Dataset.
                      </p>
                      {channels.map((ch) => (
                        <div key={ch.channelId} className="loop-studio-channels__item">
                          <p className="loop-studio-channels__label">{ch.label}</p>
                          <label className="loop-studio-channels__prompt">
                            <span>Prompt del canal (pose / variante)</span>
                            {ch.nodePrompt.trim() ? (
                              <span className="loop-studio-channels__prompt-hint">
                                Se concatena al prompt del Image Creator: «
                                {ch.nodePrompt.length > 72
                                  ? `${ch.nodePrompt.slice(0, 72)}…`
                                  : ch.nodePrompt}
                                »
                              </span>
                            ) : null}
                            <textarea
                              className="loop-studio-channels__prompt-input nodrag"
                              rows={3}
                              placeholder="p. ej. de perfil, brazos cruzados, mirando a cámara…"
                              value={ch.channelPrompt}
                              onChange={(e) => onChangeChannelPrompt?.(ch.channelId, e.target.value)}
                              onPointerDown={(e) => e.stopPropagation()}
                            />
                          </label>
                          <LoopDatasetOutputPanel
                            settings={ch.settings}
                            schema={schema}
                            templateLabel={ch.label}
                            onChange={(next) => onChangeChannelOutput?.(ch.channelId, next)}
                            variant="image"
                          />
                        </div>
                      ))}
                      {lastDatasetWriteSummary ? (
                        <p className="loop-studio-dataset-output__summary">
                          {lastDatasetWriteSummary}
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <LoopDatasetOutputPanel
                      settings={datasetOutput}
                      schema={schema}
                      templateLabel={templateLabel}
                      lastWriteSummary={lastDatasetWriteSummary}
                      onChange={onChangeDatasetOutput}
                      variant={isDesignerTemplate ? "designer" : "image"}
                    />
                  )
                ) : null}
                {!isDesignerTemplate && rowCount > 0 ? (
                  <label className="loop-studio-preview-row">
                    <Eye size={14} strokeWidth={1.75} aria-hidden />
                    <span>Vista previa</span>
                    <select
                      value={previewRowIndex}
                      onChange={(e) => onPreviewRowChange(Number(e.target.value))}
                      disabled={previewLoading || Boolean(progress)}
                    >
                      {Array.from({ length: rowCount }, (_, i) => (
                        <option key={i} value={i}>
                          Fila {i + 1}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={previewLoading || !summary.canGenerate}
                      onClick={onPreview}
                    >
                      Probar
                    </button>
                  </label>
                ) : null}
                <button
                  type="button"
                  className="loop-studio-generate"
                  disabled={busy || !canGenerate}
                  onClick={handleGenerateBatch}
                >
                  {busy && progress ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Bucle {progress.done}/{progress.total}
                    </>
                  ) : (
                    <>
                      <Repeat size={14} strokeWidth={2.2} />
                      {isDesignerTemplate
                        ? `Multiplicar · ${rowCount} instancia${rowCount === 1 ? "" : "s"}`
                        : `Generar · ${rowCount} fila${rowCount === 1 ? "" : "s"}`}
                    </>
                  )}
                </button>
                {busy && progress ? (
                  <div className="loop-studio-progress">
                    <div
                      className="loop-studio-progress__bar"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                ) : null}
                {hasRunReport ? (
                  <div className="loop-studio-run-report">
                    <div className="loop-studio-run-report__head">
                      <span className="loop-studio-run-report__title">{runReportTitle}</span>
                      {busy && progress ? (
                        <span className="loop-studio-run-report__badge">
                          <Loader2 size={11} className="animate-spin" aria-hidden />
                          Fila {Math.min(progress.done, rowCount)}/{rowCount}
                        </span>
                      ) : runStatus === "partial" ? (
                        <span className="loop-studio-run-report__badge loop-studio-run-report__badge--warn">
                          Parcial
                        </span>
                      ) : runStatus === "error" ? (
                        <span className="loop-studio-run-report__badge loop-studio-run-report__badge--error">
                          Error
                        </span>
                      ) : null}
                    </div>
                    <ul className="loop-studio-run-report__stats">
                      <li>
                        <Check size={13} strokeWidth={2.2} aria-hidden />
                        {okCount} generada{okCount === 1 ? "" : "s"} correctamente
                      </li>
                      {failedCount > 0 ? (
                        <li className="loop-studio-run-report__stats--fail">
                          <AlertTriangle size={13} strokeWidth={2.2} aria-hidden />
                          {failedCount} fila{failedCount === 1 ? "" : "s"} con error
                        </li>
                      ) : null}
                      {!busy && rowCount > 0 ? (
                        <li>
                          <Repeat size={13} strokeWidth={2.2} aria-hidden />
                          {rowCount} fila{rowCount === 1 ? "" : "s"} en total
                        </li>
                      ) : null}
                    </ul>
                    {runSummaryMessage && failedCount > 0 ? (
                      <p className="loop-studio-run-report__summary">{runSummaryMessage}</p>
                    ) : null}
                    {lastRunFailures && lastRunFailures.length > 0 ? (
                      <ul className="loop-studio-run-report__failures">
                        {lastRunFailures.map((f) => (
                          <li key={`run-fail-${f.rowIndex}`}>
                            <strong>Fila {f.rowIndex + 1}</strong>
                            <span>{f.error}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {!isDesignerTemplate && (previewLoading || previewUrl) && mode === "batch" ? (
                <div className="loop-studio-preview-panel">
                  <span className="loop-studio-preview-panel__label">
                    <Eye size={14} strokeWidth={1.75} aria-hidden />
                    Vista previa · fila {previewRowIndex + 1}
                  </span>
                  <div className="loop-studio-preview-panel__frame">
                    {previewLoading ? (
                      <div className="loop-studio-preview-panel__loading">
                        <Loader2 size={28} className="animate-spin" style={{ color: LOOP_ACCENT }} />
                        <span>Generando vista previa…</span>
                      </div>
                    ) : previewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={previewUrl} alt="Vista previa" className="loop-studio-preview-panel__img" draggable={false} />
                    ) : null}
                  </div>
                </div>
              ) : null}
            </aside>
          </>
        ) : (
          <>
            <aside className="loop-studio-col loop-studio-col--left loop-studio-col--form">
              <div className="loop-studio-col__head">
                <span className="loop-studio-col__title">
                  {isDesignerTemplate ? "Campos dinámicos" : "Variables"}
                </span>
                <span className="loop-studio-col__hint">del formulario</span>
              </div>
              {isDesignerTemplate ? (
                !designerFormModel || designerFormModel.empty ? (
                  <p className="loop-studio-center__empty">
                    Marca objetos como campo dinámico en el Designer.
                  </p>
                ) : (
                  <ul className="loop-studio-slots">
                    {designerFormModel.fields.map((f) => (
                      <li key={f.slotKey}>
                        <span className="loop-studio-form-var">
                          {f.kind === "image" ? <ImageIcon size={12} /> : <Type size={12} />}
                          {f.label}
                        </span>
                      </li>
                    ))}
                  </ul>
                )
              ) : formModel.empty ? (
                <p className="loop-studio-center__empty">
                  Mapea variables en modo Lote antes de usar el formulario.
                </p>
              ) : (
                <ul className="loop-studio-slots">
                  {formModel.textFields.map((f) => (
                    <li key={f.fieldKey}>
                      <span className="loop-studio-form-var">
                        <Type size={12} />
                        {f.label}
                      </span>
                    </li>
                  ))}
                  {formModel.imageFields.map((f) => (
                    <li key={f.inputId}>
                      <span className="loop-studio-form-var">
                        <ImageIcon size={12} />
                        {f.label}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </aside>
            <main className="loop-studio-col loop-studio-col--center loop-studio-col--form-center">
              {renderCenter()}
            </main>
            <aside className="loop-studio-col loop-studio-col--right">
              <div className="loop-studio-col__head">
                <span className="loop-studio-col__title">Resumen</span>
              </div>
              <div className="loop-studio-summary">
                <p className="loop-studio-summary__line">Modo formulario · una pieza al instante</p>
                <p className="loop-studio-summary__line">
                  {isDesignerTemplate
                    ? designerFormModel && !designerFormModel.empty
                      ? `${designerFormModel.fields.length} campo${
                          designerFormModel.fields.length === 1 ? "" : "s"
                        } · ${designerSlideCount} slide${designerSlideCount === 1 ? "" : "s"}`
                      : "Sin campos dinámicos"
                    : formModel.empty
                      ? "Sin variables mapeadas"
                      : `${formModel.textFields.length + formModel.imageFields.length} campos`}
                </p>
              </div>
            </aside>
          </>
        )}
      </div>

      {error && !(failedCount > 0 || runStatus === "partial" || runStatus === "error") ? (
        <div className="loop-studio-toast">
          <span className="loop-studio-toast__error">
            <AlertTriangle size={12} /> {error}
          </span>
        </div>
      ) : null}

      {lastRunOutputs.length > 0 || (lastRunFailures?.length ?? 0) > 0 ? (
        <footer className="loop-studio-results">
          <div className="loop-studio-results__head">
            <Sparkles size={13} />
            <span>
              {okCount > 0
                ? `${okCount} imagen${okCount === 1 ? "" : "es"} generada${okCount === 1 ? "" : "s"}`
                : "Sin imágenes generadas"}
              {failedCount > 0 ? ` · ${failedCount} fila${failedCount === 1 ? "" : "s"} falló` : ""}
              {runStatus === "partial" ? " · ejecución parcial" : ""}
            </span>
          </div>
          {lastRunFailures && lastRunFailures.length > 0 ? (
            <ul className="loop-studio-results__failures">
              {lastRunFailures.map((f) => (
                <li key={`fail-${f.rowIndex}`}>
                  <strong>Fila {f.rowIndex + 1}:</strong> {f.error}
                </li>
              ))}
            </ul>
          ) : null}
          {lastRunOutputs.length > 0 ? (
            <div className="loop-studio-results__grid">
              {lastRunOutputs.map((url, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <a key={`${url}-${i}`} href={url} target="_blank" rel="noreferrer" className="loop-studio-results__thumb">
                  <img src={url} alt={`Resultado ${i + 1}`} draggable={false} />
                </a>
              ))}
            </div>
          ) : null}
        </footer>
      ) : null}
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(portal, document.body);
}
