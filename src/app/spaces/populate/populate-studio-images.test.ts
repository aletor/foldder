import { describe, expect, it } from "vitest";
import type { Dataset } from "@/app/spaces/dataset/dataset-types";
import { sampleColumnImageUrls } from "./populate-studio-images";

const dataset = {
  version: 1,
  lists: [
    {
      id: "list1",
      name: "Test",
      schema: [{ id: "img1", key: "cara", label: "Cara", type: "image" as const }],
      cards: [
        { id: "c1", values: { img1: { type: "image" as const, url: "https://a.png" } } },
        { id: "c2", values: { img1: { type: "image" as const, url: "https://b.png" } } },
        { id: "c3", values: {} },
      ],
    },
  ],
  constants: { fields: [] },
} as unknown as Dataset;

describe("populate-studio-images", () => {
  it("samples up to max urls from column rows", () => {
    expect(sampleColumnImageUrls(dataset, "list1", "img1", 3, 4)).toEqual([
      "https://a.png",
      "https://b.png",
    ]);
  });
});
