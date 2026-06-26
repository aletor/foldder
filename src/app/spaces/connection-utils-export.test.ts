import { describe, expect, it } from "vitest";

import {
  resolveExportMultimediaTargetHandle,
  isExportMultimediaDatasetTaken,
  EXPORT_MULTIMEDIA_DATASET_HANDLE,
} from "./connection-utils";

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

  it("resolves dataset handle without mapping to ml0", () => {
    expect(
      resolveExportMultimediaTargetHandle("exp1", "export_multimedia", "dataset", []),
    ).toBe(EXPORT_MULTIMEDIA_DATASET_HANDLE);
  });

  it("rejects second dataset connection", () => {
    const edges = [{ target: "exp1", targetHandle: "dataset" }];
    expect(
      resolveExportMultimediaTargetHandle("exp1", "export_multimedia", "dataset", edges),
    ).toBeNull();
    expect(isExportMultimediaDatasetTaken("exp1", edges)).toBe(true);
  });
});
