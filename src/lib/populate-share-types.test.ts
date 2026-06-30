import { describe, expect, it } from "vitest";
import { normalizePopulateShareTemplates } from "@/lib/populate-share-types";
import type { PopulateSharePayload } from "@/lib/populate-share-types";

describe("normalizePopulateShareTemplates", () => {
  it("returns templates array when present", () => {
    const payload = {
      title: "T",
      listId: "l1",
      rowsSnapshot: [],
      templates: [
        {
          templateNodeId: "d1",
          templateLabel: "Designer",
          binding: {
            templateNodeId: "d1",
            templateLabel: "Designer",
            labelColumnFieldId: "f1",
            picks: [],
            sources: {},
            slotColumns: {},
          },
          formModel: { picks: [], fields: [], slideCount: 1, empty: true },
          pages: [],
          slideCount: 1,
        },
      ],
    } satisfies PopulateSharePayload;
    expect(normalizePopulateShareTemplates(payload)).toHaveLength(1);
  });

  it("migrates legacy single-template payload", () => {
    const payload = {
      title: "Legacy",
      listId: "l1",
      rowsSnapshot: [],
      templates: [],
      binding: {
        templateNodeId: "d1",
        templateLabel: "Old",
        labelColumnFieldId: "f1",
        picks: [],
        sources: {},
        slotColumns: {},
      },
      formModel: { picks: [], fields: [], slideCount: 2, empty: false },
      pages: [{ id: "p1", name: "1", layers: [] }],
      slideCount: 2,
    } as PopulateSharePayload;
    const normalized = normalizePopulateShareTemplates(payload);
    expect(normalized).toHaveLength(1);
    expect(normalized[0]?.templateNodeId).toBe("d1");
    expect(normalized[0]?.slideCount).toBe(2);
  });
});
