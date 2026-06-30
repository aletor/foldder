import type { MediaListOutput } from "@/app/spaces/media-list-output";

export type PopulateRunOutput = {
  value: string;
  lastRunOutputs: string[];
  mediaListOutput: MediaListOutput;
};

/** Empaqueta slides generadas para el handle `out` y Export Multimedia. */
export function buildPopulateRunOutput(args: {
  nodeId: string;
  label: string;
  slideUrls: string[];
  templateLabel?: string;
}): PopulateRunOutput {
  const { nodeId, label, slideUrls, templateLabel } = args;
  const title = templateLabel?.trim() || label.trim() || "Populate";
  const mediaListOutput: MediaListOutput = {
    kind: "media_list",
    sourceNodeId: nodeId,
    sourceNodeType: "populate",
    title,
    status: slideUrls.length > 0 ? "frames_ready" : "empty",
    items: slideUrls.map((url, index) => ({
      id: `${nodeId}_slide_${index}`,
      order: index,
      title: slideUrls.length > 1 ? `${title} · slide ${index + 1}` : title,
      mediaType: "image",
      url,
      status: "generated",
    })),
    metadata: {
      cineNodeId: nodeId,
      totalFrames: slideUrls.length,
      generatedAt: new Date().toISOString(),
    },
  };
  return {
    value: slideUrls[0] ?? "",
    lastRunOutputs: slideUrls,
    mediaListOutput,
  };
}

/** Varias plantillas → un media_list concatenado (canales por template). */
export function buildPopulateMultiTemplateRunOutput(args: {
  nodeId: string;
  label: string;
  packs: Array<{ templateLabel: string; slideUrls: string[] }>;
}): PopulateRunOutput {
  const items: MediaListOutput["items"] = [];
  let order = 0;
  for (const pack of args.packs) {
    const ch = pack.templateLabel.trim() || "Plantilla";
    for (const url of pack.slideUrls) {
      items.push({
        id: `${args.nodeId}_t_${order}`,
        order: order++,
        title: `${ch} · slide ${pack.slideUrls.indexOf(url) + 1}`,
        mediaType: "image",
        url,
        status: "generated",
      });
    }
  }
  const allUrls = items.map((i) => i.url).filter((u): u is string => Boolean(u));
  const mediaListOutput: MediaListOutput = {
    kind: "media_list",
    sourceNodeId: args.nodeId,
    sourceNodeType: "populate",
    title: args.label.trim() || "Populate",
    status: allUrls.length > 0 ? "frames_ready" : "empty",
    items,
    metadata: {
      cineNodeId: args.nodeId,
      totalFrames: allUrls.length,
      generatedAt: new Date().toISOString(),
    },
  };
  return {
    value: allUrls[0] ?? "",
    lastRunOutputs: allUrls,
    mediaListOutput,
  };
}
