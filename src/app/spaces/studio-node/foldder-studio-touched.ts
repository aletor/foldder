export const FOLDDER_STUDIO_TOUCHED_KEY = "_foldderStudioTouched" as const;

export function hasFoldderStudioTouched(data: Record<string, unknown> | undefined): boolean {
  return data?.[FOLDDER_STUDIO_TOUCHED_KEY] === true;
}

/** Nano Banana: nodo con imagen generada (studio o botón del grafo). */
export function hasNanoBananaStudioTouched(data: Record<string, unknown> | undefined): boolean {
  if (hasFoldderStudioTouched(data)) return true;
  const src = data?.generatedByAiSource;
  if (src === "gemini-image-generator:studio" || src === "gemini-image-generator") return true;
  if (
    data?.generatedByAi === true &&
    typeof data?.value === "string" &&
    data.value.trim().length > 0
  ) {
    return true;
  }
  return false;
}

/** Video Generator: generaciones previas al flag o sin persistir `_foldderStudioTouched`. */
export function hasGeminiVideoStudioTouched(data: Record<string, unknown> | undefined): boolean {
  if (hasFoldderStudioTouched(data)) return true;
  return data?.generatedByAiSource === "gemini-video-generator:studio";
}

/** Video Editor: timeline con clips, render listo o studio abierto. */
export function hasVideoEditorStudioTouched(data: Record<string, unknown> | undefined): boolean {
  if (hasFoldderStudioTouched(data)) return true;
  const tracks = data?.tracks;
  if (tracks && typeof tracks === "object") {
    const clipCount = Object.values(tracks as Record<string, unknown>).reduce<number>((sum, list) => {
      return sum + (Array.isArray(list) ? list.length : 0);
    }, 0);
    if (clipCount > 0) return true;
  }
  const render = data?.render;
  if (render && typeof render === "object") {
    const r = render as { status?: unknown; outputUrl?: unknown; outputAssetId?: unknown; s3Key?: unknown };
    if (
      r.status === "ready"
      && (
        (typeof r.outputUrl === "string" && r.outputUrl.trim().length > 0)
        || (typeof r.outputAssetId === "string" && r.outputAssetId.trim().length > 0)
        || (typeof r.s3Key === "string" && r.s3Key.trim().length > 0)
      )
    ) {
      return true;
    }
  }
  return false;
}

export function touchStudioNodeData(
  data: Record<string, unknown> | undefined,
  patch: Record<string, unknown> = {},
): Record<string, unknown> {
  return { ...(data ?? {}), ...patch, [FOLDDER_STUDIO_TOUCHED_KEY]: true };
}
