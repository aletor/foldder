import { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { cleanWriterAiProposal, parseWriterAiRequest, writerAiMessages } from "./writer-ai";
import {
  insertWriterAiProposal,
  writerAiProposalIsCurrent,
  writerAiRequestFromEditor,
  type WriterAiProposal,
} from "./writer-ai-edit";
import { createWriterStarterKit } from "./writer-screenplay";

function editorWith(text: string) {
  const editor = new Editor({
    extensions: [createWriterStarterKit()],
    content: {
      type: "doc",
      content: [{ type: "paragraph", content: text ? [{ type: "text", text }] : [] }],
    },
  });
  editor.commands.setTextSelection(text ? text.length + 1 : 1);
  return editor;
}

describe("writer ai proposal", () => {
  it("rejects a rewrite without a selection and a fragment that is too long", () => {
    expect(parseWriterAiRequest({ action: "rewrite", profile: "document", selection: "  " }).error).toMatch(/fragmento/i);
    expect(parseWriterAiRequest({ action: "rewrite", profile: "document", selection: "a".repeat(8001) }).status).toBe(413);
    const parsed = parseWriterAiRequest({
      action: "continue",
      profile: "screenplay",
      before: "María entra.",
      after: "",
      selection: "",
    });
    expect("action" in parsed && parsed.action).toBe("continue");
  });

  it("asks for a continuation without repeating the page", () => {
    const messages = writerAiMessages({
      action: "continue",
      profile: "screenplay",
      before: "María entra.",
      after: "",
      selection: "",
    });
    expect(messages.system).toContain("No repitas");
    expect(messages.system).toContain("guion");
    expect(messages.user).toContain("María entra.");
    expect(cleanWriterAiProposal('"Hola."\n')).toBe("Hola.");
    expect(cleanWriterAiProposal(" otra\n")).toBe(" otra");
  });

  it("passes canon and brand into the prompt without asking to paste them", () => {
    const messages = writerAiMessages({
      action: "continue",
      profile: "document",
      before: "Marta entra.",
      after: "",
      selection: "",
      context: {
        memories: [{ kind: "canon", text: "Marta no entra en hospitales desde la muerte de su hermano." }],
        brain: "Voz cercana",
        chapter: "El hospital",
        line: "Marta · 1 recuerdo",
      },
    });
    expect(messages.system).toContain("no lo contradigas");
    expect(messages.system).toContain("No copies las notas");
    expect(messages.user).toContain("Marta no entra en hospitales");
    expect(messages.user).toContain("Voz cercana");
    expect(messages.user).toContain("El hospital");
  });

  it("inserts a continuation only while the cursor is still there", () => {
    const editor = editorWith("Hola mundo");
    const built = writerAiRequestFromEditor(editor, "continue", "document");
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const proposal: WriterAiProposal = { ...built.proposal, text: " otra vez" };
    expect(writerAiProposalIsCurrent(editor.state.doc, proposal)).toBe(true);
    expect(insertWriterAiProposal(editor, proposal)).toBe(true);
    expect(editor.getText()).toContain("Hola mundo otra vez");
    editor.destroy();
  });

  it("replaces only the selected words", () => {
    const editor = editorWith("Hola mundo");
    editor.commands.setTextSelection({ from: 6, to: 11 });
    const built = writerAiRequestFromEditor(editor, "rewrite", "article");
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.request.selection).toBe("mundo");
    expect(insertWriterAiProposal(editor, { ...built.proposal, text: "tarde" })).toBe(true);
    expect(editor.getText()).toBe("Hola tarde");
    editor.destroy();
  });

  it("replaces a selection whose anchor crosses the previous block", () => {
    const editor = new Editor({
      extensions: [createWriterStarterKit()],
      content: {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "Esta frase anterior es bastante larga para cruzar el ancla del bloque." }] },
          { type: "paragraph", content: [{ type: "text", text: "Pedro mira la ventana." }] },
        ],
      },
    });
    let from = 0;
    let to = 0;
    editor.state.doc.descendants((node, pos) => {
      if (!node.isText || from) return;
      const index = node.text?.indexOf("ventana") ?? -1;
      if (index < 0) return;
      from = pos + index;
      to = from + "ventana".length;
    });
    editor.commands.setTextSelection({ from, to });
    const built = writerAiRequestFromEditor(editor, "rewrite", "document");
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const proposal: WriterAiProposal = { ...built.proposal, text: "puerta" };
    expect(writerAiProposalIsCurrent(editor.state.doc, proposal)).toBe(true);
    expect(insertWriterAiProposal(editor, proposal)).toBe(true);
    expect(editor.getText()).toContain("Pedro mira la puerta.");
    editor.destroy();
  });

  it("refuses to apply a proposal after the sentence changed", () => {
    const editor = editorWith("Hola mundo");
    const built = writerAiRequestFromEditor(editor, "continue", "document");
    if (!built.ok) throw new Error(built.error);
    const proposal: WriterAiProposal = { ...built.proposal, text: " otra" };
    editor.commands.insertContent("X");
    expect(writerAiProposalIsCurrent(editor.state.doc, proposal)).toBe(false);
    expect(editor.getText()).toBe("Hola mundoX");
    editor.destroy();
  });
});
