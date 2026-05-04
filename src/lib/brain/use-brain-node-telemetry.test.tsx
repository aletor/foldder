import React from "react";
import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { DesignerSpaceIdContext } from "@/contexts/DesignerSpaceIdContext";
import { SpacesActiveProjectIdContext } from "@/contexts/SpacesActiveProjectIdContext";
import { useBrainNodeTelemetry } from "./use-brain-node-telemetry";
import type { TelemetryBatch } from "./brain-telemetry";

const syncMock = vi.hoisted(() =>
  vi.fn(async (args: unknown) => {
    void args;
    return { ok: true };
  }),
);

vi.mock("./brain-telemetry-client", () => ({
  syncNodeTelemetryViaApi: (args: unknown) => syncMock(args),
}));

function wrapper(pid: string, children: React.ReactNode) {
  return (
    <SpacesActiveProjectIdContext.Provider value={pid}>
      <DesignerSpaceIdContext.Provider value="space-1">{children}</DesignerSpaceIdContext.Provider>
    </SpacesActiveProjectIdContext.Provider>
  );
}

describe("useBrainNodeTelemetry (alias histórico useBrainTelemetry)", () => {
  beforeEach(() => {
    syncMock.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("track acumula SUGGESTION_SHOWN, SUGGESTION_ACCEPTED, MANUAL_OVERRIDE, ASSET_USED y CONTENT_EXPORTED", async () => {
    const { result } = renderHook(() => useBrainNodeTelemetry({ canvasNodeId: "node-99", nodeType: "DESIGNER" }), {
      wrapper: ({ children }) => wrapper("project-42", children),
    });
    const ts = new Date().toISOString();
    act(() => {
      result.current.track({ kind: "SUGGESTION_SHOWN", ts, suggestionId: "txt:w:1" });
      result.current.track({ kind: "SUGGESTION_ACCEPTED", ts, suggestionId: "txt:w:1" });
      result.current.track({ kind: "MANUAL_OVERRIDE", ts, fieldRef: "manual:body" });
      result.current.track({ kind: "ASSET_USED", ts, assetRef: "s3://x", source: "library" });
      result.current.track({
        kind: "CONTENT_EXPORTED",
        ts,
        exportFormat: "pdf",
        designer: { pageExported: true },
      });
    });
    await act(async () => {
      await result.current.flushTelemetry("export");
    });
    await waitFor(() => expect(syncMock).toHaveBeenCalledTimes(1));
    const firstCall = syncMock.mock.calls[0]?.[0];
    expect(firstCall).toBeDefined();
    const arg = firstCall as { batch: TelemetryBatch };
    const kinds = arg.batch.events.map((e) => e.kind);
    expect(kinds).toContain("SUGGESTION_SHOWN");
    expect(kinds).toContain("SUGGESTION_ACCEPTED");
    expect(kinds).toContain("MANUAL_OVERRIDE");
    expect(kinds).toContain("ASSET_USED");
    expect(kinds).toContain("CONTENT_EXPORTED");
  });

  it("no envía batch vacío", async () => {
    const { result } = renderHook(() => useBrainNodeTelemetry({ canvasNodeId: "node-empty", nodeType: "DESIGNER" }), {
      wrapper: ({ children }) => wrapper("project-42", children),
    });
    await act(async () => {
      await result.current.flushTelemetry("manual");
    });
    expect(syncMock).not.toHaveBeenCalled();
  });

  it("el batch incluye batchId, sessionId, nodeId, nodeType, projectId y createdAt", async () => {
    const { result } = renderHook(() => useBrainNodeTelemetry({ canvasNodeId: "node-x", nodeType: "PHOTOROOM" }), {
      wrapper: ({ children }) => wrapper("project-77", children),
    });
    act(() => {
      result.current.track({ kind: "IMAGE_EDITED", ts: new Date().toISOString() });
    });
    await act(async () => {
      await result.current.flushTelemetry("manual");
    });
    await waitFor(() => expect(syncMock).toHaveBeenCalled());
    const firstCall = syncMock.mock.calls[0]?.[0];
    expect(firstCall).toBeDefined();
    const { batch } = firstCall as { batch: TelemetryBatch };
    expect(batch.version).toBe(2);
    expect(batch.batchId && batch.batchId.length).toBeGreaterThan(4);
    expect(batch.sessionId.length).toBeGreaterThan(4);
    expect(batch.nodeId).toBe("node-x");
    expect(batch.nodeType).toBe("PHOTOROOM");
    expect(batch.projectId).toBe("project-77");
    expect(batch.createdAt).toBeTruthy();
    expect(batch.capturedAt).toBeTruthy();
  });

  it("PHOTOROOM: track no llama sync hasta flush export con IMAGE_EXPORTED y CONTENT_EXPORTED", async () => {
    const { result } = renderHook(() => useBrainNodeTelemetry({ canvasNodeId: "pr-1", nodeType: "PHOTOROOM" }), {
      wrapper: ({ children }) => wrapper("project-pr", children),
    });
    const ts = new Date().toISOString();
    act(() => {
      result.current.track({ kind: "IMAGE_EDITED", ts });
      result.current.track({ kind: "STYLE_APPLIED", ts, styleLabel: "blur" });
    });
    expect(syncMock).not.toHaveBeenCalled();
    act(() => {
      result.current.track({ kind: "IMAGE_EXPORTED", ts, exportFormat: "png" });
      result.current.track({ kind: "CONTENT_EXPORTED", ts, artifactType: "image" });
    });
    await act(async () => {
      await result.current.flushTelemetry("export");
    });
    await waitFor(() => expect(syncMock).toHaveBeenCalledTimes(1));
    const arg = syncMock.mock.calls[0]?.[0] as { batch: TelemetryBatch };
    expect(arg.batch.nodeType).toBe("PHOTOROOM");
    expect(arg.batch.flushReason).toBe("export");
    const kinds = arg.batch.events.map((e) => e.kind);
    expect(kinds).toContain("IMAGE_EDITED");
    expect(kinds).toContain("IMAGE_EXPORTED");
    expect(kinds).toContain("CONTENT_EXPORTED");
  });

  it("unmount envía un único batch cuando hay eventos pendientes", async () => {
    const { result, unmount } = renderHook(
      () => useBrainNodeTelemetry({ canvasNodeId: "node-u", nodeType: "DESIGNER" }),
      { wrapper: ({ children }) => wrapper("project-42", children) },
    );
    act(() => {
      result.current.track({ kind: "COLOR_USED", ts: new Date().toISOString(), colorHex: "#000000" });
    });
    syncMock.mockClear();
    unmount();
    await waitFor(() => expect(syncMock).toHaveBeenCalledTimes(1));
  });
});
