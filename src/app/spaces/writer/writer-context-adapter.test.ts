import { describe, expect, it } from "vitest";
import { isWriterProfile, WRITER_PROFILES } from "./writer-document";
import { getWriterContextAdapter } from "./writer-context";
import { buildEntityPresentation, buildStorySnapshot } from "./writer-presentation";
import { deriveStoryStructure } from "./writer-structure";
import { createStoryEntity, emptyWriterStory } from "./writer-story";
import type { StoryDocumentBlock } from "./writer-appearances";

function block(partial: Partial<StoryDocumentBlock> & { blockId: string; type: string; text: string }): StoryDocumentBlock {
  return {
    order: 1,
    chapterId: null,
    chapterLabel: null,
    scene: null,
    ...partial,
  };
}

const sceneAndHeading: StoryDocumentBlock[] = [
  block({ blockId: "s1", type: "sceneHeading", text: "INT. SALA DE CURAS", order: 1 }),
  block({ blockId: "h1", type: "heading", text: "El accidente", order: 2 }),
];

describe("writer context adapter", () => {
  it("keeps a script reading as Story, scenes and characters", () => {
    const adapter = getWriterContextAdapter("screenplay");
    expect(adapter.workspaceLabel).toBe("Story");
    expect(adapter.askPlaceholder).toBe("Pregunta sobre tu historia…");
    expect(adapter.entityAskPlaceholder("Ana")).toBe("Pregunta sobre Ana…");
    expect(adapter.profileLabelFor("character")).toBe("Perfil");
    expect(adapter.structureLabels.scene).toBe("Escenas");
    expect(adapter.primaryEntityPluralLabel).toBe("Personajes");
    expect(adapter.supports.locations).toBe(true);
    const structure = deriveStoryStructure(sceneAndHeading, { kinds: adapter.structureKinds });
    expect(structure.kind).toBe("scene");
    expect(structure.locations.map((item) => item.label)).toEqual(["Sala de curas"]);
  });

  it("does not read a document or an article as a screenplay", () => {
    for (const profile of ["document", "article"] as const) {
      const adapter = getWriterContextAdapter(profile);
      expect(adapter.workspaceLabel).toBe("Contexto");
      expect(adapter.primaryEntityPluralLabel).toBe("Entidades");
      expect(adapter.profileLabelFor("story")).toBe("Información");
      expect(adapter.supports.scenes).toBe(false);
      expect(adapter.supports.characters).toBe(false);
      expect(adapter.askPlaceholder).toBe("Pregunta sobre este contenido…");
      const structure = deriveStoryStructure(sceneAndHeading, { kinds: adapter.structureKinds });
      expect(structure.kind).toBe("section");
      expect(structure.locations).toEqual([]);
    }
  });

  it("uses chapters when a document has them", () => {
    const adapter = getWriterContextAdapter("document");
    const structure = deriveStoryStructure(
      [block({ blockId: "c1", type: "chapterTitle", text: "Uno", order: 1, chapterId: "cap-1", chapterLabel: "CAP. 1" })],
      { kinds: adapter.structureKinds },
    );
    expect(structure.kind).toBe("chapter");
    expect(adapter.structureLabels.chapter).toBe("Capítulos");
  });

  it("chooses a default page view without storing pages in Story", () => {
    expect(getWriterContextAdapter("screenplay")).toMatchObject({ defaultView: "paged", pagination: "script" });
    expect(getWriterContextAdapter("book")).toMatchObject({ defaultView: "paged", pagination: "prose" });
    expect(getWriterContextAdapter("document")).toMatchObject({ defaultView: "paged", pagination: "prose" });
    expect(getWriterContextAdapter("article")).toMatchObject({ defaultView: "continuous", pagination: "prose" });
    expect(getWriterContextAdapter("post")).toMatchObject({ defaultView: "continuous", pagination: "prose" });
  });

  it("opens a post without scenes, locations or characters", () => {
    const adapter = getWriterContextAdapter("post");
    expect(adapter.workspaceLabel).toBe("Contexto");
    expect(adapter.structureKinds).toEqual(["section"]);
    expect(adapter.supports).toMatchObject({ scenes: false, locations: false, characters: false });
    expect(deriveStoryStructure(sceneAndHeading, { kinds: adapter.structureKinds }).kind).toBe("section");
    expect(deriveStoryStructure([], { kinds: adapter.structureKinds }).kind).toBeNull();
  });

  it("hides characters when the type changes and restores them without deleting story data", () => {
    const created = createStoryEntity(emptyWriterStory(), { label: "Ana", group: "character" });
    const withNote = created.story.entities[0];
    expect(withNote).toBeTruthy();
    const script = buildStorySnapshot(created.story, sceneAndHeading, [], 0, undefined, getWriterContextAdapter("screenplay"));
    const document = buildStorySnapshot(created.story, sceneAndHeading, [], 0, undefined, getWriterContextAdapter("document"));
    expect(script.characterTotal).toBe(1);
    expect(script.kind).toBe("scene");
    expect(document.characterTotal).toBe(0);
    expect(document.kind).toBe("section");
    expect(created.story.entities.map((item) => item.label)).toEqual(["Ana"]);
    const again = buildStorySnapshot(created.story, sceneAndHeading, [], 0, undefined, getWriterContextAdapter("screenplay"));
    expect(again.characterTotal).toBe(1);
  });

  it("labels an article entity as information and does not present its trace", () => {
    const created = createStoryEntity(emptyWriterStory(), { label: "Ministerio", group: "story" });
    const entity = { ...created.story.entities[0]!, traceSummary: "Aparece al principio." };
    const story = { ...created.story, entities: [entity] };
    const view = buildEntityPresentation(story, entity, [], [], [], undefined, getWriterContextAdapter("article"));
    expect(view.profileLabel).toBe("Información");
    expect(view.profileAction).toBe("+ Añadir información");
    expect(view.trace).toBeNull();
    expect(view.firstAppearance).toBeNull();
    expect(story.entities[0]?.traceSummary).toBe("Aparece al principio.");
  });

  it("keeps book out of the document types and falls back unknown types to context", () => {
    expect(WRITER_PROFILES).not.toContain("book");
    expect(isWriterProfile("book")).toBe(false);
    expect(getWriterContextAdapter("book").workspaceLabel).toBe("Story");
    expect(getWriterContextAdapter("book").structureKinds).toEqual(["chapter"]);
    expect(getWriterContextAdapter("informe").workspaceLabel).toBe("Contexto");
    expect(getWriterContextAdapter(null).id).toBe("document");
  });
});
