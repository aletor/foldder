"use client";

/**
 * Executor de Prompt Enhancer (enhancer): prompt de entrada → prompt mejorado (texto).
 */

import { enhancePromptForPopulate } from "../transports/populate-enhance";
import {
  bindableVarsForNodeType,
  portText,
  type NodeExecutor,
} from "../node-executor";

export const enhancerExecutor: NodeExecutor = {
  type: "enhancer",
  mode: "input-binding",

  getBindableVariables(node) {
    return bindableVarsForNodeType(node.type);
  },

  async execute({ node, inputs, overrides }) {
    const prompt = String(
      overrides.prompt ?? portText(inputs) ?? node.data?.value ?? "",
    ).trim();
    if (!prompt) {
      throw new Error("Prompt Enhancer: no hay prompt de entrada para mejorar.");
    }
    const text = await enhancePromptForPopulate({ prompt });
    return { kind: "text", text };
  },

  estimateCost() {
    return { costUsd: 0.01, label: "Mejorar prompt" };
  },
};
