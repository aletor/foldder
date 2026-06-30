import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { LOOP_COMMIT_EVENT } from "@/app/spaces/loop/use-loop-context";
import { dispatchPopulateDesignerCommit } from "./populate-designer-commit";

describe("dispatchPopulateDesignerCommit", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { dispatchEvent: vi.fn() });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("emite LOOP_COMMIT_EVENT con nodos Designer congelados", () => {
    dispatchPopulateDesignerCommit({
      populateNodeId: "pop_1",
      spaceName: "Mi Populate",
      instances: [
        {
          label: "Hero",
          pages: [{ id: "pg1", format: "a4v", objects: [] }],
        },
      ],
    });

    expect(window.dispatchEvent).toHaveBeenCalledTimes(1);
    const event = vi.mocked(window.dispatchEvent).mock.calls[0]![0] as CustomEvent;
    expect(event.type).toBe(LOOP_COMMIT_EVENT);
    expect(event.detail.loopNodeId).toBe("pop_1");
    expect(event.detail.spaceName).toBe("Mi Populate");
    expect(event.detail.nodes).toHaveLength(1);
    expect(event.detail.nodes[0]!.type).toBe("designer");
    expect(event.detail.nodes[0]!.data.label).toBe("Hero");
  });
});
