import type { StoryDocumentBlock } from "./writer-appearances";
import { isSaneCharacterCue, locationCase, storyDisplayTitle } from "./writer-cue";
import { writerEntityId } from "./writer-entities";

/**
 * Estructura local del documento. Se deriva al leer. No se persiste y no llama a ningún modelo.
 */

export type StorySetting = "int" | "ext" | "other";

export type StoryStructureKind = "scene" | "chapter" | "section";

export type StoryStructureUnit = {
  id: string;
  kind: StoryStructureKind;
  heading: string;
  title: string;
  locationLabel: string | null;
  setting: StorySetting | null;
  order: number;
  blockId: string;
  cast: string[];
  timeLabel: string | null;
  parsedMinutes: number | null;
  chronologyOrder: number | null;
};

export type StoryLocation = {
  label: string;
  unitIds: string[];
};

const TIME_SUFFIX =
  /^(?:d[ií]a|noche|amanecer|atardecer|anochecer|ocaso|continuo|continua|continuaci[oó]n|madrugada|ma[nñ]ana|tarde|mediod[ií]a|de\s+d[ií]a|de\s+noche|por\s+la\s+(?:noche|ma[nñ]ana|tarde)|al\s+(?:amanecer|atardecer)|m[aá]s\s+tarde|momentos\s+despu[eé]s|later|day|night|dawn|dusk|continuous|morning|evening)$/iu;

const HEADING_PREFIX = /^(INT\.?\s*\/\s*EXT\.?|EXT\.?\s*\/\s*INT\.?|I\/E\.?|INT\.?|EXT\.?)\s+/iu;

const CLOCK = /^(\d{1,2}):(\d{2})$/;
const RELATIVE_TIME = /^(un|una|dos|tres|cuatro|\d+)\s+horas?\s+(antes|despu[eé]s)$/iu;
const WORD_HOURS: Record<string, number> = { un: 1, una: 1, dos: 2, tres: 3, cuatro: 4 };

export function parseSceneHeading(heading: string): { setting: StorySetting | null; locationLabel: string | null; timeLabel: string | null } {
  let text = heading.replace(/\s+/g, " ").trim();
  if (!text) return { setting: null, locationLabel: null, timeLabel: null };
  let setting: StorySetting | null = null;
  const prefix = text.match(HEADING_PREFIX);
  if (prefix?.[1]) {
    const token = prefix[1].toLocaleUpperCase("es");
    setting = token.includes("INT") && token.includes("EXT") ? "other" : token.startsWith("INT") ? "int" : token.startsWith("EXT") ? "ext" : "other";
    text = text.slice(prefix[0].length).trim();
  }
  const parts = text.split(/\s+[-–—]\s+/).map((part) => part.trim()).filter(Boolean);
  let timeLabel: string | null = null;
  while (parts.length > 1) {
    const last = parts[parts.length - 1] ?? "";
    if (TIME_SUFFIX.test(last)) {
      parts.pop();
      continue;
    }
    const clock = clockLabel(last);
    const relative = relativeLabel(last);
    if ((clock || relative) && !timeLabel) {
      parts.pop();
      timeLabel = clock ?? relative;
      continue;
    }
    break;
  }
  const location = parts.join(" - ").trim();
  if (!location) return { setting, locationLabel: null, timeLabel };
  return { setting, locationLabel: locationCase(location), timeLabel };
}

export function sceneChronology(units: StoryStructureUnit[]): { nonlinear: boolean; confident: boolean } {
  const timed = units.filter((unit) => unit.parsedMinutes != null);
  const confident = timed.length >= 2;
  const nonlinear = confident && timed.some((unit, index) => index > 0 && (unit.parsedMinutes ?? 0) < (timed[index - 1]?.parsedMinutes ?? 0));
  return { nonlinear, confident };
}

export function deriveStoryStructure(
  blocks: StoryDocumentBlock[],
  options?: { kinds?: StoryStructureKind[] },
): {
  kind: StoryStructureKind | null;
  units: StoryStructureUnit[];
  locations: StoryLocation[];
} {
  const kinds = options?.kinds ?? ["scene", "chapter", "section"];
  if (kinds.includes("scene")) {
    const scenes = blocks.filter((block) => block.type === "sceneHeading" && block.text.trim());
    if (scenes.length > 0) return finish("scene", sceneUnits(blocks, scenes));
  }
  if (kinds.includes("chapter")) {
    const chapters = chapterUnits(blocks);
    if (chapters.length > 0) return finish("chapter", chapters);
  }
  if (kinds.includes("section")) {
    const sections = blocks.filter((block) => block.type === "heading" && block.text.trim());
    if (sections.length > 0) return finish("section", sectionUnits(blocks, sections));
  }
  return { kind: null, units: [], locations: [] };
}

function finish(kind: StoryStructureKind, units: StoryStructureUnit[]): {
  kind: StoryStructureKind;
  units: StoryStructureUnit[];
  locations: StoryLocation[];
} {
  return { kind, units, locations: kind === "scene" ? locationsOf(units) : [] };
}

function sceneUnits(blocks: StoryDocumentBlock[], headings: StoryDocumentBlock[]): StoryStructureUnit[] {
  let anchor: number | null = null;
  const units = headings.map((heading, index) => {
    const next = headings[index + 1];
    const range = blocks.filter((block) => block.order >= heading.order && (next ? block.order < next.order : true));
    const parsed = parseSceneHeading(heading.text);
    const minutes = resolveMinutes(parsed.timeLabel, anchor);
    if (clockMinutes(parsed.timeLabel) != null) anchor = clockMinutes(parsed.timeLabel);
    return {
      id: heading.blockId,
      kind: "scene" as const,
      heading: heading.text,
      title: parsed.locationLabel || locationCase(heading.text),
      locationLabel: parsed.locationLabel,
      setting: parsed.setting,
      order: index + 1,
      blockId: heading.blockId,
      cast: castOf(range),
      timeLabel: parsed.timeLabel,
      parsedMinutes: minutes,
      chronologyOrder: null as number | null,
    };
  });
  const timed = [...units].filter((unit) => unit.parsedMinutes != null).sort((a, b) => (a.parsedMinutes ?? 0) - (b.parsedMinutes ?? 0) || a.order - b.order);
  timed.forEach((unit, index) => {
    unit.chronologyOrder = index + 1;
  });
  return units;
}

function chapterUnits(blocks: StoryDocumentBlock[]): StoryStructureUnit[] {
  const ids: string[] = [];
  for (const block of blocks) {
    if (block.chapterId && !ids.includes(block.chapterId)) ids.push(block.chapterId);
  }
  if (ids.length === 0) return [];
  return ids.map((chapterId, index) => {
    const range = blocks.filter((block) => block.chapterId === chapterId);
    const titleBlock = range.find((block) => block.type === "chapterTitle" && block.text.trim());
    const heading = titleBlock?.text || range[0]?.chapterLabel || `Capítulo ${index + 1}`;
    return {
      id: chapterId,
      kind: "chapter",
      heading,
      title: heading,
      locationLabel: null,
      setting: null,
      order: index + 1,
      blockId: titleBlock?.blockId || range[0]?.blockId || chapterId,
      cast: castOf(range),
      timeLabel: null,
      parsedMinutes: null,
      chronologyOrder: null,
    };
  });
}

function sectionUnits(blocks: StoryDocumentBlock[], headings: StoryDocumentBlock[]): StoryStructureUnit[] {
  return headings.map((heading, index) => {
    const next = headings[index + 1];
    const range = blocks.filter((block) => block.order >= heading.order && (next ? block.order < next.order : true));
    return {
      id: heading.blockId,
      kind: "section",
      heading: heading.text,
      title: heading.text,
      locationLabel: null,
      setting: null,
      order: index + 1,
      blockId: heading.blockId,
      cast: castOf(range),
      timeLabel: null,
      parsedMinutes: null,
      chronologyOrder: null,
    };
  });
}

function castOf(blocks: StoryDocumentBlock[]): string[] {
  const cast: string[] = [];
  const seen = new Set<string>();
  for (const block of blocks) {
    if (block.type !== "character" || !isSaneCharacterCue(block.text)) continue;
    const title = storyDisplayTitle(block.text, "character");
    const slug = writerEntityId(title);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    cast.push(title);
  }
  return cast;
}

function clockLabel(value: string): string | null {
  const match = value.match(CLOCK);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function relativeLabel(value: string): string | null {
  if (!RELATIVE_TIME.test(value)) return null;
  return value.replace(/\s+/g, " ").trim().toLocaleLowerCase("es");
}

function clockMinutes(label: string | null): number | null {
  if (!label) return null;
  const match = label.match(CLOCK);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function resolveMinutes(label: string | null, anchor: number | null): number | null {
  const clock = clockMinutes(label);
  if (clock != null) return clock;
  const match = label?.match(RELATIVE_TIME);
  if (!match?.[1] || !match[2] || anchor == null) return null;
  const hours = WORD_HOURS[match[1].toLocaleLowerCase("es")] ?? Number(match[1]);
  if (!Number.isFinite(hours)) return null;
  const delta = hours * 60;
  return /antes/i.test(match[2]) ? anchor - delta : anchor + delta;
}

function locationsOf(units: StoryStructureUnit[]): StoryLocation[] {
  const locations: StoryLocation[] = [];
  for (const unit of units) {
    if (!unit.locationLabel) continue;
    const found = locations.find((item) => item.label.toLocaleLowerCase("es") === unit.locationLabel?.toLocaleLowerCase("es"));
    if (found) found.unitIds.push(unit.id);
    else locations.push({ label: unit.locationLabel, unitIds: [unit.id] });
  }
  return locations;
}
