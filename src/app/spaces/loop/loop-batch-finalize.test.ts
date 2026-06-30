import { describe, expect, it } from "vitest";
import {
  collectLoopFailures,
  formatLoopRunErrorMessage,
  resolveLoopRunStatus,
} from "./loop-batch-finalize";
import { composeChannelEffectivePrompt } from "./loop-channel-prompt";
import { materializedRowsFromPipeline } from "./loop-pipeline-integration";
import type { RowResult } from "./pipeline/run-pipeline";

describe("loop-batch-finalize", () => {
  it("resolveLoopRunStatus distingue done, partial y error", () => {
    expect(resolveLoopRunStatus({ okCount: 10, failedCount: 0, totalRows: 10 })).toBe("done");
    expect(resolveLoopRunStatus({ okCount: 7, failedCount: 3, totalRows: 10 })).toBe("partial");
    expect(resolveLoopRunStatus({ okCount: 7, failedCount: 0, totalRows: 10, abortError: "Crash" })).toBe(
      "partial",
    );
    expect(resolveLoopRunStatus({ okCount: 0, failedCount: 3, totalRows: 10 })).toBe("error");
  });

  it("collectLoopFailures lista filas fallidas con índice", () => {
    const rows: RowResult[] = [
      { rowIndex: 0, status: "ok", intermediates: {}, final: { kind: "image", url: "a" } },
      { rowIndex: 1, status: "failed", intermediates: {}, error: "Timeout" },
    ];
    expect(collectLoopFailures(rows)).toEqual([{ rowIndex: 1, error: "Timeout" }]);
  });

  it("formatLoopRunErrorMessage describe fila y resultados guardados", () => {
    const msg = formatLoopRunErrorMessage({
      okCount: 7,
      failedCount: 1,
      totalRows: 10,
      failures: [{ rowIndex: 7, error: "API 503" }],
    });
    expect(msg).toContain("7 resultados guardados");
    expect(msg).toContain("fila 8");
    expect(msg).toContain("API 503");
  });

  it("materialización multi-canal: prompt compuesto vs fallback idéntico al nodo", () => {
    const identity = "Retrato de la misma persona, fondo neutro, luz suave";
    const pipelineRows: RowResult[] = [
      {
        rowIndex: 0,
        status: "ok",
        intermediates: {},
        finals: {
          imgA: { kind: "image", url: "https://a.png" },
          imgB: { kind: "image", url: "https://b.png" },
        },
      },
    ];
    const baseArgs = {
      rows: pipelineRows,
      dataset: {
        id: "ds",
        name: "T",
        scope: "local" as const,
        lists: [
          {
            id: "l1",
            name: "L",
            key: "l",
            schema: [],
            cards: [{ id: "c1", values: {} }],
          },
        ],
        constants: { fields: [], values: {} },
        createdAt: "",
        updatedAt: "",
        version: 1,
      },
      listId: "l1",
      bindings: {},
      activeImageRefs: [],
      fixedRefUrls: {},
      cardIdsByRow: ["c1"],
    };

    const composedA = materializedRowsFromPipeline({
      ...baseArgs,
      templatePrompt: composeChannelEffectivePrompt(identity, "de frente"),
      sinkId: "imgA",
    });
    const composedB = materializedRowsFromPipeline({
      ...baseArgs,
      templatePrompt: composeChannelEffectivePrompt(identity, "de perfil"),
      sinkId: "imgB",
    });
    const fallbackB = materializedRowsFromPipeline({
      ...baseArgs,
      templatePrompt: composeChannelEffectivePrompt(identity, ""),
      sinkId: "imgB",
    });

    expect(composedA[0]?.prompt).toBe(`${identity}, de frente`);
    expect(composedB[0]?.prompt).toBe(`${identity}, de perfil`);
    expect(composedA[0]?.prompt.startsWith(identity)).toBe(true);
    expect(composedB[0]?.prompt.startsWith(identity)).toBe(true);
    expect(fallbackB[0]?.prompt).toBe(identity);
  });
});
