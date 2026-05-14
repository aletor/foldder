export type MediaGcObjectRow = {
  key: string;
  lastModified: string | null;
  size: number;
};

export type MediaGcPolicy = {
  orphanMinAgeDays: number;
  unsavedMinAgeDays: number;
};

export type MediaGcCandidateReason = "stale-orphan" | "stale-unsaved";

export type MediaGcClassifiedObject = MediaGcObjectRow & {
  ageDays: number | null;
  candidate: boolean;
  category:
    | "orphan"
    | "referenced"
    | "referenced-unsaved"
    | "stale-orphan-candidate"
    | "stale-unsaved-candidate"
    | "unsaved-orphan";
  referenced: boolean;
  reason?: MediaGcCandidateReason;
  unsaved: boolean;
};

export type MediaGcClassification = {
  objects: MediaGcClassifiedObject[];
  policy: MediaGcPolicy;
  summary: {
    candidateBytes: number;
    candidateObjects: number;
    objects: number;
    orphanBytes: number;
    orphanCandidates: number;
    orphanObjects: number;
    protectedReferencedObjects: number;
    referencedKeys: number;
    staleUnsavedCandidates: number;
    unsavedBytes: number;
    unsavedObjects: number;
  };
};

export const DEFAULT_MEDIA_GC_POLICY: MediaGcPolicy = {
  orphanMinAgeDays: 14,
  unsavedMinAgeDays: 7,
};

const DAY_MS = 24 * 60 * 60 * 1000;

function ageDays(lastModified: string | null, nowMs: number): number | null {
  if (!lastModified) return null;
  const time = new Date(lastModified).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.max(0, Math.floor((nowMs - time) / DAY_MS));
}

function isUnsavedKey(key: string): boolean {
  return key.includes("/unsaved/");
}

function sumBytes(rows: Array<{ size: number }>): number {
  return rows.reduce((acc, row) => acc + (Number.isFinite(row.size) ? row.size : 0), 0);
}

export function classifyMediaGcObjects(
  objects: MediaGcObjectRow[],
  referencedKeys: Set<string>,
  options?: {
    now?: Date;
    policy?: Partial<MediaGcPolicy>;
  },
): MediaGcClassification {
  const policy = {
    ...DEFAULT_MEDIA_GC_POLICY,
    ...(options?.policy ?? {}),
  };
  const nowMs = options?.now?.getTime() ?? Date.now();

  const classified = objects.map<MediaGcClassifiedObject>((row) => {
    const referenced = referencedKeys.has(row.key);
    const unsaved = isUnsavedKey(row.key);
    const age = ageDays(row.lastModified, nowMs);
    const staleUnsaved = !referenced && unsaved && age != null && age >= policy.unsavedMinAgeDays;
    const staleOrphan = !referenced && !unsaved && age != null && age >= policy.orphanMinAgeDays;
    const candidate = staleUnsaved || staleOrphan;
    const reason: MediaGcCandidateReason | undefined = staleUnsaved
      ? "stale-unsaved"
      : staleOrphan
        ? "stale-orphan"
        : undefined;
    const category: MediaGcClassifiedObject["category"] =
      staleUnsaved
        ? "stale-unsaved-candidate"
        : staleOrphan
          ? "stale-orphan-candidate"
          : referenced && unsaved
            ? "referenced-unsaved"
            : referenced
              ? "referenced"
              : unsaved
                ? "unsaved-orphan"
                : "orphan";

    return {
      ...row,
      ageDays: age,
      candidate,
      category,
      referenced,
      reason,
      unsaved,
    };
  });

  const orphanObjects = classified.filter((row) => !row.referenced);
  const unsavedObjects = classified.filter((row) => row.unsaved);
  const candidates = classified.filter((row) => row.candidate);

  return {
    objects: classified,
    policy,
    summary: {
      candidateBytes: sumBytes(candidates),
      candidateObjects: candidates.length,
      objects: classified.length,
      orphanBytes: sumBytes(orphanObjects),
      orphanCandidates: candidates.filter((row) => row.reason === "stale-orphan").length,
      orphanObjects: orphanObjects.length,
      protectedReferencedObjects: classified.filter((row) => row.referenced).length,
      referencedKeys: referencedKeys.size,
      staleUnsavedCandidates: candidates.filter((row) => row.reason === "stale-unsaved").length,
      unsavedBytes: sumBytes(unsavedObjects),
      unsavedObjects: unsavedObjects.length,
    },
  };
}
