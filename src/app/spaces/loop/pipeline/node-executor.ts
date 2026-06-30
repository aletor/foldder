/**
 * Loop como orquestador de subgrafo — contrato de ejecución por nodo (F1).
 *
 * El motor (F2) no conoce tipos de nodo: opera sobre `NodeExecutor`. Cada tipo de nodo
 * registra un executor que sabe (a) qué variables son bindeables a columnas del Dataset,
 * (b) cómo ejecutar UNA pasada con inputs ya resueltos y overrides de la fila, y (c) cuánto
 * cuesta una ejecución (para el preflight Σ del wallet).
 *
 * Reglas del contrato:
 *  - `execute` NO muta el output vivo del nodo en el lienzo. Lee de `inputs`/`overrides` y
 *    devuelve un `NodeOutput` nuevo. Sin efectos secundarios sobre el grafo.
 *  - `inputs` son los outputs de los nodos upstream DENTRO de esta pasada (el `scope`), ya
 *    resueltos a valores concretos por el motor (no se camina el grafo aquí).
 *  - `overrides` son los valores de variables resueltos de la fila del Dataset (namespaced por
 *    el motor a claves locales del nodo, p. ej. `prompt`).
 */

import type { FieldType } from "@/app/spaces/dataset/dataset-types";
import {
  datasetFieldTypesForInputKind,
  type CreativeInputKind,
} from "../loop-types";
import { getNodeOrchestrationDeclaration } from "../loop-declaration";

/** Referencia a un asset ya materializado (imagen/vídeo) con su URL y, si aplica, su clave S3. */
export interface ResolvedMediaRef {
  url: string;
  s3Key?: string;
}

/** Valor resuelto de un input de puerto, etiquetado por tipo lógico. */
export type PortInputValue =
  | { kind: "text"; text: string }
  | { kind: "image"; url: string; s3Key?: string }
  | { kind: "video"; url: string; s3Key?: string };

/** Inputs de un nodo en una pasada: por handle de entrada → valor resuelto. */
export interface PortInputs {
  byHandle: Record<string, PortInputValue | undefined>;
}

/** Overrides de variables de la fila (clave local del nodo → valor de la columna). */
export type VarOverrides = Record<string, unknown>;

/**
 * Capacidades dependientes del entorno (DOM, S3) que algunos executors necesitan y que el motor
 * inyecta. Mantiene `execute` uniforme: el executor de Designer (node-clone) rasteriza vía esta
 * capacidad sin arrastrar el portal headless al contrato puro.
 */
export interface ExecCapabilities {
  /** Rasteriza las páginas del Designer de una fila (con sus bindings resueltos) y sube a S3. */
  rasterizeDesignerPages?: (args: {
    node: ExecutorNode;
    overrides: VarOverrides;
    rowIndex: number;
  }) => Promise<ResolvedMediaRef[]>;
}

/** Contexto de una ejecución (una fila). */
export interface ExecCtx {
  ownerEmail: string;
  rowIndex: number;
  signal?: AbortSignal;
  onProgress?: (pct: number) => void;
  capabilities?: ExecCapabilities;
}

export type NodeOutputKind = "image" | "video" | "text";

/** Resultado de una pasada. `items` cubre salidas múltiples (p. ej. Designer multipágina). */
export interface NodeOutput {
  kind: NodeOutputKind;
  url?: string;
  s3Key?: string;
  text?: string;
  items?: ResolvedMediaRef[];
}

/** Variable bindeable a una columna del Dataset (vista por el panel de Loop). */
export interface BindableVar {
  /** Clave local del nodo (p. ej. "prompt", "image2"). Loop la namespacea como `<nodeId>.<key>`. */
  key: string;
  label: string;
  type: CreativeInputKind;
  /** Tipos de columna del Dataset compatibles. */
  accepts: FieldType[];
}

export interface WalletCostEstimate {
  costUsd: number;
  label: string;
}

/** Vista mínima de un nodo para los executors (no depende de React Flow). */
export interface ExecutorNode {
  id: string;
  type: string;
  data?: Record<string, unknown>;
}

export interface NodeExecutor {
  type: string;
  /** Estrategia: variar inputs por fila o clonar el nodo entero (Designer). */
  mode: "input-binding" | "node-clone";
  getBindableVariables(node: ExecutorNode): BindableVar[];
  execute(args: {
    node: ExecutorNode;
    inputs: PortInputs;
    overrides: VarOverrides;
    ctx: ExecCtx;
  }): Promise<NodeOutput>;
  estimateCost(args: { node: ExecutorNode; overrides: VarOverrides }): WalletCostEstimate;
}

// ── Helpers de inputs (compartidos por los executors) ────────────────────────

/** Variables bindeables derivadas de la declaración de orquestación del tipo de nodo. */
export function bindableVarsForNodeType(nodeType: string | undefined | null): BindableVar[] {
  const decl = getNodeOrchestrationDeclaration(nodeType);
  const all = [...decl.textInputs, ...decl.imageInputs, ...decl.videoInputs];
  return all.map((d) => ({
    key: d.inputId,
    label: d.label,
    type: d.kind,
    accepts: datasetFieldTypesForInputKind(d.kind),
  }));
}

/** Valor de un handle concreto. */
export function portValue(inputs: PortInputs, handle: string): PortInputValue | undefined {
  return inputs.byHandle[handle];
}

/** Primer input del tipo lógico pedido (útil para nodos con un único input de ese tipo). */
export function firstPortOfKind(
  inputs: PortInputs,
  kind: NodeOutputKind,
): PortInputValue | undefined {
  for (const value of Object.values(inputs.byHandle)) {
    if (value && value.kind === kind) return value;
  }
  return undefined;
}

/** Texto de un handle concreto o, si no se indica, del primer input de texto. */
export function portText(inputs: PortInputs, handle?: string): string {
  const value = handle ? inputs.byHandle[handle] : firstPortOfKind(inputs, "text");
  return value && value.kind === "text" ? value.text : "";
}

/** Ranuras p0…p7 de Concatenator / Enhancer / Listado en el lienzo. */
export const PROMPT_SLOT_HANDLES = [
  "p0",
  "p1",
  "p2",
  "p3",
  "p4",
  "p5",
  "p6",
  "p7",
] as const;

export const NUMBERED_PROMPT_NODE_TYPES = new Set(["concatenator", "enhancer", "listado"]);

/** Concatena textos de p0…p7 en orden (overrides de fila tienen prioridad por ranura). */
export function collectTextFromPromptSlots(
  inputs: PortInputs,
  separator: string,
  overrides: VarOverrides = {},
): string {
  const parts: string[] = [];
  for (const h of PROMPT_SLOT_HANDLES) {
    const overrideText =
      typeof overrides[h] === "string" ? String(overrides[h]).trim() : "";
    const val = inputs.byHandle[h];
    const text = overrideText || (val?.kind === "text" ? val.text.trim() : "");
    if (text) parts.push(text);
  }
  return parts.join(separator).trim();
}

/**
 * Refs de imagen en orden: primero los handles indicados (p. ej. image, image2…), y luego
 * cualquier otro handle de imagen presente, para no perder refs no previstas.
 */
export function collectImageRefs(
  inputs: PortInputs,
  orderedHandles: string[] = [],
): ResolvedMediaRef[] {
  const out: ResolvedMediaRef[] = [];
  const seen = new Set<string>();
  const pushHandle = (handle: string) => {
    if (seen.has(handle)) return;
    seen.add(handle);
    const v = inputs.byHandle[handle];
    if (v && v.kind === "image" && v.url) out.push({ url: v.url, s3Key: v.s3Key });
  };
  for (const h of orderedHandles) pushHandle(h);
  for (const h of Object.keys(inputs.byHandle).sort()) pushHandle(h);
  return out;
}
