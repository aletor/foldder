/**
 * Legacy closure tests — reexport/redirect coverage lives in site-creator-6b2-qa.test.tsx.
 * Kept minimal so old imports of fixtures still smoke.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { buildSiteSelectionIndex } from "./build-site-selection-index";
import { resetSiteBlueprintIdSeqForTests } from "./site-blueprint-ids";
import { resolveAdaptationCapability } from "./site-creator-adaptation-capability";
import { fixtureSectionBackgroundOnly } from "./site-creator-responsive-fixtures";

describe("6B.2 closure smoke", () => {
  beforeEach(() => resetSiteBlueprintIdSeqForTests());

  it("Section fondo único permanece hidden", () => {
    const fx = fixtureSectionBackgroundOnly();
    const index = buildSiteSelectionIndex(fx.page);
    expect(
      resolveAdaptationCapability({
        target: { kind: "blueprintNode", nodeId: fx.sectionId },
        band: "mobile",
        blueprint: fx.blueprint,
        index,
      }),
    ).toEqual({ status: "hidden", reason: "insufficient-content" });
  });
});
