import { describe, expect, it } from "vitest";
import { dragEventHasFiles } from "./drag-files";

describe("dragEventHasFiles", () => {
  it("true cuando el transfer incluye Files", () => {
    expect(dragEventHasFiles({ dataTransfer: { types: ["Files", "text/plain"] } })).toBe(true);
  });

  it("false para drags internos sin archivos", () => {
    expect(dragEventHasFiles({ dataTransfer: { types: ["text/plain"] } })).toBe(false);
    expect(dragEventHasFiles({ dataTransfer: { types: [] } })).toBe(false);
  });
});
