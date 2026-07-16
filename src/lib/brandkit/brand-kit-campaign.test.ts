import { describe, expect, it } from "vitest";
import { createEmptyBrandKit } from "@/lib/brandkit/brand-kit-defaults";
import type { EssenceValue, GalleryValue, PaletteValue } from "@/lib/brandkit/brand-kit-types";
import { deriveBrandKitCampaign, campaignDisplayTitle } from "@/lib/brandkit/brand-kit-campaign";

describe("deriveBrandKitCampaign", () => {
  it("deriva concepto y headline desde esencia", () => {
    const doc = createEmptyBrandKit();
    doc.brandName = { value: "OARO", provenance: { type: "user_input", detail: "test" } };
    doc.slots.essence = {
      ...doc.slots.essence,
      status: "resolved",
      value: {
        summary: "Precisión que se siente en cada detalle del trayecto.",
        headline: "Precisión que se siente",
        beliefs: [],
        evidence: [],
      } satisfies EssenceValue,
    };

    const campaign = deriveBrandKitCampaign(doc, false);
    expect(campaign.headline).toBe("Precisión que se siente");
    expect(campaign.concept).toBe("Precisión que se siente");
    expect(campaignDisplayTitle(campaign)).toContain("Campaña 01");
  });

  it("respeta headline bloqueado en overrides", () => {
    const doc = createEmptyBrandKit();
    doc.campaignOverrides = { headline: "Copy fijo", lockedHeadline: true };
    doc.slots.essence = {
      ...doc.slots.essence,
      status: "resolved",
      value: { summary: "Otro", beliefs: [], evidence: [] } satisfies EssenceValue,
    };

    const campaign = deriveBrandKitCampaign(doc, false);
    expect(campaign.headline).toBe("Copy fijo");
  });
});
