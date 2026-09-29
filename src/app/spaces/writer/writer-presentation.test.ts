import { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { WriterBlockId, writerBlockTextHash } from "./writer-block-id";
import { buildStoryAsk, storyAskContext } from "./writer-ask-story";
import { writerDocumentBlocks } from "./writer-appearances";
import { parseStoryUpdateModelAnswer } from "./writer-ai";
import { isSaneCharacterCue, storyDisplayTitle } from "./writer-cue";
import { writerEntityFromCue, writerEntityId } from "./writer-entities";
import {
  applyStoryPresentation,
  buildEntityPresentation,
  buildStorySnapshot,
  hasExplicitOwnership,
  presentationBriefIsStale,
  visibleStoryEntities,
} from "./writer-presentation";
import { createWriterStarterKit, writerScreenplayNodes } from "./writer-screenplay";
import { deriveStoryStructure, parseSceneHeading } from "./writer-structure";
import {
  absorbDocumentCues,
  addStoryAuthorRelation,
  addStoryEntityNote,
  createStoryEntity,
  emptyWriterStory,
  migrateMemoryToStory,
  setStoryDefinition,
  type StoryEntity,
  type WriterStory,
} from "./writer-story";
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

function entity(partial: Partial<StoryEntity> & { id: string; label: string }): StoryEntity {
  return {
    aliases: [partial.label],
    group: "character",
    bound: "entity",
    definition: "",
    notes: [],
    events: [],
    stateChanges: [],
    textFacts: [],
    stateSummary: null,
    traceSummary: null,
    ...partial,
  };
}

function storyWith(entities: StoryEntity[], extra: Partial<WriterStory> = {}): WriterStory {
  return { ...emptyWriterStory(), entities, ...extra };
}

describe("story presentation", () => {
  it("drops a document ghost when its cue is gone and legacy notes do not keep it", () => {
    const migrated = migrateMemoryToStory([
      { id: "n1", kind: "canon", text: "mola", scope: { type: "entity", entityId: "paco" } },
    ]);
    const paco = migrated.entities.find((item) => item.label.toLocaleLowerCase("es") === "paco");
    expect(paco?.origin).toBe("document");
    expect(paco?.notes[0]?.provenance).toBe("legacy_memory");
    expect(hasExplicitOwnership(migrated, paco!)).toBe(false);
    expect(visibleStoryEntities(migrated, []).map((item) => item.id)).not.toContain(paco?.id);
    expect(migrated.entities.find((item) => item.id === paco?.id)?.notes).toHaveLength(1);
  });

  it("keeps a character the author defined even before the cue exists", () => {
    const created = createStoryEntity(emptyWriterStory(), { label: "Paco", group: "character" });
    const defined = setStoryDefinition(created.story, created.entity?.id ?? "", "Paco es hermano de Ana.");
    const visible = visibleStoryEntities(defined, []);
    expect(visible.map((item) => item.label)).toEqual(["Paco"]);
    const view = buildEntityPresentation(defined, visible[0]!, [], [], []);
    expect(view.absent).toBe(true);
    expect(view.profileLabel).toBe("Perfil");
  });

  it("does not create a character from a sentence cue and hides one that only existed for it", () => {
    const cue = "¿sabes que juan se cayó de la cama?";
    expect(isSaneCharacterCue(cue)).toBe(false);
    expect(writerEntityFromCue(cue)).toBeNull();
    const absorbed = absorbDocumentCues(emptyWriterStory(), [{ id: "x", label: cue }]);
    expect(absorbed.entities).toHaveLength(0);
    const junk = storyWith([entity({ id: "junk", label: cue, origin: "document" })]);
    expect(visibleStoryEntities(junk, [{ blockId: "c", type: "character", text: cue, order: 1, chapterId: null, chapterLabel: null, scene: null }])).toHaveLength(0);
  });

  it("normalizes screenplay decorators and keeps real names", () => {
    expect(writerEntityId("ANA (V.O.)")).toBe("ana");
    expect(writerEntityId("PEDRO (O.S.)")).toBe("pedro");
    expect(writerEntityId("JUAN (CONT'D)")).toBe("juan");
    expect(writerEntityId("NIÑA (8)")).toBe("nina");
    expect(isSaneCharacterCue("DR. MARTÍNEZ")).toBe(true);
    expect(isSaneCharacterCue("HOMBRE #2")).toBe(true);
    expect(isSaneCharacterCue("MUJER 1")).toBe(true);
    expect(isSaneCharacterCue("HOMBRE DE LA GABARDINA")).toBe(true);
    expect(storyDisplayTitle("policía", "character")).toBe("Policía");
    expect(storyDisplayTitle("POLICÍA", "character")).toBe("Policía");
  });

  it("derives scenes and locations from headings without a model", () => {
    expect(parseSceneHeading("INT. HOSPITAL - PLANTA 2 - NOCHE").locationLabel).toBe("Hospital - Planta 2");
    expect(parseSceneHeading("INT. SALA DE CURAS").locationLabel).toBe("Sala de curas");
    expect(parseSceneHeading("INT. SUPERFICIE ESTABLE").locationLabel).toBe("Superficie estable");
    const editor = script({
      type: "doc",
      content: [
        block("sceneHeading", "s1", "INT. SALA DE CURAS"),
        block("character", "c1", "ANA"),
        block("character", "c2", "JUAN"),
        block("sceneHeading", "s2", "INT. SUPERFICIE ESTABLE"),
        block("character", "c3", "JUAN"),
        block("character", "c4", "POLICÍA"),
        block("character", "c5", "ANA"),
        block("character", "c6", "¿sabes que juan se cayó de la cama?"),
      ],
    });
    const blocks = writerDocumentBlocks(editor.state.doc);
    const structure = deriveStoryStructure(blocks);
    expect(structure.kind).toBe("scene");
    expect(structure.units).toHaveLength(2);
    expect(structure.locations.map((item) => item.label)).toEqual(["Sala de curas", "Superficie estable"]);
    expect(structure.units[0]?.cast).toEqual(["Ana", "Juan"]);
    expect(structure.units[1]?.cast).toEqual(["Juan", "Policía", "Ana"]);
    const absorbed = absorbDocumentCues(emptyWriterStory(), [
      { id: "ana", label: "Ana" },
      { id: "juan", label: "Juan" },
      { id: "policia", label: "Policía" },
    ]);
    const snapshot = buildStorySnapshot(absorbed, blocks, [], 0);
    expect(snapshot.counts).toMatchObject({ units: 2, locations: 2, characters: 3 });
    expect(snapshot.brief).toBeNull();
    expect(snapshot.hintUpdate).toBe(false);
    editor.destroy();
  });

  it("keeps a prose document without scene headings", () => {
    const structure = deriveStoryStructure([
      { blockId: "p", type: "paragraph", text: "Había una vez.", order: 1, chapterId: null, chapterLabel: null, scene: null },
    ]);
    expect(structure.kind).toBeNull();
    expect(structure.units).toHaveLength(0);
  });

  it("does not turn scene headings into scenes when the document is not a screenplay", () => {
    const blocks = [
      { blockId: "s1", type: "sceneHeading", text: "INT. SALA DE CURAS", order: 1, chapterId: null, chapterLabel: null, scene: null },
      { blockId: "p", type: "paragraph", text: "Ana habla.", order: 2, chapterId: null, chapterLabel: null, scene: null },
    ];
    expect(deriveStoryStructure(blocks, { screenplay: false }).kind).toBeNull();
    expect(deriveStoryStructure(blocks).kind).toBe("scene");
    const snapshot = buildStorySnapshot(emptyWriterStory(), blocks, [], 0, undefined, false);
    expect(snapshot.counts.units).toBe(0);
    expect(snapshot.counts.locations).toBe(0);
  });

  it("keeps a valid scene brief and drops only the invalid one", () => {
    const cited = [
      { blockId: "s1", hash: "h1" },
      { blockId: "b1", hash: "h2" },
    ];
    const applied = applyStoryPresentation(
      emptyWriterStory(),
      {
        storyBrief: { text: "Ana y Juan conversan en una sala de curas.", sourceBlockIds: ["b1"] },
        sceneBriefs: [
          { sceneId: "s1", text: "Ana menciona un accidente mientras habla con Juan.", sourceBlockIds: ["b1"] },
          { sceneId: "s2", text: "Esto no está en el lote.", sourceBlockIds: ["missing"] },
        ],
      },
      cited,
      [],
    );
    expect(applied.story.presentation?.storyBrief?.text).toContain("sala de curas");
    expect(applied.story.presentation?.sceneBriefs?.s1?.text).toContain("accidente");
    expect(applied.story.presentation?.sceneBriefs?.s2).toBeUndefined();
    expect(applied.story.entities.flatMap((item) => item.textFacts)).toEqual([]);
    const blocks = [
      { blockId: "s1", type: "sceneHeading", text: "INT. SALA DE CURAS", order: 1, chapterId: null, chapterLabel: null, scene: null },
      { blockId: "b1", type: "dialogue", text: "Ana menciona un accidente.", order: 2, chapterId: null, chapterLabel: null, scene: "INT. SALA DE CURAS" },
    ];
    const snapshot = buildStorySnapshot(applied.story, blocks, [], 0);
    expect(snapshot.unitPreview[0]?.brief).toContain("accidente");
    const parsed = parseStoryUpdateModelAnswer(
      '{"storyDelta":{"events":[],"facts":[],"analyzedBlockIds":["b1"]},"presentationDelta":{"storyBrief":{"text":"Ana habla.","sourceBlockIds":["b1"]},"sceneBriefs":[{"sceneId":"s1","text":"Ana menciona un accidente.","sourceBlockIds":["b1"]},{"sceneId":"","text":"mal","sourceBlockIds":["b1"]}]}}',
    );
    expect(parsed?.storyDelta?.analyzedBlockIds).toEqual(["b1"]);
    expect(parsed?.presentationDelta?.sceneBriefs).toEqual([
      { sceneId: "s1", text: "Ana menciona un accidente.", sourceBlockIds: ["b1"] },
    ]);
  });

  it("fills an entity card from local presence when there is no brief", () => {
    const created = createStoryEntity(emptyWriterStory(), { label: "Ana", group: "character" });
    const id = created.entity?.id ?? "";
    const blocks = [
      { blockId: "s1", type: "sceneHeading", text: "INT. SALA DE CURAS", order: 1, chapterId: null, chapterLabel: null, scene: null },
      { blockId: "c1", type: "character", text: "ANA", order: 2, chapterId: null, chapterLabel: null, scene: "INT. SALA DE CURAS" },
      { blockId: "c2", type: "character", text: "JUAN", order: 3, chapterId: null, chapterLabel: null, scene: "INT. SALA DE CURAS" },
    ];
    const appearances = [
      { entityId: id, blockId: "c1", chapterId: null, chapterLabel: null, scene: "INT. SALA DE CURAS", snippet: "ANA", order: 2, from: 0, to: 3 },
      { entityId: "juan", blockId: "c2", chapterId: null, chapterLabel: null, scene: "INT. SALA DE CURAS", snippet: "JUAN", order: 3, from: 0, to: 4 },
    ];
    const view = buildEntityPresentation(created.story, created.story.entities[0]!, blocks, appearances, []);
    expect(view.brief).toBeNull();
    expect(view.firstAppearance).toBe("Sala de curas");
    expect(view.scenes).toBe(1);
    expect(view.appearances).toBe(1);
    expect(view.sharesScenesWith).toEqual(["Juan"]);
    expect(view.stateLines).toEqual([]);
    expect(view.trace).toBeNull();
    expect(view.relations).toEqual([]);
  });

  it("limits the home preview on a long document", () => {
    const blocks = Array.from({ length: 80 }, (_, index) => ({
      blockId: `s${index}`,
      type: "sceneHeading",
      text: `INT. LUGAR ${index}`,
      order: index,
      chapterId: null,
      chapterLabel: null,
      scene: null,
    }));
    const snapshot = buildStorySnapshot(emptyWriterStory(), blocks, [], 0);
    expect(snapshot.counts.units).toBe(80);
    expect(snapshot.unitPreview.length).toBeLessThanOrEqual(4);
    expect(snapshot.units).toHaveLength(80);
  });

  it("stores a presentation brief beside the delta and ignores an invalid one", () => {
    const ana = createStoryEntity(emptyWriterStory(), { label: "Ana", group: "character" });
    const cited = [{ blockId: "b1", hash: writerBlockTextHash("Ana menciona el accidente.") }];
    const applied = applyStoryPresentation(
      ana.story,
      {
        storyBrief: { text: "Ana menciona un accidente.", sourceBlockIds: ["b1"] },
        entityBriefs: [
          { entityId: ana.entity?.id ?? "", text: "Menciona un accidente.", sourceBlockIds: ["b1"] },
          { entityId: "missing", text: "No existe.", sourceBlockIds: ["b1"] },
          { entityId: ana.entity?.id ?? "", text: "Fuera del lote.", sourceBlockIds: ["other"] },
        ],
      },
      cited,
      [ana.entity?.id ?? ""],
    );
    expect(applied.changed).toBe(true);
    expect(applied.story.presentation?.storyBrief?.text).toBe("Ana menciona un accidente.");
    expect(applied.story.presentation?.storyBrief?.coverage).toEqual({ kind: "blocks", blockIds: ["b1"] });
    expect(applied.story.entities[0]?.textFacts).toEqual([]);
    expect(Object.keys(applied.story.presentation?.entityBriefs ?? {})).toEqual([ana.entity?.id]);
    const live = new Map([["b1", cited[0]!.hash]]);
    expect(presentationBriefIsStale(applied.story.presentation!.entityBriefs![ana.entity!.id]!, live)).toBe(false);
    live.set("b1", "otro");
    expect(presentationBriefIsStale(applied.story.presentation!.storyBrief!, live)).toBe(true);
    const juanOnly = new Map([["b1", cited[0]!.hash], ["juan", "distinto"]]);
    expect(presentationBriefIsStale(applied.story.presentation!.entityBriefs![ana.entity!.id]!, juanOnly)).toBe(false);
  });

  it("does not feed a brief to Ask Story", () => {
    const ana = createStoryEntity(emptyWriterStory(), { label: "Ana", group: "character" });
    const withBrief: WriterStory = {
      ...setStoryDefinition(ana.story, ana.entity?.id ?? "", "Ana guarda el faro."),
      presentation: {
        storyBrief: {
          text: "Resumen que no es un hecho.",
          sourceBlockIds: ["b1"],
          sourceHashes: { b1: "viejo" },
          analysisVersion: 1,
          coverage: { kind: "blocks", blockIds: ["b1"] },
        },
      },
    };
    const editor = script({ type: "doc", content: [block("paragraph", "b1", "Ana guarda el faro.")] });
    const ask = buildStoryAsk(editor.state.doc, withBrief, { scope: { type: "global" }, question: "perfil de ana" });
    const packed = JSON.stringify(storyAskContext(ask));
    expect(packed).not.toContain("Resumen que no es un hecho");
    expect(ask.localAnswer).toBeNull();
    editor.destroy();
  });

  it("accepts presentation in the same update response without a second call", async () => {
    const ana = createStoryEntity(emptyWriterStory(), { label: "Ana", group: "character" });
    const editor = script({ type: "doc", content: [block("action", "b1", "Ana menciona un accidente a los 22 años.")] });
    const plan = planStoryUpdate(editor.state.doc, ana.story);
    expect(plan.calls).toBe(1);
    let storyNow = ana.story;
    let calls = 0;
    await executeStoryUpdate({
      getDoc: () => editor.state.doc,
      getStory: () => storyNow,
      plan,
      request: async (batch) => {
        calls += 1;
        const blockId = batch.dirty[0]?.blockId ?? "b1";
        return {
          ok: true as const,
          storyDelta: { events: [], stateChanges: [], facts: [], analyzedBlockIds: [blockId], chapterSummaries: [] },
          presentationDelta: {
            storyBrief: { text: "Ana menciona un accidente.", sourceBlockIds: [blockId] },
            entityBriefs: [{ entityId: ana.entity?.id ?? "", text: "Menciona un accidente.", sourceBlockIds: [blockId] }],
          },
        };
      },
      commit: (next) => {
        storyNow = next;
      },
    });
    expect(calls).toBe(1);
    expect(storyNow.presentation?.storyBrief?.text).toBe("Ana menciona un accidente.");
    expect(storyNow.entities[0]?.textFacts).toEqual([]);
    expect(storyNow.analyzed[Object.keys(storyNow.analyzed)[0] ?? ""]).toBeTruthy();
    const parsed = parseStoryUpdateModelAnswer(
      '{"storyDelta":{"events":[],"stateChanges":[],"facts":[],"analyzedBlockIds":["b1"]},"presentationDelta":{"storyBrief":{"text":"Ana habla.","sourceBlockIds":["b1"]}}}',
    );
    expect(parsed?.presentationDelta?.storyBrief?.text).toBe("Ana habla.");
    editor.destroy();
  });

  it("shows an author note as a note and not as a relation or a state line", () => {
    const created = createStoryEntity(emptyWriterStory(), { label: "Ana", group: "character" });
    const noted = addStoryEntityNote(created.story, created.entity?.id ?? "", "mola");
    const view = buildEntityPresentation(noted.story, noted.story.entities[0]!, [], [], []);
    expect(view.notes.map((note) => note.text)).toEqual(["mola"]);
    expect(view.stateLines).toEqual([]);
    expect(view.relations).toEqual([]);
    expect(view.brief).toBeNull();
    const linked = addStoryAuthorRelation(noted.story, { fromEntityId: created.entity?.id ?? "", toEntityId: created.entity?.id ?? "", phrase: "consigo" });
    expect(linked.relations ?? []).toHaveLength(0);
  });
});
