import { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { WriterBlockId } from "./writer-block-id";
import { writerConflicts } from "./writer-continuity";
import { writerEntityId } from "./writer-entities";
import { createWriterStarterKit, writerScreenplayNodes } from "./writer-screenplay";
import {
  absorbDocumentCues,
  addStoryEntityNote,
  captureWriterWritePlace,
  createStoryEntity,
  emptyWriterStory,
  findStoryEntityByCue,
  migrateMemoryToStory,
  normalizeStory,
  partitionStoryDelta,
  projectWriterMemory,
  rememberStoryNote,
  renameStoryEntity,
  restoreWriterWritePlace,
  setStoryDefinition,
  storyFreshContext,
  storyStableContext,
} from "./writer-story";

describe("writer story", () => {
  it("keeps every note from a v1 file, including those past the old cap", () => {
    const memory = Array.from({ length: 100 }, (_, index) => ({
      id: `note-${index}`,
      kind: index % 5 === 0 ? "idea" : "canon",
      text: `Nota ${index} sobre el faro`,
      ...(index % 2 === 0 ? { scope: { type: "entity" as const, entityId: "ana" } } : {}),
    }));
    const story = migrateMemoryToStory(memory);
    const projected = projectWriterMemory(story);
    expect(projected).toHaveLength(100);
    expect(projected.map((entry) => entry.id)).toEqual(memory.map((entry) => entry.id));
    expect(projected.find((entry) => entry.id === "note-90")?.text).toBe("Nota 90 sobre el faro");
    const ana = story.entities.find((entity) => writerEntityId(entity.label) === "ana");
    expect(ana?.id).not.toBe("ana");
    expect(projected.find((entry) => entry.id === "note-0")?.scope).toEqual({ type: "entity", entityId: "ana" });
    expect(projected.find((entry) => entry.id === "note-1")?.scope).toBeUndefined();
  });

  it("keeps the same entity when the label changes", () => {
    const created = createStoryEntity(emptyWriterStory(), { label: "Pedro", group: "character" });
    const id = created.entity?.id ?? "";
    const defined = setStoryDefinition(created.story, id, "Lleva el abrigo de su padre.");
    const noted = addStoryEntityNote(defined, id, "No entra en el puerto de noche.");
    const renamed = renameStoryEntity(noted.story, id, "María");
    const entity = renamed.entities.find((item) => item.id === id);
    expect(entity?.label).toBe("María");
    expect(entity?.definition).toBe("Lleva el abrigo de su padre.");
    expect(entity?.notes.map((note) => note.text)).toEqual(["No entra en el puerto de noche."]);
    expect(findStoryEntityByCue(renamed, "PEDRO", "character")?.id).toBe(id);
    const projected = projectWriterMemory(renamed, ["pedro"]);
    expect(projected[0]?.scope).toEqual({ type: "entity", entityId: "pedro" });
  });

  it("reuses Pedro when the script later writes PEDRO", () => {
    const created = createStoryEntity(emptyWriterStory(), { label: "Pedro", group: "character" });
    const absorbed = absorbDocumentCues(created.story, [{ id: "pedro", label: "Pedro" }]);
    expect(absorbed.entities.filter((entity) => entity.group === "character")).toHaveLength(1);
    expect(findStoryEntityByCue(absorbed, "PEDRO", "character")?.id).toBe(created.entity?.id);
    const again = createStoryEntity(absorbed, { label: "Pedro", group: "character" });
    expect(again.story.entities).toHaveLength(1);
    expect(again.entity?.id).toBe(created.entity?.id);
  });

  it("keeps definition and notes through a save and reload", () => {
    const created = createStoryEntity(emptyWriterStory(), { label: "La casa", group: "story" });
    const id = created.entity?.id ?? "";
    const noted = addStoryEntityNote(setStoryDefinition(created.story, id, "Está al final del camino."), id, "La llave sigue bajo la maceta.");
    const restored = normalizeStory(JSON.parse(JSON.stringify(noted.story)));
    expect(restored?.entities[0]).toMatchObject({
      id,
      label: "La casa",
      definition: "Está al final del camino.",
      stateSummary: null,
      traceSummary: null,
    });
    expect(restored?.entities[0]?.notes[0]?.text).toBe("La llave sigue bajo la maceta.");
    expect(restored?.entities[0]?.notes[0]?.text.length).toBeGreaterThan(0);
  });

  it("does not cut a long note down to the old text cap", () => {
    const text = "a".repeat(900);
    const created = createStoryEntity(emptyWriterStory(), { label: "Ana", group: "character" });
    const noted = addStoryEntityNote(created.story, created.entity?.id ?? "", text);
    expect(projectWriterMemory(noted.story)[0]?.text).toHaveLength(900);
  });

  it("projects remembered notes so continuity still reads them", () => {
    const editor = new Editor({
      extensions: [createWriterStarterKit(), WriterBlockId, ...writerScreenplayNodes],
      content: {
        type: "doc",
        content: [
          { type: "character", attrs: { blockId: "cue-ana" }, content: [{ type: "text", text: "ANA" }] },
          { type: "dialogue", attrs: { blockId: "line-ana" }, content: [{ type: "text", text: "pues lo leí ayer." }] },
        ],
      },
    });
    const remembered = rememberStoryNote(emptyWriterStory(), {
      text: "no sabe leer",
      scope: { type: "entity", entityId: "ana" },
      cues: [{ id: "ana", label: "Ana" }],
    });
    const projected = projectWriterMemory(remembered.story, ["ana"]);
    expect(writerConflicts(editor.state.doc, projected, [])).toHaveLength(1);
    editor.destroy();
  });

  it("separates a document-backed update from an interpretation", () => {
    const entity = createStoryEntity(emptyWriterStory(), { label: "Ana", group: "character" }).entity;
    const stable = storyStableContext(entity!);
    const fresh = storyFreshContext([{ blockId: "b1", text: "Ana salta.", hash: "h1" }, { blockId: "", text: "vacío", hash: "h2" }]);
    expect(stable.stateSummary).toBeNull();
    expect(stable.traceSummary).toBeNull();
    expect(fresh.blocks).toEqual([{ blockId: "b1", text: "Ana salta.", hash: "h1" }]);
    const delta = partitionStoryDelta({
      updates: [
        { kind: "event", entityId: entity?.id, text: "Ana salta del barco.", blockId: "b1", authority: "text" },
        { kind: "state", entityId: entity?.id, text: "Ana ya no confía en nadie.", authority: "ai" },
      ],
      insights: [{ text: "Parece que el puerto es una herida." }],
    });
    expect(delta.updates).toEqual([{ kind: "event", entityId: entity?.id, text: "Ana salta del barco.", blockId: "b1" }]);
    expect(delta.insights.map((item) => item.text)).toEqual(["Parece que el puerto es una herida.", "Ana ya no confía en nadie."]);
  });

  it("restores the selection and the page scroll exactly", () => {
    const editor = new Editor({
      extensions: [createWriterStarterKit()],
      content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "El faro sigue encendido." }] }] },
    });
    editor.commands.setTextSelection({ from: 4, to: 9 });
    const page = { scrollTop: 0 };
    const place = captureWriterWritePlace(editor.state.selection, 240);
    editor.commands.setTextSelection(1);
    restoreWriterWritePlace(editor, page, place);
    expect(editor.state.selection.from).toBe(4);
    expect(editor.state.selection.to).toBe(9);
    expect(page.scrollTop).toBe(240);
    editor.destroy();
  });
});
