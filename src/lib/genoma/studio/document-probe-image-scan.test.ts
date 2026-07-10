import { describe, expect, it } from "vitest";
import { bboxIoU, mergeOtherImageLists } from "./document-probe-image-scan";

describe("document-probe-image-scan", () => {
  it("mergeOtherImageLists deduplica por IoU en la misma página", () => {
    const primary = [
      {
        page: 5,
        x: 0.1,
        y: 0.1,
        width: 0.3,
        height: 0.3,
        description: "Foto A",
      },
    ];
    const extra = [
      {
        page: 5,
        x: 0.12,
        y: 0.12,
        width: 0.28,
        height: 0.28,
        description: "Foto A duplicada",
      },
      {
        page: 8,
        x: 0.2,
        y: 0.2,
        width: 0.4,
        height: 0.35,
        description: "Diagrama",
      },
    ];

    const merged = mergeOtherImageLists(primary, extra, 10);
    expect(merged).toHaveLength(2);
    expect(merged[1]?.page).toBe(8);
    expect(bboxIoU(primary[0]!, extra[0]!)).toBeGreaterThan(0.4);
  });
});
