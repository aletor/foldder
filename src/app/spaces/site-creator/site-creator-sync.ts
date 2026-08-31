import type { Node } from "@xyflow/react";
import type { DesignerPageState } from "../designer/DesignerNode";
import { getLiveStudioNodePatch } from "../studio-live-documents";
import { buildSiteSelectionIndex } from "./build-site-selection-index";
import { captureSnapshotFromDesignerNode } from "./designer-source-snapshot";
import { reconcileDesignerGroupMirrors } from "./site-creator-designer-group-bootstrap";
import { reconcilePageBackground } from "./site-creator-page-background";
import type { DesignerSourceSnapshotV1, SiteCreatorNodeData } from "./site-creator-types";

export type SyncValidationResult =
  | { ok: true; candidate: DesignerSourceSnapshotV1 }
  | { ok: false; reason: "stale" | "invalid_designer" | "invalid_pages" };

/** Aplica el parche en vivo del Studio de Designer (Presenter usa el mismo origen). */
export function designerNodeWithLivePatch(designerNode: Node): Node {
  const patch = getLiveStudioNodePatch(designerNode.id);
  if (!patch) return designerNode;
  return {
    ...designerNode,
    data: {
      ...(designerNode.data as Record<string, unknown>),
      ...patch,
    },
  };
}

export function resolveLiveDesignerPage(
  designerNodeId: string | null,
  rfPages: DesignerPageState[] | null | undefined,
): DesignerPageState | null {
  const patch = designerNodeId ? getLiveStudioNodePatch(designerNodeId) : undefined;
  const pages = Array.isArray(patch?.pages)
    ? (patch.pages as DesignerPageState[])
    : rfPages;
  if (!Array.isArray(pages) || pages.length !== 1) return null;
  return pages[0] ?? null;
}

export function deriveCandidateSnapshotFromDesigner(
  designerNode: Node | null | undefined,
): DesignerSourceSnapshotV1 | null {
  if (!designerNode) return null;
  return captureSnapshotFromDesignerNode(designerNodeWithLivePatch(designerNode));
}

/** Valida que el Designer vivo coincide con el hash revisado antes de confirmar sync. */
export function validateCandidateForSync(args: {
  reviewedCandidateHash: string;
  expectedDesignerNodeId: string;
  liveDesignerNode: Node | null | undefined;
}): SyncValidationResult {
  const { reviewedCandidateHash, expectedDesignerNodeId, liveDesignerNode } = args;
  if (!liveDesignerNode || liveDesignerNode.type !== "designer") {
    return { ok: false, reason: "invalid_designer" };
  }
  if (liveDesignerNode.id !== expectedDesignerNodeId) {
    return { ok: false, reason: "invalid_designer" };
  }
  const candidate = captureSnapshotFromDesignerNode(designerNodeWithLivePatch(liveDesignerNode));
  if (!candidate) return { ok: false, reason: "invalid_pages" };
  if (candidate.contentHash !== reviewedCandidateHash) {
    return { ok: false, reason: "stale" };
  }
  return { ok: true, candidate };
}

/** Sustitución atómica del snapshot; blueprint se conserva tal cual. */
export function applyConfirmedSnapshotUpdate(
  nodeData: SiteCreatorNodeData,
  candidate: DesignerSourceSnapshotV1,
): SiteCreatorNodeData {
  return {
    ...nodeData,
    sourceSnapshot: candidate,
    blueprint: nodeData.blueprint,
  };
}

/** Actualiza snapshot y reconcilia espejos de groupContainer en el blueprint. */
export function applySnapshotWithDesignerGroupMirrors(
  nodeData: SiteCreatorNodeData,
  candidate: DesignerSourceSnapshotV1,
): SiteCreatorNodeData {
  const withSnapshot = applyConfirmedSnapshotUpdate(nodeData, candidate);
  const index = buildSiteSelectionIndex(candidate.page);
  try {
    const blueprint = reconcilePageBackground(
      reconcileDesignerGroupMirrors(withSnapshot.blueprint, index),
      candidate.page,
    );
    return { ...withSnapshot, blueprint };
  } catch {
    return withSnapshot;
  }
}

/** Cambio de origen permitido: nuevo snapshot + blueprint vacío intacto. */
export function applyConfirmedOriginChange(
  nodeData: SiteCreatorNodeData,
  newSnapshot: DesignerSourceSnapshotV1,
): SiteCreatorNodeData {
  return {
    ...nodeData,
    sourceSnapshot: newSnapshot,
    blueprint: nodeData.blueprint,
  };
}
