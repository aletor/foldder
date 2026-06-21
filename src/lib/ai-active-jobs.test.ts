import { describe, expect, it, beforeEach } from "vitest";
import {
  aiActiveJobEndFetch,
  aiActiveJobEndNode,
  aiActiveJobProgressNode,
  aiActiveJobReleaseNode,
  aiActiveJobStartFetch,
  aiActiveJobStartNode,
  getActiveAiJobProgressForNode,
  getActiveAiJobsForHudSnapshot,
  getActiveAiJobsSnapshot,
  getActiveAiNodeIdsSnapshot,
  isNodeAiExecutionActive,
  isNodeManagedAiPath,
  resetActiveAiJobsForTests,
} from "./ai-active-jobs";

describe("ai-active-jobs", () => {
  beforeEach(() => {
    resetActiveAiJobsForTests();
  });

  it("tracks multiple fetch jobs concurrently", () => {
    const a = aiActiveJobStartFetch("Veo");
    const b = aiActiveJobStartFetch("Guionista");
    expect(getActiveAiJobsSnapshot()).toHaveLength(2);
    aiActiveJobEndFetch(a);
    expect(getActiveAiJobsSnapshot()).toHaveLength(1);
    expect(getActiveAiJobsSnapshot()[0]?.label).toBe("Guionista");
    aiActiveJobEndFetch(b);
    expect(getActiveAiJobsSnapshot()).toHaveLength(0);
  });

  it("tracks node job progress by nodeId", () => {
    aiActiveJobStartNode("node-1", "Image Creation");
    expect(getActiveAiJobProgressForNode("node-1")).toBeNull();
    expect(getActiveAiNodeIdsSnapshot().has("node-1")).toBe(true);
    aiActiveJobProgressNode("node-1", 42.4);
    expect(getActiveAiJobProgressForNode("node-1")).toBe(42);
    aiActiveJobEndNode("node-1");
    expect(getActiveAiJobProgressForNode("node-1")).toBeNull();
    expect(isNodeAiExecutionActive("node-1")).toBe(false);
  });

  it("ref-counts nested node executions", () => {
    aiActiveJobStartNode("node-1", "A");
    aiActiveJobStartNode("node-1", "B");
    expect(isNodeAiExecutionActive("node-1")).toBe(true);
    aiActiveJobEndNode("node-1");
    expect(isNodeAiExecutionActive("node-1")).toBe(true);
    aiActiveJobEndNode("node-1");
    expect(isNodeAiExecutionActive("node-1")).toBe(false);
  });

  it("release clears node regardless of ref count", () => {
    aiActiveJobStartNode("node-1", "A");
    aiActiveJobStartNode("node-1", "B");
    aiActiveJobReleaseNode("node-1");
    expect(isNodeAiExecutionActive("node-1")).toBe(false);
  });

  it("sorts jobs by startedAt", async () => {
    aiActiveJobStartFetch("A");
    await new Promise((r) => setTimeout(r, 5));
    aiActiveJobStartFetch("B");
    const labels = getActiveAiJobsSnapshot().map((j) => j.label);
    expect(labels).toEqual(["A", "B"]);
  });

  it("identifies node-managed gemini generate paths", () => {
    expect(isNodeManagedAiPath("/api/gemini/generate")).toBe(true);
    expect(isNodeManagedAiPath("/api/gemini/generate-stream")).toBe(true);
    expect(isNodeManagedAiPath("/api/gemini/video")).toBe(true);
    expect(isNodeManagedAiPath("/api/spaces/describe")).toBe(true);
    expect(isNodeManagedAiPath("/api/openai/enhance")).toBe(true);
    expect(isNodeManagedAiPath("/api/inspiration/search")).toBe(true);
    expect(isNodeManagedAiPath("/api/spaces/guionista")).toBe(false);
  });

  it("dedupes HUD snapshot when node and fetch jobs overlap", () => {
    aiActiveJobStartNode("node-desc", "Image Describer");
    aiActiveJobStartFetch("OpenAI");
    expect(getActiveAiJobsSnapshot()).toHaveLength(2);
    const hud = getActiveAiJobsForHudSnapshot();
    expect(hud).toHaveLength(1);
    expect(hud[0]?.label).toBe("Image Describer");
    expect(hud[0]?.source).toBe("node");
  });

  it("shows fetch-only jobs in HUD when no node job is active", () => {
    const id = aiActiveJobStartFetch("Guionista");
    expect(getActiveAiJobsForHudSnapshot()).toHaveLength(1);
    expect(getActiveAiJobsForHudSnapshot()[0]?.label).toBe("Guionista");
    aiActiveJobEndFetch(id);
  });

  it("returns a stable HUD snapshot reference between reads", () => {
    aiActiveJobStartNode("node-desc", "Image Describer");
    const first = getActiveAiJobsForHudSnapshot();
    const second = getActiveAiJobsForHudSnapshot();
    expect(first).toBe(second);
    aiActiveJobEndNode("node-desc");
  });

  it("dedupes HUD rows by nodeId", () => {
    aiActiveJobStartNode("node-a", "Image Creation");
    aiActiveJobStartFetch("Image Creation");
    expect(getActiveAiJobsForHudSnapshot()).toHaveLength(1);
    expect(getActiveAiJobsForHudSnapshot()[0]?.nodeId).toBe("node-a");
    aiActiveJobEndNode("node-a");
  });
});
