import { describe, expect, it } from "vitest";
import {
  buildSiteLeadsOutput,
  isSiteLeadsOutput,
  leadsOutputToCsv,
} from "./site-leads";

describe("site-leads", () => {
  it("builds and validates leads output", () => {
    const output = buildSiteLeadsOutput({
      sourceNodeId: "site_1",
      slug: "demo",
      items: [
        {
          id: "lead_1",
          submittedAt: "2026-01-01T00:00:00.000Z",
          email: "hola@marca.com",
          name: "Ana",
        },
      ],
    });
    expect(isSiteLeadsOutput(output)).toBe(true);
    expect(output.totalCount).toBe(1);
  });

  it("exports leads to CSV", () => {
    const csv = leadsOutputToCsv(
      buildSiteLeadsOutput({
        sourceNodeId: "site_1",
        slug: "demo",
        items: [
          {
            id: "lead_1",
            submittedAt: "2026-01-01T00:00:00.000Z",
            email: "a@b.com",
            message: 'Hola "mundo"',
          },
        ],
      }),
    );
    expect(csv.split("\n")).toHaveLength(2);
    expect(csv).toContain('"Hola ""mundo"""');
  });
});
