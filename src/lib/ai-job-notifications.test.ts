import { describe, expect, it, beforeEach, vi } from "vitest";
import { resetActiveAiJobsForTests, isNodeAiExecutionActive } from "./ai-active-jobs";
import { runAiJobWithNotification } from "./ai-job-notifications";

describe("runAiJobWithNotification", () => {
  beforeEach(() => {
    resetActiveAiJobsForTests();
  });

  it("registers node execution for canvas overlay lifecycle", async () => {
    const fn = vi.fn(async () => undefined);
    await runAiJobWithNotification({ nodeId: "nb-1", label: "Test" }, fn);
    expect(fn).toHaveBeenCalled();
    expect(isNodeAiExecutionActive("nb-1")).toBe(false);
  });

  it("clears node execution when fn throws", async () => {
    await runAiJobWithNotification({ nodeId: "nb-2", label: "Test" }, async () => {
      throw new Error("fail");
    });
    expect(isNodeAiExecutionActive("nb-2")).toBe(false);
  });

  it("clears after overlapping runs on the same node complete", async () => {
    let resolveFirst!: () => void;
    const first = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });
    const slow = runAiJobWithNotification({ nodeId: "nb-3", label: "Slow" }, async () => {
      await first;
    });
    await runAiJobWithNotification({ nodeId: "nb-3", label: "Fast" }, async () => undefined);
    expect(isNodeAiExecutionActive("nb-3")).toBe(true);
    resolveFirst();
    await slow;
    expect(isNodeAiExecutionActive("nb-3")).toBe(false);
  });
});
