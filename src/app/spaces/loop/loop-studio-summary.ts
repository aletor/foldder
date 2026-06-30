/**
 * Loop Studio — slots dinámicos, resumen legible y bloqueadores de ejecución.
 */

import type { FieldDef } from "@/app/spaces/dataset/dataset-types";
import {
  estimateGeminiImageGenerationUsd,
  estimateOpenAiImageGenerationUsd,
  resolveOpenAiImageQuality,
} from "@/lib/pricing-config";
import type { ActiveImageRef } from "./loop-active-refs";
import type { LoopTemplateModel } from "./loop-generate";
import { extractPromptTokens } from "./loop-tokens";
import type { LoopBindings } from "./loop-types";

export type LoopStudioSlotKind = "prompt" | "token" | "ref";

export interface LoopStudioSlot {
  id: string;
  kind: LoopStudioSlotKind;
  label: string;
  /** Subtítulo corto (estado del mapeo). */
  status: string;
  /** Slot listo / válido para ejecutar. */
  ok: boolean;
  fieldKey?: string;
  inputId?: string;
  sourceLabel?: string;
  /** URL de la referencia conectada (solo refs). */
  thumbUrl?: string;
}

export interface LoopStudioSummary {
  templateLabel: string;
  listName: string;
  rowCount: number;
  tokenCount: number;
  activeRefCount: number;
  dynamicRefCount: number;
  /** Líneas narrativas para la columna derecha. */
  lines: string[];
  blockers: string[];
  canGenerate: boolean;
  costPerImageUsd: number;
  costTotalUsd: number;
}

function fieldLabel(schema: FieldDef[], constants: FieldDef[], fieldKey: string): string {
  const fromList = schema.find((f) => f.key === fieldKey);
  if (fromList) return fromList.label;
  const fromConst = constants.find((f) => f.key === fieldKey);
  if (fromConst) return fromConst.label;
  return fieldKey;
}

function fieldExists(schema: FieldDef[], constants: FieldDef[], fieldKey: string): boolean {
  return schema.some((f) => f.key === fieldKey) || constants.some((f) => f.key === fieldKey);
}

export function estimateLoopImageCostUsd(model: LoopTemplateModel): number {
  if (model.provider === "openai") {
    return estimateOpenAiImageGenerationUsd(
      model.resolution,
      resolveOpenAiImageQuality(model.resolution),
    );
  }
  return estimateGeminiImageGenerationUsd(model.modelKey, model.resolution);
}

export function buildLoopStudioSlots(args: {
  promptText: string;
  bindings: LoopBindings;
  activeImageRefs: ActiveImageRef[];
  schema: FieldDef[];
  constantFields: FieldDef[];
  promptLabel?: string;
}): LoopStudioSlot[] {
  const { promptText, bindings, activeImageRefs, schema, constantFields, promptLabel = "Prompt" } =
    args;
  const labelByFieldId = new Map(schema.map((f) => [f.id, f.label]));
  const tokens = extractPromptTokens(promptText);
  const slots: LoopStudioSlot[] = [
    {
      id: "prompt",
      kind: "prompt",
      label: promptLabel,
      status: tokens.length > 0 ? `${tokens.length} variable${tokens.length === 1 ? "" : "s"}` : "Texto fijo",
      ok: promptText.trim().length > 0,
    },
  ];

  for (const fieldKey of tokens) {
    const valid = fieldExists(schema, constantFields, fieldKey);
    slots.push({
      id: `token:${fieldKey}`,
      kind: "token",
      label: fieldLabel(schema, constantFields, fieldKey),
      status: valid ? `{${fieldKey}}` : "Columna no encontrada",
      ok: valid,
      fieldKey,
    });
  }

  for (const ref of activeImageRefs) {
    const binding = bindings[ref.inputId];
    let status = "Imagen fija (actual)";
    let ok = true;
    if (binding?.source === "column") {
      const col =
        (binding.fieldId ? labelByFieldId.get(binding.fieldId) : undefined) ??
        binding.fieldKey ??
        "columna";
      status = `Columna: ${col}`;
      ok = Boolean(binding.fieldId || binding.fieldKey);
    }
    slots.push({
      id: `ref:${ref.inputId}`,
      kind: "ref",
      label: ref.label,
      status,
      ok,
      inputId: ref.inputId,
      sourceLabel: ref.sourceLabel,
      thumbUrl: ref.fixedUrl,
    });
  }

  return slots;
}

export function buildLoopStudioSummary(args: {
  templateLabel: string;
  listName: string;
  rowCount: number;
  promptText: string;
  bindings: LoopBindings;
  activeImageRefs: ActiveImageRef[];
  schema: FieldDef[];
  constantFields: FieldDef[];
  model: LoopTemplateModel;
  datasetConnected: boolean;
  hasTemplate: boolean;
}): LoopStudioSummary {
  const {
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
    hasTemplate,
  } = args;

  const tokens = extractPromptTokens(promptText);
  const labelByFieldId = new Map(schema.map((f) => [f.id, f.label]));
  const dynamicRefs = activeImageRefs.filter((r) => bindings[r.inputId]?.source === "column");
  const costPerImageUsd = estimateLoopImageCostUsd(model);
  const costTotalUsd = costPerImageUsd * Math.max(0, rowCount);

  const blockers: string[] = [];
  if (!datasetConnected) blockers.push("Conecta un Dataset al nodo Loop.");
  if (!hasTemplate) blockers.push("Conecta Image Creation → salida Image out.");
  if (rowCount === 0) blockers.push("El listado no tiene filas.");
  if (!promptText.trim()) blockers.push("Escribe un prompt en la plantilla.");

  for (const key of tokens) {
    if (!fieldExists(schema, constantFields, key)) {
      blockers.push(`Variable «${key}» no existe en el Dataset.`);
    }
  }

  for (const ref of activeImageRefs) {
    const b = bindings[ref.inputId];
    if (b?.source === "column" && !b.fieldId && !b.fieldKey) {
      blockers.push(`${ref.label}: elige una columna de imagen.`);
    }
  }

  const refParts: string[] = [];
  if (activeImageRefs.length === 0) {
    refParts.push("sin referencias conectadas");
  } else {
    refParts.push(`${activeImageRefs.length} conectada${activeImageRefs.length === 1 ? "" : "s"}`);
    if (dynamicRefs.length > 0) {
      const names = dynamicRefs.map((r) => {
        const b = bindings[r.inputId];
        const col =
          (b?.fieldId ? labelByFieldId.get(b.fieldId) : undefined) ?? b?.fieldKey ?? "columna";
        return `${r.label} → «${col}»`;
      });
      refParts.push(names.join(", "));
    } else {
      refParts.push("todas fijas");
    }
  }

  const lines = [
    `Nodo: ${templateLabel}`,
    `Listado: ${listName} · ${rowCount} fila${rowCount === 1 ? "" : "s"}`,
    tokens.length > 0
      ? `Prompt: ${tokens.length} variable${tokens.length === 1 ? "" : "s"} del Dataset`
      : "Prompt: texto fijo (sin variables)",
    `Referencias: ${refParts.join(" · ")}`,
    `Resultados esperados: ${rowCount} imagen${rowCount === 1 ? "" : "es"}`,
    `Coste estimado: ~$${costTotalUsd.toFixed(2)} (${rowCount} × ~$${costPerImageUsd.toFixed(3)})`,
  ];

  return {
    templateLabel,
    listName,
    rowCount,
    tokenCount: tokens.length,
    activeRefCount: activeImageRefs.length,
    dynamicRefCount: dynamicRefs.length,
    lines,
    blockers,
    canGenerate: blockers.length === 0,
    costPerImageUsd,
    costTotalUsd,
  };
}

/** Resumen compacto para el nodo exterior en el canvas. */
export function buildLoopCompactSummary(args: {
  listName: string;
  rowCount: number;
  templateLabel: string | null;
  tokenCount: number;
  dynamicRefCount: number;
  activeRefCount: number;
  mode: "batch" | "form";
  hasShareToken: boolean;
}): string {
  const {
    listName,
    rowCount,
    templateLabel,
    tokenCount,
    dynamicRefCount,
    activeRefCount,
    mode,
    hasShareToken,
  } = args;
  if (!templateLabel) return "Conecta Dataset e Image Creation";
  const dyn =
    tokenCount + dynamicRefCount > 0
      ? `${tokenCount} var · ${dynamicRefCount}/${activeRefCount} refs dinámicas`
      : activeRefCount > 0
        ? `${activeRefCount} ref fija${activeRefCount === 1 ? "" : "s"}`
        : "sin variables";
  const modeBit = mode === "form" ? (hasShareToken ? " · URL pública" : " · formulario") : "";
  return `${templateLabel} · ${listName} · ${rowCount} filas · ${dyn}${modeBit}`;
}
