import { describe, expect, it } from "vitest";
import {
  buildGeneratedSubgraph,
  buildMediaListOutput,
  buildRowSubgraph,
  isGeneratedNodeIdFor,
  type MaterializedRow,
} from "./populate-materialize";

const model = { modelKey: "flash31", aspect_ratio: "16:9", resolution: "2k" };

function rows(): MaterializedRow[] {
  return [
    {
      rowIndex: 0,
      cardId: "card_a",
      prompt: "el protagonista es una astronauta",
      refs: [
        { inputId: "image", url: "https://cdn/bg.png", label: "Fondo" },
        { inputId: "image2", url: "https://cdn/a.png", label: "foto_personaje" },
      ],
      output: "https://cdn/out_a.png",
      s3Key: "k/a.png",
    },
    {
      rowIndex: 1,
      cardId: "card_b",
      prompt: "el protagonista es un pirata",
      refs: [{ inputId: "image", url: "https://cdn/bg.png", label: "Fondo" }],
    },
  ];
}

describe("populate-materialize", () => {
  it("builds an autonomous subgraph per row (nano + prompt + refs)", () => {
    const { nodes, edges } = buildRowSubgraph("pop1", rows()[0]!, model, 80);
    const nano = nodes.find((n) => n.type === "nanoBanana");
    const prompt = nodes.find((n) => n.type === "promptInput");
    const refs = nodes.filter((n) => n.type === "mediaInput");
    expect(nano?.id).toBe("pop_pop1_r0_nano");
    expect(prompt?.data?.value).toBe("el protagonista es una astronauta");
    expect(refs).toHaveLength(2);
    // output baked into the nano node (autonomous snapshot)
    expect(nano?.data?.value).toBe("https://cdn/out_a.png");
    expect(nano?.data?.s3Key).toBe("k/a.png");
    // edges wire prompt + refs to the nano handles
    expect(edges.some((e) => e.target === nano?.id && e.targetHandle === "prompt")).toBe(true);
    expect(edges.some((e) => e.target === nano?.id && e.targetHandle === "image2")).toBe(true);
  });

  it("omits refs without url and ungenerated output", () => {
    const { nodes } = buildRowSubgraph("pop1", rows()[1]!, model, 80);
    expect(nodes.filter((n) => n.type === "mediaInput")).toHaveLength(1);
    const nano = nodes.find((n) => n.type === "nanoBanana");
    expect(nano?.data?.value).toBeUndefined();
  });

  it("stacks all rows and ids are recognizable", () => {
    const { nodes } = buildGeneratedSubgraph("pop1", rows(), model);
    const nanoNodes = nodes.filter((n) => n.type === "nanoBanana");
    expect(nanoNodes).toHaveLength(2);
    expect(nanoNodes.every((n) => isGeneratedNodeIdFor("pop1", n.id))).toBe(true);
    expect(isGeneratedNodeIdFor("pop1", "pop_other_r0_nano")).toBe(false);
  });

  it("builds a valid MediaListOutput", () => {
    const ml = buildMediaListOutput("pop1", "Personajes", rows());
    expect(ml.kind).toBe("media_list");
    expect(ml.items).toHaveLength(2);
    expect(ml.items[0]?.url).toBe("https://cdn/out_a.png");
    expect(ml.items[1]?.status).toBe("pending");
    expect(ml.status).toBe("frames_partial");
  });
});
