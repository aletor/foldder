import { Editor } from "@tiptap/core";
import { describe, expect, it, vi } from "vitest";
import { WriterBlockId, writerBlockTextHash } from "./writer-block-id";
import { WriterChapter, WriterChapterTitle } from "./writer-chapter";
import { buildStoryAsk, storyAskContext } from "./writer-ask-story";
import { createWriterStarterKit, writerScreenplayNodes } from "./writer-screenplay";
import { applyStoryDelta, projectStory } from "./writer-story-delta";
import { executeStoryUpdate, planStoryUpdate, storyCoverage } from "./writer-story-update";
import { createStoryEntity, emptyWriterStory, setStoryDefinition } from "./writer-story";
import type { StoryDeltaPayload } from "./writer-ai";

function script(content: Record<string, unknown>) {
  return new Editor({
    extensions: [createWriterStarterKit(), WriterBlockId, WriterChapter, WriterChapterTitle, ...writerScreenplayNodes],
    content,
  });
}

function storyOf() {
  const pedro = createStoryEntity(emptyWriterStory(), { label: "Pedro", group: "character" });
  const ana = createStoryEntity(pedro.story, { label: "Ana", group: "character" });
  return {
    story: setStoryDefinition(ana.story, pedro.entity?.id ?? "", "Pedro tiene 38 años."),
    pedroId: pedro.entity?.id ?? "",
    anaId: ana.entity?.id ?? "",
  };
}

function action(blockId: string, text: string) {
  return { type: "action", attrs: { blockId }, content: [{ type: "text", text }] };
}

function claim(entityId: string, text: string, blockId: string, evidence: string): StoryDeltaPayload["events"][number] {
  return { entityId, text, sourceBlockIds: [blockId], evidence: [{ blockId, text: evidence }], confidence: 0.96, predicate: "", value: "" };
}

function pad(sentence: string) {
  return `${sentence} ${"detalle ".repeat(160)}`.trim();
}

function longScene(prefix: string, count: number, sentence: string) {
  return Array.from({ length: count }, (_, index) => action(`${prefix}${index}`, pad(sentence)));
}

describe("story update", () => {
  it("fits a run of related blocks into one confirmed call", () => {
    const { story, pedroId, anaId } = storyOf();
    const content = Array.from({ length: 20 }, (_, index) =>
      action(`b${index}`, index % 2 === 0 ? "Pedro camina hacia Ana y le revela el secreto." : "Ana escucha el secreto de Pedro y guarda la carta."),
    );
    const editor = script({ type: "doc", content: [{ type: "chapter", attrs: { id: "ch-3" }, content }] });
    const plan = planStoryUpdate(editor.state.doc, story);
    expect(plan.dirtyCount).toBe(20);
    expect(plan.calls).toBe(1);
    expect(plan.characters.map((item) => item.id).sort()).toEqual([anaId, pedroId].sort());
    expect(plan.chapters).toEqual(["CAP. 1"]);
    expect(plan.batches[0]?.dirty).toHaveLength(20);
    expect(plan.batches[0]?.cited.every((block) => block.hash === writerBlockTextHash(block.text))).toBe(true);
    editor.destroy();
  });

  it("plans two batches before either call and keeps a scene together", () => {
    const { story } = storyOf();
    const editor = script({
      type: "doc",
      content: [
        {
          type: "chapter",
          attrs: { id: "ch-1" },
          content: [
            { type: "sceneHeading", attrs: { blockId: "s1" }, content: [{ type: "text", text: "INT. BARCO - NOCHE" }] },
            { type: "character", attrs: { blockId: "cue" }, content: [{ type: "text", text: "PEDRO" }] },
            { type: "dialogue", attrs: { blockId: "line" }, content: [{ type: "text", text: "Pedro revela el secreto." }] },
            ...longScene("boat", 4, "Pedro revela el secreto en el barco."),
            { type: "sceneHeading", attrs: { blockId: "s2" }, content: [{ type: "text", text: "INT. CALLE - DÍA" }] },
            action("later", pad("Ana abandona Madrid con la carta.")),
          ],
        },
      ],
    });
    const plan = planStoryUpdate(editor.state.doc, story);
    expect(plan.calls).toBe(2);
    const first = plan.batches[0]?.dirty.map((block) => block.blockId) ?? [];
    expect(first).toContain("cue");
    expect(first).toContain("line");
    expect(first).not.toContain("later");
    editor.destroy();
  });

  it("discards a block edited before the delta is applied and keeps the rest", () => {
    const { story, pedroId } = storyOf();
    const editor = script({
      type: "doc",
      content: [action("jump", "Pedro salta del barco."), action("hurt", "Pedro se lesiona la pierna derecha.")],
    });
    const plan = planStoryUpdate(editor.state.doc, story);
    const cited = plan.batches[0]?.cited.map((block) => (block.blockId === "jump" ? { ...block, hash: "hash-viejo" } : block)) ?? [];
    const applied = applyStoryDelta(story, editor.state.doc, cited, {
      events: [
        claim(pedroId, "Pedro salta del barco.", "jump", "Pedro salta del barco."),
        claim(pedroId, "Pedro se lesiona la pierna derecha.", "hurt", "se lesiona la pierna derecha"),
      ],
      stateChanges: [],
      facts: [],
      analyzedBlockIds: ["jump", "hurt"],
      chapterSummaries: [],
    });
    const pedro = applied.story.entities.find((entity) => entity.id === pedroId);
    expect(pedro?.events.map((event) => event.text)).toEqual(["Pedro se lesiona la pierna derecha."]);
    expect(applied.story.analyzed.jump).toBeUndefined();
    expect(applied.story.analyzed.hurt).toBeTruthy();
    expect(pedro?.events[0]?.sourceHashes.hurt).toBe(writerBlockTextHash("Pedro se lesiona la pierna derecha."));
    expect(pedro?.events[0]?.analysisVersion).toBe(1);
    editor.destroy();
  });

  it("drops current state locally when the source scene is gone", () => {
    const { story, pedroId } = storyOf();
    const editor = script({ type: "doc", content: [action("hurt", "Pedro se lesiona la pierna derecha.")] });
    const cited = planStoryUpdate(editor.state.doc, story).batches[0]?.cited ?? [];
    const injured = applyStoryDelta(story, editor.state.doc, cited, {
      events: [claim(pedroId, "Pedro se lesiona la pierna derecha.", "hurt", "se lesiona la pierna derecha")],
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
      chapterSummaries: [],
    });
    const gone = script({ type: "doc", content: [action("other", "Pedro mira el mar.")] });
    const visible = projectStory(injured.story, gone.state.doc);
    expect(visible.entities.find((entity) => entity.id === pedroId)?.stateSummary).toBeNull();
    expect(visible.entities.find((entity) => entity.id === pedroId)?.events).toEqual([]);
    expect(injured.story.entities.find((entity) => entity.id === pedroId)?.stateChanges).toHaveLength(1);
    editor.destroy();
    gone.destroy();
  });

  it("places a later-analyzed chapter 2 event before chapter 5", () => {
    const { story, pedroId } = storyOf();
    const editor = script({
      type: "doc",
      content: [
        { type: "chapter", attrs: { id: "c2" }, content: [action("early", "Pedro salta del barco.")] },
        { type: "chapter", attrs: { id: "c5" }, content: [action("late", "Pedro se lesiona la pierna derecha.")] },
      ],
    });
    const plan = planStoryUpdate(editor.state.doc, story);
    const late = applyStoryDelta(story, editor.state.doc, plan.batches[0]?.cited ?? [], {
      events: [claim(pedroId, "Pedro se lesiona la pierna derecha.", "late", "se lesiona la pierna derecha")],
      stateChanges: [],
      facts: [],
      analyzedBlockIds: ["late"],
      chapterSummaries: [],
    });
    const both = applyStoryDelta(late.story, editor.state.doc, plan.batches[0]?.cited ?? [], {
      events: [claim(pedroId, "Pedro salta del barco.", "early", "Pedro salta del barco.")],
      stateChanges: [],
      facts: [],
      analyzedBlockIds: ["early"],
      chapterSummaries: [],
    });
    expect(both.story.entities.find((entity) => entity.id === pedroId)?.events.map((event) => event.text)).toEqual([
      "Pedro salta del barco.",
      "Pedro se lesiona la pierna derecha.",
    ]);
    editor.destroy();
  });

  it("marks a glance as analyzed without creating an event", () => {
    const { story, pedroId } = storyOf();
    const editor = script({ type: "doc", content: [action("look", "Pedro mira por la ventana.")] });
    const applied = applyStoryDelta(story, editor.state.doc, planStoryUpdate(editor.state.doc, story).batches[0]?.cited ?? [], {
      events: [claim(pedroId, "Pedro mira por la ventana.", "look", "Pedro mira por la ventana.")],
      stateChanges: [],
      facts: [],
      analyzedBlockIds: ["look"],
      chapterSummaries: [],
    });
    expect(applied.story.analyzed.look).toBeTruthy();
    expect(applied.story.entities.find((entity) => entity.id === pedroId)?.events).toEqual([]);
    expect(planStoryUpdate(editor.state.doc, applied.story).calls).toBe(0);
    editor.destroy();
  });

  it("rejects a claim that has confidence but no literal evidence", () => {
    const { story, pedroId } = storyOf();
    const editor = script({ type: "doc", content: [action("jump", "Pedro salta del barco.")] });
    const applied = applyStoryDelta(story, editor.state.doc, planStoryUpdate(editor.state.doc, story).batches[0]?.cited ?? [], {
      events: [{ ...claim(pedroId, "Pedro salta del barco.", "jump", "Pedro salta del barco."), evidence: [], confidence: 0.99 }],
      stateChanges: [],
      facts: [],
      analyzedBlockIds: [],
      chapterSummaries: [],
    });
    expect(applied.changed).toBe(false);
    editor.destroy();
  });

  it("stops after a failed batch and leaves the earlier one in place", async () => {
    const { story, pedroId } = storyOf();
    const editor = script({
      type: "doc",
      content: [
        ...longScene("a", 4, "Pedro salta del barco."),
        ...longScene("b", 4, "Pedro se lesiona la pierna derecha."),
        ...longScene("c", 4, "Pedro revela su secreto."),
      ],
    });
    const plan = planStoryUpdate(editor.state.doc, story);
    expect(plan.calls).toBe(3);
    let storyNow = story;
    const request = vi.fn(async (batch: { dirty: { blockId: string }[] }) => {
      if (request.mock.calls.length === 1) {
        const blockId = batch.dirty[0]?.blockId ?? "";
        return {
          ok: true as const,
          storyDelta: {
            events: [claim(pedroId, "Pedro salta del barco.", blockId, "Pedro salta del barco.")],
            stateChanges: [],
            facts: [],
            analyzedBlockIds: batch.dirty.map((block) => block.blockId),
            chapterSummaries: [],
          },
        };
      }
      return { ok: false as const, error: "No se ha podido leer la respuesta." };
    });
    const outcome = await executeStoryUpdate({
      getDoc: () => editor.state.doc,
      getStory: () => storyNow,
      plan,
      request,
      commit: (next) => {
        storyNow = next;
      },
    });
    expect(outcome.completed).toBe(1);
    expect(outcome.total).toBe(3);
    expect(request).toHaveBeenCalledTimes(2);
    expect(storyNow.entities.find((entity) => entity.id === pedroId)?.events).toHaveLength(1);
    expect(planStoryUpdate(editor.state.doc, storyNow).dirtyCount).toBe(8);
    editor.destroy();
  });

  it("stores a chapter summary only inside the same update and only when the chapter is complete", () => {
    const { story, pedroId } = storyOf();
    const editor = script({
      type: "doc",
      content: [{ type: "chapter", attrs: { id: "ch-3" }, content: [action("jump", "Pedro salta del barco."), action("hurt", "Pedro se lesiona la pierna derecha.")] }],
    });
    const plan = planStoryUpdate(editor.state.doc, story);
    expect(plan.calls).toBe(1);
    const partial = applyStoryDelta(story, editor.state.doc, plan.batches[0]?.cited ?? [], {
      events: [],
      stateChanges: [],
      facts: [],
      analyzedBlockIds: ["jump"],
      chapterSummaries: [{ chapterId: "ch-3", text: "Pedro salta del barco y se lesiona." }],
    });
    expect(partial.story.chapterSummaries).toEqual([]);
    const full = applyStoryDelta(story, editor.state.doc, plan.batches[0]?.cited ?? [], {
      events: [claim(pedroId, "Pedro salta del barco.", "jump", "Pedro salta del barco.")],
      stateChanges: [],
      facts: [],
      analyzedBlockIds: ["jump", "hurt"],
      chapterSummaries: [
        { chapterId: "ch-3", text: "Pedro salta del barco y se lesiona." },
        { chapterId: "ch-3", text: "Pedro podría vengarse después." },
      ],
    });
    expect(full.story.chapterSummaries).toHaveLength(1);
    expect(full.story.chapterSummaries[0]?.text).toContain("salta del barco");
    expect(full.story.documentSummary).toBeNull();
    const coverage = storyCoverage(editor.state.doc, full.story);
    expect(coverage.chapters[0]).toMatchObject({ chapterId: "ch-3", pending: 0, analyzed: 2 });
    expect(coverage.staleSummaries).toEqual([]);
    editor.destroy();
  });

  it("lets a later question use state instead of the blocks already analyzed", () => {
    const { story, pedroId } = storyOf();
    const editor = script({
      type: "doc",
      content: [action("jump", "Pedro salta del barco."), action("hurt", "Pedro se lesiona la pierna derecha.")],
    });
    const before = buildStoryAsk(editor.state.doc, story, {
      scope: { type: "entity", entityId: pedroId },
      question: "¿Cuál podría ser ahora la motivación de Pedro?",
    });
    const plan = planStoryUpdate(editor.state.doc, story);
    const updated = applyStoryDelta(story, editor.state.doc, plan.batches[0]?.cited ?? [], {
      events: [
        claim(pedroId, "Pedro salta del barco.", "jump", "Pedro salta del barco."),
        claim(pedroId, "Pedro se lesiona la pierna derecha.", "hurt", "se lesiona la pierna derecha"),
      ],
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
      analyzedBlockIds: ["jump", "hurt"],
      chapterSummaries: [],
    }).story;
    const after = buildStoryAsk(editor.state.doc, projectStory(updated, editor.state.doc), {
      scope: { type: "entity", entityId: pedroId },
      question: "¿Cuál podría ser ahora la motivación de Pedro?",
    });
    expect(after.freshContext.length).toBeLessThan(before.freshContext.length);
    expect(storyAskContext(after).entities[0]?.state).toContain("Pierna derecha lesionada.");
    expect(storyAskContext(after).entities[0]?.events.join(" ")).toContain("salta del barco");
    editor.destroy();
  });

  it("sends an analyzed neighbor as context and does not mark it pending", () => {
    const { story, pedroId } = storyOf();
    const editor = script({
      type: "doc",
      content: [action("known", "Pedro salta del barco."), action("next", "Pedro se lesiona la pierna derecha.")],
    });
    const first = applyStoryDelta(story, editor.state.doc, planStoryUpdate(editor.state.doc, story).batches[0]?.cited ?? [], {
      events: [claim(pedroId, "Pedro salta del barco.", "known", "Pedro salta del barco.")],
      stateChanges: [],
      facts: [],
      analyzedBlockIds: ["known"],
      chapterSummaries: [],
    }).story;
    const plan = planStoryUpdate(editor.state.doc, first);
    expect(plan.dirtyCount).toBe(1);
    expect(plan.batches[0]?.dirty.map((block) => block.blockId)).toEqual(["next"]);
    expect(plan.batches[0]?.context.map((block) => block.blockId)).toEqual(["known"]);
    expect(plan.batches[0]?.cited.map((block) => block.blockId)).toEqual(["next"]);
    editor.destroy();
  });
});
