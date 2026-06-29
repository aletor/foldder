import { describe, expect, it } from "vitest";
import type { FreehandObject } from "../FreehandStudio";
import { freehandHistoryContentKey, freehandHistoryEntriesEqual } from "./freehand-history-utils";

function leaf(id: string, x = 0): FreehandObject {
  return { id, type: "rect", name: id, x, y: 0, width: 10, height: 10 } as unknown as FreehandObject;
}

describe("freehand-history-utils", () => {
  it("treats identical object trees and selection as equal", () => {
    const a = { objects: [leaf("a", 12)], sel: ["a"] };
    const b = { objects: [leaf("a", 12)], sel: ["a"] };
    expect(freehandHistoryEntriesEqual(a, b)).toBe(true);
  });

  it("ignores selection order", () => {
    const objects = [leaf("a"), leaf("b")];
    const k1 = freehandHistoryContentKey(objects, ["b", "a"]);
    const k2 = freehandHistoryContentKey(objects, ["a", "b"]);
    expect(k1).toBe(k2);
  });

  it("detects geometry changes", () => {
    const a = { objects: [leaf("a", 1)], sel: [] as string[] };
    const b = { objects: [leaf("a", 2)], sel: [] as string[] };
    expect(freehandHistoryEntriesEqual(a, b)).toBe(false);
  });
});
