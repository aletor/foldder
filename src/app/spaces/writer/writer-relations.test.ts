import { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { WriterBlockId, writerBlockTextHash } from "./writer-block-id";
import { WriterChapter, WriterChapterTitle } from "./writer-chapter";
import { writerDocumentBlocks } from "./writer-appearances";
import { buildStoryAsk } from "./writer-ask-story";
import { createWriterStarterKit, writerScreenplayNodes } from "./writer-screenplay";
import { applyStoryDelta, projectStory } from "./writer-story-delta";
import { planStoryUpdate, storyUpdatePreview } from "./writer-story-update";
import { writerAiMessages } from "./writer-ai";
import type { StoryAskCitedBlock } from "./writer-ask-story";
import type { StoryDeltaPayload } from "./writer-ai";
import {
  acceptStoryThreadCandidate,
  addStoryAuthorRelation,
  createStoryEntity,
  emptyWriterStory,
  normalizeStory,
  type WriterStory,
} from "./writer-story";
import { currentStance, normalizeAuthorRelation, relationRowsFor } from "./writer-relations";

function script(content: Record<string, unknown>) {
  return new Editor({
    extensions: [createWriterStarterKit(), WriterBlockId, WriterChapter, WriterChapterTitle, ...writerScreenplayNodes],
    content,
  });
}

function cite(doc: Editor["state"]["doc"]): StoryAskCitedBlock[] {
  return writerDocumentBlocks(doc).map((block) => ({
    blockId: block.blockId,
    text: block.text,
    hash: writerBlockTextHash(block.text),
    order: block.order,
    chapterLabel: block.chapterLabel,
    entityIds: [],
  }));
}

function cast(label: string, group: "character" | "story", story = emptyWriterStory()) {
  return createStoryEntity(story, { label, group });
}

function people() {
  const ana = cast("Ana", "character");
  const pedro = cast("Pedro", "character", ana.story);
  const juan = cast("Juan", "character", pedro.story);
  const secret = cast("El secreto", "story", juan.story);
  return {
    story: secret.story,
    anaId: ana.entity?.id ?? "",
    pedroId: pedro.entity?.id ?? "",
    juanId: juan.entity?.id ?? "",
    secretId: secret.entity?.id ?? "",
  };
}

function relation(input: {
  from: string;
  to: string;
  type: string;
  stance?: string;
  qualifier?: string;
  label: string;
  blockId: string;
  evidence: string;
}): NonNullable<StoryDeltaPayload["relations"]>[number] {
  return {
    fromEntityId: input.from,
    toEntityId: input.to,
    type: input.type,
    label: input.label,
    qualifier: input.qualifier ?? "",
    stance: input.stance ?? "",
    text: input.evidence,
    sourceBlockIds: [input.blockId],
    evidence: [{ blockId: input.blockId, text: input.evidence }],
    confidence: 0.96,
  };
}

describe("story relations", () => {
  it("normalizes an author phrase without a model", () => {
    expect(normalizeAuthorRelation("hermana")).toMatchObject({ type: "family", qualifier: "sibling" });
    expect(normalizeAuthorRelation("padre")).toMatchObject({ type: "family", qualifier: "parent" });
    expect(normalizeAuthorRelation("hija")).toMatchObject({ type: "family", qualifier: "child" });
    expect(normalizeAuthorRelation("pareja")).toMatchObject({ type: "romantic" });
    expect(normalizeAuthorRelation("cómplice")).toMatchObject({ type: "related", label: "cómplice" });
  });

  it("keeps an author relation when the document changes and normalizes hermana", () => {
    const { story, anaId, pedroId } = people();
    const linked = addStoryAuthorRelation(story, { fromEntityId: anaId, toEntityId: pedroId, phrase: "hermana" });
    expect(linked.relations?.[0]).toMatchObject({ type: "family", qualifier: "sibling", source: "author", label: "hermana" });
    const editor = script({
      type: "doc",
      content: [{ type: "paragraph", attrs: { blockId: "p" }, content: [{ type: "text", text: "Ana camina sola." }] }],
    });
    const visible = projectStory(linked, editor.state.doc);
    expect(visible.relations).toHaveLength(1);
    expect(relationRowsFor(anaId, visible.relations ?? [], visible.entities)).toEqual([
      expect.objectContaining({ otherLabel: "Pedro", phrase: "hermana" }),
    ]);
    editor.destroy();
  });

  it("TEST A — current knowledge follows the later text and keeps the earlier stance", () => {
    const { story, anaId, juanId, secretId } = people();
    void anaId;
    const editor = script({
      type: "doc",
      content: [
        {
          type: "chapter",
          attrs: { id: "ch-2" },
          content: [{ type: "action", attrs: { blockId: "b2" }, content: [{ type: "text", text: "Juan no sabe nada del secreto." }] }],
        },
        {
          type: "chapter",
          attrs: { id: "ch-7" },
          content: [{ type: "action", attrs: { blockId: "b7" }, content: [{ type: "text", text: "Ana le cuenta a Juan toda la verdad sobre el secreto." }] }],
        },
      ],
    });
    const applied = applyStoryDelta(story, editor.state.doc, cite(editor.state.doc), {
      events: [],
      stateChanges: [],
      facts: [],
      analyzedBlockIds: [],
      relations: [
        relation({ from: juanId, to: secretId, type: "knows_about", stance: "not_known_explicit", label: "no lo conoce", blockId: "b2", evidence: "no sabe nada del secreto" }),
        relation({ from: juanId, to: secretId, type: "knows_about", stance: "known", label: "lo conoce", blockId: "b7", evidence: "le cuenta a Juan toda la verdad sobre el secreto" }),
      ],
    });
    expect(applied.story.relations).toHaveLength(2);
    expect(currentStance(applied.story.relations ?? [], juanId, secretId)).toBe("known");
    const ask = buildStoryAsk(editor.state.doc, applied.story, { scope: { type: "global" }, question: "¿Juan conoce el secreto?" });
    expect(ask.localAnswer).toMatch(/Sí/);
    expect(ask.metrics.local).toBe(true);
    editor.destroy();
  });

  it("TEST B — accepting a candidate does not create relations", () => {
    const { story, anaId, pedroId } = people();
    const before = story.entities.length;
    const editor = script({
      type: "doc",
      content: [
        { type: "action", attrs: { blockId: "a1" }, content: [{ type: "text", text: "Ana recuerda el accidente en silencio." }] },
        { type: "action", attrs: { blockId: "a2" }, content: [{ type: "text", text: "Pedro también nombra el accidente." }] },
      ],
    });
    const applied = applyStoryDelta(story, editor.state.doc, cite(editor.state.doc), {
      events: [],
      stateChanges: [],
      facts: [],
      analyzedBlockIds: [],
      relations: [],
      threadCandidates: [
        {
          label: "El accidente",
          relatedEntityIds: [anaId, pedroId],
          sourceBlockIds: ["a1", "a2"],
          evidence: [
            { blockId: "a1", text: "recuerda el accidente" },
            { blockId: "a2", text: "nombra el accidente" },
          ],
          confidence: 0.95,
        },
      ],
    });
    expect(applied.story.entities).toHaveLength(before);
    expect(applied.story.threadCandidates).toHaveLength(1);
    const accepted = acceptStoryThreadCandidate(applied.story, applied.story.threadCandidates?.[0]?.id ?? "");
    expect(accepted.entities).toHaveLength(before + 1);
    const thread = accepted.entities.find((entity) => entity.label === "El accidente");
    expect(thread).toMatchObject({ group: "story", kind: "thread", definition: "" });
    expect(accepted.relations ?? []).toEqual([]);
    expect(accepted.threadCandidates).toEqual([]);
    editor.destroy();
  });

  it("TEST C — three sibling mentions become one row with three evidences", () => {
    const { story, anaId, pedroId } = people();
    const editor = script({
      type: "doc",
      content: [
        { type: "action", attrs: { blockId: "s1" }, content: [{ type: "text", text: "Pedro es hermano de Ana en la cocina." }] },
        { type: "action", attrs: { blockId: "s2" }, content: [{ type: "text", text: "Pedro es hermano de Ana, repite ella." }] },
        { type: "action", attrs: { blockId: "s3" }, content: [{ type: "text", text: "Pedro es hermano de Ana desde niños." }] },
      ],
    });
    const applied = applyStoryDelta(story, editor.state.doc, cite(editor.state.doc), {
      events: [],
      stateChanges: [],
      facts: [],
      analyzedBlockIds: [],
      relations: ["s1", "s2", "s3"].map((blockId) =>
        relation({
          from: anaId,
          to: pedroId,
          type: "family",
          qualifier: "sibling",
          label: "hermana",
          blockId,
          evidence: "Pedro es hermano de Ana",
        }),
      ),
    });
    expect(applied.story.relations).toHaveLength(1);
    expect(applied.story.relations?.[0]?.evidence).toHaveLength(3);
    expect(relationRowsFor(anaId, applied.story.relations ?? [], applied.story.entities)).toEqual([
      expect.objectContaining({ otherLabel: "Pedro", phrase: "hermana" }),
    ]);
    editor.destroy();
  });

  it("drops a candidate that resolves to an existing element", () => {
    const base = cast("El accidente", "story");
    const editor = script({
      type: "doc",
      content: [
        { type: "action", attrs: { blockId: "a1" }, content: [{ type: "text", text: "Hablan del accidente otra vez." }] },
        { type: "action", attrs: { blockId: "a2" }, content: [{ type: "text", text: "El accidente vuelve a nombrarse." }] },
      ],
    });
    const applied = applyStoryDelta(base.story, editor.state.doc, cite(editor.state.doc), {
      events: [],
      stateChanges: [],
      facts: [],
      analyzedBlockIds: [],
      threadCandidates: [
        {
          label: "Accidente",
          relatedEntityIds: [],
          sourceBlockIds: ["a1", "a2"],
          evidence: [
            { blockId: "a1", text: "del accidente otra vez" },
            { blockId: "a2", text: "El accidente vuelve" },
          ],
          confidence: 0.96,
        },
      ],
    });
    expect(applied.story.threadCandidates ?? []).toEqual([]);
    expect(applied.story.entities).toHaveLength(1);
    editor.destroy();
  });

  it("hides a text relation when its source changes and keeps events if relations are invalid", () => {
    const { story, anaId, pedroId } = people();
    const editor = script({
      type: "doc",
      content: [{ type: "action", attrs: { blockId: "s1" }, content: [{ type: "text", text: "Pedro es hermano de Ana en casa." }] }],
    });
    const applied = applyStoryDelta(story, editor.state.doc, cite(editor.state.doc), {
      events: [
        {
          entityId: pedroId,
          text: "Pedro confirma que es hermano de Ana.",
          sourceBlockIds: ["s1"],
          evidence: [{ blockId: "s1", text: "Pedro es hermano de Ana" }],
          confidence: 0.96,
          predicate: "",
          value: "",
        },
      ],
      stateChanges: [],
      facts: [],
      analyzedBlockIds: [],
      relations: [
        relation({ from: anaId, to: pedroId, type: "family", qualifier: "sibling", label: "hermana", blockId: "s1", evidence: "Pedro es hermano de Ana" }),
        relation({ from: anaId, to: pedroId, type: "knows_about", stance: "known", label: "lo conoce", blockId: "missing", evidence: "no está en el bloque" }),
      ],
    });
    expect(applied.story.entities.find((entity) => entity.id === pedroId)?.events).toHaveLength(1);
    expect(applied.story.relations).toHaveLength(1);
    const rewritten = script({
      type: "doc",
      content: [{ type: "action", attrs: { blockId: "s1" }, content: [{ type: "text", text: "Pedro mira la ventana." }] }],
    });
    expect(projectStory(applied.story, rewritten.state.doc).relations).toEqual([]);
    rewritten.destroy();
    editor.destroy();
  });

  it("TEST E and F — unknown is not a no, and a later known replaces the explicit no", () => {
    const { story, anaId, juanId, secretId } = people();
    const withAna: WriterStory = {
      ...story,
      relations: [
        {
          id: "r-ana",
          fromEntityId: anaId,
          toEntityId: secretId,
          type: "knows_about",
          label: "lo conoce",
          stance: "known",
          source: "text",
          sourceBlockIds: ["b1"],
          sourceHashes: { b1: "hash" },
          evidence: [{ blockId: "b1", text: "Ana conoce el secreto" }],
          documentOrder: 10,
          analysisVersion: 1,
        },
      ],
    };
    const editor = script({
      type: "doc",
      content: [{ type: "paragraph", attrs: { blockId: "b1" }, content: [{ type: "text", text: "Ana conoce el secreto." }] }],
    });
    const unknown = buildStoryAsk(editor.state.doc, withAna, { scope: { type: "global" }, question: "¿Juan conoce el secreto?" });
    expect(unknown.localAnswer).toBe("No tengo información suficiente para saberlo.");
    expect(unknown.localAnswer).not.toBe("No.");
    const later: WriterStory = {
      ...withAna,
      relations: [
        ...(withAna.relations ?? []),
        {
          id: "r-old",
          fromEntityId: juanId,
          toEntityId: secretId,
          type: "knows_about",
          label: "no lo conoce",
          stance: "not_known_explicit",
          source: "text",
          sourceBlockIds: ["b3"],
          sourceHashes: { b3: "old" },
          evidence: [{ blockId: "b3", text: "Juan no sabe nada del secreto" }],
          documentOrder: 3,
          analysisVersion: 1,
        },
        {
          id: "r-new",
          fromEntityId: juanId,
          toEntityId: secretId,
          type: "knows_about",
          label: "lo conoce",
          stance: "known",
          source: "text",
          sourceBlockIds: ["b6"],
          sourceHashes: { b6: "new" },
          evidence: [{ blockId: "b6", text: "Juan conoce el secreto" }],
          documentOrder: 60,
          analysisVersion: 1,
        },
      ],
    };
    const who = buildStoryAsk(editor.state.doc, later, { scope: { type: "global" }, question: "¿Quién conoce el secreto?" });
    expect(who.localAnswer).toMatch(/Juan/);
    expect(who.localAnswer).toMatch(/Ana/);
    expect(who.localAnswer).not.toMatch(/todavía no/i);
    expect(who.metrics.local).toBe(true);
    editor.destroy();
  });

  it("retrieves a direct relation for an interpretive question and answers chapters locally", () => {
    const ana = cast("Ana", "character");
    const accident = createStoryEntity(ana.story, { label: "El accidente", group: "story", kind: "thread" });
    const anaId = ana.entity?.id ?? "";
    const accidentId = accident.entity?.id ?? "";
    const linked = addStoryAuthorRelation(accident.story, { fromEntityId: anaId, toEntityId: accidentId, phrase: "implicada" });
    const editor = script({
      type: "doc",
      content: [
        {
          type: "chapter",
          attrs: { id: "ch-2" },
          content: [{ type: "action", attrs: { blockId: "p" }, content: [{ type: "text", text: "Ana menciona el accidente." }] }],
        },
      ],
    });
    const interpretive = buildStoryAsk(editor.state.doc, linked, {
      scope: { type: "entity", entityId: accidentId },
      question: "¿Cómo afecta actualmente a Ana?",
    });
    expect(interpretive.localAnswer).toBeNull();
    expect(interpretive.entityIds).toContain(accidentId);
    expect(interpretive.entityIds).toContain(anaId);
    const chapters = buildStoryAsk(editor.state.doc, linked, {
      scope: { type: "global" },
      question: "¿En qué capítulos aparece El accidente?",
    });
    expect(chapters.metrics.local).toBe(true);
    expect(chapters.localAnswer).toMatch(/El accidente/);
    const plan = planStoryUpdate(editor.state.doc, linked);
    const preview = storyUpdatePreview(plan);
    const messages = writerAiMessages({
      action: "update_story",
      profile: "screenplay",
      selection: "",
      batch: plan.batches[0]
        ? {
            dirty: plan.batches[0].dirty,
            context: plan.batches[0].context,
            entities: plan.batches[0].entities,
          }
        : { dirty: [], context: [], entities: [] },
      preview,
    });
    expect(messages.system).toContain("threadCandidates");
    expect(messages.system).toContain("No pidas otra llamada");
    expect(preview.calls).toBe(Math.max(1, plan.batches.length));
    editor.destroy();
  });

  it("keeps an author knowledge row when a later text row disagrees", () => {
    const { story, juanId, secretId } = people();
    const author = addStoryAuthorRelation(story, { fromEntityId: juanId, toEntityId: secretId, phrase: "" });
    const withStance = {
      ...author,
      relations: (author.relations ?? []).map((row) => ({ ...row, type: "knows_about" as const, stance: "known" as const, label: "lo conoce" })),
    };
    const both = {
      ...withStance,
      relations: [
        ...(withStance.relations ?? []),
        {
          id: "text-no",
          fromEntityId: juanId,
          toEntityId: secretId,
          type: "knows_about" as const,
          label: "no lo conoce",
          stance: "not_known_explicit" as const,
          source: "text" as const,
          sourceBlockIds: ["b8"],
          sourceHashes: { b8: "h" },
          evidence: [{ blockId: "b8", text: "Juan no sabe nada del secreto" }],
          documentOrder: 80,
          analysisVersion: 1,
        },
      ],
    };
    expect(both.relations).toHaveLength(2);
    expect(currentStance(both.relations, juanId, secretId)).toBe("not_known_explicit");
  });

  it("opens a story saved before relations existed", () => {
    const loaded = normalizeStory({
      entities: [{ id: "e1", label: "Ana", group: "character", bound: "entity", definition: "", notes: [], aliases: ["Ana"] }],
      looseNotes: [],
    });
    expect(loaded?.relations).toEqual([]);
    expect(loaded?.threadCandidates).toEqual([]);
    expect(loaded?.entities[0]?.kind).toBeUndefined();
  });
});
