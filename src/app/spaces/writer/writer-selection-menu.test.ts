import { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { WriterBlockId } from "./writer-block-id";
import { createWriterStarterKit, writerScreenplayNodes } from "./writer-screenplay";
import { writerRewriteRequest, writerSelectionOffer } from "./writer-selection-menu";

function screenplay(blocks: Array<{ type: string; text: string }>) {
  return new Editor({
    extensions: [createWriterStarterKit(), WriterBlockId, ...writerScreenplayNodes],
    content: {
      type: "doc",
      content: blocks.map((block) => ({
        type: block.type,
        content: block.text ? [{ type: "text", text: block.text }] : [],
      })),
    },
  });
}

function rangeOf(editor: Editor, text: string) {
  let found: { from: number; to: number } | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (found || !node.isText || !node.text) return;
    const index = node.text.indexOf(text);
    if (index >= 0) found = { from: pos + index, to: pos + index + text.length };
  });
  if (!found) throw new Error(`missing ${text}`);
  return found;
}

describe("writer selection menu", () => {
  it("keeps rewrite and remember on a short selection, without expand or shorten", () => {
    const editor = screenplay([{ type: "action", text: "conozco el lugar" }]);
    const partial = writerSelectionOffer(editor.state.doc, rangeOf(editor, "cono").from, rangeOf(editor, "cono").to);
    const word = writerSelectionOffer(editor.state.doc, rangeOf(editor, "conozco").from, rangeOf(editor, "conozco").to);
    editor.destroy();
    expect(partial).toMatchObject({ rewrite: true, context: true, length: "short", secondary: null, rememberLabel: "Recordar" });
    expect(word).toMatchObject({ rewrite: true, length: "short", secondary: null, rememberLabel: "Recordar" });
  });

  it("offers expand for a phrase and shorten for a long passage, never both", () => {
    const editor = screenplay([{ type: "paragraph", text: "hola mundo" }]);
    const short = writerSelectionOffer(editor.state.doc, rangeOf(editor, "hola mundo").from, rangeOf(editor, "hola mundo").to);
    editor.destroy();
    expect(short).toMatchObject({ rewrite: true, length: "normal", secondary: "expand" });

    const sentence = "¿qué hace usted?";
    const phrase = screenplay([
      { type: "character", text: "JUAN" },
      { type: "dialogue", text: sentence },
      { type: "character", text: "POLICÍA" },
      { type: "dialogue", text: "Más bien..." },
    ]);
    const range = rangeOf(phrase, sentence);
    const before = phrase.state.doc.textBetween(range.from, range.to);
    const phraseOffer = writerSelectionOffer(phrase.state.doc, range.from, range.to);
    expect(phrase.state.doc.textBetween(range.from, range.to)).toBe(before);
    expect(phraseOffer).toMatchObject({ rewrite: true, secondary: "expand", rememberLabel: "Recordar" });
    phrase.destroy();

    const paragraph = "Ana camina despacio por el pasillo oscuro de la casa vieja y no dice nada en absoluto mientras la lluvia golpea la ventana.";
    const long = screenplay([{ type: "paragraph", text: paragraph }]);
    const longOffer = writerSelectionOffer(long.state.doc, rangeOf(long, paragraph).from, rangeOf(long, paragraph).to);
    long.destroy();
    expect(longOffer.secondary).toBe("shorten");
  });

  it("changes the rewrite variants for dialogue, action, a name and a location", () => {
    const editor = screenplay([
      { type: "sceneHeading", text: "INT. CASA - DÍA" },
      { type: "action", text: "Ana abre la puerta." },
      { type: "character", text: "ANA" },
      { type: "dialogue", text: "No pienso volver allí esta noche." },
    ]);
    const heading = rangeOf(editor, "INT. CASA - DÍA");
    const action = rangeOf(editor, "Ana abre la puerta.");
    const name = rangeOf(editor, "ANA");
    const dialogue = rangeOf(editor, "No pienso volver allí esta noche.");
    expect(writerSelectionOffer(editor.state.doc, heading.from, heading.to)).toMatchObject({
      rewrite: true,
      rememberLabel: "Recordar",
    });
    const actionOffer = writerSelectionOffer(editor.state.doc, action.from, action.to);
    expect(actionOffer).toMatchObject({ rewrite: true, secondary: "expand", rememberLabel: "Recordar" });
    expect(writerSelectionOffer(editor.state.doc, name.from, name.to)).toMatchObject({
      rewrite: true,
      secondary: null,
      rememberLabel: "Añadir sobre Ana",
      entityLabel: "Ana",
      prompt: "¿Qué quieres recordar sobre Ana?",
      scope: { type: "entity", entityId: "ana" },
    });
    const dialogueOffer = writerSelectionOffer(editor.state.doc, dialogue.from, dialogue.to);
    expect(dialogueOffer.rememberLabel).toBe("Recordar");
    expect(dialogueOffer.scope).toEqual({ type: "entity", entityId: "ana" });
    expect(dialogueOffer.secondary).toBe("expand");
    editor.destroy();
  });

  it("asks where to keep a note only when two subjects are named", () => {
    const editor = screenplay([
      { type: "character", text: "ANA" },
      { type: "character", text: "JUAN" },
      { type: "action", text: "Ana mira a Juan." },
    ]);
    const offer = writerSelectionOffer(editor.state.doc, rangeOf(editor, "Ana mira a Juan.").from, rangeOf(editor, "Ana mira a Juan.").to);
    editor.destroy();
    expect(offer.askScope).toBe(true);
    expect(offer.scope).toEqual({ type: "global" });
  });

  it("maps rewrite variants onto the existing assist actions", () => {
    expect(writerRewriteRequest("improve")).toEqual({ action: "rewrite" });
    expect(writerRewriteRequest("natural")).toEqual({ action: "rewrite", intent: "natural" });
    expect(writerRewriteRequest("visual")).toEqual({ action: "rewrite", intent: "visual" });
    expect(writerRewriteRequest("expand")).toEqual({ action: "expand" });
    expect(writerRewriteRequest("shorten")).toEqual({ action: "shorten" });
    expect(writerRewriteRequest("brief")).toEqual({ action: "shorten", intent: "brief" });
  });

  it("reports bold and italic from the selection itself", () => {
    const editor = screenplay([{ type: "action", text: "conozco" }]);
    const range = rangeOf(editor, "conozco");
    editor.commands.setTextSelection(range);
    expect(editor.isActive("bold")).toBe(false);
    expect(editor.isActive("italic")).toBe(false);
    editor.commands.toggleBold();
    expect(editor.isActive("bold")).toBe(true);
    editor.commands.toggleItalic();
    expect(editor.isActive("italic")).toBe(true);
    editor.destroy();
  });
});
