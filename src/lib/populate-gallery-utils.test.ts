import { describe, expect, it } from "vitest";
import {
  exportMatchesShare,
  projectFileToGalleryItem,
} from "@/lib/populate-gallery-utils";
import type { PopulateShareRecord } from "@/lib/populate-share-types";
import type { ProjectFile } from "@/app/spaces/project-files";

const share: PopulateShareRecord = {
  id: "s1",
  token: "tok_abc123456789",
  shareKey: "pop1",
  populateNodeId: "pop1",
  ownerEmail: "owner@test.com",
  projectId: "proj1",
  matchId: "match_abc",
  matchLabel: "Partido 1",
  name: "Populate",
  slug: "populate",
  options: { enabled: true, autoDisableAt: null },
  payload: { title: "T", listId: "l1", rowsSnapshot: [], templates: [] },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  visits: 0,
  generations: 0,
};

function exportFile(overrides: Partial<ProjectFile> = {}): ProjectFile {
  return {
    id: "file_export_1",
    name: "Partido 1 · Template.png",
    category: "exports",
    kind: "export",
    extension: ".png",
    fileUrl: "/api/spaces/s3-file?key=test.png",
    thumbnailUrl: "/api/spaces/s3-file?key=test.png",
    createdAt: "2026-01-02T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    metadata: {
      matchId: "match_abc",
      matchLabel: "Partido 1",
      populateShareToken: "tok_abc123456789",
      s3Key: "users/x/proj1/test.png",
    },
    ...overrides,
  };
}

describe("populate gallery utils", () => {
  it("matches export files by matchId and optional share token", () => {
    expect(exportMatchesShare(exportFile(), share)).toBe(true);
    expect(
      exportMatchesShare(
        exportFile({ metadata: { matchId: "other" } }),
        share,
      ),
    ).toBe(false);
    expect(
      exportMatchesShare(
        exportFile({ metadata: { matchId: "match_abc", populateShareToken: "other" } }),
        share,
      ),
    ).toBe(false);
  });

  it("maps project file to gallery item", () => {
    const item = projectFileToGalleryItem(exportFile(), share, "https://signed.example/a.png");
    expect(item).toMatchObject({
      exportId: "file_export_1",
      matchId: "match_abc",
      matchLabel: "Partido 1",
      viewUrl: "https://signed.example/a.png",
    });
  });
});

describe("normalizePopulateShareRecord", () => {
  it("fills legacy defaults", async () => {
    const { normalizePopulateShareRecord } = await import("@/lib/populate-share-types");
    const normalized = normalizePopulateShareRecord({
      ...share,
      projectId: undefined,
      matchId: undefined,
      matchLabel: undefined,
    });
    expect(normalized.matchLabel).toBe("Populate");
    expect(normalized.matchId).toMatch(/^legacy_/);
  });
});
