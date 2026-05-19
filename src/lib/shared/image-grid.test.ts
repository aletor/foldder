import { describe, expect, it } from "vitest";
import { resolveImageGridLayout } from "./image-grid";

describe("shared image grid layout", () => {
  it.each([
    [1, 1, 1, 1, 0],
    [2, 2, 1, 2, 0],
    [3, 2, 2, 3, 0],
    [4, 2, 2, 4, 0],
    [5, 3, 2, 5, 0],
    [6, 3, 2, 6, 0],
    [7, 3, 3, 7, 0],
    [9, 3, 3, 9, 0],
    [10, 4, 4, 10, 0],
    [16, 4, 4, 16, 0],
    [18, 4, 4, 16, 2],
  ])("uses deterministic layout for %i image(s)", (count, columns, rows, usedImageCount, discardedImageCount) => {
    expect(resolveImageGridLayout(count)).toMatchObject({
      columns,
      discardedImageCount,
      rows,
      usedImageCount,
    });
  });
});
