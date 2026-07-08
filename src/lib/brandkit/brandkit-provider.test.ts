import { describe, expect, it } from "vitest";
import { defaultProjectAssets, normalizeProjectAssets } from "@/app/spaces/project-assets-metadata";
import {
  applySynthesisToSidecar,
  createValidatedMeta,
  emptyBrandKitBoardMeta,
  getMeta,
  patchMeta,
} from "./interpretation";
import {
  formatConflictCandidate,
  resolveElementConflictOnAssets,
  validateElementOnBoardMeta,
} from "./brandkit-board-actions";
import { LEGACY_BRANDKIT_RUNTIME_FIXTURE } from "./fixtures/legacy-brandkit-assets.fixture";
import { buildPipelineTransitionEvents, derivePipelinePhase } from "./brandkit-pipeline-bridge";

describe("brandkit-board-actions", () => {
  it("validateElementOnBoardMeta marca validated", () => {
    let meta = applySynthesisToSidecar(emptyBrandKitBoardMeta(), "A", {
      key: "messages.tagline",
      nextValue: "B",
      evidence: [],
    });
    meta = validateElementOnBoardMeta(meta, "messages.tagline");
    expect(getMeta(meta, "messages.tagline").status).toBe("validated");
  });

  it("resolveElementConflictOnAssets escribe raw y valida sidecar", () => {
    let boardMeta = patchMeta(emptyBrandKitBoardMeta(), "messages.tagline", createValidatedMeta());
    boardMeta = applySynthesisToSidecar(boardMeta, "Original", {
      key: "messages.tagline",
      nextValue: "Nuevo",
      evidence: [],
    });
    const assets = normalizeProjectAssets({
      ...LEGACY_BRANDKIT_RUNTIME_FIXTURE,
      brainMeta: { ...LEGACY_BRANDKIT_RUNTIME_FIXTURE.brainMeta, boardMeta },
    });
    const resolved = resolveElementConflictOnAssets(assets, "messages.tagline", "Nuevo");
    expect(resolved.assets.knowledge.corporateContext).toContain("Nuevo");
    expect(getMeta(resolved.boardMeta, "messages.tagline").status).toBe("validated");
  });

  it("formatConflictCandidate resume strings", () => {
    expect(formatConflictCandidate("Hola")).toBe("Hola");
    expect(formatConflictCandidate(["a", "b"])).toBe("a, b");
  });
});

describe("brandkit-pipeline-bridge", () => {
  it("derivePipelinePhase detecta analyzing", () => {
    expect(
      derivePipelinePhase({ busy: true, detail: "Analizando conocimiento con IA…", queued: 0 }),
    ).toBe("analyzing");
  });

  it("buildPipelineTransitionEvents emite started y completed", () => {
    const started = buildPipelineTransitionEvents({
      previousPhase: "idle",
      nextPhase: "analyzing",
      runId: "run-1",
      detail: "Analizando documentos pdf",
      boardMeta: emptyBrandKitBoardMeta(),
    });
    expect(started.some((e) => e.type === "run.started")).toBe(true);

    const completed = buildPipelineTransitionEvents({
      previousPhase: "analyzing",
      nextPhase: "idle",
      runId: "run-1",
      detail: "",
      boardMeta: emptyBrandKitBoardMeta(),
    });
    expect(completed.some((e) => e.type === "run.completed")).toBe(true);
  });
});
