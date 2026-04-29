import { describe, expect, it } from "vitest";
import { defaultProjectAssets, normalizeProjectAssets } from "@/app/spaces/project-assets-metadata";
import { buildBrainRuntimeContext } from "./brain-runtime-context";
import {
  capDecisionTraces,
  createBrainDecisionTrace,
  summarizeVisualPromptTrace,
} from "./brain-decision-trace";
import {
  MockBrainLearningExtractionLlm,
  TelemetryProcessor,
  type TelemetryStreamEvent,
} from "./telemetry-processor";
import type { LearningCandidate } from "./learning-candidate-schema";
import { InMemoryLearningCandidateStore } from "./telemetry-processor";

function makeTrace(i: number) {
  return createBrainDecisionTrace({
    id: `trace-${i}`,
    kind: "runtime_context",
    createdAt: new Date(2026, 0, 1, 0, i, 0).toISOString(),
    inputs: [{ id: `in-${i}`, kind: "slice", label: `slice-${i}` }],
    outputSummary: { summary: `trace-summary-${i}` },
    confidence: 0.6,
  });
}

function batch(
  nodeType: "DESIGNER",
  events: Array<{ kind: "CONTENT_EXPORTED"; ts: string; exportFormat?: "pdf" | "png" | "webp" | "vector_pdf" | "jpg" }>,
): TelemetryStreamEvent["batches"][number] {
  const ts = events[0]?.ts ?? new Date().toISOString();
  return {
    version: 2,
    batchId: "trace-batch-1",
    sessionId: "trace-session-1",
    projectId: "p-trace",
    nodeId: "node-trace",
    capturedAt: ts,
    createdAt: ts,
    flushReason: "export",
    nodeType,
    events,
  };
}

describe("BrainDecisionTrace helpers", () => {
  it("capDecisionTraces conserva solo las 50 trazas más recientes (orden desc)", () => {
    const traces = Array.from({ length: 70 }, (_, i) => makeTrace(i));
    const out = capDecisionTraces(traces, { max: 50, order: "desc", payloadRiskMax: 25 });
    expect(out).toHaveLength(50);
    expect(out[0]?.id).toBe("trace-69");
    expect(out[49]?.id).toBe("trace-20");
  });

  it("normalizeProjectAssets conserva decisionTraces y normaliza trazas legacy incompletas", () => {
    const base = defaultProjectAssets();
    const raw = {
      ...base,
      strategy: {
        ...base.strategy,
        decisionTraces: [
          { kind: "learning_candidate", outputSummary: { summary: "legacy trace" }, confidence: 2 },
          makeTrace(1),
        ],
      },
    };
    const out = normalizeProjectAssets(raw);
    expect(out.strategy.decisionTraces?.length).toBe(2);
    expect(out.strategy.decisionTraces?.[0]?.id).toBeTruthy();
    expect(out.strategy.decisionTraces?.[0]?.confidence).toBeLessThanOrEqual(1);
    expect(out.strategy.decisionTraces?.[0]?.persistenceIntent).toBe("pending_review");
  });
});

describe("Brain runtime + telemetry trace wiring", () => {
  it("buildBrainRuntimeContext mantiene API previa y añade decisionTrace opcional", () => {
    const assets = defaultProjectAssets();
    const ctx = buildBrainRuntimeContext({
      assets,
      targetNodeType: "guionista",
      targetNodeId: "node-1",
      useCase: "article_generation",
      flowNodes: [{ id: "n1" }],
      flowEdges: [{ id: "e1" }],
    });
    expect(Array.isArray(ctx.contextSlices)).toBe(true);
    expect(Array.isArray(ctx.warnings)).toBe(true);
    expect(typeof ctx.confidence).toBe("number");
    expect(ctx.traceId).toBeTruthy();
    expect(ctx.decisionTrace?.id).toBe(ctx.traceId);
    expect(ctx.decisionTrace?.kind).toBe("runtime_context");
    expect(ctx.decisionTrace?.persistenceIntent).toBe("ephemeral");
  });

  it("visual_prompt de preview queda como ephemeral", () => {
    const trace = summarizeVisualPromptTrace({
      targetNodeType: "visual_prompt",
      visualDiagnosticsId: "vd-1",
      visualSourcesUsed: { selectedVisualDnaSlot: true, fallbackPalette: true },
      chosenAxes: { territory: "palette", variation: "safe" },
      finalPrompt: "Editorial warm light, high contrast, realistic texture details.",
      warnings: ["fallback visual source"],
      confidence: 0.58,
    });
    expect(trace.kind).toBe("visual_prompt");
    expect(trace.persistenceIntent).toBe("ephemeral");
  });

  it("toStoredPending enlaza decisionTraceId para learning candidate", () => {
    const store = new InMemoryLearningCandidateStore();
    const proc = new TelemetryProcessor(new MockBrainLearningExtractionLlm(), store);
    const ts = new Date().toISOString();
    const event: TelemetryStreamEvent = {
      projectId: "p-trace",
      workspaceId: "__root__",
      nodeId: "node-trace",
      receivedAt: ts,
      batches: [
        batch("DESIGNER", [{ kind: "CONTENT_EXPORTED", ts, exportFormat: "pdf" }]),
      ],
    };
    const aggregated = proc.aggregateBatchForEvent(event);
    const candidate: LearningCandidate = {
      type: "PROJECT_MEMORY",
      scope: "PROJECT",
      topic: "project_memory",
      value: "Conservar tono breve para export.",
      confidence: 0.63,
      reasoning: "Se observó export con ajustes manuales recurrentes.",
      evidence: {
        sourceNodeIds: ["node-trace"],
        sourceNodeTypes: ["DESIGNER"],
        evidenceSource: "telemetry",
      },
    };
    const rows = proc.toStoredPending(event, aggregated, [candidate]);
    expect(aggregated.decisionTraceId).toBeTruthy();
    expect(aggregated.decisionTrace?.kind).toBe("telemetry_aggregation");
    expect(aggregated.decisionTrace?.persistenceIntent).toBe("ephemeral");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.decisionTraceId).toBeTruthy();
    expect(rows[0]?.decisionTrace?.kind).toBe("learning_candidate");
    expect(rows[0]?.decisionTrace?.persistenceIntent).toBe("pending_review");
  });
});
