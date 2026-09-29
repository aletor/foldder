import { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import {
  WriterScreenplayKeys,
  applyWriterScreenplayEnter,
  applyWriterScreenplayTab,
  createWriterStarterKit,
  writerScreenplayNodes,
} from "./writer-screenplay";

function screenplayEditor(block: string, text = "") {
  const editor = new Editor({
    extensions: [createWriterStarterKit(), ...writerScreenplayNodes, WriterScreenplayKeys],
    content: {
      type: "doc",
      content: [{ type: block, content: text ? [{ type: "text", text }] : [] }],
    },
  });
  editor.storage.writerScreenplayKeys.enabled = true;
  return editor;
}

function blockTypes(editor: Editor) {
  return (editor.getJSON().content ?? []).map((block) => block.type);
}

describe("writer screenplay keys", () => {
  it("opens the next action after an action line", () => {
    const editor = screenplayEditor("action", "Camina.");
    expect(applyWriterScreenplayEnter(editor)).toBe(true);
    expect(blockTypes(editor)).toEqual(["action", "action"]);
    expect(editor.getText()).toContain("Camina.");
    editor.destroy();
  });

  it("opens dialogue after a character cue", () => {
    const editor = screenplayEditor("character", "María");
    expect(applyWriterScreenplayEnter(editor)).toBe(true);
    expect(blockTypes(editor)).toEqual(["character", "dialogue"]);
    expect(editor.getText()).toContain("María");
    editor.destroy();
  });

  it("turns an empty action into a scene heading", () => {
    const editor = screenplayEditor("action");
    expect(applyWriterScreenplayEnter(editor)).toBe(true);
    expect(blockTypes(editor)).toEqual(["sceneHeading"]);
    editor.destroy();
  });

  it("moves from action to character with tab", () => {
    const editor = screenplayEditor("action", "Camina.");
    expect(applyWriterScreenplayTab(editor)).toBe(true);
    expect(editor.state.selection.$from.parent.type.name).toBe("character");
    expect(applyWriterScreenplayTab(editor, true)).toBe(true);
    expect(editor.state.selection.$from.parent.type.name).toBe("action");
    editor.destroy();
  });

  it("leaves the block alone when the document is not a screenplay", () => {
    const editor = screenplayEditor("action", "Camina.");
    editor.storage.writerScreenplayKeys.enabled = false;
    expect(applyWriterScreenplayEnter(editor)).toBe(false);
    expect(applyWriterScreenplayTab(editor)).toBe(false);
    expect(editor.getJSON().content).toHaveLength(1);
    editor.destroy();
  });
});
