import { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { WriterChapter, WriterChapterTitle } from "./writer-chapter";
import { plainTextFromWriterContent } from "./writer-document";
import { createWriterStarterKit, writerScreenplayNodes } from "./writer-screenplay";
import {
  alignedGapHeight,
  getPageForBlock,
  getPageForPosition,
  getPageRange,
  getPagesForBlock,
  getPositionForPage,
  pageMapSignature,
  paginate,
  writerContentHeight,
  writerLayoutHash,
  writerPageBox,
  type MeasuredBlock,
} from "./writer-pagination";

function block(id: string, type: string, heights: number[], pos: number): MeasuredBlock {
  let cursor = 0;
  return {
    blockId: id,
    pos,
    type,
    marginBefore: 0,
    marginAfter: 0,
    lines: heights.map((height) => {
      const line = { from: cursor, to: cursor + 8, height };
      cursor += 8;
      return line;
    }),
  };
}

function pagesOf(blocks: MeasuredBlock[], contentHeight = 100, kind: "script" | "prose" = "prose") {
  return paginate({ blocks, contentHeight, kind }).map;
}

describe("pagination engine", () => {
  it("absorbs the unused page slack so the next page does not drift", () => {
    const stride = 1151;
    expect(alignedGapHeight(960, 0, stride)).toBe(191);
    const secondTop = 960 + 191 + 970;
    expect(alignedGapHeight(secondTop, 1, stride)).toBe(stride * 2 - secondTop);
    expect(960 + alignedGapHeight(960, 0, stride)).toBe(stride);
    expect(secondTop + alignedGapHeight(secondTop, 1, stride)).toBe(stride * 2);
  });

  it("collapses the facing margins of paragraphs that share a page", () => {
    const para = (id: string, pos: number): MeasuredBlock => ({
      blockId: id,
      pos,
      type: "paragraph",
      marginBefore: 10,
      marginAfter: 10,
      lines: [{ from: 0, to: 4, height: 20 }],
    });
    const map = pagesOf([para("a", 1), para("b", 10), para("c", 20), para("d", 30)], 100);
    expect(map.pages[0]?.fragments.map((fragment) => fragment.blockId)).toEqual(["a", "b", "c"]);
    expect(map.pages[1]?.fragments.map((fragment) => fragment.blockId)).toEqual(["d"]);
  });

  it("keeps a long paragraph as one block across pages", () => {
    const paragraph = block("p", "paragraph", [40, 40, 40, 40, 40, 40], 2);
    const map = pagesOf([paragraph]);
    expect(map.totalPages).toBe(3);
    expect(new Set(map.pages.flatMap((page) => page.fragments.map((fragment) => fragment.blockId)))).toEqual(new Set(["p"]));
    expect(map.pages[0]?.fragments[0]).toMatchObject({ from: 0, to: 16 });
    expect(map.pages[1]?.fragments[0]?.from).toBe(16);
    expect(map.pages[2]?.fragments[0]?.to).toBe(48);
    expect(getPagesForBlock(map, "p")).toEqual([1, 2, 3]);
  });

  it("moves a scene heading with the following line", () => {
    const map = pagesOf(
      [
        block("fill", "action", [80], 1),
        block("head", "sceneHeading", [20], 20),
        block("next", "action", [20, 20], 40),
      ],
      100,
      "script",
    );
    expect(map.pages[0]?.fragments.map((fragment) => fragment.blockId)).toEqual(["fill"]);
    expect(map.pages[1]?.fragments.map((fragment) => fragment.blockId)[0]).toBe("head");
    expect(getPageForBlock(map, "head")).toBe(2);
  });

  it("keeps a character cue with the parenthetical and the first dialogue line", () => {
    const map = pagesOf(
      [
        block("fill", "action", [70], 1),
        block("cue", "character", [20], 10),
        block("paren", "parenthetical", [15], 20),
        block("line", "dialogue", [20, 20], 30),
      ],
      100,
      "script",
    );
    expect(map.pages[0]?.fragments.map((fragment) => fragment.blockId)).toEqual(["fill"]);
    expect(map.pages[1]?.fragments.map((fragment) => fragment.blockId)).toEqual(["cue", "paren", "line"]);
  });

  it("moves a prose heading with the following lines", () => {
    const map = pagesOf([
      block("fill", "paragraph", [80], 1),
      block("title", "heading", [20], 20),
      block("body", "paragraph", [20], 40),
    ]);
    expect(getPageForBlock(map, "title")).toBe(2);
    expect(map.pages[0]?.fragments.map((fragment) => fragment.blockId)).toEqual(["fill"]);
  });

  it("forces a new page at a manual break and removes it when the break is gone", () => {
    const before = [
      block("a", "paragraph", [40], 1),
      block("break", "pageBreak", [0], 10),
      block("b", "paragraph", [40], 20),
    ];
    before[1] = { ...before[1]!, lines: [] };
    const broken = pagesOf(before);
    expect(broken.totalPages).toBe(2);
    expect(getPageForBlock(broken, "b")).toBe(2);
    const joined = pagesOf([before[0]!, before[2]!]);
    expect(joined.totalPages).toBe(1);
    expect(getPageForBlock(joined, "b")).toBe(1);
  });

  it("does not add a blank page for a break at the top, and does for two breaks", () => {
    const top = pagesOf([
      { ...block("break", "pageBreak", [], 1), lines: [] },
      block("a", "paragraph", [40], 10),
    ]);
    expect(top.totalPages).toBe(1);
    const doubled = pagesOf([
      block("a", "paragraph", [40], 1),
      { ...block("b1", "pageBreak", [], 10), lines: [] },
      { ...block("b2", "pageBreak", [], 12), lines: [] },
      block("c", "paragraph", [40], 20),
    ]);
    expect(doubled.totalPages).toBe(3);
    expect(getPageForBlock(doubled, "c")).toBe(3);
  });

  it("keeps the page count when only the visual scale would change", () => {
    const blocks = [block("a", "paragraph", [40, 40, 40], 1), block("b", "paragraph", [40, 40], 20)];
    const left = pagesOf(blocks);
    const right = pagesOf(blocks);
    expect(left.totalPages).toBe(right.totalPages);
    expect(pageMapSignature(left)).toBe(pageMapSignature(right));
    const box = writerPageBox("a4");
    expect(writerLayoutHash("a4", "prose", box)).toBe(writerLayoutHash("a4", "prose", box));
    expect(writerContentHeight(box)).toBe(979);
  });

  it("resolves a later page after content is inserted ahead of a block", () => {
    const target = block("ana", "action", [30], 80);
    const before = pagesOf([block("open", "action", [80], 1), target], 100, "script");
    expect(getPageForBlock(before, "ana")).toBe(2);
    const after = pagesOf(
      [block("extra", "action", [80], 1), block("open", "action", [80], 40), { ...target, pos: 120 }],
      100,
      "script",
    );
    expect(getPageForBlock(after, "ana")).toBe(3);
    expect(getPageForPosition(after, 121)).toBe(3);
    expect(getPositionForPage(after, 1)).toBe(2);
    expect(getPageRange(after, 1)).toEqual({ from: 2, to: 10 });
    expect(getPageRange(after, 9)).toBeNull();
  });

  it("reuses the tail when an edit does not move the following page boundary", () => {
    const blocks = [block("a", "paragraph", [40], 1), block("b", "paragraph", [40], 20), block("c", "paragraph", [40, 40], 40)];
    const first = paginate({ blocks, contentHeight: 100, kind: "prose" });
    const again = paginate({ blocks, contentHeight: 100, kind: "prose", previous: first.map, dirtyBlockId: "c" });
    expect(again.stableFromPage).not.toBeNull();
    expect(pageMapSignature(again.map)).toBe(pageMapSignature(first.map));
    const taller = blocks.map((item) => (item.blockId === "a" ? block("a", "paragraph", [40, 40, 40], 1) : item));
    const shifted = paginate({ blocks: taller, contentHeight: 100, kind: "prose", previous: first.map, dirtyBlockId: "a" });
    expect(getPageForBlock(shifted.map, "c")).toBeGreaterThan(getPageForBlock(first.map, "c") ?? 0);
  });

  it("keeps a manual page break in the document and out of the derived text", () => {
    const content = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Antes" }] },
        { type: "pageBreak" },
        { type: "paragraph", content: [{ type: "text", text: "Después" }] },
      ],
    };
    const editor = new Editor({
      extensions: [createWriterStarterKit(), WriterChapter, WriterChapterTitle, ...writerScreenplayNodes],
      content,
    });
    expect(editor.getJSON().content?.map((node) => node.type)).toEqual(["paragraph", "pageBreak", "paragraph"]);
    const again = new Editor({
      extensions: [createWriterStarterKit(), WriterChapter, WriterChapterTitle, ...writerScreenplayNodes],
      content: editor.getHTML(),
    });
    expect(again.getJSON().content?.map((node) => node.type)).toEqual(["paragraph", "pageBreak", "paragraph"]);
    expect(plainTextFromWriterContent(again.getJSON())).toBe("Antes\n\nDespués");
    editor.commands.setContent({
      type: "doc",
      content: [{
        type: "chapter",
        attrs: { id: "c1" },
        content: [{ type: "chapterTitle", content: [{ type: "text", text: "Uno" }] }, { type: "pageBreak" }, { type: "paragraph" }],
      }],
    });
    expect(editor.getJSON().content?.[0]?.content?.map((node) => node.type)).toEqual(["chapterTitle", "pageBreak", "paragraph"]);
    editor.destroy();
    again.destroy();
  });
});
