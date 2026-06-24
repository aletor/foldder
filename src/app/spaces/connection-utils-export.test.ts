import { describe, expect, it } from "vitest";

import { resolveExportMultimediaTargetHandle } from "./connection-utils";

describe("resolveExportMultimediaTargetHandle", () => {
  it("assigns ml1 when ml0 is taken", () => {
    const edges = [{ target: "exp1", targetHandle: "ml0" }];
    expect(
      resolveExportMultimediaTargetHandle("exp1", "export_multimedia", "ml0", edges),
    ).toBe("ml1");
  });

  it("treats legacy media_list handle as ml0 occupancy", () => {
    const edges = [{ target: "exp1", targetHandle: "media_list" }];
    expect(
      resolveExportMultimediaTargetHandle("exp1", "export_multimedia", "ml0", edges),
    ).toBe("ml1");
  });
});
