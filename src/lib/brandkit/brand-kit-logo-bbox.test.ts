import { describe, expect, it } from "vitest";
import { isValidBboxPage, logoSourceBboxToPageTuple, pageTupleToLogoSourceBbox } from "./brand-kit-logo-bbox";

describe("brand-kit-logo-bbox helpers", () => {
  it("roundtrips normalized bbox tuples", () => {
    const tuple = [0.04, 0.03, 0.32, 0.12] as const;
    const bbox = pageTupleToLogoSourceBbox(tuple);
    expect(logoSourceBboxToPageTuple(bbox)).toEqual(tuple);
  });

  it("rejects degenerate bbox tuples", () => {
    expect(isValidBboxPage([0.1, 0.1, 0.5, 0.3])).toBe(true);
    expect(isValidBboxPage([1, 1, 1, 1])).toBe(false);
    expect(isValidBboxPage([Number.NaN, 0, 0.2, 0.2])).toBe(false);
  });

  it("normalizes gemini 0-1000 bbox to page tuple", () => {
    const tuple = logoSourceBboxToPageTuple({ x: 50, y: 40, width: 160, height: 70 });
    expect(tuple).toEqual([0.05, 0.04, 0.21, 0.11]);
  });
});
