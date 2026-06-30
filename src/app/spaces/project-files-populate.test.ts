import { describe, expect, it } from "vitest";
import {
  upsertProjectExportByS3Key,
  createProjectExportFile,
  type ProjectFile,
} from "@/app/spaces/project-files";

describe("upsertProjectExportByS3Key", () => {
  it("replaces prior export with the same s3Key", () => {
    const first = createProjectExportFile({
      name: "a.png",
      extension: ".png",
      fileUrl: "/a",
      metadata: { s3Key: "users/x/a.png" },
    });
    const merged = upsertProjectExportByS3Key({}, first, "users/x/a.png");
    const second: ProjectFile = {
      ...first,
      id: "file_export_2",
      name: "b.png",
      updatedAt: "2026-01-03T00:00:00.000Z",
    };
    const next = upsertProjectExportByS3Key({ projectFiles: merged }, second, "users/x/a.png");
    expect(next.items).toHaveLength(1);
    expect(next.items[0]?.id).toBe("file_export_2");
    expect(next.items[0]?.name).toBe("b.png");
  });
});
