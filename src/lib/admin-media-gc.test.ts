import { describe, expect, it } from "vitest";

import { classifyMediaGcObjects } from "./admin-media-gc";

describe("classifyMediaGcObjects", () => {
  const now = new Date("2026-05-14T12:00:00.000Z");

  it("marks only stale unreferenced objects as delete candidates", () => {
    const result = classifyMediaGcObjects(
      [
        {
          key: "knowledge-files/project-media/user/hash/project-1/a.webp",
          lastModified: "2026-04-30T12:00:00.000Z",
          size: 100,
        },
        {
          key: "knowledge-files/project-media/user/hash/unsaved/tmp.webp",
          lastModified: "2026-05-06T12:00:00.000Z",
          size: 200,
        },
        {
          key: "knowledge-files/project-media/user/hash/unsaved/recent.webp",
          lastModified: "2026-05-13T12:00:00.000Z",
          size: 300,
        },
        {
          key: "knowledge-files/project-media/user/hash/project-2/ref.webp",
          lastModified: "2026-04-01T12:00:00.000Z",
          size: 400,
        },
      ],
      new Set(["knowledge-files/project-media/user/hash/project-2/ref.webp"]),
      { now },
    );

    expect(result.summary).toMatchObject({
      candidateBytes: 300,
      candidateObjects: 2,
      orphanCandidates: 1,
      protectedReferencedObjects: 1,
      staleUnsavedCandidates: 1,
    });
    expect(result.objects.find((row) => row.key.endsWith("recent.webp"))?.candidate).toBe(false);
    expect(result.objects.find((row) => row.key.endsWith("ref.webp"))).toMatchObject({
      candidate: false,
      category: "referenced",
      referenced: true,
    });
  });

  it("protects referenced unsaved objects", () => {
    const key = "knowledge-files/project-media/user/hash/unsaved/still-used.webp";
    const result = classifyMediaGcObjects(
      [{ key, lastModified: "2026-04-01T12:00:00.000Z", size: 1000 }],
      new Set([key]),
      { now },
    );

    expect(result.summary.candidateObjects).toBe(0);
    expect(result.objects[0]).toMatchObject({
      category: "referenced-unsaved",
      candidate: false,
      referenced: true,
      unsaved: true,
    });
  });
});
