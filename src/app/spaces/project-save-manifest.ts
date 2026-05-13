import { projectSaveFingerprint } from "./project-save-utils";

export type ProjectSaveManifest = {
  version: 1;
  strategy: "s3-first-full-document";
  spacesCount: number;
  media: {
    uploaded: number;
    reused: number;
    bytes: number;
  };
  spaceFingerprints: Record<string, string>;
};

export function buildProjectSaveManifest(
  spaces: Record<string, unknown>,
  media: { uploaded: number; reused: number; bytes: number },
): ProjectSaveManifest {
  const entries = Object.entries(spaces).sort(([a], [b]) => a.localeCompare(b));
  return {
    version: 1,
    strategy: "s3-first-full-document",
    spacesCount: entries.length,
    media,
    spaceFingerprints: Object.fromEntries(
      entries.map(([spaceId, space]) => [spaceId, projectSaveFingerprint(space)]),
    ),
  };
}
