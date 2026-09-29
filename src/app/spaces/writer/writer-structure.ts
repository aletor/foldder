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
};

export type StoryLocation = {
  label: string;
  unitIds: string[];
};

const TIME_SUFFIX =
  /^(?:d[ií]a|noche|amanecer|atardecer|anochecer|ocaso|continuo|continua|continuaci[oó]n|madrugada|ma[nñ]ana|tarde|mediod[ií]a|de\s+d[ií]a|de\s+noche|por\s+la\s+(?:noche|ma[nñ]ana|tarde)|al\s+(?:amanecer|atardecer)|m[aá]s\s+tarde|momentos\s+despu[eé]s|later|day|night|dawn|dusk|continuous|morning|evening)$/iu;

const HEADING_PREFIX = /^(INT\.?\s*\/\s*EXT\.?|EXT\.?\s*\/\s*INT\.?|I\/E\.?|INT\.?|EXT\.?)\s+/iu;

export function parseSceneHeading(heading: string): { setting: StorySetting | null; locationLabel: string | null } {
  let text = heading.replace(/\s+/g, " ").trim();
  if (!text) return { setting: null, locationLabel: null };
  let setting: StorySetting | null = null;
  const prefix = text.match(HEADING_PREFIX);
  if (prefix?.[1]) {
    const token = prefix[1].toLocaleUpperCase("es");
    setting = token.includes("INT") && token.includes("EXT") ? "other" : token.startsWith("INT") ? "int" : token.startsWith("EXT") ? "ext" : "other";
    text = text.slice(prefix[0].length).trim();
  }
  const parts = text.split(/\s+[-–—]\s+/).map((part) => part.trim()).filter(Boolean);
  while (parts.length > 1 && TIME_SUFFIX.test(parts[parts.length - 1] ?? "")) parts.pop();
  const location = parts.join(" - ").trim();
  if (!location) return { setting, locationLabel: null };
  return { setting, locationLabel: locationCase(location) };
}

export function deriveStoryStructure(
  blocks: StoryDocumentBlock[],
  options?: { screenplay?: boolean },
): {
  kind: StoryStructureKind | null;
  units: StoryStructureUnit[];
  locations: StoryLocation[];
} {
  const allowScenes = options?.screenplay !== false;
  const scenes = allowScenes ? blocks.filter((block) => block.type === "sceneHeading" && block.text.trim()) : [];
  if (scenes.length > 0) return finish("scene", sceneUnits(blocks, scenes));
  const chapters = chapterUnits(blocks);
  if (chapters.length > 0) return finish("chapter", chapters);
  const sections = blocks.filter((block) => block.type === "heading" && block.text.trim());
  if (sections.length > 0) return finish("section", sectionUnits(blocks, sections));
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
  return headings.map((heading, index) => {
    const next = headings[index + 1];
    const range = blocks.filter((block) => block.order >= heading.order && (next ? block.order < next.order : true));
    const parsed = parseSceneHeading(heading.text);
    return {
      id: heading.blockId,
      kind: "scene",
      heading: heading.text,
      title: parsed.locationLabel || locationCase(heading.text),
      locationLabel: parsed.locationLabel,
      setting: parsed.setting,
      order: index + 1,
      blockId: heading.blockId,
      cast: castOf(range),
    };
  });
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
