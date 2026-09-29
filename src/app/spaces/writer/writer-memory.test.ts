import { describe, expect, it } from "vitest";
import { addWriterMemory, normalizeWriterMemory, setWriterMemoryKind, writerMemoryCounts } from "./writer-memory";
import { writerPersistedPatch, emptyWriterContent } from "./writer-document";

describe("writer memory", () => {
  it("keeps canon and idea apart and drops an empty note", () => {
    const first = addWriterMemory([], "canon", "  María vive en la casa  ");
    expect(first.added).toBe(true);
    expect(first.memory[0]?.kind).toBe("canon");
    expect(first.memory[0]?.text).toBe("María vive en la casa");
    const duplicate = addWriterMemory(first.memory, "canon", "María vive en la casa");
    expect(duplicate.added).toBe(false);
    const idea = addWriterMemory(first.memory, "idea", "Quizá la casa está vacía");
    const moved = setWriterMemoryKind(idea.memory, idea.memory[0]!.id, "idea");
    expect(writerMemoryCounts(moved)).toEqual({ canonCount: 0, ideaCount: 2 });
    expect(addWriterMemory(moved, "canon", "   ").added).toBe(false);
    expect(normalizeWriterMemory([{ kind: "canon" }])).toEqual([]);
  });

  it("stores counts on the node and the list only when the file save fails", () => {
    const memory = [{ id: "1", kind: "canon" as const, text: "Es de día" }];
    const saved = writerPersistedPatch({
      title: "Escena",
      profile: "screenplay",
      pagePreset: "a4",
      content: emptyWriterContent(),
      documentId: "55555555-5555-4555-8555-555555555555",
      documentKey: "knowledge-files/user-assets/abc/writer-documents/doc.json",
      memory,
    });
    expect(saved.canonCount).toBe(1);
    expect(saved.ideaCount).toBe(0);
    expect(saved.memory).toBeNull();
    const failed = writerPersistedPatch({
      title: "Escena",
      profile: "screenplay",
      pagePreset: "a4",
      content: emptyWriterContent(),
      documentId: "55555555-5555-4555-8555-555555555555",
      documentKey: "",
      memory,
      keepContent: true,
    });
    expect(failed.memory?.[0]).toMatchObject({ id: "1", kind: "canon", status: "established", text: "Es de día" });
  });
});
