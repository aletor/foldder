"use client";

/**
 * Executor de Designer (node-clone): rasteriza las páginas de la instancia con los bindings de la
 * fila resueltos y devuelve un slide por página. El rasterizado depende del DOM (portal headless),
 * así que se inyecta vía `ctx.capabilities.rasterizeDesignerPages`; sin esa capacidad, el executor
 * falla con un mensaje claro en lugar de intentar generar.
 */

import type { NodeExecutor } from "../node-executor";

export const designerExecutor: NodeExecutor = {
  type: "designer",
  mode: "node-clone",

  getBindableVariables() {
    // node-clone: los campos dinámicos son por instancia (se descubren de las páginas, no aquí).
    return [];
  },

  async execute({ node, overrides, ctx }) {
    const rasterize = ctx.capabilities?.rasterizeDesignerPages;
    if (!rasterize) {
      throw new Error(
        "Designer no se puede ejecutar en este entorno: falta la capacidad de rasterizado.",
      );
    }
    const items = await rasterize({ node, overrides, rowIndex: ctx.rowIndex });
    if (!items.length) {
      throw new Error("Designer no produjo ningún slide.");
    }
    return { kind: "image", url: items[0].url, s3Key: items[0].s3Key, items };
  },

  estimateCost() {
    // El rasterizado no es generativo (sin coste de IA); el coste real es de almacenamiento.
    return { costUsd: 0, label: "Rasterizar Designer" };
  },
};
