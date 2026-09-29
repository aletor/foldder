import { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { writerBlockMarks, writerConflicts } from "./writer-continuity";
import { inferWriterMemoryScope, writerAssignMemorySubject, writerEntitiesInDocument, writerEntityId, writerMemoryRepeatsEntity, writerRememberDraft } from "./writer-entities";
import { writerFactsFromMemory } from "./writer-facts";
import { createWriterMemory, normalizeWriterMemory } from "./writer-memory";
import { WriterBlockId } from "./writer-block-id";
import { createWriterStarterKit, writerScreenplayNodes } from "./writer-screenplay";

function screenplay(blocks: Array<{ type: string; text: string }>) {
  return new Editor({
    extensions: [createWriterStarterKit(), WriterBlockId, ...writerScreenplayNodes],
    content: {
      type: "doc",
      content: blocks.map((block) => ({
        type: block.type,
        attrs: { blockId: `${block.type}-${block.text.slice(0, 8)}` },
        content: block.text ? [{ type: "text", text: block.text }] : [],
      })),
    },
  });
}

describe("writer continuity", () => {
  it("treats ANA and Ana as one entity and strips a voice cue", () => {
    expect(writerEntityId("ANA")).toBe(writerEntityId("Ana"));
    expect(writerEntityId("ANA (V.O.)")).toBe("ana");
    const editor = screenplay([
      { type: "character", text: "ANA" },
      { type: "character", text: "POLICÍA" },
    ]);
    expect(writerEntitiesInDocument(editor.state.doc).map((entity) => entity.id)).toEqual(["ana", "policia"]);
    editor.destroy();
  });

  it("scopes a character cue and a following dialogue to Ana", () => {
    const editor = screenplay([
      { type: "character", text: "ANA" },
      { type: "dialogue", text: "No pienso volver allí." },
    ]);
    const doc = editor.state.doc;
    let characterFrom = 0;
    let dialogueFrom = 0;
    doc.descendants((node, pos) => {
      if (node.type.name === "character") characterFrom = pos + 1;
      if (node.type.name === "dialogue") dialogueFrom = pos + 1;
    });
    expect(inferWriterMemoryScope(doc, characterFrom, characterFrom).label).toBe("Ana");
    expect(inferWriterMemoryScope(doc, dialogueFrom, dialogueFrom).scope).toEqual({ type: "entity", entityId: "ana" });
    editor.destroy();
  });

  it("extracts reading, age and parents without a model", () => {
    const read = writerFactsFromMemory({ text: "no sabe leer", status: "established", scope: { type: "entity", entityId: "ana" } });
    expect(read).toContainEqual(expect.objectContaining({ predicate: "ability.read", value: false, subject: "ana" }));
    const age = writerFactsFromMemory({ text: "tiene 37 años", status: "established", scope: { type: "entity", entityId: "ana" } });
    expect(age).toContainEqual(expect.objectContaining({ predicate: "age", value: 37 }));
    const parents = writerFactsFromMemory({ text: "se le murieron los padres", status: "established", scope: { type: "entity", entityId: "ana" } });
    expect(parents).toContainEqual(expect.objectContaining({ predicate: "parents.alive", value: false }));
    expect(writerFactsFromMemory({ text: "quizá tenga una hermana", status: "tentative", scope: { type: "entity", entityId: "ana" } })).toEqual([]);
    expect(writerFactsFromMemory({ text: "ya estuvo en Madrid", status: "established", scope: { type: "entity", entityId: "ana" } })).toContainEqual(
      expect.objectContaining({ predicate: "experience.been", value: true, object: "madrid" }),
    );
    expect(writerFactsFromMemory({ text: "no tiene coche", status: "established", scope: { type: "entity", entityId: "ana" } })).toContainEqual(
      expect.objectContaining({ predicate: "possession", value: false, object: "coche" }),
    );
    expect(writerFactsFromMemory({ text: "no sabe que su hermano vive", status: "established", scope: { type: "entity", entityId: "ana" } })).toContainEqual(
      expect.objectContaining({ predicate: "knowledge", value: false, object: "hermano-vive" }),
    );
    expect(writerFactsFromMemory({ text: "está en París", status: "established", scope: { type: "entity", entityId: "ana" } })).toContainEqual(
      expect.objectContaining({ predicate: "location.at", value: "paris" }),
    );
  });

  it("warns when Ana says she read after memory says she cannot", () => {
    const editor = screenplay([
      { type: "character", text: "ANA" },
      { type: "dialogue", text: "pues lo leí ayer y nadie me dijo nada." },
    ]);
    const created = createWriterMemory([], { text: "no sabe leer", scope: { type: "entity", entityId: "ana" } });
    const conflicts = writerConflicts(editor.state.doc, created.memory, []);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.memoryText).toBe("no sabe leer");
    expect(conflicts[0]?.here).toContain("leí");
    expect(conflicts[0]?.entityLabel).toBe("Ana");
    const marks = writerBlockMarks(editor.state.doc, created.memory, [conflicts[0]!.key]);
    expect(marks.some((mark) => mark.kind === "conflict")).toBe(false);
    editor.destroy();
  });

  it("does not warn on a third person verb or on Juan", () => {
    const editor = screenplay([
      { type: "character", text: "ANA" },
      { type: "dialogue", text: "Leyó el cartel." },
    ]);
    const ana = createWriterMemory([], { text: "no sabe leer", scope: { type: "entity", entityId: "ana" } });
    expect(writerConflicts(editor.state.doc, ana.memory, [])).toEqual([]);
    const juan = createWriterMemory([], { text: "no sabe leer", scope: { type: "entity", entityId: "juan" } });
    const reading = screenplay([
      { type: "character", text: "ANA" },
      { type: "dialogue", text: "pues lo leí ayer." },
    ]);
    expect(writerConflicts(reading.state.doc, juan.memory, [])).toEqual([]);
    editor.destroy();
    reading.destroy();
  });

  it("warns when Ana says she has never been where memory says she already was", () => {
    const editor = screenplay([
      { type: "character", text: "ANA" },
      { type: "dialogue", text: "Nunca he estado en Madrid." },
    ]);
    const created = createWriterMemory([], { text: "ya estuvo en Madrid", scope: { type: "entity", entityId: "ana" } });
    const conflicts = writerConflicts(editor.state.doc, created.memory, []);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.here).toContain("Madrid");
    editor.destroy();
  });

  it("reads an old canon note as established and global", () => {
    const memory = normalizeWriterMemory([{ id: "old", kind: "canon", text: "Es de día" }]);
    expect(memory[0]).toMatchObject({ kind: "canon", status: "established", text: "Es de día" });
    expect(memory[0]?.scope).toBeUndefined();
  });

  it("opens an empty note about Ana when the selection is only her name", () => {
    const editor = screenplay([{ type: "character", text: "ANA" }]);
    const doc = editor.state.doc;
    let from = 0;
    let to = 0;
    doc.descendants((node, pos) => {
      if (node.type.name !== "character") return;
      from = pos + 1;
      to = pos + 1 + node.content.size;
    });
    const draft = writerRememberDraft(doc, from, to);
    expect(draft.scope).toEqual({ type: "entity", entityId: "ana" });
    expect(draft.text).toBe("");
    expect(draft.placeholder).toBe("¿Qué quieres recordar sobre Ana?");
    const saved = writerAssignMemorySubject("se le murieron los padres", writerEntitiesInDocument(doc), draft.scope);
    expect(saved).toEqual({ text: "se le murieron los padres", scope: { type: "entity", entityId: "ana" } });
    expect(writerAssignMemorySubject("Ana", writerEntitiesInDocument(doc), draft.scope)).toBeNull();
    editor.destroy();
  });

  it("fills the composer with dialogue and leaves a bare cursor empty", () => {
    const editor = screenplay([
      { type: "character", text: "ANA" },
      { type: "dialogue", text: "No pienso volver allí." },
    ]);
    const doc = editor.state.doc;
    let dialogueFrom = 0;
    let dialogueTo = 0;
    doc.descendants((node, pos) => {
      if (node.type.name !== "dialogue") return;
      dialogueFrom = pos + 1;
      dialogueTo = pos + 1 + node.content.size;
    });
    const selected = writerRememberDraft(doc, dialogueFrom, dialogueTo);
    expect(selected.scope).toEqual({ type: "entity", entityId: "ana" });
    expect(selected.text).toBe("No pienso volver allí.");
    const cursor = writerRememberDraft(doc, dialogueFrom, dialogueFrom);
    expect(cursor.scope).toEqual({ type: "entity", entityId: "ana" });
    expect(cursor.text).toBe("");
    expect(cursor.placeholder).toBe("¿Qué quieres recordar sobre Ana?");
    editor.destroy();
  });

  it("scopes a general note that starts with a known name", () => {
    const editor = screenplay([
      { type: "character", text: "ANA" },
      { type: "character", text: "JUAN" },
    ]);
    const entities = writerEntitiesInDocument(editor.state.doc);
    expect(writerAssignMemorySubject("ana no sabe leer", entities, { type: "global" })).toEqual({
      text: "no sabe leer",
      scope: { type: "entity", entityId: "ana" },
    });
    expect(writerAssignMemorySubject("Ana y Juan se fueron", entities, { type: "global" })).toEqual({
      text: "Ana y Juan se fueron",
      scope: { type: "global" },
    });
    expect(writerMemoryRepeatsEntity({ text: "Ana", scope: { type: "entity", entityId: "ana" } }, entities)).toBe(true);
    expect(writerMemoryRepeatsEntity({ text: "no sabe leer", scope: { type: "entity", entityId: "ana" } }, entities)).toBe(false);
    editor.destroy();
  });

  it("warns when Ana says she passed an exam memory says she failed", () => {
    const editor = screenplay([
      { type: "character", text: "ANA" },
      { type: "dialogue", text: "cuando aprobé selectividad se me abrió un nuevo mundo" },
    ]);
    const created = createWriterMemory([], { text: "suspendió selectividad", scope: { type: "entity", entityId: "ana" } });
    const conflicts = writerConflicts(editor.state.doc, created.memory, []);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.here).toContain("aprobé");
    editor.destroy();
  });

  it("does not mark an unrelated line and does mark a cemetery idea", () => {
    const unrelated = screenplay([
      { type: "character", text: "ANA" },
      { type: "dialogue", text: "hoy quiero un café." },
    ]);
    const parents = createWriterMemory([], { text: "sus padres murieron", scope: { type: "entity", entityId: "ana" } });
    expect(writerBlockMarks(unrelated.state.doc, parents.memory, []).some((mark) => mark.kind === "memory")).toBe(false);
    unrelated.destroy();
    const cemetery = screenplay([
      { type: "character", text: "ANA" },
      { type: "action", text: "Ana camina por el cementerio." },
    ]);
    const idea = createWriterMemory([], { text: "podría visitar la tumba de sus padres", scope: { type: "entity", entityId: "ana" } });
    const marks = writerBlockMarks(cemetery.state.doc, idea.memory, []);
    expect(marks.some((mark) => mark.kind === "memory" && mark.related?.idea)).toBe(true);
    cemetery.destroy();
  });
});
