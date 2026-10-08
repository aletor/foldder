import {
  CINE_MODE_LABELS,
  CINE_CAMERA_MOVEMENT_LABELS,
  CINE_COLOR_GRADING_LABELS,
  CINE_LIGHTING_STYLE_LABELS,
  CINE_VISUAL_STYLE_LABELS,
  type CineAnalysisResult,
  type CineBackground,
  type CineCameraMovementType,
  type CineCharacter,
  type CineMode,
  type CineFrame,
  type CineFrame as Frame,
  type CineImageStudioResult,
  type CineImageStudioSession,
  type CineNodeData,
  type CineScene,
  type CineShot,
  type CineVisualDirection,
	  type CineVideoPlan,
	  makeCineId,
	} from "./cine-types";
import type { MediaListGroup, MediaListItem, MediaListOutput, MediaListOutputStatus } from "./media-list-output";

const CINE_VISUAL_STYLE_PROMPTS: Record<CineVisualDirection["visualStyle"], string> = {
  naturalistic_realistic: "Naturalistic realistic image language: grounded, believable, human, observed details and restrained stylization.",
  commercial_cinematic: "Commercial cinematic image language: polished composition, premium production value, clean readable subjects and strong visual clarity.",
  black_white_noir: "Black and white noir image language: monochrome, strong contrast, controlled shadows, sober camera and graphic light separation.",
  animation_cartoon: "Animation/cartoon image language: iconic silhouettes, simplified readable forms, expressive staging and animation-friendly character/background descriptions.",
  retro_vintage: "Retro vintage image language: period texture, nostalgic palette, analog imperfections and classic cinematic framing.",
  futuristic_sci_fi: "Futuristic sci-fi image language: advanced materials, sleek spatial design, technological atmosphere and precise light accents.",
  surreal_dreamlike: "Surreal dreamlike image language: poetic, uncanny, symbolic staging and subjective atmosphere without losing narrative readability.",
  raw_documentary: "Raw documentary image language: naturalistic, immediate, observational, imperfect human camera feeling and real-world texture.",
};

const CINE_COLOR_GRADING_PROMPTS: Record<CineVisualDirection["colorGrading"], string> = {
  teal_orange: "Teal and orange cinematic grade with cool shadows, warm skin/light accents and controlled contrast.",
  golden_hour_warm: "Golden hour warm cinematic grade with amber highlights, soft warmth and inviting atmosphere.",
  cool_blue_desaturated: "Cool blue desaturated grade with restrained saturation, cold atmosphere and subdued color intensity.",
  pastel_soft_film: "Pastel soft film look with gentle contrast, airy color, soft tonal transitions and delicate saturation.",
  high_contrast_crunchy: "High contrast crunchy grade with dense blacks, crisp highlights and strong tonal separation.",
  film_emulation_kodak_fuji: "Analog film emulation inspired by Kodak/Fuji color response, organic contrast, natural grain and cinematic rolloff.",
  vibrant_commercial_pop: "Vibrant commercial pop grade with clean saturated color, bright accents and polished advertising clarity.",
  bleach_bypass: "Bleach bypass grade with muted color, silvery highlights, hard contrast and gritty cinematic texture.",
  low_contrast_fade_matte: "Low contrast matte fade with lifted blacks, soft highlights and understated editorial finish.",
  monochrome_color_cast: "Monochrome color cast with a controlled single-color atmosphere and minimal chromatic distraction.",
};

const CINE_LIGHTING_STYLE_PROMPTS: Record<CineVisualDirection["lightingStyle"], string> = {
  normal: "Balanced motivated lighting with natural readability and cinematic control.",
  dark: "Dark low-key lighting, moody shadows, controlled highlights and a more atmospheric visual tone.",
  bright: "Bright high-key lighting, clean visibility, open highlights and a clear optimistic visual tone.",
};

export function cleanScriptText(input: string): string {
  return String(input ?? "")
    .replace(/\r/g, "\n")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/(^|[\s([{])\*([^*\n]+)\*(?=$|[\s.,;:!?)}\]])/g, "$1$2")
    .replace(/(^|[\s([{])_([^_\n]+)_(?=$|[\s.,;:!?)}\]])/g, "$1$2")
    .replace(/\*\*/g, "")
    .replace(/(^|\s)[*_]+(?=\s|$)/g, " ")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanText(text: string): string {
  return cleanScriptText(text).replace(/\n+/g, " ").replace(/[ \t]+/g, " ").trim();
}

function normalizeToken(text: string): string {
  return cleanScriptText(text).toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

function firstSentence(text: string, fallback = "Escena"): string {
  const clean = cleanText(text);
  const sentence = clean.split(/(?<=[.!?])\s+/)[0] || clean;
  return sentence.length > 86 ? `${sentence.slice(0, 83)}...` : sentence || fallback;
}

function sceneTitle(order: number): string {
  return `Escena ${String(order).padStart(2, "0")}`;
}

type ParsedAudiovisualBlock = {
  narrative: string[];
  voiceOver: string[];
  onScreenText: string[];
  visualNotes: string[];
  durationSeconds?: number;
};

const STRUCTURAL_LABELS = new Set([
  "voz",
  "voz en off",
  "texto",
  "texto en pantalla",
  "notas",
  "notas visuales",
  "duracion",
  "duración",
  "pantalla",
]);

function hasStructuredContent(block: ParsedAudiovisualBlock): boolean {
  return Boolean(
    block.narrative.length ||
      block.voiceOver.length ||
      block.onScreenText.length ||
      block.visualNotes.length ||
      block.durationSeconds != null,
  );
}

function emptyStructuredBlock(): ParsedAudiovisualBlock {
  return { narrative: [], voiceOver: [], onScreenText: [], visualNotes: [] };
}

function parseDurationSeconds(raw: string): number | undefined {
  const text = cleanScriptText(raw);
  const mmss = /(\d{1,2})\s*:\s*(\d{1,2})/.exec(text);
  if (mmss) return Number(mmss[1]) * 60 + Number(mmss[2]);
  const seconds = /(\d+(?:[.,]\d+)?)\s*(?:s|seg|segundos?)/i.exec(text);
  if (seconds) return Math.round(Number(seconds[1]?.replace(",", ".")));
  const plain = /^\d{1,3}$/.exec(text);
  return plain ? Number(text) : undefined;
}

function extractDurationAndRemainder(raw: string): { durationSeconds?: number; remainder: string } {
  const text = cleanScriptText(raw);
  const match = /^(?:duraci[oó]n\s*[:：-]?\s*)?(\d{1,2}\s*:\s*\d{1,2}|\d+(?:[.,]\d+)?\s*(?:s|seg|segundos?))\s*(.*)$/i.exec(text);
  if (!match) return { remainder: text };
  const durationSeconds = parseDurationSeconds(match[1] || "");
  return { durationSeconds, remainder: cleanScriptText(match[2] || "") };
}

function stripMarkdownLabel(line: string): { label?: string; value: string } {
  const cleaned = cleanScriptText(line);
  const match = /^\s*(voz en off|texto en pantalla|notas visuales|duraci[oó]n)\s*[:：-]?\s*(.*)$/i.exec(cleaned);
  if (!match) return { value: cleaned };
  return { label: normalizeToken(match[1] || ""), value: cleanScriptText(match[2] || "") };
}

function parseStructuredScriptBlocks(script: string): ParsedAudiovisualBlock[] {
  const lines = script.replace(/\r/g, "").split("\n").map((line) => line.trim()).filter(Boolean);
  const blocks: ParsedAudiovisualBlock[] = [];
  let current = emptyStructuredBlock();
  let sawStructuredLabel = false;
  let activeSection: "visualNotes" | null = null;

  const pushCurrent = () => {
    if (!hasStructuredContent(current)) return;
    blocks.push(current);
    current = emptyStructuredBlock();
    activeSection = null;
  };

  for (const rawLine of lines) {
    const { label, value } = stripMarkdownLabel(rawLine);
    if (!label) {
      const looksLikeSceneBreak = /^(?:escena|scene)\s+\d+|^(?:int|ext|interior|exterior)[.\s-]/i.test(rawLine);
      if (looksLikeSceneBreak && hasStructuredContent(current)) pushCurrent();
      const cleanLine = cleanScriptText(rawLine);
      if (activeSection === "visualNotes") {
        const duration = extractDurationAndRemainder(cleanLine);
        if (duration.durationSeconds != null) current.durationSeconds = duration.durationSeconds;
        if (duration.remainder) current.visualNotes.push(duration.remainder);
        continue;
      }
      if (cleanLine) current.narrative.push(cleanLine);
      continue;
    }

    sawStructuredLabel = true;
    if (label === "voz en off") {
      if ((current.visualNotes.length || current.durationSeconds != null) && current.voiceOver.length) pushCurrent();
      activeSection = null;
      if (value) current.voiceOver.push(cleanScriptText(value));
      continue;
    }
    if (label === "texto en pantalla") {
      activeSection = null;
      if (value) current.onScreenText.push(cleanScriptText(value));
      continue;
    }
    if (label === "notas visuales") {
      if (current.visualNotes.length) pushCurrent();
      activeSection = "visualNotes";
      if (value) {
        const duration = extractDurationAndRemainder(value);
        if (duration.durationSeconds != null) current.durationSeconds = duration.durationSeconds;
        if (duration.remainder) current.visualNotes.push(duration.remainder);
      }
      continue;
    }
    if (label === "duracion") {
      activeSection = "visualNotes";
      const duration = extractDurationAndRemainder(value);
      if (duration.durationSeconds != null) current.durationSeconds = duration.durationSeconds;
      if (duration.remainder) current.visualNotes.push(duration.remainder);
    }
  }

  pushCurrent();
  return sawStructuredLabel ? compactStructuredBlocks(blocks) : [];
}

function compactStructuredBlocks(blocks: ParsedAudiovisualBlock[]): ParsedAudiovisualBlock[] {
  if (blocks.length <= 6) return blocks;
  const compacted: ParsedAudiovisualBlock[] = [];
  const mergedDuration = (current?: number, next?: number): number | undefined => {
    if (current == null) return next;
    if (next == null) return current;
    return current + next;
  };
  for (const block of blocks) {
    const prev = compacted.at(-1);
    const prevText = [prev?.visualNotes.join(" "), prev?.narrative.join(" ")].join(" ");
    const nextText = [block.visualNotes.join(" "), block.narrative.join(" ")].join(" ");
    if (prev && compacted.length < 6 && inferBackgroundName(prevText) === inferBackgroundName(nextText)) {
      prev.narrative.push(...block.narrative);
      prev.voiceOver.push(...block.voiceOver);
      prev.onScreenText.push(...block.onScreenText);
      prev.visualNotes.push(...block.visualNotes);
      prev.durationSeconds = mergedDuration(prev.durationSeconds, block.durationSeconds);
      continue;
    }
    if (compacted.length >= 6) {
      const last = compacted[5]!;
      last.narrative.push(...block.narrative);
      last.voiceOver.push(...block.voiceOver);
      last.onScreenText.push(...block.onScreenText);
      last.visualNotes.push(...block.visualNotes);
      last.durationSeconds = mergedDuration(last.durationSeconds, block.durationSeconds);
      continue;
    }
    compacted.push({ ...block, narrative: [...block.narrative], voiceOver: [...block.voiceOver], onScreenText: [...block.onScreenText], visualNotes: [...block.visualNotes] });
  }
  return compacted;
}

function splitScriptIntoSceneTexts(script: string): string[] {
  const normalized = script.replace(/\r/g, "").trim();
  if (!normalized) return [];
  const explicit = normalized
    .split(/(?:\n\s*){2,}|(?=\b(?:escena|scene)\s+\d+\b[:.\-]?)/i)
    .map((part) => cleanText(part))
    .filter((part) => part.length > 12);
  if (explicit.length > 1) return explicit.slice(0, 24);
  const sentences = normalized.split(/(?<=[.!?])\s+/).map((part) => cleanText(part)).filter(Boolean);
  const grouped: string[] = [];
  for (let i = 0; i < sentences.length; i += 3) {
    grouped.push(sentences.slice(i, i + 3).join(" "));
  }
  return grouped.filter((part) => part.length > 12).slice(0, 24);
}

function inferCharacterNames(script: string): string[] {
  const blocked = new Set([
    "paso",
    "cada",
    "hoy",
    "vida",
    "texto",
    "pantalla",
    "notas",
    "visuales",
    "duracion",
    "voz",
    "off",
    "escena",
    "plano",
    "primer",
    "vista",
    "luz",
    "sol",
    "puerta",
    "salida",
    "coraje",
    "miedo",
    "desafio",
    "entrevista",
    "trabajo",
    "perdida",
    "recuerdo",
    "interior",
    "exterior",
    "dia",
    "noche",
    "marca",
    "proyecto",
    "cine",
  ]);
  const scriptWithoutLabels = script
    .split("\n")
    .map((line) => {
      const { label, value } = stripMarkdownLabel(line);
      return label ? value : line;
    })
    .join("\n");
  const cleanScript = cleanScriptText(scriptWithoutLabels);
  const matches = cleanScript.match(/\b[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,}(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,})?\b/g) ?? [];
  const counts = new Map<string, number>();
  for (const match of matches) {
    const name = cleanScriptText(match);
    const firstToken = normalizeToken(name.split(" ")[0] || "");
    if (blocked.has(firstToken)) continue;
    if (STRUCTURAL_LABELS.has(normalizeToken(name))) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }

  const humanAction = "(?:respira|camina|caminando|llega|llegando|sube|baja|mira|sonr[ií]e|entra|sale|recuerda|siente|llora|habla|escucha|observa|toca|cruza|agarra|sostiene|abre|cierra|avanza|retrocede)";
  const hasHumanEvidence = (name: string, count: number): boolean => {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const subjectAction = new RegExp(`\\b${escaped}\\b\\s+(?:${humanAction})\\b`, "i");
    const subjectGerund = new RegExp(`\\b${escaped}\\b\\s+(?:caminando|llegando|recordando)\\b`, "i");
    const introducedAsPerson = new RegExp(`\\b(?:para|con|vemos a|sigue a|protagonista|personaje)\\s+${escaped}\\b`, "i");
    return subjectAction.test(cleanScript) || subjectGerund.test(cleanScript) || introducedAsPerson.test(cleanScript) || (count >= 3 && /\b(?:protagonista|personaje|hombre|mujer|niñ[oa]|entrevistador|entrevistadora)\b/i.test(cleanScript));
  };

  const repeated = Array.from(counts.entries())
    .filter(([name, count]) => count >= 2 && hasHumanEvidence(name, count))
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name);

  const archetypes: string[] = [];
  const patterns: Array<[RegExp, string]> = [
    [/\bprotagonista\b/i, "Protagonista"],
    [/\bpersonaje\b/i, "Personaje"],
    [/\bhombre\b/i, "Hombre"],
    [/\bmujer\b/i, "Mujer"],
    [/\bniñ[oa]\b/i, "Niño"],
  ];
  for (const [pattern, name] of patterns) {
    if (pattern.test(cleanScript) && !archetypes.includes(name)) archetypes.push(name);
  }

  const names = [...repeated, ...archetypes].filter((name, index, all) => all.findIndex((item) => item.toLowerCase() === name.toLowerCase()) === index);
  return names.length ? names.slice(0, 5) : ["Protagonista"];
}

function inferBackgroundType(text: string): CineBackground["type"] {
  const lower = text.toLowerCase();
  if (/calle|ciudad|urbano|avenida|plaza/.test(lower)) return "urban";
  if (/bosque|montaña|playa|rio|río|campo|natural/.test(lower)) return "natural";
  if (/estudio|set|plató|plato/.test(lower)) return "studio";
  if (/casa|habitacion|habitación|oficina|interior|sala/.test(lower)) return "interior";
  if (/exterior|jardin|jardín/.test(lower)) return "exterior";
  return "other";
}

function makeCharacter(name: string, index: number): CineCharacter {
  const cleanName = cleanScriptText(name);
  return {
    id: makeCineId("cine_character"),
    name: cleanName,
    role: index === 0 ? "protagonist" : "secondary",
    description: index === 0 ? "Figura central de la pieza." : "Presencia secundaria de apoyo narrativo.",
    visualPrompt: `${cleanName}: continuidad visual consistente, presencia cinematografica natural, rasgos reconocibles y vestuario coherente entre escenas.`,
    lockedTraits: [],
    wardrobe: "Vestuario coherente con el tono del guion.",
    emotionalRange: ["contenido", "decidido", "vulnerable"],
    notes: "Revisar y bloquear rasgos antes de generar frames finales.",
    isLocked: false,
  };
}

function makeBackground(sceneText: string, index: number): CineBackground {
  const type = inferBackgroundType(sceneText);
  const inferredName = inferBackgroundName(sceneText);
  const nameByType: Record<NonNullable<CineBackground["type"]>, string> = {
    interior: "Interior principal",
    exterior: "Exterior principal",
    natural: "Entorno natural",
    urban: "Entorno urbano",
    studio: "Set de estudio",
    abstract: "Espacio abstracto",
    other: "Localización principal",
  };
  return {
    id: makeCineId("cine_background"),
    name: inferredName !== "Localización principal" ? inferredName : index === 0 ? nameByType[type ?? "other"] : `${nameByType[type ?? "other"]} ${index + 1}`,
    type,
    description: `Localización sugerida a partir del guion: ${firstSentence(sceneText, "ambiente narrativo")}`,
    visualPrompt: `Fondo cinematografico ${type ?? "narrativo"}, profundidad visual, continuidad espacial, sin texto ni marcas visibles.`,
    lighting: "Luz motivada por la escena, suave y cinematografica.",
    palette: [],
    textures: [],
    lockedElements: [],
    notes: "Puede reutilizarse en varias escenas si se bloquea.",
    isLocked: false,
  };
}

function detectBackgroundHints(sceneTexts: string[]): string[] {
  const hints: Array<[RegExp, string]> = [
    [/\bcocina\b/i, "Cocina"],
    [/\bcalle\b/i, "Calle"],
    [/\bhabitaci[oó]n\b/i, "Habitación"],
    [/\boficina\b/i, "Oficina"],
    [/\bcoche\b/i, "Coche"],
    [/\bbosque\b/i, "Bosque"],
    [/\bplaya\b/i, "Playa"],
    [/\bciudad\b/i, "Ciudad"],
    [/\bestadio\b/i, "Estadio"],
    [/\bcasa\b/i, "Casa"],
    [/\bpasillo\b/i, "Pasillo"],
    [/\bhospital\b/i, "Hospital"],
    [/\bbar\b/i, "Bar"],
    [/\brestaurante\b/i, "Restaurante"],
    [/\bescalera|rellano\b/i, "Escalera antigua del edificio"],
    [/\bentrevista\b/i, "Sala de entrevista"],
    [/\bpuerta|salida|hall\b/i, "Hall o puerta de salida iluminada"],
    [/\brecuerdo|recordando|p[eé]rdida|flashback\b/i, "Espacio de recuerdo / reflexión"],
    [/\bluz del sol|reflexi[oó]n\b/i, "Espacio iluminado de reflexión"],
  ];
  const found: string[] = [];
  const allText = sceneTexts.join("\n");
  for (const [pattern, name] of hints) {
    if (pattern.test(allText)) found.push(name);
  }
  return found.slice(0, 5);
}

function inferBackgroundName(text: string): string {
  const lower = text.toLowerCase();
  if (/entrevista|entrevistador/.test(lower)) return "Sala de entrevista";
  if (/recuerdo|recordando|p[eé]rdida|flashback/.test(lower)) return "Espacio de recuerdo / reflexión";
  if (/puerta|salida|hall|luz del sol/.test(lower)) return "Hall o puerta de salida iluminada";
  if (/escalera|rellano|escal[oó]n|edificio/.test(lower)) return "Escalera antigua del edificio";
  if (/oficina/.test(lower)) return "Oficina";
  if (/interior|habitación|habitacion|casa/.test(lower)) return "Interior narrativo";
  if (/calle|ciudad|edificio/.test(lower)) return "Exterior urbano";
  return "Localización principal";
}

function inferSceneKind(text: string): CineScene["sceneKind"] {
  const lower = text.toLowerCase();
  if (/flashback|hace un tiempo/.test(lower)) return "flashback";
  if (/recuerdo|recordando|p[eé]rdida/.test(lower)) return "memory";
  return "present";
}

function isCineCameraMovementType(raw: unknown): raw is CineCameraMovementType {
  return typeof raw === "string" && raw in CINE_CAMERA_MOVEMENT_LABELS;
}

function inferCameraMovementType(text: string, visualDirection?: CineVisualDirection): CineCameraMovementType {
  const lower = normalizeToken(text);
  if (/descubr|encuentr|revela|aparece|piramide|secreto|comportamiento extraño|extrano/.test(lower)) return "push_in";
  if (/explor|entra|adentra|camina|sendero|bosque|viaje|camino|recorre|avanza/.test(lower)) return "tracking_forward";
  if (/tension|miedo|peligro|oscuridad|nervios|amenaza|inestable/.test(lower)) return "handheld";
  if (/presenta|introduccion|pueblo|casa|amanecer|inicio/.test(lower)) return "static_subtle";
  if (/revelacion|monumental|altura|desde abajo|desde arriba|vertical|torre|piramide/.test(lower)) return "tilt";
  if (visualDirection?.visualStyle === "raw_documentary") return "handheld";
  if (visualDirection?.visualStyle === "commercial_cinematic") return "push_in";
  if (visualDirection?.visualStyle === "black_white_noir") return "static_subtle";
  if (visualDirection?.visualStyle === "surreal_dreamlike") return "pull_out";
  return "static_subtle";
}

function directionalShotLighting(visualDirection?: CineVisualDirection): string {
  if (!visualDirection) return "luz naturalista y expresiva";
  const lighting = CINE_LIGHTING_STYLE_PROMPTS[visualDirection.lightingStyle];
  const grade = CINE_COLOR_GRADING_PROMPTS[visualDirection.colorGrading];
  return `${lighting} ${grade}`;
}

function directionalShotMood(visualDirection?: CineVisualDirection): string {
  if (!visualDirection) return "cinematografico, claro, con continuidad emocional";
  return [
    visualDirection.tone,
    CINE_VISUAL_STYLE_LABELS[visualDirection.visualStyle],
    CINE_COLOR_GRADING_LABELS[visualDirection.colorGrading],
    CINE_LIGHTING_STYLE_LABELS[visualDirection.lightingStyle],
  ].filter(Boolean).join(" · ");
}

function inferSceneTitle(block: ParsedAudiovisualBlock, order: number): string {
  const text = cleanScriptText([...block.visualNotes, ...block.narrative, ...block.voiceOver].join(" ")).toLowerCase();
  if (/escalera/.test(text) && order === 1) return "Apertura en la escalera";
  if (/sara/.test(text) && /respira|baja|escal[oó]n|paso/.test(text)) return "Sara empieza a bajar";
  if (/entrevista/.test(text)) return "Recuerdo de la entrevista";
  if (/p[eé]rdida|recuerdo|recordando/.test(text)) return "Recuerdo de la pérdida";
  if (/victoria|logro|consigue|alcanza/.test(text)) return "Victoria en la escalera";
  if (/salida|puerta|luz/.test(text)) return "Salida hacia la luz";
  return sceneTitle(order);
}

function createScene(args: {
  text: string;
  order: number;
  characterIds: string[];
  backgroundId?: string;
  title?: string;
  voiceOver?: string;
  onScreenText?: string[];
  visualNotes?: string;
	  durationSeconds?: number;
	  sceneKind?: CineScene["sceneKind"];
	  visualDirection?: CineVisualDirection;
	}): CineScene {
  const title = cleanScriptText(args.title || sceneTitle(args.order));
  const sourceText = cleanText(args.text);
  const voiceOver = args.voiceOver ? cleanScriptText(args.voiceOver) : undefined;
  const onScreenText = (args.onScreenText ?? []).map(cleanScriptText).filter(Boolean);
  const visualNotes = args.visualNotes ? cleanScriptText(args.visualNotes) : undefined;
  const visualSummary = visualNotes || `Traducir esta parte del guion a un plano claro: ${firstSentence(sourceText || voiceOver || onScreenText.join(" "), title)}`;
  const durationSeconds = args.durationSeconds ?? 5;
  const cameraMovementType = inferCameraMovementType([title, sourceText, visualNotes, voiceOver].filter(Boolean).join(" "), args.visualDirection);
  return {
    id: makeCineId("cine_scene"),
    order: args.order,
    title,
    sourceText,
    visualSummary: cleanScriptText(visualSummary),
    voiceOver,
    onScreenText,
    visualNotes,
    durationSeconds: args.durationSeconds,
    sceneKind: args.sceneKind ?? inferSceneKind(sourceText),
    characters: args.characterIds.slice(0, 2),
    backgroundId: args.backgroundId,
    shot: {
      shotType: args.order === 1 ? "wide" : args.order % 3 === 0 ? "closeup" : "medium",
      cameraMovement: args.order === 1 ? "travelling lento de introduccion" : "movimiento sutil motivado por la accion",
      cameraMovementType,
      lensSuggestion: "35mm o 50mm cinematografico",
      lighting: directionalShotLighting(args.visualDirection),
      mood: directionalShotMood(args.visualDirection),
      action: firstSentence(sourceText || visualNotes || voiceOver || title, "accion principal de la escena"),
      durationSeconds,
    },
    framesMode: "single",
    frames: {},
    status: "draft",
  };
}

export function analyzeCineScript(script: string, options: CineAnalyzeOptions = {}): CineAnalysisResult {
  const clean = cleanText(script);
  const visualDirection = options.visualDirection;
  const mode = options.mode ?? visualDirection?.mode ?? "short_film";
  const structuredBlocks = parseStructuredScriptBlocks(script);
  const isStructuredScript = structuredBlocks.length > 0;
  const sceneTexts = isStructuredScript
    ? structuredBlocks.map((block) => cleanText([...block.narrative, ...block.voiceOver, ...block.onScreenText, ...block.visualNotes].join(" ")))
    : splitScriptIntoSceneTexts(clean);
  const names = inferCharacterNames(clean);
  const characters = names.map(makeCharacter);
  const structuredBackgroundHints = Array.from(new Set(sceneTexts.map(inferBackgroundName))).filter((name) => name && name !== "Localización principal").slice(0, 5);
  const backgroundHints = isStructuredScript
    ? structuredBackgroundHints
    : detectBackgroundHints(sceneTexts);
  const backgroundSeeds = backgroundHints.length
    ? backgroundHints.map((hint) => `Localización detectada: ${hint}. ${clean}`)
    : sceneTexts.slice(0, Math.max(1, Math.min(4, sceneTexts.length || 1)));
  const backgrounds = backgroundSeeds.map((seed, index) => {
    const background = makeBackground(seed || "Localización principal", index);
    if (backgroundHints[index]) {
      background.name = backgroundHints[index];
      background.description = `Localización narrativa detectada: ${backgroundHints[index]}.`;
      background.visualPrompt = `${backgroundHints[index]} con continuidad cinematográfica, escala clara, luz motivada y sin texto visible.`;
    }
    return background;
  });
  const backgroundByName = new Map(backgrounds.map((background) => [background.name, background.id]));
  const scenes = isStructuredScript
    ? structuredBlocks.map((block, index) => {
        const text = cleanText([...block.narrative, ...block.voiceOver, ...block.onScreenText, ...block.visualNotes].join(" "));
        const backgroundName = inferBackgroundName(text);
        const mentionedCharacters = characters
          .filter((character) => new RegExp(`\\b${character.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text))
          .map((character) => character.id);
        const inferredCharacters = mentionedCharacters.length
          ? mentionedCharacters
          : characters.length === 1 && text.length > 24
            ? [characters[0]!.id]
            : [];
        return createScene({
          text,
          order: index + 1,
          title: inferSceneTitle(block, index + 1),
          characterIds: inferredCharacters,
          backgroundId: backgroundByName.get(backgroundName) ?? backgrounds[index % Math.max(1, backgrounds.length)]?.id,
          voiceOver: block.voiceOver.map(cleanScriptText).filter(Boolean).join("\n"),
          onScreenText: block.onScreenText.map(cleanScriptText).filter(Boolean),
          visualNotes: block.visualNotes.map(cleanScriptText).filter(Boolean).join("\n"),
	          durationSeconds: block.durationSeconds,
	          sceneKind: inferSceneKind(text),
	          visualDirection,
	        });
      })
    : sceneTexts.map((text, index) =>
        createScene({
          text,
	          order: index + 1,
	          characterIds: characters.slice(0, 2).map((character) => character.id),
	          backgroundId: backgrounds[index % Math.max(1, backgrounds.length)]?.id,
	          visualDirection,
	        }),
	      );
  return {
    logline: firstSentence(clean, "Guion cinematografico"),
    summary: clean.length > 420 ? `${clean.slice(0, 417)}...` : clean,
    tone: "cinematografico, emocional y visual",
    visualStyle: visualDirection ? buildCineVisualDirectionPrompt(visualDirection) : "direccion sobria, continuidad clara, luz motivada y composiciones limpias",
    suggestedMode: mode,
    characters,
    backgrounds,
    scenes,
  };
}

export function applyCineAnalysisToData(data: CineNodeData, analysis: CineAnalysisResult): CineNodeData {
  const now = new Date().toISOString();
  const characters = analysis.characters.map((character, index) => ({
    ...makeCharacter(cleanScriptText(character.name || `Personaje ${index + 1}`), index),
    ...character,
    name: cleanScriptText(character.name || `Personaje ${index + 1}`),
    description: cleanScriptText(character.description || (index === 0 ? "Figura central de la pieza." : "Presencia secundaria de apoyo narrativo.")),
    visualPrompt: cleanScriptText(character.visualPrompt || `${cleanScriptText(character.name || `Personaje ${index + 1}`)}: continuidad visual consistente, presencia cinematografica natural, rasgos reconocibles y vestuario coherente entre escenas.`),
    negativePrompt: character.negativePrompt ? cleanScriptText(character.negativePrompt) : undefined,
    id: character.id || makeCineId("cine_character"),
    lockedTraits: Array.isArray(character.lockedTraits) ? character.lockedTraits.map(cleanScriptText).filter(Boolean) : [],
    wardrobe: character.wardrobe ? cleanScriptText(character.wardrobe) : undefined,
    emotionalRange: Array.isArray(character.emotionalRange) ? character.emotionalRange.map(cleanScriptText).filter(Boolean) : [],
    notes: character.notes ? cleanScriptText(character.notes) : undefined,
  })) as CineCharacter[];
  const backgrounds = analysis.backgrounds.map((background, index) => ({
    ...makeBackground(cleanScriptText(background.description || background.name || `Fondo ${index + 1}`), index),
    ...background,
    name: cleanScriptText(background.name || `Fondo ${index + 1}`),
    description: cleanScriptText(background.description || `Localización narrativa ${index + 1}.`),
    visualPrompt: cleanScriptText(background.visualPrompt || `${cleanScriptText(background.name || `Fondo ${index + 1}`)} con continuidad cinematográfica, escala clara, luz motivada y sin texto visible.`),
    negativePrompt: background.negativePrompt ? cleanScriptText(background.negativePrompt) : undefined,
    id: background.id || makeCineId("cine_background"),
    palette: Array.isArray(background.palette) ? background.palette.map(cleanScriptText).filter(Boolean) : [],
    textures: Array.isArray(background.textures) ? background.textures.map(cleanScriptText).filter(Boolean) : [],
    lockedElements: Array.isArray(background.lockedElements) ? background.lockedElements.map(cleanScriptText).filter(Boolean) : [],
    notes: background.notes ? cleanScriptText(background.notes) : undefined,
  })) as CineBackground[];
  const scenes = analysis.scenes.map((scene, index) => ({
    ...createScene({
      text: scene.sourceText || scene.visualSummary || scene.title || `Escena ${index + 1}`,
      order: index + 1,
      characterIds: characters.slice(0, 2).map((character) => character.id),
      backgroundId: backgrounds[index % Math.max(1, backgrounds.length)]?.id,
      voiceOver: scene.voiceOver,
      onScreenText: scene.onScreenText,
      visualNotes: scene.visualNotes,
      durationSeconds: scene.durationSeconds,
      sceneKind: scene.sceneKind,
    }),
    ...scene,
    id: scene.id || makeCineId("cine_scene"),
    order: typeof scene.order === "number" ? scene.order : index + 1,
    frames: scene.frames || {},
    shot: {
      ...createScene({
        text: scene.sourceText || scene.visualSummary || scene.title || `Escena ${index + 1}`,
        order: index + 1,
        characterIds: characters.slice(0, 2).map((character) => character.id),
        backgroundId: backgrounds[index % Math.max(1, backgrounds.length)]?.id,
        durationSeconds: scene.durationSeconds,
      }).shot,
      ...(scene.shot ?? {}),
      durationSeconds: scene.durationSeconds ?? scene.shot?.durationSeconds ?? 5,
    },
    status: scene.status || "draft",
  })) as CineScene[];
  return {
    ...data,
    mode: analysis.suggestedMode ?? data.mode,
    visualDirection: {
      ...data.visualDirection,
      mode: analysis.suggestedMode ?? data.visualDirection.mode ?? data.mode,
    },
    detected: analysis,
    characters,
    backgrounds,
    scenes,
    selectedSceneId: scenes[0]?.id,
    status: "analyzed",
    value: JSON.stringify({ scenes: scenes.length, characters: characters.length, backgrounds: backgrounds.length }),
    metadata: { ...data.metadata, updatedAt: now },
  };
}

type CineAnalyzeOptions = {
  mode?: CineMode;
  visualDirection?: CineVisualDirection;
  /** Bloque BrandKit (voz, esencia, mundo visual, paleta, logo) — misma llamada de pago. */
  brandContext?: {
    enabled?: boolean;
    analyzeBlock?: string;
  };
  signal?: AbortSignal;
};

function asAiRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
}

function asAiArray(raw: unknown): unknown[] {
  return Array.isArray(raw) ? raw : [];
}

function asAiString(raw: unknown, fallback = ""): string {
  return typeof raw === "string" ? cleanScriptText(raw) : fallback;
}

function asAiStringArray(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((item) => asAiString(item)).filter(Boolean);
  const text = asAiString(raw);
  return text ? [text] : [];
}

function asAiNumber(raw: unknown, fallback?: number): number | undefined {
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.max(0, Math.round(raw));
  if (typeof raw === "string") {
    const parsedDuration = parseDurationSeconds(raw);
    if (parsedDuration != null) return parsedDuration;
    const numeric = Number(raw.replace(",", "."));
    if (Number.isFinite(numeric)) return Math.max(0, Math.round(numeric));
  }
  return fallback;
}

function uniqueCleanId(seed: string, prefix: string, used: Set<string>): string {
  const base = normalizeToken(seed).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 42);
  let id = base ? `${prefix}_${base}` : makeCineId(prefix);
  let index = 2;
  while (used.has(id)) {
    id = `${base ? `${prefix}_${base}` : makeCineId(prefix)}_${index}`;
    index += 1;
  }
  used.add(id);
  return id;
}

function isInvalidAiCharacterName(name: string): boolean {
  const token = normalizeToken(name);
  if (!token || token.length < 2) return true;
  if (STRUCTURAL_LABELS.has(token)) return true;
  return new Set([
    "paso",
    "cada",
    "hoy",
    "vida",
    "texto",
    "pantalla",
    "notas",
    "visuales",
    "duracion",
    "voz",
    "off",
    "escena",
    "plano",
    "primer",
    "vista",
    "luz",
    "sol",
    "puerta",
    "salida",
    "continuara",
    "continuará",
  ]).has(token);
}

function normalizeAiCharacter(raw: unknown, index: number, usedIds: Set<string>): CineCharacter | null {
  const row = asAiRecord(raw);
  const name = asAiString(row.name || row.nombre || row.title || row.label, `Personaje ${index + 1}`);
  if (isInvalidAiCharacterName(name)) return null;
  const role = ["protagonist", "secondary", "extra", "object"].includes(asAiString(row.role))
    ? row.role as CineCharacter["role"]
    : index === 0 ? "protagonist" : "secondary";
  const description = asAiString(row.description || row.descripcion, role === "object" ? "Objeto con función narrativa visual." : "Entidad visual del guion.");
  return {
    id: uniqueCleanId(asAiString(row.id) || name, "cine_character", usedIds),
    name,
    role,
    description,
    visualPrompt: asAiString(row.visualPrompt || row.prompt, `${name}: ${description}. Mantener continuidad visual consistente entre escenas.`),
    negativePrompt: asAiString(row.negativePrompt) || undefined,
    referenceImageAssetId: asAiString(row.referenceImageAssetId) || undefined,
    approvedImageAssetId: asAiString(row.approvedImageAssetId) || undefined,
    lockedTraits: asAiStringArray(row.lockedTraits),
    wardrobe: asAiString(row.wardrobe) || undefined,
    emotionalRange: asAiStringArray(row.emotionalRange),
    notes: asAiString(row.notes) || undefined,
    isLocked: Boolean(row.isLocked),
  };
}

function normalizeAiBackground(raw: unknown, index: number, usedIds: Set<string>): CineBackground | null {
  const row = asAiRecord(raw);
  const name = asAiString(row.name || row.nombre || row.title || row.label, "");
  const description = asAiString(row.description || row.descripcion || row.visualSummary, "");
  if (!name && !description) return null;
  const type = asAiString(row.type);
  const cleanName = name || `Fondo ${index + 1}`;
  return {
    id: uniqueCleanId(asAiString(row.id) || cleanName, "cine_background", usedIds),
    name: cleanName,
    type: ["interior", "exterior", "natural", "urban", "studio", "abstract", "other"].includes(type)
      ? type as CineBackground["type"]
      : inferBackgroundType(`${cleanName} ${description}`),
    description: description || `Localización reutilizable: ${cleanName}.`,
    visualPrompt: asAiString(row.visualPrompt || row.prompt, `${cleanName}: continuidad espacial clara, escala cinematográfica, luz motivada y sin texto visible.`),
    negativePrompt: asAiString(row.negativePrompt) || undefined,
    referenceImageAssetId: asAiString(row.referenceImageAssetId) || undefined,
    approvedImageAssetId: asAiString(row.approvedImageAssetId) || undefined,
    lighting: asAiString(row.lighting) || undefined,
    palette: asAiStringArray(row.palette),
    textures: asAiStringArray(row.textures),
    lockedElements: asAiStringArray(row.lockedElements),
    notes: asAiString(row.notes) || undefined,
    isLocked: Boolean(row.isLocked),
  };
}

function resolveAiCharacterIds(raw: unknown, characters: CineCharacter[], sceneText: string): string[] {
  const rows = asAiArray(raw);
  const tokens = rows.flatMap((item) => {
    if (typeof item === "string") return [item];
    const row = asAiRecord(item);
    return [row.id, row.name, row.nombre, row.title].map((value) => asAiString(value)).filter(Boolean);
  });
  const resolved = characters.filter((character) => {
    const byToken = tokens.some((token) => {
      const cleanToken = normalizeToken(token);
      const cleanId = normalizeToken(character.id);
      const cleanName = normalizeToken(character.name);
      return cleanToken === cleanId || cleanToken === cleanName || cleanId.endsWith(`_${cleanToken}`);
    });
    const bySceneText = new RegExp(`\\b${character.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(sceneText);
    return byToken || bySceneText;
  }).map((character) => character.id);
  return Array.from(new Set(resolved)).slice(0, 4);
}

function resolveAiBackgroundId(raw: unknown, backgrounds: CineBackground[], sceneText: string, index: number): string | undefined {
  const token = asAiString(raw);
  const byToken = backgrounds.find((background) => {
    const cleanToken = normalizeToken(token);
    const cleanId = normalizeToken(background.id);
    const cleanName = normalizeToken(background.name);
    return cleanToken === cleanId || cleanToken === cleanName || cleanId.endsWith(`_${cleanToken}`);
  });
  if (byToken) return byToken.id;
  const inferred = inferBackgroundName(sceneText);
  const byInferred = backgrounds.find((background) => normalizeToken(background.name) === normalizeToken(inferred) || normalizeToken(background.description).includes(normalizeToken(inferred)));
  return byInferred?.id ?? backgrounds[index % Math.max(1, backgrounds.length)]?.id;
}

function normalizeAiScene(raw: unknown, index: number, characters: CineCharacter[], backgrounds: CineBackground[], usedIds: Set<string>): CineScene {
  const row = asAiRecord(raw);
  const shot = asAiRecord(row.shot);
  const sourceText = asAiString(row.sourceText || row.text || row.guion || row.narrative, "");
  const voiceOver = asAiString(row.voiceOver || row.voice_over) || undefined;
  const onScreenText = asAiStringArray(row.onScreenText || row.on_screen_text);
  const visualNotes = asAiString(row.visualNotes || row.visual_notes || row.notasVisuales) || undefined;
  const visualSummary =
    asAiString(row.visualSummary || row.visual_summary || row.summary, "") ||
    visualNotes ||
    firstSentence(sourceText || voiceOver || onScreenText.join(" "), `Escena ${index + 1}`);
  const sceneText = cleanText([sourceText, voiceOver, visualNotes, visualSummary, onScreenText.join(" ")].filter(Boolean).join(" "));
  const durationSeconds = asAiNumber(row.durationSeconds ?? row.duration_seconds ?? shot.durationSeconds, 5) ?? 5;
  const shotType = Object.keys({
    extreme_wide: true,
    wide: true,
    medium: true,
    medium_closeup: true,
    closeup: true,
    extreme_closeup: true,
    detail: true,
    over_shoulder: true,
    pov: true,
    top_shot: true,
    low_angle: true,
    high_angle: true,
  }).includes(asAiString(shot.shotType || row.shotType))
    ? asAiString(shot.shotType || row.shotType) as CineShot["shotType"]
    : "medium";
  const sceneKind = ["present", "flashback", "memory", "other"].includes(asAiString(row.sceneKind || row.scene_kind))
    ? asAiString(row.sceneKind || row.scene_kind) as CineScene["sceneKind"]
    : inferSceneKind(sceneText);
  const inferredCameraMovementType = inferCameraMovementType([sceneText, visualNotes, visualSummary, asAiString(shot.action || row.action)].filter(Boolean).join(" "));
  const cameraMovementType = isCineCameraMovementType(shot.cameraMovementType)
    ? shot.cameraMovementType
    : isCineCameraMovementType(row.cameraMovementType)
      ? row.cameraMovementType
      : inferredCameraMovementType;
  return {
    id: uniqueCleanId(asAiString(row.id) || `${index + 1}_${asAiString(row.title) || visualSummary}`, "cine_scene", usedIds),
    order: typeof row.order === "number" ? row.order : index + 1,
    title: asAiString(row.title, sceneTitle(index + 1)),
    sourceText: sourceText || sceneText,
    visualSummary,
    voiceOver,
    onScreenText,
    visualNotes,
    durationSeconds,
    sceneKind,
    characters: resolveAiCharacterIds(row.characters, characters, sceneText),
    backgroundId: resolveAiBackgroundId(row.backgroundId || row.background || row.location || row.fondo, backgrounds, sceneText, index),
    shot: {
      shotType,
      cameraMovement: asAiString(shot.cameraMovement || row.cameraMovement, "movimiento sutil motivado por la accion"),
      cameraMovementType,
      cameraDescription: asAiString(shot.cameraDescription || row.cameraDescription),
      lensSuggestion: asAiString(shot.lensSuggestion || row.lensSuggestion, "35mm o 50mm cinematografico"),
      lighting: asAiString(shot.lighting || row.lighting, "luz motivada por la escena"),
      mood: asAiString(shot.mood || row.mood, "cinematografico y claro"),
      action: asAiString(shot.action || row.action, firstSentence(sceneText, "accion principal de la escena")),
      durationSeconds,
    },
    framesMode: "single",
    frames: {},
    status: "draft",
  };
}

function dedupeBackgrounds(backgrounds: CineBackground[]): CineBackground[] {
  const seen = new Set<string>();
  const result: CineBackground[] = [];
  for (const background of backgrounds) {
    const key = normalizeToken(background.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(background);
  }
  return result;
}

function sceneLocationText(scene: CineScene): string {
  return cleanText([
    scene.visualNotes,
    scene.visualSummary,
    scene.shot.action,
    scene.sourceText,
    scene.voiceOver,
  ].filter(Boolean).join(" "));
}

function inferNarrativeBackgroundSpec(text: string): Pick<CineBackground, "name" | "type" | "description" | "visualPrompt" | "lighting" | "textures" | "lockedElements"> | null {
  const lower = normalizeToken(text);
  if (!lower) return null;
  const mentionsPyramid = /piramide|pirámide|templo|estructura antigua/.test(lower);
  if (mentionsPyramid && /\bbase\b|\bpie\b|entrada|frente|fachada|suben|escalones/.test(lower)) {
    return {
      name: "Base de la pirámide antigua",
      type: "exterior",
      description: "Base exterior de una pirámide antigua, escala monumental y entrada visible.",
      visualPrompt: "Base exterior de pirámide antigua, piedra erosionada, entrada misteriosa, escala monumental y vegetación cercana.",
      lighting: "Luz natural filtrada, contraste de aventura.",
      textures: ["piedra antigua", "musgo", "tierra", "vegetación"],
      lockedElements: ["base de pirámide", "entrada", "piedra antigua"],
    };
  }
  const entering = /se adentran|adentran|\bentran\b|\bentra\b|dentro|interior|linternas|linterna|oscuridad|explorar dentro|exploran dentro/.test(lower);
  if (mentionsPyramid && entering) {
    return {
      name: "Interior de la pirámide",
      type: "interior",
      description: "Interior oscuro de una pirámide antigua, exploración con linternas, ambiente misterioso.",
      visualPrompt: "Interior de una pirámide antigua, corredores de piedra, sombras profundas, linternas como fuente de luz, misterio cinematográfico.",
      lighting: "Luz baja de linternas, contraste suave y atmósfera de descubrimiento.",
      textures: ["piedra antigua", "polvo", "sombras", "relieves erosionados"],
      lockedElements: ["interior de pirámide", "linternas", "piedra antigua"],
    };
  }
  if (mentionsPyramid && /claro|aparece|descubre|descubren|encuentra|encuentran|escondida|estructura/.test(lower)) {
    return {
      name: "Claro con pirámide escondida",
      type: "natural",
      description: "Claro del bosque donde aparece una pirámide antigua escondida entre vegetación.",
      visualPrompt: "Claro de bosque con pirámide antigua parcialmente oculta por vegetación, sensación de descubrimiento y aventura.",
      lighting: "Luz natural entre árboles, atmósfera de hallazgo.",
      textures: ["vegetación", "piedra", "tierra", "hojas"],
      lockedElements: ["claro del bosque", "pirámide escondida", "vegetación"],
    };
  }
  if (/sendero|camino|bosque|arboles|árboles|ramas|hojas/.test(lower)) {
    return {
      name: "Sendero del bosque",
      type: "natural",
      description: "Sendero rodeado de árboles, camino de aventura hacia un descubrimiento.",
      visualPrompt: "Sendero de bosque con árboles alrededor, camino natural, profundidad visual y tono de aventura familiar.",
      lighting: "Luz natural filtrada por árboles.",
      textures: ["hojas", "tierra", "corteza", "vegetación"],
      lockedElements: ["sendero", "árboles", "camino natural"],
    };
  }
  if (/casa|hogar|pueblo|mañana soleada|manana soleada|ventana|salon|salón|cocina/.test(lower)) {
    return {
      name: "Casa soleada en el pueblo",
      type: "interior",
      description: "Casa cálida y luminosa en un pueblo, punto de partida cotidiano de la aventura.",
      visualPrompt: "Casa soleada de pueblo, ambiente cálido, detalles domésticos, luz de mañana y sensación de inicio de aventura.",
      lighting: "Luz cálida de mañana entrando por ventanas.",
      textures: ["madera", "paredes cálidas", "textiles domésticos"],
      lockedElements: ["casa de pueblo", "luz de mañana", "ambiente familiar"],
    };
  }
  if (/puerta|entrada|salida|hall/.test(lower)) {
    return {
      name: "Entrada o salida iluminada",
      type: "interior",
      description: "Zona de entrada o salida con luz marcada, transición narrativa.",
      visualPrompt: "Hall o puerta iluminada, transición espacial clara, luz de salida y composición cinematográfica.",
      lighting: "Luz direccional desde la puerta.",
      textures: ["suelo", "marco de puerta", "luz ambiental"],
      lockedElements: ["puerta", "zona de transición", "luz de salida"],
    };
  }
  return null;
}

function createBackgroundFromSpec(spec: NonNullable<ReturnType<typeof inferNarrativeBackgroundSpec>>, usedIds: Set<string>): CineBackground {
  return {
    id: uniqueCleanId(spec.name, "cine_background", usedIds),
    name: spec.name,
    type: spec.type,
    description: spec.description,
    visualPrompt: spec.visualPrompt,
    lighting: spec.lighting,
    palette: [],
    textures: spec.textures ?? [],
    lockedElements: spec.lockedElements ?? [],
    notes: "Fondo creado por normalización narrativa del Nodo Cine.",
    isLocked: false,
  };
}

function findMatchingBackground(backgrounds: CineBackground[], spec: NonNullable<ReturnType<typeof inferNarrativeBackgroundSpec>>): CineBackground | undefined {
  const specName = normalizeToken(spec.name);
  return backgrounds.find((background) => {
    const name = normalizeToken(background.name);
    if (name === specName) return true;
    if (specName.includes("interior") && specName.includes("piramide")) return name.includes("interior") && name.includes("piramide");
    if (specName.includes("base") && specName.includes("piramide")) return name.includes("base") && name.includes("piramide");
    if (specName.includes("claro") && specName.includes("piramide")) return name.includes("claro") && name.includes("piramide");
    if (specName.includes("sendero") && specName.includes("bosque")) return name.includes("sendero") || name.includes("bosque");
    if (specName.includes("casa")) return name.includes("casa") || name.includes("hogar");
    return false;
  });
}

function titleFromSceneBeat(scene: CineScene): string {
  const text = normalizeToken(sceneLocationText(scene));
  if (/continuara|continuará|continuar/.test(text)) return "Continuará";
  if (/interior|dentro|linternas|adentran|entran/.test(text) && /piramide|pirámide/.test(text)) return "Entrada al interior";
  if (/base|entrada|frente|fachada/.test(text) && /piramide|pirámide/.test(text)) return "Exploración de la pirámide";
  if (/claro|descubre|descubren|encuentra|aparece|estructura/.test(text) && /piramide|pirámide/.test(text)) return "Descubrimiento de la pirámide";
  if (/puffy/.test(text) && /raro|extraño|extrano|olfatea|detecta|se detiene/.test(text)) return "El comportamiento extraño de Puffy";
  if (/sendero|camino|bosque|arboles|árboles/.test(text)) return "Camino hacia el bosque";
  if (/casa|hogar|pueblo|mañana|manana/.test(text)) return "Introducción en el pueblo";
  return cleanScriptText(scene.title || sceneTitle(scene.order));
}

function enrichBackgroundsAndScenes(backgroundsInput: CineBackground[], scenesInput: CineScene[], usedBackgroundIds: Set<string>): { backgrounds: CineBackground[]; scenes: CineScene[] } {
  let backgrounds = dedupeBackgrounds(backgroundsInput);
  const scenes = scenesInput.map((scene, index) => {
    const spec = inferNarrativeBackgroundSpec(sceneLocationText(scene));
    let backgroundId = scene.backgroundId;
    if (spec) {
      let background = findMatchingBackground(backgrounds, spec);
      if (!background) {
        background = createBackgroundFromSpec(spec, usedBackgroundIds);
        backgrounds = [...backgrounds, background];
      }
      backgroundId = background.id;
    } else if (!backgroundId || !backgrounds.some((background) => background.id === backgroundId)) {
      backgroundId = backgrounds[index % Math.max(1, backgrounds.length)]?.id;
    }
    const visualSummary = scene.visualSummary || scene.visualNotes || firstSentence(scene.sourceText || scene.voiceOver || scene.title, scene.title);
    return {
      ...scene,
      order: index + 1,
      title: titleFromSceneBeat({ ...scene, visualSummary }),
      visualSummary,
      backgroundId,
      durationSeconds: scene.durationSeconds ?? scene.shot.durationSeconds ?? 5,
      shot: {
        ...scene.shot,
        durationSeconds: scene.durationSeconds ?? scene.shot.durationSeconds ?? 5,
      },
      framesMode: "single" as const,
      frames: {},
      status: "draft" as const,
    };
  });

  if (!backgrounds.length) {
    backgrounds = [createBackgroundFromSpec({
      name: "Localización principal",
      type: "other",
      description: "Localización narrativa principal sin pistas visuales suficientes.",
      visualPrompt: "Localización cinematográfica principal, clara y reutilizable.",
      lighting: "Luz motivada por la escena.",
      textures: [],
      lockedElements: [],
    }, usedBackgroundIds)];
  }
  return { backgrounds, scenes };
}

export function validateAndNormalizeCineAIAnalysis(result: unknown, fallbackScript = ""): CineAnalysisResult {
  const root = asAiRecord(result);
  const payload = asAiRecord(root.analysis || root.result || root.data || root);
  const usedCharacterIds = new Set<string>();
  const usedBackgroundIds = new Set<string>();
  const usedSceneIds = new Set<string>();
  const rawCharacters = asAiArray(payload.characters || payload.personajes);
  let characters = rawCharacters
    .map((item, index) => normalizeAiCharacter(item, index, usedCharacterIds))
    .filter((item): item is CineCharacter => Boolean(item));
  if (!characters.length) {
    characters = inferCharacterNames(fallbackScript).map((name, index) => makeCharacter(name, index));
  }

  const rawBackgrounds = asAiArray(payload.backgrounds || payload.fondos || payload.locations || payload.localizaciones);
  let backgrounds = rawBackgrounds
    .map((item, index) => normalizeAiBackground(item, index, usedBackgroundIds))
    .filter((item): item is CineBackground => Boolean(item));
  backgrounds = dedupeBackgrounds(backgrounds);
  const rawScenes = asAiArray(payload.scenes || payload.escenas);
  if (!backgrounds.length) {
    const sceneTexts = rawScenes.map((scene) => {
      const row = asAiRecord(scene);
      return cleanText([
        asAiString(row.visualNotes || row.visual_notes),
        asAiString(row.visualSummary || row.visual_summary),
        asAiString(row.sourceText || row.text),
      ].join(" "));
    }).filter(Boolean);
    const hints = Array.from(new Set(sceneTexts.map(inferBackgroundName))).filter((name) => name !== "Localización principal");
    backgrounds = (hints.length ? hints : ["Localización narrativa"]).map((name, index) => makeBackground(`Localización detectada: ${name}`, index));
    backgrounds.forEach((background, index) => {
      background.id = uniqueCleanId(background.name, "cine_background", usedBackgroundIds);
      if (hints[index]) background.name = hints[index];
    });
  }

  let scenes = rawScenes.map((item, index) => normalizeAiScene(item, index, characters, backgrounds, usedSceneIds));
  if (!scenes.length) {
    scenes = analyzeCineScript(fallbackScript).scenes.map((scene, index) => normalizeAiScene(scene, index, characters, backgrounds, usedSceneIds));
  }
  scenes = scenes
    .sort((a, b) => a.order - b.order)
    .map((scene, index) => ({
      ...scene,
      order: index + 1,
      visualSummary: scene.visualSummary || scene.visualNotes || firstSentence(scene.sourceText || scene.voiceOver || scene.title, scene.title),
      durationSeconds: scene.durationSeconds ?? 5,
      framesMode: "single",
      frames: {},
      status: "draft",
    }));
  const enriched = enrichBackgroundsAndScenes(backgrounds, scenes, usedBackgroundIds);
  backgrounds = enriched.backgrounds;
  scenes = enriched.scenes;

  return {
    logline: asAiString(payload.logline, firstSentence(fallbackScript, "Guion cinematografico")),
    summary: asAiString(payload.summary || payload.resumen, firstSentence(fallbackScript, "Resumen pendiente")),
    tone: asAiString(payload.tone || payload.tono, "cinematografico, narrativo y visual"),
    visualStyle: asAiString(payload.visualStyle || payload.estiloVisual, "direccion cinematografica clara, continuidad visual y localizaciones reconocibles"),
    suggestedMode: Object.keys(CINE_MODE_LABELS).includes(asAiString(payload.suggestedMode)) ? payload.suggestedMode as CineMode : undefined,
    characters,
    backgrounds,
    scenes,
  };
}

export async function analyzeCineScriptWithAI(script: string, options: CineAnalyzeOptions = {}): Promise<CineAnalysisResult> {
  const response = await fetch("/api/spaces/cine/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      script,
      mode: options.mode,
      visualDirection: options.visualDirection,
      brandContext: options.brandContext?.enabled
        ? {
            enabled: true,
            analyzeBlock: options.brandContext.analyzeBlock ?? "",
          }
        : undefined,
    }),
    signal: options.signal,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(error?.error || "No se pudo analizar con IA.");
  }
  const json = await response.json();
  return validateAndNormalizeCineAIAnalysis(json, script);
}

function line(label: string, value?: string | string[]): string | null {
  const text = Array.isArray(value) ? value.filter(Boolean).join(", ") : value;
  return text && text.trim() ? `${label}: ${text.trim()}` : null;
}

export function getEffectiveSceneVisualDirection(data: CineNodeData, scene?: CineScene): CineVisualDirection {
  return {
    ...data.visualDirection,
    visualStyle: scene?.visualOverride?.visualStyle ?? data.visualDirection.visualStyle,
    colorGrading: scene?.visualOverride?.colorGrading ?? data.visualDirection.colorGrading,
    lightingStyle: scene?.visualOverride?.lightingStyle ?? data.visualDirection.lightingStyle,
  };
}

export function buildCineVisualDirectionPrompt(visualDirection: CineVisualDirection): string {
  return [
    line("Production type", CINE_MODE_LABELS[visualDirection.mode]),
    line("Aspect ratio", visualDirection.aspectRatio),
    line("Visual style", `${CINE_VISUAL_STYLE_LABELS[visualDirection.visualStyle]}. ${CINE_VISUAL_STYLE_PROMPTS[visualDirection.visualStyle]}`),
    line("Color grading", `${CINE_COLOR_GRADING_LABELS[visualDirection.colorGrading]}. ${CINE_COLOR_GRADING_PROMPTS[visualDirection.colorGrading]}`),
    line("Lighting", `${CINE_LIGHTING_STYLE_LABELS[visualDirection.lightingStyle]}. ${CINE_LIGHTING_STYLE_PROMPTS[visualDirection.lightingStyle]}`),
    line("Realism level", visualDirection.realismLevel),
    line("Global style note", visualDirection.globalStylePrompt),
    line("Tone", visualDirection.tone),
    line("Pacing", visualDirection.pacing),
    line("Camera style", visualDirection.cameraStyle),
  ].filter((item): item is string => Boolean(item)).join("\n");
}

function sceneKindTreatment(kind?: CineScene["sceneKind"]): string | null {
  if (kind === "flashback") {
    return "Subtle flashback treatment: softer contrast, slightly warmer or gently desaturated memory feeling, temporal shift without heavy blur, dream fog or exaggerated glow.";
  }
  if (kind === "memory") {
    return "Subjective memory treatment: reflective mood, soft motivated light, emotional stillness and intimate framing, without over-stylized effects.";
  }
  return kind === "present" ? "Present-time scene: keep the main visual style consistent and grounded." : null;
}

function durationFrameDirection(seconds?: number): string {
  const value = seconds ?? 5;
  if (value <= 8) return "Short scene: make the frame direct, clear and iconic.";
  if (value >= 18) return "Longer scene: allow more narrative depth, spatial context and emotional layering in the frame.";
  return "Medium scene: balance narrative clarity with cinematic atmosphere.";
}

function describeCameraMovement(shot: CineShot): string | undefined {
  const type = shot.cameraMovementType ?? (shot.cameraMovement ? inferCameraMovementType(shot.cameraMovement) : "none");
  const label = CINE_CAMERA_MOVEMENT_LABELS[type];
  return [label, shot.cameraDescription, shot.cameraMovement].filter(Boolean).join(" · ") || undefined;
}

function cameraMovementFrameComposition(shot: CineShot): string | undefined {
  const description = describeCameraMovement(shot);
  if (!description) return undefined;
  const type = shot.cameraMovementType ?? (shot.cameraMovement ? inferCameraMovementType(shot.cameraMovement) : "none");
  const cues: Record<CineCameraMovementType, string> = {
    none: "Compose as a stable locked-off keyframe with no implied camera travel.",
    static_subtle: "Compose as a stable frame with subtle living-camera energy and gentle depth.",
    push_in: "Composition should suggest a slow push-in toward the emotional or narrative focal point.",
    pull_out: "Composition should suggest a slow pull-out that reveals more space around the subject.",
    pan: "Composition should imply a horizontal pan through strong lateral staging and readable direction.",
    tilt: "Composition should imply a vertical tilt, emphasizing height, reveal or scale.",
    tracking_forward: "Composition should suggest forward tracking through depth, leading lines and motivated movement.",
    tracking_backward: "Composition should suggest backward tracking, revealing context while keeping the subject readable.",
    tracking_side: "Composition should suggest lateral tracking with side-to-side motion and clear screen direction.",
    handheld: "Composition should imply controlled handheld instability, immediacy and tension without making the image messy.",
    drone: "Composition should suggest elevated or aerial movement with a clean sense of geography.",
  };
  return `${cues[type]} Camera movement intent: ${description}.`;
}

export function buildCineCameraPrompt(scene: CineScene): string {
  const type = scene.shot.cameraMovementType ?? (scene.shot.cameraMovement ? inferCameraMovementType(scene.shot.cameraMovement) : "none");
  const fallback: Record<CineCameraMovementType, string> = {
    none: "Locked-off static camera.",
    static_subtle: "Static camera with very subtle natural motion.",
    push_in: "Slow push-in camera movement toward the main subject.",
    pull_out: "Slow pull-out camera movement revealing the environment.",
    tracking_forward: "Smooth tracking forward movement following the characters.",
    tracking_backward: "Smooth tracking backward movement as the characters approach.",
    tracking_side: "Smooth lateral tracking shot.",
    pan: "Slow pan following the action.",
    tilt: "Slow tilt revealing vertical scale.",
    handheld: "Subtle handheld camera movement, natural and immersive.",
    drone: "Elevated aerial movement.",
  };
  return scene.shot.cameraDescription?.trim()
    ? `${fallback[type]} Specific direction: ${scene.shot.cameraDescription.trim()}.`
    : fallback[type];
}

function cameraMovementVideoInstruction(scene: CineScene): string {
  return `Camera movement: ${buildCineCameraPrompt(scene)}`;
}

function visualPriority(scene: CineScene): string {
  return scene.visualNotes || scene.visualSummary || scene.shot.action || firstSentence(scene.sourceText, scene.title);
}

function emotionalIntent(scene: CineScene): string {
  return [scene.voiceOver, scene.shot.mood, scene.sourceText]
    .filter(Boolean)
    .join(" ")
    .slice(0, 640);
}

export function buildCineFramePrompt(args: {
  data: CineNodeData;
  sceneId: string;
  frameRole: Frame["role"];
  cineNodeId: string;
  brainConnected?: boolean;
}): string {
  const scene = args.data.scenes.find((item) => item.id === args.sceneId);
  if (!scene) return "";
  const background = args.data.backgrounds.find((item) => item.id === scene.backgroundId);
  const characters = args.data.characters.filter((character) => scene.characters.includes(character.id));
  const roleLine = args.frameRole === "start" ? "opening keyframe" : args.frameRole === "end" ? "final keyframe" : "main keyframe";
  const frameIntent = args.frameRole === "end"
    ? "show the visual result of the scene action"
    : args.frameRole === "start"
      ? "establish the starting point of the scene action"
      : "condense the whole scene into one cinematic image";
  const visualDirection = visualPriority(scene);
  const emotionalContext = emotionalIntent(scene);
  const effectiveDirection = getEffectiveSceneVisualDirection(args.data, scene);
  const useBrandKit = Boolean(args.brainConnected && args.data.visualDirection.useBrain);
  return [
    `Create a cinematic ${roleLine} for a ${CINE_MODE_LABELS[effectiveDirection.mode]} production.`,
    "GLOBAL AUDIOVISUAL DIRECTION",
    buildCineVisualDirectionPrompt(effectiveDirection),
    scene.visualOverride ? "This scene has its own visual direction override. Use it over the global direction for this frame." : null,
    useBrandKit
      ? "BrandKit is connected: apply brand voice/visual world/palette as continuity context. Script and scene action win on conflicts."
      : null,
    "",
    `SCENE ${scene.order}: ${scene.title}`,
    line("Scene kind", scene.sceneKind),
    sceneKindTreatment(scene.sceneKind),
    line("Primary visual direction", visualDirection),
    line("Visual notes", scene.visualNotes),
    line("Visual summary", scene.visualSummary),
    line("Action", scene.shot.action),
    line("Narrative/emotional context from voice over", emotionalContext),
    scene.onScreenText?.length ? `On-screen text to preserve as external overlay only: ${scene.onScreenText.join(" / ")}` : null,
    line("Duration", `${scene.durationSeconds ?? scene.shot.durationSeconds ?? 5}s`),
    durationFrameDirection(scene.durationSeconds ?? scene.shot.durationSeconds),
    line("Frame role", roleLine),
    line("Frame intention", frameIntent),
    line("Shot type", scene.shot.shotType),
    line("Camera movement", describeCameraMovement(scene.shot)),
    cameraMovementFrameComposition(scene.shot),
    line("Lens suggestion", scene.shot.lensSuggestion),
    line("Scene lighting", scene.shot.lighting),
    line("Mood", scene.shot.mood),
    "",
    characters.length ? "CHARACTERS" : null,
    ...characters.flatMap((character) => [
      line(character.name, character.description),
      line("Visual prompt", character.visualPrompt),
      character.isLocked ? line("Locked continuity traits", character.lockedTraits) : null,
      line("Wardrobe", character.wardrobe),
    ]),
    background ? "" : null,
    background ? "LOCATION / BACKGROUND" : null,
    background ? line(background.name, background.description) : null,
    background ? line("Visual prompt", background.visualPrompt) : null,
    background?.isLocked ? line("Locked location elements", background.lockedElements) : null,
    background ? line("Textures", background.textures) : null,
    "",
    "CONTINUITY RULES",
    "Maintain consistent character identity, location, scale, lighting and tone across frames.",
    "Do not render any written text, subtitles, captions, logos or typography inside the image. On-screen text will be added later as a separate overlay.",
    "Do not visualize voice-over as written words. Use it only for emotion, intention, subtext, gesture and atmosphere.",
    "Make it feel like a clean cinematic production still, ready for image-to-video planning.",
  ].filter((item): item is string => Boolean(item)).join("\n");
}

export function buildCineFrameNegativePrompt(): string {
  return [
    "inconsistent character identity",
    "distorted faces",
    "extra fingers",
    "broken anatomy",
    "unreadable text",
    "inconsistent lighting",
    "wrong location",
    "low quality",
    "blurry",
    "watermark",
    "logo artifacts",
  ].join(", ");
}

function uniqueAssetIds(items: Array<string | undefined | null>): string[] {
  return Array.from(new Set(items.filter((item): item is string => typeof item === "string" && item.trim().length > 0)));
}

export function getEffectiveCineCharacterAsset(character?: CineCharacter): string | undefined {
  if (!character) return undefined;
  return character.approvedImageAssetId || character.editedImageAssetId || character.generatedImageAssetId || character.referenceImageAssetId;
}

export function getEffectiveCineCharacterS3Key(character?: CineCharacter): string | undefined {
  if (!character) return undefined;
  return character.approvedImageS3Key || character.editedImageS3Key || character.generatedImageS3Key || character.referenceImageS3Key;
}

export function getEffectiveCineBackgroundAsset(background?: CineBackground): string | undefined {
  if (!background) return undefined;
  return background.approvedImageAssetId || background.editedImageAssetId || background.generatedImageAssetId || background.referenceImageAssetId;
}

export function getEffectiveCineBackgroundS3Key(background?: CineBackground): string | undefined {
  if (!background) return undefined;
  return background.approvedImageS3Key || background.editedImageS3Key || background.generatedImageS3Key || background.referenceImageS3Key;
}

export function getEffectiveCineFrameAsset(frame?: CineFrame): string | undefined {
  if (!frame) return undefined;
  if (frame.status === "approved") return frame.approvedImageAssetId || frame.editedImageAssetId || frame.imageAssetId;
  return frame.editedImageAssetId || frame.imageAssetId || frame.approvedImageAssetId;
}

export function getEffectiveCineFrameS3Key(frame?: CineFrame): string | undefined {
  if (!frame) return undefined;
  if (frame.status === "approved") return frame.approvedImageS3Key || frame.editedImageS3Key || frame.imageS3Key;
  return frame.editedImageS3Key || frame.imageS3Key || frame.approvedImageS3Key;
}

export function getEffectiveCineVideoAsset(video?: CineVideoPlan): string | undefined {
  if (!video) return undefined;
  return video.approvedVideoAssetId || video.editedVideoAssetId || video.generatedVideoAssetId || video.videoAssetId || video.videoUrl;
}

export function getEffectiveCineVideoS3Key(video?: CineVideoPlan): string | undefined {
  if (!video) return undefined;
  return video.approvedVideoS3Key || video.editedVideoS3Key || video.generatedVideoS3Key || video.videoS3Key;
}

export function getEffectiveCharacterSheetAsset(data: CineNodeData): string | undefined {
  const sheet = data.continuity?.characterSheet;
  return sheet?.editedAssetId || sheet?.assetId;
}

export function getEffectiveCharacterSheetS3Key(data: CineNodeData): string | undefined {
  const sheet = data.continuity?.characterSheet;
  return sheet?.editedAssetS3Key || sheet?.assetS3Key;
}

export function getEffectiveLocationSheetAsset(data: CineNodeData): string | undefined {
  const sheet = data.continuity?.locationSheet;
  return sheet?.editedAssetId || sheet?.assetId;
}

export function getEffectiveLocationSheetS3Key(data: CineNodeData): string | undefined {
  const sheet = data.continuity?.locationSheet;
  return sheet?.editedAssetS3Key || sheet?.assetS3Key;
}

export function getCineFrameReferenceAssetIds(data: CineNodeData, sceneId: string): string[] {
  const scene = data.scenes.find((item) => item.id === sceneId);
  if (!scene) return [];
  const characters = scene.characters
    .map((characterId) => data.characters.find((character) => character.id === characterId))
    .map(getEffectiveCineCharacterAsset);
  const background = getEffectiveCineBackgroundAsset(data.backgrounds.find((item) => item.id === scene.backgroundId));
  return uniqueAssetIds([
    data.continuity?.useCharacterSheetForFrames ? getEffectiveCharacterSheetAsset(data) : undefined,
    data.continuity?.useLocationSheetForFrames ? getEffectiveLocationSheetAsset(data) : undefined,
    ...characters,
    background,
  ]);
}

export function getCineFrameReferenceS3Keys(data: CineNodeData, sceneId: string): string[] {
  const scene = data.scenes.find((item) => item.id === sceneId);
  if (!scene) return [];
  const characters = scene.characters
    .map((characterId) => data.characters.find((character) => character.id === characterId))
    .map(getEffectiveCineCharacterS3Key);
  const background = getEffectiveCineBackgroundS3Key(data.backgrounds.find((item) => item.id === scene.backgroundId));
  return uniqueAssetIds([
    data.continuity?.useCharacterSheetForFrames ? getEffectiveCharacterSheetS3Key(data) : undefined,
    data.continuity?.useLocationSheetForFrames ? getEffectiveLocationSheetS3Key(data) : undefined,
    ...characters,
    background,
  ]);
}

export function getCineVideoMissingFrames(data: CineNodeData, sceneId: string): Array<"single" | "start" | "end"> {
  const scene = data.scenes.find((item) => item.id === sceneId);
  if (!scene) return ["single"];
  if (scene.framesMode === "start_end") {
    return (["start", "end"] as const).filter((role) => !getEffectiveCineFrameAsset(scene.frames[role]));
  }
  return getEffectiveCineFrameAsset(scene.frames.single) ? [] : ["single"];
}

export function getCineVideoReferenceAssetIds(data: CineNodeData, sceneId: string): string[] {
  const scene = data.scenes.find((item) => item.id === sceneId);
  if (!scene) return [];
  const characters = scene.characters
    .map((characterId) => data.characters.find((character) => character.id === characterId))
    .map(getEffectiveCineCharacterAsset);
  const background = getEffectiveCineBackgroundAsset(data.backgrounds.find((item) => item.id === scene.backgroundId));
  const frameAssets = scene.framesMode === "start_end"
    ? [getEffectiveCineFrameAsset(scene.frames.start), getEffectiveCineFrameAsset(scene.frames.end)]
    : [getEffectiveCineFrameAsset(scene.frames.single)];
  return uniqueAssetIds([
    data.continuity?.useCharacterSheetForFrames ? getEffectiveCharacterSheetAsset(data) : undefined,
    data.continuity?.useLocationSheetForFrames ? getEffectiveLocationSheetAsset(data) : undefined,
    ...characters,
    background,
    ...frameAssets,
  ]);
}

export function getCineVideoReferenceS3Keys(data: CineNodeData, sceneId: string): string[] {
  const scene = data.scenes.find((item) => item.id === sceneId);
  if (!scene) return [];
  const characters = scene.characters
    .map((characterId) => data.characters.find((character) => character.id === characterId))
    .map(getEffectiveCineCharacterS3Key);
  const background = getEffectiveCineBackgroundS3Key(data.backgrounds.find((item) => item.id === scene.backgroundId));
  const frameKeys = scene.framesMode === "start_end"
    ? [getEffectiveCineFrameS3Key(scene.frames.start), getEffectiveCineFrameS3Key(scene.frames.end)]
    : [getEffectiveCineFrameS3Key(scene.frames.single)];
  return uniqueAssetIds([
    data.continuity?.useCharacterSheetForFrames ? getEffectiveCharacterSheetS3Key(data) : undefined,
    data.continuity?.useLocationSheetForFrames ? getEffectiveLocationSheetS3Key(data) : undefined,
    ...characters,
    background,
    ...frameKeys,
  ]);
}

export function buildCineCharacterPrompt(data: CineNodeData, characterId: string): string {
  const character = data.characters.find((item) => item.id === characterId);
  if (!character) return "";
  return [
    `Create a clean cinematic character reference image for ${character.name}.`,
    "GLOBAL AUDIOVISUAL DIRECTION",
    buildCineVisualDirectionPrompt(data.visualDirection),
    line("Character role", character.role),
    line("Character description", character.description),
    line("Visual prompt", character.visualPrompt),
    line("Wardrobe", character.wardrobe),
    character.isLocked ? line("Locked continuity traits", character.lockedTraits) : null,
    line("Emotional range", character.emotionalRange),
    "",
    "REFERENCE GOAL",
    "Generate a clean visual identity reference, not a full narrative scene.",
    "Use simple cinematic lighting and neutral readable staging so this character can be reused across storyboard frames.",
    "No typography, logos, subtitles, watermarks or UI.",
  ].filter((item): item is string => Boolean(item)).join("\n");
}

function characterSheetLayout(count: number): "single" | "three_columns" | "three_by_two" | "paginated" {
  if (count <= 1) return "single";
  if (count <= 3) return "three_columns";
  if (count <= 6) return "three_by_two";
  return "paginated";
}

export function getCineCharacterSheetLayout(data: CineNodeData): "single" | "three_columns" | "three_by_two" | "paginated" {
  return characterSheetLayout(data.characters.length);
}

export function buildCineCharacterSheetPrompt(data: CineNodeData): string {
  const layout = getCineCharacterSheetLayout(data);
  return [
    "Create a clean cinematic character continuity reference sheet.",
    "GLOBAL AUDIOVISUAL DIRECTION",
    buildCineVisualDirectionPrompt(data.visualDirection),
    line("Layout", layout),
    "Use a neutral background, consistent soft studio lighting, consistent scale and readable proportions.",
    "Do not create a dramatic scene or environment. This is a reference sheet for continuity.",
    "Do not render written names, labels, captions, logos, typography, watermarks or UI.",
    "",
    "MANDATORY CONTACT-SHEET LAYOUT RULES",
    "Use a strict technical contact-sheet grid, not a collage, poster, montage or cinematic scene.",
    "Every view must stay fully contained inside its own clean rectangular cell with visible neutral gutters.",
    "No face, body, clothing, limb, shadow or background element may cross, overlap, bleed into or blend with another cell.",
    "Keep cell boundaries visually clear through spacing and negative space; do not use decorative frames or text labels.",
    "Do not place a large hero image, environment, texture or background behind the grid.",
    "For each character, group front portrait, side profile portrait and full body view together with compact internal spacing.",
    "Use slightly wider vertical gutters between different characters than between the views of the same character.",
    "",
    "CHARACTER REQUIREMENTS",
    "For each character, show front face portrait, side profile portrait, and full body view with base wardrobe.",
    "Use character names only as metadata for this prompt, never as visible text inside the image.",
    ...data.characters.flatMap((character, index) => [
      "",
      `Character ${index + 1}: ${character.name}`,
      line("Role", character.role),
      line("Description", character.description),
      line("Visual prompt", character.visualPrompt),
      line("Wardrobe", character.wardrobe),
      line("Locked traits to preserve exactly", character.lockedTraits),
    ]),
  ].filter((item): item is string => Boolean(item)).join("\n");
}

export function buildCineCharacterSheetNegativePrompt(): string {
  return [
    "cinematic action scene",
    "complex background",
    "text artifacts",
    "captions",
    "labels",
    "logos",
    "distorted faces",
    "inconsistent identity",
    "extra limbs",
    "collage",
    "poster composition",
    "montage",
    "overlapping panels",
    "merged panels",
    "images crossing cell boundaries",
    "bleeding between cells",
    "shared background across cells",
    "large hero background",
    "floating panels",
    "cropped heads",
    "cropped bodies",
    "characters touching other character columns",
    "blurry",
    "watermark",
  ].join(", ");
}

export function buildCineBackgroundPrompt(data: CineNodeData, backgroundId: string): string {
  const background = data.backgrounds.find((item) => item.id === backgroundId);
  if (!background) return "";
  return [
    `Create a clean cinematic location reference image for: ${background.name}.`,
    "GLOBAL AUDIOVISUAL DIRECTION",
    buildCineVisualDirectionPrompt(data.visualDirection),
    line("Location type", background.type),
    line("Description", background.description),
    line("Visual prompt", background.visualPrompt),
    line("Lighting", background.lighting),
    line("Textures", background.textures),
    background.isLocked ? line("Locked location elements", background.lockedElements) : null,
    "",
    "REFERENCE GOAL",
    "Generate a reusable location/background reference without characters unless explicitly requested in the location description.",
    "Keep space, scale, light direction and materials clear for continuity.",
    "No typography, logos, subtitles, watermarks or UI.",
  ].filter((item): item is string => Boolean(item)).join("\n");
}

export function buildCineLocationSheetPrompt(data: CineNodeData): string {
  const layout = data.backgrounds.length <= 1 ? "single" : "grid";
  return [
    "Create a clean cinematic environment/location continuity reference sheet.",
    "GLOBAL AUDIOVISUAL DIRECTION",
    buildCineVisualDirectionPrompt(data.visualDirection),
    line("Layout", layout),
    "Use one clear panel per location, separated visually through composition, not typography.",
    "Keep a consistent visual style, neutral presentation and readable spatial layout.",
    "No characters unless explicitly required by a location description.",
    "Do not render written names, labels, captions, logos, typography, watermarks or UI.",
    "",
    "MANDATORY GRID LAYOUT RULES",
    "Use a strict technical contact-sheet grid, not a collage, poster, montage or single cinematic scene.",
    "The canvas must be divided into equal clean rectangular cells, one location per cell.",
    "Each location image must be fully fitted inside its cell; architecture, landscape, shadows, fog and textures must not cross cell boundaries.",
    "Leave visible neutral gutters between every cell so each location is clearly separated.",
    "Do not place a large hero image, environment, texture or background behind the grid.",
    "Do not blend, overlay, double expose, fade, stack or merge locations together.",
    "If there are many locations, reduce scale inside each cell rather than letting any image overflow.",
    "",
    "LOCATIONS",
    ...data.backgrounds.flatMap((background, index) => [
      "",
      `Location ${index + 1}: ${background.name}`,
      line("Type", background.type),
      line("Description", background.description),
      line("Visual prompt", background.visualPrompt),
      line("Lighting", background.lighting),
      line("Palette", background.palette),
      line("Textures", background.textures),
      line("Locked elements", background.lockedElements),
    ]),
  ].filter((item): item is string => Boolean(item)).join("\n");
}

export function buildCineLocationSheetNegativePrompt(): string {
  return [
    "characters",
    "people",
    "crowded scene",
    "text artifacts",
    "captions",
    "labels",
    "logos",
    "inconsistent location style",
    "distorted architecture",
    "collage",
    "poster composition",
    "montage",
    "overlapping panels",
    "merged panels",
    "images crossing cell boundaries",
    "bleeding between cells",
    "shared background across cells",
    "large hero background",
    "floating panels",
    "double exposure",
    "stacked locations",
    "locations fading into each other",
    "overflowing architecture",
    "blurry",
    "watermark",
  ].join(", ");
}

export function createCineFrameDraft(args: {
  data: CineNodeData;
  sceneId: string;
  frameRole: CineFrame["role"];
  cineNodeId: string;
  brainConnected?: boolean;
}): CineFrame {
  const scene = args.data.scenes.find((item) => item.id === args.sceneId);
  const prompt = buildCineFramePrompt(args);
  return {
    id: makeCineId("cine_frame"),
    role: args.frameRole,
    prompt,
    negativePrompt: buildCineFrameNegativePrompt(),
    status: "draft",
    metadata: {
      generatedFrom: "cine-node",
      cineAssetKind: "scene-frame",
      cineNodeId: args.cineNodeId,
      sceneId: args.sceneId,
      frameRole: args.frameRole,
      prompt,
      negativePrompt: buildCineFrameNegativePrompt(),
      charactersUsed: scene?.characters ?? [],
      backgroundUsed: scene?.backgroundId,
      brainNodeId: args.brainConnected && args.data.visualDirection.useBrain ? args.data.metadata?.brainNodeId : undefined,
      visualCapsuleIds: args.data.visualDirection.visualCapsuleIds,
      sourceScriptNodeId: args.data.metadata?.sourceScriptNodeId,
      referenceAssetIds: scene ? getCineFrameReferenceAssetIds(args.data, scene.id) : [],
      referenceAssetS3Keys: scene ? getCineFrameReferenceS3Keys(args.data, scene.id) : [],
      characterSheetAssetId: args.data.continuity?.useCharacterSheetForFrames ? getEffectiveCharacterSheetAsset(args.data) : undefined,
      characterSheetS3Key: args.data.continuity?.useCharacterSheetForFrames ? getEffectiveCharacterSheetS3Key(args.data) : undefined,
      locationSheetAssetId: args.data.continuity?.useLocationSheetForFrames ? getEffectiveLocationSheetAsset(args.data) : undefined,
      locationSheetS3Key: args.data.continuity?.useLocationSheetForFrames ? getEffectiveLocationSheetS3Key(args.data) : undefined,
      createdAt: new Date().toISOString(),
    },
  };
}

export function approveCineFrame(data: CineNodeData, sceneId: string, frameRole: CineFrame["role"]): CineNodeData {
  return {
    ...data,
    scenes: data.scenes.map((scene) => {
      if (scene.id !== sceneId) return scene;
      const frame = scene.frames[frameRole];
      const approvedImageAssetId = frame?.editedImageAssetId || frame?.imageAssetId || frame?.approvedImageAssetId;
      const approvedImageS3Key = frame?.editedImageS3Key || frame?.imageS3Key || frame?.approvedImageS3Key;
      if (!frame || !approvedImageAssetId) return scene;
      return {
        ...scene,
        frames: {
          ...scene.frames,
          [frameRole]: {
            ...frame,
            approvedImageAssetId,
            approvedImageS3Key,
            status: "approved",
          },
        },
        status: "approved",
      };
    }),
  };
}

export function applyCineImageStudioResult(
  data: CineNodeData,
  session: CineImageStudioSession,
  result: CineImageStudioResult,
): CineNodeData {
  const assetId = result.assetId;
  if (!assetId) return data;
  if (session.kind === "character" && session.characterId) {
    return {
      ...data,
      characters: data.characters.map((character) =>
        character.id === session.characterId
          ? {
              ...character,
              generatedImageAssetId: result.mode === "generate" ? assetId : character.generatedImageAssetId,
              generatedImageS3Key: result.mode === "generate" ? result.s3Key : character.generatedImageS3Key,
              editedImageAssetId: result.mode === "edit" ? assetId : character.editedImageAssetId,
              editedImageS3Key: result.mode === "edit" ? result.s3Key : character.editedImageS3Key,
            }
          : character,
      ),
    };
  }
  if (session.kind === "background" && session.backgroundId) {
    return {
      ...data,
      backgrounds: data.backgrounds.map((background) =>
        background.id === session.backgroundId
          ? {
              ...background,
              generatedImageAssetId: result.mode === "generate" ? assetId : background.generatedImageAssetId,
              generatedImageS3Key: result.mode === "generate" ? result.s3Key : background.generatedImageS3Key,
              editedImageAssetId: result.mode === "edit" ? assetId : background.editedImageAssetId,
              editedImageS3Key: result.mode === "edit" ? result.s3Key : background.editedImageS3Key,
            }
          : background,
      ),
    };
  }
  if (session.kind === "frame" && session.sceneId && session.frameRole) {
    const frameRole = session.frameRole;
    return {
      ...data,
      scenes: data.scenes.map((scene) => {
        if (scene.id !== session.sceneId) return scene;
        const existing = scene.frames[frameRole] ?? {
          id: makeCineId("cine_frame"),
          role: frameRole,
          prompt: session.prompt,
          negativePrompt: session.negativePrompt,
          status: "draft" as const,
        };
        return {
          ...scene,
          frames: {
            ...scene.frames,
            [frameRole]: {
              ...existing,
              prompt: session.prompt || existing.prompt,
              negativePrompt: session.negativePrompt || existing.negativePrompt,
              imageAssetId: result.mode === "generate" ? assetId : existing.imageAssetId,
              imageS3Key: result.mode === "generate" ? result.s3Key : existing.imageS3Key,
              editedImageAssetId: result.mode === "edit" ? assetId : existing.editedImageAssetId,
              editedImageS3Key: result.mode === "edit" ? result.s3Key : existing.editedImageS3Key,
              approvedImageAssetId: existing.approvedImageAssetId,
              approvedImageS3Key: existing.approvedImageS3Key,
              status: result.mode === "edit" ? "edited" : "generated",
              generatedFromStudio: true,
              metadata: {
                ...existing.metadata,
                generatedFrom: "cine-node",
                cineAssetKind: "scene-frame",
                cineNodeId: session.cineNodeId,
                sceneId: session.sceneId,
                frameRole,
                prompt: session.prompt || existing.prompt,
                negativePrompt: session.negativePrompt || existing.negativePrompt,
                charactersUsed: session.metadata?.charactersUsed ?? existing.metadata?.charactersUsed ?? scene.characters,
                backgroundUsed: session.metadata?.backgroundUsed ?? existing.metadata?.backgroundUsed ?? scene.backgroundId,
                brainNodeId: session.metadata?.brainNodeId ?? existing.metadata?.brainNodeId,
                visualCapsuleIds: session.metadata?.visualCapsuleIds ?? existing.metadata?.visualCapsuleIds,
                sourceScriptNodeId: session.metadata?.sourceScriptNodeId ?? existing.metadata?.sourceScriptNodeId,
                referenceAssetIds: session.metadata?.referenceAssetIds ?? existing.metadata?.referenceAssetIds,
                referenceAssetS3Keys: session.metadata?.referenceAssetS3Keys ?? existing.metadata?.referenceAssetS3Keys,
                characterSheetAssetId: session.metadata?.characterSheetAssetId ?? existing.metadata?.characterSheetAssetId,
                characterSheetS3Key: session.metadata?.characterSheetS3Key ?? existing.metadata?.characterSheetS3Key,
                locationSheetAssetId: session.metadata?.locationSheetAssetId ?? existing.metadata?.locationSheetAssetId,
                locationSheetS3Key: session.metadata?.locationSheetS3Key ?? existing.metadata?.locationSheetS3Key,
                createdAt: existing.metadata?.createdAt || session.metadata?.createdAt || new Date().toISOString(),
              },
            },
          },
          status: scene.framesMode === "start_end" ? "frames_generated" : "frame_generated",
        };
      }),
    };
  }
  if (session.kind === "character_sheet") {
    const now = new Date().toISOString();
    const previous = data.continuity?.characterSheet;
    return {
      ...data,
      continuity: {
        ...data.continuity,
        characterSheet: {
          id: previous?.id || makeCineId("cine_character_sheet"),
          cineNodeId: session.cineNodeId,
          characterIds: previous?.characterIds ?? data.characters.map((item) => item.id),
          assetId: result.mode === "generate" ? assetId : previous?.assetId,
          assetS3Key: result.mode === "generate" ? result.s3Key : previous?.assetS3Key,
          status: result.mode === "edit" ? "edited" : "ready",
          layout: previous?.layout || getCineCharacterSheetLayout(data),
          prompt: session.prompt || previous?.prompt || "",
          negativePrompt: session.negativePrompt || previous?.negativePrompt,
          editedAssetId: result.mode === "edit" ? assetId : previous?.editedAssetId,
          editedAssetS3Key: result.mode === "edit" ? result.s3Key : previous?.editedAssetS3Key,
          createdAt: previous?.createdAt || now,
          updatedAt: now,
        },
      },
    };
  }
  if (session.kind === "location_sheet") {
    const now = new Date().toISOString();
    const previous = data.continuity?.locationSheet;
    return {
      ...data,
      continuity: {
        ...data.continuity,
        locationSheet: {
          id: previous?.id || makeCineId("cine_location_sheet"),
          cineNodeId: session.cineNodeId,
          backgroundIds: previous?.backgroundIds ?? data.backgrounds.map((item) => item.id),
          assetId: result.mode === "generate" ? assetId : previous?.assetId,
          assetS3Key: result.mode === "generate" ? result.s3Key : previous?.assetS3Key,
          status: result.mode === "edit" ? "edited" : "ready",
          layout: previous?.layout || (data.backgrounds.length <= 1 ? "single" : "grid"),
          prompt: session.prompt || previous?.prompt || "",
          negativePrompt: session.negativePrompt || previous?.negativePrompt,
          editedAssetId: result.mode === "edit" ? assetId : previous?.editedAssetId,
          editedAssetS3Key: result.mode === "edit" ? result.s3Key : previous?.editedAssetS3Key,
          createdAt: previous?.createdAt || now,
          updatedAt: now,
        },
      },
    };
  }
  return data;
}

export function buildVideoPromptForScene(data: CineNodeData, sceneId: string): string {
  const scene = data.scenes.find((item) => item.id === sceneId);
  if (!scene) return "";
  const visualAction = visualPriority(scene);
  const intent = emotionalIntent(scene);
  const characters = data.characters.filter((character) => scene.characters.includes(character.id));
  const background = data.backgrounds.find((item) => item.id === scene.backgroundId);
  const effectiveDirection = getEffectiveSceneVisualDirection(data, scene);
  const sceneKindLine = scene.sceneKind === "flashback"
    ? "Use a subtle memory/flashback treatment without heavy blur, dream fog or exaggerated glow."
    : scene.sceneKind === "memory"
      ? "Use a reflective, intimate memory feeling with soft motivated light."
      : "Keep the scene grounded in the main present-time visual style.";
  return [
    `Create a cinematic video shot from the approved storyboard frame for scene ${scene.order}: ${scene.title}.`,
    "GLOBAL AUDIOVISUAL DIRECTION",
    buildCineVisualDirectionPrompt(effectiveDirection),
    scene.visualOverride ? "This scene has its own visual direction override. Use it over the global direction for this video shot." : null,
    line("Duration", `${scene.durationSeconds ?? scene.shot.durationSeconds ?? 5} seconds`),
    line("Visual action", visualAction),
    line("Concrete action", scene.shot.action),
    line("Emotional intent", intent),
    line("Mood", scene.shot.mood),
    line("Scene kind", scene.sceneKind),
    sceneKindLine,
    cameraMovementVideoInstruction(scene),
    line("Pacing", data.visualDirection.pacing),
    characters.length ? `Characters on screen: ${characters.map((character) => character.name).join(", ")}.` : null,
    background ? `Location continuity: ${background.name}. ${background.description || background.visualPrompt || ""}`.trim() : null,
    scene.voiceOver ? `Voice-over context, for emotional timing only: ${scene.voiceOver}` : null,
    scene.onScreenText?.length ? `On-screen text exists as external overlay only: ${scene.onScreenText.join(" / ")}` : null,
    "Maintain character identity, location continuity, lighting direction, scale and visual tone from the storyboard frame and continuity references.",
    "Do not render any written text, subtitles, captions, logos or typography inside the video. On-screen text will be added later as a separate overlay.",
    "Do not generate audio, voiceover or music in this step.",
  ].filter((item): item is string => Boolean(item)).join("\n");
}

export function prepareSceneForVideo(data: CineNodeData, sceneId: string, cineNodeId = "cine-node"): CineVideoPlan {
  const scene = data.scenes.find((item) => item.id === sceneId);
  if (!scene) {
    return {
      sceneId,
      mode: "image_to_video",
      status: "error",
      durationSeconds: 5,
      aspectRatio: data.visualDirection.aspectRatio,
      prompt: "",
      characters: [],
      referenceAssetIds: [],
      missingFrames: ["single"],
      warnings: ["Scene not found."],
    };
  }
  const mode = scene.framesMode === "start_end" ? "start_end_frames" : "image_to_video";
  const missingFrames = getCineVideoMissingFrames(data, sceneId);
  const singleFrameAssetId = getEffectiveCineFrameAsset(scene.frames.single);
  const startFrameAssetId = getEffectiveCineFrameAsset(scene.frames.start);
  const endFrameAssetId = getEffectiveCineFrameAsset(scene.frames.end);
  const singleFrameS3Key = getEffectiveCineFrameS3Key(scene.frames.single);
  const startFrameS3Key = getEffectiveCineFrameS3Key(scene.frames.start);
  const endFrameS3Key = getEffectiveCineFrameS3Key(scene.frames.end);
  const characterAssetIds = uniqueAssetIds(scene.characters.map((characterId) => getEffectiveCineCharacterAsset(data.characters.find((character) => character.id === characterId))));
  const characterS3Keys = uniqueAssetIds(scene.characters.map((characterId) => getEffectiveCineCharacterS3Key(data.characters.find((character) => character.id === characterId))));
  const backgroundAssetId = getEffectiveCineBackgroundAsset(data.backgrounds.find((item) => item.id === scene.backgroundId));
  const backgroundS3Key = getEffectiveCineBackgroundS3Key(data.backgrounds.find((item) => item.id === scene.backgroundId));
  const effectiveDirection = getEffectiveSceneVisualDirection(data, scene);
  const frameAssetIds = uniqueAssetIds(mode === "start_end_frames" ? [startFrameAssetId, endFrameAssetId] : [singleFrameAssetId]);
  const frameS3Keys = uniqueAssetIds(mode === "start_end_frames" ? [startFrameS3Key, endFrameS3Key] : [singleFrameS3Key]);
  const now = new Date().toISOString();
  const previousVideo = scene.video;
  const status: CineVideoPlan["status"] = missingFrames.length
    ? "missing_frames"
    : previousVideo?.status === "generated" && (previousVideo.videoAssetId || previousVideo.videoUrl)
      ? "generated"
      : "prepared";
  return {
    sceneId,
    mode,
    status,
    prompt: buildVideoPromptForScene(data, sceneId),
    negativePrompt: "text, subtitles, captions, logos, typography, watermark, distorted identity, inconsistent character, inconsistent location, flicker, low quality, blurry motion, broken anatomy",
    visualAction: visualPriority(scene),
    emotionalIntent: emotionalIntent(scene),
    voiceOver: scene.voiceOver,
    visualNotes: scene.visualNotes,
    sceneKind: scene.sceneKind,
    cameraMovementType: scene.shot.cameraMovementType,
    cameraDescription: scene.shot.cameraDescription || scene.shot.cameraMovement,
    cameraPrompt: buildCineCameraPrompt(scene),
    overlayTextPlan: {
      texts: scene.onScreenText ?? [],
      timingHint: "separate overlay after video generation",
      shouldRenderInVideo: false,
    },
    voiceoverPlan: {
      text: scene.voiceOver,
      timingHint: "voiceover track to be added after video generation",
    },
    characters: scene.characters,
    backgroundId: scene.backgroundId,
    referenceAssetIds: getCineVideoReferenceAssetIds(data, sceneId),
    referenceAssetS3Keys: getCineVideoReferenceS3Keys(data, sceneId),
    videoAssetId: previousVideo?.videoAssetId,
    videoS3Key: previousVideo?.videoS3Key,
    videoUrl: previousVideo?.videoUrl,
    generatedVideoAssetId: previousVideo?.generatedVideoAssetId,
    generatedVideoS3Key: previousVideo?.generatedVideoS3Key,
    editedVideoAssetId: previousVideo?.editedVideoAssetId,
    editedVideoS3Key: previousVideo?.editedVideoS3Key,
    approvedVideoAssetId: previousVideo?.approvedVideoAssetId,
    approvedVideoS3Key: previousVideo?.approvedVideoS3Key,
    videoProvider: previousVideo?.videoProvider,
    generatedAt: previousVideo?.generatedAt,
    errorMessage: previousVideo?.status === "error" ? previousVideo.errorMessage : undefined,
    missingFrames,
    warnings: [
      ...missingFrames.map((role) => `Missing ${role} frame asset.`),
      ...(frameAssetIds.length && scene.framesMode === "single" && scene.frames.single?.status !== "approved" ? ["Using an effective frame that has not been explicitly approved."] : []),
    ],
    startFramePrompt: scene.frames.start?.prompt || scene.frames.single?.prompt,
    endFramePrompt: scene.frames.end?.prompt,
    durationSeconds: scene.durationSeconds ?? scene.shot.durationSeconds ?? 5,
    aspectRatio: effectiveDirection.aspectRatio,
    singleFrameAssetId,
    singleFrameS3Key,
    startFrameAssetId,
    startFrameS3Key,
    endFrameAssetId,
    endFrameS3Key,
    cameraMovement: describeCameraMovement(scene.shot),
    action: scene.shot.action,
    mood: scene.shot.mood,
    metadata: {
      generatedFrom: "cine-node",
      cineNodeId,
      sourceScriptNodeId: data.metadata?.sourceScriptNodeId,
      characterSheetAssetId: data.continuity?.useCharacterSheetForFrames ? getEffectiveCharacterSheetAsset(data) : undefined,
      characterSheetS3Key: data.continuity?.useCharacterSheetForFrames ? getEffectiveCharacterSheetS3Key(data) : undefined,
      locationSheetAssetId: data.continuity?.useLocationSheetForFrames ? getEffectiveLocationSheetAsset(data) : undefined,
      locationSheetS3Key: data.continuity?.useLocationSheetForFrames ? getEffectiveLocationSheetS3Key(data) : undefined,
      characterAssetIds,
      characterS3Keys,
      backgroundAssetId,
      backgroundS3Key,
      frameAssetIds,
      frameS3Keys,
      createdAt: scene.video?.metadata?.createdAt || now,
      updatedAt: now,
    },
  };
}

function mediaListConfig(data: CineNodeData): Required<NonNullable<CineNodeData["mediaListOutputConfig"]>> {
  return {
    includeCharacters: data.mediaListOutputConfig?.includeCharacters ?? false,
    includeBackgrounds: data.mediaListOutputConfig?.includeBackgrounds ?? false,
    includeSheets: data.mediaListOutputConfig?.includeSheets ?? true,
    includeFrames: data.mediaListOutputConfig?.includeFrames ?? true,
    includeVideos: data.mediaListOutputConfig?.includeVideos ?? true,
    includeOnlyApprovedVideos: data.mediaListOutputConfig?.includeOnlyApprovedVideos ?? false,
    includePlaceholders: data.mediaListOutputConfig?.includePlaceholders ?? true,
  };
}

function mediaListVisualDirection(data: CineNodeData) {
  return {
    mode: data.visualDirection.mode,
    aspectRatio: data.visualDirection.aspectRatio,
    visualStyle: data.visualDirection.visualStyle,
    colorGrading: data.visualDirection.colorGrading,
    lightingStyle: data.visualDirection.lightingStyle,
  };
}

function frameMediaStatus(frame?: CineFrame): MediaListItem["status"] {
  if (!frame) return "missing";
  if (frame.status === "approved" || frame.approvedImageAssetId) return "approved";
  if (frame.status === "edited" || frame.editedImageAssetId) return "edited";
  if (frame.status === "error") return "error";
  if (frame.imageAssetId) return "generated";
  return "pending";
}

function videoMediaStatus(video?: CineVideoPlan): MediaListItem["status"] {
  if (!video) return "missing";
  if (video.approvedVideoAssetId) return "approved";
  if (video.editedVideoAssetId) return "edited";
  if (getEffectiveCineVideoAsset(video)) return "generated";
  if (video.status === "error") return "error";
  return "pending";
}

function addGroup(groups: MediaListGroup[], role: MediaListGroup["role"], title: string, itemIds: string[]) {
  if (!itemIds.length) return;
  groups.push({ id: `group_${role}`, title, role, itemIds });
}

export function buildCineMediaListOutput(data: CineNodeData, sourceNodeId = data.metadata?.sourceScriptNodeId || "cine-node"): MediaListOutput {
  const config = mediaListConfig(data);
  const generatedAt = new Date().toISOString();
  const items: MediaListItem[] = [];
  const groups: MediaListGroup[] = [];
  const sheetIds: string[] = [];
  const characterIds: string[] = [];
  const backgroundIds: string[] = [];
  const storyboardIds: string[] = [];
  const videoIds: string[] = [];
  const approvedVideoIds: string[] = [];
  const script = (data.manualScript || data.sourceScript?.text || "").trim();
  const visualDirection = mediaListVisualDirection(data);
  let order = 1;
  const nextOrder = () => order++;

  const pushItem = (item: Omit<MediaListItem, "order"> & { order?: number }) => {
    items.push({ ...item, order: item.order ?? nextOrder() });
    return item.id;
  };

  const characterSheet = data.continuity?.characterSheet;
  if (!config.includeOnlyApprovedVideos && config.includeSheets && characterSheet) {
    const assetId = getEffectiveCharacterSheetAsset(data);
    const id = pushItem({
      id: "cine_character_sheet",
      title: "Hoja de continuidad de personajes",
      description: `${data.characters.length} personajes incluidos`,
      mediaType: assetId ? "image" : "placeholder",
      role: "character_sheet",
      assetId,
      url: assetId,
      s3Key: getEffectiveCharacterSheetS3Key(data),
      mimeType: assetId ? "image/png" : undefined,
      status: characterSheet.status === "edited" ? "edited" : assetId ? "generated" : characterSheet.status === "error" ? "error" : "pending",
      metadata: {
        generatedFrom: "cine-node",
        cineNodeId: sourceNodeId,
        sourceScriptNodeId: data.metadata?.sourceScriptNodeId,
        prompt: characterSheet.prompt,
        negativePrompt: characterSheet.negativePrompt,
        visualDirection,
        characterIds: characterSheet.characterIds,
        createdAt: characterSheet.createdAt,
        updatedAt: characterSheet.updatedAt,
      },
    });
    sheetIds.push(id);
  }

  const locationSheet = data.continuity?.locationSheet;
  if (!config.includeOnlyApprovedVideos && config.includeSheets && locationSheet) {
    const assetId = getEffectiveLocationSheetAsset(data);
    const id = pushItem({
      id: "cine_location_sheet",
      title: "Hoja de continuidad de localizaciones",
      description: `${data.backgrounds.length} fondos incluidos`,
      mediaType: assetId ? "image" : "placeholder",
      role: "location_sheet",
      assetId,
      url: assetId,
      s3Key: getEffectiveLocationSheetS3Key(data),
      mimeType: assetId ? "image/png" : undefined,
      status: locationSheet.status === "edited" ? "edited" : assetId ? "generated" : locationSheet.status === "error" ? "error" : "pending",
      metadata: {
        generatedFrom: "cine-node",
        cineNodeId: sourceNodeId,
        sourceScriptNodeId: data.metadata?.sourceScriptNodeId,
        prompt: locationSheet.prompt,
        negativePrompt: locationSheet.negativePrompt,
        visualDirection,
        backgroundId: locationSheet.backgroundIds.join(","),
        createdAt: locationSheet.createdAt,
        updatedAt: locationSheet.updatedAt,
      },
    });
    sheetIds.push(id);
  }

  if (!config.includeOnlyApprovedVideos && config.includeCharacters) {
    data.characters.forEach((character) => {
      const assetId = getEffectiveCineCharacterAsset(character);
      if (!assetId) return;
      const id = pushItem({
        id: `cine_character_${character.id}`,
        title: character.name || "Personaje",
        description: character.description || character.visualPrompt,
        mediaType: "image",
        role: "character",
        assetId,
        url: assetId,
        s3Key: getEffectiveCineCharacterS3Key(character),
        mimeType: "image/png",
        characterId: character.id,
        status: character.approvedImageAssetId ? "approved" : character.editedImageAssetId ? "edited" : "generated",
        metadata: {
          generatedFrom: "cine-node",
          cineNodeId: sourceNodeId,
          sourceScriptNodeId: data.metadata?.sourceScriptNodeId,
          prompt: character.visualPrompt,
          negativePrompt: character.negativePrompt,
          visualDirection,
        },
      });
      characterIds.push(id);
    });
  }

  if (!config.includeOnlyApprovedVideos && config.includeBackgrounds) {
    data.backgrounds.forEach((background) => {
      const assetId = getEffectiveCineBackgroundAsset(background);
      if (!assetId) return;
      const id = pushItem({
        id: `cine_background_${background.id}`,
        title: background.name || "Fondo",
        description: background.description || background.visualPrompt,
        mediaType: "image",
        role: "background",
        assetId,
        url: assetId,
        s3Key: getEffectiveCineBackgroundS3Key(background),
        mimeType: "image/png",
        backgroundId: background.id,
        status: background.approvedImageAssetId ? "approved" : background.editedImageAssetId ? "edited" : "generated",
        metadata: {
          generatedFrom: "cine-node",
          cineNodeId: sourceNodeId,
          sourceScriptNodeId: data.metadata?.sourceScriptNodeId,
          prompt: background.visualPrompt,
          negativePrompt: background.negativePrompt,
          visualDirection,
          backgroundId: background.id,
        },
      });
      backgroundIds.push(id);
    });
  }

  const sceneFrameItemIds = new Map<string, string[]>();
  if (!config.includeOnlyApprovedVideos && config.includeFrames) {
    data.scenes.forEach((scene) => {
      const roles = scene.framesMode === "start_end" ? (["start", "end"] as const) : (["single"] as const);
      const sceneItemIds: string[] = [];
      roles.forEach((role) => {
        const frame = scene.frames[role];
        const assetId = getEffectiveCineFrameAsset(frame);
        if (!assetId) return;
        const id = pushItem({
          id: `cine_frame_${scene.id}_${role}`,
          order: scene.order * 10 + (role === "end" ? 2 : role === "start" ? 1 : 0),
          title: `${scene.title} · ${role === "single" ? "Frame" : role === "start" ? "Inicio" : "Final"}`,
          description: scene.visualSummary || scene.visualNotes,
          mediaType: "image",
          role: "storyboard_frame",
          assetId,
          url: assetId,
          s3Key: getEffectiveCineFrameS3Key(frame),
          mimeType: "image/png",
          durationSeconds: scene.durationSeconds ?? scene.shot.durationSeconds,
          aspectRatio: getEffectiveSceneVisualDirection(data, scene).aspectRatio,
          sceneId: scene.id,
          sceneOrder: scene.order,
          sceneTitle: scene.title,
          frameRole: role,
          status: frameMediaStatus(frame),
          metadata: {
            generatedFrom: "cine-node",
            cineNodeId: sourceNodeId,
            sourceScriptNodeId: data.metadata?.sourceScriptNodeId,
            prompt: frame?.prompt,
            negativePrompt: frame?.negativePrompt,
            visualNotes: scene.visualNotes,
            voiceOver: scene.voiceOver,
            onScreenText: scene.onScreenText,
            cameraMovementType: scene.shot.cameraMovementType,
            cameraDescription: scene.shot.cameraDescription || scene.shot.cameraMovement,
            visualDirection: mediaListVisualDirection({ ...data, visualDirection: getEffectiveSceneVisualDirection(data, scene) }),
            characterIds: scene.characters,
            backgroundId: scene.backgroundId,
            referenceAssetIds: frame?.metadata?.referenceAssetIds,
            createdAt: frame?.metadata?.createdAt,
          },
        });
        sceneItemIds.push(id);
        storyboardIds.push(id);
      });
      sceneFrameItemIds.set(scene.id, sceneItemIds);
    });
  }

  if (config.includeVideos) {
    data.scenes.forEach((scene) => {
      const video = scene.video;
      const assetId = getEffectiveCineVideoAsset(video);
      const onlyApproved = config.includeOnlyApprovedVideos;
      if (assetId && (!onlyApproved || video?.approvedVideoAssetId)) {
        const approved = Boolean(video?.approvedVideoAssetId);
        const id = pushItem({
          id: `cine_video_${scene.id}`,
          order: scene.order * 10,
          title: scene.title,
          description: video?.visualAction || scene.visualSummary || scene.visualNotes,
          mediaType: "video",
          role: approved ? "approved_scene_video" : "scene_video",
          assetId,
          url: assetId,
          s3Key: getEffectiveCineVideoS3Key(video),
          mimeType: "video/mp4",
          durationSeconds: video?.durationSeconds ?? scene.durationSeconds ?? scene.shot.durationSeconds,
          aspectRatio: video?.aspectRatio ?? getEffectiveSceneVisualDirection(data, scene).aspectRatio,
          sceneId: scene.id,
          sceneOrder: scene.order,
          sceneTitle: scene.title,
          status: videoMediaStatus(video),
          metadata: {
            generatedFrom: "cine-node",
            cineNodeId: sourceNodeId,
            sourceScriptNodeId: data.metadata?.sourceScriptNodeId,
            prompt: video?.prompt,
            negativePrompt: video?.negativePrompt,
            visualNotes: video?.visualNotes ?? scene.visualNotes,
            voiceOver: video?.voiceOver ?? scene.voiceOver,
            onScreenText: scene.onScreenText,
            cameraMovementType: video?.cameraMovementType,
            cameraDescription: video?.cameraDescription,
            cameraPrompt: video?.cameraPrompt,
            visualDirection: mediaListVisualDirection({ ...data, visualDirection: getEffectiveSceneVisualDirection(data, scene) }),
            characterIds: scene.characters,
            backgroundId: scene.backgroundId,
            referenceAssetIds: video?.referenceAssetIds,
            overlayTextPlan: video?.overlayTextPlan,
            voiceoverPlan: video?.voiceoverPlan,
            createdAt: video?.metadata?.createdAt,
            updatedAt: video?.metadata?.updatedAt ?? video?.generatedAt,
          },
        });
        videoIds.push(id);
        if (approved) approvedVideoIds.push(id);
      } else if (!onlyApproved && config.includePlaceholders && video?.status === "prepared") {
        const id = pushItem({
          id: `cine_video_placeholder_${scene.id}`,
          order: scene.order * 10,
          title: `${scene.title} · vídeo pendiente`,
          description: video.visualAction || scene.visualSummary,
          mediaType: "placeholder",
          role: "video_placeholder",
          durationSeconds: video.durationSeconds,
          aspectRatio: video.aspectRatio,
          sceneId: scene.id,
          sceneOrder: scene.order,
          sceneTitle: scene.title,
          status: "pending",
          metadata: {
            generatedFrom: "cine-node",
            cineNodeId: sourceNodeId,
            sourceScriptNodeId: data.metadata?.sourceScriptNodeId,
            prompt: video.prompt,
            negativePrompt: video.negativePrompt,
            visualNotes: video.visualNotes,
            voiceOver: video.voiceOver,
            onScreenText: scene.onScreenText,
            cameraMovementType: video.cameraMovementType,
            cameraDescription: video.cameraDescription,
            cameraPrompt: video.cameraPrompt,
            visualDirection,
            characterIds: scene.characters,
            backgroundId: scene.backgroundId,
            referenceAssetIds: video.referenceAssetIds,
            overlayTextPlan: video.overlayTextPlan,
            voiceoverPlan: video.voiceoverPlan,
            createdAt: video.metadata?.createdAt,
            updatedAt: video.metadata?.updatedAt,
          },
        });
        videoIds.push(id);
      }
    });
  }

  if (config.includePlaceholders && !config.includeOnlyApprovedVideos) {
    data.scenes.forEach((scene) => {
      const hasFrameItems = (sceneFrameItemIds.get(scene.id) ?? []).length > 0;
      const needsPlaceholder = !hasFrameItems || (scene.framesMode === "start_end" && (sceneFrameItemIds.get(scene.id) ?? []).length < 2);
      if (!needsPlaceholder) return;
      const id = pushItem({
        id: `cine_storyboard_placeholder_${scene.id}`,
        order: scene.order * 10 + 9,
        title: `${scene.title} · pendiente`,
        description: scene.visualSummary || scene.visualNotes,
        mediaType: "placeholder",
        role: "storyboard_placeholder",
        durationSeconds: scene.durationSeconds ?? scene.shot.durationSeconds,
        aspectRatio: getEffectiveSceneVisualDirection(data, scene).aspectRatio,
        sceneId: scene.id,
        sceneOrder: scene.order,
        sceneTitle: scene.title,
        status: hasFrameItems ? "missing" : "pending",
        metadata: {
          generatedFrom: "cine-node",
          cineNodeId: sourceNodeId,
          sourceScriptNodeId: data.metadata?.sourceScriptNodeId,
          visualNotes: scene.visualNotes,
          voiceOver: scene.voiceOver,
          onScreenText: scene.onScreenText,
          cameraMovementType: scene.shot.cameraMovementType,
          cameraDescription: scene.shot.cameraDescription || scene.shot.cameraMovement,
          visualDirection: mediaListVisualDirection({ ...data, visualDirection: getEffectiveSceneVisualDirection(data, scene) }),
          characterIds: scene.characters,
          backgroundId: scene.backgroundId,
        },
      });
      storyboardIds.push(id);
    });
  }

  addGroup(groups, "sheets", "Hojas de continuidad", sheetIds);
  addGroup(groups, "characters", "Personajes", characterIds);
  addGroup(groups, "backgrounds", "Fondos", backgroundIds);
  addGroup(groups, "storyboard", "Storyboard", storyboardIds);
  addGroup(groups, "videos", "Vídeos", videoIds);
  addGroup(groups, "approved_videos", "Vídeos aprobados", approvedVideoIds);

  const totalScenes = data.scenes.length;
  const totalFrameSlots = data.scenes.reduce((count, scene) => count + (scene.framesMode === "start_end" ? 2 : 1), 0);
  const generatedFrameSlots = data.scenes.reduce((count, scene) => {
    const roles = scene.framesMode === "start_end" ? (["start", "end"] as const) : (["single"] as const);
    return count + roles.filter((role) => Boolean(getEffectiveCineFrameAsset(scene.frames[role]))).length;
  }, 0);
  const totalVideos = data.scenes.filter((scene) => Boolean(getEffectiveCineVideoAsset(scene.video))).length;
  const approvedVideos = data.scenes.filter((scene) => Boolean(scene.video?.approvedVideoAssetId)).length;
  let status: MediaListOutputStatus = "empty";
  if (!script && !data.scenes.length && !items.length) status = "empty";
  else if (script && !data.scenes.length) status = "script_pending";
  else if (approvedVideos > 0) status = "approved_ready";
  else if (totalVideos > 0 && totalVideos >= totalScenes && totalScenes > 0) status = "videos_ready";
  else if (totalVideos > 0) status = "videos_partial";
  else if (generatedFrameSlots > 0 && generatedFrameSlots >= totalFrameSlots && totalFrameSlots > 0) status = "frames_ready";
  else if (generatedFrameSlots > 0) status = "frames_partial";
  else if (data.scenes.length) status = "storyboard_ready";
  else if (data.detected) status = "script_produced";

  return {
    kind: "media_list",
    sourceNodeId,
    sourceNodeType: "cine",
    title: data.sourceScript?.title || data.label || data.detected?.logline || "Cine",
    status,
    items: items.sort((a, b) => a.order - b.order),
    groups,
    metadata: {
      cineNodeId: sourceNodeId,
      scriptTitle: data.sourceScript?.title || data.detected?.logline,
      mode: data.visualDirection.mode,
      aspectRatio: data.visualDirection.aspectRatio,
      visualStyle: data.visualDirection.visualStyle,
      colorGrading: data.visualDirection.colorGrading,
      lightingStyle: data.visualDirection.lightingStyle,
      totalScenes,
      totalFrames: generatedFrameSlots,
      totalVideos,
      approvedVideos,
      generatedAt,
    },
  };
}
