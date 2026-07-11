import { describe, expect, it } from "vitest";
import { emptyBrandKitBoardMeta } from "./interpretation";
import { reduceBrandKitEvent } from "./brandkit-event-reducer";

describe("reduceBrandKitEvent", () => {
  it("run.started marca secciones afectadas como running", () => {
    const next = reduceBrandKitEvent(emptyBrandKitBoardMeta(), {
      type: "run.started",
      runId: "run-1",
      affected: ["palette", "logo"],
    });
    expect(next.board.sectionState.palette).toBe("running");
    expect(next.board.sectionState.logo).toBe("running");
    expect(next.board.lastRunId).toBe("run-1");
  });

  it("run.completed limpia running y actualiza review", () => {
    const base = reduceBrandKitEvent(emptyBrandKitBoardMeta(), {
      type: "run.started",
      runId: "run-1",
      affected: ["tone"],
    });
    const next = reduceBrandKitEvent(base, {
      type: "run.completed",
      runId: "run-1",
      review: { pending: 2, conflicts: 1 },
    });
    expect(next.board.sectionState.tone).toBe("idle");
    expect(next.review).toEqual({ pending: 2, conflicts: 1 });
  });

  it("section.updated respeta seq guard", () => {
    let meta = emptyBrandKitBoardMeta();
    meta = reduceBrandKitEvent(meta, {
      type: "section.updated",
      runId: "run-1",
      section: "messages",
      seq: 2,
      final: true,
    });
    expect(meta.board.sectionSeq.messages).toBe(2);
    const ignored = reduceBrandKitEvent(meta, {
      type: "section.updated",
      runId: "run-1",
      section: "messages",
      seq: 1,
      final: true,
    });
    expect(ignored.board.sectionSeq.messages).toBe(2);
  });
});
