import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { BrandKitCardFace } from "@/app/spaces/brandkit/BrandKitCardFace";
import { buildBrandKitCardView } from "./brandkit-card-projection";
import { LEGACY_BRANDKIT_RUNTIME_FIXTURE } from "./fixtures/legacy-brandkit-assets.fixture";

describe("BrandKitCardFace", () => {
  it("renderiza anillo, paleta y tono", () => {
    const view = buildBrandKitCardView(LEGACY_BRANDKIT_RUNTIME_FIXTURE);
    render(<BrandKitCardFace view={view} />);
    expect(screen.getByTestId("brandkit-card-face")).toBeTruthy();
    expect(screen.getByText("52%")).toBeTruthy();
    expect(screen.getByText(/directo/i)).toBeTruthy();
  });

  it("muestra badge de conflicto", () => {
    const view = buildBrandKitCardView({
      ...LEGACY_BRANDKIT_RUNTIME_FIXTURE,
      brainMeta: {
        ...LEGACY_BRANDKIT_RUNTIME_FIXTURE.brainMeta,
        boardMeta: {
          interpretation: {
            "messages.tagline": {
              status: "conflict",
              confidence: 0.5,
              evidence: [],
              conflict: {
                candidates: [
                  { value: "A", evidence: [] },
                  { value: "B", evidence: [] },
                ],
                raisedAt: "2026-01-01T00:00:00.000Z",
              },
            },
          },
          review: { pending: 0, conflicts: 1 },
          board: { sectionSeq: {}, sectionState: {} },
        },
      },
    });
    const { container } = render(<BrandKitCardFace view={view} />);
    expect(container.querySelector(".brandkit-card-face__conflict-badge")).toBeTruthy();
  });
});
