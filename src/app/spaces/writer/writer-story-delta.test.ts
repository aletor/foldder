import { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { WriterBlockId } from "./writer-block-id";
import { WriterChapter, WriterChapterTitle } from "./writer-chapter";
import { buildStoryAsk } from "./writer-ask-story";
import { writerConflicts } from "./writer-continuity";
import { createWriterStarterKit, writerScreenplayNodes } from "./writer-screenplay";
import { applyStoryDelta } from "./writer-story-delta";
import { createStoryEntity, emptyWriterStory, projectWriterMemory, setStoryDefinition } from "./writer-story";
import { writerAiMessages } from "./writer-ai";
import { storyAskContext } from "./writer-ask-story";

function script(content: Record<string, unknown>) {
  return new Editor({
    extensions: [createWriterStarterKit(), WriterBlockId, WriterChapter, WriterChapterTitle, ...writerScreenplayNodes],
    content,
  });
}

function storyOf() {
  const pedro = createStoryEntity(emptyWriterStory(), { label: "Pedro", group: "character" });
  const pedroId = pedro.entity?.id ?? "";
  const ana = createStoryEntity(pedro.story, { label: "Ana", group: "character" });
  const anaId = ana.entity?.id ?? "";
  const story = setStoryDefinition(ana.story, pedroId, "Pedro tiene 38 años. Es orgulloso y reservado.");
  return { story, pedroId, anaId };
}

const scene = {
  type: "doc",
  content: [
    {
      type: "chapter",
      attrs: { id: "ch-3" },
      content: [
        { type: "action", attrs: { blockId: "jump" }, content: [{ type: "text", text: "Pedro salta del barco." }] },
        { type: "action", attrs: { blockId: "hurt" }, content: [{ type: "text", text: "Pedro se lesiona la pierna derecha." }] },
        { type: "action", attrs: { blockId: "reveal" }, content: [{ type: "text", text: "Pedro encuentra a Ana y le revela su secreto." }] },
        { type: "action", attrs: { blockId: "smile" }, content: [{ type: "text", text: "Pedro sonríe." }] },
      ],
    },
  ],
};

function claim(entityId: string, text: string, blockId: string, confidence = 0.95, evidence = text) {
  return { entityId, text, sourceBlockIds: [blockId], evidence: [{ blockId, text: evidence }], confidence, predicate: "", value: "" };
}

describe("story delta", () => {
  it("keeps documentary events and state, and drops the invented motivation", () => {
    const { story, pedroId, anaId } = storyOf();
    const editor = script(scene);
    const pkg = buildStoryAsk(editor.state.doc, story, {
      scope: { type: "entity", entityId: pedroId },
      question: "¿Cuál podría ser ahora la motivación de Pedro?",
    });
    const messages = writerAiMessages({
      action: "ask_story",
      profile: "screenplay",
      selection: pkg.question,
      question: pkg.question,
      previous: null,
      preview: pkg.preview,
      storyContext: storyAskContext(pkg),
    });
    expect(messages.system).toContain("storyDelta no sale de answer");
    expect(messages.system).toContain("evidence");
    expect(messages.user).toContain("[jump]");
    const applied = applyStoryDelta(story, editor.state.doc, pkg.cited, {
      events: [
        claim(pedroId, "Pedro salta del barco.", "jump"),
        claim(pedroId, "Pedro se lesiona la pierna derecha.", "hurt"),
        claim(pedroId, "Pedro revela su secreto a Ana.", "reveal", 0.95, "le revela su secreto"),
        claim(anaId, "Ana descubre el secreto de Pedro.", "reveal", 0.95, "le revela su secreto"),
        claim(pedroId, "Pedro podría querer matar a Juan.", "jump", 0.99),
        claim("juan-no-existe", "Juan aparece.", "jump"),
      ],
      stateChanges: [
        {
          entityId: pedroId,
          predicate: "physical.right_leg",
          value: "injured",
          text: "Pierna derecha lesionada.",
          sourceBlockIds: ["hurt"],
          evidence: [{ blockId: "hurt", text: "se lesiona la pierna derecha" }],
          confidence: 0.95,
        },
        {
          entityId: pedroId,
          predicate: "relationship.ana_knows_secret",
          value: "true",
          text: "Ana conoce su secreto.",
          sourceBlockIds: ["reveal"],
          evidence: [{ blockId: "reveal", text: "le revela su secreto" }],
          confidence: 0.94,
        },
        {
          entityId: pedroId,
          predicate: "motivation.revenge",
          value: "juan",
          text: "Quiere vengarse de Juan.",
          sourceBlockIds: ["jump"],
          evidence: [{ blockId: "jump", text: "Pedro salta del barco." }],
          confidence: 0.99,
        },
      ],
      facts: [],
      analyzedBlockIds: ["jump", "hurt", "reveal", "smile"],
    });
    const pedro = applied.story.entities.find((entity) => entity.id === pedroId);
    const ana = applied.story.entities.find((entity) => entity.id === anaId);
    expect(applied.changed).toBe(true);
    expect(pedro?.events.map((event) => event.text)).toEqual([
      "Pedro salta del barco.",
      "Pedro se lesiona la pierna derecha.",
      "Pedro revela su secreto a Ana.",
    ]);
    expect(pedro?.events.every((event) => event.chapterLabel === "CAP. 1")).toBe(true);
    expect(pedro?.stateSummary).toBe("Pierna derecha lesionada.\nAna conoce su secreto.");
    expect(pedro?.stateSummary).not.toMatch(/venganza|matar|motivaci/i);
    expect(pedro?.traceSummary).toContain("salta del barco");
    expect(ana?.events.map((event) => event.text)).toEqual(["Ana descubre el secreto de Pedro."]);
    expect(applied.story.entities.some((entity) => entity.label === "Juan")).toBe(false);
    expect(applied.story.analyzed.smile).toBeTruthy();
    expect(pedro?.events.some((event) => event.text.includes("sonríe"))).toBe(false);
    const again = applyStoryDelta(applied.story, editor.state.doc, pkg.cited, {
      events: [claim(pedroId, "Pedro salta del barco otra vez.", "jump", 0.95, "Pedro salta del barco.")],
      stateChanges: [],
      facts: [],
      analyzedBlockIds: ["jump"],
    });
    expect(again.story.entities.find((entity) => entity.id === pedroId)?.events).toHaveLength(3);
    editor.destroy();
  });

  it("does not apply a delta when the block changed, and still leaves the answer alone", () => {
    const { story, pedroId } = storyOf();
    const editor = script(scene);
    const pkg = buildStoryAsk(editor.state.doc, story, {
      scope: { type: "entity", entityId: pedroId },
      question: "¿Qué ha pasado?",
    });
    const stale = pkg.cited.map((block) => (block.blockId === "jump" ? { ...block, hash: "otro-hash" } : block));
    const applied = applyStoryDelta(story, editor.state.doc, stale, {
      events: [claim(pedroId, "Pedro salta del barco.", "jump")],
      stateChanges: [],
      facts: [],
      analyzedBlockIds: ["jump"],
    });
    expect(applied.changed).toBe(false);
    expect(applied.story.entities.find((entity) => entity.id === pedroId)?.events).toEqual([]);
    editor.destroy();
  });

  it("replaces the current state and keeps both events", () => {
    const { story, pedroId } = storyOf();
    const editor = script({
      type: "doc",
      content: [
        { type: "action", attrs: { blockId: "hurt" }, content: [{ type: "text", text: "Pedro se lesiona la pierna derecha." }] },
        { type: "action", attrs: { blockId: "heal" }, content: [{ type: "text", text: "La pierna derecha de Pedro ya está recuperada." }] },
      ],
    });
    const firstPackage = buildStoryAsk(editor.state.doc, story, {
      scope: { type: "entity", entityId: pedroId },
      question: "¿Cómo está Pedro?",
    });
    const injured = applyStoryDelta(story, editor.state.doc, firstPackage.cited, {
      events: [claim(pedroId, "Pedro se lesiona la pierna derecha.", "hurt")],
      stateChanges: [{
        entityId: pedroId,
        predicate: "physical.right_leg",
        value: "injured",
        text: "Pierna derecha lesionada.",
        sourceBlockIds: ["hurt"],
        evidence: [{ blockId: "hurt", text: "se lesiona la pierna derecha" }],
        confidence: 0.95,
      }],
      facts: [],
      analyzedBlockIds: ["hurt"],
    });
    const recovered = applyStoryDelta(injured.story, editor.state.doc, firstPackage.cited, {
      events: [claim(pedroId, "Pedro recupera la pierna derecha.", "heal", 0.95, "ya está recuperada")],
      stateChanges: [{
        entityId: pedroId,
        predicate: "physical.right_leg",
        value: "recovered",
        text: "Pierna derecha recuperada.",
        sourceBlockIds: ["heal"],
        evidence: [{ blockId: "heal", text: "ya está recuperada" }],
        confidence: 0.95,
      }],
      facts: [],
      analyzedBlockIds: ["heal"],
    });
    const pedro = recovered.story.entities.find((entity) => entity.id === pedroId);
    expect(pedro?.events.map((event) => event.text)).toEqual([
      "Pedro se lesiona la pierna derecha.",
      "Pedro recupera la pierna derecha.",
    ]);
    expect(pedro?.stateSummary).toBe("Pierna derecha recuperada.");
    expect(pedro?.stateChanges).toHaveLength(2);
    editor.destroy();
  });

  it("records a text fact without rewriting the author's definition", () => {
    const { story, pedroId } = storyOf();
    const editor = script({
      type: "doc",
      content: [{ type: "paragraph", attrs: { blockId: "age" }, content: [{ type: "text", text: "A sus 40 años, Pedro mira el mar." }] }],
    });
    const pkg = buildStoryAsk(editor.state.doc, story, {
      scope: { type: "entity", entityId: pedroId },
      question: "¿Cuántos años tiene?",
    });
    const applied = applyStoryDelta(story, editor.state.doc, pkg.cited, {
      events: [],
      stateChanges: [],
      facts: [claim(pedroId, "A sus 40 años, Pedro mira el mar.", "age")],
      analyzedBlockIds: ["age"],
    });
    const pedro = applied.story.entities.find((entity) => entity.id === pedroId);
    expect(pedro?.definition).toContain("38 años");
    expect(pedro?.textFacts[0]).toMatchObject({ authority: "text", text: "A sus 40 años, Pedro mira el mar." });
    const conflicts = writerConflicts(editor.state.doc, projectWriterMemory(applied.story), []);
    expect(conflicts.some((conflict) => conflict.here.includes("40 años"))).toBe(true);
    editor.destroy();
  });
});
