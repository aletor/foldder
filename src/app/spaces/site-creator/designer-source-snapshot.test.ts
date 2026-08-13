import { describe, expect, it } from "vitest";
import type { Node } from "@xyflow/react";
import type { DesignerPageState } from "@/app/spaces/designer/DesignerNode";
import type { FreehandObject } from "@/app/spaces/FreehandStudio";
import {
  computeDesignerPageContentHash,
  designerPageHashPayload,
  stableStringify,
} from "./designer-source-hash";
import {
  collectSnapshotLayerIds,
  countSnapshotLayers,
  resolveSnapshotLayerById,
} from "./designer-source-layers";
import {
  buildDesignerSourceSnapshot,
  captureSnapshotFromDesignerNode,
  deepCloneDesignerPageState,
} from "./designer-source-snapshot";
import { resolveSiteCreatorOriginState } from "./site-creator-origin";
import {
  createDefaultSiteCreatorNodeData,
  createEmptySiteBlueprintV1,
  parseSiteCreatorNodeData,
} from "./site-creator-types";

function designerNode(id: string, pages: DesignerPageState[]): Node {
  return { id, type: "designer", position: { x: 0, y: 0 }, data: { pages } };
}

function basePage(objects: FreehandObject[] = []): DesignerPageState {
  return {
    id: "pg_root",
    format: "web169",
    objects,
  };
}

describe("designer source snapshot capture", () => {
  it("captures a single-page designer", () => {
    const page = basePage([
      { id: "fh_rect", type: "rect", x: 0, y: 0, width: 100, height: 40 } as FreehandObject,
    ]);
    const snap = captureSnapshotFromDesignerNode(designerNode("d1", [page]));
    expect(snap).not.toBeNull();
    expect(snap!.designerNodeId).toBe("d1");
    expect(snap!.sourcePageId).toBe("pg_root");
    expect(snap!.layerCount).toBe(1);
  });

  it("deep-clones without mutating the original document", () => {
    const page = basePage([
      {
        id: "fh_text",
        type: "text",
        x: 10,
        y: 10,
        width: 80,
        height: 24,
        text: "Hola",
      } as FreehandObject,
    ]);
    const original = designerNode("d1", [page]);
    const snap = captureSnapshotFromDesignerNode(original)!;
    snap.page.objects[0] = { ...snap.page.objects[0]!, x: 999 } as FreehandObject;
    expect((original.data as { pages: DesignerPageState[] }).pages[0]!.objects[0]!.x).toBe(10);
  });

  it("preserves root and nested IDs", () => {
    const nested: FreehandObject = {
      id: "folder_a",
      type: "groupContainer",
      x: 0,
      y: 0,
      width: 200,
      height: 200,
      children: [
        {
          id: "fh_child",
          type: "ellipse",
          x: 5,
          y: 5,
          width: 20,
          height: 20,
        } as FreehandObject,
      ],
    } as FreehandObject;
    const clip: FreehandObject = {
      id: "clip_1",
      type: "clippingContainer",
      x: 0,
      y: 0,
      width: 50,
      height: 50,
      mask: { id: "mask_1", type: "rect", x: 0, y: 0, width: 50, height: 50 } as FreehandObject,
      content: [{ id: "clip_child", type: "rect", x: 1, y: 1, width: 10, height: 10 } as FreehandObject],
    } as FreehandObject;
    const snap = buildDesignerSourceSnapshot("d1", basePage([nested, clip]));
    expect(snap.page.objects.map((o) => o.id)).toEqual(["folder_a", "clip_1"]);
    expect(resolveSnapshotLayerById(snap.page, "fh_child")?.id).toBe("fh_child");
    expect(resolveSnapshotLayerById(snap.page, "mask_1")?.id).toBe("mask_1");
    expect(resolveSnapshotLayerById(snap.page, "clip_child")?.id).toBe("clip_child");
  });

  it("rejects multi-page designers", () => {
    const snap = captureSnapshotFromDesignerNode(
      designerNode("d1", [basePage(), { ...basePage(), id: "pg_2" }]),
    );
    expect(snap).toBeNull();
  });
});

describe("designer source layers", () => {
  it("counts layers recursively without duplicate IDs", () => {
    const page = basePage([
      {
        id: "root_folder",
        type: "groupContainer",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        children: [
          { id: "leaf_a", type: "rect", x: 0, y: 0, width: 10, height: 10 } as FreehandObject,
          { id: "leaf_b", type: "rect", x: 1, y: 1, width: 10, height: 10 } as FreehandObject,
        ],
      } as FreehandObject,
      { id: "root_rect", type: "rect", x: 0, y: 0, width: 10, height: 10 } as FreehandObject,
    ]);
    expect(countSnapshotLayers(page)).toBe(4);
    expect(collectSnapshotLayerIds(page.objects)).toEqual([
      "root_folder",
      "leaf_a",
      "leaf_b",
      "root_rect",
    ]);
  });

  it("resolves nested layer by ID", () => {
    const page = basePage([
      {
        id: "folder",
        type: "groupContainer",
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        children: [{ id: "inner", type: "text", x: 0, y: 0, width: 5, height: 5, text: "x" } as FreehandObject],
      } as FreehandObject,
    ]);
    const layer = resolveSnapshotLayerById(page, "inner");
    expect(layer?.type).toBe("text");
  });
});

describe("designer source hash", () => {
  it("produces identical hash for identical content", () => {
    const page = basePage([{ id: "a", type: "rect", x: 1, y: 2, width: 3, height: 4 } as FreehandObject]);
    const h1 = computeDesignerPageContentHash(page);
    const h2 = computeDesignerPageContentHash(deepCloneDesignerPageState(page));
    expect(h1).toBe(h2);
  });

  it("changes hash when text, geometry, style or structure changes", () => {
    const base = basePage([
      { id: "a", type: "text", x: 0, y: 0, width: 10, height: 10, text: "A" } as FreehandObject,
    ]);
    const h0 = computeDesignerPageContentHash(base);

    const textChanged = deepCloneDesignerPageState(base);
    (textChanged.objects[0] as { text: string }).text = "B";
    expect(computeDesignerPageContentHash(textChanged)).not.toBe(h0);

    const geometryChanged = deepCloneDesignerPageState(base);
    geometryChanged.objects[0]!.x = 40;
    expect(computeDesignerPageContentHash(geometryChanged)).not.toBe(h0);

    const styleChanged = deepCloneDesignerPageState(base);
    (styleChanged.objects[0] as { opacity: number }).opacity = 0.5;
    expect(computeDesignerPageContentHash(styleChanged)).not.toBe(h0);

    const structureChanged = deepCloneDesignerPageState(base);
    structureChanged.objects.push({
      id: "new_rect",
      type: "rect",
      x: 0,
      y: 0,
      width: 5,
      height: 5,
    } as FreehandObject);
    expect(computeDesignerPageContentHash(structureChanged)).not.toBe(h0);
  });

  it("uses stable canonical JSON", () => {
    const payload = designerPageHashPayload(basePage());
    const a = stableStringify({ b: 1, a: 2 });
    const b = stableStringify({ a: 2, b: 1 });
    expect(a).toBe(b);
    expect(stableStringify(payload)).toContain('"format"');
  });

  it("hashes large data URLs without embedding raw base64 in canonical JSON", () => {
    const hugeDataUrl = `data:image/png;base64,${"A".repeat(500_000)}`;
    const page = basePage([
      {
        id: "img",
        type: "image",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        src: hugeDataUrl,
      } as FreehandObject,
    ]);
    const payload = designerPageHashPayload(page);
    const canonical = stableStringify(payload);
    expect(canonical.length).toBeLessThan(10_000);
    expect(canonical).not.toContain("AAAA");
    const h1 = computeDesignerPageContentHash(page);
    const changed = basePage([
      {
        id: "img",
        type: "image",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        src: `${hugeDataUrl}B`,
      } as FreehandObject,
    ]);
    expect(computeDesignerPageContentHash(changed)).not.toBe(h1);
  });
});

describe("snapshot persistence and blueprint integrity", () => {
  it("serializes and restores the full snapshot", () => {
    const snap = buildDesignerSourceSnapshot("d1", basePage());
    const nodeData = {
      ...createDefaultSiteCreatorNodeData(),
      sourceSnapshot: snap,
    };
    const restored = parseSiteCreatorNodeData(JSON.parse(JSON.stringify(nodeData)));
    expect(restored.sourceSnapshot?.contentHash).toBe(snap.contentHash);
    expect(restored.sourceSnapshot?.page.id).toBe("pg_root");
  });

  it("does not overwrite an existing snapshot on re-capture", () => {
    const page = basePage();
    const first = buildDesignerSourceSnapshot("d1", page);
    const second = buildDesignerSourceSnapshot("d1", {
      ...page,
      objects: [{ id: "new", type: "rect", x: 0, y: 0, width: 1, height: 1 } as FreehandObject],
    });
    const persisted = first;
    expect(persisted.contentHash).not.toBe(second.contentHash);
    expect(persisted.page.objects).toHaveLength(0);
  });

  it("leaves blueprint untouched during capture", () => {
    const blueprint = createEmptySiteBlueprintV1();
    const nodeData = {
      ...createDefaultSiteCreatorNodeData(),
      blueprint,
      sourceSnapshot: buildDesignerSourceSnapshot("d1", basePage()),
    };
    expect(nodeData.blueprint).toEqual(createEmptySiteBlueprintV1());
    expect(nodeData.blueprint.rootChildIds).toEqual([]);
  });
});

describe("site creator origin states", () => {
  const snapshot = buildDesignerSourceSnapshot("d1", basePage());

  it("detects update available when live hash differs", () => {
    const livePage = {
      ...basePage(),
      objects: [{ id: "live", type: "rect", x: 0, y: 0, width: 1, height: 1 } as FreehandObject],
    };
    const state = resolveSiteCreatorOriginState({
      snapshot,
      documentEdge: { source: "d1" },
      liveDesignerPageCount: 1,
      livePageContentHash: computeDesignerPageContentHash(livePage),
    });
    expect(state).toBe("update_available");
  });

  it("keeps preview source when origin is disconnected", () => {
    const state = resolveSiteCreatorOriginState({
      snapshot,
      documentEdge: null,
      liveDesignerPageCount: 0,
      livePageContentHash: null,
    });
    expect(state).toBe("source_disconnected");
    expect(snapshot.page.id).toBe("pg_root");
  });

  it("detects different source designer", () => {
    const state = resolveSiteCreatorOriginState({
      snapshot,
      documentEdge: { source: "d_other" },
      liveDesignerPageCount: 1,
      livePageContentHash: computeDesignerPageContentHash(basePage()),
    });
    expect(state).toBe("different_source");
  });

  it("marks incompatible multi-page documents", () => {
    const state = resolveSiteCreatorOriginState({
      snapshot: undefined,
      documentEdge: { source: "d1" },
      liveDesignerPageCount: 2,
      livePageContentHash: null,
    });
    expect(state).toBe("incompatible_document");
  });

  it("marks synced when hash matches", () => {
    const page = basePage();
    const snap = buildDesignerSourceSnapshot("d1", page);
    const state = resolveSiteCreatorOriginState({
      snapshot: snap,
      documentEdge: { source: "d1" },
      liveDesignerPageCount: 1,
      livePageContentHash: computeDesignerPageContentHash(deepCloneDesignerPageState(page)),
    });
    expect(state).toBe("synced");
  });
});
