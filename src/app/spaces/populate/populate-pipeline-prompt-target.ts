/**
 * Dónde inyectar el prompt del Studio / bindings en una tubería de Populate.
 *
 * Si hay Concatenator (o Enhancer) upstream del generador de imagen, el prompt debe
 * llegar a ese nodo (p0), no saltárselo y aplicarse solo al Image Creation downstream.
 */

import type { PipelineAnalysis, PipelineEdge } from "./pipeline/discover-pipeline";
import type { ExecutorNode } from "./pipeline/node-executor";
import { NUMBERED_PROMPT_NODE_TYPES } from "./pipeline/node-executor";
import { namespacedBindingKey } from "./pipeline/pipeline-bindings";
import type { PopulateInputBinding } from "./populate-types";
import {
  buildMultiChannelPromptTemplatesByNodeId,
  composeChannelEffectivePrompt,
  type ChannelPromptParts,
} from "./populate-channel-prompt";

/** Tipos que consumen el prompt de plantilla de Populate dentro de la tubería. */
export const PROMPT_PIPELINE_NODE_TYPES = new Set([
  "concatenator",
  "enhancer",
  "nanoBanana",
  "imageCreationAdvanced",
]);

export const IMAGE_GENERATOR_NODE_TYPES = new Set(["nanoBanana", "imageCreationAdvanced"]);

const IMAGE_BINDING_INPUT_IDS = new Set(["image", "image2", "image3", "image4", "video"]);

export function findImageGeneratorNodeIds(
  analysis: Pick<PipelineAnalysis, "order">,
  nodeById: Map<string, ExecutorNode>,
): string[] {
  return analysis.order.filter((id) => {
    const t = nodeById.get(id)?.type;
    return t != null && IMAGE_GENERATOR_NODE_TYPES.has(t);
  });
}

function bindingInputId(key: string, binding: PopulateInputBinding): string {
  return binding.inputId?.trim() || key;
}

function isImageBindingKey(key: string, binding: PopulateInputBinding): boolean {
  return IMAGE_BINDING_INPUT_IDS.has(bindingInputId(key, binding));
}

function isPromptBindingKey(key: string, binding: PopulateInputBinding): boolean {
  const inputId = bindingInputId(key, binding);
  return inputId === "prompt" || inputId === "p0";
}

/** Primer nodo de la tubería que debe recibir el templatePrompt / binding de prompt. */
export function findPromptTemplateTargetNodeId(
  analysis: Pick<PipelineAnalysis, "order" | "sinkId">,
  nodeById: Map<string, ExecutorNode>,
): string | null {
  for (const id of analysis.order) {
    const t = nodeById.get(id)?.type;
    if (t && PROMPT_PIPELINE_NODE_TYPES.has(t)) return id;
  }
  return analysis.sinkId ?? null;
}

/** Clave de binding local según el tipo de nodo (concat/enhancer usan p0). */
export function promptBindingKeyForNodeType(
  nodeType: string | undefined,
  legacyKey: string,
): string {
  if (legacyKey === "prompt" && nodeType && NUMBERED_PROMPT_NODE_TYPES.has(nodeType)) {
    return "p0";
  }
  return legacyKey;
}

/** Image Creation upstream inmediato de un sink (p. ej. Background Remover). */
export function findImageGeneratorUpstreamOf(
  sinkId: string,
  edges: readonly PipelineEdge[],
  pipelineNodeIds: ReadonlySet<string>,
  nodeById: Map<string, ExecutorNode>,
): string | null {
  const queue = [sinkId];
  const seen = new Set<string>();
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const e of edges) {
      if (e.target !== id) continue;
      if (!pipelineNodeIds.has(e.source)) continue;
      const t = nodeById.get(e.source)?.type;
      if (t && IMAGE_GENERATOR_NODE_TYPES.has(t)) return e.source;
      queue.push(e.source);
    }
  }
  return null;
}

export function adaptPopulateBindingsForPipeline(
  bindings: Record<string, PopulateInputBinding> | undefined,
  analysis: PipelineAnalysis,
  nodeById: Map<string, ExecutorNode>,
): Record<string, PopulateInputBinding> {
  if (!bindings) return {};
  const out: Record<string, PopulateInputBinding> = { ...bindings };
  const promptTargetId = findPromptTemplateTargetNodeId(analysis, nodeById);
  const promptTargetType = promptTargetId ? nodeById.get(promptTargetId)?.type : undefined;
  const imageGeneratorIds = findImageGeneratorNodeIds(analysis, nodeById);

  for (const [key, binding] of Object.entries(bindings)) {
    if (key.includes(".")) continue;

    if (isImageBindingKey(key, binding)) {
      const inputId = bindingInputId(key, binding);
      for (const genId of imageGeneratorIds) {
        const ns = namespacedBindingKey(genId, inputId);
        if (!(ns in out)) out[ns] = { ...binding, inputId };
      }
      continue;
    }

    if (isPromptBindingKey(key, binding) && promptTargetId) {
      const localKey = promptBindingKeyForNodeType(promptTargetType, key);
      const ns = namespacedBindingKey(promptTargetId, localKey);
      if (!(ns in out)) out[ns] = { ...binding, inputId: localKey };
    }
  }

  // Bindings ya namespaced al generador downstream → reflejar en concatenator/enhancer (p0).
  if (promptTargetId && promptTargetType && NUMBERED_PROMPT_NODE_TYPES.has(promptTargetType)) {
    const nsTarget = namespacedBindingKey(promptTargetId, "p0");
    if (!out[nsTarget]) {
      for (const id of imageGeneratorIds) {
        const from = bindings[namespacedBindingKey(id, "prompt")] ?? bindings.prompt;
        if (from) {
          out[nsTarget] = { ...from, inputId: "p0" };
          break;
        }
      }
    }
  }

  return out;
}

export function buildPromptTemplatesByNodeId(args: {
  analysis: PipelineAnalysis;
  templatePrompt?: string;
  nodeById: Map<string, ExecutorNode>;
}): Record<string, string> | undefined {
  const trimmed = args.templatePrompt?.trim();
  if (!trimmed) return undefined;

  const targetId = findPromptTemplateTargetNodeId(args.analysis, args.nodeById);
  if (!targetId) return undefined;
  return { [targetId]: trimmed };
}

/** Multi-canal: plantilla base al target compartido + delta por generador upstream de cada sink. */
export function buildMultiChannelPipelinePromptTemplates(args: {
  channels: readonly ChannelPromptParts[];
  analysis: PipelineAnalysis;
  edges: readonly PipelineEdge[];
  nodeById: Map<string, ExecutorNode>;
  templatePrompt?: string;
}): Record<string, string> | undefined {
  const pipelineIds = new Set(args.analysis.pipelineNodeIds);
  const out: Record<string, string> = {};

  const base = args.templatePrompt?.trim();
  const sharedTarget = findPromptTemplateTargetNodeId(args.analysis, args.nodeById);
  if (sharedTarget && base) out[sharedTarget] = base;

  const multi = buildMultiChannelPromptTemplatesByNodeId(args.channels) ?? {};
  for (const ch of args.channels) {
    const effective = multi[ch.channelId] ?? composeChannelEffectivePrompt(ch.nodePrompt, ch.channelPrompt);
    if (!effective.trim()) continue;
    const genId = findImageGeneratorUpstreamOf(ch.channelId, args.edges, pipelineIds, args.nodeById);
    const assignId = genId ?? ch.channelId;
    if (assignId === sharedTarget && sharedTarget && base) {
      // Target compartido (concatenator): el delta del canal va al generador de ese carril.
      if (genId && genId !== sharedTarget) out[genId] = effective;
      continue;
    }
    out[assignId] = effective;
  }

  return Object.keys(out).length > 0 ? out : undefined;
}
