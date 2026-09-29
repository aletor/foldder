import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin } from "@tiptap/pm/state";
import { WRITER_SCREENPLAY_BLOCKS } from "./writer-screenplay";

export const WRITER_TRACKED_BLOCK_TYPES = [
  "paragraph",
  "heading",
  "chapterTitle",
  ...WRITER_SCREENPLAY_BLOCKS,
] as const;

const TRACKED = new Set<string>(WRITER_TRACKED_BLOCK_TYPES);

export function writerBlockTextHash(text: string): string {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

export type WriterTrackedBlock = {
  blockId: string;
  type: string;
  text: string;
  hash: string;
};

export function listWriterTrackedBlocks(doc: ProseMirrorNode): WriterTrackedBlock[] {
  const blocks: WriterTrackedBlock[] = [];
  doc.descendants((node) => {
    if (!TRACKED.has(node.type.name)) return;
    const blockId = typeof node.attrs.blockId === "string" ? node.attrs.blockId : "";
    if (!blockId) return;
    const text = node.textContent.replace(/\s+/g, " ").trim();
    blocks.push({ blockId, type: node.type.name, text, hash: writerBlockTextHash(text) });
  });
  return blocks;
}

export function locateWriterBlock(
  doc: ProseMirrorNode,
  blockId: string,
): { from: number; to: number; focusFrom: number; focusTo: number } | null {
  let found: { from: number; to: number } | null = null;
  doc.descendants((node, pos) => {
    if (found || !node.isTextblock) return;
    if (node.attrs.blockId !== blockId) return;
    found = { from: pos, to: pos + node.nodeSize };
    return false;
  });
  if (!found) return null;
  const place: { from: number; to: number } = found;
  const focusFrom = place.from + 1;
  return { from: place.from, to: place.to, focusFrom, focusTo: Math.max(focusFrom, place.to - 1) };
}

export function writerDirtyBlocks(
  blocks: WriterTrackedBlock[],
  analyzed: Record<string, string>,
): WriterTrackedBlock[] {
  return blocks.filter((block) => block.text.length > 0 && analyzed[block.blockId] !== block.hash);
}

export function assignMissingWriterBlockIds(doc: ProseMirrorNode, tr: { setNodeMarkup: (pos: number, type: null | undefined, attrs: Record<string, unknown>) => unknown }): boolean {
  let changed = false;
  doc.descendants((node, pos) => {
    if (!TRACKED.has(node.type.name) || node.attrs.blockId) return;
    tr.setNodeMarkup(pos, undefined, { ...node.attrs, blockId: crypto.randomUUID() });
    changed = true;
  });
  return changed;
}

export const WriterBlockId = Extension.create({
  name: "writerBlockId",
  addGlobalAttributes() {
    return [
      {
        types: [...WRITER_TRACKED_BLOCK_TYPES],
        attributes: {
          blockId: {
            default: null,
            parseHTML: (element) => element.getAttribute("data-writer-block"),
            renderHTML: (attributes) =>
              attributes.blockId ? { "data-writer-block": attributes.blockId as string } : {},
          },
        },
      },
    ];
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction: (transactions, _oldState, state) => {
          if (!transactions.some((transaction) => transaction.docChanged)) return null;
          const tr = state.tr;
          return assignMissingWriterBlockIds(state.doc, tr) ? tr : null;
        },
      }),
    ];
  },
});
