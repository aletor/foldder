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
import {
  estimateExpectedImageGenerations,
  listColumnTokensInPrompt,
  loopWillIteratePerRow,
} from "./loop-dataset-bound";
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
  /** Generaciones de imagen esperadas (API), no solo filas del listado. */
  expectedImageCount: number;
  /** True si el lote itera por filas (tokens de listado o bindings de columna). */
  willIterate: boolean;
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
  manualTokenValues?: Record<string, string>;
}): LoopStudioSlot[] {
  const {
    promptText,
    bindings,
    activeImageRefs,
    schema,
    constantFields,
    promptLabel = "Prompt",
    manualTokenValues,
  } = args;
  const labelByFieldId = new Map(schema.map((f) => [f.id, f.label]));
  const tokens = extractPromptTokens(promptText);
  const listKeys = schema.map((f) => f.key);
  const iteratingTokens = new Set(
    listColumnTokensInPrompt(promptText, listKeys, manualTokenValues),
  );
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
    const isListIterating = iteratingTokens.has(fieldKey);
    const isConst = constantFields.some((f) => f.key === fieldKey);
    const manual = manualTokenValues?.[fieldKey];
    const isManual = typeof manual === "string" && manual.trim() !== "";
    let status = `{${fieldKey}}`;
    if (!valid) status = "Columna no encontrada";
    else if (isManual) status = `{${fieldKey}} · manual (fijo)`;
    else if (isListIterating) status = `{${fieldKey}} · itera por fila`;
    else if (isConst) status = `{${fieldKey}} · constante`;
    slots.push({
      id: `token:${fieldKey}`,
      kind: "token",
      label: fieldLabel(schema, constantFields, fieldKey),
      status,
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
  manualTokenValues?: Record<string, string>;
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
    manualTokenValues,
  } = args;

  const tokens = extractPromptTokens(promptText);
  const listFieldKeys = schema.map((f) => f.key);
  const listTokens = listColumnTokensInPrompt(promptText, listFieldKeys, manualTokenValues);
  const labelByFieldId = new Map(schema.map((f) => [f.id, f.label]));
  const dynamicRefs = activeImageRefs.filter((r) => bindings[r.inputId]?.source === "column");
  const willIterate = loopWillIteratePerRow({
    promptText,
    bindings,
    listFieldKeys,
    manualTokenValues,
  });
  const expectedImageCount = estimateExpectedImageGenerations({
    rowCount,
    willIterate,
    hasTemplate,
  });
  const costPerImageUsd = estimateLoopImageCostUsd(model);
  const costTotalUsd = costPerImageUsd * Math.max(0, expectedImageCount);

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

  // Defensa: tokens de listado sin plantilla creativa no pueden iterar (ya bloqueado arriba).
  if (listTokens.length > 0 && !hasTemplate) {
    blockers.push(
      "El prompt usa columnas del listado: conecta Image Creation para generar una imagen por fila.",
    );
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

  const promptLine =
    listTokens.length > 0
      ? `Prompt: ${listTokens.length} variable${listTokens.length === 1 ? "" : "s"} del listado (itera)`
      : tokens.length > 0
        ? `Prompt: ${tokens.length} variable${tokens.length === 1 ? "" : "s"} (fijas / constantes)`
        : "Prompt: texto fijo (sin variables)";

  const resultsLine = willIterate
    ? `Resultados esperados: ${expectedImageCount} imagen${expectedImageCount === 1 ? "" : "es"} (1 por fila)`
    : `Resultados esperados: ${expectedImageCount} imagen${expectedImageCount === 1 ? "" : "es"} (plantilla fija)`;

  const lines = [
    `Nodo: ${templateLabel}`,
    `Listado: ${listName} · ${rowCount} fila${rowCount === 1 ? "" : "s"}`,
    promptLine,
    `Referencias: ${refParts.join(" · ")}`,
    resultsLine,
    `Coste estimado: ~$${costTotalUsd.toFixed(2)} (${expectedImageCount} × ~$${costPerImageUsd.toFixed(3)})`,
  ];

  return {
    templateLabel,
    listName,
    rowCount,
    expectedImageCount,
    willIterate,
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
