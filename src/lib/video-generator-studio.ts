/**
 * Video Generator Studio — presets y ensamblado de prompt (Veo + Seedance).
 * Guía alineada con estructura en 7 capas (orden funcional: lo primero pesa más).
 */

export const SEEDANCE_REF_LIMITS = {
  maxImages: 9,
  maxVideos: 3,
  maxAudios: 3,
  maxTotal: 12,
} as const;

/**
 * Esqueleto en inglés (7 capas). Sustituye […]; omite líneas que no apliquen.
 * Capa 1 siempre primera frase del bloque principal.
 */
export const DIRECTOR_PROMPT_TEMPLATE_EN = `[1 Shot & camera — first sentence, always]
Slow dolly push-in from wide to medium close-up.

[2 Subject & identity — @ImageN if you use refs]
@Image1 subject: a person in a charcoal wool coat, sharp jawline, short dark hair.

[3 Action & physics — character action; env/surface physics in separate sentences]
They exhale slowly, breath visible in cold air, then turn toward camera with deliberate weight.
Coat fabric responds with physically-based cloth simulation. Rain droplets streak the fabric.

[4 Environment — dominant place + atmosphere + one background detail]
Rain-soaked rooftop in a dense urban district at night. Neon signs cast fragmented reflections on wet concrete.

[5 Lighting — highest impact: primary + secondary + what is absent]
Primary: cold blue rim from behind the subject. Secondary: warm amber from wet surfaces below. No overhead key.

[6 Style / cinematic look]
Anamorphic lens with subtle flares on bright sources. Teal-orange grade. 35mm grain, shallow DoF.

[7 Locks & fixes — last]
Feature lock from @Image1. Hairstyle and clothing persistence. No floating objects. No identity drift.`;

export const SEEDANCE_PROMPT_GUIDE_ES = {
  sevenLayersIntro:
    "Siete capas en orden fijo: el modelo prioriza lo que va primero; no es estética, es peso. Puedes dejar capas vacías o acortar frases.",
  layer1:
    "Plano y cámara (primera frase del texto): encuadre y movimiento. [velocidad] + [movimiento] + [origen] + [destino]. Máx. dos movimientos por frase; más movimientos → «then» en inglés.",
  layer2:
    "Sujeto: identidad y detalle físico. Con ref, tag @ImageN aquí; sin ref, más descripción.",
  layer3:
    "Acción y física: acción del personaje; físicas del entorno en frases aparte (no mezclar).",
  layer4:
    "Entorno: un dominante, uno de atmósfera, uno de fondo (no más de tres).",
  layer5:
    "Iluminación: máximo impacto. Primaria + dirección + color; secundaria; ausencias de luz.",
  layer6:
    "Estilo: lente, grade, grano, bokeh, ratio…",
  layer7:
    "Locks (última frase): cara/identidad/ropa; sin artefactos ni objetos flotantes.",
  gestorMapping:
    "En el panel: 1) Medios (frames + @Refs) → 2) Texto (grafo o local) → 3) Refuerzos Luz/Estilo/Física → 4) Cola API (animación → preset cámara → negative). El bloque principal es el prompt; los refuerzos van en un segundo párrafo al generar; la cola API se concatena al final. Frases rápidas de cámara = capa 1 en texto; no sustituyen al preset.",
  structure:
    "Orden recomendado en el texto: 1 cámara/plano → 2 sujeto → 3 acción + físicas separadas → 4 entorno → 5 luz → 6 estilo → 7 locks. Puede faltar información: no rellenes capas que no aporten.",
  lighting:
    "La luz manda en resultado visual: puedes describirla en la capa 5 y/o usar el preset Luz del gestor (se fusiona como refuerzo al enviar).",
  cameraVsSubject:
    "Separa movimiento de cámara y del sujeto. El preset de API va al final del prompt de red; conviene que la primera frase del texto describa igualmente plano/movimiento para el peso del modelo.",
  fastWarning:
    "«Fast» + cámara rápida + escena muy cargada suele producir jitter; tensiona solo un eje si buscas ritmo fuerte.",
  references:
    "@Image ancla apariencia; @Video movimiento; @Audio atmósfera. Hasta 9 imágenes, 3 vídeos y 3 audios (máx. 12 archivos). Orden API: 1º frame grafo → último → @Image1…",
} as const;

export type VideoLightingPresetId =
  | ""
  | "golden_hour"
  | "volumetric_fog"
  | "neon_wet"
  | "studio_clean"
  | "rim_backlit"
  | "moonlight"
  | "dark_interior";

export const VIDEO_LIGHTING_PRESETS: Array<{
  id: VideoLightingPresetId;
  label: string;
  keywords: string;
}> = [
  { id: "", label: "Sin preset", keywords: "" },
  {
    id: "golden_hour",
    label: "Luz dorada (golden hour)",
    keywords:
      "golden hour light, magic hour, warm low sun, long soft shadows, diffused morning light, cinematic rim on edges",
  },
  {
    id: "volumetric_fog",
    label: "Niebla volumétrica",
    keywords:
      "volumetric fog, god rays, light shafts through haze, atmospheric depth, soft beam scattering",
  },
  {
    id: "neon_wet",
    label: "Neón en lluvia",
    keywords:
      "neon reflections on wet pavement, rainy street, colored specular highlights, moody night rain",
  },
  {
    id: "studio_clean",
    label: "Estudio limpio",
    keywords:
      "softbox studio lighting, even clean shadows, neutral backdrop, controlled highlights, physically-based soft light",
  },
  {
    id: "rim_backlit",
    label: "Contraluz / rim light",
    keywords:
      "strong rim lighting, backlight, silhouette, edge glow, subject separation from background",
  },
  {
    id: "moonlight",
    label: "Luz de luna",
    keywords:
      "cool moonlight, blue night tones, soft shadows, subtle silver fill, quiet nocturnal mood",
  },
  {
    id: "dark_interior",
    label: "Interior oscuro",
    keywords:
      "low-key chiaroscuro, dim practical lights, dark moody interior, selective pools of light",
  },
];

export type VideoVisualStylePresetId =
  | ""
  | "hyperreal"
  | "film_noir"
  | "documentary"
  | "sci_fi_cold"
  | "warm_indie"
  | "anim_3d";

export const VIDEO_VISUAL_STYLE_PRESETS: Array<{
  id: VideoVisualStylePresetId;
  label: string;
  keywords: string;
}> = [
  { id: "", label: "Sin preset", keywords: "" },
  {
    id: "hyperreal",
    label: "Hiperrealista",
    keywords:
      "hyperrealistic look, sharp micro-detail, subtle micro-contrast, clean digital negative, high dynamic range",
  },
  {
    id: "film_noir",
    label: "Film noir",
    keywords:
      "high-contrast black and white, hard shadows, venetian-blind shadows, classic noir mood",
  },
  {
    id: "documentary",
    label: "Documental",
    keywords:
      "handheld naturalistic documentary, 16mm documentary grain, neutral grade, available light realism",
  },
  {
    id: "sci_fi_cold",
    label: "Sci-fi frío",
    keywords:
      "cold teal-orange sci-fi grade, subtle anamorphic lens flare, sterile future aesthetic, controlled color separation",
  },
  {
    id: "warm_indie",
    label: "Cálido / indie",
    keywords:
      "warm Kodak-inspired indie film look, soft halation, natural skin tones, gentle 35mm grain",
  },
  {
    id: "anim_3d",
    label: "Animación 3D",
    keywords:
      "stylized 3D animation aesthetic, clean shaders, expressive rim light, controlled motion blur",
  },
];

export type VideoPhysicsKey = "cloth" | "fluid" | "hair" | "collision" | "gravity";

export const VIDEO_PHYSICS_OPTIONS: Array<{
  id: VideoPhysicsKey;
  label: string;
  keywords: string;
}> = [
  {
    id: "cloth",
    label: "Simulación de tela",
    keywords: "realistic cloth simulation, fabric drape and folds",
  },
  {
    id: "fluid",
    label: "Fluidos / lluvia",
    keywords: "fluid simulation, rain, splashes, water surface detail",
  },
  {
    id: "hair",
    label: "Pelo / pelaje",
    keywords: "hair and fur dynamics, strand-level detail",
  },
  {
    id: "collision",
    label: "Colisiones / impacto",
    keywords: "physical impacts, collisions, contact and rebound",
  },
  {
    id: "gravity",
    label: "Gravedad explícita",
    keywords: "explicit gravity, weight, inertia, grounded motion",
  },
];

/** Frases de cámara al estilo Seedance (inglés en prompt). */
export const SEEDANCE_CAMERA_QUICK_INSERTS: Array<{ id: string; label: string; en: string }> = [
  { id: "dolly_in", label: "Dolly adelante", en: "slow dolly push-in on the subject" },
  { id: "tracking", label: "Travelling lateral", en: "smooth lateral tracking shot" },
  { id: "crane_up", label: "Grúa ascendente", en: "crane shot rising from ground level" },
  { id: "orbit", label: "Órbita 270°", en: "smooth 270-degree clockwise orbit around the subject" },
  { id: "vertigo", label: "Efecto vértigo", en: "dolly back while zooming in, subtle background warp" },
  { id: "fpv", label: "FPV drone", en: "high-velocity FPV drone dive through the environment" },
];

export type VideoRefSlotImageKey = `Image${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`;
export type VideoRefSlotVideoKey = `Video${1 | 2 | 3}`;
export type VideoRefSlotAudioKey = `Audio${1 | 2 | 3}`;
export type VideoRefSlotKey = VideoRefSlotImageKey | VideoRefSlotVideoKey | VideoRefSlotAudioKey;

export function refTag(key: VideoRefSlotKey): string {
  return `@${key}`;
}

const IMAGE_KEYS: VideoRefSlotImageKey[] = [
  "Image1",
  "Image2",
  "Image3",
  "Image4",
  "Image5",
  "Image6",
  "Image7",
  "Image8",
  "Image9",
];

/** Slots serializados en `node.data.videoRefSlots` (data URL o https). */
export type VideoRefSlotsState = Partial<Record<VideoRefSlotKey, string>>;

export function countReferenceFiles(slots: VideoRefSlotsState | undefined): {
  images: number;
  videos: number;
  audios: number;
  total: number;
} {
  const s = slots || {};
  let images = 0;
  let videos = 0;
  let audios = 0;
  for (let i = 1; i <= 9; i++) {
    const k = `Image${i}` as VideoRefSlotImageKey;
    if (s[k]?.trim()) images += 1;
  }
  for (let i = 1; i <= 3; i++) {
    if (s[`Video${i}` as VideoRefSlotVideoKey]?.trim()) videos += 1;
    if (s[`Audio${i}` as VideoRefSlotAudioKey]?.trim()) audios += 1;
  }
  return { images, videos, audios, total: images + videos + audios };
}

function physicsFlagsFromData(data: unknown): Partial<Record<VideoPhysicsKey, boolean>> {
  if (!data || typeof data !== "object") return {};
  const o = data as Record<string, unknown>;
  const out: Partial<Record<VideoPhysicsKey, boolean>> = {};
  for (const k of ["cloth", "fluid", "hair", "collision", "gravity"] as VideoPhysicsKey[]) {
    if (o[`videoPhysics_${k}`] === true) out[k] = true;
  }
  return out;
}

/**
 * Sufijo en inglés: iluminación + estilo + física (presets del Studio).
 * No incluye el prompt base ni tags @ (van en el texto del usuario).
 */
export function buildDirectorEnhancementSuffix(args: {
  lightingId?: string;
  visualStyleId?: string;
  physics?: Partial<Record<VideoPhysicsKey, boolean>>;
}): string {
  const parts: string[] = [];
  const li = VIDEO_LIGHTING_PRESETS.find((p) => p.id === (args.lightingId || ""));
  if (li?.keywords) parts.push(li.keywords);
  const vs = VIDEO_VISUAL_STYLE_PRESETS.find((p) => p.id === (args.visualStyleId || ""));
  if (vs?.keywords) parts.push(vs.keywords);
  for (const opt of VIDEO_PHYSICS_OPTIONS) {
    if (args.physics?.[opt.id]) parts.push(opt.keywords);
  }
  return parts.join(". ").trim();
}

/** Lee flags `videoPhysics_*` desde datos del nodo. */
export function buildPhysicsFlagsFromNodeData(data: Record<string, unknown>): Partial<
  Record<VideoPhysicsKey, boolean>
> {
  return physicsFlagsFromData(data);
}

/**
 * Prompt final para la API: base + bloque director (presets).
 * `basePrompt` ya debe ser el del grafo o local unificado.
 */
export function mergeBasePromptWithDirectorBlock(
  basePrompt: string,
  enhancement: string,
): string {
  const b = basePrompt.trim();
  const e = enhancement.trim();
  if (!e) return b;
  if (!b) return e;
  return `${b}\n\n${e}`;
}

export function appendVideoPromptTail(
  prompt: string,
  args: {
    animationPrompt?: unknown;
    cameraPreset?: unknown;
    negativePrompt?: unknown;
    includeNegative?: boolean;
  },
): string {
  let finalPrompt = prompt.trim();
  const animation = typeof args.animationPrompt === "string" ? args.animationPrompt.trim() : "";
  const camera = typeof args.cameraPreset === "string" ? args.cameraPreset.trim() : "";
  const negative = typeof args.negativePrompt === "string" ? args.negativePrompt.trim() : "";
  if (animation) finalPrompt += `. Animation: ${animation}`;
  if (camera) finalPrompt += `. Camera motion: ${camera}`;
  if (args.includeNegative && negative) finalPrompt += `. Negative: avoid ${negative}`;
  return finalPrompt;
}

export function buildVideoPromptAssembly(args: {
  basePrompt: string;
  lightingId?: string;
  visualStyleId?: string;
  physics?: Partial<Record<VideoPhysicsKey, boolean>>;
  animationPrompt?: unknown;
  cameraPreset?: unknown;
  negativePrompt?: unknown;
  includeNegativeInPreview?: boolean;
}): {
  basePrompt: string;
  directorEnhancement: string;
  promptForRequest: string;
  readablePrompt: string;
} {
  const basePrompt = args.basePrompt.trim();
  const directorEnhancement = buildDirectorEnhancementSuffix({
    lightingId: args.lightingId,
    visualStyleId: args.visualStyleId,
    physics: args.physics,
  });
  const promptForRequest = mergeBasePromptWithDirectorBlock(basePrompt, directorEnhancement);
  const readablePrompt = appendVideoPromptTail(promptForRequest, {
    animationPrompt: args.animationPrompt,
    cameraPreset: args.cameraPreset,
    negativePrompt: args.negativePrompt,
    includeNegative: args.includeNegativeInPreview,
  });

  return {
    basePrompt,
    directorEnhancement,
    promptForRequest,
    readablePrompt,
  };
}

/**
 * Orden: primer frame grafo → último frame grafo → @Image1…@Image9 (Studio).
 * Máximo 9 imágenes en total (límite Seedance). Vídeo/audio: solo en prompt (@Video / @Audio).
 */
export function collectAllReferenceImageUrlsOrdered(args: {
  firstFrame?: string | null;
  lastFrame?: string | null;
  extraSlots?: VideoRefSlotsState;
}): string[] {
  const out: string[] = [];
  const push = (u?: string | null) => {
    const t = typeof u === "string" ? u.trim() : "";
    if (!t || out.length >= SEEDANCE_REF_LIMITS.maxImages) return;
    out.push(t);
  };
  push(args.firstFrame);
  push(args.lastFrame);
  for (const k of IMAGE_KEYS) {
    push(args.extraSlots?.[k]);
  }
  return out;
}

export function parseVideoRefSlots(raw: unknown): VideoRefSlotsState {
  if (!raw || typeof raw !== "object") return {};
  return raw as VideoRefSlotsState;
}

/** Cuenta imágenes que irán a la API (grafo + slots @Image*), máx. 9. */
export function estimatedApiImageCount(args: {
  graphFirstFrame?: string | null;
  graphLastFrame?: string | null;
  extraSlots?: VideoRefSlotsState;
}): number {
  return collectAllReferenceImageUrlsOrdered({
    firstFrame: args.graphFirstFrame,
    lastFrame: args.graphLastFrame,
    extraSlots: args.extraSlots,
  }).length;
}
