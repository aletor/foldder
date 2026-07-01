import { isMediaListOutput } from "./media-list-output";

export type SpaceMediaPreviewItem = {
  id: string;
  url?: string;
  mediaType: "image" | "video";
  title?: string;
};

/** Items de imagen/vídeo del nested space para la rejilla del portal. */
export function collectSpaceMediaPreviewItems(
  data: Record<string, unknown> | undefined,
): SpaceMediaPreviewItem[] {
  if (!data) return [];

  const ml = data.mediaListOutput ?? data.media_list;
  if (isMediaListOutput(ml) && ml.items.length > 0) {
    return ml.items
      .filter((item) => item.mediaType === "image" || item.mediaType === "video")
      .map((item) => ({
        id: item.id,
        url: item.url?.trim() || undefined,
        mediaType: item.mediaType === "video" ? "video" : "image",
        title: item.title,
      }));
  }

  const outputType = String(data.outputType ?? "");
  const value = typeof data.value === "string" && data.value.trim() ? data.value.trim() : undefined;
  if (outputType === "image" && value) {
    return [{ id: "space-scalar-image", url: value, mediaType: "image" }];
  }
  if (outputType === "video" && value) {
    return [{ id: "space-scalar-video", url: value, mediaType: "video" }];
  }

  return [];
}
