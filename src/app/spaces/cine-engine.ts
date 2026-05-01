import {
  CINE_MODE_LABELS,
  type CineAnalysisResult,
  type CineBackground,
  type CineCharacter,
  type CineFrame,
  type CineFrame as Frame,
  type CineNodeData,
  type CineScene,
  type CineVideoPlan,
  makeCineId,
} from "./cine-types";

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
}): CineScene {
  const title = cleanScriptText(args.title || sceneTitle(args.order));
  const sourceText = cleanText(args.text);
  const voiceOver = args.voiceOver ? cleanScriptText(args.voiceOver) : undefined;
  const onScreenText = (args.onScreenText ?? []).map(cleanScriptText).filter(Boolean);
  const visualNotes = args.visualNotes ? cleanScriptText(args.visualNotes) : undefined;
  const visualSummary = visualNotes || `Traducir esta parte del guion a un plano claro: ${firstSentence(sourceText || voiceOver || onScreenText.join(" "), title)}`;
  const durationSeconds = args.durationSeconds ?? 5;
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
      lensSuggestion: "35mm o 50mm cinematografico",
      lighting: "luz naturalista y expresiva",
      mood: "cinematografico, claro, con continuidad emocional",
      action: firstSentence(sourceText || visualNotes || voiceOver || title, "accion principal de la escena"),
      durationSeconds,
    },
    framesMode: "single",
    frames: {},
    status: "draft",
  };
}

export function analyzeCineScript(script: string): CineAnalysisResult {
  const clean = cleanText(script);
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
        });
      })
    : sceneTexts.map((text, index) =>
        createScene({
          text,
          order: index + 1,
          characterIds: characters.slice(0, 2).map((character) => character.id),
          backgroundId: backgrounds[index % Math.max(1, backgrounds.length)]?.id,
        }),
      );
  return {
    logline: firstSentence(clean, "Guion cinematografico"),
    summary: clean.length > 420 ? `${clean.slice(0, 417)}...` : clean,
    tone: "cinematografico, emocional y visual",
    visualStyle: "direccion sobria, continuidad clara, luz motivada y composiciones limpias",
    suggestedMode: "short_film",
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

function line(label: string, value?: string | string[]): string | null {
  const text = Array.isArray(value) ? value.filter(Boolean).join(", ") : value;
  return text && text.trim() ? `${label}: ${text.trim()}` : null;
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
  return [
    `Create a cinematic ${roleLine} for a ${CINE_MODE_LABELS[args.data.mode]} production.`,
    line("Aspect ratio", args.data.visualDirection.aspectRatio),
    line("Realism level", args.data.visualDirection.realismLevel),
    line("Global visual direction", args.data.visualDirection.globalStylePrompt),
    line("Tone", args.data.visualDirection.tone),
    line("Camera style", args.data.visualDirection.cameraStyle),
    line("Lighting style", args.data.visualDirection.lightingStyle),
    args.brainConnected && args.data.visualDirection.useBrain ? "Use Brain only as continuity and project direction context; do not modify Brain." : null,
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
    line("Camera movement", scene.shot.cameraMovement),
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
      cineNodeId: args.cineNodeId,
      sceneId: args.sceneId,
      frameRole: args.frameRole,
      charactersUsed: scene?.characters ?? [],
      backgroundUsed: scene?.backgroundId,
      brainNodeId: args.brainConnected && args.data.visualDirection.useBrain ? args.data.metadata?.brainNodeId : undefined,
      visualCapsuleIds: args.data.visualDirection.visualCapsuleIds,
      sourceScriptNodeId: args.data.metadata?.sourceScriptNodeId,
    },
  };
}

export function buildVideoPromptForScene(data: CineNodeData, sceneId: string): string {
  const scene = data.scenes.find((item) => item.id === sceneId);
  if (!scene) return "";
  const visualAction = visualPriority(scene);
  const intent = emotionalIntent(scene);
  return [
    `Video para escena ${scene.order}: ${scene.title}`,
    line("Tipo temporal", scene.sceneKind),
    line("Accion visual principal", visualAction),
    line("Intencion emocional", intent),
    line("Movimiento de camara", scene.shot.cameraMovement),
    line("Ritmo", data.visualDirection.pacing),
    line("Emocion", scene.shot.mood),
    line("Duracion", `${scene.durationSeconds ?? scene.shot.durationSeconds ?? 5}s`),
    line("Voz en off", scene.voiceOver),
    scene.onScreenText?.length ? `Texto en pantalla como overlay externo: ${scene.onScreenText.join(" / ")}` : null,
    line("Notas visuales", scene.visualNotes),
    "Mantener continuidad con los frames aprobados y evitar cambios de identidad, fondo o escala.",
  ].filter((item): item is string => Boolean(item)).join("\n");
}

export function prepareSceneForVideo(data: CineNodeData, sceneId: string): CineVideoPlan {
  const scene = data.scenes.find((item) => item.id === sceneId);
  return {
    sceneId,
    mode: scene?.framesMode === "start_end" ? "start_end_frames" : "image_to_video",
    prompt: buildVideoPromptForScene(data, sceneId),
    visualAction: scene ? visualPriority(scene) : undefined,
    emotionalIntent: scene ? emotionalIntent(scene) : undefined,
    voiceOver: scene?.voiceOver,
    onScreenText: scene?.onScreenText,
    visualNotes: scene?.visualNotes,
    sceneKind: scene?.sceneKind,
    startFramePrompt: scene?.frames.start?.prompt || scene?.frames.single?.prompt,
    endFramePrompt: scene?.frames.end?.prompt,
    durationSeconds: scene?.durationSeconds ?? scene?.shot.durationSeconds ?? 5,
    aspectRatio: data.visualDirection.aspectRatio,
    startFrameAssetId: scene?.frames.start?.editedImageAssetId || scene?.frames.start?.imageAssetId,
    endFrameAssetId: scene?.frames.end?.editedImageAssetId || scene?.frames.end?.imageAssetId,
    cameraMovement: scene?.shot.cameraMovement,
    action: scene?.shot.action,
    mood: scene?.shot.mood,
    status: "ready",
  };
}
