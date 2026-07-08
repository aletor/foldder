import { describe, expect, it } from "vitest";
import { normalizeProjectAssets } from "@/app/spaces/project-assets-metadata";
import {
  buildBrandKitCardView,
  hasBrandKitCardContent,
} from "./brandkit-card-projection";
import { LEGACY_BRANDKIT_RUNTIME_FIXTURE } from "./fixtures/legacy-brandkit-assets.fixture";

describe("buildBrandKitCardView — PR5 tarjeta canvas", () => {
  it("expone completitud del libro y señales compactas", () => {
    const card = buildBrandKitCardView(LEGACY_BRANDKIT_RUNTIME_FIXTURE);
    expect(card.completenessPercent).toBe(52);
    expect(card.paletteDots.filter(Boolean).length).toBe(3);
    expect(card.paletteDots).toHaveLength(5);
    expect(card.toneLine).toBeTruthy();
    expect(card.logoUrl).toContain("legacyLogoPositive");
  });

  it("hasBrandKitCardContent detecta proyecto legacy", () => {
    expect(hasBrandKitCardContent(LEGACY_BRANDKIT_RUNTIME_FIXTURE)).toBe(true);
    expect(hasBrandKitCardContent(normalizeProjectAssets({}))).toBe(false);
  });

  it("review expone conflictos del sidecar", () => {
    const card = buildBrandKitCardView({
      ...LEGACY_BRANDKIT_RUNTIME_FIXTURE,
      brainMeta: {
        ...LEGACY_BRANDKIT_RUNTIME_FIXTURE.brainMeta,
        boardMeta: {
          interpretation: {
            "messages.tagline": {
              status: "conflict",
              confidence: 0.5,
              evidence: [],
              conflict: { candidates: [], raisedAt: "2026-01-01T00:00:00.000Z" },
            },
          },
          review: { pending: 0, conflicts: 1 },
          board: { sectionSeq: {}, sectionState: {} },
        },
      },
    });
    expect(card.review.conflicts).toBe(1);
  });
});
