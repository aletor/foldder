import { describe, expect, it } from "vitest";
import { DEFAULT_TYPOGRAPHY, flattenStoryContent, type StoryNode, type TextFrame } from "./text-model";
import { layoutRichTextInFrame } from "./text-layout";

const mockCtx = {
  font: "",
  measureText: (text: string) => ({ width: text.length * 5 }),
} as unknown as CanvasRenderingContext2D;

const typo = {
  ...DEFAULT_TYPOGRAPHY,
  fontFamily: "Arial",
  fontSize: 10,
  lineHeight: 1,
  letterSpacing: 0,
};

const frame: TextFrame = {
  id: "tf_test",
  storyId: "story_test",
  x: 0,
  y: 0,
  width: 300,
  height: 40,
  padding: 0,
};

describe("layoutRichTextInFrame", () => {
  it("measures line breaks with shaped text instead of summing isolated characters", () => {
    const kerningCtx = {
      font: "",
      measureText: (text: string) => ({ width: text.length === 1 ? 10 : text.length * 5 }),
    } as unknown as CanvasRenderingContext2D;
    const narrowFrame: TextFrame = {
      ...frame,
      width: 170,
      height: 20,
    };

    const result = layoutRichTextInFrame(
      [{ text: "nunca acierta a la primera." }],
      narrowFrame,
      typo,
      kerningCtx,
    );

    expect(result.lines.map((line) => line.text)).toEqual(["nunca acierta a la primera."]);
  });

  it("counts a single newline as the next line, not an extra blank line", () => {
    const result = layoutRichTextInFrame([{ text: "one\ntwo\nthree\nfour" }], frame, typo, mockCtx);

    expect(result.hasOverflow).toBe(false);
    expect(result.lines.map((line) => line.text)).toEqual(["one", "two", "three", "four"]);
  });

  it("does not make list items consume hidden blank lines", () => {
    const nodes: StoryNode[] = ["una pelota,", "una tarta,", "una cuerda,", "un trofeo"].map((text, i) => ({
      type: "paragraph" as const,
      id: `p_${i}`,
      listStyle: "disc" as const,
      spans: [{ id: `s_${i}`, text }],
    }));

    const result = layoutRichTextInFrame(flattenStoryContent(nodes), frame, typo, mockCtx);

    expect(result.hasOverflow).toBe(false);
    expect(result.lines).toHaveLength(4);
    expect(result.lines.map((line) => line.text)).toEqual([
      "\u2022  una pelota,",
      "\u2022  una tarta,",
      "\u2022  una cuerda,",
      "\u2022  un trofeo",
    ]);
  });
});
