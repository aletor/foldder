"use client";

/**
 * Executor de Prompt Concatenator: une p0…p7 en un solo prompt (texto).
 * Misma lógica que el nodo en lienzo: partes unidas con espacio.
 */

import {
  bindableVarsForNodeType,
  collectTextFromPromptSlots,
  type NodeExecutor,
} from "../node-executor";

export const concatenatorExecutor: NodeExecutor = {
  type: "concatenator",
  mode: "input-binding",

  getBindableVariables(node) {
    return bindableVarsForNodeType(node.type);
  },

  async execute({ inputs, overrides }) {
    const text = collectTextFromPromptSlots(inputs, " ", overrides);
    if (!text) {
      throw new Error("Concatenator: no hay prompts conectados para combinar.");
    }
    return { kind: "text", text };
  },

  estimateCost() {
    return { costUsd: 0, label: "Combinar prompts" };
  },
};
