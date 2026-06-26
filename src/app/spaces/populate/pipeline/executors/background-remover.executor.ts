"use client";

/**
 * Executor de Background Remover para tuberías de Populate.
 * Imagen de entrada → recorte RGBA vía `/api/spaces/matte`.
 */

import { matteImageForPopulate } from "../transports/populate-matte";
import {
  bindableVarsForNodeType,
  collectImageRefs,
  firstPortOfKind,
  type NodeExecutor,
} from "../node-executor";
import { resolveMediaRefsForApi } from "../resolve-media-ref-for-api";

export const backgroundRemoverExecutor: NodeExecutor = {
  type: "backgroundRemover",
  mode: "input-binding",

  getBindableVariables(node) {
    return bindableVarsForNodeType(node.type);
  },

  async execute({ node, inputs }) {
    const data = node.data ?? {};
    const refs = collectImageRefs(inputs, ["media"]);
    const imageUrls = await resolveMediaRefsForApi(refs);
    const fallback = firstPortOfKind(inputs, "image");
    const image =
      imageUrls[0] ??
      (fallback?.kind === "image" ? fallback.url : undefined);
    if (!image?.trim()) {
      throw new Error("Background Remover: no hay imagen de entrada para procesar.");
    }

    const { rgbaImage, rgbaUrl, rgbaS3Key } = await matteImageForPopulate({
      image,
      threshold: typeof data.threshold === "number" ? data.threshold : 0.9,
      expansion: typeof data.expansion === "number" ? data.expansion : 0,
      feather: typeof data.feather === "number" ? data.feather : 0.6,
    });

    return {
      kind: "image",
      url: rgbaUrl || rgbaImage,
      s3Key: rgbaS3Key,
    };
  },

  estimateCost() {
    return { costUsd: 0.01, label: "Quitar fondo" };
  },
};
