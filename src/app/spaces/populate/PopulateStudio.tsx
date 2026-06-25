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
} from "lucide-react";
import type { Dataset, FieldDef } from "@/app/spaces/dataset/dataset-types";
import { FoldderStudioHeader } from "../FoldderStudioHeader";
import type { ActiveImageRef } from "./populate-active-refs";
import { PopulateFormPanel } from "./PopulateFormPanel";
import type { PopulateFormModel } from "./populate-form";
import type { PopulateTemplateModel } from "./populate-generate";
import { PopulatePromptEditor } from "./PopulatePromptEditor";
import { DesignerFormPanel } from "./DesignerFormPanel";
import type { DesignerDynamicField } from "./populate-designer-fields";
import type { DesignerFormModel } from "./populate-designer-form";
import {
  buildPopulateStudioSlots,
  buildPopulateStudioSummary,
  type PopulateStudioSlot,
  type PopulateStudioSummary,
} from "./populate-studio-summary";
import { sampleColumnImageUrls } from "./populate-studio-images";
import { PopulateDatasetOutputPanel } from "./PopulateDatasetOutputPanel";
import {
  datasetFieldTypesForInputKind,
  type PopulateBindings,
  type PopulateDatasetOutputSettings,
  type PopulateInputBinding,
} from "./populate-types";

const POPULATE_ACCENT = "#FD52EB";

export interface PopulateStudioProps {
  nodeId: string;
  nodeLabel: string;
  mode: "batch" | "form";
  onModeChange: (mode: "batch" | "form") => void;
  onClose: () => void;

  templateLabel: string | null;
  promptText: string;
  promptLabel?: string;
  bindings: PopulateBindings;
  activeImageRefs: ActiveImageRef[];
  model: PopulateTemplateModel;
  onChangePrompt: (next: string) => void;
  onChangeBinding: (inputId: string, binding: PopulateInputBinding) => void;

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

  formModel: PopulateFormModel;
  formValues: Record<string, string>;
  formImageRows: Record<string, number>;
  onChangeFormText: (fieldKey: string, value: string) => void;
  onChangeFormImageRow: (inputId: string, rowIndex: number) => void;
  onAutofillForm: (rowIndex: number) => void;

  busy: boolean;
  progress: { done: number; total: number } | null;
  lastRunOutputs: string[];
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

  datasetOutput: PopulateDatasetOutputSettings;
  onChangeDatasetOutput: (next: PopulateDatasetOutputSettings) => void;
  lastDatasetWriteSummary?: string | null;

  /**
   * Plantilla Designer (modo node-clone). Cuando está activo, el Studio sustituye los slots de
   * Image Creation (prompt / variables / refs) por los campos dinámicos del Designer y permite
   * mapear cada hueco pendiente a una columna del Dataset de Populate.
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
  onGenerateDesignerForm?: () => void;
}

function slotIcon(slot: PopulateStudioSlot) {
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
    <div className="populate-studio-summary-row">
      <Icon size={15} strokeWidth={1.75} className="populate-studio-summary-row__icon" aria-hidden />
      <div className="populate-studio-summary-row__body">
        <span className="populate-studio-summary-row__label">{label}</span>
        <span className="populate-studio-summary-row__value">{value}</span>
      </div>
    </div>
  );
}

function StudioSummaryPanel({ summary }: { summary: PopulateStudioSummary }) {
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
    <div className="populate-studio-summary">
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
  mappedCount,
  pendingCount,
}: {
  templateLabel: string;
  listName: string;
  rowCount: number;
  slideCount: number;
  fields: number;
  mappedCount: number;
  pendingCount: number;
}) {
  const fieldsValue =
    fields === 0
      ? "Ninguno marcado en el Designer"
      : `${mappedCount}/${fields} asignado${mappedCount === 1 ? "" : "s"}` +
        (pendingCount > 0 ? ` · ${pendingCount} pendiente${pendingCount === 1 ? "" : "s"}` : "");

  return (
    <div className="populate-studio-summary">
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
  slots: PopulateStudioSlot[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <ul className="populate-studio-slots">
      {slots.map((slot) => (
        <li key={slot.id}>
          <button
            type="button"
            className={`populate-studio-slot${selectedId === slot.id ? " is-selected" : ""}${slot.ok ? "" : " is-warn"}`}
            onClick={() => onSelect(slot.id)}
          >
            <span className="populate-studio-slot__icon">{slotIcon(slot)}</span>
            <span className="populate-studio-slot__body">
              <span className="populate-studio-slot__label">{slot.label}</span>
              <span className="populate-studio-slot__status">{slot.status}</span>
              {slot.sourceLabel ? (
                <span className="populate-studio-slot__connected">
                  <Link2 size={11} strokeWidth={2} aria-hidden />
                  {slot.sourceLabel}
                </span>
              ) : null}
            </span>
            {slot.thumbUrl ? (
              <StudioThumb url={slot.thumbUrl} alt={slot.label} className="populate-studio-slot__thumb" />
            ) : null}
            {slot.ok ? (
              <Check size={14} strokeWidth={2} className="populate-studio-slot__check" aria-hidden />
            ) : (
              <AlertTriangle size={14} strokeWidth={2} className="populate-studio-slot__warn" aria-hidden />
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
    return <p className="populate-studio-center__empty">{emptyHint}</p>;
  }
  return (
    <ul className="populate-studio-field-list">
      {fields.map((f) => {
        const samples = sampleColumnImageUrls(dataset, listId, f.id, rowCount, 4);
        return (
          <li key={f.id}>
            <button
              type="button"
              className={`populate-studio-field populate-studio-field--image${activeKey === f.key ? " is-active" : ""}`}
              onClick={() => onPick(f)}
            >
              <ImageIcon size={15} strokeWidth={1.75} className="populate-studio-field__icon" aria-hidden />
              <span className="populate-studio-field__body">
                <span className="populate-studio-field__label">{f.label}</span>
                <span className="populate-studio-field__key">{f.key}</span>
              </span>
              {samples.length > 0 ? (
                <span className="populate-studio-field__samples">
                  {samples.map((url, i) => (
                    <StudioThumb
                      key={`${f.id}-${i}`}
                      url={url}
                      alt={`${f.label} fila ${i + 1}`}
                      className="populate-studio-field__sample"
                    />
                  ))}
                </span>
              ) : null}
              {activeKey === f.key ? (
                <Check size={14} strokeWidth={2} className="populate-studio-field__check" aria-hidden />
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
    return <p className="populate-studio-center__empty">{emptyHint}</p>;
  }
  return (
    <ul className="populate-studio-field-list">
      {fields.map((f) => (
        <li key={f.id}>
          <button
            type="button"
            className={`populate-studio-field${activeKey === f.key ? " is-active" : ""}`}
            onClick={() => onPick(f)}
          >
            <FieldIcon size={15} strokeWidth={1.75} className="populate-studio-field__icon" aria-hidden />
            <span className="populate-studio-field__body">
              <span className="populate-studio-field__label">{f.label}</span>
              <span className="populate-studio-field__key">{f.key}</span>
            </span>
            {activeKey === f.key ? (
              <Check size={14} strokeWidth={2} className="populate-studio-field__check" aria-hidden />
            ) : null}
          </button>
        </li>
      ))}
    </ul>
  );
}

export function PopulateStudio(props: PopulateStudioProps) {
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
    onGenerateDesignerForm,
  } = props;

  const slots = useMemo(
    () =>
      buildPopulateStudioSlots({
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
      buildPopulateStudioSummary({
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

  /** Slots Designer: 1 por campo dinámico (texto → icono variable, imagen → icono imagen). */
  const designerSlots = useMemo<PopulateStudioSlot[]>(() => {
    if (!isDesignerTemplate) return [];
    return (designerFields ?? []).map((f) => {
      const kind: PopulateStudioSlot["kind"] = f.kind === "image" ? "ref" : "token";
      if (f.status === "bound") {
        return {
          id: `dfield:${f.key}`,
          kind,
          label: f.label,
          status: "Enlazado en Designer",
          ok: true,
          sourceLabel: f.fieldKey ?? f.label,
        };
      }
      const mapped = designerSlotBindings?.[f.key];
      return {
        id: `dfield:${f.key}`,
        kind,
        label: f.label,
        status: mapped ? `→ ${mapped.fieldKey}` : "Sin asignar",
        ok: Boolean(mapped),
        fieldKey: mapped?.fieldKey,
        sourceLabel: mapped?.fieldKey,
      };
    });
  }, [isDesignerTemplate, designerFields, designerSlotBindings]);

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
        <p className="populate-studio-center__empty">
          Marca objetos como campo dinámico dentro del Designer (panel Dataset de cada objeto) para
          poder mapearlos aquí a las columnas del Dataset.
        </p>
      );
    }
    if (!selected) return null;
    const field = (designerFields ?? []).find((f) => `dfield:${f.key}` === selected.id);
    if (!field) return null;

    if (field.status === "bound") {
      return (
        <div className="populate-studio-center-panel">
          <p className="populate-studio-center__lead">
            Campo <span className="populate-studio-center__name">{field.label}</span> ya está enlazado
            a la columna <span className="populate-studio-center__name">{field.fieldKey}</span> dentro
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
      <div className="populate-studio-center-panel">
        <p className="populate-studio-center__lead">
          Campo dinámico <span className="populate-studio-center__name">{field.label}</span> (
          {isImage ? "imagen" : "texto"}) — elige la columna del Dataset que lo rellenará en cada
          instancia generada.
        </p>
        <ul className="populate-studio-field-list">
          <li>
            <button
              type="button"
              className={`populate-studio-field${!mapped ? " is-active" : ""}`}
              onClick={() => onChangeDesignerSlotBinding(field.key, "")}
            >
              <AlertTriangle size={15} strokeWidth={1.75} className="populate-studio-field__icon" aria-hidden />
              <span className="populate-studio-field__body">
                <span className="populate-studio-field__label">Sin asignar</span>
                <span className="populate-studio-field__key">El hueco queda fijo con el valor de la plantilla</span>
              </span>
              {!mapped ? (
                <Check size={14} strokeWidth={2} className="populate-studio-field__check" aria-hidden />
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
        <p className="populate-studio-center__empty">
          Conecta Image Creation (salida Image out) al handle Plantilla de Populate.
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
        <PopulateFormPanel
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
        <div className="populate-studio-prompt-editor">
          <PopulatePromptEditor
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
      return (
        <div className="populate-studio-center-panel">
          <p className="populate-studio-center__lead">
            Variable <span className="populate-studio-center__name">{selected.label}</span> — elige la
            columna del Dataset que alimenta este campo en cada fila.
          </p>
          <FieldPicker
            fields={textFields}
            activeKey={selected.fieldKey}
            onPick={(f) => replaceTokenKey(selected.fieldKey!, f.key)}
            emptyHint="No hay columnas de texto en el listado activo."
          />
        </div>
      );
    }

    if (selected.kind === "ref" && selected.inputId) {
      const binding = bindings[selected.inputId];
      const activeFieldId = binding?.source === "column" ? binding.fieldId : undefined;
      const connectedUrl = selectedRef?.fixedUrl;
      return (
        <div className="populate-studio-center-panel">
          {connectedUrl ? (
            <div className="populate-studio-ref-preview">
              <span className="populate-studio-ref-preview__label">
                <ImageIcon size={14} strokeWidth={1.75} aria-hidden />
                Referencia conectada ahora
              </span>
              <div className="populate-studio-ref-preview__frame">
                <StudioThumb url={connectedUrl} alt={selected.label} className="populate-studio-ref-preview__img" />
              </div>
            </div>
          ) : null}
          <p className="populate-studio-center__lead">
            Referencia <span className="populate-studio-center__name">{selected.label}</span>
            {selected.sourceLabel ? (
              <>
                {" "}
                · conectada desde <span className="populate-studio-center__name">{selected.sourceLabel}</span>
              </>
            ) : null}
            . Mantén la imagen actual o enlázala a una columna del Dataset.
          </p>
          <ul className="populate-studio-field-list populate-studio-field-list--ref">
            <li>
              <button
                type="button"
                className={`populate-studio-field populate-studio-field--image${!binding || binding.source === "fixed" ? " is-active" : ""}`}
                onClick={() =>
                  onChangeBinding(selected.inputId!, { inputId: selected.inputId!, source: "fixed" })
                }
              >
                <Pin size={15} strokeWidth={1.75} className="populate-studio-field__icon" aria-hidden />
                <span className="populate-studio-field__body">
                  <span className="populate-studio-field__label">Imagen fija</span>
                  <span className="populate-studio-field__key">Usar la referencia conectada tal cual</span>
                </span>
                {connectedUrl ? (
                  <StudioThumb
                    url={connectedUrl}
                    alt={selected.label}
                    className="populate-studio-field__sample"
                  />
                ) : null}
                {!binding || binding.source === "fixed" ? (
                  <Check size={14} strokeWidth={2} className="populate-studio-field__check" aria-hidden />
                ) : null}
              </button>
            </li>
          </ul>
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
    onClose();
    onGenerateBatch();
  };

  const canGenerate = isDesignerTemplate
    ? Boolean(templateLabel) && datasetConnected && rowCount > 0
    : summary.canGenerate;

  const progressPct =
    progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  const portal = (
    <div
      className="populate-studio-root"
      data-foldder-studio-panel
      data-foldder-studio-canvas
      data-foldder-populate-studio
      style={{ "--populate-accent": POPULATE_ACCENT } as React.CSSProperties}
    >
      <FoldderStudioHeader
        nodeType="populate"
        nodeLabel={nodeLabel}
        subtitle="Dinamización por Dataset"
        onClose={onClose}
        actions={
          <div className="populate-studio-mode-toggle" role="group" aria-label="Modo de ejecución">
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

      <div className="populate-studio-body">
        {mode === "batch" ? (
          <>
            <aside className="populate-studio-col populate-studio-col--left">
              <div className="populate-studio-col__head">
                <span className="populate-studio-col__title">
                  {isDesignerTemplate ? "Campos dinámicos" : "Dinamizar"}
                </span>
                <span className="populate-studio-col__hint">
                  {isDesignerTemplate ? "del Designer" : "elementos clicables"}
                </span>
              </div>
              {lists.length > 1 ? (
                <select
                  className="populate-studio-list-select"
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
                <span className="populate-studio-loading">
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
                  <p className="populate-studio-center__empty">
                    Ningún objeto marcado como dinámico todavía.
                  </p>
                )
              ) : (
                <>
                  <StudioSlotList slots={slots} selectedId={effectiveSelectedId} onSelect={setSelectedId} />
                  {activeImageRefs.length > 0 ? (
                    <div className="populate-studio-ref-strip">
                      <span className="populate-studio-ref-strip__label">
                        <ImageIcon size={13} strokeWidth={1.75} aria-hidden />
                        Referencias conectadas
                      </span>
                      <div className="populate-studio-ref-strip__grid">
                        {activeImageRefs.map((ref) => (
                          <button
                            key={ref.inputId}
                            type="button"
                            className={`populate-studio-ref-strip__item${effectiveSelectedId === `ref:${ref.inputId}` ? " is-selected" : ""}`}
                            onClick={() => setSelectedId(`ref:${ref.inputId}`)}
                            title={ref.label}
                          >
                            <StudioThumb url={ref.fixedUrl} alt={ref.label} className="populate-studio-ref-strip__thumb" />
                            <span>{ref.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </>
              )}
            </aside>

            <main className="populate-studio-col populate-studio-col--center">{renderCenter()}</main>

            <aside className="populate-studio-col populate-studio-col--right">
              <div className="populate-studio-col__scroll">
                <div className="populate-studio-col__head">
                  <span className="populate-studio-col__title">Resumen</span>
                  <span className="populate-studio-col__hint">antes de generar</span>
                </div>
                <div className="populate-studio-summary">
                  {isDesignerTemplate ? (
                    <DesignerStudioSummaryPanel
                      templateLabel={templateLabel ?? "—"}
                      listName={listName}
                      rowCount={rowCount}
                      slideCount={designerSlideCount}
                      fields={designerPendingFields.length}
                      mappedCount={designerMappedCount}
                      pendingCount={designerUnmappedCount}
                    />
                  ) : (
                    <StudioSummaryPanel summary={summary} />
                  )}
                </div>
                {isDesignerTemplate ? (
                  designerUnmappedCount > 0 ? (
                    <ul className="populate-studio-blockers">
                      <li>
                        <AlertTriangle size={14} strokeWidth={2} aria-hidden />
                        {designerUnmappedCount} campo{designerUnmappedCount === 1 ? "" : "s"} sin
                        columna: quedará{designerUnmappedCount === 1 ? "" : "n"} fijo
                        {designerUnmappedCount === 1 ? "" : "s"} con el valor de la plantilla.
                      </li>
                    </ul>
                  ) : null
                ) : summary.blockers.length > 0 ? (
                  <ul className="populate-studio-blockers">
                    {summary.blockers.map((b) => (
                      <li key={b}>
                        <AlertTriangle size={14} strokeWidth={2} aria-hidden />
                        {b}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {datasetConnected && listId ? (
                  <PopulateDatasetOutputPanel
                    settings={datasetOutput}
                    schema={schema}
                    templateLabel={templateLabel}
                    lastWriteSummary={lastDatasetWriteSummary}
                    onChange={onChangeDatasetOutput}
                    variant={isDesignerTemplate ? "designer" : "image"}
                  />
                ) : null}
                {!isDesignerTemplate && rowCount > 0 ? (
                  <label className="populate-studio-preview-row">
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
                  className="populate-studio-generate"
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
                  <div className="populate-studio-progress">
                    <div
                      className="populate-studio-progress__bar"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                ) : null}
              </div>

              {!isDesignerTemplate && (previewLoading || previewUrl) && mode === "batch" ? (
                <div className="populate-studio-preview-panel">
                  <span className="populate-studio-preview-panel__label">
                    <Eye size={14} strokeWidth={1.75} aria-hidden />
                    Vista previa · fila {previewRowIndex + 1}
                  </span>
                  <div className="populate-studio-preview-panel__frame">
                    {previewLoading ? (
                      <div className="populate-studio-preview-panel__loading">
                        <Loader2 size={28} className="animate-spin" style={{ color: POPULATE_ACCENT }} />
                        <span>Generando vista previa…</span>
                      </div>
                    ) : previewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={previewUrl} alt="Vista previa" className="populate-studio-preview-panel__img" draggable={false} />
                    ) : null}
                  </div>
                </div>
              ) : null}
            </aside>
          </>
        ) : (
          <>
            <aside className="populate-studio-col populate-studio-col--left populate-studio-col--form">
              <div className="populate-studio-col__head">
                <span className="populate-studio-col__title">
                  {isDesignerTemplate ? "Campos dinámicos" : "Variables"}
                </span>
                <span className="populate-studio-col__hint">del formulario</span>
              </div>
              {isDesignerTemplate ? (
                !designerFormModel || designerFormModel.empty ? (
                  <p className="populate-studio-center__empty">
                    Marca objetos como campo dinámico en el Designer.
                  </p>
                ) : (
                  <ul className="populate-studio-slots">
                    {designerFormModel.fields.map((f) => (
                      <li key={f.slotKey}>
                        <span className="populate-studio-form-var">
                          {f.kind === "image" ? <ImageIcon size={12} /> : <Type size={12} />}
                          {f.label}
                        </span>
                      </li>
                    ))}
                  </ul>
                )
              ) : formModel.empty ? (
                <p className="populate-studio-center__empty">
                  Mapea variables en modo Lote antes de usar el formulario.
                </p>
              ) : (
                <ul className="populate-studio-slots">
                  {formModel.textFields.map((f) => (
                    <li key={f.fieldKey}>
                      <span className="populate-studio-form-var">
                        <Type size={12} />
                        {f.label}
                      </span>
                    </li>
                  ))}
                  {formModel.imageFields.map((f) => (
                    <li key={f.inputId}>
                      <span className="populate-studio-form-var">
                        <ImageIcon size={12} />
                        {f.label}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </aside>
            <main className="populate-studio-col populate-studio-col--center populate-studio-col--form-center">
              {renderCenter()}
            </main>
            <aside className="populate-studio-col populate-studio-col--right">
              <div className="populate-studio-col__head">
                <span className="populate-studio-col__title">Resumen</span>
              </div>
              <div className="populate-studio-summary">
                <p className="populate-studio-summary__line">Modo formulario · una pieza al instante</p>
                <p className="populate-studio-summary__line">
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

      {error ? (
        <div className="populate-studio-toast">
          <span className="populate-studio-toast__error">
            <AlertTriangle size={12} /> {error}
          </span>
        </div>
      ) : null}

      {lastRunOutputs.length > 0 ? (
        <footer className="populate-studio-results">
          <div className="populate-studio-results__head">
            <Sparkles size={13} />
            <span>
              {lastRunOutputs.length} imagen{lastRunOutputs.length === 1 ? "" : "es"} generada
              {lastRunOutputs.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="populate-studio-results__grid">
            {lastRunOutputs.map((url, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <a key={`${url}-${i}`} href={url} target="_blank" rel="noreferrer" className="populate-studio-results__thumb">
                <img src={url} alt={`Resultado ${i + 1}`} draggable={false} />
              </a>
            ))}
          </div>
        </footer>
      ) : null}
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(portal, document.body);
}
