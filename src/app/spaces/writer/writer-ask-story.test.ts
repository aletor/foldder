import { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { WriterBlockId } from "./writer-block-id";
import { WriterChapter, WriterChapterTitle } from "./writer-chapter";
import { buildStoryAsk, storyAskContext } from "./writer-ask-story";
import { createWriterStarterKit, writerScreenplayNodes } from "./writer-screenplay";
import { writerFactsFromMemory } from "./writer-facts";
import {
  addStoryEntityNote,
  addStoryIdea,
  createStoryEntity,
  emptyWriterStory,
  projectWriterMemory,
  setStoryDefinition,
} from "./writer-story";
import { parseStoryAskModelAnswer, writerAiMessages } from "./writer-ai";

function script(content: Record<string, unknown>) {
  return new Editor({
    extensions: [createWriterStarterKit(), WriterBlockId, WriterChapter, WriterChapterTitle, ...writerScreenplayNodes],
    content,
  });
}

function pedroWithAna() {
  const pedro = createStoryEntity(emptyWriterStory(), { label: "Pedro", group: "character" });
  const pedroId = pedro.entity?.id ?? "";
  const defined = setStoryDefinition(
    pedro.story,
    pedroId,
    "Pedro tiene 38 años. Es orgulloso, reservado y no sabe pedir ayuda.",
  );
  const noted = addStoryEntityNote(defined, pedroId, "Su hermana es la única persona ante la que muestra vulnerabilidad.").story;
  const ana = createStoryEntity(noted, { label: "Ana", group: "character" });
  const anaId = ana.entity?.id ?? "";
  const story = setStoryDefinition(ana.story, anaId, "Ana trabaja en el puerto y no pide explicaciones.");
  return { story, pedroId, anaId };
}

describe("Ask Story", () => {
  it("builds Pedro's definition, note and recent scene without a summary", () => {
    const { story, pedroId } = pedroWithAna();
    const editor = script({
      type: "doc",
      content: [
        {
          type: "chapter",
          attrs: { id: "ch-1" },
          content: [
            { type: "sceneHeading", attrs: { blockId: "scene-1" }, content: [{ type: "text", text: "INT. CASA – DÍA" }] },
            { type: "action", attrs: { blockId: "old" }, content: [{ type: "text", text: "Pedro entra en la habitación." }] },
          ],
        },
        {
          type: "chapter",
          attrs: { id: "ch-2" },
          content: [
            { type: "sceneHeading", attrs: { blockId: "scene-2" }, content: [{ type: "text", text: "EXT. PUERTO – NOCHE" }] },
            { type: "character", attrs: { blockId: "cue" }, content: [{ type: "text", text: "PEDRO" }] },
            { type: "action", attrs: { blockId: "fresh" }, content: [{ type: "text", text: "Pedro deja las llaves y sale al puerto." }] },
          ],
        },
      ],
    });
    const pkg = buildStoryAsk(editor.state.doc, story, {
      scope: { type: "entity", entityId: pedroId },
      question: "¿Cuál podría ser ahora la motivación de Pedro?",
    });
    expect(pkg.localAnswer).toBeNull();
    expect(pkg.entityIds).toEqual([pedroId]);
    expect(pkg.stableContext[0]?.definition).toContain("orgulloso");
    expect(pkg.stableContext[0]?.notes.map((note) => note.text).join(" ")).toContain("vulnerabilidad");
    expect(pkg.stableContext[0]?.facts).toContain("edad 38");
    expect(pkg.freshContext.map((block) => block.text).join(" ")).toContain("puerto");
    expect(pkg.stableContext[0]?.state).toBe("");
    const context = storyAskContext(pkg);
    const messages = writerAiMessages({
      action: "ask_story",
      profile: "screenplay",
      selection: pkg.question,
      question: pkg.question,
      previous: null,
      preview: pkg.preview,
      storyContext: context,
    });
    expect(messages.user).toContain("orgulloso");
    expect(messages.user).toContain("vulnerabilidad");
    expect(messages.user).toContain("puerto");
    expect(messages.system).toContain("No inventes");
    expect(messages.system).not.toContain("Devuelve solo el texto propuesto");
    editor.destroy();
  });

  it("keeps a matching note when there are many others", () => {
    const { story, pedroId } = pedroWithAna();
    let packed = story;
    for (let index = 0; index < 20; index += 1) {
      packed = addStoryEntityNote(packed, pedroId, `Quizá un apunte suelto número ${index}.`).story;
    }
    const editor = script({ type: "doc", content: [{ type: "paragraph", attrs: { blockId: "p" }, content: [{ type: "text", text: "Pedro espera." }] }] });
    const pkg = buildStoryAsk(editor.state.doc, packed, {
      scope: { type: "entity", entityId: pedroId },
      question: "¿Qué recuerda Pedro de su hermana?",
    });
    expect(pkg.stableContext[0]?.notes.some((note) => note.text.includes("vulnerabilidad"))).toBe(true);
    expect(pkg.stableContext[0]?.notes.length).toBeLessThanOrEqual(8);
    editor.destroy();
  });

  it("adds Ana when the question names her and ignores a name it cannot resolve", () => {
    const { story, pedroId, anaId } = pedroWithAna();
    const editor = script({ type: "doc", content: [{ type: "paragraph", attrs: { blockId: "p" }, content: [{ type: "text", text: "Pedro mira a Ana." }] }] });
    const both = buildStoryAsk(editor.state.doc, story, {
      scope: { type: "entity", entityId: pedroId },
      question: "¿Cómo podría afectar esto a Ana?",
    });
    expect(both.localAnswer).toBeNull();
    expect(both.entityIds).toEqual([pedroId, anaId]);
    expect(both.stableContext.map((slice) => slice.label)).toEqual(["Pedro", "Ana"]);
    const missing = buildStoryAsk(editor.state.doc, story, {
      scope: { type: "entity", entityId: pedroId },
      question: "¿Cómo podría afectar esto a Marta?",
    });
    expect(missing.entityIds).toEqual([pedroId]);
    editor.destroy();
  });

  it("does not invent an entity when an alias is shared", () => {
    const { story, pedroId, anaId } = pedroWithAna();
    const luis = createStoryEntity(story, { label: "Luis", group: "character" });
    const shared = {
      ...luis.story,
      entities: luis.story.entities.map((entity) =>
        entity.id === anaId || entity.id === luis.entity?.id ? { ...entity, aliases: [...entity.aliases, "Nico"] } : entity,
      ),
    };
    const editor = script({ type: "doc", content: [{ type: "paragraph", attrs: { blockId: "p" } }] });
    const pkg = buildStoryAsk(editor.state.doc, shared, {
      scope: { type: "entity", entityId: pedroId },
      question: "¿Cómo podría afectar esto a Nico?",
    });
    expect(pkg.entityIds).toEqual([pedroId]);
    editor.destroy();
  });

  it("answers objective questions locally", () => {
    const { story, pedroId, anaId } = pedroWithAna();
    const editor = script({
      type: "doc",
      content: [
        {
          type: "chapter",
          attrs: { id: "ch-1" },
          content: [
            { type: "action", attrs: { blockId: "a1" }, content: [{ type: "text", text: "Pedro entra." }] },
            { type: "action", attrs: { blockId: "a2" }, content: [{ type: "text", text: "Pedro recuerda el accidente." }] },
            { type: "action", attrs: { blockId: "a3" }, content: [{ type: "text", text: "Ana cruza la calle." }] },
          ],
        },
      ],
    });
    const least = buildStoryAsk(editor.state.doc, story, {
      scope: { type: "global" },
      question: "¿Qué personajes aparecen menos?",
    });
    expect(least.localAnswer).toContain("Ana");
    expect(least.localAnswer).toMatch(/1 aparición/);
    const count = buildStoryAsk(editor.state.doc, story, {
      scope: { type: "global" },
      question: "¿Cuántas veces aparece Pedro?",
    });
    expect(count.localAnswer).toBe("Pedro aparece 2 veces.");
    const first = buildStoryAsk(editor.state.doc, story, {
      scope: { type: "entity", entityId: pedroId },
      question: "¿Dónde aparece Pedro por primera vez?",
    });
    expect(first.localAnswer).toContain("CAP. 1");
    expect(first.localAnswer).toContain("Pedro entra.");
    const mention = buildStoryAsk(editor.state.doc, story, {
      scope: { type: "global" },
      question: "¿Dónde mencioné el accidente?",
    });
    expect(mention.localAnswer).toContain("accidente");
    expect(mention.localAnswer).not.toMatch(/no encuentro/i);
    const unknown = buildStoryAsk(editor.state.doc, story, {
      scope: { type: "global" },
      question: "¿Cuántas veces aparece Juan?",
    });
    expect(unknown.localAnswer).toMatch(/No encuentro a Juan/);
    expect(anaId).toBeTruthy();
    editor.destroy();
  });

  it("does not treat the father's death as established when Story never says it", () => {
    const { story, pedroId } = pedroWithAna();
    const editor = script({ type: "doc", content: [{ type: "paragraph", attrs: { blockId: "p" }, content: [{ type: "text", text: "Pedro espera." }] }] });
    const pkg = buildStoryAsk(editor.state.doc, story, {
      scope: { type: "entity", entityId: pedroId },
      question: "¿Cómo afecta la muerte del padre de Pedro?",
    });
    expect(pkg.localAnswer).toBeNull();
    const packed = JSON.stringify(storyAskContext(pkg));
    expect(packed).not.toContain("murió");
    expect(packed).not.toContain("muerto");
    const messages = writerAiMessages({
      action: "ask_story",
      profile: "document",
      selection: pkg.question,
      question: pkg.question,
      previous: pkg.prior,
      preview: pkg.preview,
      storyContext: storyAskContext(pkg),
    });
    expect(messages.system).toContain("no lo des por ocurrido");
    expect(messages.user).toContain("Definición: Pedro tiene 38 años");
    editor.destroy();
  });

  it("saves an idea as tentative and keeps it out of the facts", () => {
    const { story, pedroId } = pedroWithAna();
    const text = "Pedro protege a Ana para no mostrar su vulnerabilidad.";
    const saved = addStoryIdea(story, { text, entityId: pedroId });
    const note = saved.story.entities.find((entity) => entity.id === pedroId)?.notes.find((item) => item.text === text);
    expect(note).toMatchObject({ status: "tentative", authority: "ai", idea: "pending" });
    expect(saved.story.entities.find((entity) => entity.id === pedroId)?.definition).toContain("orgulloso");
    const projected = projectWriterMemory(saved.story);
    const entry = projected.find((item) => item.text === text);
    expect(entry?.kind).toBe("idea");
    expect(entry?.facts).toEqual([]);
    expect(writerFactsFromMemory({ text, status: "tentative", scope: { type: "entity", entityId: "pedro" } })).toEqual([]);
  });

  it("keeps only the previous turn and reads a JSON answer", () => {
    const { story, pedroId } = pedroWithAna();
    const editor = script({ type: "doc", content: [{ type: "paragraph", attrs: { blockId: "p" }, content: [{ type: "text", text: "Pedro espera." }] }] });
    const pkg = buildStoryAsk(editor.state.doc, story, {
      scope: { type: "entity", entityId: pedroId },
      question: "¿Qué podría impedirle conseguirlo?",
      previous: { question: "¿Cuál podría ser su motivación?", answer: "Recuperar el control." },
    });
    expect(pkg.prior).toEqual({ question: "¿Cuál podría ser su motivación?", answer: "Recuperar el control." });
    const parsed = parseStoryAskModelAnswer(
      '```json\n{"answer":"Una posible traba sería su orgullo.","suggestedMemories":[{"text":"El orgullo le impide pedir ayuda.","scopeEntityId":"otro"}],"conversationSummary":"Se explora el orgullo de Pedro.","events":[{"text":"muere el padre"}]}\n```',
    );
    expect(parsed).toEqual({
      answer: "Una posible traba sería su orgullo.",
      suggestedMemories: [{ text: "El orgullo le impide pedir ayuda." }],
      usedContextSummary: "",
      conversationSummary: "Se explora el orgullo de Pedro.",
    });
    expect(JSON.stringify(parsed)).not.toContain("events");
    expect(parseStoryAskModelAnswer("Pedro quiere vengar a su padre")?.answer).toContain("Pedro");
    expect(parseStoryAskModelAnswer('Texto previo {"answer":"Respuesta concreta.","suggestedMemories":[]}')?.answer).toBe("Respuesta concreta.");
    expect(
      parseStoryAskModelAnswer('{"answer":"Perfil de Juan.","suggestedMemories":[],"storyDelta":{"events":[{"text":"x"}')?.answer,
    ).toBe("Perfil de Juan.");
    editor.destroy();
  });

  it("routes entity profile to LLM context and ignores junk character labels in roster", () => {
    const { story, pedroId } = pedroWithAna();
    const junk = createStoryEntity(story, { label: "¿sabes que juan se cayó de la cama?", group: "character" });
    const withJunk = junk.story;
    const editor = script({
      type: "doc",
      content: [{ type: "paragraph", attrs: { blockId: "p" }, content: [{ type: "text", text: "Juan entra." }] }],
    });
    const roster = buildStoryAsk(editor.state.doc, withJunk, {
      scope: { type: "global" },
      question: "qué actores hay y como son",
    });
    expect(roster.localAnswer).toContain("Pedro");
    expect(roster.localAnswer).not.toContain("cayó de la cama");
    const profile = buildStoryAsk(editor.state.doc, withJunk, {
      scope: { type: "global" },
      question: "perfil de Pedro",
      conversation: {
        id: "c1",
        scope: { type: "global" },
        summary: "Se listaron personajes.",
        recentTurns: [{ question: "qué actores hay", answer: roster.localAnswer ?? "" }],
        relevantEntityIds: [pedroId],
        updatedAt: new Date().toISOString(),
      },
    });
    expect(profile.localAnswer).toBeNull();
    expect(profile.entityIds).toContain(pedroId);
    expect(profile.metrics.local).toBe(false);
    expect(profile.stableContext.some((slice) => slice.entityId === pedroId && slice.definition.includes("orgulloso"))).toBe(true);
    expect(pedroId).toBeTruthy();
    editor.destroy();
  });

  it("answers roster and script overview locally from Story Home", () => {
    const { story, pedroId } = pedroWithAna();
    const editor = script({
      type: "doc",
      content: [{ type: "paragraph", attrs: { blockId: "p" }, content: [{ type: "text", text: "Pedro mira a Ana." }] }],
    });
    const actors = buildStoryAsk(editor.state.doc, story, { scope: { type: "global" }, question: "qué actores hay" });
    expect(actors.localAnswer).toContain("Pedro");
    expect(actors.localAnswer).toContain("Ana");
    expect(actors.metrics.local).toBe(true);
    const overview = buildStoryAsk(editor.state.doc, story, {
      scope: { type: "global" },
      question: "¿Qué me puedes decir del guion?",
    });
    expect(overview.localAnswer).toContain("Pedro");
    expect(overview.localAnswer).not.toMatch(/narrativa estructurada/i);
    expect(overview.metrics.local).toBe(true);
    expect(pedroId).toBeTruthy();
    editor.destroy();
  });

  it("packs conversation summary and recent turns without the full chat", () => {
    const { story, pedroId, anaId } = pedroWithAna();
    const editor = script({
      type: "doc",
      content: [{ type: "paragraph", attrs: { blockId: "p" }, content: [{ type: "text", text: "Pedro mira a Ana." }] }],
    });
    const conversation = {
      id: "c1",
      scope: { type: "entity" as const, entityId: pedroId },
      summary: "Se explora que Pedro intente recuperar control protegiendo a Ana.",
      recentTurns: [
        { question: "¿Cuál podría ser ahora la motivación de Pedro?", answer: "Proteger a Ana." },
        { question: "¿Qué podría impedírselo?", answer: "Su orgullo y su lesión." },
      ],
      relevantEntityIds: [pedroId],
      updatedAt: new Date().toISOString(),
    };
    const pkg = buildStoryAsk(editor.state.doc, story, {
      scope: { type: "entity", entityId: pedroId },
      question: "¿Y cómo afectaría eso a Ana?",
      conversation,
    });
    expect(pkg.localAnswer).toBeNull();
    expect(pkg.conversationSummary).toContain("recuperar control");
    expect(pkg.recentTurns).toHaveLength(2);
    expect(pkg.entityIds).toEqual([pedroId, anaId]);
    expect(pkg.metrics.local).toBe(false);
    const messages = writerAiMessages({
      action: "ask_story",
      profile: "screenplay",
      selection: pkg.question,
      question: pkg.question,
      previous: pkg.prior,
      preview: pkg.preview,
      storyContext: storyAskContext(pkg),
    });
    expect(messages.user).toContain("Resumen de la conversación");
    expect(messages.user).toContain("Turnos recientes");
    expect(messages.user).not.toContain("historial completo");
    expect(messages.system).toContain("manda Story");
    editor.destroy();
  });

  it("answers less-present characters locally and ignores stale chapter summaries", () => {
    const { story, pedroId, anaId } = pedroWithAna();
    const editor = script({
      type: "doc",
      content: [
        {
          type: "chapter",
          attrs: { id: "ch-1" },
          content: [
            { type: "action", attrs: { blockId: "a1" }, content: [{ type: "text", text: "Pedro entra." }] },
            { type: "action", attrs: { blockId: "a2" }, content: [{ type: "text", text: "Pedro habla." }] },
            { type: "action", attrs: { blockId: "a3" }, content: [{ type: "text", text: "Ana cruza." }] },
          ],
        },
        {
          type: "chapter",
          attrs: { id: "ch-2" },
          content: [
            { type: "action", attrs: { blockId: "b1" }, content: [{ type: "text", text: "Pedro vuelve." }] },
            { type: "action", attrs: { blockId: "b2" }, content: [{ type: "text", text: "Pedro espera." }] },
          ],
        },
      ],
    });
    const local = buildStoryAsk(editor.state.doc, story, {
      scope: { type: "global" },
      question: "¿Qué personajes están menos presentes últimamente?",
    });
    expect(local.localAnswer).toContain("Ana");
    expect(local.metrics.local).toBe(true);
    const stale = {
      ...story,
      chapterSummaries: [
        {
          chapterId: "ch-1",
          text: "Pedro y Ana se encuentran.",
          sourceBlockIds: ["a1", "a3"],
          sourceHashes: { a1: "old", a3: "old" },
          analysisVersion: 1,
          updatedAt: "2020-01-01T00:00:00.000Z",
        },
      ],
    };
    const pkg = buildStoryAsk(editor.state.doc, stale, {
      scope: { type: "entity", entityId: pedroId },
      question: "¿Cómo ha cambiado la relación entre Pedro y Ana?",
    });
    expect(pkg.chapterSummaries).toEqual([]);
    expect(pkg.entityIds).toEqual([pedroId, anaId]);
    expect(pkg.metrics.entities).toBe(2);
    editor.destroy();
  });

  it("keeps conversationSummary when storyDelta is invalid", () => {
    const parsed = parseStoryAskModelAnswer(
      JSON.stringify({
        answer: "Una posibilidad sería que Ana se enfrente a Pedro.",
        suggestedMemories: [],
        usedContextSummary: "Pedro y Ana",
        conversationSummary: "Se valora la tensión entre Pedro y Ana.",
        storyDelta: { events: [{ text: "sin id" }], stateChanges: [], facts: [], analyzedBlockIds: [] },
      }),
    );
    expect(parsed?.answer).toContain("Ana");
    expect(parsed?.conversationSummary).toContain("tensión");
    expect(parsed?.storyDelta?.events ?? []).toEqual([]);
  });
});
