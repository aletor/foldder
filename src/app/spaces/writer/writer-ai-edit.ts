import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Mapping } from "@tiptap/pm/transform";
import { isWriterScreenplayBlock } from "./writer-screenplay";
import {
  emptyWriterAiContext,
  WRITER_AI_AFTER_LIMIT,
  WRITER_AI_BEFORE_LIMIT,
  WRITER_AI_SELECTION_LIMIT,
  type WriterAiAction,
  type WriterAiContext,
  type WriterAiRequest,
} from "./writer-ai";
import type { WriterProfile } from "./writer-document";

const ANCHOR_LIMIT = 64;

export type WriterAiProposal = {
  action: WriterAiAction;
  original: string;
  text: string;
  from: number;
  to: number;
  /** Posición desde la que se leyó `anchor`. No es `from - anchor.length`: entre medias hay límites de bloque. */
  anchorFrom: number;
  anchor: string;
  afterInBlock: string;
};

export function writerAiRequestFromEditor(
  editor: Editor,
  action: WriterAiAction,
  profile: WriterProfile,
  context: WriterAiContext = emptyWriterAiContext(),
  intent?: "natural" | "visual" | "brief",
): { ok: true; request: WriterAiRequest; proposal: Omit<WriterAiProposal, "text"> } | { ok: false; error: string } {
  const { from, to, empty } = editor.state.selection;
  const doc = editor.state.doc;
  const replaces = action !== "continue";
  const selection = empty ? "" : doc.textBetween(from, to, "\n");
  if (replaces && !selection.trim()) return { ok: false, error: "Selecciona el fragmento que hay que reescribir." };
  if (selection.length > WRITER_AI_SELECTION_LIMIT) return { ok: false, error: "Selecciona un fragmento más corto." };
  const insertAt = action === "continue" ? to : from;
  const anchorFrom = Math.max(0, insertAt - ANCHOR_LIMIT);
  const before = doc.textBetween(Math.max(0, insertAt - WRITER_AI_BEFORE_LIMIT), insertAt, "\n");
  const after = doc.textBetween(to, Math.min(doc.content.size, to + WRITER_AI_AFTER_LIMIT), "\n");
  return {
    ok: true,
    request: {
      action,
      profile,
      before,
      after,
      selection: replaces ? selection : "",
      ...(intent ? { intent } : {}),
      context,
    },
    proposal: {
      action,
      original: replaces ? selection : "",
      from: insertAt,
      to: action === "continue" ? insertAt : to,
      anchorFrom,
      anchor: doc.textBetween(anchorFrom, insertAt, "\n"),
      afterInBlock: inlineRest(doc, action === "continue" ? insertAt : to),
    },
  };
}

export function mapWriterAiProposal(proposal: WriterAiProposal, mapping: Mapping): WriterAiProposal {
  const anchorFrom = mapping.map(proposal.anchorFrom, -1);
  if (proposal.action === "continue") {
    const pos = mapping.map(proposal.from, -1);
    return { ...proposal, anchorFrom, from: pos, to: pos };
  }
  return {
    ...proposal,
    anchorFrom,
    from: mapping.map(proposal.from, -1),
    to: mapping.map(proposal.to, 1),
  };
}

export function writerAiProposalIsCurrent(doc: ProseMirrorNode, proposal: WriterAiProposal): boolean {
  if (proposal.from < 0 || proposal.to > doc.content.size || proposal.from > proposal.to) return false;
  if (doc.textBetween(proposal.from, proposal.to, "\n") !== proposal.original) return false;
  const anchorFrom = Math.max(0, Math.min(proposal.anchorFrom, proposal.from));
  if (doc.textBetween(anchorFrom, proposal.from, "\n") !== proposal.anchor) return false;
  return inlineRest(doc, proposal.to) === proposal.afterInBlock;
}

function inlineRest(doc: ProseMirrorNode, pos: number): string {
  const clamped = Math.max(0, Math.min(pos, doc.content.size));
  const $pos = doc.resolve(clamped);
  if (!$pos.parent.isTextblock) return doc.textBetween(clamped, Math.min(doc.content.size, clamped + ANCHOR_LIMIT), "\n");
  return $pos.parent.textContent.slice($pos.parentOffset, $pos.parentOffset + ANCHOR_LIMIT);
}

function continuationBlock(name: string): string {
  if (name === "paragraph" || isWriterScreenplayBlock(name)) return name;
  return "paragraph";
}

export function insertWriterAiProposal(editor: Editor, proposal: WriterAiProposal): boolean {
  const text = proposal.text.replace(/^\n+/, "").replace(/\s+$/u, "");
  if (!text.trim()) return false;
  const parent = editor.state.doc.resolve(Math.min(proposal.from, editor.state.doc.content.size)).parent;
  if (!text.includes("\n")) {
    return editor.chain().focus().insertContentAt({ from: proposal.from, to: proposal.to }, text).run();
  }
  const block = continuationBlock(parent.type.name);
  const content = text.split("\n").map((line) => ({
    type: block,
    content: line.trim() ? [{ type: "text", text: line.trim() }] : [],
  }));
  return editor.chain().focus().insertContentAt({ from: proposal.from, to: proposal.to }, content).run();
}
