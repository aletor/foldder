import { describe, expect, it } from "vitest";
import type { TelemetryBatch } from "./brain-telemetry";
import { BrainService, BrainValidationError } from "./brain-service";

function baseBatch(overrides: Partial<TelemetryBatch> = {}): TelemetryBatch {
  const ts = new Date().toISOString();
  return {
    version: 2,
    batchId: `batch-${Math.random().toString(36).slice(2, 10)}`,
    sessionId: "sess-test",
    projectId: "p1",
    nodeId: "n1",
    capturedAt: ts,
    createdAt: ts,
    flushReason: "manual",
    nodeType: "DESIGNER",
    events: [{ kind: "MANUAL_OVERRIDE", ts, fieldRef: "brain:lengthPreset" }],
    ...overrides,
  };
}

describe("BrainService", () => {
  it("getBrainContext devuelve BrandDNA, CreativePreferences y ProjectMemory unificados", async () => {
    const svc = new BrainService();
    const ctx = await svc.getBrainContext("p-unified", "ws-1");
    expect(ctx.projectId).toBe("p-unified");
    expect(ctx.workspaceId).toBe("ws-1");
    expect(ctx.brandDna).toBeDefined();
    expect(Array.isArray(ctx.brandDna.claims)).toBe(true);
    expect(ctx.preferences).toBeDefined();
    expect(ctx.projectMemory.entries).toEqual([]);
    expect(Array.isArray(ctx.contextualMemory)).toBe(true);
  });

  it("syncNodeTelemetry acepta un batch válido y lo encola", async () => {
    const svc = new BrainService();
    const batch = baseBatch();
    const out = await svc.syncNodeTelemetry("p1", "n1", batch, "ws");
    expect("record" in out).toBe(true);
    if ("record" in out) {
      expect(out.record.batch.events.length).toBe(1);
      expect(out.record.batch.batchId).toBeDefined();
    }
    expect(svc.peekTelemetryQueue().length).toBeGreaterThan(0);
  });

  it("syncNodeTelemetry rechaza batches inválidos", async () => {
    const svc = new BrainService();
    const bad = baseBatch({ version: 1 as unknown as 2 });
    await expect(svc.syncNodeTelemetry("p1", "n1", bad)).rejects.toBeInstanceOf(BrainValidationError);
    const badKind = baseBatch({
      events: [{ kind: "NOT_A_REAL_KIND" as never, ts: new Date().toISOString() }],
    });
    await expect(svc.syncNodeTelemetry("p1", "n1", badKind)).rejects.toBeInstanceOf(BrainValidationError);
  });

  it("syncNodeTelemetry no ingiere dos veces el mismo batchId", async () => {
    const svc = new BrainService();
    const batch = baseBatch({ batchId: "idem-1" });
    const first = await svc.syncNodeTelemetry("p1", "n1", batch);
    expect("record" in first).toBe(true);
    const second = await svc.syncNodeTelemetry("p1", "n1", batch);
    expect(second).toEqual({ duplicate: true, batchId: "idem-1" });
  });

  it("summarizeRecentTelemetryForNodes agrupa eventos por nodeId de canvas", async () => {
    const svc = new BrainService();
    const ts = new Date().toISOString();
    const mk = (
      batchId: string,
      sessionId: string,
      nodeId: string,
      projectId: string,
      events: TelemetryBatch["events"],
    ) =>
      baseBatch({
        batchId,
        sessionId,
        nodeId,
        projectId,
        events,
        capturedAt: ts,
        createdAt: ts,
      });
    await svc.syncNodeTelemetry(
      "p-sum",
      "node-a",
      mk("sb-1", "sess-a", "node-a", "p-sum", [
        { kind: "CONTENT_EXPORTED", ts, exportFormat: "pdf" },
        { kind: "TEXT_FINALIZED", ts },
      ]),
    );
    await svc.syncNodeTelemetry(
      "p-sum",
      "node-a",
      mk("sb-2", "sess-b", "node-a", "p-sum", [{ kind: "COLOR_USED", ts, colorHex: "#000000" }]),
    );
    await svc.syncNodeTelemetry(
      "p-sum",
      "node-b",
      mk("sb-3", "sess-c", "node-b", "p-sum", [{ kind: "IMAGE_EDITED", ts }]),
    );
    const dig = svc.summarizeRecentTelemetryForNodes("p-sum", ["node-a", "node-b"]);
    const a = dig.find((d) => d.nodeId === "node-a");
    const b = dig.find((d) => d.nodeId === "node-b");
    expect(a?.eventCounts.CONTENT_EXPORTED).toBe(1);
    expect(a?.eventCounts.TEXT_FINALIZED).toBe(1);
    expect(a?.eventCounts.COLOR_USED).toBe(1);
    expect(b?.eventCounts.IMAGE_EDITED).toBe(1);
    expect(a?.lastAt).toBeTruthy();
  });

  it("listPendingLearnings solo devuelve PENDING_REVIEW", async () => {
    const svc = new BrainService({
      pending: [
        {
          id: "a",
          projectId: "p1",
          status: "PENDING_REVIEW",
          candidate: {
            type: "PROJECT_MEMORY",
            scope: "PROJECT",
            topic: "tone",
            value: "v",
            confidence: 0.5,
            reasoning: "x".repeat(20),
            evidence: { sourceNodeIds: ["n"], sourceNodeTypes: ["designer"] },
          },
          sourceSessionIds: [],
          createdAt: "2020-01-01T00:00:00.000Z",
        },
        {
          id: "b",
          projectId: "p1",
          status: "DISMISSED",
          candidate: {
            type: "PROJECT_MEMORY",
            scope: "PROJECT",
            topic: "message",
            value: "v2",
            confidence: 0.5,
            reasoning: "y".repeat(20),
            evidence: { sourceNodeIds: ["n"], sourceNodeTypes: ["designer"] },
          },
          sourceSessionIds: [],
          createdAt: "2020-01-02T00:00:00.000Z",
        },
      ],
    });
    const list = await svc.listPendingLearnings("p1");
    expect(list.map((x) => x.id)).toEqual(["a"]);
  });

  it("resolvePendingLearning PROMOTE_TO_DNA con CONTRADICTION añade claim estático (BRAND_DNA va al proyecto en cliente)", async () => {
    const svc = new BrainService();
    await svc.createLearningCandidates(
      "p1",
      [
        {
          type: "CONTRADICTION",
          scope: "BRAND",
          topic: "claim",
          value: "Nuevo claim desde test",
          confidence: 0.9,
          reasoning: "Razonamiento breve de apoyo.",
          evidence: { sourceNodeIds: ["n1"], sourceNodeTypes: ["designer"] },
        },
      ],
      { workspaceId: "ws", nodeId: "n1" },
    );
    const pending = await svc.listPendingLearnings("p1");
    const id = pending[0]!.id;
    const before = await svc.getBrainContext("p1", "ws");
    const claimsBefore = before.brandDna.claims.length;
    await svc.resolvePendingLearning(id, "PROMOTE_TO_DNA", { updatedBy: "tester@example.com" });
    const after = await svc.getBrainContext("p1", "ws");
    expect(after.brandDna.claims.length).toBe(claimsBefore + 1);
    expect(after.brandDna.claims.some((c) => c.text.includes("Nuevo claim"))).toBe(true);
  });

  it("resolvePendingLearning KEEP_IN_PROJECT escribe ProjectMemory", async () => {
    const svc = new BrainService();
    await svc.createLearningCandidates(
      "p1",
      [
        {
          type: "PROJECT_MEMORY",
          scope: "PROJECT",
          topic: "project_memory",
          value: "Solo proyecto",
          confidence: 0.6,
          reasoning: "Razonamiento breve de apoyo.",
          evidence: { sourceNodeIds: ["n1"], sourceNodeTypes: ["designer"] },
        },
      ],
      { workspaceId: "ws" },
    );
    const id = (await svc.listPendingLearnings("p1"))[0]!.id;
    await svc.resolvePendingLearning(id, "KEEP_IN_PROJECT");
    const ctx = await svc.getBrainContext("p1", "ws");
    expect(ctx.projectMemory.entries.some((e) => e.value === "Solo proyecto")).toBe(true);
  });

  it("resolvePendingLearning SAVE_AS_CONTEXT escribe ContextualMemory", async () => {
    const svc = new BrainService();
    await svc.createLearningCandidates(
      "p1",
      [
        {
          type: "OUTLIER",
          scope: "WORKSPACE",
          topic: "contextual_memory",
          value: "Contexto lateral",
          confidence: 0.3,
          reasoning: "Razonamiento breve de apoyo.",
          evidence: { sourceNodeIds: ["n1"], sourceNodeTypes: ["designer"] },
        },
      ],
      { workspaceId: "ws" },
    );
    const id = (await svc.listPendingLearnings("p1"))[0]!.id;
    await svc.resolvePendingLearning(id, "SAVE_AS_CONTEXT");
    const ctx = await svc.getBrainContext("p1", "ws");
    expect(ctx.contextualMemory.some((e) => e.value === "Contexto lateral" && !e.isOutlier)).toBe(true);
  });

  it("resolvePendingLearning DISMISS marca DISMISSED", async () => {
    const svc = new BrainService();
    await svc.createLearningCandidates(
      "p1",
      [
        {
          type: "PROJECT_MEMORY",
          scope: "PROJECT",
          topic: "creative_preference",
          value: "descartar",
          confidence: 0.2,
          reasoning: "Razonamiento breve de apoyo.",
          evidence: { sourceNodeIds: ["n1"], sourceNodeTypes: ["designer"] },
        },
      ],
      { workspaceId: "ws" },
    );
    const id = (await svc.listPendingLearnings("p1"))[0]!.id;
    const r = await svc.resolvePendingLearning(id, "DISMISS");
    expect(r.learning.status).toBe("DISMISSED");
    expect((await svc.listPendingLearnings("p1")).length).toBe(0);
  });

  it("createLearningCandidates añade decisionTrace a candidatos visual/restudy con contexto suficiente", async () => {
    const svc = new BrainService();
    await svc.createLearningCandidates(
      "p1",
      [
        {
          type: "VISUAL_MEMORY",
          scope: "PROJECT",
          topic: "visual_direction",
          value: "Predomina una estética editorial cálida con luz lateral.",
          confidence: 0.74,
          reasoning: "Patrones visuales consistentes en referencias analizadas.",
          evidence: {
            sourceNodeIds: ["brain:visual_references"],
            sourceNodeTypes: ["brain_studio"],
            evidenceSource: "visual_reference",
            sourceArtifactIds: ["img-a", "img-b"],
            eventCounts: {
              selected_visual_dna_slot_id: "slot-hero-1",
              selected_visual_dna_layer: "palette",
            },
          },
        },
      ],
      {
        workspaceId: "ws",
        sourceAnalysisId: "analysis-visual-001",
        createdFromAnalysisVersion: "restudy-v1",
      },
    );
    const row = (await svc.listPendingLearnings("p1"))[0];
    expect(row).toBeDefined();
    expect(row?.decisionTraceId).toBeTruthy();
    expect(row?.decisionTrace?.kind).toBe("learning_candidate");
    expect(row?.decisionTrace?.persistenceIntent).toBe("pending_review");
    expect(row?.decisionTrace?.outputSummary.summary).toMatch(/Origen visual\/restudy/i);
    expect(row?.decisionTrace?.inputs.some((x) => x.label.includes("selected_visual_dna_slot_id"))).toBe(true);
    expect(row?.decisionTrace?.inputs.some((x) => x.label.includes("selected_visual_dna_layer"))).toBe(true);
  });

  it("createLearningCandidates no añade decisionTrace automática en candidatos no visuales", async () => {
    const svc = new BrainService();
    await svc.createLearningCandidates(
      "p1",
      [
        {
          type: "PROJECT_MEMORY",
          scope: "PROJECT",
          topic: "project_memory",
          value: "Preferencia de copy para este proyecto.",
          confidence: 0.52,
          reasoning: "Ajustes de copy repetidos en edición.",
          evidence: {
            sourceNodeIds: ["designer-1"],
            sourceNodeTypes: ["designer"],
            evidenceSource: "telemetry",
          },
        },
      ],
      { workspaceId: "ws", nodeId: "designer-1" },
    );
    const row = (await svc.listPendingLearnings("p1"))[0];
    expect(row).toBeDefined();
    expect(row?.decisionTraceId).toBeUndefined();
    expect(row?.decisionTrace).toBeUndefined();
  });
});
