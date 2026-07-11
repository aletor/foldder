export type BrandPipelineSkipMotivo = "hash+version" | "nuevo" | "forzado";

export type BrandPipelineCheckpointUpload = {
  at: string;
  docId: string;
  docName?: string;
  contentSha256: string;
  dedupe: boolean;
  dedupeDocId?: string;
};

export type BrandPipelineCheckpointSkip = {
  at: string;
  docId: string;
  docName?: string;
  skip: boolean;
  motivo: BrandPipelineSkipMotivo;
  previousVersion?: string | null;
  currentVersion: string;
  contentSha256: string;
};

export type BrandPipelineCheckpointExtract = {
  at: string;
  docId: string;
  docName?: string;
  paginas: number;
  fontFamilies: number;
  colorOps: number;
  logoCandidates: number;
  skipped?: boolean;
  error?: string;
};

export type BrandPipelineMergeFieldOutcome =
  | "escrito_raw"
  | "solo_sidecar_brand_lock"
  | "conflicto"
  | "descartado_igual"
  | "validado_bloqueado";

export type BrandPipelineMergeFieldLog = {
  key: string;
  outcome: BrandPipelineMergeFieldOutcome;
};

export type BrandPipelineCheckpointMerge = {
  at: string;
  allowBrandWrites: boolean;
  sourceId?: string;
  fields: BrandPipelineMergeFieldLog[];
};

export type BrandPipelineDiagnostics = {
  lastUpdatedAt: string;
  upload?: BrandPipelineCheckpointUpload[];
  analyzeSkip?: BrandPipelineCheckpointSkip[];
  extract?: BrandPipelineCheckpointExtract[];
  merge?: BrandPipelineCheckpointMerge[];
};

export type BrandPipelineDiagnosticsPatch = Partial<
  Pick<BrandPipelineDiagnostics, "upload" | "analyzeSkip" | "extract" | "merge">
>;

const MAX_CHECKPOINTS_PER_KIND = 24;

function capList<T>(items: T[] | undefined, next: T[]): T[] {
  return [...(items ?? []), ...next].slice(-MAX_CHECKPOINTS_PER_KIND);
}

export function emptyBrandPipelineDiagnosticsPatch(): BrandPipelineDiagnosticsPatch {
  return {};
}

export function mergeBrandPipelineDiagnostics(
  previous: BrandPipelineDiagnostics | undefined,
  patch: BrandPipelineDiagnosticsPatch,
): BrandPipelineDiagnostics {
  const now = new Date().toISOString();
  return {
    lastUpdatedAt: now,
    upload: patch.upload ? capList(previous?.upload, patch.upload) : previous?.upload,
    analyzeSkip: patch.analyzeSkip ? capList(previous?.analyzeSkip, patch.analyzeSkip) : previous?.analyzeSkip,
    extract: patch.extract ? capList(previous?.extract, patch.extract) : previous?.extract,
    merge: patch.merge ? capList(previous?.merge, patch.merge) : previous?.merge,
  };
}

export function normalizeBrandPipelineDiagnostics(raw: unknown): BrandPipelineDiagnostics | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const readUpload = (): BrandPipelineCheckpointUpload[] | undefined => {
    if (!Array.isArray(r.upload)) return undefined;
    return r.upload
      .map((row) => {
        if (!row || typeof row !== "object") return null;
        const x = row as Record<string, unknown>;
        const docId = typeof x.docId === "string" ? x.docId : "";
        if (!docId) return null;
        return {
          at: typeof x.at === "string" ? x.at : new Date().toISOString(),
          docId,
          docName: typeof x.docName === "string" ? x.docName : undefined,
          contentSha256: typeof x.contentSha256 === "string" ? x.contentSha256 : "",
          dedupe: x.dedupe === true,
          dedupeDocId: typeof x.dedupeDocId === "string" ? x.dedupeDocId : undefined,
        } satisfies BrandPipelineCheckpointUpload;
      })
      .filter(Boolean) as BrandPipelineCheckpointUpload[];
  };
  const readSkip = (): BrandPipelineCheckpointSkip[] | undefined => {
    if (!Array.isArray(r.analyzeSkip)) return undefined;
    return r.analyzeSkip
      .map((row) => {
        if (!row || typeof row !== "object") return null;
        const x = row as Record<string, unknown>;
        const docId = typeof x.docId === "string" ? x.docId : "";
        if (!docId) return null;
        const motivo = x.motivo;
        const normalizedMotivo: BrandPipelineSkipMotivo =
          motivo === "hash+version" || motivo === "forzado" ? motivo : "nuevo";
        return {
          at: typeof x.at === "string" ? x.at : new Date().toISOString(),
          docId,
          docName: typeof x.docName === "string" ? x.docName : undefined,
          skip: x.skip === true,
          motivo: normalizedMotivo,
          previousVersion:
            typeof x.previousVersion === "string" || x.previousVersion === null ? x.previousVersion : undefined,
          currentVersion: typeof x.currentVersion === "string" ? x.currentVersion : "",
          contentSha256: typeof x.contentSha256 === "string" ? x.contentSha256 : "",
        } satisfies BrandPipelineCheckpointSkip;
      })
      .filter(Boolean) as BrandPipelineCheckpointSkip[];
  };
  const readExtract = (): BrandPipelineCheckpointExtract[] | undefined => {
    if (!Array.isArray(r.extract)) return undefined;
    return r.extract
      .map((row) => {
        if (!row || typeof row !== "object") return null;
        const x = row as Record<string, unknown>;
        const docId = typeof x.docId === "string" ? x.docId : "";
        if (!docId) return null;
        return {
          at: typeof x.at === "string" ? x.at : new Date().toISOString(),
          docId,
          docName: typeof x.docName === "string" ? x.docName : undefined,
          paginas: typeof x.paginas === "number" ? x.paginas : 0,
          fontFamilies: typeof x.fontFamilies === "number" ? x.fontFamilies : 0,
          colorOps: typeof x.colorOps === "number" ? x.colorOps : 0,
          logoCandidates: typeof x.logoCandidates === "number" ? x.logoCandidates : 0,
          skipped: x.skipped === true ? true : undefined,
        } satisfies BrandPipelineCheckpointExtract;
      })
      .filter(Boolean) as BrandPipelineCheckpointExtract[];
  };
  const readMerge = (): BrandPipelineCheckpointMerge[] | undefined => {
    if (!Array.isArray(r.merge)) return undefined;
    return r.merge
      .map((row) => {
        if (!row || typeof row !== "object") return null;
        const x = row as Record<string, unknown>;
        const fields = Array.isArray(x.fields)
          ? x.fields
              .map((f) => {
                if (!f || typeof f !== "object") return null;
                const y = f as Record<string, unknown>;
                const key = typeof y.key === "string" ? y.key : "";
                const outcome = y.outcome;
                if (!key || typeof outcome !== "string") return null;
                return { key, outcome: outcome as BrandPipelineMergeFieldOutcome };
              })
              .filter(Boolean)
          : [];
        return {
          at: typeof x.at === "string" ? x.at : new Date().toISOString(),
          allowBrandWrites: x.allowBrandWrites === true,
          sourceId: typeof x.sourceId === "string" ? x.sourceId : undefined,
          fields: fields as BrandPipelineMergeFieldLog[],
        } satisfies BrandPipelineCheckpointMerge;
      })
      .filter(Boolean) as BrandPipelineCheckpointMerge[];
  };

  const upload = readUpload();
  const analyzeSkip = readSkip();
  const extract = readExtract();
  const merge = readMerge();
  if (!upload?.length && !analyzeSkip?.length && !extract?.length && !merge?.length) return undefined;

  return {
    lastUpdatedAt: typeof r.lastUpdatedAt === "string" ? r.lastUpdatedAt : new Date().toISOString(),
    ...(upload?.length ? { upload } : {}),
    ...(analyzeSkip?.length ? { analyzeSkip } : {}),
    ...(extract?.length ? { extract } : {}),
    ...(merge?.length ? { merge } : {}),
  };
}

export function resolvePdfBrandExtractSkipMotivo(input: {
  skip: boolean;
  forceReextract?: boolean;
}): BrandPipelineSkipMotivo {
  if (input.forceReextract) return "forzado";
  if (input.skip) return "hash+version";
  return "nuevo";
}

export function buildUploadCheckpoints(input: {
  existingDocs: Array<{ id: string; contentSha256?: string | null; name?: string }>;
  addedDocs: Array<{ id: string; contentSha256?: string | null; name?: string }>;
}): BrandPipelineCheckpointUpload[] {
  const at = new Date().toISOString();
  return input.addedDocs.map((doc) => {
    const hash = doc.contentSha256?.trim() ?? "";
    const dedupeDoc = hash
      ? input.existingDocs.find((d) => d.id !== doc.id && d.contentSha256?.trim() === hash)
      : undefined;
    return {
      at,
      docId: doc.id,
      docName: doc.name,
      contentSha256: hash,
      dedupe: Boolean(dedupeDoc),
      dedupeDocId: dedupeDoc?.id,
    };
  });
}

export function formatMergeOutcomeEs(outcome: BrandPipelineMergeFieldOutcome): string {
  switch (outcome) {
    case "escrito_raw":
      return "escrito raw";
    case "solo_sidecar_brand_lock":
      return "solo sidecar (marca bloqueada)";
    case "conflicto":
      return "conflicto";
    case "descartado_igual":
      return "descartado (igual)";
    case "validado_bloqueado":
      return "validado (bloqueado)";
    default:
      return outcome;
  }
}
