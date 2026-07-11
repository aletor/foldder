import { describe, expect, it } from "vitest";
import { defaultProjectAssets } from "@/app/spaces/project-assets-metadata";
import {
  applyLogoCandidateSidecar,
  mergeDiscoveredLogoClusterAssets,
} from "./logo-cluster-projection";
import { listLogoCandidates } from "./logo-candidates";

describe("logo-cluster-projection", () => {
  it("fusiona clusters por pHash entre documentos", () => {
    const bitsA = "1".repeat(32);
    const bitsB = "0".repeat(32);
    const merged = mergeDiscoveredLogoClusterAssets(
      [],
      [
        {
          id: "cluster_a",
          kind: "logo",
          label: "A",
          value: "knowledge-files/u/a.png",
          imageUrl: "knowledge-files/u/a.png",
          logoPHash: bitsA,
          pageCount: 3,
          documentCount: 1,
          sourceDocumentIds: ["doc1"],
          clusterScore: 0.7,
          discoveredAt: new Date().toISOString(),
        },
        {
          id: "cluster_a2",
          kind: "logo",
          label: "A2",
          value: "knowledge-files/u/a2.png",
          imageUrl: "knowledge-files/u/a2.png",
          logoPHash: bitsA,
          pageCount: 2,
          documentCount: 1,
          sourceDocumentIds: ["doc2"],
          clusterScore: 0.8,
          discoveredAt: new Date().toISOString(),
        },
        {
          id: "cluster_b",
          kind: "logo",
          label: "B",
          value: "knowledge-files/u/b.png",
          imageUrl: "knowledge-files/u/b.png",
          logoPHash: bitsB,
          pageCount: 1,
          documentCount: 1,
          sourceDocumentIds: ["doc2"],
          clusterScore: 0.4,
          discoveredAt: new Date().toISOString(),
        },
      ],
    );

    expect(merged.filter((a) => a.kind === "logo")).toHaveLength(2);
    const a = merged.find((x) => x.logoPHash === bitsA);
    expect(a?.pageCount).toBe(5);
    expect(a?.documentCount).toBe(2);
  });

  it("sidecar propone logo.candidate.* y respeta rejected pHash", () => {
    const bits = "1".repeat(32);
    const boardMeta = applyLogoCandidateSidecar(
      undefined,
      [
        {
          id: "cluster_ok",
          kind: "logo",
          label: "OK",
          value: "knowledge-files/u/ok.png",
          logoPHash: bits,
          pageCount: 2,
          discoveredAt: new Date().toISOString(),
        },
      ],
      [bits],
    );
    expect(boardMeta.interpretation["logo.candidate.cluster_ok"]?.status).toBe("rejected");
  });

  it("listLogoCandidates expone contexto de recurrencia", () => {
    const assets = defaultProjectAssets();
    assets.strategy.visualGeneralLook = {
      discoveredBrandAssets: [
        {
          id: "c1",
          kind: "logo",
          label: "Partner",
          value: "knowledge-files/u/p.png",
          imageUrl: "knowledge-files/u/p.png",
          pageCount: 4,
          documentCount: 2,
          clusterScore: 0.6,
          logoPHash: "0".repeat(32),
          discoveredAt: new Date().toISOString(),
        },
        {
          id: "c2",
          kind: "logo",
          label: "Marca",
          value: "knowledge-files/u/m.png",
          imageUrl: "knowledge-files/u/m.png",
          pageCount: 12,
          documentCount: 1,
          clusterScore: 0.9,
          logoPHash: "1".repeat(32),
          discoveredAt: new Date().toISOString(),
        },
      ],
    };
    const candidates = listLogoCandidates(assets);
    expect(candidates.length).toBeGreaterThanOrEqual(2);
    expect(candidates[0]?.contextLine).toContain("aparece en");
  });
});
