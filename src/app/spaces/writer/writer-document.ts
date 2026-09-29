import type { JSONContent } from "@tiptap/core";
import { writerMemoryCounts, type WriterMemoryEntry } from "./writer-memory";
import { migrateMemoryToStory, normalizeStory, projectWriterMemory, type WriterStory } from "./writer-story";

/**
 * El árbol ProseMirror es la fuente de verdad y vive en su propio archivo (`documentKey`).
 * El nodo del space guarda título, perfil, la referencia y el texto derivado.
 * `content` en el nodo solo aparece si el archivo no se pudo guardar.
 * Esta fase no llama a ninguna API de pago.
 */

export const WRITER_DOCUMENT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const WRITER_PROFILES = ["document", "article", "post", "screenplay"] as const;

export type WriterProfile = (typeof WRITER_PROFILES)[number];

export const WRITER_PROFILE_LABELS: Record<WriterProfile, string> = {
  document: "Documento",
  article: "Artículo",
  post: "Post",
  screenplay: "Guion",
};

export const WRITER_PAGE_PRESETS = ["a4", "letter", "a5", "screen"] as const;

export type WriterPagePreset = (typeof WRITER_PAGE_PRESETS)[number];

export const WRITER_PAGE_PRESET_LABELS: Record<WriterPagePreset, string> = {
  a4: "A4",
  letter: "Carta",
  a5: "A5",
  screen: "Pantalla",
};

export type WriterPageMetrics = {
  width: string;
  minHeight: string;
  padding: string;
};

const SCREEN_PAGE_WIDTH: Record<WriterProfile, string> = {
  document: "760px",
  article: "680px",
  post: "560px",
  screenplay: "720px",
};

export type WriterDocumentContent = JSONContent;

export type WriterNodeData = {
  label: string;
  title: string;
  profile: WriterProfile;
  pagePreset: WriterPagePreset;
  documentId: string | null;
  documentKey: string;
  /** Cuerpo inline solo como recuperación si el archivo no se guardó. */
  content: WriterDocumentContent | null;
  value: string;
  promptValue: string;
  wordCount: number;
  chapterCount: number;
  canonCount: number;
  ideaCount: number;
  /** Lista inline solo si el archivo no se pudo guardar. */
  memory: WriterMemoryEntry[] | null;
  /** Story inline solo si el archivo no se pudo guardar. */
  story: WriterStory | null;
  updatedAt: string;
};

export type WriterPersistedPatch = {
  title: string;
  profile: WriterProfile;
  pagePreset: WriterPagePreset;
  documentId: string;
  documentKey: string;
  value: string;
  promptValue: string;
  wordCount: number;
  chapterCount: number;
  canonCount: number;
  ideaCount: number;
  updatedAt: string;
  content: WriterDocumentContent | null;
  memory: WriterMemoryEntry[] | null;
  story: WriterStory | null;
};

type WriterMark = { type?: string };

export function emptyWriterContent(): WriterDocumentContent {
  return { type: "doc", content: [{ type: "paragraph" }] };
}

export function isWriterProfile(value: unknown): value is WriterProfile {
  return value === "document" || value === "article" || value === "post" || value === "screenplay";
}

export function isWriterPagePreset(value: unknown): value is WriterPagePreset {
  return value === "a4" || value === "letter" || value === "a5" || value === "screen";
}

/** Ancho y alto mínimo de una hoja. La vista sigue siendo continua: el papel crece, no se parte. */
export function writerPageMetrics(preset: WriterPagePreset, profile: WriterProfile): WriterPageMetrics {
  if (preset === "screen") {
    return {
      width: SCREEN_PAGE_WIDTH[profile],
      minHeight: "calc(100vh - 180px)",
      padding: "64px 72px",
    };
  }
  if (preset === "letter") {
    return { width: "816px", minHeight: "1056px", padding: "72px 76px" };
  }
  if (preset === "a5") {
    return { width: "559px", minHeight: "794px", padding: "48px 44px" };
  }
  return { width: "794px", minHeight: "1123px", padding: "72px 76px" };
}

export function isWriterDocumentId(value: unknown): value is string {
  return typeof value === "string" && WRITER_DOCUMENT_ID_PATTERN.test(value);
}

export function writerContentHasBody(content: WriterDocumentContent | null | undefined): boolean {
  if (!content?.content?.length) return false;
  if (plainTextFromWriterContent(content).length > 0) return true;
  return content.content.length > 1 || content.content.some((block) => block.type && block.type !== "paragraph");
}

function asContent(value: unknown): WriterDocumentContent | null {
  if (!value || typeof value !== "object") return null;
  const row = value as WriterDocumentContent;
  if (row.type !== "doc" || !Array.isArray(row.content)) return null;
  return row;
}

function inlineText(node: JSONContent | undefined, markdown: boolean): string {
  if (!node) return "";
  if (node.type === "hardBreak") return "\n";
  if (node.type === "text") {
    let text = node.text ?? "";
    if (!markdown) return text;
    const marks = (node.marks as WriterMark[] | undefined) ?? [];
    const types = new Set(marks.map((mark) => mark.type));
    if (types.has("italic")) text = `*${text}*`;
    if (types.has("bold")) text = `**${text}**`;
    return text;
  }
  return (node.content ?? []).map((child) => inlineText(child, markdown)).join("");
}

function inlineMarkdown(node: JSONContent | undefined): string {
  return inlineText(node, true);
}

function blockMarkdown(node: JSONContent): string {
  if (node.type === "chapter") {
    return (node.content ?? [])
      .map((child) => {
        if (child.type === "chapterTitle") {
          const text = inlineMarkdown(child).trim() || "Sin título";
          return `# ${text}`;
        }
        return blockMarkdown(child);
      })
      .filter((part) => part.length > 0)
      .join("\n\n");
  }
  if (node.type === "heading") {
    const level = Math.min(3, Math.max(1, Number(node.attrs?.level) || 1));
    const text = inlineMarkdown(node).trim();
    return text ? `${"#".repeat(level)} ${text}` : "";
  }
  if (node.type === "bulletList" || node.type === "orderedList") {
    return (node.content ?? [])
      .map((item, index) => {
        const text = inlineMarkdown(item).trim();
        const prefix = node.type === "orderedList" ? `${index + 1}. ` : "- ";
        return text ? `${prefix}${text}` : "";
      })
      .filter(Boolean)
      .join("\n");
  }
  if (isWriterScreenplayBlockName(node.type)) {
    return screenplayLine(node.type, inlineText(node, false));
  }
  if (node.type === "blockquote") {
    const text = inlineMarkdown(node).trim();
    if (!text) return "";
    return text
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n");
  }
  return inlineMarkdown(node).trim();
}

export function markdownFromWriterContent(content: WriterDocumentContent | null | undefined): string {
  if (!content?.content?.length) return "";
  return content.content
    .map((block) => blockMarkdown(block))
    .filter((block) => block.length > 0)
    .join("\n\n")
    .trim();
}

function plainBlock(node: JSONContent): string {
  if (node.type === "chapter") {
    return (node.content ?? [])
      .map((child) => plainBlock(child))
      .filter((part) => part.length > 0)
      .join("\n\n");
  }
  if (node.type === "bulletList" || node.type === "orderedList") {
    return (node.content ?? [])
      .map((item) => inlineText(item, false).replace(/\s+/g, " ").trim())
      .filter((item) => item.length > 0)
      .join("\n");
  }
  if (isWriterScreenplayBlockName(node.type)) {
    return screenplayLine(node.type, inlineText(node, false));
  }
  return inlineText(node, false).replace(/\s+/g, " ").trim();
}

const WRITER_SCREENPLAY_BLOCK_NAMES = ["sceneHeading", "action", "character", "dialogue", "parenthetical", "transition"] as const;

function isWriterScreenplayBlockName(value: string | undefined): value is (typeof WRITER_SCREENPLAY_BLOCK_NAMES)[number] {
  return typeof value === "string" && (WRITER_SCREENPLAY_BLOCK_NAMES as readonly string[]).includes(value);
}

function screenplayLine(type: (typeof WRITER_SCREENPLAY_BLOCK_NAMES)[number], text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "";
  if (type === "sceneHeading" || type === "character" || type === "transition") return clean.toLocaleUpperCase("es");
  if (type === "parenthetical") return `(${clean.replace(/^\(+/, "").replace(/\)+$/, "")})`;
  return clean;
}

export function plainTextFromWriterContent(content: WriterDocumentContent | null | undefined): string {
  if (!content?.content?.length) return "";
  return content.content
    .map((block) => plainBlock(block))
    .filter((block) => block.length > 0)
    .join("\n\n")
    .trim();
}

export function wordCountFromWriterContent(content: WriterDocumentContent | null | undefined): number {
  const plain = plainTextFromWriterContent(content);
  if (!plain) return 0;
  return plain.split(/\s+/).filter(Boolean).length;
}

export type WriterChapterEntry = {
  id: string;
  title: string;
};

export function writerChapterMap(content: WriterDocumentContent | null | undefined): WriterChapterEntry[] {
  const entries: WriterChapterEntry[] = [];
  for (const block of content?.content ?? []) {
    if (block.type !== "chapter") continue;
    const titleNode = (block.content ?? []).find((child) => child.type === "chapterTitle");
    const title = inlineText(titleNode, false).replace(/\s+/g, " ").trim() || "Sin título";
    const rawId = block.attrs?.id;
    entries.push({
      id: typeof rawId === "string" && rawId ? rawId : `chapter-${entries.length + 1}`,
      title,
    });
  }
  return entries;
}

export function deriveWriterOutputs(content: WriterDocumentContent): {
  value: string;
  promptValue: string;
  wordCount: number;
} {
  return {
    value: plainTextFromWriterContent(content),
    promptValue: markdownFromWriterContent(content),
    wordCount: wordCountFromWriterContent(content),
  };
}

export function normalizeWriterNodeData(raw: unknown): WriterNodeData {
  const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const inline = asContent(row.content);
  const keepInline = inline != null && writerContentHasBody(inline);
  const derived = keepInline && inline ? deriveWriterOutputs(inline) : null;
  const title = typeof row.title === "string" ? row.title : "";
  const label = typeof row.label === "string" && row.label.trim() ? row.label : "Writer";
  const updatedAt = typeof row.updatedAt === "string" ? row.updatedAt : "";
  const storedWords = typeof row.wordCount === "number" && Number.isFinite(row.wordCount) ? row.wordCount : 0;
  const story = storyFromNode(row);
  return {
    label,
    title,
    profile: isWriterProfile(row.profile) ? row.profile : "document",
    pagePreset: isWriterPagePreset(row.pagePreset) ? row.pagePreset : "a4",
    documentId: isWriterDocumentId(row.documentId) ? row.documentId : null,
    documentKey: typeof row.documentKey === "string" ? row.documentKey : "",
    content: keepInline ? inline : null,
    value: derived ? derived.value : typeof row.value === "string" ? row.value : "",
    promptValue: derived ? derived.promptValue : typeof row.promptValue === "string" ? row.promptValue : "",
    wordCount: derived ? derived.wordCount : storedWords,
    chapterCount: keepInline && inline ? writerChapterMap(inline).length : typeof row.chapterCount === "number" && Number.isFinite(row.chapterCount) ? row.chapterCount : 0,
    ...(story ? writerMemoryCounts(projectWriterMemory(story)) : numericMemoryCounts(row)),
    memory: story ? projectWriterMemory(story) : null,
    story,
    updatedAt,
  };
}

function storyFromNode(row: Record<string, unknown>): WriterStory | null {
  return normalizeStory(row.story) ?? (Array.isArray(row.memory) ? migrateMemoryToStory(row.memory) : null);
}

function numericMemoryCounts(row: Record<string, unknown>): { canonCount: number; ideaCount: number } {
  const count = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0);
  return { canonCount: count(row.canonCount), ideaCount: count(row.ideaCount) };
}

export function writerNeedsRemoteLoad(data: WriterNodeData): boolean {
  return Boolean(data.documentId) && !writerContentHasBody(data.content);
}

export function writerPersistedPatch(input: {
  title: string;
  profile: WriterProfile;
  pagePreset: WriterPagePreset;
  content: WriterDocumentContent;
  documentId: string;
  documentKey: string;
  keepContent?: boolean;
  memory?: unknown;
  story?: unknown;
  updatedAt?: string;
}): WriterPersistedPatch {
  const content = asContent(input.content) ?? emptyWriterContent();
  const derived = deriveWriterOutputs(content);
  const story = normalizeStory(input.story) ?? migrateMemoryToStory(input.memory);
  const memory = projectWriterMemory(story);
  return {
    title: input.title,
    profile: input.profile,
    pagePreset: input.pagePreset,
    documentId: input.documentId,
    documentKey: input.documentKey,
    ...derived,
    chapterCount: writerChapterMap(content).length,
    ...writerMemoryCounts(memory),
    updatedAt: input.updatedAt ?? new Date().toISOString(),
    content: input.keepContent ? content : null,
    memory: input.keepContent ? memory : null,
    story: input.keepContent ? story : null,
  };
}
