"use client";

import type { Edge, Node } from "@xyflow/react";

import { resolvePromptValueFromEdgeSource } from "./canvas-group-logic";
import { mergeLiveStudioNodeDataIntoNodes } from "./studio-live-documents";

/**
 * URL de imagen/vídeo lista para APIs del servidor desde la arista de entrada.
 * Fusiona datos de studio en vivo antes de resolver el valor de la fuente.
 */
export function resolveMediaUrlFromEdgeSource(
  edge: Pick<Edge, "source" | "sourceHandle">,
  nodes: Node[],
  _edges: Edge[],
): string {
  const mergedNodes = mergeLiveStudioNodeDataIntoNodes(nodes);
  const primary = String(resolvePromptValueFromEdgeSource(edge, mergedNodes) ?? "").trim();
  const sourceNode = mergedNodes.find((n) => n.id === edge.source);
  if (!sourceNode) return primary;

  if (sourceNode.type === "space") {
    const sd = sourceNode.data as { value?: string };
    return String(sd?.value ?? primary).trim();
  }

  return primary;
}

/** Convierte `blob:` a data URL; el resto pasa tal cual (http, data, rutas S3 estables). */
export async function ensureServerReadableMediaUrl(url: string): Promise<string> {
  const trimmed = url.trim();
  if (!trimmed) throw new Error("No media URL available to describe.");
  if (!trimmed.startsWith("blob:")) return trimmed;

  try {
    const res = await fetch(trimmed);
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = typeof reader.result === "string" ? reader.result : "";
        if (result) resolve(result);
        else reject(new Error("Could not read local preview image."));
      };
      reader.onerror = () =>
        reject(new Error("Could not read local preview image."));
      reader.readAsDataURL(blob);
    });
  } catch {
    throw new Error(
      "Could not read the local preview image. Close the studio to export, or wait a moment and try again.",
    );
  }
}

/**
 * URL lista para Image Describer: resuelve desde la arista, convierte blob: a data URL
 * y valida que haya contenido.
 */
export async function resolveMediaUrlForDescriber(
  edge: Pick<Edge, "source" | "sourceHandle">,
  nodes: Node[],
  edges: Edge[],
): Promise<string> {
  const url = resolveMediaUrlFromEdgeSource(edge, nodes, edges);

  if (!url.trim()) {
    throw new Error(
      "No image to describe. Close the studio to export the canvas, or connect an image input.",
    );
  }

  return ensureServerReadableMediaUrl(url);
}
