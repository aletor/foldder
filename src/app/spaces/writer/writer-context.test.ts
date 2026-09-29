import { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { WriterBlockId, listWriterTrackedBlocks, writerBlockTextHash, writerDirtyBlocks } from "./writer-block-id";
import { WriterChapter, WriterChapterTitle } from "./writer-chapter";
import { createWriterStarterKit, writerScreenplayNodes } from "./writer-screenplay";
import { buildWriterContextPackage, searchWriterMemory } from "./writer-retrieval";
import { writerBrandSnippet } from "./writer-brain";
import type { WriterMemoryEntry } from "./writer-memory";

const memory: WriterMemoryEntry[] = [
  { id: "1", kind: "canon", text: "Marta no entra en hospitales desde la muerte de su hermano." },
  { id: "2", kind: "idea", text: "Marta podría saber tocar el piano." },
  { id: "3", kind: "canon", text: "David tiene 52 años y vive en París." },
];

describe("writer local context", () => {
  it("gives each text block a stable id and skips an unchanged hash", () => {
    const editor = new Editor({
      extensions: [createWriterStarterKit(), WriterBlockId, WriterChapter, WriterChapterTitle, ...writerScreenplayNodes],
      content: {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Marta entra." }] }],
      },
    });
    editor.commands.insertContent(" Otra frase.");
    const blocks = listWriterTrackedBlocks(editor.state.doc);
    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks[0]?.blockId).toBeTruthy();
    expect(writerDirtyBlocks(blocks, {})).toHaveLength(blocks.filter((block) => block.text).length);
    expect(writerDirtyBlocks(blocks, { [blocks[0]!.blockId]: blocks[0]!.hash })).not.toContainEqual(
      expect.objectContaining({ blockId: blocks[0]!.blockId }),
    );
    expect(writerBlockTextHash("Marta entra.")).toBe(writerBlockTextHash("Marta entra."));
    editor.destroy();
  });

  it("retrieves the canon about Marta and leaves David out", () => {
    const editor = new Editor({
      extensions: [createWriterStarterKit(), WriterBlockId],
      content: {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Marta entra en el hospital." }] }],
      },
    });
    const pack = buildWriterContextPackage(editor, { profile: "document", memory, brain: "Voz cercana" });
    expect(pack.memories.map((entry) => entry.id)).toEqual(["1", "2"]);
    expect(pack.line).toContain("Marta");
    expect(pack.line).toContain("2 recuerdos");
    expect(pack.brain).toBe("Voz cercana");
    expect(searchWriterMemory(memory, "hospitales").map((entry) => entry.id)).toEqual(["1"]);
    expect(searchWriterMemory(memory, "París").map((entry) => entry.id)).toEqual(["3"]);
    expect(searchWriterMemory(memory, "")).toHaveLength(3);
    editor.destroy();
  });

  it("reads a brand snippet without turning it into document canon", () => {
    const snippet = writerBrandSnippet({
      brandKit: {
        brandName: { value: "Alima" },
        slots: {
          voice: { value: { summary: "Cercana y precisa", rules: ["Tutear"], avoid: ["gritar"] } },
        },
      },
    });
    expect(snippet).toContain("Alima");
    expect(snippet).toContain("Cercana y precisa");
    expect(snippet).toContain("Evitar: gritar");
    expect(writerBrandSnippet(null)).toBe("");
  });
});
