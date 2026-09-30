import { Editor } from "@tiptap/core";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { StoryView } from "./StoryView";
import { buildStoryAsk } from "./writer-ask-story";
import { writerDocumentBlocks, type StoryDocumentBlock } from "./writer-appearances";
import { writerBlockTextHash } from "./writer-block-id";
import { WriterBlockId } from "./writer-block-id";
import { WriterChapter, WriterChapterTitle } from "./writer-chapter";
import { getWriterContextAdapter } from "./writer-context";
import { buildEntityPresentation, buildStorySnapshot } from "./writer-presentation";
import { questionIndex, questionsMatch } from "./writer-questions";
import { createWriterStarterKit, writerScreenplayNodes } from "./writer-screenplay";
import { applyStoryDelta } from "./writer-story-delta";
import {
  addStoryAuthorRelation,
  addStoryEntityNote,
  createStoryEntity,
  emptyWriterStory,
  type WriterStory,
} from "./writer-story";
import { addAuthorQuestion, setQuestionOverride } from "./writer-questions";
import { planStoryUpdate } from "./writer-story-update";
import { writerAiMessages } from "./writer-ai";
import type { StoryDeltaQuestionEvent } from "./writer-questions";

afterEach(() => cleanup());

function script(content: Record<string, unknown>) {
  return new Editor({
    extensions: [createWriterStarterKit(), WriterBlockId, WriterChapter, WriterChapterTitle, ...writerScreenplayNodes],
    content,
  });
}

function editorOf(rows: { id: string; text: string }[]) {
  return script({
    type: "doc",
    content: [
      {
        type: "chapter",
        attrs: { id: "ch-1" },
        content: rows.map((row) => ({
          type: "action",
          attrs: { blockId: row.id },
          content: [{ type: "text", text: row.text }],
        })),
      },
    ],
  });
}

function cite(editor: Editor, ids: string[], entityIds: string[] = []) {
  return writerDocumentBlocks(editor.state.doc)
    .filter((block) => ids.includes(block.blockId))
    .map((block) => ({
      blockId: block.blockId,
      text: block.text,
      hash: writerBlockTextHash(block.text),
      order: block.order,
      chapterLabel: block.chapterLabel,
      entityIds,
    }));
}

function liveMap(editor: Editor) {
  return new Map(writerDocumentBlocks(editor.state.doc).map((block) => [block.blockId, writerBlockTextHash(block.text)]));
}

function blockText(editor: Editor, id: string) {
  return writerDocumentBlocks(editor.state.doc).find((block) => block.blockId === id)?.text ?? "";
}

function ask(story: WriterStory, editor: Editor, event: StoryDeltaQuestionEvent, allowed: string[] = []) {
  const ids = event.sourceBlockIds;
  return applyStoryDelta(
    story,
    editor.state.doc,
    cite(editor, ids),
    {
      events: [],
      stateChanges: [],
      facts: [],
      analyzedBlockIds: ids,
      questionEvents: [event],
    },
    { allowedQuestionIds: allowed },
  ).story;
}

function introduced(text: string, blockId: string, quote: string, related: string[]): StoryDeltaQuestionEvent {
  return {
    operation: "introduced",
    questionText: text,
    relatedEntityIds: related,
    text: quote,
    sourceBlockIds: [blockId],
    evidence: [{ blockId, text: quote }],
    confidence: 0.95,
  };
}

function people() {
  const ana = createStoryEntity(emptyWriterStory(), { label: "Ana", group: "character" });
  const pedro = createStoryEntity(ana.story, { label: "Pedro", group: "character" });
  const accident = createStoryEntity(pedro.story, { label: "El accidente", group: "story" });
  return {
    story: accident.story,
    anaId: ana.entity?.id ?? "",
    pedroId: pedro.entity?.id ?? "",
    accidentId: accident.entity?.id ?? "",
  };
}

function statusOf(story: WriterStory, editor: Editor) {
  return questionIndex(story.questions ?? [], liveMap(editor));
}

describe("narrative questions", () => {
  it("opens, advances, resolves, restores and reopens from the text", () => {
    const { story, anaId, pedroId, accidentId } = people();
    const related = [anaId, pedroId, accidentId];
    const editor = editorOf([
      { id: "open", text: "Nadie sabe quién provocó el accidente." },
      { id: "move", text: "El coche había sido manipulado." },
      { id: "own", text: "Fui yo. Yo provoqué el accidente." },
      { id: "lie", text: "Pedro mintió. Él no conducía." },
    ]);
    const opened = ask(story, editor, introduced("¿Quién provocó el accidente?", "open", blockText(editor, "open"), related));
    const openIndex = statusOf(opened, editor);
    expect(openIndex.open).toHaveLength(1);
    expect(openIndex.open[0]?.text).toBe("¿Quién provocó el accidente?");
    expect(openIndex.open[0]?.relatedEntityIds).toEqual(related);
    const id = openIndex.open[0]?.id ?? "";

    const advanced = ask(
      opened,
      editor,
      {
        operation: "advanced",
        questionId: id,
        text: "El coche había sido manipulado.",
        sourceBlockIds: ["move"],
        evidence: [{ blockId: "move", text: blockText(editor, "move") }],
        confidence: 0.9,
      },
      [id],
    );
    const moved = statusOf(advanced, editor).open[0];
    expect(moved?.status).toBe("open");
    expect(moved?.lastAdvancedOrder).not.toBe(openIndex.open[0]?.lastAdvancedOrder);

    const resolved = ask(
      advanced,
      editor,
      {
        operation: "resolved",
        questionId: id,
        text: "Fui yo. Yo provoqué el accidente.",
        sourceBlockIds: ["own"],
        evidence: [{ blockId: "own", text: blockText(editor, "own") }],
        confidence: 0.95,
      },
      [id],
    );
    expect(statusOf(resolved, editor).open).toHaveLength(0);
    expect(statusOf(resolved, editor).resolved).toHaveLength(1);

    const withoutConfession = editorOf([
      { id: "open", text: "Nadie sabe quién provocó el accidente." },
      { id: "move", text: "El coche había sido manipulado." },
      { id: "own", text: "Ana guarda silencio." },
      { id: "lie", text: "Pedro mintió. Él no conducía." },
    ]);
    expect(statusOf(resolved, withoutConfession).open.map((item) => item.id)).toEqual([id]);

    const reopened = ask(
      resolved,
      editor,
      {
        operation: "reopened",
        questionId: id,
        text: "Pedro mintió. Él no conducía.",
        sourceBlockIds: ["lie"],
        evidence: [{ blockId: "lie", text: blockText(editor, "lie") }],
        confidence: 0.95,
      },
      [id],
    );
    expect(statusOf(reopened, editor).open.map((item) => item.id)).toEqual([id]);
    editor.destroy();
    withoutConfession.destroy();
  });

  it("keeps an author question when the document changes and does not merge distinct interrogatives", () => {
    const { story, anaId } = people();
    const authored = addAuthorQuestion(story, "¿Dónde está la madre de Ana?", [anaId]);
    const editor = editorOf([{ id: "a", text: "Ana camina." }]);
    const rewritten = editorOf([{ id: "a", text: "El texto ya no es el mismo." }]);
    expect(statusOf(authored, editor).open).toHaveLength(1);
    expect(statusOf(authored, rewritten).open).toHaveLength(1);
    const first = ask(story, editor, introduced("¿Quién provocó el accidente?", "a", "Ana camina.", []));
    expect(first.questions ?? []).toHaveLength(0);
    const opened = ask(
      story,
      editorOf([{ id: "q", text: "Nadie sabe quién provocó el accidente." }]),
      introduced("¿Quién provocó el accidente?", "q", "Nadie sabe quién provocó el accidente.", [anaId]),
    );
    const causeEditor = editorOf([
      { id: "q", text: "Nadie sabe quién provocó el accidente." },
      { id: "c", text: "Nadie sabe quién causó el accidente." },
    ]);
    const duplicated = ask(opened, causeEditor, introduced("¿Quién causó el accidente?", "c", "Nadie sabe quién causó el accidente.", [anaId]));
    expect(duplicated.questions).toHaveLength(1);
    expect(questionsMatch("¿Quién provocó el accidente?", "¿Por qué se provocó el accidente?")).toBe(false);
    const why = ask(duplicated, editorOf([{ id: "w", text: "Nadie explica por qué se provocó el accidente." }]), introduced("¿Por qué se provocó el accidente?", "w", "Nadie explica por qué se provocó el accidente.", [anaId]));
    expect(why.questions).toHaveLength(2);
    editor.destroy();
    rewritten.destroy();
    causeEditor.destroy();
  });

  it("drops an invalid question event and still applies the rest of the delta", () => {
    const { story, anaId } = people();
    const editor = editorOf([{ id: "b1", text: "Ana mira el coche después del accidente." }]);
    const applied = applyStoryDelta(story, editor.state.doc, cite(editor, ["b1"], [anaId]), {
      events: [],
      stateChanges: [],
      facts: [
        {
          entityId: anaId,
          text: "Ana mira el coche después del accidente.",
          sourceBlockIds: ["b1"],
          evidence: [{ blockId: "b1", text: "Ana mira el coche" }],
          confidence: 0.95,
          predicate: "",
          value: "",
        },
      ],
      analyzedBlockIds: ["b1"],
      questionEvents: [
        {
          operation: "introduced",
          questionText: "¿Qué hará Ana ahora?",
          text: "Ana mira el coche",
          sourceBlockIds: ["b1"],
          evidence: [{ blockId: "b1", text: "Ana mira el coche" }],
          confidence: 0.99,
        },
      ],
    });
    expect(applied.story.entities.find((item) => item.id === anaId)?.textFacts).toHaveLength(1);
    expect(applied.story.questions ?? []).toHaveLength(0);
    editor.destroy();
  });

  it("answers local question queries without a model call", () => {
    const { story, anaId } = people();
    const withQuestion = addAuthorQuestion(story, "¿Quién provocó el accidente?", [anaId]);
    const editor = editorOf([{ id: "b1", text: "Ana espera." }]);
    const asked = buildStoryAsk(editor.state.doc, withQuestion, {
      scope: { type: "global" },
      question: "¿Qué cabos tiene Ana?",
    });
    expect(asked.metrics.local).toBe(true);
    expect(asked.localAnswer).toContain("¿Quién provocó el accidente?");
    editor.destroy();
  });

  it("shows pending threads in Story and hides them in article without deleting them", () => {
    const { story, anaId } = people();
    const withQuestion = addAuthorQuestion(story, "¿Quién provocó el accidente?", [anaId]);
    const scriptSnapshot = buildStorySnapshot(withQuestion, [], [], 0, undefined, getWriterContextAdapter("screenplay"));
    const articleSnapshot = buildStorySnapshot(withQuestion, [], [], 0, undefined, getWriterContextAdapter("article"));
    expect(scriptSnapshot.openQuestions).toBe(1);
    expect(articleSnapshot.openQuestions).toBe(0);
    expect(withQuestion.questions).toHaveLength(1);
    expect(getWriterContextAdapter("post").supports.narrativeQuestions).toBe(false);
    expect(getWriterContextAdapter("document").supports.narrativeQuestions).toBe(false);
    expect(getWriterContextAdapter("book").supports.narrativeQuestions).toBe(true);
  });
});

describe("story scale", () => {
  it("caps home, notes, relations and ask context", async () => {
    const names = ["Ana", "Pedro", "Lucía", "Marcos", "Elena", "Iván", "Nuria", "Hugo"];
    let story = emptyWriterStory();
    const ids: string[] = [];
    for (const name of names) {
      const next = createStoryEntity(story, { label: name, group: "character" });
      story = next.story;
      ids.push(next.entity?.id ?? "");
    }
    const elements = ["El accidente", "La carta", "El taller", "La deuda"];
    const elementIds: string[] = [];
    for (const label of elements) {
      const next = createStoryEntity(story, { label, group: "story" });
      story = next.story;
      elementIds.push(next.entity?.id ?? "");
    }
    const anaId = ids[0] ?? "";
    for (let index = 0; index < 12; index += 1) {
      const next = createStoryEntity(story, { label: `Hilo ${index}`, group: "story" });
      story = addStoryAuthorRelation(next.story, { fromEntityId: anaId, toEntityId: next.entity?.id ?? "", phrase: "aliado" });
    }
    for (let index = 0; index < 20; index += 1) {
      const noted = addStoryEntityNote(story, anaId, `Nota de escala ${index} sobre Ana.`);
      story = noted.story;
    }
    const ana = story.entities.find((item) => item.id === anaId);
    if (ana) {
      ana.events = Array.from({ length: 40 }, (_, index) => ({
        id: `ev-${index}`,
        text: `Acontecimiento ${index} de Ana en la carretera.`,
        sourceBlockIds: ["scale-block"],
        order: index,
        chapterLabel: null,
        fingerprint: `fp-${index}`,
        sourceHashes: {},
        evidence: [],
        analysisVersion: 1,
      }));
    }
    const prompts = [
      "¿Quién provocó el accidente?",
      "¿Dónde está la madre de Ana?",
      "¿Quién escribió la carta?",
      "¿Por qué Pedro cambió su versión?",
      "¿Quién manipuló el coche?",
      "¿Dónde se escondió el conductor?",
      "¿Cuándo salió Ana del taller?",
      "¿Quién pagó la factura?",
      "¿Por qué desapareció el maletín?",
      "¿Quién avisó a la policía?",
    ];
    prompts.forEach((text, index) => {
      const related = index === prompts.length - 1 ? [elementIds[0] ?? ""] : [anaId, elementIds[index % elementIds.length] ?? ""];
      story = addAuthorQuestion(story, text, related);
    });
    const resolved = addAuthorQuestion(story, "¿Dónde quedó la factura del taller?", [anaId]);
    const resolvedId = resolved.questions?.at(-1)?.id ?? "";
    story = setQuestionOverride(resolved, resolvedId, "resolved");

    const blocks: StoryDocumentBlock[] = [];
    for (let index = 0; index < 15; index += 1) {
      const order = index * 2;
      blocks.push({
        blockId: `scene-${index}`,
        type: "sceneHeading",
        text: `INT. LUGAR ${String(index + 1).padStart(2, "0")} - NOCHE`,
        order,
        chapterId: "ch-1",
        chapterLabel: "Capítulo 1",
        scene: null,
      });
      blocks.push({
        blockId: `beat-${index}`,
        type: "action",
        text: `Ana cruza el lugar ${index + 1}.`,
        order: order + 1,
        chapterId: "ch-1",
        chapterLabel: "Capítulo 1",
        scene: `INT. LUGAR ${String(index + 1).padStart(2, "0")} - NOCHE`,
      });
    }
    const snapshot = buildStorySnapshot(story, blocks, [], 25, undefined, getWriterContextAdapter("screenplay"));
    expect(snapshot.units).toHaveLength(15);
    expect(snapshot.unitPreview.length).toBeLessThanOrEqual(4);
    expect(snapshot.characters.length).toBeLessThanOrEqual(8);
    expect(snapshot.characterTotal).toBe(8);
    expect(snapshot.openQuestions).toBe(10);
    expect(JSON.stringify(snapshot)).not.toContain("Acontecimiento 39");

    const anaView = buildEntityPresentation(
      story,
      story.entities.find((item) => item.id === anaId)!,
      blocks,
      [],
      [],
      undefined,
      getWriterContextAdapter("screenplay"),
    );
    expect(anaView.openQuestions).toHaveLength(9);
    expect(anaView.resolvedQuestions).toBe(1);
    expect(anaView.notes.length).toBe(20);

    const user = userEvent.setup();
    render(<StoryView story={story} blocks={blocks} profile="screenplay" onStory={() => undefined} onClose={() => undefined} />);
    expect(screen.getByRole("button", { name: "10 cabos abiertos →" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Ana" }));
    const panel = document.querySelector(".writer-story-entity");
    expect(panel).toBeTruthy();
    const card = within(panel as HTMLElement);
    expect(card.getByText("18 notas más →")).toBeTruthy();
    expect(card.getByRole("button", { name: "Ver todas →" })).toBeTruthy();
    expect(card.queryByText("Hilo 11")).toBeNull();
    await user.click(card.getByRole("button", { name: "Ver todas →" }));
    expect(card.getByText("Hilo 11")).toBeTruthy();
    await user.type(screen.getByRole("textbox", { name: "Buscar en Story" }), "madre");
    const results = within(screen.getByRole("listbox", { name: "Resultados de Story" }));
    expect(results.getByText("Pendiente")).toBeTruthy();
    expect(results.getByText("¿Dónde está la madre de Ana?")).toBeTruthy();
    expect(screen.getAllByText(/¿Quién provocó el accidente\?|¿Dónde está la madre/).length).toBeGreaterThan(0);

    cleanup();
    render(<StoryView story={story} blocks={blocks} profile="article" onStory={() => undefined} onClose={() => undefined} />);
    expect(screen.queryByText(/cabos abiertos/)).toBeNull();
    expect(story.questions?.filter((item) => item.authorOverride !== "resolved")).toHaveLength(10);

    const editor = editorOf([{ id: "ask", text: "Ana cruza el lugar." }]);
    const asked = buildStoryAsk(editor.state.doc, story, {
      scope: { type: "entity", entityId: anaId },
      question: "¿Qué ha pasado con el coche de Ana?",
    });
    expect(asked.metrics.local).toBe(false);
    expect(asked.metrics.questions).toBeLessThanOrEqual(6);
    expect(asked.metrics.questions).toBeGreaterThan(0);
    expect(asked.metrics.entities).toBeLessThanOrEqual(4);
    expect(asked.metrics.events).toBeLessThanOrEqual(4);
    editor.destroy();

    const dirty = editorOf(Array.from({ length: 25 }, (_, index) => ({ id: `d-${index}`, text: `Cambio pendiente ${index} en la carretera.` })));
    const plan = planStoryUpdate(dirty.state.doc, story);
    expect(plan.dirtyCount).toBeGreaterThanOrEqual(20);
    expect(plan.dirtyCount).toBeLessThanOrEqual(30);
    dirty.destroy();

    let wide = emptyWriterStory();
    for (let index = 0; index < 100; index += 1) {
      const next = createStoryEntity(wide, { label: `Ficha ${index}`, group: "story" });
      wide = next.story;
      wide = addAuthorQuestion(wide, `¿Quién guardó objeto${index} del accidente?`, [next.entity?.id ?? ""]);
    }
    const indexed = questionIndex(wide.questions ?? [], new Map());
    expect(indexed.open).toHaveLength(100);
    expect(indexed.byEntity.size).toBe(100);
    const wideSnapshot = buildStorySnapshot(wide, blocks, [], 0, undefined, getWriterContextAdapter("screenplay"));
    expect(wideSnapshot.openQuestions).toBe(100);
  });
});

describe("question prompts", () => {
  it("asks for question events inside the same update completion", () => {
    const messages = writerAiMessages({
      action: "update_story",
      profile: "screenplay",
      selection: "",
      batch: { dirty: [], context: [], entities: [], questions: [{ id: "q-1", text: "¿Quién provocó el accidente?" }] },
      preview: { blocks: 1, characters: 1, chapterCount: 1, calls: 1, plannedInputChars: 20 },
    });
    expect(messages.system).toContain("questionEvents");
    expect(messages.user).toContain("PENDIENTES");
    expect(messages.user).toContain("q-1");
  });
});
