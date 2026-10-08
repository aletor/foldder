export type CineMode =
  | "short_film"
  | "advertising"
  | "fashion_film"
  | "documentary"
  | "product_video"
  | "music_video"
  | "brand_story"
  | "social_video";

export type CineAspectRatio = "16:9" | "9:16" | "1:1" | "4:5" | "2.39:1";

export type CineVisualStyle =
  | "naturalistic_realistic"
  | "commercial_cinematic"
  | "black_white_noir"
  | "animation_cartoon"
  | "retro_vintage"
  | "futuristic_sci_fi"
  | "surreal_dreamlike"
  | "raw_documentary";

export type CineColorGrading =
  | "teal_orange"
  | "golden_hour_warm"
  | "cool_blue_desaturated"
  | "pastel_soft_film"
  | "high_contrast_crunchy"
  | "film_emulation_kodak_fuji"
  | "vibrant_commercial_pop"
  | "bleach_bypass"
  | "low_contrast_fade_matte"
  | "monochrome_color_cast";

export type CineLightingStyle = "normal" | "dark" | "bright";

export type CineCameraMovementType =
  | "none"
  | "push_in"
  | "pull_out"
  | "pan"
  | "tilt"
  | "tracking_forward"
  | "tracking_backward"
  | "tracking_side"
  | "handheld"
  | "drone"
  | "static_subtle";

export const CINE_CAMERA_MOVEMENT_LABELS: Record<CineCameraMovementType, string> = {
  none: "Estático",
  push_in: "Push in",
  pull_out: "Pull out",
  pan: "Pan",
  tilt: "Tilt",
  tracking_forward: "Travelling adelante",
  tracking_backward: "Travelling atrás",
  tracking_side: "Travelling lateral",
  handheld: "Cámara en mano",
  drone: "Drone",
  static_subtle: "Estático vivo",
};

export type CineStatus =
  | "empty"
  | "script_received"
  | "analyzed"
  | "characters_ready"
  | "backgrounds_ready"
  | "storyboard_ready"
  | "frames_ready"
  | "ready_for_video";

export type CineVisualDirection = {
  mode: CineMode;
  aspectRatio: CineAspectRatio;
  realismLevel: "realistic" | "stylized" | "hybrid";
  visualStyle: CineVisualStyle;
  colorGrading: CineColorGrading;
  lightingStyle: CineLightingStyle;
  globalStylePrompt?: string;
  tone?: string;
  pacing?: string;
  colorPalette?: string[];
  cameraStyle?: string;
  useBrain?: boolean;
  visualCapsuleIds?: string[];
};

export type CineCharacter = {
  id: string;
  name: string;
  role: "protagonist" | "secondary" | "extra" | "object";
  description: string;
  visualPrompt: string;
  negativePrompt?: string;
  generatedImageAssetId?: string;
  generatedImageS3Key?: string;
  editedImageAssetId?: string;
  editedImageS3Key?: string;
  referenceImageAssetId?: string;
  referenceImageS3Key?: string;
  approvedImageAssetId?: string;
  approvedImageS3Key?: string;
  lockedTraits: string[];
  wardrobe?: string;
  emotionalRange?: string[];
  notes?: string;
  isLocked?: boolean;
};

export type CineBackground = {
  id: string;
  name: string;
  type?: "interior" | "exterior" | "natural" | "urban" | "studio" | "abstract" | "other";
  description: string;
  visualPrompt: string;
  negativePrompt?: string;
  generatedImageAssetId?: string;
  generatedImageS3Key?: string;
  editedImageAssetId?: string;
  editedImageS3Key?: string;
  referenceImageAssetId?: string;
  referenceImageS3Key?: string;
  approvedImageAssetId?: string;
  approvedImageS3Key?: string;
  lighting?: string;
  palette?: string[];
  textures?: string[];
  lockedElements?: string[];
  notes?: string;
  isLocked?: boolean;
};

export type CineShot = {
  shotType:
    | "extreme_wide"
    | "wide"
    | "medium"
    | "medium_closeup"
    | "closeup"
    | "extreme_closeup"
    | "detail"
    | "over_shoulder"
    | "pov"
    | "top_shot"
    | "low_angle"
    | "high_angle";
  cameraMovement?: string;
  cameraMovementType?: CineCameraMovementType;
  cameraDescription?: string;
  lensSuggestion?: string;
  lighting?: string;
  mood?: string;
  action?: string;
  durationSeconds?: number;
};

export type CineFrame = {
  id: string;
  role: "single" | "start" | "end";
  prompt: string;
  negativePrompt?: string;
  imageAssetId?: string;
  imageS3Key?: string;
  editedImageAssetId?: string;
  editedImageS3Key?: string;
  approvedImageAssetId?: string;
  approvedImageS3Key?: string;
  status: "draft" | "generating" | "generated" | "edited" | "approved" | "error";
  generatedFromStudio?: boolean;
  metadata?: {
    generatedFrom: "cine-node";
    cineAssetKind?: "scene-frame";
    cineNodeId: string;
    sceneId: string;
    frameRole: "single" | "start" | "end";
    prompt?: string;
    negativePrompt?: string;
    charactersUsed: string[];
    backgroundUsed?: string;
    brainNodeId?: string;
    visualCapsuleIds?: string[];
    sourceScriptNodeId?: string;
    referenceAssetIds?: string[];
    referenceAssetS3Keys?: string[];
    characterSheetAssetId?: string;
    characterSheetS3Key?: string;
    locationSheetAssetId?: string;
    locationSheetS3Key?: string;
    createdAt?: string;
  };
};

export type CineCharacterContinuitySheet = {
  id: string;
  cineNodeId: string;
  characterIds: string[];
  assetId?: string;
  assetS3Key?: string;
  status: "draft" | "generating" | "ready" | "edited" | "error";
  layout: "single" | "three_columns" | "three_by_two" | "paginated";
  prompt: string;
  negativePrompt?: string;
  editedAssetId?: string;
  editedAssetS3Key?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type CineLocationContinuitySheet = {
  id: string;
  cineNodeId: string;
  backgroundIds: string[];
  assetId?: string;
  assetS3Key?: string;
  status: "draft" | "generating" | "ready" | "edited" | "error";
  layout: "single" | "grid";
  prompt: string;
  negativePrompt?: string;
  editedAssetId?: string;
  editedAssetS3Key?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type CineContinuitySettings = {
  characterSheet?: CineCharacterContinuitySheet;
  locationSheet?: CineLocationContinuitySheet;
  useCharacterSheetForFrames?: boolean;
  useLocationSheetForFrames?: boolean;
};

export type CineVideoPlan = {
  sceneId: string;
  mode: "image_to_video" | "start_end_frames";
  status: "missing_frames" | "ready" | "prepared" | "generating" | "generated" | "error";
  durationSeconds: number;
  aspectRatio: CineAspectRatio;
  singleFrameAssetId?: string;
  singleFrameS3Key?: string;
  startFrameAssetId?: string;
  startFrameS3Key?: string;
  endFrameAssetId?: string;
  endFrameS3Key?: string;
  prompt: string;
  negativePrompt?: string;
  visualAction?: string;
  emotionalIntent?: string;
  cameraMovementType?: CineCameraMovementType;
  cameraDescription?: string;
  cameraPrompt?: string;
  sceneKind?: CineScene["sceneKind"];
  voiceOver?: string;
  visualNotes?: string;
  overlayTextPlan?: {
    texts: string[];
    timingHint?: string;
    shouldRenderInVideo: false;
  };
  voiceoverPlan?: {
    text?: string;
    timingHint?: string;
  };
  characters: string[];
  backgroundId?: string;
  referenceAssetIds: string[];
  referenceAssetS3Keys?: string[];
  videoAssetId?: string;
  videoS3Key?: string;
  videoUrl?: string;
  generatedVideoAssetId?: string;
  generatedVideoS3Key?: string;
  editedVideoAssetId?: string;
  editedVideoS3Key?: string;
  approvedVideoAssetId?: string;
  approvedVideoS3Key?: string;
  videoProvider?: "gemini" | "seedance";
  generatedAt?: string;
  errorMessage?: string;
  missingFrames?: Array<"single" | "start" | "end">;
  warnings?: string[];
  startFramePrompt?: string;
  endFramePrompt?: string;
  cameraMovement?: string;
  action?: string;
  mood?: string;
  metadata?: {
    generatedFrom: "cine-node";
    cineNodeId: string;
    sourceScriptNodeId?: string;
    characterSheetAssetId?: string;
    characterSheetS3Key?: string;
    locationSheetAssetId?: string;
    locationSheetS3Key?: string;
    characterAssetIds?: string[];
    characterS3Keys?: string[];
    backgroundAssetId?: string;
    backgroundS3Key?: string;
    frameAssetIds?: string[];
    frameS3Keys?: string[];
    createdAt?: string;
    updatedAt?: string;
  };
};

export type CineMediaListOutputConfig = {
  includeCharacters?: boolean;
  includeBackgrounds?: boolean;
  includeSheets?: boolean;
  includeFrames?: boolean;
  includeVideos?: boolean;
  includeOnlyApprovedVideos?: boolean;
  includePlaceholders?: boolean;
};

export type CineImageStudioSession = {
  cineNodeId: string;
  nanoNodeId: string;
  kind: "character" | "background" | "frame" | "character_sheet" | "location_sheet";
  characterId?: string;
  backgroundId?: string;
  sceneId?: string;
  frameRole?: "single" | "start" | "end";
  prompt: string;
  negativePrompt?: string;
  sourceAssetId?: string;
  sourceS3Key?: string;
  /** Refs BrandKit (logo/galería) para el Image Studio hospedado desde Cine. */
  brandStyleImageUrls?: string[];
  returnTab: "reparto" | "fondos" | "storyboard";
  returnSceneId?: string;
  mode: "generate" | "edit";
  metadata?: {
    generatedFrom: "cine-node";
    cineAssetKind:
      | "character"
      | "background"
      | "scene-frame"
      | "character-sheet"
      | "location-sheet";
    cineNodeId: string;
    characterId?: string;
    backgroundId?: string;
    sceneId?: string;
    frameRole?: "single" | "start" | "end";
    charactersUsed?: string[];
    backgroundUsed?: string;
    sourceScriptNodeId?: string;
    brainNodeId?: string;
    visualCapsuleIds?: string[];
    referenceAssetIds?: string[];
    referenceAssetS3Keys?: string[];
    characterSheetAssetId?: string;
    characterSheetS3Key?: string;
    locationSheetAssetId?: string;
    locationSheetS3Key?: string;
    createdAt?: string;
  };
};

export type CineImageStudioResult = {
  assetId?: string;
  s3Key?: string;
  originalAssetId?: string;
  promptUsed?: string;
  negativePromptUsed?: string;
  mode: "generate" | "edit";
};

export type CineScene = {
  id: string;
  order: number;
  title: string;
  sourceText: string;
  visualSummary: string;
  voiceOver?: string;
  onScreenText?: string[];
  visualNotes?: string;
  durationSeconds?: number;
  sceneKind?: "present" | "flashback" | "memory" | "other";
  visualOverride?: {
    visualStyle?: CineVisualStyle;
    colorGrading?: CineColorGrading;
    lightingStyle?: CineLightingStyle;
  };
  characters: string[];
  backgroundId?: string;
  shot: CineShot;
  framesMode: "single" | "start_end";
  frames: {
    single?: CineFrame;
    start?: CineFrame;
    end?: CineFrame;
  };
  video?: CineVideoPlan;
  status:
    | "draft"
    | "ready_to_generate"
    | "frame_generated"
    | "frames_generated"
    | "edited"
    | "approved"
    | "ready_for_video";
};

export type CineAnalysisResult = {
  logline?: string;
  summary?: string;
  tone?: string;
  visualStyle?: string;
  suggestedMode?: CineMode;
  characters: Partial<CineCharacter>[];
  backgrounds: Partial<CineBackground>[];
  scenes: Partial<CineScene>[];
};

export type CineNodeData = {
  label?: string;
  sourceScript?: {
    nodeId?: string;
    text: string;
    title?: string;
  };
  manualScript?: string;
  mode: CineMode;
  status: CineStatus;
  visualDirection: CineVisualDirection;
  detected?: CineAnalysisResult;
  characters: CineCharacter[];
  backgrounds: CineBackground[];
  scenes: CineScene[];
  continuity?: CineContinuitySettings;
  mediaListOutputConfig?: CineMediaListOutputConfig;
  selectedSceneId?: string;
  value?: string;
  metadata?: {
    brainNodeId?: string;
    sourceScriptNodeId?: string;
    createdAt?: string;
    updatedAt?: string;
  };
};

export const CINE_MODE_LABELS: Record<CineMode, string> = {
  short_film: "Cortometraje",
  advertising: "Spot publicitario",
  fashion_film: "Fashion film",
  documentary: "Documental",
  product_video: "Producto",
  music_video: "Videoclip",
  brand_story: "Brand story",
  social_video: "Social video",
};

export const CINE_VISUAL_STYLE_LABELS: Record<CineVisualStyle, string> = {
  naturalistic_realistic: "Naturalista / Realista",
  commercial_cinematic: "Cinemático comercial",
  black_white_noir: "Blanco y negro / Noir",
  animation_cartoon: "Animación / Dibujos",
  retro_vintage: "Retro / Vintage",
  futuristic_sci_fi: "Futurista / Sci-Fi",
  surreal_dreamlike: "Surrealista / Onírico",
  raw_documentary: "Documental crudo",
};

export const CINE_COLOR_GRADING_LABELS: Record<CineColorGrading, string> = {
  teal_orange: "Teal & Orange",
  golden_hour_warm: "Golden Hour / Warm",
  cool_blue_desaturated: "Cool Blue / Desaturated",
  pastel_soft_film: "Pastel / Soft Film",
  high_contrast_crunchy: "High Contrast / Crunchy",
  film_emulation_kodak_fuji: "Film Emulation",
  vibrant_commercial_pop: "Vibrant / Commercial Pop",
  bleach_bypass: "Bleach Bypass",
  low_contrast_fade_matte: "Low Contrast / Matte",
  monochrome_color_cast: "Monochrome Color Cast",
};

export const CINE_LIGHTING_STYLE_LABELS: Record<CineLightingStyle, string> = {
  normal: "Normal",
  dark: "Oscura",
  bright: "Clara",
};

export const CINE_STATUS_LABELS: Record<CineStatus, string> = {
  empty: "Sin guion",
  script_received: "Guion recibido",
  analyzed: "Guion analizado",
  characters_ready: "Reparto listo",
  backgrounds_ready: "Fondos listos",
  storyboard_ready: "Storyboard creado",
  frames_ready: "Frames listos",
  ready_for_video: "Listo para video",
};

export const CINE_SHOT_LABELS: Record<CineShot["shotType"], string> = {
  extreme_wide: "Gran plano general",
  wide: "Plano general",
  medium: "Plano medio",
  medium_closeup: "Plano medio corto",
  closeup: "Primer plano",
  extreme_closeup: "Plano detalle extremo",
  detail: "Detalle",
  over_shoulder: "Sobre hombro",
  pov: "Punto de vista",
  top_shot: "Cenital",
  low_angle: "Contrapicado",
  high_angle: "Picado",
};

export function makeCineId(prefix = "cine"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createEmptyCineNodeData(now = new Date().toISOString()): CineNodeData {
  return {
    label: "Cine",
    manualScript: "",
    mode: "short_film",
    status: "empty",
    visualDirection: {
      mode: "short_film",
      aspectRatio: "16:9",
      realismLevel: "realistic",
      visualStyle: "naturalistic_realistic",
      colorGrading: "film_emulation_kodak_fuji",
      lightingStyle: "normal",
      globalStylePrompt: "",
      tone: "cinematografico, sobrio y visual",
      pacing: "claro y narrativo",
      colorPalette: [],
      cameraStyle: "camara cinematografica natural",
      useBrain: true,
      visualCapsuleIds: [],
    },
    characters: [],
    backgrounds: [],
    scenes: [],
	    continuity: {
	      useCharacterSheetForFrames: true,
	      useLocationSheetForFrames: true,
	    },
	    mediaListOutputConfig: {
	      includeCharacters: false,
	      includeBackgrounds: false,
	      includeSheets: true,
	      includeFrames: true,
	      includeVideos: true,
	      includeOnlyApprovedVideos: false,
	      includePlaceholders: true,
	    },
	    value: "",
    metadata: {
      createdAt: now,
      updatedAt: now,
    },
  };
}

function asRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
}

function asString(raw: unknown, fallback = ""): string {
  return typeof raw === "string" ? raw : fallback;
}

function asStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
}

function isCineCameraMovementType(raw: unknown): raw is CineCameraMovementType {
  return typeof raw === "string" && raw in CINE_CAMERA_MOVEMENT_LABELS;
}

function isCineVisualStyle(raw: unknown): raw is CineVisualStyle {
  return typeof raw === "string" && raw in CINE_VISUAL_STYLE_LABELS;
}

function isCineColorGrading(raw: unknown): raw is CineColorGrading {
  return typeof raw === "string" && raw in CINE_COLOR_GRADING_LABELS;
}

function isCineLightingStyle(raw: unknown): raw is CineLightingStyle {
  return typeof raw === "string" && raw in CINE_LIGHTING_STYLE_LABELS;
}

function normalizeCharacterSheet(raw: unknown): CineCharacterContinuitySheet | undefined {
  const row = asRecord(raw);
  const id = asString(row.id);
  const prompt = asString(row.prompt);
  const assetId = asString(row.assetId) || undefined;
  const assetS3Key = asString(row.assetS3Key) || undefined;
  const editedAssetId = asString(row.editedAssetId) || undefined;
  const editedAssetS3Key = asString(row.editedAssetS3Key) || undefined;
  if (!id && !prompt && !assetId && !editedAssetId) return undefined;
  return {
    id: id || makeCineId("cine_character_sheet"),
    cineNodeId: asString(row.cineNodeId),
    characterIds: asStringArray(row.characterIds),
    assetId,
    assetS3Key,
    status: ["draft", "generating", "ready", "edited", "error"].includes(asString(row.status))
      ? (row.status as CineCharacterContinuitySheet["status"])
      : assetId || editedAssetId ? "ready" : "draft",
    layout: ["single", "three_columns", "three_by_two", "paginated"].includes(asString(row.layout))
      ? (row.layout as CineCharacterContinuitySheet["layout"])
      : "single",
    prompt,
    negativePrompt: asString(row.negativePrompt) || undefined,
    editedAssetId,
    editedAssetS3Key,
    createdAt: asString(row.createdAt) || undefined,
    updatedAt: asString(row.updatedAt) || undefined,
  };
}

function normalizeLocationSheet(raw: unknown): CineLocationContinuitySheet | undefined {
  const row = asRecord(raw);
  const id = asString(row.id);
  const prompt = asString(row.prompt);
  const assetId = asString(row.assetId) || undefined;
  const assetS3Key = asString(row.assetS3Key) || undefined;
  const editedAssetId = asString(row.editedAssetId) || undefined;
  const editedAssetS3Key = asString(row.editedAssetS3Key) || undefined;
  if (!id && !prompt && !assetId && !editedAssetId) return undefined;
  return {
    id: id || makeCineId("cine_location_sheet"),
    cineNodeId: asString(row.cineNodeId),
    backgroundIds: asStringArray(row.backgroundIds),
    assetId,
    assetS3Key,
    status: ["draft", "generating", "ready", "edited", "error"].includes(asString(row.status))
      ? (row.status as CineLocationContinuitySheet["status"])
      : assetId || editedAssetId ? "ready" : "draft",
    layout: ["single", "grid"].includes(asString(row.layout))
      ? (row.layout as CineLocationContinuitySheet["layout"])
      : "grid",
    prompt,
    negativePrompt: asString(row.negativePrompt) || undefined,
    editedAssetId,
    editedAssetS3Key,
    createdAt: asString(row.createdAt) || undefined,
    updatedAt: asString(row.updatedAt) || undefined,
  };
}

function normalizeFrame(raw: unknown, fallbackRole: CineFrame["role"]): CineFrame | undefined {
  const row = asRecord(raw);
  const prompt = asString(row.prompt);
  const id = asString(row.id, makeCineId("cine_frame"));
  const status = ["draft", "generating", "generated", "edited", "approved", "error"].includes(asString(row.status))
    ? (row.status as CineFrame["status"])
    : "draft";
  if (!prompt && !asString(row.imageAssetId) && !asString(row.editedImageAssetId)) return undefined;
  return {
    id,
    role: (row.role === "single" || row.role === "start" || row.role === "end") ? row.role : fallbackRole,
    prompt,
    negativePrompt: asString(row.negativePrompt),
    imageAssetId: asString(row.imageAssetId) || undefined,
    imageS3Key: asString(row.imageS3Key) || undefined,
    editedImageAssetId: asString(row.editedImageAssetId) || undefined,
    editedImageS3Key: asString(row.editedImageS3Key) || undefined,
    approvedImageAssetId: asString(row.approvedImageAssetId) || undefined,
    approvedImageS3Key: asString(row.approvedImageS3Key) || undefined,
    status,
    generatedFromStudio: Boolean(row.generatedFromStudio),
    metadata: asRecord(row.metadata) as CineFrame["metadata"],
  };
}

export function normalizeCineData(raw: unknown): CineNodeData {
  const base = createEmptyCineNodeData();
  const row = asRecord(raw);
  const visual = asRecord(row.visualDirection);
  const metadata = asRecord(row.metadata);
	  const continuityRaw = asRecord(row.continuity);
	  const mediaListOutputConfigRaw = asRecord(row.mediaListOutputConfig);
  const sourceScript = asRecord(row.sourceScript);
  const mode = Object.keys(CINE_MODE_LABELS).includes(asString(row.mode)) ? (row.mode as CineMode) : base.mode;
  const status = Object.keys(CINE_STATUS_LABELS).includes(asString(row.status)) ? (row.status as CineStatus) : base.status;
  const aspectRatio = ["16:9", "9:16", "1:1", "4:5", "2.39:1"].includes(asString(visual.aspectRatio))
    ? (visual.aspectRatio as CineAspectRatio)
    : base.visualDirection.aspectRatio;
  const realismLevel = ["realistic", "stylized", "hybrid"].includes(asString(visual.realismLevel))
    ? (visual.realismLevel as CineVisualDirection["realismLevel"])
    : base.visualDirection.realismLevel;
  const visualMode = Object.keys(CINE_MODE_LABELS).includes(asString(visual.mode)) ? (visual.mode as CineMode) : mode;
  const visualStyle = isCineVisualStyle(visual.visualStyle) ? visual.visualStyle : base.visualDirection.visualStyle;
  const colorGrading = isCineColorGrading(visual.colorGrading) ? visual.colorGrading : base.visualDirection.colorGrading;
  const lightingStyle = isCineLightingStyle(visual.lightingStyle) ? visual.lightingStyle : base.visualDirection.lightingStyle;

  const characters = Array.isArray(row.characters)
    ? row.characters.map((item, index): CineCharacter => {
        const character = asRecord(item);
        return {
          id: asString(character.id, makeCineId("cine_character")),
          name: asString(character.name, `Personaje ${index + 1}`),
          role: ["protagonist", "secondary", "extra", "object"].includes(asString(character.role))
            ? (character.role as CineCharacter["role"])
            : index === 0 ? "protagonist" : "secondary",
          description: asString(character.description),
          visualPrompt: asString(character.visualPrompt),
          negativePrompt: asString(character.negativePrompt),
          generatedImageAssetId: asString(character.generatedImageAssetId) || undefined,
          generatedImageS3Key: asString(character.generatedImageS3Key) || undefined,
          editedImageAssetId: asString(character.editedImageAssetId) || undefined,
          editedImageS3Key: asString(character.editedImageS3Key) || undefined,
          referenceImageAssetId: asString(character.referenceImageAssetId) || undefined,
          referenceImageS3Key: asString(character.referenceImageS3Key) || undefined,
          approvedImageAssetId: asString(character.approvedImageAssetId) || undefined,
          approvedImageS3Key: asString(character.approvedImageS3Key) || undefined,
          lockedTraits: asStringArray(character.lockedTraits),
          wardrobe: asString(character.wardrobe),
          emotionalRange: asStringArray(character.emotionalRange),
          notes: asString(character.notes),
          isLocked: Boolean(character.isLocked),
        };
      })
    : [];

  const backgrounds = Array.isArray(row.backgrounds)
    ? row.backgrounds.map((item, index): CineBackground => {
        const background = asRecord(item);
        const type = asString(background.type);
        return {
          id: asString(background.id, makeCineId("cine_background")),
          name: asString(background.name, `Fondo ${index + 1}`),
          type: ["interior", "exterior", "natural", "urban", "studio", "abstract", "other"].includes(type)
            ? (type as CineBackground["type"])
            : "other",
          description: asString(background.description),
          visualPrompt: asString(background.visualPrompt),
          negativePrompt: asString(background.negativePrompt),
          generatedImageAssetId: asString(background.generatedImageAssetId) || undefined,
          generatedImageS3Key: asString(background.generatedImageS3Key) || undefined,
          editedImageAssetId: asString(background.editedImageAssetId) || undefined,
          editedImageS3Key: asString(background.editedImageS3Key) || undefined,
          referenceImageAssetId: asString(background.referenceImageAssetId) || undefined,
          referenceImageS3Key: asString(background.referenceImageS3Key) || undefined,
          approvedImageAssetId: asString(background.approvedImageAssetId) || undefined,
          approvedImageS3Key: asString(background.approvedImageS3Key) || undefined,
          lighting: asString(background.lighting),
          palette: asStringArray(background.palette),
          textures: asStringArray(background.textures),
          lockedElements: asStringArray(background.lockedElements),
          notes: asString(background.notes),
          isLocked: Boolean(background.isLocked),
        };
      })
    : [];

  const scenes = Array.isArray(row.scenes)
    ? row.scenes.map((item, index): CineScene => {
        const scene = asRecord(item);
        const shot = asRecord(scene.shot);
        const frames = asRecord(scene.frames);
        const shotType = Object.keys(CINE_SHOT_LABELS).includes(asString(shot.shotType))
          ? (shot.shotType as CineShot["shotType"])
          : "medium";
        const sceneStatus = ["draft", "ready_to_generate", "frame_generated", "frames_generated", "edited", "approved", "ready_for_video"].includes(asString(scene.status))
          ? (scene.status as CineScene["status"])
          : "draft";
        return {
          id: asString(scene.id, makeCineId("cine_scene")),
          order: typeof scene.order === "number" ? scene.order : index + 1,
          title: asString(scene.title, `Escena ${index + 1}`),
          sourceText: asString(scene.sourceText),
          visualSummary: asString(scene.visualSummary),
          voiceOver: asString(scene.voiceOver) || undefined,
          onScreenText: asStringArray(scene.onScreenText),
          visualNotes: asString(scene.visualNotes) || undefined,
          durationSeconds: typeof scene.durationSeconds === "number" ? scene.durationSeconds : undefined,
          sceneKind: ["present", "flashback", "memory", "other"].includes(asString(scene.sceneKind))
            ? (scene.sceneKind as CineScene["sceneKind"])
            : undefined,
          visualOverride: (() => {
            const override = asRecord(scene.visualOverride);
            const next = {
              visualStyle: isCineVisualStyle(override.visualStyle) ? override.visualStyle : undefined,
              colorGrading: isCineColorGrading(override.colorGrading) ? override.colorGrading : undefined,
              lightingStyle: isCineLightingStyle(override.lightingStyle) ? override.lightingStyle : undefined,
            };
            return next.visualStyle || next.colorGrading || next.lightingStyle ? next : undefined;
          })(),
          characters: asStringArray(scene.characters),
          backgroundId: asString(scene.backgroundId) || undefined,
          shot: {
            shotType,
            cameraMovement: asString(shot.cameraMovement),
            cameraMovementType: isCineCameraMovementType(shot.cameraMovementType) ? shot.cameraMovementType : undefined,
            cameraDescription: asString(shot.cameraDescription),
            lensSuggestion: asString(shot.lensSuggestion),
            lighting: asString(shot.lighting),
            mood: asString(shot.mood),
            action: asString(shot.action),
            durationSeconds: typeof shot.durationSeconds === "number" ? shot.durationSeconds : 5,
          },
          framesMode: scene.framesMode === "start_end" ? "start_end" : "single",
          frames: {
            single: normalizeFrame(frames.single, "single"),
            start: normalizeFrame(frames.start, "start"),
            end: normalizeFrame(frames.end, "end"),
          },
          video: asRecord(scene.video) as CineVideoPlan,
          status: sceneStatus,
        };
      }).sort((a, b) => a.order - b.order)
    : [];

  return {
    ...base,
    label: asString(row.label, base.label),
    manualScript: asString(row.manualScript),
    sourceScript: sourceScript.text
      ? {
          nodeId: asString(sourceScript.nodeId) || undefined,
          text: asString(sourceScript.text),
          title: asString(sourceScript.title) || undefined,
        }
      : undefined,
    mode,
    status,
    visualDirection: {
      ...base.visualDirection,
      mode: visualMode,
      aspectRatio,
      realismLevel,
      visualStyle,
      colorGrading,
      lightingStyle,
      globalStylePrompt: asString(visual.globalStylePrompt),
      tone: asString(visual.tone, base.visualDirection.tone),
      pacing: asString(visual.pacing, base.visualDirection.pacing),
      colorPalette: asStringArray(visual.colorPalette),
      cameraStyle: asString(visual.cameraStyle, base.visualDirection.cameraStyle),
      useBrain: typeof visual.useBrain === "boolean" ? visual.useBrain : base.visualDirection.useBrain,
      visualCapsuleIds: asStringArray(visual.visualCapsuleIds),
    },
    detected: row.detected && typeof row.detected === "object" ? (row.detected as CineAnalysisResult) : undefined,
    characters,
    backgrounds,
    scenes,
	    continuity: {
      characterSheet: normalizeCharacterSheet(continuityRaw.characterSheet),
      locationSheet: normalizeLocationSheet(continuityRaw.locationSheet),
      useCharacterSheetForFrames: typeof continuityRaw.useCharacterSheetForFrames === "boolean"
        ? continuityRaw.useCharacterSheetForFrames
        : base.continuity?.useCharacterSheetForFrames,
	      useLocationSheetForFrames: typeof continuityRaw.useLocationSheetForFrames === "boolean"
	        ? continuityRaw.useLocationSheetForFrames
	        : base.continuity?.useLocationSheetForFrames,
	    },
	    mediaListOutputConfig: {
	      includeCharacters: typeof mediaListOutputConfigRaw.includeCharacters === "boolean" ? mediaListOutputConfigRaw.includeCharacters : base.mediaListOutputConfig?.includeCharacters,
	      includeBackgrounds: typeof mediaListOutputConfigRaw.includeBackgrounds === "boolean" ? mediaListOutputConfigRaw.includeBackgrounds : base.mediaListOutputConfig?.includeBackgrounds,
	      includeSheets: typeof mediaListOutputConfigRaw.includeSheets === "boolean" ? mediaListOutputConfigRaw.includeSheets : base.mediaListOutputConfig?.includeSheets,
	      includeFrames: typeof mediaListOutputConfigRaw.includeFrames === "boolean" ? mediaListOutputConfigRaw.includeFrames : base.mediaListOutputConfig?.includeFrames,
	      includeVideos: typeof mediaListOutputConfigRaw.includeVideos === "boolean" ? mediaListOutputConfigRaw.includeVideos : base.mediaListOutputConfig?.includeVideos,
	      includeOnlyApprovedVideos: typeof mediaListOutputConfigRaw.includeOnlyApprovedVideos === "boolean" ? mediaListOutputConfigRaw.includeOnlyApprovedVideos : base.mediaListOutputConfig?.includeOnlyApprovedVideos,
	      includePlaceholders: typeof mediaListOutputConfigRaw.includePlaceholders === "boolean" ? mediaListOutputConfigRaw.includePlaceholders : base.mediaListOutputConfig?.includePlaceholders,
	    },
    selectedSceneId: asString(row.selectedSceneId) || scenes[0]?.id,
    value: asString(row.value),
    metadata: {
      brainNodeId: asString(metadata.brainNodeId) || undefined,
      sourceScriptNodeId: asString(metadata.sourceScriptNodeId) || undefined,
      createdAt: asString(metadata.createdAt, base.metadata?.createdAt),
      updatedAt: asString(metadata.updatedAt, base.metadata?.updatedAt),
    },
  };
}
