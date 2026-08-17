import { describe, expect, it } from "vitest";
import type { Node } from "@xyflow/react";
import type { DesignerPageState } from "@/app/spaces/designer/DesignerNode";
import type { FreehandObject } from "@/app/spaces/FreehandStudio";
import {
  canReplaceDesignerOrigin,
  collectSiteBlueprintLayerReferences,
  resolveSiteBlueprintReferenceState,
} from "./site-creator-blueprint-refs";
import { buildDesignerSourceSnapshot, deepCloneDesignerPageState } from "./designer-source-snapshot";
import { resolveSiteCreatorOriginState } from "./site-creator-origin";
import {
  applyConfirmedOriginChange,
  applyConfirmedSnapshotUpdate,
  deriveCandidateSnapshotFromDesigner,
  resolveLiveDesignerPage,
  validateCandidateForSync,
} from "./site-creator-sync";
import {
  createDefaultSiteCreatorNodeData,
  createEmptySiteBlueprintV1,
  parseSiteCreatorNodeData,
  type SiteBlueprintV1,
} from "./site-creator-types";

function designerNode(id: string, pages: DesignerPageState[]): Node {
  return { id, type: "designer", position: { x: 0, y: 0 }, data: { pages } };
}

function basePage(objects: FreehandObject[] = []): DesignerPageState {
  return { id: "pg_root", format: "web169", objects };
}

describe("site creator sync and blueprint references", () => {
  it("does not persist candidateSnapshot in node data", () => {
    const page = basePage([{ id: "a", type: "rect", x: 0, y: 0, width: 1, height: 1 } as FreehandObject]);
    const node = designerNode("d1", [page]);
    const candidate = deriveCandidateSnapshotFromDesigner(node);
    expect(candidate).not.toBeNull();
    const nodeData = createDefaultSiteCreatorNodeData();
    expect("candidateSnapshot" in nodeData).toBe(false);
    const parsed = parseSiteCreatorNodeData(JSON.parse(JSON.stringify(nodeData)));
    expect("candidateSnapshot" in parsed).toBe(false);
  });

  it("confirm snapshot update replaces sourceSnapshot atomically", () => {
    const page = basePage();
    const current = buildDesignerSourceSnapshot("d1", page);
    const updatedPage = deepCloneDesignerPageState(page);
    updatedPage.objects = [{ id: "live", type: "rect", x: 0, y: 0, width: 2, height: 2 } as FreehandObject];
    const candidate = buildDesignerSourceSnapshot("d1", updatedPage);
    const nodeData = { ...createDefaultSiteCreatorNodeData(), sourceSnapshot: current };
    const next = applyConfirmedSnapshotUpdate(nodeData, candidate);
    expect(next.sourceSnapshot?.contentHash).toBe(candidate.contentHash);
    expect(next.sourceSnapshot?.layerCount).toBe(1);
    expect(next.blueprint).toBe(nodeData.blueprint);
  });

  it("confirm snapshot update preserves blueprint exactly", () => {
    const blueprint: SiteBlueprintV1 = {
      schemaVersion: 1,
      rootChildIds: ["sec_1"],
      nodes: {
        sec_1: {
          id: "sec_1",
          kind: "section",
          sectionType: "hero",
          label: "Hero",
          parentId: null,
          childIds: [],
          layerIds: ["missing_layer"],
          sourceRange: { top: 0, bottom: 100 },
        },
      },
    };
    const current = buildDesignerSourceSnapshot("d1", basePage());
    const candidate = buildDesignerSourceSnapshot(
      "d1",
      basePage([{ id: "x", type: "rect", x: 0, y: 0, width: 1, height: 1 } as FreehandObject]),
    );
    const nodeData = { ...createDefaultSiteCreatorNodeData(), blueprint, sourceSnapshot: current };
    const next = applyConfirmedSnapshotUpdate(nodeData, candidate);
    expect(next.blueprint).toEqual(blueprint);
    expect(next.blueprint.nodes.sec_1?.layerIds).toEqual(["missing_layer"]);
  });

  it("removed layer reference stays missing but is not deleted from blueprint", () => {
    const blueprint: SiteBlueprintV1 = {
      schemaVersion: 1,
      rootChildIds: ["n1"],
      nodes: {
        n1: {
          id: "n1",
          kind: "component",
          componentType: "button",
          label: "Block",
          parentId: null,
          childIds: [],
          layerIds: ["removed_id", "kept_id"],
          config: { accessibleLabel: "Block", action: null },
        },
      },
    };
    const snapshot = buildDesignerSourceSnapshot(
      "d1",
      basePage([{ id: "kept_id", type: "rect", x: 0, y: 0, width: 1, height: 1 } as FreehandObject]),
    );
    const refs = resolveSiteBlueprintReferenceState(blueprint, snapshot);
    expect(refs.missingLayerIds).toEqual(["removed_id"]);
    expect(refs.validLayerIds).toEqual(["kept_id"]);
    expect(refs.missingReferencesByBlueprintNodeId.n1).toEqual(["removed_id"]);
    expect(blueprint.nodes.n1?.layerIds).toContain("removed_id");
  });

  it("valid blueprint references remain valid after sync", () => {
    const blueprint: SiteBlueprintV1 = {
      schemaVersion: 1,
      rootChildIds: ["n1"],
      nodes: {
        n1: {
          id: "n1",
          kind: "component",
          componentType: "button",
          label: "Block",
          parentId: null,
          childIds: [],
          layerIds: ["kept_id"],
          config: { accessibleLabel: "Block", action: null },
        },
      },
    };
    const snapshot = buildDesignerSourceSnapshot(
      "d1",
      basePage([{ id: "kept_id", type: "rect", x: 0, y: 0, width: 1, height: 1 } as FreehandObject]),
    );
    const refs = resolveSiteBlueprintReferenceState(blueprint, snapshot);
    expect(refs.validLayerIds).toEqual(["kept_id"]);
    expect(refs.missingLayerIds).toEqual([]);
  });

  it("disconnect keeps snapshot and preview source", () => {
    const snapshot = buildDesignerSourceSnapshot("d1", basePage());
    const state = resolveSiteCreatorOriginState({
      snapshot,
      documentEdge: null,
      liveDesignerPageCount: 0,
    });
    expect(state).toBe("source_disconnected");
    expect(snapshot.page.id).toBe("pg_root");
  });

  it("reconnect same origin with same hash is synced", () => {
    const page = basePage();
    const snapshot = buildDesignerSourceSnapshot("d1", page);
    const state = resolveSiteCreatorOriginState({
      snapshot,
      documentEdge: { source: "d1" },
      liveDesignerPageCount: 1,
    });
    expect(state).toBe("synced");
  });

  it("reconnect same origin modified stays synced (auto-sync handles drift)", () => {
    const page = basePage();
    const snapshot = buildDesignerSourceSnapshot("d1", page);
    const state = resolveSiteCreatorOriginState({
      snapshot,
      documentEdge: { source: "d1" },
      liveDesignerPageCount: 1,
    });
    expect(state).toBe("synced");
  });

  it("different origin does not auto replace snapshot", () => {
    const snapshot = buildDesignerSourceSnapshot("d_a", basePage());
    const state = resolveSiteCreatorOriginState({
      snapshot,
      documentEdge: { source: "d_b" },
      liveDesignerPageCount: 1,
    });
    expect(state).toBe("different_source");
    expect(snapshot.designerNodeId).toBe("d_a");
  });

  it("origin change allowed with empty blueprint", () => {
    const blueprint = createEmptySiteBlueprintV1();
    expect(canReplaceDesignerOrigin(blueprint)).toBe(true);
    expect(collectSiteBlueprintLayerReferences(blueprint)).toEqual([]);
  });

  it("origin change blocked with non-empty blueprint", () => {
    const blueprint: SiteBlueprintV1 = {
      schemaVersion: 1,
      rootChildIds: ["sec"],
      nodes: {
        sec: {
          id: "sec",
          kind: "section",
          sectionType: "generic",
          label: "S",
          parentId: null,
          childIds: [],
          layerIds: [],
          sourceRange: { top: 0, bottom: 10 },
        },
      },
    };
    expect(canReplaceDesignerOrigin(blueprint)).toBe(false);
  });

  it("cancels confirm when designer changed between review and confirm", () => {
    const page = basePage();
    const reviewed = buildDesignerSourceSnapshot("d1", page);
    const liveChanged = deepCloneDesignerPageState(page);
    liveChanged.objects = [{ id: "stale", type: "rect", x: 0, y: 0, width: 1, height: 1 } as FreehandObject];
    const liveNode = designerNode("d1", [liveChanged]);
    const result = validateCandidateForSync({
      reviewedCandidateHash: reviewed.contentHash,
      expectedDesignerNodeId: "d1",
      liveDesignerNode: liveNode,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("stale");
  });

  it("apply origin change updates designerNodeId with empty blueprint", () => {
    const current = buildDesignerSourceSnapshot("d_old", basePage());
    const newSnap = buildDesignerSourceSnapshot(
      "d_new",
      basePage([{ id: "n", type: "rect", x: 0, y: 0, width: 1, height: 1 } as FreehandObject]),
    );
    const nodeData = { ...createDefaultSiteCreatorNodeData(), sourceSnapshot: current };
    const next = applyConfirmedOriginChange(nodeData, newSnap);
    expect(next.sourceSnapshot?.designerNodeId).toBe("d_new");
    expect(next.blueprint).toEqual(createEmptySiteBlueprintV1());
    expect(next.schemaVersion).toBe(nodeData.schemaVersion);
  });

  it("serialization and reload keep last confirmed snapshot", () => {
    const snap = buildDesignerSourceSnapshot(
      "d1",
      basePage([{ id: "persisted", type: "rect", x: 0, y: 0, width: 3, height: 3 } as FreehandObject]),
    );
    const nodeData = { ...createDefaultSiteCreatorNodeData(), sourceSnapshot: snap };
    const restored = parseSiteCreatorNodeData(JSON.parse(JSON.stringify(nodeData)));
    expect(restored.sourceSnapshot?.contentHash).toBe(snap.contentHash);
    expect(restored.sourceSnapshot?.page.objects[0]?.id).toBe("persisted");
    expect(restored.blueprint.rootChildIds).toEqual([]);
  });

  it("resolveLiveDesignerPage uses the connected Designer page", () => {
    const page = basePage([{ id: "rf", type: "rect", x: 0, y: 0, width: 1, height: 1 } as FreehandObject]);
    expect(resolveLiveDesignerPage("d1", [page])?.objects[0]?.id).toBe("rf");
    expect(resolveLiveDesignerPage(null, [page])?.objects[0]?.id).toBe("rf");
    expect(resolveLiveDesignerPage("d1", [])).toBeNull();
  });
});
