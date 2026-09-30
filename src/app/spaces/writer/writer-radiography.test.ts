import { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { WriterBlockId } from "./writer-block-id";
import { buildStoryAsk, storyAskContext } from "./writer-ask-story";
import { writerDocumentBlocks, type StoryDocumentBlock } from "./writer-appearances";
import { parseStoryUpdateModelAnswer } from "./writer-ai";
import { getWriterContextAdapter } from "./writer-context";
import { applyStoryPresentation, buildEntityPresentation, buildGlobalStoryDigest, buildStorySnapshot } from "./writer-presentation";
import { createWriterStarterKit, writerScreenplayNodes } from "./writer-screenplay";
import { deriveStoryStructure, parseSceneHeading, sceneChronology } from "./writer-structure";
import { addAuthorQuestion } from "./writer-questions";
import { createStoryEntity, emptyWriterStory, type StoryEntity, type StoryEvent, type WriterStory } from "./writer-story";
import type { StoryRelation } from "./writer-relations";
import { executeStoryUpdate, planStoryUpdate } from "./writer-story-update";

function script(content: Record<string, unknown>) {
  return new Editor({
    extensions: [createWriterStarterKit(), WriterBlockId, ...writerScreenplayNodes],
    content,
  });
}

function block(type: string, blockId: string, text: string) {
  return { type, attrs: { blockId }, content: text ? [{ type: "text", text }] : [] };
}

function docBlock(blockId: string, type: string, text: string, order: number): StoryDocumentBlock {
  return { blockId, type, text, order, chapterId: "ch", chapterLabel: "Capítulo", scene: null };
}

function event(id: string, text: string, blockId: string, order: number): StoryEvent {
  return {
    id,
    text,
    sourceBlockIds: [blockId],
    order,
    chapterLabel: null,
    fingerprint: id,
    sourceHashes: { [blockId]: "h" },
    evidence: [{ blockId, text }],
    analysisVersion: 1,
  };
}

function person(id: string, label: string, events: StoryEvent[] = []): StoryEntity {
  return {
    id,
    label,
    aliases: [label],
    origin: "author",
    group: "character",
    bound: "entity",
    definition: "",
    notes: [],
    events,
    stateChanges: [],
    textFacts: [],
    stateSummary: null,
    traceSummary: null,
  };
}

function relation(id: string, from: string, to: string, label: string): StoryRelation {
  return {
    id,
    fromEntityId: from,
    toEntityId: to,
    type: "related",
    label,
    source: "author",
    sourceBlockIds: [],
    sourceHashes: {},
    evidence: [{ blockId: "s0", text: label }],
    documentOrder: 0,
    analysisVersion: 1,
  };
}

describe("story radiography", () => {
  it("reads clocks and a relative time only when an earlier scene has an anchor", () => {
    expect(parseSceneHeading("INT. HOSPITAL - PLANTA 2 - NOCHE").locationLabel).toBe("Hospital - Planta 2");
    expect(parseSceneHeading("INT. HOSPITAL - PLANTA 2 - NOCHE").timeLabel).toBeNull();
    expect(parseSceneHeading("INT. APARTAMENTO - 16:14").locationLabel).toBe("Apartamento");
    expect(parseSceneHeading("INT. APARTAMENTO - 16:14").timeLabel).toBe("16:14");

    const headings = ["INT. BAR OLVIDO - 19:13", "INT. COCINA - 17:13", "INT. PORTAL - 17:34", "INT. APARTAMENTO - 16:14", "INT. CASA - DOS HORAS ANTES"];
    const blocks = headings.map((text, index) => docBlock(`s${index}`, "sceneHeading", text, index));
    const structure = deriveStoryStructure(blocks);
    const clock = sceneChronology(structure.units);
    expect(clock.confident).toBe(true);
    expect(clock.nonlinear).toBe(true);
    expect(structure.units.map((unit) => unit.timeLabel)).toEqual(["19:13", "17:13", "17:34", "16:14", "dos horas antes"]);
    expect(structure.units[4]?.parsedMinutes).toBe(16 * 60 + 14 - 120);
    expect(structure.units.map((unit) => unit.chronologyOrder)).toEqual([5, 3, 4, 2, 1]);

    const loose = deriveStoryStructure([
      docBlock("a", "sceneHeading", "INT. CASA - NOCHE", 0),
      docBlock("b", "sceneHeading", "INT. CALLE - DÍA", 1),
      docBlock("c", "sceneHeading", "INT. PARQUE - DOS HORAS ANTES", 2),
    ]);
    expect(sceneChronology(loose.units).confident).toBe(false);
    expect(loose.units.every((unit) => unit.parsedMinutes == null && unit.chronologyOrder == null)).toBe(true);
  });

  it("does not let a minor batch replace the whole-work overview", async () => {
    const ana = person("ana", "Ana", [event("e1", "Ana descubre que el ADN coincide.", "s1", 1)]);
    let story: WriterStory = { ...emptyWriterStory(), entities: [ana] };
    const live = new Map([["s1", "h1"], ["b9", "h9"]]);
    const early = applyStoryPresentation(
      story,
      { storyBrief: { text: "Ana sonríe.", sourceBlockIds: ["b9"] }, sceneBriefs: [{ sceneId: "s1", text: "Ana encuentra el informe.", sourceBlockIds: ["b9"] }] },
      [{ blockId: "b9", hash: "h9" }],
      ["ana"],
      { final: false, live },
    );
    expect(early.story.presentation?.storyBrief).toBeUndefined();
    expect(early.story.presentation?.sceneBriefs?.s1?.text).toBe("Ana encuentra el informe.");

    const overview = "Ana investiga un ADN que la lleva del Bar Olvido al apartamento de su madre.";
    const global = applyStoryPresentation(
      early.story,
      {
        storyBrief: { text: "Alguien mueve un vaso.", sourceBlockIds: ["b9"] },
        globalPresentation: {
          storyOverview: { text: overview, sceneIds: ["s1"] },
          entityArcBriefs: [{ entityId: "ana", text: "Ana sigue el ADN desde el bar hasta enfrentarse a su madre." }],
          entityCurrentBriefs: [{ entityId: "ana", text: "Ana sonríe." }],
        },
      },
      [{ blockId: "b9", hash: "h9" }],
      ["ana"],
      { final: true, live },
    );
    expect(global.story.presentation?.storyBrief?.text).toBe(overview);
    expect(global.story.entities[0]?.textFacts).toEqual([]);

    const kept = applyStoryPresentation(
      global.story,
      { storyBrief: { text: "Alguien mueve un vaso.", sourceBlockIds: ["b9"] } },
      [{ blockId: "b9", hash: "h9" }],
      ["ana"],
      { final: true, live },
    );
    expect(kept.story.presentation?.storyBrief?.text).toBe(overview);

    const editor = script({
      type: "doc",
      content: Array.from({ length: 25 }, (_, index) => block("action", `b${index}`, `Bloque ${index}.`)),
    });
    const plan = planStoryUpdate(editor.state.doc, emptyWriterStory());
    expect(plan.calls).toBe(2);
    let current = emptyWriterStory();
    let calls = 0;
    await executeStoryUpdate({
      getDoc: () => editor.state.doc,
      getStory: () => current,
      plan,
      request: async (batch, index) => {
        calls += 1;
        const blockId = batch.dirty[0]?.blockId ?? "b0";
        if (index < plan.batches.length - 1) {
          return {
            ok: true as const,
            storyDelta: { events: [], stateChanges: [], facts: [], analyzedBlockIds: batch.cited.map((item) => item.blockId), chapterSummaries: [] },
            presentationDelta: { storyBrief: { text: "Solo un vaso.", sourceBlockIds: [blockId] } },
          };
        }
        return {
          ok: true as const,
          storyDelta: { events: [], stateChanges: [], facts: [], analyzedBlockIds: batch.cited.map((item) => item.blockId), chapterSummaries: [] },
          presentationDelta: {
            storyBrief: { text: "Solo un vaso.", sourceBlockIds: [blockId] },
            globalPresentation: { storyOverview: { text: "La obra sigue a Ana a través de varias escenas.", sceneIds: [blockId] } },
          },
        };
      },
      commit: (next) => {
        current = next;
      },
    });
    expect(calls).toBe(2);
    expect(current.presentation?.storyBrief?.text).toBe("La obra sigue a Ana a través de varias escenas.");
    editor.destroy();
  });

  it("keeps the arc apart from the last smile and drops an unsupported revelation", () => {
    const ana = person("ana", "Ana", [event("e1", "Ana descubre que el ADN coincide.", "s1", 2)]);
    const eneko = person("eneko", "Eneko");
    const mother = person("madre", "Madre");
    const blocks = [
      docBlock("s1", "sceneHeading", "INT. BAR OLVIDO - 19:13", 0),
      docBlock("c1", "character", "ANA", 1),
      docBlock("a1", "action", "Ana descubre que el ADN coincide.", 2),
    ];
    const live = new Map(blocks.map((item) => [item.blockId, "h"]));
    const applied = applyStoryPresentation(
      {
        ...emptyWriterStory(),
        entities: [ana, eneko, mother],
        relations: [relation("r1", "ana", "eneko", "Eneko trabaja con Ana."), relation("r2", "ana", "madre", "La madre ocultó el informe."), relation("r3", "eneko", "madre", "Eneko conoce a la madre.")],
      },
      {
        globalPresentation: {
          storyOverview: { text: "Ana investiga el ADN.", sceneIds: ["s1"] },
          entityArcBriefs: [{ entityId: "ana", text: "Ana sigue el ADN desde el bar hasta su madre." }],
          entityCurrentBriefs: [{ entityId: "ana", text: "Ana sonríe." }],
          relationLines: [
            { relationId: "r1", text: "Eneko trabaja con Ana." },
            { relationId: "missing", text: "Una relación que no existe." },
          ],
          revelations: [
            { text: "La historia habla de identidad.", support: [{ kind: "event", id: "e1" }] },
            { text: "Eneko lo sabía desde el principio.", support: [{ kind: "event", id: "e1" }] },
            { text: "Ana descubre que el ADN coincide.", support: [{ kind: "event", id: "e1" }] },
            { text: "Alguien mintió.", support: [{ kind: "event", id: "no-such" }] },
          ],
        },
      },
      [{ blockId: "s1", hash: "h" }],
      ["ana"],
      { final: true, live },
    );
    expect(applied.story.relations).toHaveLength(3);
    expect(applied.story.presentation?.revelations?.map((item) => item.text)).toEqual(["Ana descubre que el ADN coincide."]);
    expect(applied.story.presentation?.relationLines?.missing).toBeUndefined();
    const snapshot = buildStorySnapshot(applied.story, blocks, [], 0, live);
    const anaRow = snapshot.characters.find((item) => item.id === "ana");
    expect(anaRow?.arc).toBe("Ana sigue el ADN desde el bar hasta su madre.");
    expect(anaRow?.brief).toBe("Ana sonríe.");
    expect(snapshot.relationsPreview).toHaveLength(3);
    const view = buildEntityPresentation(applied.story, applied.story.entities[0]!, blocks, [], [], live);
    expect(view.arcBrief?.text).toContain("desde el bar");
    expect(view.brief?.text).toBe("Ana sonríe.");
    expect(view.tracePreview[0]?.text).toContain("ADN");
  });

  it("lists a sane cue that was not promoted and counts a new location without a call", () => {
    const ana = person("ana", "Ana");
    const blocks = [
      docBlock("s1", "sceneHeading", "INT. BAR OLVIDO - NOCHE", 0),
      docBlock("c1", "character", "ANA", 1),
      docBlock("c2", "character", "MARTA", 2),
      docBlock("s2", "sceneHeading", "INT. APARTAMENTO - NOCHE", 3),
    ];
    const first = buildStorySnapshot({ ...emptyWriterStory(), entities: [ana] }, blocks.slice(0, 3), [], 2);
    expect(first.counts.locations).toBe(1);
    expect(first.secondaryNames).toContain("Marta");
    expect(first.characters.map((item) => item.title)).toEqual(["Ana"]);
    const next = buildStorySnapshot({ ...emptyWriterStory(), entities: [ana] }, blocks, [], 3);
    expect(next.counts.locations).toBe(2);
    expect(next.locationPreview).toHaveLength(2);
  });

  it("keeps a large story inside the home caps and out of Ask truth", () => {
    const ids = Array.from({ length: 12 }, (_, index) => `p${index}`);
    const places = ["Bar Olvido", "Apartamento", "Hospital", "Cocina", "Portal", "Calle", "Taller", "Azotea"];
    const blocks: StoryDocumentBlock[] = [];
    for (let index = 0; index < 50; index += 1) {
      blocks.push(docBlock(`s${index}`, "sceneHeading", `INT. ${places[index % places.length]} - NOCHE`, index * 2));
      blocks.push(docBlock(`a${index}`, "action", `Pasa algo en la escena ${index}.`, index * 2 + 1));
    }
    const entities = ids.map((id, index) => person(
      id,
      `Persona ${index}`,
      Array.from({ length: index === 0 ? 20 : 8 }, (_, eventIndex) => event(`${id}-e${eventIndex}`, `Acontecimiento ${id} ${eventIndex}`, `s${(index + eventIndex) % 50}`, eventIndex)),
    ));
    let story: WriterStory = {
      ...emptyWriterStory(),
      entities,
      relations: Array.from({ length: 30 }, (_, index) => relation(`rel-${index}`, ids[index % 12] ?? "p0", ids[(index + 3) % 12] ?? "p1", `Vínculo ${index}`)),
    };
    const prompts = [
      "¿Quién manipuló el coche?",
      "¿Dónde está la madre de Ana?",
      "¿Por qué se apagó la luz?",
      "¿Quién cerró el bar?",
      "¿Dónde quedó el informe?",
      "¿Cuándo llegó Eneko?",
      "¿Quién llamó a la madre?",
      "¿Qué había en el sobre?",
      "¿Dónde se escondió el conductor?",
      "¿Quién pagó la factura?",
      "¿Por qué desapareció el maletín?",
      "¿Quién avisó a la policía?",
      "¿Dónde estaba el segundo informe?",
      "¿Cuándo salió Ana del taller?",
      "¿Quién vio a Marta?",
      "¿Qué dijo la doctora?",
      "¿Dónde quedó la llave?",
      "¿Por qué mintió el portero?",
      "¿Quién abrió el apartamento?",
      "¿Qué pasó con el vaso?",
    ];
    for (const text of prompts) story = addAuthorQuestion(story, text, [ids[0] ?? "p0"]);
    story = {
      ...story,
      presentation: {
        storyBrief: {
          text: "FRASE GLOBAL UNICA",
          sourceBlockIds: ["s0"],
          sourceHashes: { s0: "h" },
          analysisVersion: 1,
          coverage: { kind: "revision", revisionId: "s0" },
        },
        revelations: Array.from({ length: 8 }, (_, index) => ({ text: `Revelación ${index}`, support: [{ kind: "event" as const, id: "p0-e0" }] })),
      },
    };
    const snapshot = buildStorySnapshot(story, blocks, [], 0, undefined, getWriterContextAdapter("screenplay"));
    expect(snapshot.units).toHaveLength(50);
    expect(snapshot.counts.locations).toBe(8);
    expect(snapshot.characterTotal).toBe(12);
    expect(snapshot.characters.length).toBeLessThanOrEqual(5);
    expect(snapshot.unitPreview.length).toBeLessThanOrEqual(4);
    expect(snapshot.historyPreview.length).toBeLessThanOrEqual(6);
    expect(snapshot.relationsPreview.length).toBeLessThanOrEqual(5);
    expect(snapshot.relationTotal).toBe(30);
    expect(snapshot.revelationsPreview.length).toBeLessThanOrEqual(5);
    expect(snapshot.questionPreview.length).toBeLessThanOrEqual(3);
    expect(snapshot.openQuestions).toBe(20);
    expect(snapshot.locationPreview.length).toBeLessThanOrEqual(5);
    const digest = buildGlobalStoryDigest(story, blocks, ["a0"]);
    expect(digest.length).toBeGreaterThan(0);
    expect(digest.length).toBeLessThanOrEqual(2800);
    expect(story.presentation?.storyBrief?.text).toBe("FRASE GLOBAL UNICA");

    const editor = script({
      type: "doc",
      content: [
        block("sceneHeading", "s1", "INT. BAR OLVIDO - 19:13"),
        block("character", "c1", "ANA"),
        block("sceneHeading", "s2", "INT. APARTAMENTO - 16:14"),
      ],
    });
    const ana = createStoryEntity(emptyWriterStory(), { label: "Ana", group: "character" });
    const asked = buildStoryAsk(editor.state.doc, { ...ana.story, presentation: story.presentation }, {
      scope: { type: "global" },
      question: "¿Cuántas localizaciones hay?",
    });
    expect(asked.metrics.local).toBe(true);
    expect(asked.localAnswer).toBe("Hay 2 localizaciones.");
    expect(JSON.stringify(storyAskContext(asked))).not.toContain("FRASE GLOBAL UNICA");
    const scenes = buildStoryAsk(editor.state.doc, ana.story, { scope: { type: "global" }, question: "¿En qué escenas aparece Ana?" });
    expect(scenes.localAnswer).toContain("Bar olvido");
    const order = buildStoryAsk(editor.state.doc, ana.story, { scope: { type: "global" }, question: "¿La cronología es lineal?" });
    expect(order.localAnswer).toContain("no es lineal");
    expect(writerDocumentBlocks(editor.state.doc).length).toBeGreaterThan(0);
    editor.destroy();
  });

  it("parses a global presentation without turning it into story delta", () => {
    const parsed = parseStoryUpdateModelAnswer(
      '{"storyDelta":{"events":[],"stateChanges":[],"facts":[],"analyzedBlockIds":["b1"]},"presentationDelta":{"globalPresentation":{"storyOverview":{"text":"Toda la obra.","sceneIds":["s1"]},"entityArcBriefs":[{"entityId":"ana","text":"El recorrido."}]}}}',
    );
    expect(parsed?.storyDelta.events).toEqual([]);
    expect(parsed?.presentationDelta?.globalPresentation?.storyOverview?.text).toBe("Toda la obra.");
    expect(parsed?.presentationDelta?.globalPresentation?.entityArcBriefs?.[0]?.text).toBe("El recorrido.");
  });
});
