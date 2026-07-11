import { describe, expect, it } from "vitest";
import { areNodesConnectable } from "@/app/spaces/connection-utils";

describe("site leads connection", () => {
  it("allows site leads output to json targets", () => {
    const site = { id: "site_1", type: "site", position: { x: 0, y: 0 }, data: {} };
    const presenter = { id: "p1", type: "presenter", position: { x: 0, y: 0 }, data: {} };
    expect(
      areNodesConnectable(
        site,
        presenter,
        { source: "site_1", target: "p1", sourceHandle: "leads", targetHandle: "document" },
        [],
      ),
    ).toBe(true);
  });

  it("blocks site leads to non-json handles", () => {
    const site = { id: "site_1", type: "site", position: { x: 0, y: 0 }, data: {} };
    const designer = { id: "n1", type: "designer", position: { x: 0, y: 0 }, data: {} };
    expect(
      areNodesConnectable(
        site,
        designer,
        { source: "site_1", target: "n1", sourceHandle: "leads", targetHandle: "image" },
        [],
      ),
    ).toBe(false);
  });
});
