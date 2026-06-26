export type MediaListOutputStatus =
  | "empty"
  | "script_pending"
  | "script_produced"
  | "storyboard_ready"
  | "frames_partial"
  | "frames_ready"
  | "videos_partial"
  | "videos_ready"
  | "approved_ready";

export type MediaListItem = {
  id: string;
  order: number;
  title: string;
  description?: string;
  mediaType: "image" | "video" | "audio" | "document" | "file" | "placeholder";
  role?:
    | "character"
    | "background"
    | "character_sheet"
    | "location_sheet"
    | "storyboard_frame"
    | "scene_video"
    | "approved_scene_video"
    | "storyboard_placeholder"
    | "video_placeholder"
    | (string & {});
  assetId?: string;
  url?: string;
  s3Key?: string;
  mimeType?: string;
  durationSeconds?: number;
  width?: number;
  height?: number;
  aspectRatio?: string;
  sceneId?: string;
  sceneOrder?: number;
  sceneTitle?: string;
  characterId?: string;
  backgroundId?: string;
  frameRole?: "single" | "start" | "end";
  status: "pending" | "generated" | "edited" | "approved" | "missing" | "error";
  metadata?: {
    generatedFrom?: "cine-node";
    cineNodeId?: string;
    sourceScriptNodeId?: string;
    prompt?: string;
    negativePrompt?: string;
    visualNotes?: string;
    voiceOver?: string;
    onScreenText?: string[];
    cameraMovementType?: string;
    cameraDescription?: string;
    cameraPrompt?: string;
    visualDirection?: {
      mode?: string;
      aspectRatio?: string;
      visualStyle?: string;
      colorGrading?: string;
      lightingStyle?: string;
    };
    characterIds?: string[];
    backgroundId?: string;
    referenceAssetIds?: string[];
    overlayTextPlan?: unknown;
    voiceoverPlan?: unknown;
    createdAt?: string;
    updatedAt?: string;
  } & Record<string, unknown>;
};

export type MediaListGroup = {
  id: string;
  title: string;
  role: "characters" | "backgrounds" | "storyboard" | "videos" | "approved_videos" | "sheets" | "dataset_list";
  itemIds: string[];
};

export type MediaListOutput = {
  kind: "media_list";
  sourceNodeId: string;
  sourceNodeType: string;
  title: string;
  status: MediaListOutputStatus;
  items: MediaListItem[];
  groups?: MediaListGroup[];
  metadata: {
    cineNodeId: string;
    projectTitle?: string;
    scriptTitle?: string;
    mode?: string;
    aspectRatio?: string;
    visualStyle?: string;
    colorGrading?: string;
    lightingStyle?: string;
    totalScenes?: number;
    totalFrames?: number;
    totalVideos?: number;
    approvedVideos?: number;
    datasetId?: string;
    datasetListId?: string;
    generatedAt: string;
  };
};

export function isMediaListOutput(raw: unknown): raw is MediaListOutput {
  return Boolean(
    raw &&
      typeof raw === "object" &&
      (raw as { kind?: unknown }).kind === "media_list" &&
      Array.isArray((raw as { items?: unknown }).items),
  );
}
