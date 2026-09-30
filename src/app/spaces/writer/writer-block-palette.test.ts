import { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { writerBlockPalette, writerDocumentHasOutline, writerSlashAt, writerSlashMatches } from "./writer-block-palette";
import { emptyWriterContent } from "./writer-document";
import { createWriterStarterKit, writerScreenplayNodes } from "./writer-screenplay";

describe("writer block palette", () => {
  it("uses a compact script palette and a prose palette", () => {
    expect(writerBlockPalette("screenplay").map((item) => item.mark)).toEqual(["#", "¶", "@", "()", "“”", "→", "—"]);
    expect(writerBlockPalette("document").map((item) => item.mark)).toEqual(["T", "H1", "H2", "H3", "¶", "“", "•", "—"]);
    expect(writerBlockPalette("article").map((item) => item.mark)).toEqual(["T", "H1", "H2", "H3", "¶", "“", "•", "—"]);
    expect(writerBlockPalette("post").map((item) => item.mark)).toEqual(["H1", "H2", "H3", "¶", "“", "•", "—"]);
    expect(writerBlockPalette("screenplay").some((item) => item.id === "image")).toBe(false);
  });

  it("filters slash commands from the typed prefix", () => {
    expect(writerSlashMatches("screenplay", "dia").map((item) => item.id)).toEqual(["dialogue"]);
    expect(writerSlashMatches("screenplay", "acc").map((item) => item.id)).toEqual(["action"]);
    expect(writerSlashMatches("screenplay", "per").map((item) => item.id)).toEqual(["character"]);
    expect(writerSlashMatches("document", "cita").map((item) => item.id)).toEqual(["blockquote"]);
    expect(writerSlashMatches("document", "lista").map((item) => item.id)).toEqual(["bulletList"]);
    expect(writerSlashMatches("screenplay", "").map((item) => item.mark)).toEqual(["#", "¶", "@", "()", "“”", "→", "—"]);
    expect(writerSlashMatches("document", "salto").map((item) => item.id)).toEqual(["pageBreak"]);
  });

  it("reads a slash query only at the start of the block", () => {
    const editor = new Editor({
      extensions: [createWriterStarterKit(), ...writerScreenplayNodes],
      content: { type: "doc", content: [{ type: "action", content: [{ type: "text", text: "/dia" }] }] },
    });
    const inside = editor.state.selection.from;
    editor.commands.setTextSelection(inside);
    const pos = editor.state.doc.textBetween(0, editor.state.doc.content.size).length;
    const textPos = findTextEnd(editor);
    expect(writerSlashAt(editor.state.doc, textPos)?.query).toBe("dia");
    editor.commands.setContent({ type: "doc", content: [{ type: "action", content: [{ type: "text", text: "Ana /dia" }] }] });
    expect(writerSlashAt(editor.state.doc, findTextEnd(editor))).toBeNull();
    editor.destroy();
    expect(inside).toBeGreaterThan(0);
    expect(pos).toBeGreaterThan(0);
  });

  it("hides the map until the document has an outline", () => {
    expect(writerDocumentHasOutline(emptyWriterContent())).toBe(false);
    expect(writerDocumentHasOutline({ type: "doc", content: [{ type: "sceneHeading" }] })).toBe(true);
    expect(writerDocumentHasOutline({ type: "doc", content: [{ type: "heading", attrs: { level: 1 } }] })).toBe(true);
  });
});

function findTextEnd(editor: Editor): number {
  let pos = 1;
  editor.state.doc.descendants((node, position) => {
    if (node.isText) pos = position + node.text!.length;
  });
  return pos;
}
