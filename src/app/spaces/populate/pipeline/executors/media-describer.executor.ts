"use client";

/**
 * Executor de Image Describer (mediaDescriber): imagen de entrada → texto.
 * Permite encadenar "Image Creation → Describer → …" dentro de una tubería de Populate.
 */

import { describeImageForPopulate } from "../transports/populate-describe";
import {
  bindableVarsForNodeType,
  firstPortOfKind,
  type NodeExecutor,
} from "../node-executor";

export const mediaDescriberExecutor: NodeExecutor = {
  type: "mediaDescriber",
  mode: "input-binding",

  getBindableVariables(node) {
    return bindableVarsForNodeType(node.type);
  },

  async execute({ inputs }) {
    const img = firstPortOfKind(inputs, "image");
    if (!img || img.kind !== "image" || !img.url.trim()) {
      throw new Error("Image Describer: no hay imagen de entrada para describir.");
    }
    const text = await describeImageForPopulate({ url: img.url, s3Key: img.s3Key });
    return { kind: "text", text };
  },

  estimateCost() {
    return { costUsd: 0.01, label: "Describir imagen" };
  },
};
