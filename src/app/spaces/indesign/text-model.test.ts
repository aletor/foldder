import { describe, expect, it } from "vitest";
import {
  flattenStoryContent,
  plainTextToStoryNodes,
  replaceStoryContentRangePreservingParagraphs,
  serializeStoryContent,
  type StoryNode,
} from "./text-model";

describe("replaceStoryContentRangePreservingParagraphs", () => {
  it("keeps frame-flow cuts inside a paragraph from becoming real line breaks", () => {
    const original = plainTextToStoryNodes("Lorem ipsum dolor sit amet");
    const replacement: StoryNode[] = [
      {
        type: "paragraph",
        id: "p_replacement",
        spans: [
          { id: "s_plain", text: "Lorem " },
          { id: "s_bold", text: "ipsum", style: { fontWeight: "bold" } },
        ],
      },
    ];

    const next = replaceStoryContentRangePreservingParagraphs(original, 0, "Lorem ipsum".length, replacement);

    expect(serializeStoryContent(next)).toBe("Lorem ipsum dolor sit amet");
    expect(next).toHaveLength(1);
    expect(flattenStoryContent(next).some((run) => run.style?.fontWeight === "bold")).toBe(true);
  });

  it("preserves intentional paragraph breaks at real paragraph boundaries", () => {
    const original = plainTextToStoryNodes("Hello\nWorld");
    const replacement = plainTextToStoryNodes("Hi");

    const next = replaceStoryContentRangePreservingParagraphs(original, 0, "Hello".length, replacement);

    expect(serializeStoryContent(next)).toBe("Hi\nWorld");
    expect(next).toHaveLength(2);
  });

  it("does not consume following text when replacement becomes a list", () => {
    const original = plainTextToStoryNodes("Item one continues");
    const replacement: StoryNode[] = [
      {
        type: "paragraph",
        id: "p_list",
        listStyle: "disc",
        spans: [{ id: "s_item", text: "Item one" }],
      },
    ];

    const next = replaceStoryContentRangePreservingParagraphs(original, 0, "Item one".length, replacement);

    expect(serializeStoryContent(next)).toBe("Item one continues");
    expect(next[0]?.listStyle).toBe("disc");
  });

  it("can repeat an overflowing frame edit without duplicating the following story text", () => {
    const editedFrameText = [
      "CHURU-CHURU es una serie infantil musical de episodios cortos donde cinco amigos viven pequeñas aventuras alrededor de un objeto del dia",
      "una pelota,",
      "una tarta,",
      "una cuerda,",
      "un trofeo hasta que aparecen Malmo, un villano dramatico que siempre quiere ser el centro de atencion, y Bombo, su adorable secuaz que lo entiende todo al reves. Para resolver cada desastre, los",
    ].join("\n");
    const followingText = " amigos deben cantar juntos la palabra magica activando a una criatura transformista.";
    const originalFrameText = editedFrameText.replace(/\n/g, " ");
    const original = plainTextToStoryNodes(`${originalFrameText}${followingText}`);
    const editedNodes = plainTextToStoryNodes(editedFrameText);
    const editedFlatLength = flattenStoryContent(editedNodes).reduce((sum, run) => sum + run.text.length, 0);

    const first = replaceStoryContentRangePreservingParagraphs(
      original,
      0,
      originalFrameText.length,
      editedNodes,
    );
    const second = replaceStoryContentRangePreservingParagraphs(
      first,
      0,
      editedFlatLength,
      editedNodes,
    );
    const result = serializeStoryContent(second);

    expect(result.endsWith(followingText)).toBe(true);
    expect(result.match(/amigos deben cantar juntos/g)).toHaveLength(1);
  });
});
