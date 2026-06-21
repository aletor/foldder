import type {
  PresenterImageVideoCanvasBinding,
  PresenterImageVideoPlacement,
} from "./presenter-image-video-types";

const noop = () => undefined;

/** Binding de solo reproducción para visor público o Play sin edición. */
export function buildPresenterPlaybackImageVideoBinding(
  pageId: string,
  allPlacements: PresenterImageVideoPlacement[],
): PresenterImageVideoCanvasBinding | null {
  if (!pageId) return null;
  const placements = allPlacements.filter((p) => p.pageId === pageId);
  if (placements.length === 0) return null;
  return {
    pageId,
    placements,
    uiMode: "playback",
    uploadingKey: null,
    onUploadBusy: noop,
    onUpsert: noop,
    onPatch: noop,
    onRemove: noop,
  };
}
