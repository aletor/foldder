import { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { WriterBlockId } from "./writer-block-id";
import { WriterChapter, WriterChapterTitle } from "./writer-chapter";
import {
  characterLinkFixes,
  locateStoryAppearance,
  storyEntitySearchText,
  writerAppearances,
} from "./writer-appearances";
import { createWriterStarterKit, writerScreenplayNodes } from "./writer-screenplay";
import { createStoryEntity, emptyWriterStory, normalizeStory, removeStoryEntity, renameStoryEntity, setStoryDefinition, addStoryEntityNote, type WriterStory } from "./writer-story";

function script(content: Record<string, unknown>) {
  return new Editor({
    extensions: [createWriterStarterKit(), WriterBlockId, WriterChapter, WriterChapterTitle, ...writerScreenplayNodes],
    content,
  });
}

function pedro() {
  const created = createStoryEntity(emptyWriterStory(), { label: "Pedro", group: "character" });
  return { story: created.story, id: created.entity?.id ?? "" };
}

describe("writer appearances", () => {
  it("counts a character cue and an explicit mention, and ignores a longer name", () => {
    const { story, id } = pedro();
    const editor = script({
      type: "doc",
      content: [
        {
          type: "chapter",
          attrs: { id: "ch-1" },
          content: [
            { type: "chapterTitle", attrs: { blockId: "title-1" } },
            { type: "sceneHeading", attrs: { blockId: "scene-1" }, content: [{ type: "text", text: "INT. BAR – NOCHE" }] },
            { type: "character", attrs: { blockId: "cue-pedro" }, content: [{ type: "text", text: "PEDRO" }] },
            { type: "action", attrs: { blockId: "act-pedro" }, content: [{ type: "text", text: "Pedro entra en la habitación." }] },
            { type: "action", attrs: { blockId: "act-full" }, content: [{ type: "text", text: "Pedro Martín espera fuera." }] },
          ],
        },
      ],
    });
    const index = writerAppearances(editor.state.doc, story);
    const own = index.appearances.filter((item) => item.entityId === id);
    expect(own.map((item) => item.blockId)).toEqual(["cue-pedro", "act-pedro"]);
    expect(own[0]).toMatchObject({ chapterId: "ch-1", chapterLabel: "CAP. 1", scene: "INT. BAR – NOCHE", snippet: "PEDRO" });
    expect(own[1]?.snippet).toBe("Pedro entra en la habitación.");
    expect(index.appearances.some((item) => item.blockId === "act-full")).toBe(false);
    expect(story.entities[0]?.events).toEqual([]);
    const place = locateStoryAppearance(editor.state.doc, story, id, "act-pedro");
    expect(place?.from).toBe(own[1]?.from);
    expect(editor.state.doc.resolve(place?.focusFrom ?? 0).parent.isTextblock).toBe(true);
    expect(editor.state.doc.resolve(place?.focusTo ?? 0).parent.isTextblock).toBe(true);
    editor.commands.deleteRange({ from: place?.from ?? 0, to: place?.to ?? 0 });
    expect(writerAppearances(editor.state.doc, story).appearances.some((item) => item.blockId === "act-pedro")).toBe(false);
    expect(locateStoryAppearance(editor.state.doc, story, id, "act-pedro")).toBeNull();
    editor.destroy();
  });

  it("keeps the same appearances after the label changes", () => {
    const { story, id } = pedro();
    const defined = addStoryEntityNote(setStoryDefinition(story, id, "Guarda el faro."), id, "No habla del accidente.").story;
    const renamed = renameStoryEntity(defined, id, "Pedro Martín");
    const editor = script({
      type: "doc",
      content: [{ type: "character", attrs: { blockId: "cue-pedro" }, content: [{ type: "text", text: "PEDRO" }] }],
    });
    const own = writerAppearances(editor.state.doc, renamed).appearances;
    expect(own).toHaveLength(1);
    expect(own[0]?.entityId).toBe(id);
    expect(renamed.entities[0]).toMatchObject({ id, label: "Pedro Martín", definition: "Guarda el faro." });
    expect(renamed.entities[0]?.notes.map((note) => note.text)).toEqual(["No habla del accidente."]);
    expect(storyEntitySearchText(renamed.entities[0]!, own)).toContain("PEDRO");
    editor.destroy();
  });

  it("does not mix two entities that share an alias", () => {
    const first = createStoryEntity(emptyWriterStory(), { label: "Pedro", group: "character" });
    const second = createStoryEntity(first.story, { label: "Ana", group: "character" });
    const ana = second.entity;
    const story: WriterStory = {
      ...second.story,
      entities: second.story.entities.map((entity) => (entity.id === ana?.id ? { ...entity, aliases: [...entity.aliases, "Pedro"] } : entity)),
    };
    const editor = script({
      type: "doc",
      content: [
        { type: "character", attrs: { blockId: "cue" }, content: [{ type: "text", text: "PEDRO" }] },
        { type: "action", attrs: { blockId: "act" }, content: [{ type: "text", text: "Pedro entra." }] },
      ],
    });
    const index = writerAppearances(editor.state.doc, story);
    expect(index.appearances).toEqual([]);
    expect(index.ambiguous.map((item) => item.blockId).sort()).toEqual(["act", "cue"]);
    const linked = script({
      type: "doc",
      content: [
        {
          type: "character",
          attrs: { blockId: "cue", storyEntityId: first.entity?.id },
          content: [{ type: "text", text: "PEDRO" }],
        },
      ],
    });
    expect(writerAppearances(linked.state.doc, story).appearances.map((item) => item.entityId)).toEqual([first.entity?.id]);
    editor.destroy();
    linked.destroy();
  });

  it("drops a stale character link when the cue changes", () => {
    const pedroEntity = createStoryEntity(emptyWriterStory(), { label: "Pedro", group: "character" });
    const juan = createStoryEntity(pedroEntity.story, { label: "Juan", group: "character" });
    const editor = script({
      type: "doc",
      content: [
        {
          type: "character",
          attrs: { blockId: "cue", storyEntityId: pedroEntity.entity?.id },
          content: [{ type: "text", text: "JUAN" }],
        },
      ],
    });
    expect(characterLinkFixes(editor.state.doc, pedroEntity.story).map((fix) => fix.storyEntityId)).toEqual([null]);
    expect(characterLinkFixes(editor.state.doc, juan.story).map((fix) => fix.storyEntityId)).toEqual([juan.entity?.id]);
    const removed = removeStoryEntity(juan.story, pedroEntity.entity?.id ?? "");
    expect(writerAppearances(editor.state.doc, removed).appearances.some((item) => item.entityId === pedroEntity.entity?.id)).toBe(false);
    editor.destroy();
  });

  it("finds an unambiguous name in a document that is not a script", () => {
    const { story, id } = pedro();
    const editor = new Editor({
      extensions: [createWriterStarterKit(), WriterBlockId],
      content: {
        type: "doc",
        content: [
          { type: "heading", attrs: { level: 2, blockId: "h1" }, content: [{ type: "text", text: "La noche de Pedro" }] },
          { type: "paragraph", attrs: { blockId: "p1" }, content: [{ type: "text", text: "Pedro cruza la carretera." }] },
        ],
      },
    });
    expect(writerAppearances(editor.state.doc, story).appearances.map((item) => item.blockId)).toEqual(["h1", "p1"]);
    expect(writerAppearances(editor.state.doc, story).appearances.every((item) => item.entityId === id)).toBe(true);
    editor.destroy();
  });

  it("keeps an author event and does not invent one", () => {
    const restored = normalizeStory({
      entities: [
        {
          id: "entity-pedro",
          label: "Pedro",
          aliases: ["Pedro"],
          group: "character",
          bound: "entity",
          definition: "",
          notes: [],
          events: [{ id: "event-1", text: "Saltó del barco.", sourceBlockIds: ["act-1"] }],
        },
      ],
      looseNotes: [],
    });
    expect(restored?.entities[0]?.events[0]).toMatchObject({ id: "event-1", text: "Saltó del barco.", sourceBlockIds: ["act-1"] });
    expect(createStoryEntity(emptyWriterStory(), { label: "Ana", group: "character" }).entity?.events).toEqual([]);
  });
});
