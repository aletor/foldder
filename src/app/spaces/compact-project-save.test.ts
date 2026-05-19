import { describe, expect, it } from "vitest";

import { compactProjectForSave } from "./compact-project-save";
import { projectSavePayloadBytes } from "./project-save-utils";

describe("compactProjectForSave", () => {
  it("drops runtime undo/redo stacks from oversized project saves", async () => {
    const hugeHistory = "x".repeat(2_200_000);
    const project = {
      id: "project-1",
      spaces: [
        {
          id: "space-1",
          nodes: [
            {
              data: {
                advancedSession: {
                  corrections: [],
                  id: "session-1",
                  redoStack: [{ before: hugeHistory }],
                  schemaVersion: "advanced_image_session_v1",
                  undoStack: [{ before: hugeHistory }],
                },
                label: "Image Creation Advanced",
              },
              id: "node-1",
              type: "imageCreationAdvanced",
            },
          ],
        },
      ],
    };

    expect(projectSavePayloadBytes(project)).toBeGreaterThan(4_000_000);

    const result = await compactProjectForSave(project);
    const session = result.project.spaces[0].nodes[0].data.advancedSession as Record<string, unknown>;

    expect(result.compacted).toBe(true);
    expect(result.bytes).toBeLessThan(100_000);
    expect(session.undoStack).toBeUndefined();
    expect(session.redoStack).toBeUndefined();
  });

  it("drops transient object URLs from oversized project saves", async () => {
    const project = {
      id: "project-1",
      spaces: [
        {
          id: "space-1",
          nodes: [
            {
              data: {
                cachedPreview: {
                  objectUrl: `blob:${"a".repeat(2_100_000)}`,
                  objectURL: `blob:${"b".repeat(2_100_000)}`,
                  previewUrl: "/api/spaces/s3-file?key=stable",
                },
              },
              id: "node-1",
            },
          ],
        },
      ],
    };

    const result = await compactProjectForSave(project);
    const cachedPreview = result.project.spaces[0].nodes[0].data.cachedPreview as Record<string, unknown>;

    expect(result.compacted).toBe(true);
    expect(cachedPreview.objectUrl).toBeUndefined();
    expect(cachedPreview.objectURL).toBeUndefined();
    expect(cachedPreview.previewUrl).toBe("/api/spaces/s3-file?key=stable");
  });
});
