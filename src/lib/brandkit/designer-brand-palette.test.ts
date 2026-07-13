import { describe, expect, it } from "vitest";
import { createEmptyBrandKit } from "./brand-kit-defaults";
import { extractDesignerPaletteColors } from "./designer-brand-palette";
import type { PaletteValue } from "./brand-kit-types";
import {
  findBrandKitBrainEdge,
  pickDesignerBrandKitConnection,
  resolveDesignerBrandKitFromSourceNode,
  resolveDesignerFlowNodeId,
} from "@/app/spaces/designer/use-designer-brandkit-connection";

describe("extractDesignerPaletteColors", () => {
  it("returns empty when palette has no colors", () => {
    expect(extractDesignerPaletteColors(createEmptyBrandKit())).toEqual([]);
  });

  it("returns unique hex colors up to 12", () => {
    const doc = createEmptyBrandKit();
    const colors: PaletteValue["colors"] = [
      { hex: "#112233", role: "primary" },
      { hex: "#112233", role: "secondary" },
      { hex: "#AABBCC", role: "accent" },
      { hex: "#DDEEFF", role: "background" },
    ];
    doc.slots.palette = {
      ...doc.slots.palette,
      status: "resolved",
      value: { colors },
      updatedAt: new Date().toISOString(),
    };
    expect(extractDesignerPaletteColors(doc)).toEqual(["#112233", "#AABBCC", "#DDEEFF"]);
  });

  it("normalizes hex without hash, rgb() and strips alpha channel", () => {
    const doc = createEmptyBrandKit();
    doc.slots.palette = {
      ...doc.slots.palette,
      status: "resolved",
      locked: true,
      value: {
        colors: [
          { hex: "FFBD1B", role: "primary" },
          { hex: "#1A1B1EFF", role: "secondary" },
          { hex: "rgb(170, 187, 204)", role: "accent" },
        ],
      },
      updatedAt: doc.updatedAt,
    };
    expect(extractDesignerPaletteColors(doc)).toEqual(["#FFBD1B", "#1A1B1E", "#AABBCC"]);
  });

  it("reads locked palette from best candidate when value is missing", () => {
    const doc = createEmptyBrandKit();
    doc.slots.palette = {
      ...doc.slots.palette,
      status: "candidates",
      locked: true,
      value: undefined,
      candidates: [
        {
          value: {
            colors: [
              { hex: "#111111", role: "primary" },
              { hex: "#222222", role: "secondary" },
            ],
          },
          score: 0.4,
          provenance: { type: "css_var", detail: "alt" },
        },
        {
          value: {
            colors: [
              { hex: "#AA0000", role: "primary" },
              { hex: "#00AA00", role: "accent" },
              { hex: "#0000AA", role: "secondary" },
            ],
          },
          score: 0.9,
          provenance: { type: "css_var", detail: "best" },
        },
      ],
      updatedAt: doc.updatedAt,
    };
    expect(extractDesignerPaletteColors(doc)).toEqual(["#AA0000", "#00AA00", "#0000AA"]);
  });

  it("falls back to compiled palette tokens", () => {
    const doc = createEmptyBrandKit();
    doc.compiled = {
      stylePrompt: "",
      negativePrompt: "",
      paletteTokens: {
        schema: "foldder.brand-tokens.v1",
        colors: [
          { hex: "#123456", role: "primary" },
          { hex: "#654321", role: "accent" },
        ],
      },
      fontStack: { families: [] },
      copyRules: [],
      logoPackManifest: {},
    };
    expect(extractDesignerPaletteColors(doc)).toEqual(["#123456", "#654321"]);
  });
});

describe("resolveDesignerBrandKitFromSourceNode", () => {
  it("extracts palette colors from a brandKit node payload", () => {
    const doc = createEmptyBrandKit();
    doc.slots.palette = {
      ...doc.slots.palette,
      status: "resolved",
      locked: true,
      value: {
        colors: [
          { hex: "#101010", role: "primary" },
          { hex: "#202020", role: "secondary" },
          { hex: "#303030", role: "accent" },
          { hex: "#404040", role: "background" },
          { hex: "#505050", role: "text" },
          { hex: "#606060", role: "neutral" },
        ],
      },
      updatedAt: doc.updatedAt,
    };

    const connection = resolveDesignerBrandKitFromSourceNode({
      id: "brand-1",
      type: "brandKit",
      data: { brandKit: doc },
    });

    expect(connection.brainConnected).toBe(true);
    expect(connection.brandKitMissing).toBe(false);
    expect(connection.brandKitNodeId).toBe("brand-1");
    expect(connection.paletteColors).toHaveLength(6);
  });

  it("parses brandKit JSON persisted as string", () => {
    const doc = createEmptyBrandKit();
    doc.slots.palette = {
      ...doc.slots.palette,
      status: "resolved",
      value: { colors: [{ hex: "#ABCDEF", role: "primary" }] },
      updatedAt: doc.updatedAt,
    };

    const connection = resolveDesignerBrandKitFromSourceNode({
      id: "brand-2",
      type: "brandKit",
      data: { brandKit: JSON.stringify(doc) },
    });

    expect(connection.paletteColors).toEqual(["#ABCDEF"]);
  });
});

describe("pickDesignerBrandKitConnection", () => {
  it("returns disconnected when there is no brain edge", () => {
    expect(
      pickDesignerBrandKitConnection([], {
        id: "brand-1",
        type: "brandKit",
        data: {},
      }),
    ).toEqual({
      brainConnected: false,
      brandKitMissing: false,
      brandKitNodeId: null,
      paletteColors: [],
    });
  });
});

describe("resolveDesignerFlowNodeId", () => {
  it("strips the Freehand studio key prefix", () => {
    expect(resolveDesignerFlowNodeId("designer-fh-node-abc")).toBe("node-abc");
    expect(resolveDesignerFlowNodeId("node-abc")).toBe("node-abc");
  });
});

describe("findBrandKitBrainEdge", () => {
  it("finds brand edge via nodes fallback when nodeLookup is empty", () => {
    const doc = createEmptyBrandKit();
    doc.slots.palette = {
      ...doc.slots.palette,
      status: "resolved",
      locked: true,
      value: {
        colors: [{ hex: "#101010", role: "primary" }],
      },
      updatedAt: doc.updatedAt,
    };

    const state = {
      nodes: [
        { id: "designer-1", type: "designer", position: { x: 0, y: 0 }, data: {} },
        { id: "brand-1", type: "brandKit", position: { x: 0, y: 0 }, data: { brandKit: doc } },
      ],
      edges: [
        {
          id: "edge-1",
          source: "brand-1",
          target: "designer-1",
          sourceHandle: "brand",
          targetHandle: "brain",
        },
      ],
      nodeLookup: new Map(),
    } as import("@xyflow/react").ReactFlowState<import("@xyflow/react").Node, import("@xyflow/react").Edge>;

    const edge = findBrandKitBrainEdge(state, "designer-1");
    expect(edge?.id).toBe("edge-1");
  });
});
