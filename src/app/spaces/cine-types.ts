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
  aspectRatio: CineAspectRatio;
  realismLevel: "realistic" | "stylized" | "hybrid";
  globalStylePrompt?: string;
  tone?: string;
  pacing?: string;
  colorPalette?: string[];
  cameraStyle?: string;
  lightingStyle?: string;
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
  referenceImageAssetId?: string;
  approvedImageAssetId?: string;
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
  referenceImageAssetId?: string;
  approvedImageAssetId?: string;
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
  editedImageAssetId?: string;
  status: "draft" | "generated" | "edited" | "approved" | "error";
  generatedFromStudio?: boolean;
  metadata?: {
    generatedFrom: "cine-node";
    cineNodeId: string;
    sceneId: string;
    frameRole: "single" | "start" | "end";
    charactersUsed: string[];
    backgroundUsed?: string;
    brainNodeId?: string;
    visualCapsuleIds?: string[];
    sourceScriptNodeId?: string;
  };
};

export type CineVideoPlan = {
  sceneId?: string;
  mode: "image_to_video" | "start_end_frames";
  prompt?: string;
  visualAction?: string;
  emotionalIntent?: string;
  voiceOver?: string;
  onScreenText?: string[];
  visualNotes?: string;
  sceneKind?: CineScene["sceneKind"];
  startFramePrompt?: string;
  endFramePrompt?: string;
  durationSeconds?: number;
  aspectRatio?: CineAspectRatio;
  startFrameAssetId?: string;
  endFrameAssetId?: string;
  cameraMovement?: string;
  action?: string;
  mood?: string;
  status?: "idle" | "ready" | "sent" | "generating" | "done" | "error";
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
      aspectRatio: "16:9",
      realismLevel: "realistic",
      globalStylePrompt: "",
      tone: "cinematografico, sobrio y visual",
      pacing: "claro y narrativo",
      colorPalette: [],
      cameraStyle: "camara cinematografica natural",
      lightingStyle: "luz motivada y atmosferica",
      useBrain: true,
      visualCapsuleIds: [],
    },
    characters: [],
    backgrounds: [],
    scenes: [],
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

function normalizeFrame(raw: unknown, fallbackRole: CineFrame["role"]): CineFrame | undefined {
  const row = asRecord(raw);
  const prompt = asString(row.prompt);
  const id = asString(row.id, makeCineId("cine_frame"));
  const status = ["draft", "generated", "edited", "approved", "error"].includes(asString(row.status))
    ? (row.status as CineFrame["status"])
    : "draft";
  if (!prompt && !asString(row.imageAssetId) && !asString(row.editedImageAssetId)) return undefined;
  return {
    id,
    role: (row.role === "single" || row.role === "start" || row.role === "end") ? row.role : fallbackRole,
    prompt,
    negativePrompt: asString(row.negativePrompt),
    imageAssetId: asString(row.imageAssetId) || undefined,
    editedImageAssetId: asString(row.editedImageAssetId) || undefined,
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
  const sourceScript = asRecord(row.sourceScript);
  const mode = Object.keys(CINE_MODE_LABELS).includes(asString(row.mode)) ? (row.mode as CineMode) : base.mode;
  const status = Object.keys(CINE_STATUS_LABELS).includes(asString(row.status)) ? (row.status as CineStatus) : base.status;
  const aspectRatio = ["16:9", "9:16", "1:1", "4:5", "2.39:1"].includes(asString(visual.aspectRatio))
    ? (visual.aspectRatio as CineAspectRatio)
    : base.visualDirection.aspectRatio;
  const realismLevel = ["realistic", "stylized", "hybrid"].includes(asString(visual.realismLevel))
    ? (visual.realismLevel as CineVisualDirection["realismLevel"])
    : base.visualDirection.realismLevel;

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
          referenceImageAssetId: asString(character.referenceImageAssetId) || undefined,
          approvedImageAssetId: asString(character.approvedImageAssetId) || undefined,
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
          referenceImageAssetId: asString(background.referenceImageAssetId) || undefined,
          approvedImageAssetId: asString(background.approvedImageAssetId) || undefined,
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
          characters: asStringArray(scene.characters),
          backgroundId: asString(scene.backgroundId) || undefined,
          shot: {
            shotType,
            cameraMovement: asString(shot.cameraMovement),
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
      aspectRatio,
      realismLevel,
      globalStylePrompt: asString(visual.globalStylePrompt),
      tone: asString(visual.tone, base.visualDirection.tone),
      pacing: asString(visual.pacing, base.visualDirection.pacing),
      colorPalette: asStringArray(visual.colorPalette),
      cameraStyle: asString(visual.cameraStyle, base.visualDirection.cameraStyle),
      lightingStyle: asString(visual.lightingStyle, base.visualDirection.lightingStyle),
      useBrain: typeof visual.useBrain === "boolean" ? visual.useBrain : base.visualDirection.useBrain,
      visualCapsuleIds: asStringArray(visual.visualCapsuleIds),
    },
    detected: row.detected && typeof row.detected === "object" ? (row.detected as CineAnalysisResult) : undefined,
    characters,
    backgrounds,
    scenes,
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
