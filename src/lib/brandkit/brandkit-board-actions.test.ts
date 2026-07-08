import { describe, expect, it } from "vitest";
import { defaultProjectAssets } from "@/app/spaces/project-assets-metadata";
import { getMeta, normalizeBrandKitBoardMeta } from "./interpretation";
import { listLogoCandidates } from "./logo-candidates";
import { crownLogoCandidateOnAssets, selectLogoCandidateOnAssets } from "./brandkit-board-actions";
import { logoCandidateElementKey } from "./element-registry";

function assetsWithTwoLogoCandidates() {
  const assets = defaultProjectAssets();
  assets.strategy.visualGeneralLook = {
    discoveredBrandAssets: [
      {
        id: "partner",
        kind: "logo",
        label: "Partner",
        value: "knowledge-files/u/partner.png",
        imageUrl: "knowledge-files/u/partner.png",
        logoPHash: "0".repeat(32),
        pageCount: 40,
        documentCount: 3,
        clusterScore: 0.95,
        discoveredAt: new Date().toISOString(),
      },
      {
        id: "brand",
        kind: "logo",
        label: "Marca",
        value: "knowledge-files/u/brand.png",
        imageUrl: "knowledge-files/u/brand.png",
        logoPHash: "1".repeat(32),
        pageCount: 5,
        documentCount: 1,
        clusterScore: 0.55,
        discoveredAt: new Date().toISOString(),
      },
    ],
  };
  assets.brand.logoPositive = "knowledge-files/u/partner.png";
  return assets;
}

describe("logo picker crown batch (P2-5)", () => {
  it("T-V3 parcial: elegir candidato valida logo.primary y rechaza el resto", () => {
    const before = assetsWithTwoLogoCandidates();
    const crowned = crownLogoCandidateOnAssets(before, {
      url: "knowledge-files/u/brand.png",
      elementKey: logoCandidateElementKey("brand"),
      phash: "1".repeat(32),
    });

    expect(crowned.brand.logoPositive).toBe("knowledge-files/u/brand.png");
    expect(crowned.brand.logoSignature).toBe("1".repeat(32));
    expect(getMeta(normalizeBrandKitBoardMeta(crowned.brainMeta?.boardMeta), "logo.primary").status).toBe(
      "validated",
    );
    expect(
      getMeta(normalizeBrandKitBoardMeta(crowned.brainMeta?.boardMeta), logoCandidateElementKey("partner")).status,
    ).toBe("rejected");
    expect(crowned.brainMeta?.rejectedLogoSignatures).toContain("0".repeat(32));
    expect(listLogoCandidates(crowned, crowned.brainMeta?.boardMeta)).toHaveLength(1);
  });

  it("selectLogoCandidateOnAssets resuelve elementKey desde listLogoCandidates", () => {
    const before = assetsWithTwoLogoCandidates();
    const crowned = selectLogoCandidateOnAssets(before, "knowledge-files/u/brand.png");
    expect(crowned.brand.logoPositive).toBe("knowledge-files/u/brand.png");
    expect(getMeta(normalizeBrandKitBoardMeta(crowned.brainMeta?.boardMeta), "logo.primary").status).toBe(
      "validated",
    );
  });
});
