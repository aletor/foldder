/**
 * Populate — lectura de nodos creativos POR DECLARACIÓN (no hardcode).
 *
 * Este es el punto central de la arquitectura: Populate descubre qué inputs puede
 * variar un nodo creativo leyendo la declaración estándar que el nodo expone en
 * `NODE_REGISTRY[type].orchestration`. NO hay conocimiento codificado "los Image
 * Creation tienen un prompt y 4 refs": eso vive en el registro del propio nodo.
 *
 * Añadir un nodo nuevo (Video Creation, Designer, Guionista) = el nodo se describe
 * en su registro; Populate no se toca.
 *
 * Fallback robusto: si un nodo no declara `orchestration` explícitamente, derivamos
 * sus inputs orquestables desde los tipos de sus handles de entrada (prompt/txt →
 * texto, image → imagen, video → vídeo). Así un nodo nuevo es orquestable por
 * defecto aunque aún no se haya afinado su declaración.
 */

import { NODE_REGISTRY } from "@/app/spaces/nodeRegistry";
import {
  creativeInputKindFromHandleType,
  type CreativeInputDescriptor,
} from "./populate-types";

export interface NodeOrchestrationDeclaration {
  /** Inputs de texto variables (p. ej. el prompt). */
  textInputs: CreativeInputDescriptor[];
  /** Inputs de imagen variables (referencias). */
  imageInputs: CreativeInputDescriptor[];
  /** Inputs de vídeo variables (para nodos futuros). */
  videoInputs: CreativeInputDescriptor[];
  /** Clave en `node.data` con el prompt inline que sirve de semilla. */
  promptDataKey?: string;
  /** El nodo declara (o deriva) al menos un input orquestable. */
  orchestrable: boolean;
}

const EMPTY: NodeOrchestrationDeclaration = {
  textInputs: [],
  imageInputs: [],
  videoInputs: [],
  orchestrable: false,
};

function split(
  descriptors: CreativeInputDescriptor[],
  promptDataKey: string | undefined,
): NodeOrchestrationDeclaration {
  return {
    textInputs: descriptors.filter((d) => d.kind === "text"),
    imageInputs: descriptors.filter((d) => d.kind === "image"),
    videoInputs: descriptors.filter((d) => d.kind === "video"),
    promptDataKey,
    orchestrable: descriptors.length > 0,
  };
}

/**
 * Devuelve la declaración de inputs orquestables de un tipo de nodo.
 * Prioriza la declaración explícita del registro; si no, deriva de los handles.
 */
export function getNodeOrchestrationDeclaration(
  nodeType: string | undefined | null,
): NodeOrchestrationDeclaration {
  if (!nodeType) return EMPTY;
  const meta = NODE_REGISTRY[nodeType];
  if (!meta) return EMPTY;

  // 1) Declaración explícita (preferida): el nodo dice exactamente qué expone.
  const explicit = meta.orchestration;
  if (explicit?.inputs?.length) {
    const descriptors: CreativeInputDescriptor[] = explicit.inputs.map((i) => ({
      inputId: i.id,
      label: i.label,
      kind: i.kind,
    }));
    return split(descriptors, explicit.promptDataKey);
  }

  // 2) Fallback: derivar de los tipos de los handles de entrada.
  const derived: CreativeInputDescriptor[] = [];
  for (const input of meta.inputs ?? []) {
    const kind = creativeInputKindFromHandleType(input.type);
    if (!kind) continue;
    derived.push({ inputId: input.id, label: input.label, kind });
  }
  return split(derived, undefined);
}

/** ¿Este tipo de nodo es orquestable por Populate (declarado o derivado)? */
export function isOrchestrableNodeType(nodeType: string | undefined | null): boolean {
  return getNodeOrchestrationDeclaration(nodeType).orchestrable;
}
