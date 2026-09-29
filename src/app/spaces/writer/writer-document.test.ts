import { describe, expect, it } from "vitest";
import {
  deriveWriterOutputs,
  emptyWriterContent,
  markdownFromWriterContent,
  normalizeWriterNodeData,
  plainTextFromWriterContent,
  wordCountFromWriterContent,
  writerChapterMap,
  writerNeedsRemoteLoad,
  writerPageMetrics,
  writerPersistedPatch,
} from "./writer-document";

describe("writer document", () => {
  it("starts as an empty paragraph", () => {
    const content = emptyWriterContent();
    expect(plainTextFromWriterContent(content)).toBe("");
    expect(wordCountFromWriterContent(content)).toBe(0);
    expect(markdownFromWriterContent(content)).toBe("");
  });

  it("derives plain text and markdown from the tree", () => {
    const content = {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1 },
          content: [{ type: "text", text: "Título" }],
        },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Una " },
            { type: "text", text: "frase", marks: [{ type: "bold" }, { type: "italic" }] },
            { type: "text", text: " corta." },
          ],
        },
        {
          type: "bulletList",
          content: [
            { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Uno" }] }] },
            { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Dos" }] }] },
          ],
        },
      ],
    };
    expect(plainTextFromWriterContent(content)).toBe("Título\n\nUna frase corta.\n\nUno\nDos");
    expect(markdownFromWriterContent(content)).toBe("# Título\n\nUna ***frase*** corta.\n\n- Uno\n- Dos");
    expect(wordCountFromWriterContent(content)).toBe(6);
  });

  it("normalizes missing or invalid node data", () => {
    const empty = normalizeWriterNodeData(undefined);
    expect(empty.profile).toBe("document");
    expect(empty.pagePreset).toBe("a4");
    expect(empty.content).toBeNull();
    expect(empty.documentId).toBeNull();
    expect(empty.label).toBe("Writer");

    const repaired = normalizeWriterNodeData({
      title: "Nota",
      profile: "campaign",
      content: { type: "paragraph" },
      value: "stale",
    });
    expect(repaired.title).toBe("Nota");
    expect(repaired.profile).toBe("document");
    expect(repaired.content).toBeNull();
    expect(repaired.value).toBe("stale");
    expect(deriveWriterOutputs(emptyWriterContent()).wordCount).toBe(0);
  });

  it("keeps the derived text on the node and loads the tree from its file", () => {
    const documentId = "11111111-1111-4111-8111-111111111111";
    const stored = normalizeWriterNodeData({
      documentId,
      documentKey: "knowledge-files/user-assets/abc/writer-documents/doc.json",
      value: "Hola mundo",
      promptValue: "Hola mundo",
      wordCount: 2,
      content: null,
    });
    expect(stored.content).toBeNull();
    expect(stored.value).toBe("Hola mundo");
    expect(stored.wordCount).toBe(2);
    expect(writerNeedsRemoteLoad(stored)).toBe(true);

    const inline = normalizeWriterNodeData({
      documentId,
      content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Recuperado" }] }] },
      value: "viejo",
    });
    expect(inline.value).toBe("Recuperado");
    expect(writerNeedsRemoteLoad(inline)).toBe(false);

    const patch = writerPersistedPatch({
      title: "Nota",
      profile: "article",
      pagePreset: "letter",
      content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hola mundo" }] }] },
      documentId,
      documentKey: "knowledge-files/user-assets/abc/writer-documents/doc.json",
    });
    expect(patch.content).toBeNull();
    expect(patch.pagePreset).toBe("letter");
    expect(patch.value).toBe("Hola mundo");
    expect(patch.documentId).toBe(documentId);
  });

  it("sizes the sheet without splitting the document", () => {
    expect(writerPageMetrics("a4", "post").width).toBe(writerPageMetrics("a4", "document").width);
    expect(writerPageMetrics("a4", "document").minHeight).toBe("1123px");
    expect(writerPageMetrics("screen", "post").width).not.toBe(writerPageMetrics("screen", "document").width);
    expect(writerPageMetrics("letter", "article").width).toBe("816px");
  });

  it("treats a chapter as one subtree and lists only those blocks", () => {
    const content = {
      type: "doc" as const,
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Antes" }] },
        {
          type: "chapter",
          attrs: { id: "ch-1" },
          content: [
            { type: "chapterTitle", content: [{ type: "text", text: "El bosque" }] },
            { type: "paragraph", content: [{ type: "text", text: "Llovía." }] },
          ],
        },
      ],
    };
    expect(writerChapterMap(content)).toEqual([{ id: "ch-1", title: "El bosque" }]);
    expect(markdownFromWriterContent(content)).toBe("Antes\n\n# El bosque\n\nLlovía.");
    expect(plainTextFromWriterContent(content)).toBe("Antes\n\nEl bosque\n\nLlovía.");
    const patch = writerPersistedPatch({
      title: "Libro",
      profile: "document",
      pagePreset: "a4",
      content,
      documentId: "33333333-3333-4333-8333-333333333333",
      documentKey: "",
    });
    expect(patch.chapterCount).toBe(1);
    expect(patch.content).toBeNull();
  });

  it("prints a screenplay without manual spacing", () => {
    const content = {
      type: "doc" as const,
      content: [
        { type: "sceneHeading", content: [{ type: "text", text: "int. casa - día" }] },
        { type: "action", content: [{ type: "text", text: "María entra." }] },
        { type: "character", content: [{ type: "text", text: "María" }] },
        { type: "parenthetical", content: [{ type: "text", text: "bajo" }] },
        { type: "dialogue", content: [{ type: "text", text: "Hola." }] },
        { type: "transition", content: [{ type: "text", text: "corte a:" }] },
      ],
    };
    const printed = ["INT. CASA - DÍA", "María entra.", "MARÍA", "(bajo)", "Hola.", "CORTE A:"].join("\n\n");
    expect(markdownFromWriterContent(content)).toBe(printed);
    expect(plainTextFromWriterContent(content)).toBe(printed);
    expect(normalizeWriterNodeData({ profile: "screenplay" }).profile).toBe("screenplay");
  });
});
