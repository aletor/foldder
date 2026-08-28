import { describe, expect, it } from "vitest";
import type { Edge, Node } from "@xyflow/react";
import { areNodesConnectable } from "@/app/spaces/connection-utils";
import { NODE_REGISTRY } from "@/app/spaces/nodeRegistry";
import {
  createDefaultSiteCreatorNodeData,
  createEmptySiteBlueprintV1,
  isValidSiteBlueprintV1,
  parseSiteCreatorNodeData,
} from "./site-creator-types";

function node(id: string, type: string, data: Record<string, unknown> = {}): Node {
  return { id, type, position: { x: 0, y: 0 }, data };
}

function siteCreatorNode(id: string): Node {
  return node(id, "siteCreator", createDefaultSiteCreatorNodeData() as unknown as Record<string, unknown>);
}

function designerWithPages(pages: unknown[]): Node {
  return node("d1", "designer", { label: "Landing", pages });
}

describe("site creator connections", () => {
  it("accepts designer document → site creator document with one page", () => {
    const designer = designerWithPages([{ id: "pg1", format: "web169", objects: [] }]);
    const siteCreator = siteCreatorNode("sc1");
    expect(
      areNodesConnectable(designer, siteCreator, {
        sourceHandle: "document",
        targetHandle: "document",
      }),
    ).toBe(true);
  });

  it("rejects multi-page designer", () => {
    const designer = designerWithPages([
      { id: "pg1", format: "web169", objects: [] },
      { id: "pg2", format: "web169", objects: [] },
    ]);
    const siteCreator = siteCreatorNode("sc1");
    expect(
      areNodesConnectable(designer, siteCreator, {
        sourceHandle: "document",
        targetHandle: "document",
      }),
    ).toBe(false);
  });

  it("rejects another node with json output", () => {
    const notes = node("n1", "notes", { label: "Note" });
    const siteCreator = siteCreatorNode("sc1");
    expect(
      areNodesConnectable(notes, siteCreator, {
        sourceHandle: "document",
        targetHandle: "document",
      }),
    ).toBe(false);
  });

  it("rejects another designer handle", () => {
    const designer = designerWithPages([{ id: "pg1", format: "web169", objects: [] }]);
    const siteCreator = siteCreatorNode("sc1");
    expect(
      areNodesConnectable(designer, siteCreator, {
        sourceHandle: "media_list",
        targetHandle: "document",
      }),
    ).toBe(false);
  });

  it("rejects a second source connection", () => {
    const designerA = node("d1", "designer", {
      pages: [{ id: "pg1", format: "web169", objects: [] }],
    });
    const designerB = node("d2", "designer", {
      pages: [{ id: "pg2", format: "web169", objects: [] }],
    });
    const siteCreator = siteCreatorNode("sc1");
    const edges: Edge[] = [
      {
        id: "e1",
        source: "d1",
        target: "sc1",
        sourceHandle: "document",
        targetHandle: "document",
      },
    ];
    expect(
      areNodesConnectable(
        designerB,
        siteCreator,
        { sourceHandle: "document", targetHandle: "document" },
        [designerA, designerB, siteCreator],
        { edges },
      ),
    ).toBe(false);
  });
});

describe("site creator blueprint", () => {
  it("accepts an empty blueprint with schemaVersion 1", () => {
    const blueprint = createEmptySiteBlueprintV1();
    expect(isValidSiteBlueprintV1(blueprint)).toBe(true);
    expect(blueprint.schemaVersion).toBe(1);
    expect(blueprint.rootChildIds).toEqual([]);
    expect(blueprint.nodes).toEqual({});
  });

  it("survives serialization and reload", () => {
    const original = createDefaultSiteCreatorNodeData();
    const roundTrip = parseSiteCreatorNodeData(JSON.parse(JSON.stringify(original)));
    expect(roundTrip.schemaVersion).toBe(1);
    expect(roundTrip.blueprint).toEqual(createEmptySiteBlueprintV1());
    expect(roundTrip.label).toBe("Site Creator");
  });
});

describe("site_template handle type", () => {
  it("is registered on site creator output", () => {
    const meta = NODE_REGISTRY.siteCreator;
    expect(meta).toBeDefined();
    const templateOutput = meta.outputs.find((output) => output.id === "template");
    expect(templateOutput?.type).toBe("site_template");
  });

  it("rejects site template → populate or loop", () => {
    const siteCreator = siteCreatorNode("sc1");
    const populate = node("p1", "populate");
    const loop = node("l1", "loop");
    expect(
      areNodesConnectable(siteCreator, populate, {
        sourceHandle: "template",
        targetHandle: "template",
      }),
    ).toBe(false);
    expect(
      areNodesConnectable(siteCreator, loop, {
        sourceHandle: "template",
        targetHandle: "template",
      }),
    ).toBe(false);
  });
});

describe("site creator dataset handle", () => {
  function datasetNode(id: string): Node {
    return node(id, "dataset", { label: "Catálogo" });
  }

  it("accepts dataset → site creator dataset", () => {
    const dataset = datasetNode("ds1");
    const siteCreator = siteCreatorNode("sc1");
    expect(
      areNodesConnectable(dataset, siteCreator, {
        sourceHandle: "dataset",
        targetHandle: "dataset",
      }),
    ).toBe(true);
  });

  it("still accepts designer document while a dataset is connected", () => {
    const designer = designerWithPages([{ id: "pg1", format: "web169", objects: [] }]);
    const dataset = datasetNode("ds1");
    const siteCreator = siteCreatorNode("sc1");
    const edges: Edge[] = [
      {
        id: "e-ds",
        source: "ds1",
        target: "sc1",
        sourceHandle: "dataset",
        targetHandle: "dataset",
      },
    ];
    expect(
      areNodesConnectable(
        designer,
        siteCreator,
        { sourceHandle: "document", targetHandle: "document" },
        [designer, dataset, siteCreator],
        { edges },
      ),
    ).toBe(true);
  });

  it("rejects a second dataset", () => {
    const datasetA = datasetNode("ds1");
    const datasetB = datasetNode("ds2");
    const siteCreator = siteCreatorNode("sc1");
    const edges: Edge[] = [
      {
        id: "e1",
        source: "ds1",
        target: "sc1",
        sourceHandle: "dataset",
        targetHandle: "dataset",
      },
    ];
    expect(
      areNodesConnectable(
        datasetB,
        siteCreator,
        { sourceHandle: "dataset", targetHandle: "dataset" },
        [datasetA, datasetB, siteCreator],
        { edges },
      ),
    ).toBe(false);
  });

  it("rejects dataset on the document handle", () => {
    const dataset = datasetNode("ds1");
    const siteCreator = siteCreatorNode("sc1");
    expect(
      areNodesConnectable(dataset, siteCreator, {
        sourceHandle: "dataset",
        targetHandle: "document",
      }),
    ).toBe(false);
  });
});
