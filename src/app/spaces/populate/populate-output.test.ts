import { describe, expect, it } from "vitest";
import {
  buildPopulateMultiTemplateRunOutput,
  buildPopulateRunOutput,
} from "./populate-output";

describe("buildPopulateRunOutput", () => {
  it("builds value, lastRunOutputs and mediaListOutput", () => {
    const out = buildPopulateRunOutput({
      nodeId: "pop1",
      label: "Campaign",
      slideUrls: ["https://x/a.png", "https://x/b.png"],
      templateLabel: "Hero",
    });
    expect(out.value).toBe("https://x/a.png");
    expect(out.lastRunOutputs).toHaveLength(2);
    expect(out.mediaListOutput.kind).toBe("media_list");
    expect(out.mediaListOutput.sourceNodeType).toBe("populate");
    expect(out.mediaListOutput.items).toHaveLength(2);
  });
});

describe("buildPopulateMultiTemplateRunOutput", () => {
  it("concatenates packs from multiple templates", () => {
    const out = buildPopulateMultiTemplateRunOutput({
      nodeId: "pop1",
      label: "Pack",
      packs: [
        { templateLabel: "A", slideUrls: ["https://x/a1.png"] },
        { templateLabel: "B", slideUrls: ["https://x/b1.png", "https://x/b2.png"] },
      ],
    });
    expect(out.lastRunOutputs).toHaveLength(3);
    expect(out.mediaListOutput.items[0]?.title).toContain("A");
    expect(out.mediaListOutput.items[2]?.title).toContain("B");
  });
});
