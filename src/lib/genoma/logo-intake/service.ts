import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { deleteFromS3 } from "@/lib/s3-utils";
import { logLogoIntakeEvent } from "@/lib/genoma/logo-intake/events";
import { assertIntakeFileCount, prepareIntakeDoc } from "@/lib/genoma/logo-intake/ingest-files";
import { registerLockedSightings } from "@/lib/genoma/logo-intake/locked-sightings";
import { runLogoIntakePipeline } from "@/lib/genoma/logo-intake/pipeline";
import { renderCandidateHiRes, renderCandidateAdjusted } from "@/lib/genoma/logo-intake/crop";
import { uploadCanonicalLogoRaster } from "@/lib/genoma/logo-intake/canonical-asset";
import { bboxAreaDelta, normalizeBBoxPage } from "@/lib/genoma/logo-intake/bbox-ui";
import type { BBoxPage } from "@/lib/genoma/logo-intake/bbox";
import {
  applyLogoIntakeValidateToGenome,
  formatLogoIntakeProvenance,
} from "@/lib/genoma/logo-intake/genome-bridge";
import {
  clearUndoSnapshot,
  createUndoToken,
  isUndoSnapshotValid,
  loadUndoSnapshot,
  saveUndoSnapshot,
} from "@/lib/genoma/logo-intake/undo-validate";
import { computeDHashHex } from "@/lib/genoma/logo-intake/phash";
import type { IntakeDocInput } from "@/lib/genoma/logo-intake/render";
import { normalizeGenome, type Genome } from "@/lib/genoma/model/trait";
import {
  brandLogoStore,
  getOrCreateBrandLogoState,
  readBrandLogoAssetPng,
  writeBrandLogoAsset,
  writeBrandLogoSvg,
} from "@/lib/genoma/logo-intake/store";
import {
  getBatchManifest,
  getBatchProposal,
  saveBatchDocs,
  saveBatchProposal,
} from "@/lib/genoma/logo-intake/batch-store";
import type {
  BrandLogoState,
  LogoCandidate,
  LogoIntakeAnalyzeResult,
  LogoIntakeEventKind,
  LogoProposal,
} from "@/lib/genoma/logo-intake/types";
import { vectorizeLogo } from "@/lib/genoma/logo-intake/vectorize";

export type ValidateLogoIntakeResult = {
  state: BrandLogoState;
  genome: Genome;
  provenanceLabel: string;
  undo: { token: string; expiresAt: string } | null;
};

function isLockedStatus(status: BrandLogoState["status"]): boolean {
  return status === "validated" || status === "manual";
}

function findCandidate(proposal: LogoProposal | null | undefined, candidateId: string): LogoCandidate | null {
  if (!proposal) return null;
  if (proposal.best?.id === candidateId) return proposal.best;
  return proposal.alternatives.find((c) => c.id === candidateId) ?? null;
}

async function docsFromFiles(files: File[]): Promise<IntakeDocInput[]> {
  assertIntakeFileCount(files.length);
  return Promise.all(files.map((file) => prepareIntakeDoc(file)));
}

function docKindFromBatch(batchId: string, docId: string): "pdf" | "image" {
  return getBatchManifest(batchId)?.docs.find((d) => d.docId === docId)?.kind ?? "pdf";
}

async function resolveValidatedAssetPng(input: {
  batchId: string;
  proposal: LogoProposal;
  candidate: LogoCandidate;
}): Promise<{ png: Buffer; widthPx: number; heightPx: number }> {
  if (input.proposal.best?.id === input.candidate.id && input.proposal.best.cropMime === "image/png") {
    return {
      png: Buffer.from(input.proposal.best.cropPng, "base64"),
      widthPx: input.proposal.best.cropWidthPx,
      heightPx: input.proposal.best.cropHeightPx,
    };
  }

  const hiRes = await renderCandidateHiRes({
    batchId: input.batchId,
    docId: input.candidate.docId,
    docKind: docKindFromBatch(input.batchId, input.candidate.docId),
    page: input.candidate.page,
    bboxPage: input.candidate.bboxPage,
  });
  return { png: hiRes.png, widthPx: hiRes.width, heightPx: hiRes.height };
}

async function persistValidatedLogo(input: {
  projectId: string;
  userEmail: string;
  genomeBefore: Genome;
  brandLogoStateBefore: BrandLogoState;
  png: Buffer;
  widthPx: number;
  heightPx: number;
  pHash: string;
  origin: BrandLogoState["origin"];
  candidateId: string;
  docName: string;
  page: number;
  bboxPage: BBoxPage;
}): Promise<ValidateLogoIntakeResult> {
  const undoMeta = createUndoToken();
  let s3Key: string | undefined;

  try {
    const uploaded = await uploadCanonicalLogoRaster({
      userEmail: input.userEmail,
      projectId: input.projectId,
      pHash: input.pHash,
      png: input.png,
    });
    s3Key = uploaded.s3Key;

    writeBrandLogoAsset(input.projectId, input.png, {
      widthPx: input.widthPx,
      heightPx: input.heightPx,
    });

    const nextState: BrandLogoState = {
      ...input.brandLogoStateBefore,
      status: input.origin?.kind === "manual" ? "manual" : "validated",
      asset: { widthPx: input.widthPx, heightPx: input.heightPx, hasSvg: false },
      pHash: input.pHash,
      origin: input.origin,
      validatedAt: new Date().toISOString(),
      activeBatchId: input.brandLogoStateBefore.activeBatchId ?? null,
    };

    const genome = applyLogoIntakeValidateToGenome(input.genomeBefore, {
      candidateId: input.candidateId,
      imageUrl: uploaded.imageUrl,
      pHash: input.pHash,
      docName: input.docName,
      page: input.page,
      bboxPage: input.bboxPage,
      origin: input.origin,
    });

    await brandLogoStore.set(nextState);

    saveUndoSnapshot({
      token: undoMeta.token,
      projectId: input.projectId,
      expiresAt: undoMeta.expiresAt,
      brandLogoState: input.brandLogoStateBefore,
      genome: input.genomeBefore,
      s3Key,
    });

    return {
      state: nextState,
      genome,
      provenanceLabel: formatLogoIntakeProvenance(input.origin, input.docName, input.page),
      undo: undoMeta,
    };
  } catch (error) {
    if (s3Key) {
      try {
        await deleteFromS3(s3Key);
      } catch {
        /* best effort */
      }
    }
    throw error;
  }
}

export async function analyzeLogoIntake(input: {
  projectId: string;
  files: File[];
  userEmail?: string;
}): Promise<LogoIntakeAnalyzeResult> {
  const docs = await docsFromFiles(input.files);
  const batchId = randomUUID();
  saveBatchDocs({ batchId, projectId: input.projectId, docs });
  return analyzeLogoIntakeFromDocs({
    projectId: input.projectId,
    docs,
    batchId,
    userEmail: input.userEmail,
  });
}

export async function analyzeLogoIntakeFromDocs(input: {
  projectId: string;
  docs: IntakeDocInput[];
  batchId: string;
  userEmail?: string;
  onPipelineEvent?: (event: import("@/lib/genoma/logo-intake/pipeline").LogoIntakePipelineEvent) => void;
}): Promise<LogoIntakeAnalyzeResult> {
  assertIntakeFileCount(input.docs.length);
  const state = await getOrCreateBrandLogoState(input.projectId);

  if (isLockedStatus(state.status) && state.pHash) {
    const started = Date.now();
    const { sightings, newCount } = await registerLockedSightings({
      docs: input.docs,
      lockedPHash: state.pHash,
      existing: state.sightings,
      userEmail: input.userEmail,
    });
    const next: BrandLogoState = { ...state, sightings };
    await brandLogoStore.set(next);
    console.info("[logo-intake:locked]", JSON.stringify({ projectId: input.projectId, newCount, ms: Date.now() - started }));
    return { locked: true, state: next, newSightings: newCount };
  }

  let proposedState: BrandLogoState | null = null;
  const proposal = await runLogoIntakePipeline({
    batchId: input.batchId,
    docs: input.docs,
    userEmail: input.userEmail,
    onEvent: async (event) => {
      input.onPipelineEvent?.(event);
      if (event.type === "logo_best_ready") {
        saveBatchProposal(input.batchId, event.proposal);
        proposedState = {
          ...state,
          status: "proposed",
          activeBatchId: input.batchId,
        };
        await brandLogoStore.set(proposedState);
      }
    },
  });
  saveBatchProposal(input.batchId, proposal);

  const next: BrandLogoState = proposedState ?? {
    ...state,
    status: "proposed",
    activeBatchId: input.batchId,
  };
  if (!proposedState) await brandLogoStore.set(next);
  return { locked: false, proposal, state: next };
}

export async function getCandidateHiResPreview(input: {
  projectId: string;
  candidateId: string;
}): Promise<{
  cropPng: string;
  cropMime: "image/png";
  cropWidthPx: number;
  cropHeightPx: number;
}> {
  const state = await getOrCreateBrandLogoState(input.projectId);
  const batchId = state.activeBatchId;
  if (!batchId) throw new Error("proposal_expired");
  const proposal = getBatchProposal(batchId);
  const candidate = findCandidate(proposal, input.candidateId);
  if (!candidate) throw new Error("candidate_not_found");

  if (proposal?.best?.id === candidate.id && candidate.cropMime === "image/png") {
    return {
      cropPng: candidate.cropPng,
      cropMime: "image/png",
      cropWidthPx: candidate.cropWidthPx,
      cropHeightPx: candidate.cropHeightPx,
    };
  }

  const hiRes = await renderCandidateHiRes({
    batchId,
    docId: candidate.docId,
    docKind: docKindFromBatch(batchId, candidate.docId),
    page: candidate.page,
    bboxPage: candidate.bboxPage,
  });
  return {
    cropPng: hiRes.png.toString("base64"),
    cropMime: "image/png",
    cropWidthPx: hiRes.width,
    cropHeightPx: hiRes.height,
  };
}

export async function getEditPageForCandidate(input: {
  projectId: string;
  candidateId: string;
}) {
  const state = await getOrCreateBrandLogoState(input.projectId);
  const batchId = state.activeBatchId;
  if (!batchId) throw new Error("proposal_expired");
  const proposal = getBatchProposal(batchId);
  const candidate = findCandidate(proposal, input.candidateId);
  if (!candidate) throw new Error("candidate_not_found");

  const started = Date.now();
  const { renderEditPage } = await import("@/lib/genoma/logo-intake/crop");
  const page = await renderEditPage({
    batchId,
    docId: candidate.docId,
    docKind: docKindFromBatch(batchId, candidate.docId),
    page: candidate.page,
  });
  console.info("[logo-intake:edit-page]", JSON.stringify({ ms: Date.now() - started, candidateId: candidate.id }));

  return {
    imageBase64: page.png.toString("base64"),
    mime: "image/png" as const,
    width: page.width,
    height: page.height,
    bboxPage: candidate.bboxPage,
    docName: candidate.docName,
    page: candidate.page,
    candidateId: candidate.id,
  };
}

export async function validateLogoIntakeCandidate(input: {
  projectId: string;
  candidateId: string;
  kind?: LogoIntakeEventKind;
  adjustedBboxPage?: BBoxPage;
  genome: Genome;
  userEmail: string;
}): Promise<ValidateLogoIntakeResult> {
  const state = await getOrCreateBrandLogoState(input.projectId);
  const batchId = state.activeBatchId;
  if (!batchId) throw new Error("proposal_expired");
  const proposal = getBatchProposal(batchId);
  const candidate = findCandidate(proposal, input.candidateId);
  if (!candidate || !proposal) throw new Error("candidate_not_found");

  const genomeBefore = normalizeGenome(input.genome);
  let png: Buffer;
  let widthPx: number;
  let heightPx: number;
  let pHash: string;
  let origin: BrandLogoState["origin"];
  let bboxPage: BBoxPage;

  if (input.adjustedBboxPage) {
    const adjustedBbox = normalizeBBoxPage(input.adjustedBboxPage);
    const adjusted = await renderCandidateAdjusted({
      batchId,
      docId: candidate.docId,
      docKind: docKindFromBatch(batchId, candidate.docId),
      page: candidate.page,
      bboxPage: adjustedBbox,
    });
    png = adjusted.png;
    widthPx = adjusted.width;
    heightPx = adjusted.height;
    pHash = await computeDHashHex(png);
    bboxPage = adjustedBbox;
    origin = {
      kind: "adjusted",
      candidateId: candidate.id,
      docId: candidate.docId,
      originalBboxPage: candidate.bboxPage,
      adjustedBboxPage: adjustedBbox,
    };
    logLogoIntakeEvent({
      projectId: input.projectId,
      kind: "adjusted",
      at: new Date().toISOString(),
      candidateId: input.candidateId,
      areaDelta: bboxAreaDelta(candidate.bboxPage, adjustedBbox),
    });
  } else {
    const asset = await resolveValidatedAssetPng({ batchId, proposal, candidate });
    png = asset.png;
    widthPx = asset.widthPx;
    heightPx = asset.heightPx;
    pHash = candidate.pHash;
    bboxPage = candidate.bboxPage;
    origin = { kind: "auto", candidateId: candidate.id, docId: candidate.docId };
    logLogoIntakeEvent({
      projectId: input.projectId,
      kind: input.kind === "accept_alternative" ? "accept_alternative" : "accept_best",
      at: new Date().toISOString(),
      candidateId: input.candidateId,
    });
  }

  return persistValidatedLogo({
    projectId: input.projectId,
    userEmail: input.userEmail,
    genomeBefore,
    brandLogoStateBefore: state,
    png,
    widthPx,
    heightPx,
    pHash,
    origin,
    candidateId: candidate.id,
    docName: candidate.docName,
    page: candidate.page,
    bboxPage,
  });
}

export async function validateLogoIntakeManual(input: {
  projectId: string;
  file: File;
  genome: Genome;
  userEmail: string;
}): Promise<ValidateLogoIntakeResult> {
  const buffer = Buffer.from(await input.file.arrayBuffer());
  const png = await sharp(buffer).png().toBuffer();
  const meta = await sharp(png).metadata();
  const pHash = await computeDHashHex(png);
  const state = await getOrCreateBrandLogoState(input.projectId);
  const candidateId = `manual:${pHash.slice(0, 16)}`;

  logLogoIntakeEvent({
    projectId: input.projectId,
    kind: "manual_upload",
    at: new Date().toISOString(),
    fileName: input.file.name,
  });

  return persistValidatedLogo({
    projectId: input.projectId,
    userEmail: input.userEmail,
    genomeBefore: normalizeGenome(input.genome),
    brandLogoStateBefore: state,
    png,
    widthPx: meta.width ?? 0,
    heightPx: meta.height ?? 0,
    pHash,
    origin: { kind: "manual", fileName: input.file.name },
    candidateId,
    docName: input.file.name,
    page: 1,
    bboxPage: [0, 0, 1, 1],
  });
}

export async function undoLogoIntakeValidate(input: {
  projectId: string;
  token: string;
}): Promise<ValidateLogoIntakeResult> {
  const snapshot = loadUndoSnapshot(input.projectId);
  if (!snapshot || !isUndoSnapshotValid(snapshot, input.token)) {
    throw new Error("undo_expired");
  }

  if (snapshot.s3Key) {
    try {
      await deleteFromS3(snapshot.s3Key);
    } catch (error) {
      console.warn("[logo-intake:undo] s3_delete_failed", snapshot.s3Key, error);
    }
  }

  await brandLogoStore.set(snapshot.brandLogoState);
  clearUndoSnapshot(input.projectId);

  return {
    state: snapshot.brandLogoState,
    genome: snapshot.genome,
    provenanceLabel: "",
    undo: null,
  };
}

export async function unlockLogoIntake(projectId: string): Promise<BrandLogoState> {
  clearUndoSnapshot(projectId);
  const next: BrandLogoState = {
    projectId,
    status: "none",
    sightings: [],
    activeBatchId: null,
  };
  await brandLogoStore.set(next);
  return next;
}

export async function vectorizeLogoIntake(projectId: string): Promise<BrandLogoState> {
  const state = await getOrCreateBrandLogoState(projectId);
  const png = readBrandLogoAssetPng(projectId);
  if (!png) throw new Error("no_validated_logo");
  const svg = await vectorizeLogo(png);
  writeBrandLogoSvg(projectId, svg);
  const next: BrandLogoState = {
    ...state,
    asset: state.asset ? { ...state.asset, hasSvg: true } : { widthPx: 0, heightPx: 0, hasSvg: true },
  };
  await brandLogoStore.set(next);
  return next;
}

export async function getProposalForProject(projectId: string): Promise<LogoProposal | null> {
  const state = await getOrCreateBrandLogoState(projectId);
  if (!state.activeBatchId) return null;
  return getBatchProposal(state.activeBatchId);
}
