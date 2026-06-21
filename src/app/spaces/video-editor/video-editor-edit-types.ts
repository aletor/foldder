export type VideoEditorEditTool = "select" | "blade" | "trim";

export type VideoEditorLayoutPreset = "balanced" | "timeline_focus" | "viewer_focus";

export const VIDEO_EDITOR_LAYOUT_PRESET_HEIGHTS: Record<VideoEditorLayoutPreset, number> = {
  balanced: 420,
  timeline_focus: 520,
  viewer_focus: 240,
};

export const DEFAULT_VIDEO_EDITOR_LAYOUT_PRESET: VideoEditorLayoutPreset = "balanced";

export function resolveTimelineHeightFromLayout(
  layout?: { timelineHeight?: number; layoutPreset?: VideoEditorLayoutPreset },
): number {
  if (layout?.layoutPreset && layout.layoutPreset in VIDEO_EDITOR_LAYOUT_PRESET_HEIGHTS) {
    return VIDEO_EDITOR_LAYOUT_PRESET_HEIGHTS[layout.layoutPreset];
  }
  const height = Number(layout?.timelineHeight);
  if (Number.isFinite(height)) return height;
  return VIDEO_EDITOR_LAYOUT_PRESET_HEIGHTS.balanced;
}

export type VideoEditorTimelineMarker = {
  id: string;
  time: number;
  label?: string;
};

export const VIDEO_EDITOR_EDIT_TOOL_SHORTCUTS: Record<string, VideoEditorEditTool> = {
  v: "select",
  b: "blade",
  t: "trim",
};
